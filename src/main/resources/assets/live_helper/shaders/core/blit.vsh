#version 150

layout(std140) uniform Projection {
    mat4 ProjMat;
};

in vec4 Position;
in vec2 UV0;
out vec2 texCoord;

void main() {
    vec4 outPos = ProjMat * vec4(Position.xy, 0.0, 1.0);
    gl_Position = vec4(outPos.xy, 0.2, 1.0);
    texCoord = UV0;
}