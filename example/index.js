import createRegl from 'regl';
import { mat4 } from 'gl-matrix';

import createLine from '../src';

//------------------------------------------------------------------------------
// Utilities
//------------------------------------------------------------------------------

const polarCurve = (buffer, howMany, polarFn) => {
  const thetaMax = Math.PI * 2;
  for (let i = 0; i < howMany; i++) {
    const theta = (i / (howMany - 1)) * thetaMax;
    const radius = polarFn(theta, i);
    const x = Math.cos(theta) * radius;
    const y = Math.sin(theta) * radius;
    buffer.push(x, y, 0);
  }
  return buffer;
};

const mapElement = (buffer, elementIndex, stride, map) => {
  for (let i = 0, il = buffer.length / stride; i < il; i++) {
    const index = elementIndex + i * stride;
    buffer[index] = map(buffer[index], index, i);
  }
  return buffer;
};

//------------------------------------------------------------------------------
// Init
//------------------------------------------------------------------------------

const canvas = document.getElementById('canvas');
const regl = createRegl(canvas);
// const camera = createCamera(canvas);
const makeProjection = (viewportWidth, viewportHeight) =>
  mat4.perspective([], Math.PI / 2, viewportWidth / viewportHeight, 0.01, 1000);

//------------------------------------------------------------------------------
// Line creation
//------------------------------------------------------------------------------

// prettier-ignore
const lineSimple = createLine(regl, {
  width: 100,
  color: [
    [0.75, 0.75, 0.75],
    [0.25, 0.25, 0.25]
  ],
  colorIndices: [0, 1, 0, 1],
  is2d: true,
  points: [
    // top line
    [
      -0.9, +0.95,
      +0.9, +0.95,
    ],
    // right line
    [
      +0.95, +0.9,
      +0.95, -0.9,
    ],
    // bottom line
    [
      +0.9, -0.95,
      -0.9, -0.95,
    ],
    // left line
    [
      -0.95, -0.9,
      -0.95, +0.9,
    ]
  ],
});

const scale = 20.0;
const numColors = 256;
const model = mat4.fromScaling(mat4.create(), [scale, scale, 1.0]);

const line = createLine(regl, {
  width: 3,
  miter: false,
  color: Array(numColors)
    .fill()
    .map((v, i) => [0.8, 0.5 - (i / 255) * 2, i / 255, 1]),
});
const extent = 20;
const numPoints = 256;
const points = polarCurve([], numPoints, (t) => Math.sin(2.5 * t) * extent);
const widths = new Array(numPoints).fill(1).map((v, i) => i / 2);
const colorIndices = new Array(numPoints).fill().map((v, i) => i);

// Alter z
mapElement(points, 2, 3, (v, a, i) => (i / numPoints - 0.5) * extent);

line.setPoints(points, { colorIndices, widths });

// Cached for animation
const pointSource = new Float32Array(line.getData().points);
const widthSource = new Float32Array(line.getData().widths);

//------------------------------------------------------------------------------
// Rendering
//------------------------------------------------------------------------------

const cycleWidths = (buffer, tick) => {
  const offset = Math.sin(tick * 0.05) / 2 + 1;
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = widthSource[i] * offset;
  }
};

const cycleColors = (buffer) => {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = (buffer[i] + 1) % numColors;
  }
};

const view = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
]);
console.log('view', view);

regl.frame(({ tick, viewportWidth, viewportHeight }) => {
  regl.clear({
    color: [0, 0, 0, 1],
    depth: 1,
  });
  // For pan and zoom
  const projection = makeProjection(viewportWidth, viewportHeight);
  lineSimple.draw({ projection, model, view });
  // For animation
  mapElement(line.getData().points, 2, 3, (v, a, i) => {
    const start = pointSource[a];
    const offset = Math.sin(tick * 0.05 + Math.floor(i / 2) * 0.1) * 5;
    return start + offset;
  });
  // This line ensures that the in-place manipulated `line.getData().points`
  // is picked up by regl
  line.getBuffer().points.subdata(line.getData().points, 0);
  cycleWidths(line.getData().widths, tick);
  line.getBuffer().widths.subdata(line.getData().widths, 0);
  cycleColors(line.getData().colorIndices, tick);
  line.getBuffer().colorIndices.subdata(line.getData().colorIndices, 0);
  line.draw({ projection, view });
});

const resizeCanvas = () => {
  const { height, width } = canvas.getBoundingClientRect();
  canvas.height = height * window.devicePixelRatio;
  canvas.width = width * window.devicePixelRatio;
};

window.addEventListener('resize', resizeCanvas, false);
window.addEventListener('orientationchange', resizeCanvas, false);

resizeCanvas();
