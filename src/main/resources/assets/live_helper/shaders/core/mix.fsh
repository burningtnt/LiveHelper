#version 330 core

layout(std140) uniform DynamicTransforms {
    mat4 ModelViewMat;
    vec4 ColorModulator;
    vec3 ModelOffset;
    mat4 TextureMat;
};

uniform sampler2D input0;
uniform sampler2D input1;

in vec2 texCoord;
out vec4 fragColor;

void main() {
    vec4 p1 = texture(input0, texCoord);
    vec4 p2 = texture(input1, texCoord);
    float p = ColorModulator.a;
    fragColor = vec4(p1 * p + p2 * (1-p));
}