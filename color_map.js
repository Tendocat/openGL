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
uniform float uGridPrecision;
uniform float uGridSize;

uniform float uWaterHeight;
uniform int uMode;

// OUTPUT
out float height;
out vec3 v_position;
out vec3 v_normal;

flat out float t_waterHeight;
flat out int t_mode;

// FUNCTIONS noise and fbm FROM https://thebookofshaders.com/13/
float rand (vec2 _st) {
    return fract(sin(dot(_st.xy, vec2(12.9898,78.233))) * 437358.5453123);
}
// - here, is it a noise function that create random values in [-1.0;1.0] given a position in [0.0;1.0]
float noise (vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    // Four corners in 2D of a tile
    float a = rand(i);
    float b = rand(i + vec2(1.0, 0.0));
    float c = rand(i + vec2(0.0, 1.0));
    float d = rand(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
            (c - a)* u.y * (1.0 - u.x) +
            (d - b) * u.x * u.y;
}
float fbm (vec2 st) {
    // Initial values
    float value = 0.0;
    float amplitude = .5;
    float frequency = 0.;
    for (int i = 0; i < 20; i++) {
        value += amplitude * noise(st);
        st *= 2.;
        amplitude *= .5;
    }
	if (uMode == 2) {
		value = value / uTerrainElevation - 2.*(value / uTerrainElevation - uWaterHeight);
	}
	else {
		value = value / uTerrainElevation;
	}
    return value;
}

// 'base' la position sans hauteur
vec3 compute_normal(vec3 base) {
	vec3 off = vec3(uGridSize/uGridPrecision, 0.0, uGridSize/uGridPrecision);
	float hR = fbm(base.xz + off.xy);
	float hL = fbm(base.xz - off.xy);
	float hD = fbm(base.xz - off.yz);
	float hU = fbm(base.xz + off.yz);
  
	vec3 n;
	n.x = hL - hR;
	n.y = uGridSize/(uGridPrecision*2.0);
	n.z = hD - hU;
	return normalize(n);
}
// MAIN PROGRAM
void main()	//Hc − 2 ∗ (Hc − Hw)
{
	vec3 position = vec3(2.0 * position_in.x - 1.0, 0.0, 2.0 * position_in.y - 1.0);

	vec3 baseForNormals = position;
	position.y += fbm(position_in*5.);

	if (uMode == 2) {
		height = position.y - 2.*(position.y - uWaterHeight);
	}
	else {
		height = position.y;
	}
	
	v_position = (uViewMatrix * uModelMatrix * vec4(position, 1.0)).xyz;
	v_normal = (uViewMatrix * uModelMatrix * vec4(compute_normal(baseForNormals), 1.)).xyz;
	t_waterHeight = uWaterHeight;
	t_mode = uMode;
	
	vec4 proj = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(position, 1.0);

	gl_Position = proj;
}
`;

//--------------------------------------------------------------------------------------------------------
var terrain_frag =
`#version 300 es
precision highp float;

#define M_PI 3.14159265358979

// INPUT
in float height; // used for ucolor_map
in vec3 v_position;
in vec3 v_normal;

flat in float t_waterHeight;
flat in int t_mode;

// OUTPUT
out vec4 oFragmentColor;

// UNIFORM
uniform vec4 ucolor_map[255];
uniform float uLightIntensity;
uniform vec3 uLightPosition;

// MAIN PROGRAM
void main()
{
	if (t_mode == 1 && height >= t_waterHeight + 0.1) {
		discard;
	}
	if (t_mode == 2 && height <= t_waterHeight - 0.004) {
		discard;
	}
	
	vec3 n = normalize(v_normal);
	float lightIntensity = uLightIntensity *.5;	// better less
	// AMBIANT
	vec3 Ka = ucolor_map[clamp(int(height*200.),0,254)].xyz;	// adapt to colormap length
	vec3 Ia = lightIntensity * Ka;

	// DIFFUS
	vec3 lightDir = normalize(uLightPosition - v_position);
	vec3 Id = lightIntensity * Ka * max(0.0, dot(n, lightDir));
	Id = Id / M_PI;

	oFragmentColor = vec4(Ia*.5 + Id*.5, 1.);
	//oFragmentColor = vec4(n,1.);
}
`;

//--------------------------------------------------------------------------------------------------------
// SKYBOX SHADER
//--------------------------------------------------------------------------------------------------------
var skybox_vert =
`#version 300 es

layout(location = 0) in vec3 position_in;
out vec3 tex_coord;
uniform mat4 uProjectionViewMatrix;
uniform int uMode;
void main()
{
	vec3 position = position_in;

	tex_coord = position;

	if (uMode == 2) {
		position.y = position.y*-1.;
	}

	gl_Position = uProjectionViewMatrix * vec4(position, 1.0);
}
`;

//--------------------------------------------------------------------------------------------------------
var skybox_frag =
`#version 300 es
precision highp float;

in vec3 tex_coord;
out vec4 oFragmentColor;
uniform samplerCube TU;

void main()
{
	oFragmentColor = texture(TU, tex_coord);
}
`;

//--------------------------------------------------------------------------------------------------------
// WATER SHADER
//--------------------------------------------------------------------------------------------------------
var water_vert =
`#version 300 es

// INPUT
layout(location = 1) in vec2 position_in;

// UNIFORM
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;
uniform float uHeight;
uniform vec3 uCameraPosition;

//OUTPUT
out vec4 cliping;	// for refract & reflect
out vec2 texCoord;	// for maping textures
out vec3 v_position;
out vec3 v_fragmentToCamera;

void main()
{
	vec3 position = vec3(position_in.x, uHeight, position_in.y);
	
	texCoord = (position_in + .5)* 2.;

	v_position = (uViewMatrix * uModelMatrix * vec4(position, 1.0)).xyz;

	v_fragmentToCamera = uCameraPosition - (uModelMatrix * vec4(position, 1.)).xyz;

	vec4 proj = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(position, 1.);
	cliping = proj;
	gl_Position = proj;
}
`;

//--------------------------------------------------------------------------------------------------------
var water_frag =
`#version 300 es
precision highp float;
#define M_PI 3.14159265358979

// INPUT
in vec4 cliping;
in vec2 texCoord;
in vec3 v_position;
in vec3 v_fragmentToCamera;

// UNIFORM
uniform float uTime;
uniform sampler2D uTexRefract;
uniform sampler2D uTexReflect;

uniform sampler2D uTexDistorsion;
uniform sampler2D uTexNormal;

uniform float uLightIntensity;
uniform vec3 uLightPosition;
// OUTPUT
out vec4 oFragmentColor;

float rand (vec2 _st) {
    return fract(sin(dot(_st.xy, vec2(12.9898,78.233))) * 437358.5453123);
}

void main()
{
	vec2 uv = texCoord*2.-1.;
	float noise = rand(uv)*.005;
	vec2 distortedTexCoord = noise+vec2(uv.x + mod(uTime+uv.x*sin(uTime)*.2, 20.)*.05, uv.y + mod(uv.y*cos(uTime)*.2, 20.)*.05); // vagues très simples
	
	vec4 distorsion = texture(uTexDistorsion, distortedTexCoord);
	vec2 ndc = (cliping.xy/cliping.w)*.5 + .5;
	ndc += vec2(distorsion.x, distorsion.y)*0.01;
	vec2 refractTexCoords = clamp(ndc, 0.0001, .9999);

	vec4 refractColor = texture(uTexRefract, refractTexCoords);
	vec4 relectColor = texture(uTexReflect, refractTexCoords);
	
	vec3 normal = texture(uTexNormal, distortedTexCoord).xzy;
	normal = normalize(normal);

	vec3 toCamera = normalize(v_fragmentToCamera);

    // Fresnel Effect. Looking at the water from above makes the water more transparent.
    float fresnel = 1. - dot(toCamera, normal);

	vec4 raleColor = mix(refractColor, relectColor, fresnel);

	// LIGHTING

	// AMBIANT
	vec3 Ka = raleColor.xyz;
	vec3 Ia = uLightIntensity * Ka;

	// DIFFUS
	vec3 lightDir = normalize(uLightPosition - v_position);
	float diffuseTerm = max(0.0, dot(normal, lightDir));
	vec3 Id = uLightIntensity * Ka * diffuseTerm;
	Id = Id / M_PI;

	float uNs = 40.;

	// SPECULAIRE
	vec3 Is = vec3(0.0);
	if (diffuseTerm > 0.0)
	{
		vec3 viewDir = normalize(-v_position.xyz);
		vec3 halfDir = normalize(viewDir + lightDir);
		float specularTerm = clamp(pow(dot(normal, halfDir), uNs), 0., 1.);
		Is = uLightIntensity * vec3(4.4,2.,1.3) * vec3(specularTerm);
		Is /= (uNs + 2.0) / (2.0 * M_PI);
	}

	oFragmentColor = vec4((0.3 * Ia) + (0.3 * Id) + (0.3 * Is), 1.);
}
`;


//--------------------------------------------------------------------------------------------------------
// Global variables
//--------------------------------------------------------------------------------------------------------

// shaders
var terrainShader = null;
var waterShader = null;
var vaoTerrain = null;
var vaoWater = null;
// Skybox
var envMapShader = null;
var envMapTex = null;
var skybox_rend = null;

// GUI (graphical user interface)
// Terrain
var gridPrecision = 10;
var gridSize = 1;
var nbMeshIndices = 0;
var slider_terrainPrecision;
var slider_terrainSize;
var slider_terrainElevation;
// - lighting
var slider_light_x;
var slider_light_y;
var slider_light_z;
var slider_light_intensity;
// - water
var nbMeshWater = 6;
var slider_water_height;
var tex_distorsion = null;
var tex_normal = null;
// - fbo
var fboTexWidth = 2048;
var fboTexHeight = 2048;
var fbo_refract = null;
var tex_refract = null;
var fbo_reflect = null;
var tex_reflect = null;

// Color map
var colorMap = [];
var modelMatrix = Matrix.scale(1);

//--------------------------------------------------------------------------------------------------------
// Build terrain mesh FROM CORRECTION
//--------------------------------------------------------------------------------------------------------
function buildTerrainMesh()
{
	gridSize = slider_terrainSize.value;
	gridPrecision = slider_terrainPrecision.value;
	ewgl.scene_camera.set_scene_radius(20);

	gl.deleteVertexArray(vaoTerrain);


	let data_positions = new Float32Array(gridPrecision * gridPrecision * 2);
	
	for (let j = 0; j < gridPrecision; j++)
	{
	    for (let i = 0; i < gridPrecision; i++)
	    {
			// x
			data_positions[ 2 * (i + j * gridPrecision) ] = gridSize * i / (gridPrecision - 1.) - gridSize/2;
			// y
			data_positions[ 2 * (i + j * gridPrecision) + 1 ] = gridSize * j / (gridPrecision - 1.) - gridSize/2;
	    }
	}
	let vbo_positions = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo_positions); 
	gl.bufferData(gl.ARRAY_BUFFER, data_positions, gl.STATIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);

	let nbMeshQuads = (gridPrecision - 1) * (gridPrecision - 1);
	let nbMeshTriangles = 2 * nbMeshQuads;
	nbMeshIndices = 3 * nbMeshTriangles;
	let ebo_data = new Uint32Array(nbMeshIndices);
	let current_quad = 0;
	for (let j = 0; j < gridPrecision - 1; j++)
	{
	    for (let i = 0; i < gridPrecision - 1; i++)
	    {
		   	// triangle 1
			ebo_data[ 6 * current_quad ] = i + j * gridPrecision;
			ebo_data[ 6 * current_quad + 1 ] = (i + 1) + j * gridPrecision;
			ebo_data[ 6 * current_quad + 2 ] = i + (j + 1) * gridPrecision;
			// triangle 2
			ebo_data[ 6 * current_quad + 3 ] = i + (j + 1) * gridPrecision;
			ebo_data[ 6 * current_quad + 4 ] = (i + 1) + j * gridPrecision;
			ebo_data[ 6 * current_quad + 5 ] = (i + 1) + (j + 1) * gridPrecision;
			current_quad++;
		}
	}
	let ebo = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ebo_data, gl.STATIC_DRAW);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
	
	// Create ande initialize a vertex array object (VAO) [it is a "container" of vertex buffer objects (VBO)]
	// - create a VAO (kind of memory pointer or handle on GPU)
	vaoTerrain = gl.createVertexArray();
	// - bind "current" VAO
	gl.bindVertexArray(vaoTerrain);
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
	buildWaterMesh();
	update_wgl();
}

//--------------------------------------------------------------------------------------------------------
// Build water mesh
//--------------------------------------------------------------------------------------------------------
function buildWaterMesh()
{
	gl.deleteVertexArray(vaoWater);
	let data_positions = new Float32Array(
	    [-1000,-1000,
		  1000,-1000,
		  1000, 1000,
		 -1000, 1000]
		);
	let vbo_positions = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo_positions);
	gl.bufferData(gl.ARRAY_BUFFER, data_positions, gl.STATIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);


	let ebo_data = new Uint32Array([0, 3, 1, 3, 1, 2]);
	let ebo = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ebo_data, gl.STATIC_DRAW);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
	
	vaoWater = gl.createVertexArray();
	gl.bindVertexArray(vaoWater);
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo_positions);
	
	let vertexAttributeID = 1;
	let dataSize = 2;
	let dataType = gl.FLOAT;
	gl.vertexAttribPointer(vertexAttributeID, dataSize, dataType,
	                        false, 0, 0);
	gl.enableVertexAttribArray(vertexAttributeID);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
	
	// Reset GL states
	gl.bindVertexArray(null);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
}

//--------------------------------------------------------------------------------------------------------
// Initialize graphics objects and GL states
//--------------------------------------------------------------------------------------------------------
function init_wgl()
{
	ewgl.continuous_update = true;
	// CUSTOM USER INTERFACE
	UserInterface.begin();
		// TERRAIN
		UserInterface.use_field_set('H', "Terrain Generator");
		slider_terrainPrecision = UserInterface.add_slider('Precision', 2, 500, 400, buildTerrainMesh);
		slider_terrainSize = UserInterface.add_slider('Size', 1, 30, 10, buildTerrainMesh);
		slider_terrainElevation = UserInterface.add_slider('Elevation', 3.0, 20.0, 5.0, update_wgl);
		slider_water_height = UserInterface.add_slider('Hauteur de l\'eau', 0.0, 100.0, 40.0, update_wgl);
		UserInterface.end_use();
		
		// LIGHTING
		UserInterface.use_field_set('H', "Lighting");
		UserInterface.use_field_set('H', "Position");
		slider_light_x  = UserInterface.add_slider('X ', -100, 100, 0, update_wgl);
		UserInterface.set_widget_color(slider_light_x,'#ff0000','#ffcccc');
		slider_light_y  = UserInterface.add_slider('Y ', -100, 100, 0, update_wgl);
		UserInterface.set_widget_color(slider_light_y,'#00bb00','#ccffcc');
		slider_light_z  = UserInterface.add_slider('Z ', -100, 100, -100, update_wgl);
		UserInterface.set_widget_color(slider_light_z, '#0000ff', '#ccccff');
		UserInterface.end_use();
		slider_light_intensity  = UserInterface.add_slider('intensity', 0, 100, 40, update_wgl);
		UserInterface.end_use();

	UserInterface.end();
	
	// Create and initialize a shader program // [=> Sylvain's API - wrapper of GL code]
	terrainShader = ShaderProgram(terrain_vert, terrain_frag, 'terrain shader');
	waterShader = ShaderProgram(water_vert, water_frag, 'water shader');

	// Build meshes
	buildTerrainMesh();
	
	envMapTex = TextureCubeMap();
	envMapTex.load(["textures/skybox/skybox1/right.bmp","textures/skybox/skybox1/left.bmp",
	"textures/skybox/skybox1/top.bmp","textures/skybox/skybox1/bottom.bmp",
	"textures/skybox/skybox1/front.bmp","textures/skybox/skybox1/back.bmp"]).then(update_wgl);

	envMapShader = ShaderProgram(skybox_vert,skybox_frag,'sky');
	skybox_rend = Mesh.Cube().renderer(0, -1, -1);
	
	// -------------------------------------------------------------------
	// Offscreen Rendering for water refraction : FBO
	// -------------------------------------------------------------------

	// I) Texture

	const level = 0;
	const type = gl.UNSIGNED_BYTE;
	tex_refract = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, tex_refract);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fboTexWidth, fboTexHeight, 0, gl.RGBA, type, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

	gl.bindTexture(gl.TEXTURE_2D, null);

	// II) FBO

	fbo_refract = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo_refract);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex_refract, 0);

	let depthRenderBuffer = gl.createRenderbuffer();
	gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderBuffer);
	gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, fboTexWidth, fboTexHeight);
	gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRenderBuffer);
	gl.bindRenderbuffer(gl.RENDERBUFFER, null);
	
	gl.drawBuffers([gl.COLOR_ATTACHMENT0])

	
	// -------------------------------------------------------------------
	// Offscreen Rendering for water reflection : FBO
	// -------------------------------------------------------------------

	// I) Texture

	tex_reflect = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, tex_reflect);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fboTexWidth, fboTexHeight, 0, gl.RGBA, type, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

	gl.bindTexture(gl.TEXTURE_2D, null);

	// II) FBO

	fbo_reflect = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo_reflect);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex_reflect, 0);
	
	gl.drawBuffers([gl.COLOR_ATTACHMENT0])
	
	depthRenderBuffer = gl.createRenderbuffer();
	gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderBuffer);
	gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, fboTexWidth, fboTexHeight);
	gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRenderBuffer);
	gl.bindRenderbuffer(gl.RENDERBUFFER, null);
	
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	// -------------------------------------------------------------------
	// Distorsion and normal map texture for water
	// -------------------------------------------------------------------

	// I) Textures
	
	tex_distorsion = gl.createTexture();
	const imageDistorsion = new Image();
	imageDistorsion.src = 'textures/distortion_map.png';
    imageDistorsion.onload = () => {
		gl.bindTexture(gl.TEXTURE_2D, tex_distorsion);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageDistorsion);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	tex_normal = gl.createTexture();
	const imageNormal = new Image();
	imageNormal.src = 'textures/normal_map.png';
    imageNormal.onload = () => {
		gl.bindTexture(gl.TEXTURE_2D, tex_normal);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageNormal);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	gl.enable(gl.DEPTH_TEST);
}
//--------------------------------------------------------------------------------------------------------
// Render skybox
//--------------------------------------------------------------------------------------------------------
function draw_skybox(mode)
{
	envMapShader.bind();
	Uniforms.uProjectionViewMatrix = ewgl.scene_camera.get_matrix_for_skybox();
	Uniforms.TU = envMapTex.bind(0);
	Uniforms.uMode = mode;
	skybox_rend.draw(gl.TRIANGLES);
	gl.useProgram(null);
}

//--------------------------------------------------------------------------------------------------------
// Render terrain
//--------------------------------------------------------------------------------------------------------
function draw_terrain(mode)
{
	terrainShader.bind();

	let viewMatrix = ewgl.scene_camera.get_view_matrix();

	Uniforms.uTerrainElevation = slider_terrainElevation.value*0.2;
	// - camera
	Uniforms.uProjectionMatrix = ewgl.scene_camera.get_projection_matrix();
	Uniforms.uViewMatrix = viewMatrix;
	// - model matrix
	Uniforms.uModelMatrix = modelMatrix;
	let mvm = Matrix.mult(viewMatrix, modelMatrix);
	// - lighting
	Uniforms.uLightIntensity = slider_light_intensity.value/20;
	Uniforms.uLightPosition = mvm.transform(Vec3(slider_light_x.value, slider_light_y.value, slider_light_z.value));
	// - terrain
	Uniforms.ucolor_map = colorMap;
	Uniforms.uGridPrecision = gridPrecision;
	Uniforms.uGridSize = gridSize;
	Uniforms.uWaterHeight = slider_water_height.value/100;
	Uniforms.uMode = mode;

	// Bind "current" vertex array (VAO)
	gl.bindVertexArray(vaoTerrain);
	
	// Draw commands
	// - use method "drawElements(mode, count, type, indices)"
	gl.drawElements(gl.TRIANGLES, nbMeshIndices, gl.UNSIGNED_INT, 0);

	// Reset GL state(s)
	// - unbind vertex array
	gl.bindVertexArray(null);
	// - unbind shader program
	gl.useProgram(null);
}

//--------------------------------------------------------------------------------------------------------
// Render water
//--------------------------------------------------------------------------------------------------------
function draw_water()
{
	render_fbo();

	waterShader.bind();

	let viewMatrix = ewgl.scene_camera.get_view_matrix();

	// - camera
	Uniforms.uProjectionMatrix = ewgl.scene_camera.get_projection_matrix();
	Uniforms.uViewMatrix = viewMatrix;
	// - model matrix
	Uniforms.uModelMatrix = modelMatrix;

	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, tex_refract);
	Uniforms.uTexRefract = 0;

	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, tex_reflect);
	Uniforms.uTexReflect = 1;

	gl.activeTexture(gl.TEXTURE2);
	gl.bindTexture(gl.TEXTURE_2D, tex_distorsion);
	Uniforms.uTexDistorsion = 2;

	gl.activeTexture(gl.TEXTURE3);
	gl.bindTexture(gl.TEXTURE_2D, tex_normal);
	Uniforms.uTexNormal = 3;

	let mvm = Matrix.mult(viewMatrix, modelMatrix);
	// - lighting
	Uniforms.uLightIntensity = slider_light_intensity.value/20;
	Uniforms.uLightPosition = mvm.transform(Vec3(slider_light_x.value, slider_light_y.value, slider_light_z.value));
	
	var cameraInfo = ewgl.scene_camera.get_look_info();
	Uniforms.uCameraPosition = cameraInfo[0];
	Uniforms.uHeight = slider_water_height.value/100;
	Uniforms.uTime = ewgl.current_time;

	gl.bindVertexArray(vaoWater);
	gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);

	gl.bindVertexArray(null);
	gl.useProgram(null);
}
 
//--------------------------------------------------------------------------------------------------------
// appel les shader terrain/skybox en mode "screenshot"
//--------------------------------------------------------------------------------------------------------
function render_fbo()
{
	gl.viewport(0, 0, fboTexWidth, fboTexHeight);
	
	// I) refract
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo_refract);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	draw_skybox(2);
	draw_terrain(1);

	// II) reflect

	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo_reflect);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	draw_skybox(2);
	draw_terrain(2);

	// reset	
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
}

//--------------------------------------------------------------------------------------------------------
// Render scene
//--------------------------------------------------------------------------------------------------------
function draw_wgl()
{
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	draw_skybox(0);

	draw_terrain(0);

	draw_water();
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
