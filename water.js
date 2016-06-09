/*
 Require dependencies
 */
var createShader = require("gl-shader");
var mat4 = require("gl-mat4");
var createTexture = require('gl-texture2d');
var createBuffer = require('gl-buffer');
var vec3 = require('gl-vec3');
var vec2 = require('gl-vec2');
var clamp = require('clamp');

var shaders = require("./shaders.js");
var SpatialHash = require("./spatial_hash.js");

// collision body types:
const CIRCLE_BODY = 0;
const CAPSULE_BODY = 1;

// support radius.
var h = 0.0;

var WORLD_MIN = [-0.35, -0.5];
var WORLD_MAX = [+0.35, +0.4];
var WORLD_SCALE = 50.0;

var SCALED_WORLD_MIN = [WORLD_MIN[0] * WORLD_SCALE, WORLD_MIN[1] * WORLD_SCALE];
var SCALED_WORLD_MAX = [WORLD_MAX[0] * WORLD_SCALE, WORLD_MAX[1] * WORLD_SCALE];

var restDensity = 988.29;
var gasStiffness = 100;

var particleRadius = 0.006 * WORLD_SCALE;

h = particleRadius * 3;

var particleMass = 1.0;


var gravity = +9.82;

var viscosity = 1.5;

const kNorm = (20.0/(2.0*Math.PI*h*h));
const kNearNorm = (30.0/(2.0*Math.PI*h*h));


const kRestDensity = 12.0;
const kStiffness = 0.08;
const kNearStiffness = 0.1;
const kSurfaceTension = 0.0004;
const kLinearViscocity = 0.5;
const kQuadraticViscocity = 1.0;

/*
 Constructor
 */
function Water(gl) {


    /*
     We use this single shader to render the GUI.
     */
    this.shader = createShader(gl, shaders.vert, shaders.frag);

    /*
     These buffers contain all the geometry data.
     */
    this.positionBufferObject = createBuffer(gl, [], gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    this.colorBufferObject = createBuffer(gl, [], gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    this.uvBufferObject = createBuffer(gl, [], gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    this.indexBufferObject = createBuffer(gl, [], gl.ELEMENT_ARRAY_BUFFER, gl.DYNAMIC_DRAW);


    function Particle(position, mass) {

        this.position = vec2.fromValues(position[0] * WORLD_SCALE, position[1] * WORLD_SCALE);

        this.velocity = vec2.fromValues(0.0, 0.0);
        this.radius = particleRadius;
        this.mass = mass;
        this.rho = 0.0;
        this.density = 0.0;
        this.pressure = 0.0;
    }

    function Circle(position, radius, color) {
        this.position = vec2.fromValues(position[0] * WORLD_SCALE, position[1] * WORLD_SCALE);
        this.radius = radius * WORLD_SCALE;
        this.color = color;
        this.type = CIRCLE_BODY;
    }

    function Capsule(p0, p1, radius, color) {

        this.p0 = vec2.fromValues(p0[0] * WORLD_SCALE, p0[1] * WORLD_SCALE);
        this.p1 = vec2.fromValues(p1[0] * WORLD_SCALE, p1[1] * WORLD_SCALE);

        this.radius = radius * WORLD_SCALE;
        this.color = color;
        this.type = CAPSULE_BODY;

    }

    this.particles = [];


    var V = (0.35 - 0.11) * (0.3 - 0.1)
    var water_rho = 1000000;
    var numParticles = 304;

    // how many particles are affected by the support radius.(5.14)
    var supportCount = 15;


    //h = Math.pow( (V * supportCount) / ( Math.PI * numParticles ) , 1/2);


    //console.log("h: ", h);


    // 0.013
    for (var y = 0.11; y < 0.35; y += 0.013) {

        for (var x = 0.1; x < 0.3; x += 0.013) {

            // rho = 1000
            // n = 56
            // (A * rho) / n = mass = 7.1

            var mass = (V * water_rho) / numParticles;
            //  console.log("mass: ", mass);

            this.particles.push(new Particle([x, y], particleMass));
        }
    }

    //this.particles.push(new Particle([0.11, 0.1], 0.006, particleMass));
    //this.particles.push(new Particle([0.11, 0.15], 0.006, particleMass));
    //  this.particles.push(new Particle([0.11, 0.2], 0.006, particleMass));


    /*
     this.particles.push(new Particle([0.11, 0.1], 0.006, 700000.1));
     console.log("particle count: ", this.particles.length);
     */


//    this.particles.push(new Particle([-0.1, -0.4], 0.01));

    this.collisionBodies = [];

    //this.collisionBodies.push(new Circle([0.0,0.2], 0.13, [0.7, 0.2, 0.2]));


    const FRAME_RADIUS = 0.03;
    const FRAME_COLOR = [0, 0.5, 0];


    // frame
    this.collisionBodies.push(new Capsule(WORLD_MIN, [WORLD_MAX[0], WORLD_MIN[1]], FRAME_RADIUS, FRAME_COLOR));
    this.collisionBodies.push(new Capsule([WORLD_MIN[0], WORLD_MAX[1]], WORLD_MAX, FRAME_RADIUS, FRAME_COLOR));
    this.collisionBodies.push(new Capsule(WORLD_MIN, [WORLD_MIN[0], WORLD_MAX[1]], FRAME_RADIUS, FRAME_COLOR));
    this.collisionBodies.push(new Capsule([WORLD_MAX[0], WORLD_MIN[1]], WORLD_MAX, FRAME_RADIUS, FRAME_COLOR));

    this.collisionBodies.push(new Circle(WORLD_MIN, FRAME_RADIUS, [0.7, 0.0, 0.0]));
    this.collisionBodies.push(new Circle(WORLD_MAX, FRAME_RADIUS, [0.7, 0.0, 0.0]));

    this.collisionBodies.push(new Capsule([+0.05, 0.0], [+0.05, +0.4], FRAME_RADIUS, FRAME_COLOR));

    this.hash = new SpatialHash(h, SCALED_WORLD_MIN, SCALED_WORLD_MAX);
}


Water.prototype.update = function (canvasWidth, canvasHeight, delta) {

    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;


    for (var i = 0; i < this.particles.length; ++i) {
        var iParticle = this.particles[i];

        // gravity:
        iParticle.velocity[1] += gravity * delta;


        // preserve position.
        iParticle.prevPosition = [iParticle.position[0], iParticle.position[1]];

        // advance due to gravity.
        vec2.scaleAndAdd(iParticle.position, iParticle.position, iParticle.velocity, delta);
    }

    this.hash.update(this.particles);


    // calculate pressures.
    for (var i = 0; i < this.particles.length; ++i) {

        var iParticle = this.particles[i];


        var nearParticles = this.hash.getNearParticles(iParticle);

        var density = 0.0;
        var nearDensity = 0.0;

        for (var j = 0; j < nearParticles.length; ++j) {

            var jParticle = nearParticles[j];

            var dp = [0.0, 0.0];

            vec2.subtract(dp, jParticle.position, iParticle.position);

            var r2 = vec2.dot(dp, dp);
            //float r2 = dx*dx + dy*dy;

            if (r2 < 0.000001 || r2 > h*h)
                continue;

            var r = Math.sqrt(r2);
            var a = 1 - r/h;
            density += jParticle.mass * a*a*a * kNorm;
            nearDensity += jParticle.mass * a*a*a*a * kNearNorm;

        }

        iParticle.density = density;


        iParticle.nearDensity = nearDensity;
        iParticle.P = kStiffness * (density - iParticle.mass*kRestDensity);
        iParticle.nearP = kNearStiffness * nearDensity;
    }

    // calculate relaxed positions:


    for (var i = 0; i < this.particles.length; ++i) {

        var iParticle = this.particles[i];
        var nearParticles = this.hash.getNearParticles(iParticle);


        var sum = [iParticle.position[0], iParticle.position[1] ];



        for (var j = 0; j < nearParticles.length; ++j) {


            var jParticle = nearParticles[j];

            var dp = [0.0, 0.0];
            vec2.subtract(dp, jParticle.position, iParticle.position);
            //float dx = pj.x - pi.x;
            //float dy = pj.y - pi.y;


            var r2 = vec2.dot(dp, dp);
            var r = Math.sqrt(r2);

            if (r2 < 0.000001 || r2 > h*h)
                continue;



            var a = 1 - r/h;

            var d = delta*delta * ((iParticle.nearP+jParticle.nearP)*a*a*a*kNearNorm + (iParticle.P+jParticle.P)*a*a*kNorm) / 2;

            // relax


            vec2.scaleAndAdd( sum, sum, dp, -d / (  r*iParticle.mass ) );


            //x -= d * dx / (r*pi.m);
            //y -= d * dy / (r*pi.m);

        }

        iParticle.relaxedPosition = [sum[0], sum[1]];

    }


    for (var i = 0; i < this.particles.length; ++i) {
        var iParticle = this.particles[i];


        // Compute relaxed here.


        iParticle.position = [iParticle.relaxedPosition[0], iParticle.relaxedPosition[1]];


        var diff = vec2.create();
        vec2.subtract(diff, iParticle.position, iParticle.prevPosition);

        vec2.scale(iParticle.velocity, diff, 1.0 / delta);

    }


    for (var i = 0; i < this.particles.length; ++i) {

        var iParticle = this.particles[i];


        // collision handling:
        for (var iBody = 0; iBody < this.collisionBodies.length; ++iBody) {

            var body = this.collisionBodies[iBody];

            var x = iParticle.position;
            var scratch = vec2.create();


            if (body.type == CIRCLE_BODY) {
                var c = body.position;
                var r = body.radius;

                var x_sub_c = vec2.create();
                vec2.subtract(x_sub_c, x, c);

                var Fx = vec2.squaredLength(x_sub_c) - r * r;

                // collision if F(X) <= 0
                if (Fx <= 0) {

                    var x_sub_c_len = vec2.length(x_sub_c);

                    // compute contact point
                    var cp = [0.0, 0.0];
                    vec2.scaleAndAdd(
                        cp,
                        c,
                        x_sub_c, (r / x_sub_c_len ));

                    // compute normal.
                    var n = [0.0, 0.0];
                    vec2.scale(n, x_sub_c, -Math.sign(Fx) / ( x_sub_c_len  ))

                    var prev = isNaN(iParticle.position[0]);

                    // update particle due to collision
                    iParticle.position = cp;
                    this._reflect(iParticle.velocity, n);


                    if (!prev && isNaN(iParticle.position[0])) {
                        console.log("pos nan due to circle coll");
                    }

                }

            } else if (body.type == CAPSULE_BODY) {
                var p0 = body.p0;
                var p1 = body.p1;
                var r = body.radius;


                var p1_sub_p0 = [0.0, 0.0];
                vec2.subtract(p1_sub_p0, p1, p0);

                var t = -vec2.dot(vec2.subtract(scratch, p0, x), p1_sub_p0) / vec2.dot(p1_sub_p0, p1_sub_p0);
                t = clamp(t, 0.0, 1.0);


                var q = [0.0, 0.0];
                vec2.scaleAndAdd(q, p0, p1_sub_p0, t);

                var Fx = vec2.length(vec2.subtract(scratch, q, x)) - r;

                // check if collision
                if (Fx <= 0) {


                    var x_sub_q = [0.0, 0.0];
                    vec2.subtract(x_sub_q, x, q);
                    var x_sub_q_len = vec2.length(x_sub_q);

                    // compute contact point
                    var cp = [0.0, 0.0];
                    vec2.scaleAndAdd(
                        cp,
                        q,
                        x_sub_q, (r / x_sub_q_len ));

                    // compute normal.
                    var n = [0.0, 0.0];
                    vec2.scale(n, x_sub_q, -Math.sign(Fx) / ( x_sub_q_len  ))


                    var prev = isNaN(iParticle.position[0]);

                    // update particle due to collision
                    iParticle.position = cp;
                    this._reflect(iParticle.velocity, n);

                    if (!prev && isNaN(iParticle.position[0])) {
                        console.log("pos nan due to capsule coll");
                    }
                }

            }

        }

    }

}


Water.prototype.draw = function (gl) {




    /*
     Setup geometry buffers.
     */
    this.indexBuffer = [];
    this.positionBuffer = [];
    this.colorBuffer = [];
    this.uvBuffer = [];

    this.indexBufferIndex = 0;
    this.positionBufferIndex = 0;
    this.colorBufferIndex = 0;
    this.uvBufferIndex = 0;


    /*
     Create geometry.
     */

    this._box([-0.35, -0.5], [0.70, 0.9], [1.0, 1.0, 1.0]);

    for (var i = 0; i < this.collisionBodies.length; ++i) {

        var body = this.collisionBodies[i];

        if (body.type == CIRCLE_BODY)
            this._circle([body.position[0] / WORLD_SCALE, body.position[1] / WORLD_SCALE], body.radius / WORLD_SCALE, body.color, 40);
        else if (body.type == CAPSULE_BODY)
            this._capsule(
                [body.p0[0] / WORLD_SCALE, body.p0[1] / WORLD_SCALE],
                [body.p1[0] / WORLD_SCALE, body.p1[1] / WORLD_SCALE], body.radius / WORLD_SCALE, body.color, 40);
    }

    for (var i = 0; i < this.particles.length; ++i) {

        var particle = this.particles[i];

        this._circle(
            [particle.position[0] / WORLD_SCALE, particle.position[1] / WORLD_SCALE], particle.radius / WORLD_SCALE, [0.0, 0.0, 1.0], 40);
    }


    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);

    /*
     If a VAO is already bound, we need to unbound it. Otherwise, we will write into a VAO created by the user of the library
     when calling vertexAttribPointer, which means that we would effectively corrupt the user data!
     */
    var VAO_ext = gl.getExtension('OES_vertex_array_object');
    if (VAO_ext)
        VAO_ext.bindVertexArrayOES(null);


    this.positionBufferObject.update(this.positionBuffer);
    gl.enableVertexAttribArray(this.shader.attributes.aPosition.location);
    gl.vertexAttribPointer(this.shader.attributes.aPosition.location, 2, gl.FLOAT, false, 0, 0);
    this.positionBufferObject.unbind();


    this.colorBufferObject.update(this.colorBuffer);
    gl.enableVertexAttribArray(this.shader.attributes.aColor.location);
    gl.vertexAttribPointer(this.shader.attributes.aColor.location, 4, gl.FLOAT, false, 0, 0);
    this.colorBufferObject.unbind();

    this.uvBufferObject.update(this.uvBuffer);
    gl.enableVertexAttribArray(this.shader.attributes.aUv.location);
    gl.vertexAttribPointer(this.shader.attributes.aUv.location, 2, gl.FLOAT, false, 0, 0);
    this.uvBufferObject.unbind();

    this.indexBufferObject.update(this.indexBuffer);


    /*
     Setup matrices.
     */
    var projection = mat4.create()
    mat4.ortho(projection, 0, this.canvasWidth, this.canvasHeight, 0, -1.0, 1.0)

    this.shader.bind()

    this.shader.uniforms.uProj = projection;
    //this.shader.uniforms.uFontAtlas = this.fontAtlasTexture.bind()

    gl.disable(gl.DEPTH_TEST) // no depth testing; we handle this by manually placing out
    // widgets in the order we wish them to be rendered.

    // for text rendering, enable alpha blending.
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.drawElements(gl.TRIANGLES, (this.indexBufferIndex), gl.UNSIGNED_SHORT, 0);


};

Water.prototype._addIndex = function (index) {
    this.indexBuffer[this.indexBufferIndex++] = index;
};

Water.prototype._addPosition = function (position) {

    var x = ((position[0] + 1) / 2.0) * this.canvasHeight + (this.canvasWidth - this.canvasHeight) / 2.0;
    var y = 1.0 * (((position[1] + 1) / 2.0) * this.canvasHeight);

    this.positionBuffer[this.positionBufferIndex++] = x
    this.positionBuffer[this.positionBufferIndex++] = y;
};

Water.prototype._addColor = function (color) {
    this.colorBuffer[this.colorBufferIndex++] = color[0];
    this.colorBuffer[this.colorBufferIndex++] = color[1];
    this.colorBuffer[this.colorBufferIndex++] = color[2];
    this.colorBuffer[this.colorBufferIndex++] = color[3];
};

Water.prototype._addUv = function (uv) {
    this.uvBuffer[this.uvBufferIndex++] = uv[0];
    this.uvBuffer[this.uvBufferIndex++] = uv[1];
};

/*
 Add vertex that only has one color, and does not use a texture.
 */
Water.prototype._coloredVertex = function (position, color) {
    // at this uv-coordinate, the font atlas is entirely white.
    var whiteUv = [0.95, 0.95];

    this._addPosition(position);
    this._addColor(color);
    this._addUv(whiteUv);
};

/*
 Render a box.

 `color` is a RGB-triplet.
 the optional `alpha` argument specifies the transparency of the box.
 default value of `alpha` is 1.0
 */
Water.prototype._box = function (position, size, color) {


    if (typeof alpha === 'undefined') {
        alpha = 1.0; // default to 1.0
    }

    // top-left, bottom-left, top-right, bottom-right corners
    var tl = position;
    var bl = [position[0], position[1] + size[1]];
    var tr = [position[0] + size[0], position[1]];
    var br = [position[0] + size[0], position[1] + size[1]];

    var baseIndex = this.positionBufferIndex / 2;

    var c = [color[0], color[1], color[2], alpha];

    // vertex 1
    this._coloredVertex(tl, c);

    // vertex 2
    this._coloredVertex(bl, c);

    // vertex 3
    this._coloredVertex(tr, c);

    // vertex 4
    this._coloredVertex(br, c);


    // triangle 1
    this._addIndex(baseIndex + 0);
    this._addIndex(baseIndex + 1);
    this._addIndex(baseIndex + 2);

    // triangle 2
    this._addIndex(baseIndex + 3);
    this._addIndex(baseIndex + 2);
    this._addIndex(baseIndex + 1);

};

Water.prototype._unitCircle = function (position, theta, radius) {
    return [position[0] + radius * Math.cos(theta), position[1] + radius * Math.sin(theta)];
};

/*
 A capsule is defined by a line segment between p1 and p2, and a radius.
 */
Water.prototype._capsule = function (p1, p2, radius, color, segments) {

    // direction vector the line segment.
    var d = vec2.create();
    vec2.subtract(d, p1, p2);

    var theta = Math.atan2(d[1], d[0]) - Math.PI / 2.0;

    // Draw the round parts at the end of the capsule.
    this._arc(p1, radius, theta, color, segments);
    this._arc(p2, radius, theta + Math.PI, color, segments);


    // normal to line segment.
    var n = [-d[1], d[0]];
    vec2.normalize(n, n);

    var scratch = [0.0, 0.0];

    var baseIndex = this.positionBufferIndex / 2;


    var c = [color[0], color[1], color[2], alpha];

    // vertex 1
    this._coloredVertex(vec3.scaleAndAdd(scratch, p1, n, radius), c);

    // vertex 2
    this._coloredVertex(vec3.scaleAndAdd(scratch, p2, n, radius), c);

    // vertex 3
    this._coloredVertex(vec3.scaleAndAdd(scratch, p1, n, -radius), c);

    // vertex 4
    this._coloredVertex(vec3.scaleAndAdd(scratch, p2, n, -radius), c);


    // triangle 1
    this._addIndex(baseIndex + 2);
    this._addIndex(baseIndex + 1);
    this._addIndex(baseIndex + 0);


    // triangle 2
    this._addIndex(baseIndex + 1);
    this._addIndex(baseIndex + 2);
    this._addIndex(baseIndex + 3);


}

Water.prototype._arc = function (centerPosition, radius, direction, color, segments) {


    var baseIndex = this.positionBufferIndex / 2;

    var c = [color[0], color[1], color[2], 1.0];

    // add center vertex.
    this._coloredVertex(centerPosition, c);
    var centerVertexIndex = baseIndex + 0;

    var stepSize = (2 * Math.PI) / segments;
    var curIndex = baseIndex + 1;
    for (var theta = 0; theta <= Math.PI; theta += stepSize, ++curIndex) {

        // for first iteration, we only create one vertex, and no triangles
        if (theta == 0) {
            var p =
                [centerPosition[0] + radius * Math.cos(theta + direction), centerPosition[1] + radius * Math.sin(theta + direction)];

            this._coloredVertex(p, c);
        } else {
            var p =
                [centerPosition[0] + radius * Math.cos(theta + direction), centerPosition[1] + radius * Math.sin(theta + direction)];

            this._coloredVertex(p, c);

            this._addIndex(curIndex + 0);
            this._addIndex(curIndex - 1);
            this._addIndex(centerVertexIndex);
        }
    }
};


// reflect(particle.velocity, n
Water.prototype._reflect = function (v, n) {
    var scratch = [0.0, 0.0];

    var cr = 0.02;
    vec2.subtract(
        v,
        v,
        vec2.scale(scratch, n, (1.0 + cr) * vec2.dot(v, n))
    );

}

/*
 Render a circle, where the top-left corner of the circle is `position`
 Where `segments` is how many triangle segments the triangle is rendered with.
 */
Water.prototype._circle = function (centerPosition, radius, color, segments) {


    var baseIndex = this.positionBufferIndex / 2;

    var c = [color[0], color[1], color[2], 1.0];

    // add center vertex.
    this._coloredVertex(centerPosition, c);
    var centerVertexIndex = baseIndex + 0;

    var stepSize = (2 * Math.PI) / segments;
    var curIndex = baseIndex + 1;
    for (var theta = 0; theta <= 2 * Math.PI + 0.1; theta += stepSize, ++curIndex) {

        // for first frame, we only create one vertex, and no triangles
        if (theta == 0) {
            var p = this._unitCircle(centerPosition, theta, radius);
            this._coloredVertex(p, c);
        } else {
            var p = this._unitCircle(centerPosition, theta, radius);
            this._coloredVertex(p, c);

            this._addIndex(curIndex + 0);
            this._addIndex(curIndex - 1);
            this._addIndex(centerVertexIndex);
        }
    }
};


module.exports = Water;

/*
 http://prideout.net/blog/?p=58

 3D SPH rendering:
 http://developer.download.nvidia.com/presentations/2010/gdc/Direct3D_Effects.pdf


 GPU gems 2D fluids:
 http://meatfighter.com/fluiddynamics/GPU_Gems_Chapter_38.pdf


 SPH Study for integration in games:
 http://www.roelezendam.com/Specialisation%20Thesis%20Final%20Roel%20Ezendam%20070254.pdf

 Original SPH article:
 http://matthias-mueller-fischer.ch/publications/sca03.pdf

 Siggraph course:
 file:///Users/eric/Dropbox/backlog/fluids_notes.pdf

 Japanese SPH article:
 http://inf.ufrgs.br/cgi2007/cd_cgi/papers/harada.pdf

 SPH and euler tutorial:
 http://cg.informatik.uni-freiburg.de/intern/seminar/gridFluids_fluid-EulerParticle.pdf

 Fluid flow for the rest of us:
 http://cg.informatik.uni-freiburg.de/intern/seminar/gridFluids_fluid_flow_for_the_rest_of_us.pdf

 5.6.1

 create n particles.
 create collision objects.
 initialize leap-frog integrator.(but initially, we may as well use
 newton. )



 5.6.4
 compute gravity force.



 5.6.5

 F = f_internal + f_external
 but it in will only be the gravity force, in our simplified case.

 use leap-frog to advance particle velocity and position.


 Perform collision detection against collision primitives using (4.33).
 v. If a collision occurred then
 a. Project particle position according to the contact point using (4.55).
 b. Update the velocity using (4.58).
 vi. Approximate the new particle velocity using


 optimizeize v8:
 https://www.youtube.com/watch?v=UJPdhx5zTaw
 http://thibaultlaurens.github.io/javascript/2013/04/29/how-the-v8-engine-works/

 masters thesis:
 http://image.diku.dk/projects/media/kelager.06.pdf

 */

/*

 TODO: increase value of time step.
 if we increase gas constant, we must increase time step.
 increase support radius

 parameters that can be varied:
 the initial distances between the balls.
 support radius.
 time step
 num particles.

 try using leap-frog

 try change time ste.


 viscosity is important, because it damps the simulation!


 maybe i have to little particles? 5000 is enough maybe?
 */