attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_uv;
varying vec4 v_color;
varying vec4 v_colorAdd;
void main() {
    v_uv = a_texCoord;
    v_color = vec4(1.0);
    v_colorAdd = vec4(0.0);
    gl_Position = vec4(a_position, 0.0, 1.0);
}