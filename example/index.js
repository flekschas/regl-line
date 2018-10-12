import createCamera from "canvas-orbit-camera";
import createRegl from "regl";
import fit from "canvas-fit";
import { mat4 } from "gl-matrix";

import createLine from "../src/index.js";

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

const canvas = document.getElementById("canvas");
const regl = createRegl(canvas);
const camera = createCamera(canvas);
const makeProjection = (viewportWidth, viewportHeight) =>
  mat4.perspective([], Math.PI / 2, viewportWidth / viewportHeight, 0.01, 1000);

//------------------------------------------------------------------------------
// Line creation
//------------------------------------------------------------------------------

// prettier-ignore
const lineSimple = createLine(regl, {
  width: 100,
  color: [1.0, 1.0, 1.0, 1.0],
  is2d: true,
  points: [
    -0.9, +0.9,
    +0.9, +0.9,
    +0.9, -0.9,
    -0.9, -0.9,
    -0.9, 0.85,
  ]
});

const scale = 20.0;
const model = mat4.fromScaling(mat4.create(), [scale, scale, 1.0]);

const line = createLine(regl, { width: 3, miter: 0 });
const extent = 20;
const numPoints = 200;
const points = polarCurve([], numPoints, t => Math.sin(2.5 * t) * extent);
const widths = new Array(numPoints)
  .fill(1)
  .map((v, i) => ((i + 1) * 4 * extent) / numPoints);

// Alter z
mapElement(points, 2, 3, (v, a, i) => (i / numPoints - 0.5) * extent);

line.setPoints(points, widths);

// Cached for animation
const pointDataSource = new Float32Array(line.getData().points);

//------------------------------------------------------------------------------
// Rendering
//------------------------------------------------------------------------------

regl.frame(({ tick, viewportWidth, viewportHeight }) => {
  regl.clear({
    color: [0, 0, 0, 1],
    depth: 1
  });
  // Update the camera
  camera.tick();
  // For pan and zoom
  const projection = makeProjection(viewportWidth, viewportHeight);
  const view = camera.view();
  // For animation
  mapElement(line.getData().points, 2, 3, (v, a, i) => {
    const start = pointDataSource[a];
    const offset = Math.sin(tick * 0.05 + Math.floor(i / 2) * 0.1) * 5;
    return start + offset;
  });
  line.getBuffer().points.subdata(line.getData().points, 0);
  // Finally, draw the line!
  line.draw({ projection, view });
  lineSimple.draw({ projection, model, view });
});

window.addEventListener("resize", fit(canvas), false);
