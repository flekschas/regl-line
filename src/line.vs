// Vertex shader from https://mattdesl.svbtle.com/drawing-lines-is-hard
// The MIT License (MIT) Copyright (c) 2015 Matt DesLauriers
const VERTEX_SHADER = `
uniform mat4 projectionViewModel;
uniform float aspectRatio;

uniform sampler2D colorTex;
uniform float colorTexRes;
uniform float colorTexEps;
uniform float width;
uniform float useOpacity;
uniform float useColorOpacity;
uniform int miter;

attribute vec3 prevPosition;
attribute vec3 currPosition;
attribute vec3 nextPosition;
attribute float opacity;
attribute float offsetScale;
attribute float colorIndex;

varying vec4 color;

void main() {
  vec2 aspectVec = vec2(aspectRatio, 1.0);
  vec4 prevProjected = projectionViewModel * vec4(prevPosition, 1.0);
  vec4 currProjected = projectionViewModel * vec4(currPosition, 1.0);
  vec4 nextProjected = projectionViewModel * vec4(nextPosition, 1.0);

  // get 2D screen space with W divide and aspect correction
  vec2 prevScreen = prevProjected.xy / prevProjected.w * aspectVec;
  vec2 currScreen = currProjected.xy / currProjected.w * aspectVec;
  vec2 nextScreen = nextProjected.xy / nextProjected.w * aspectVec;

  // starting point uses (next - current)
  vec2 dir = vec2(0.0);
  if (currScreen == prevScreen) {
    dir = normalize(nextScreen - currScreen);
  }
  // ending point uses (current - previous)
  else if (currScreen == nextScreen) {
    dir = normalize(currScreen - prevScreen);
  }
  // somewhere in middle, needs a join
  else {
    // get directions from (C - B) and (B - A)
    vec2 dirA = normalize((currScreen - prevScreen));
    if (miter == 1) {
      vec2 dirB = normalize((nextScreen - currScreen));
      // now compute the miter join normal and length
      vec2 tangent = normalize(dirA + dirB);
      vec2 perp = vec2(-dirA.y, dirA.x);
      vec2 miter = vec2(-tangent.y, tangent.x);
      dir = tangent;
    } else {
      dir = dirA;
    }
  }

  vec2 normal = vec2(-dir.y, dir.x) * width;
  normal.x /= aspectRatio;
  vec4 offset = vec4(normal * offsetScale, 0.0, 0.0);
  gl_Position = currProjected + offset;

  // Get color from texture
  float colorRowIndex = floor((colorIndex + colorTexEps) / colorTexRes);
  vec2 colorTexIndex = vec2(
    (colorIndex / colorTexRes) - colorRowIndex + colorTexEps,
    colorRowIndex / colorTexRes + colorTexEps
  );

  color = texture2D(colorTex, colorTexIndex);
  color.a = useColorOpacity * color.a + useOpacity * opacity;
}`;

export default VERTEX_SHADER;
