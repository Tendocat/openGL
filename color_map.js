
"use strict"

//--------------------------------------------------------------------------------------------------------
// TERRAIN
//--------------------------------------------------------------------------------------------------------
var terrain_vert =
`#version 300 es

// INPUT
layout(location = 1) in vec2 position_in;

// UNIFORM
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;

uniform float uTerrainElevation;

// OUTPUT
out float height;

// FUNCTIONS
// - here, is it a noise function that create random values in [-1.0;1.0] given a position in [0.0;1.0]
float noise(vec2 st)
{
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// MAIN PROGRAM
void main()
{
	vec3 position = vec3(2.0 * position_in - 1.0, 0.0);

	// add turbulence in height
	vec2 st = position_in;
	float turbulence = noise(position_in)* 3.0;
	position.z += turbulence / uTerrainElevation; // tune the height of turbulence
	height = position.z*255.;
	
	gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(position, 1.0);
}
`;

//--------------------------------------------------------------------------------------------------------
var terrain_frag =
`#version 300 es
precision highp float;

// INPUT
in float height;

// OUTPUT
out vec4 oFragmentColor;

// UNIFORM
uniform vec4 ucolor_map[255];

// MAIN PROGRAM
void main()
{
	vec4 color = ucolor_map[int(height)];
	oFragmentColor = color;
}
`;

//--------------------------------------------------------------------------------------------------------
// Global variables
//--------------------------------------------------------------------------------------------------------
var terrainShader = null;
var vao = null;
// GUI (graphical user interface)
// Terrain
var jMax = 10;
var iMax = 10;
var nbMeshIndices = 0;
var slider_terrainWidth;
var slider_terrainHeight;
var slider_terrainElevation;

// Color map
var colorMap = [];

//--------------------------------------------------------------------------------------------------------
// Build mesh
//--------------------------------------------------------------------------------------------------------
function buildMesh()
{
	iMax = slider_terrainWidth.value;
	jMax = slider_terrainHeight.value;

	gl.deleteVertexArray(vao);

	// Create ande initialize a vertex buffer object (VBO) [it is a buffer of generic user data: positions, normals, texture coordinates, temperature, etc...]
	// - create data on CPU
	// - this is the geometry of your object)
	// - we store 2D positions as 1D array : (x0,y0,x1,y1,x2,y2,x3,y3)
	// - for a terrain: a grid of 2D points in [0.0;1.0]
	let data_positions = new Float32Array(iMax * jMax * 2);
	for (let j = 0; j < jMax; j++)
	{
	    for (let i = 0; i < iMax; i++)
	    {
			// x
			data_positions[ 2 * (i + j * iMax) ] = i / (iMax - 1);
			// y
			data_positions[ 2 * (i + j * iMax) + 1 ] = j / (jMax - 1);
	    }
	}
	// - create a VBO (kind of memory pointer or handle on GPU)
	let vbo_positions = gl.createBuffer();
	// - bind "current" VBO
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo_positions); 
	// - allocate memory on GPU (size of data) and send data from CPU to GPU
	gl.bufferData(gl.ARRAY_BUFFER, data_positions, gl.STATIC_DRAW);
	// - reset GL state
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	
	// Create ande initialize an element buffer object (EBO) [it is a buffer of generic user data: positions, normals, texture coordinates, temperature, etc...]
	// - create data on CPU
	// - this is the geometry of your object)
	// - we store 2D position "indices" as 1D array of "triangle" indices : (i0,j0,k0, i1,j1,k1, i2,j2,k2, ...)
	let nbMeshQuads = (iMax - 1) * (jMax - 1);
	let nbMeshTriangles = 2 * nbMeshQuads;
	nbMeshIndices = 3 * nbMeshTriangles;
	let ebo_data = new Uint32Array(nbMeshIndices);
	let current_quad = 0;
	for (let j = 0; j < jMax - 1; j++)
	{
		//for (let i = 0; i < iMax; i++)
	    for (let i = 0; i < iMax - 1; i++)
	    {
		   	// triangle 1
			ebo_data[ 6 * current_quad ] = i + j * iMax;
			ebo_data[ 6 * current_quad + 1 ] = (i + 1) + j * iMax;
			ebo_data[ 6 * current_quad + 2 ] = i + (j + 1) * iMax;
			// triangle 2
			ebo_data[ 6 * current_quad + 3 ] = i + (j + 1) * iMax;
			ebo_data[ 6 * current_quad + 4 ] = (i + 1) + j * iMax;
			ebo_data[ 6 * current_quad + 5 ] = (i + 1) + (j + 1) * iMax;
			current_quad++;
		}
	}
	let ebo = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
	// - allocate memory on GPU (size of data) and send data from CPU to GPU
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ebo_data, gl.STATIC_DRAW);
	// - reset GL state
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
	
	// Create ande initialize a vertex array object (VAO) [it is a "container" of vertex buffer objects (VBO)]
	// - create a VAO (kind of memory pointer or handle on GPU)
	vao = gl.createVertexArray();
	// - bind "current" VAO
	gl.bindVertexArray(vao);
	// - bind "current" VBO
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo_positions);
	// - attach VBO to VAO
	// - tell how data is stored in "current" VBO in terms of size and format.
	// - it specifies the "location" and data format of the array of generic vertex attributes at "index" ID to use when rendering
	let vertexAttributeID = 1; // specifies the "index" of the generic vertex attribute to be modified
	let dataSize = 2; // 2 for 2D positions. Specifies the number of components per generic vertex attribute. Must be 1, 2, 3, 4.
	let dataType = gl.FLOAT; // data type
	gl.vertexAttribPointer(vertexAttributeID, dataSize, dataType,
	                        false, 0, 0); // unused parameters for the moment (normalized, stride, pointer)
	// - enable the use of VBO. It enable or disable a generic vertex attribute array
	gl.enableVertexAttribArray(vertexAttributeID);
	// - bind "current" EBO
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
	
	// Reset GL states
	gl.bindVertexArray(null);
	gl.bindBuffer(gl.ARRAY_BUFFER, null); // BEWARE: only unbind the VBO after unbinding the VAO !
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null); // BEWARE: only unbind the EBO after unbinding the VAO !

	// HACK...
	update_wgl();
}

//--------------------------------------------------------------------------------------------------------
// Initialize graphics objects and GL states
//
// Here, we want to display a square/rectangle on screen
// Uniforms are used to be able edit GPU data with a customized GUI (graphical user interface)
//--------------------------------------------------------------------------------------------------------
function init_wgl()
{
	// ANIMATIONS // [=> Sylvain's API]
	// - if animations, set this internal variable (it will refresh the window everytime)
	ewgl.continuous_update = true;
	
	// CUSTOM USER INTERFACE
	UserInterface.begin(); // name of html id
		// MESH COLOR
		// TERRAIN
		 // - container (H: horizontal)
		UserInterface.use_field_set('H', "Terrain Generator");
		UserInterface.use_field_set('H', "Grid size");
		// - sliders (name, min, max, default value, callback called when value is modified)
		// - update_wgl() is caleld to refresh screen
		slider_terrainWidth = UserInterface.add_slider('Width', 2, 100, 10, buildMesh);
		slider_terrainHeight = UserInterface.add_slider('Height', 2, 100, 10, buildMesh);
		UserInterface.end_use();
		slider_terrainElevation = UserInterface.add_slider('Elevation', 3.0, 50.0, 5.0, update_wgl);
		UserInterface.end_use();
	UserInterface.end();
	
	// Create and initialize a shader program // [=> Sylvain's API - wrapper of GL code]
	terrainShader = ShaderProgram(terrain_vert, terrain_frag, 'terrain shader');

	// Build mesh
	buildMesh();
	// Set default GL states
	// - color to use when refreshing screen
	gl.clearColor(0, 0, 0 ,1); // black opaque [values are between 0.0 and 1.0]
	// - activate depth buffer
	gl.enable(gl.DEPTH_TEST);

	// - color map initialize only one time (test performance)
	terrainShader.bind();
	Uniforms.ucolor_map = colorMap;
	gl.useProgram(null);
}

//--------------------------------------------------------------------------------------------------------
// Render scene
//--------------------------------------------------------------------------------------------------------
function draw_wgl()
{
	// --------------------------------
	// [1] - always do that
	// --------------------------------
	
	// Clear the GL color framebuffer
	gl.clear(gl.COLOR_BUFFER_BIT);

	// --------------------------------
	// [2] - render your scene
	// --------------------------------
	
	// Set "current" shader program
	terrainShader.bind();
	Uniforms.uTerrainElevation = slider_terrainElevation.value;
	// - camera
	Uniforms.uProjectionMatrix = ewgl.scene_camera.get_projection_matrix();
	Uniforms.uViewMatrix = ewgl.scene_camera.get_view_matrix();
	// - model matrix
	Uniforms.uModelMatrix = Matrix.mult(Matrix.scale(0.5), Matrix.rotateX(-60), Matrix.rotateZ(-30));

	
	// Bind "current" vertex array (VAO)
	gl.bindVertexArray(vao);
	
	// Draw commands
	// - use method "drawElements(mode, count, type, indices)"
	gl.drawElements(gl.TRIANGLES, nbMeshIndices, gl.UNSIGNED_INT, 0);

	// Reset GL state(s)
	// - unbind vertex array
	gl.bindVertexArray(null);
	// - unbind shader program
	gl.useProgram(null);
}

function init_color_map()
{
	colorMap =   [Vec4(0.0,        0.6372549,  0.88823529, 1.0),
						Vec4(0.0,        0.64509804, 0.86470588, 1.0),
						Vec4(0.0,        0.65294118, 0.84117647, 1.0),
						Vec4(0.0,        0.66078431, 0.81764706, 1.0),
						Vec4(0.0,        0.66078431, 0.81764706, 1.0),
						Vec4(0.0,        0.66862745, 0.79411765, 1.0),
						Vec4(0.0,        0.67647059, 0.77058824, 1.0),
						Vec4(0.0,        0.68431373, 0.74705882, 1.0),
						Vec4(0.0,        0.69215686, 0.72352941, 1.0),
						Vec4(0.0,        0.7,        0.7,        1.0),
						Vec4(0.0,        0.7,        0.7,        1.0),
						Vec4(0.0,        0.70784314, 0.67647059, 1.0),
						Vec4(0.0,        0.71568627, 0.65294118, 1.0),
						Vec4(0.0,        0.72352941, 0.62941176, 1.0),
						Vec4(0.0,        0.73137255, 0.60588235, 1.0),
						Vec4(0.0,        0.73921569, 0.58235294, 1.0),
						Vec4(0.0,        0.73921569, 0.58235294, 1.0),
						Vec4(0.0,        0.74705882, 0.55882353, 1.0),
						Vec4(0.0,        0.75490196, 0.53529412, 1.0),
						Vec4(0.0,        0.7627451,  0.51176471, 1.0),
						Vec4(0.0,        0.77058824, 0.48823529, 1.0),
						Vec4(0.0,        0.77843137, 0.46470588, 1.0),
						Vec4(0.0,        0.77843137, 0.46470588, 1.0),
						Vec4(0.0,        0.78627451, 0.44117647, 1.0),
						Vec4(0.0,        0.79411765, 0.41764706, 1.0),
						Vec4(0.00392157, 0.80078431, 0.40078431, 1.0),
						Vec4(0.01960784, 0.80392157, 0.40392157, 1.0),
						Vec4(0.03529412, 0.80705882, 0.40705882, 1.0),
						Vec4(0.03529412, 0.80705882, 0.40705882, 1.0),
						Vec4(0.05098039, 0.81019608, 0.41019608, 1.0),
						Vec4(0.06666667, 0.81333333, 0.41333333, 1.0),
						Vec4(0.08235294, 0.81647059, 0.41647059, 1.0),
						Vec4(0.09803922, 0.81960784, 0.41960784, 1.0),
						Vec4(0.11372549, 0.8227451,  0.4227451,  1.0),
						Vec4(0.11372549, 0.8227451,  0.4227451,  1.0),
						Vec4(0.12941176, 0.82588235, 0.42588235, 1.0),
						Vec4(0.14509804, 0.82901961, 0.42901961, 1.0),
						Vec4(0.16078431, 0.83215686, 0.43215686, 1.0),
						Vec4(0.17647059, 0.83529412, 0.43529412, 1.0),
						Vec4(0.19215686, 0.83843137, 0.43843137, 1.0),
						Vec4(0.19215686, 0.83843137, 0.43843137, 1.0),
						Vec4(0.20784314, 0.84156863, 0.44156863, 1.0),
						Vec4(0.22352941, 0.84470588, 0.44470588, 1.0),
						Vec4(0.23921569, 0.84784314, 0.44784314, 1.0),
						Vec4(0.25490196, 0.85098039, 0.45098039, 1.0),
						Vec4(0.27058824, 0.85411765, 0.45411765, 1.0),
						Vec4(0.28627451, 0.8572549,  0.4572549,  1.0),
						Vec4(0.28627451, 0.8572549,  0.4572549,  1.0),
						Vec4(0.30196078, 0.86039216, 0.46039216, 1.0),
						Vec4(0.31764706, 0.86352941, 0.46352941, 1.0),
						Vec4(0.33333333, 0.86666667, 0.46666667, 1.0),
						Vec4(0.34901961, 0.86980392, 0.46980392, 1.0),
						Vec4(0.36470588, 0.87294118, 0.47294118, 1.0),
						Vec4(0.36470588, 0.87294118, 0.47294118, 1.0),
						Vec4(0.38039216, 0.87607843, 0.47607843, 1.0),
						Vec4(0.39607843, 0.87921569, 0.47921569, 1.0),
						Vec4(0.41176471, 0.88235294, 0.48235294, 1.0),
						Vec4(0.42745098, 0.8854902,  0.4854902,  1.0),
						Vec4(0.44313725, 0.88862745, 0.48862745, 1.0),
						Vec4(0.44313725, 0.88862745, 0.48862745, 1.0),
						Vec4(0.45882353, 0.89176471, 0.49176471, 1.0),
						Vec4(0.4745098,  0.89490196, 0.49490196, 1.0),
						Vec4(0.49019608, 0.89803922, 0.49803922, 1.0),
						Vec4(0.50588235, 0.90117647, 0.50117647, 1.0),
						Vec4(0.52156863, 0.90431373, 0.50431373, 1.0),
						Vec4(0.52156863, 0.90431373, 0.50431373, 1.0),
						Vec4(0.5372549,  0.90745098, 0.50745098, 1.0),
						Vec4(0.55294118, 0.91058824, 0.51058824, 1.0),
						Vec4(0.56862745, 0.91372549, 0.51372549, 1.0),
						Vec4(0.58431373, 0.91686275, 0.51686275, 1.0),
						Vec4(0.6,        0.92,       0.52,       1.0),
						Vec4(0.6,        0.92,       0.52,       1.0),
						Vec4(0.61568627, 0.92313725, 0.52313725, 1.0),
						Vec4(0.63137255, 0.92627451, 0.52627451, 1.0),
						Vec4(0.64705882, 0.92941176, 0.52941176, 1.0),
						Vec4(0.6627451,  0.93254902, 0.53254902, 1.0),
						Vec4(0.67843137, 0.93568627, 0.53568627, 1.0),
						Vec4(0.67843137, 0.93568627, 0.53568627, 1.0),
						Vec4(0.69411765, 0.93882353, 0.53882353, 1.0),
						Vec4(0.70980392, 0.94196078, 0.54196078, 1.0),
						Vec4(0.7254902,  0.94509804, 0.54509804, 1.0),
						Vec4(0.74117647, 0.94823529, 0.54823529, 1.0),
						Vec4(0.75686275, 0.95137255, 0.55137255, 1.0),
						Vec4(0.75686275, 0.95137255, 0.55137255, 1.0),
						Vec4(0.77254902, 0.9545098,  0.5545098,  1.0),
						Vec4(0.78823529, 0.95764706, 0.55764706, 1.0),
						Vec4(0.80392157, 0.96078431, 0.56078431, 1.0),
						Vec4(0.81960784, 0.96392157, 0.56392157, 1.0),
						Vec4(0.83529412, 0.96705882, 0.56705882, 1.0),
						Vec4(0.83529412, 0.96705882, 0.56705882, 1.0),
						Vec4(0.85098039, 0.97019608, 0.57019608, 1.0),
						Vec4(0.86666667, 0.97333333, 0.57333333, 1.0),
						Vec4(0.88235294, 0.97647059, 0.57647059, 1.0),
						Vec4(0.89803922, 0.97960784, 0.57960784, 1.0),
						Vec4(0.91372549, 0.9827451,  0.5827451,  1.0),
						Vec4(0.91372549, 0.9827451,  0.5827451,  1.0),
						Vec4(0.92941176, 0.98588235, 0.58588235, 1.0),
						Vec4(0.94509804, 0.98901961, 0.58901961, 1.0),
						Vec4(0.96078431, 0.99215686, 0.59215686, 1.0),
						Vec4(0.97647059, 0.99529412, 0.59529412, 1.0),
						Vec4(0.99215686, 0.99843137, 0.59843137, 1.0),
						Vec4(0.99607843, 0.99498039, 0.59788235, 1.0),
						Vec4(0.99607843, 0.99498039, 0.59788235, 1.0),
						Vec4(0.98823529, 0.98494118, 0.59364706, 1.0),
						Vec4(0.98039216, 0.97490196, 0.58941176, 1.0),
						Vec4(0.97254902, 0.96486275, 0.58517647, 1.0),
						Vec4(0.96470588, 0.95482353, 0.58094118, 1.0),
						Vec4(0.95686275, 0.94478431, 0.57670588, 1.0),
						Vec4(0.95686275, 0.94478431, 0.57670588, 1.0),
						Vec4(0.94901961, 0.9347451,  0.57247059, 1.0),
						Vec4(0.94117647, 0.92470588, 0.56823529, 1.0),
						Vec4(0.93333333, 0.91466667, 0.564,      1.0),
						Vec4(0.9254902,  0.90462745, 0.55976471, 1.0),
						Vec4(0.91764706, 0.89458824, 0.55552941, 1.0),
						Vec4(0.91764706, 0.89458824, 0.55552941, 1.0),
						Vec4(0.90980392, 0.88454902, 0.55129412, 1.0),
						Vec4(0.90196078, 0.8745098,  0.54705882, 1.0),
						Vec4(0.89411765, 0.86447059, 0.54282353, 1.0),
						Vec4(0.88627451, 0.85443137, 0.53858824, 1.0),
						Vec4(0.87843137, 0.84439216, 0.53435294, 1.0),
						Vec4(0.87843137, 0.84439216, 0.53435294, 1.0),
						Vec4(0.87058824, 0.83435294, 0.53011765, 1.0),
						Vec4(0.8627451,  0.82431373, 0.52588235, 1.0),
						Vec4(0.85490196, 0.81427451, 0.52164706, 1.0),
						Vec4(0.84705882, 0.80423529, 0.51741176, 1.0),
						Vec4(0.83921569, 0.79419608, 0.51317647, 1.0),
						Vec4(0.83921569, 0.79419608, 0.51317647, 1.0),
						Vec4(0.83137255, 0.78415686, 0.50894118, 1.0),
						Vec4(0.82352941, 0.77411765, 0.50470588, 1.0),
						Vec4(0.81568627, 0.76407843, 0.50047059, 1.0),
						Vec4(0.80784314, 0.75403922, 0.49623529, 1.0),
						Vec4(0.8,        0.744,      0.492,      1.0),
						Vec4(0.8,        0.744,      0.492,      1.0),
						Vec4(0.79215686, 0.73396078, 0.48776471, 1.0),
						Vec4(0.78431373, 0.72392157, 0.48352941, 1.0),
						Vec4(0.77647059, 0.71388235, 0.47929412, 1.0),
						Vec4(0.76862745, 0.70384314, 0.47505882, 1.0),
						Vec4(0.76078431, 0.69380392, 0.47082353, 1.0),
						Vec4(0.76078431, 0.69380392, 0.47082353, 1.0),
						Vec4(0.75294118, 0.68376471, 0.46658824, 1.0),
						Vec4(0.74509804, 0.67372549, 0.46235294, 1.0),
						Vec4(0.7372549,  0.66368627, 0.45811765, 1.0),
						Vec4(0.72941176, 0.65364706, 0.45388235, 1.0),
						Vec4(0.72156863, 0.64360784, 0.44964706, 1.0),
						Vec4(0.72156863, 0.64360784, 0.44964706, 1.0),
						Vec4(0.71372549, 0.63356863, 0.44541176, 1.0),
						Vec4(0.70588235, 0.62352941, 0.44117647, 1.0),
						Vec4(0.69803922, 0.6134902,  0.43694118, 1.0),
						Vec4(0.69019608, 0.60345098, 0.43270588, 1.0),
						Vec4(0.68235294, 0.59341176, 0.42847059, 1.0),
						Vec4(0.6745098,  0.58337255, 0.42423529, 1.0),
						Vec4(0.6745098,  0.58337255, 0.42423529, 1.0),
						Vec4(0.66666667, 0.57333333, 0.42,       1.0),
						Vec4(0.65882353, 0.56329412, 0.41576471, 1.0),
						Vec4(0.65098039, 0.5532549,  0.41152941, 1.0),
						Vec4(0.64313725, 0.54321569, 0.40729412, 1.0),
						Vec4(0.63529412, 0.53317647, 0.40305882, 1.0),
						Vec4(0.63529412, 0.53317647, 0.40305882, 1.0),
						Vec4(0.62745098, 0.52313725, 0.39882353, 1.0),
						Vec4(0.61960784, 0.51309804, 0.39458824, 1.0),
						Vec4(0.61176471, 0.50305882, 0.39035294, 1.0),
						Vec4(0.60392157, 0.49301961, 0.38611765, 1.0),
						Vec4(0.59607843, 0.48298039, 0.38188235, 1.0),
						Vec4(0.59607843, 0.48298039, 0.38188235, 1.0),
						Vec4(0.58823529, 0.47294118, 0.37764706, 1.0),
						Vec4(0.58039216, 0.46290196, 0.37341176, 1.0),
						Vec4(0.57254902, 0.45286275, 0.36917647, 1.0),
						Vec4(0.56470588, 0.44282353, 0.36494118, 1.0),
						Vec4(0.55686275, 0.43278431, 0.36070588, 1.0),
						Vec4(0.55686275, 0.43278431, 0.36070588, 1.0),
						Vec4(0.54901961, 0.4227451,  0.35647059, 1.0),
						Vec4(0.54117647, 0.41270588, 0.35223529, 1.0),
						Vec4(0.53333333, 0.40266667, 0.348,      1.0),
						Vec4(0.5254902,  0.39262745, 0.34376471, 1.0),
						Vec4(0.51764706, 0.38258824, 0.33952941, 1.0),
						Vec4(0.51764706, 0.38258824, 0.33952941, 1.0),
						Vec4(0.50980392, 0.37254902, 0.33529412, 1.0),
						Vec4(0.50196078, 0.3625098,  0.33105882, 1.0),
						Vec4(0.50588235, 0.36752941, 0.33788235, 1.0),
						Vec4(0.51372549, 0.37756863, 0.34839216, 1.0),
						Vec4(0.52156863, 0.38760784, 0.35890196, 1.0),
						Vec4(0.52156863, 0.38760784, 0.35890196, 1.0),
						Vec4(0.52941176, 0.39764706, 0.36941176, 1.0),
						Vec4(0.5372549,  0.40768627, 0.37992157, 1.0),
						Vec4(0.54509804, 0.41772549, 0.39043137, 1.0),
						Vec4(0.55294118, 0.42776471, 0.40094118, 1.0),
						Vec4(0.56078431, 0.43780392, 0.41145098, 1.0),
						Vec4(0.56078431, 0.43780392, 0.41145098, 1.0),
						Vec4(0.56862745, 0.44784314, 0.42196078, 1.0),
						Vec4(0.57647059, 0.45788235, 0.43247059, 1.0),
						Vec4(0.58431373, 0.46792157, 0.44298039, 1.0),
						Vec4(0.59215686, 0.47796078, 0.4534902,  1.0),
						Vec4(0.6,        0.488,      0.464,      1.0),
						Vec4(0.6,        0.488,      0.464,      1.0),
						Vec4(0.60784314, 0.49803922, 0.4745098,  1.0),
						Vec4(0.61568627, 0.50807843, 0.48501961, 1.0),
						Vec4(0.62352941, 0.51811765, 0.49552941, 1.0),
						Vec4(0.63137255, 0.52815686, 0.50603922, 1.0),
						Vec4(0.63921569, 0.53819608, 0.51654902, 1.0),
						Vec4(0.63921569, 0.53819608, 0.51654902, 1.0),
						Vec4(0.64705882, 0.54823529, 0.52705882, 1.0),
						Vec4(0.65490196, 0.55827451, 0.53756863, 1.0),
						Vec4(0.6627451,  0.56831373, 0.54807843, 1.0),
						Vec4(0.67058824, 0.57835294, 0.55858824, 1.0),
						Vec4(0.67843137, 0.58839216, 0.56909804, 1.0),
						Vec4(0.68627451, 0.59843137, 0.57960784, 1.0),
						Vec4(0.68627451, 0.59843137, 0.57960784, 1.0),
						Vec4(0.69411765, 0.60847059, 0.59011765, 1.0),
						Vec4(0.70196078, 0.6185098,  0.60062745, 1.0),
						Vec4(0.70980392, 0.62854902, 0.61113725, 1.0),
						Vec4(0.71764706, 0.63858824, 0.62164706, 1.0),
						Vec4(0.7254902,  0.64862745, 0.63215686, 1.0),
						Vec4(0.7254902,  0.64862745, 0.63215686, 1.0),
						Vec4(0.73333333, 0.65866667, 0.64266667, 1.0),
						Vec4(0.74117647, 0.66870588, 0.65317647, 1.0),
						Vec4(0.74901961, 0.6787451,  0.66368627, 1.0),
						Vec4(0.75686275, 0.68878431, 0.67419608, 1.0),
						Vec4(0.76470588, 0.69882353, 0.68470588, 1.0),
						Vec4(0.76470588, 0.69882353, 0.68470588, 1.0),
						Vec4(0.77254902, 0.70886275, 0.69521569, 1.0),
						Vec4(0.78039216, 0.71890196, 0.70572549, 1.0),
						Vec4(0.78823529, 0.72894118, 0.71623529, 1.0),
						Vec4(0.79607843, 0.73898039, 0.7267451,  1.0),
						Vec4(0.80392157, 0.74901961, 0.7372549,  1.0),
						Vec4(0.80392157, 0.74901961, 0.7372549,  1.0),
						Vec4(0.81176471, 0.75905882, 0.74776471, 1.0),
						Vec4(0.81960784, 0.76909804, 0.75827451, 1.0),
						Vec4(0.82745098, 0.77913725, 0.76878431, 1.0),
						Vec4(0.83529412, 0.78917647, 0.77929412, 1.0),
						Vec4(0.84313725, 0.79921569, 0.78980392, 1.0),
						Vec4(0.84313725, 0.79921569, 0.78980392, 1.0),
						Vec4(0.85098039, 0.8092549,  0.80031373, 1.0),
						Vec4(0.85882353, 0.81929412, 0.81082353, 1.0),
						Vec4(0.86666667, 0.82933333, 0.82133333, 1.0),
						Vec4(0.8745098,  0.83937255, 0.83184314, 1.0),
						Vec4(0.88235294, 0.84941176, 0.84235294, 1.0),
						Vec4(0.88235294, 0.84941176, 0.84235294, 1.0),
						Vec4(0.89019608, 0.85945098, 0.85286275, 1.0),
						Vec4(0.89803922, 0.8694902,  0.86337255, 1.0),
						Vec4(0.90588235, 0.87952941, 0.87388235, 1.0),
						Vec4(0.91372549, 0.88956863, 0.88439216, 1.0),
						Vec4(0.92156863, 0.89960784, 0.89490196, 1.0),
						Vec4(0.92156863, 0.89960784, 0.89490196, 1.0),
						Vec4(0.92941176, 0.90964706, 0.90541176, 1.0),
						Vec4(0.9372549,  0.91968627, 0.91592157, 1.0),
						Vec4(0.94509804, 0.92972549, 0.92643137, 1.0),
						Vec4(0.95294118, 0.93976471, 0.93694118, 1.0),
						Vec4(0.96078431, 0.94980392, 0.94745098, 1.0),
						Vec4(0.96078431, 0.94980392, 0.94745098, 1.0),
						Vec4(0.96862745, 0.95984314, 0.95796078, 1.0),
						Vec4(0.97647059, 0.96988235, 0.96847059, 1.0),
						Vec4(0.98431373, 0.97992157, 0.97898039, 1.0),
						Vec4(0.99215686, 0.98996078, 0.9894902,  1.0),
						Vec4(1.0,        1.0,        1.0,        1.0),
						Vec4(1.0,        1.0,        1.0,        1.0)
						];
}
init_color_map();
ewgl.launch_3d();
