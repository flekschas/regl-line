const FRAGMENT_SHADER = `
precision mediump float;
uniform vec4 color;
void main() {
  gl_FragColor = color;
}`;

export default FRAGMENT_SHADER;
