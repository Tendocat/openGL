
"use strict"

//--------------------------------------------------------------------------------------------------------
// VERTEX SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var vertexShader =
`#version 300 es

// INPUT
layout(location = 0) in vec3 position_in;
layout(location = 1) in vec3 normal_in;
layout(location = 2) in vec2 textureCoord_in;
layout(location = 3) in vec3 tangents_in;

// UNIFORM
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;

// OUTPUT
out vec2 texCoord;
out vec3 v_position;
out vec3 v_normal;
out mat3 TNB;

// MAIN PROGRAM
void main()
{
	vec3 normal = normal_in;
	vec3 tangent = tangents_in;
	vec3 bitangent = cross(normal, tangent);
	TNB = transpose(mat3(tangent, normal, bitangent));
	v_position = (uViewMatrix * vec4(position_in, 1.0)).xyz;
	texCoord = textureCoord_in;
	v_normal = normal;
    gl_Position = uProjectionMatrix * uViewMatrix * vec4(position_in, 1.0);
}
`;

//--------------------------------------------------------------------------------------------------------
// FRAGMENT SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var fragmentShader =
`#version 300 es
precision highp float;

#define M_PI 3.14159265358979

// INPUT
in vec2 texCoord;
in vec3 v_position;
in vec3 v_normal;
in mat3 TNB;

// OUPUT
out vec4 fragColor;

// UNIFORM
uniform sampler2D uDiffuseTexture;
uniform sampler2D uNormalMap;
uniform vec3 lightPos;
uniform float lightIntensity;
uniform int useNormMap;

// MAIN PROGRAM
void main()
{
	vec2 uv = texCoord*2.-1.;
	vec4 diffu = texture(uDiffuseTexture, uv);
	vec3 normal = v_normal;
	vec3 lightDir = normalize(lightPos - v_position);

	if (useNormMap == 1) {
		normal = normalize(texture(uNormalMap, uv).xyz*2.-1.);
		normal = normalize(TNB*normal);
		lightDir = normalize(TNB*lightDir);
	}

	float diffuseTerm = max(0.0, dot(normal, lightDir));
	vec4 Id = lightIntensity * diffu * diffuseTerm;
	Id = Id / M_PI;

    fragColor = Id;
}
`;

//--------------------------------------------------------------------------------------------------------
// GLOBAL VARIABLES
//--------------------------------------------------------------------------------------------------------

// Shader program
var shaderProgram = null;

// Textures
var diffuseTexture = null;
var normalMap = null;

// GUI
var slider_lightPosX = null;
var slider_lightPosY = null;
var slider_lightPosZ = null;
var slider_lightIntensity = null;
var chekbox_normalMap = null;
var radioButton_geometry = 0;

// Buffers of the mesh
var vs;
var uvs;
var tangents;
var vbo_tangents = null;

// Renderer
var grid_rend = Mesh.emptyRenderer();
var bunny_rend = Mesh.emptyRenderer();

//--------------------------------------------------------------------------------------------------------
// Initialize graphics objects and GL states
//--------------------------------------------------------------------------------------------------------
function init_wgl()
{
	// ANIMATIONS // [=> Sylvain's API]
	ewgl.continuous_update = true;

    // ======================== GUI ========================= 
    // ====================================================== 
    // DO NOT CHANGE

	UserInterface.begin();
		// LIGHT POSITION
		UserInterface.use_field_set('H', "LIGHT Position");
            slider_lightPosX = UserInterface.add_slider('X ', -100, 100, -80, update_wgl);
			slider_lightPosY = UserInterface.add_slider('Y ', -100, 100, -80, update_wgl);
			slider_lightPosZ = UserInterface.add_slider('Z ', -100, 100, 30, update_wgl);
		UserInterface.end_use();
		// LIGHT Intensity
		UserInterface.use_field_set('H', "LIGHT Intensity");
            slider_lightIntensity = UserInterface.add_slider('intensity', 0, 10, 6, update_wgl);
		UserInterface.end_use();
		// NORMAL MAP USE
		chekbox_normalMap = UserInterface.add_check_box('Normal mapping', false, update_wgl);
		// Geometry choice
		radioButton_geometry = UserInterface.add_radio("H", "Geometry", ["Grid", "Bunny"], 0, update_cam);
	UserInterface.end();
	
	// Create and initialize a shader program // [=> Sylvain's API - wrapper of GL code]
	shaderProgram = ShaderProgram(vertexShader, fragmentShader, 'basic shader');

    // ====================== GEOMETRY ====================== 
    // ====================================================== 
    // DO NOT CHANGE
	
    // 1) GRID
	let mesh = Mesh.Grid();
	// Get the vertices and texCoords buffers of the mesh
	vs = mesh.positions;
	uvs = mesh.texcoords;
	computeTangents(vs, uvs);
	grid_rend = mesh.renderer(0, 1, 2);
    // Update VAO with the tangents VBO (for normal mapping)
	grid_rend.vao = VAO([0, grid_rend.vao.vbos[0]], [1, grid_rend.vao.vbos[1]], [2, grid_rend.vao.vbos[2]], [3, vbo_tangents]);
	ewgl.scene_camera.set_scene_radius(mesh.BB.radius);
	ewgl.scene_camera.set_scene_center(mesh.BB.center);

	// 2) BUNNY
	Mesh.loadObjFile("ressources/bunny.obj").then((meshes) =>
	{
		let bunny_mesh = meshes[0];
		// Get the vertices and texCoords buffers of the mesh
		vs = bunny_mesh.positions;
		uvs = bunny_mesh.texcoords;
		computeTangents(vs, uvs);
		bunny_rend = bunny_mesh.renderer(0, 1, 2);
        // Update VAO with the tangents VBO (for normal mapping)
		bunny_rend.vao = VAO([0, bunny_rend.vao.vbos[0]], [1, bunny_rend.vao.vbos[1]], [2, bunny_rend.vao.vbos[2]], [3, vbo_tangents]);
	});

    // ====================== TEXTURES ====================== 
    // ====================================================== 

	// DIFFUSE TEXTURE
    diffuseTexture = gl.createTexture();
	const imageDiffuse = new Image();
	imageDiffuse.src = 'ressources/Pebbles_025_BaseColor.jpg';
    imageDiffuse.onload = () => {
		gl.bindTexture(gl.TEXTURE_2D, diffuseTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageDiffuse);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	// NORMAL MAP
    normalMap = gl.createTexture();
	const imageNormal = new Image();
	imageNormal.src = 'ressources/Pebbles_025_Normal.jpg';
    imageNormal.onload = () => {
		gl.bindTexture(gl.TEXTURE_2D, normalMap);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageNormal);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

		gl.bindTexture(gl.TEXTURE_2D, null);
	}

    // ====================================================== 
		
	// Set GL states
	gl.clearColor(0, 0, 0 ,1);
	gl.enable(gl.DEPTH_TEST);

	update_wgl;
}

function update_cam()
{
	if (radioButton_geometry.value == 0)
	{
		ewgl.scene_camera.set_scene_radius(2);
		ewgl.scene_camera.set_scene_center(Vec3(0, 0, 0));
	}
	else
	{
		ewgl.scene_camera.set_scene_radius(0.5);
		ewgl.scene_camera.set_scene_center(Vec3(0, 0.1, 0));
	}
}

// Function to compute the tangent of each triangle from the array of vertices and the array of texture coordinates
function computeTangents(vs, uvs)
{
	tangents = new Float32Array(vs.length);
	let nbVertices = vs.length / 3;
    for (let i = 0; i < nbVertices - 2; ++i)
	{
		let index = 0;
		// vertices of the triangle
		index = i * 3;
		let v0 = Vec3(vs[index], vs[index + 1], vs[index + 2]);
		index += 3;
		let v1 = Vec3(vs[index], vs[index + 1], vs[index + 2]);
		index += 3;
		let v2 = Vec3(vs[index], vs[index + 1], vs[index + 2]);
		// tex coords of the triangle
		index = i * 2;
		let uv0 = Vec2(uvs[index], uvs[index + 1]);
		index += 2;
		let uv1 = Vec2(uvs[index], uvs[index + 1]);
		index += 2;
		let uv2 = Vec2(uvs[index], uvs[index + 1]);

		// Edges of the triangle
        let e1 = v1.sub(v0); // E1.x, E1.y, E1.z
        let e2 = v2.sub(v0); // E2.x, E2.y, E2.z

        // UV delta
        let deltaUV1 = uv1.sub(uv0); // deltaUV1.x -> deltaUV1.x -- deltaUV1.y -> deltaUV1.y
        let deltaUV2 = uv2.sub(uv0); // deltaUV2.x -> deltaUV2.x -- deltaUV2.y -> deltaUV2.y

    	// ====================================================== 
    	// ====================================================== 
		// TODO : computation of the tangent T
		let Tx = (1 / (deltaUV1.x * deltaUV2.y - deltaUV2.x * deltaUV1.y)) * (deltaUV2.y * e1.x - deltaUV1.y * e2.x)
		let Ty = (1 / (deltaUV1.x * deltaUV2.y - deltaUV2.x * deltaUV1.y)) * (deltaUV2.y * e1.y - deltaUV1.y * e2.y)
		let Tz = (1 / (deltaUV1.x * deltaUV2.y - deltaUV2.x * deltaUV1.y)) * (deltaUV2.y * e1.z - deltaUV1.y * e2.z)
		let tangent = Vec3(Tx, Ty, Tz);
    	// ====================================================== 
    	// ====================================================== 

		// Set the same tangent for all three vertices of the triangle.
		index = i * 3;
        tangents[index] = tangent.x;
        tangents[index + 1] = tangent.y;
        tangents[index + 2] = tangent.z;
		index += 3;
		tangents[index] = tangent.x;
        tangents[index + 1] = tangent.y;
        tangents[index + 2] = tangent.z;
		index += 3;
		tangents[index] = tangent.x;
        tangents[index + 1] = tangent.y;
        tangents[index + 2] = tangent.z;
	}

	// set the VBO with the typed array containg the tangents
	vbo_tangents = VBO(tangents, 3);
}

//--------------------------------------------------------------------------------------------------------
// Render scene
//--------------------------------------------------------------------------------------------------------
function draw_wgl()
{
	// Clear the GL "color" and "depth" framebuffers
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	shaderProgram.bind();

	// ====================== UNIFORMS ====================== 
    // ====================================================== 
	
	// Light (A décommenter pour l'exo 2)
	Uniforms.lightPos = Vec3(slider_lightPosX.value, slider_lightPosY.value, slider_lightPosZ.value);
	Uniforms.lightIntensity = slider_lightIntensity.value;
    
	// Camera
	Uniforms.uProjectionMatrix = ewgl.scene_camera.get_projection_matrix();
	Uniforms.uViewMatrix = ewgl.scene_camera.get_view_matrix();
    
	// Diffuse texture
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, diffuseTexture);
	Uniforms.uDiffuseTexture = 0;
    
	if (chekbox_normalMap.checked)
	{
		Uniforms.useNormMap = true; // A décommenter pour l'exo 3

		// Normal Map texture
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, normalMap);
		Uniforms.uNormalMap = 1;
	}
	else
		Uniforms.useNormMap = false; // A décommenter pour l'exo 3

	// ====================== RENDERING =====================
    // ======================================================
    // DO NOT CHANGE
	if (radioButton_geometry.value == 0)
		grid_rend.draw(gl.TRIANGLES);
	else
		bunny_rend.draw(gl.TRIANGLES);

    // ====================================================== 
		
	// Reset GL state(s)
	unbind_vao();
	gl.useProgram(null);
	gl.bindTexture(gl.TEXTURE_2D, null);
}

ewgl.launch_3d();
