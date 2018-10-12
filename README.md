# Regl Line

[![npm version](https://img.shields.io/npm/v/regl-line.svg)](https://www.npmjs.com/package/regl-line)
[![stability experimental](https://img.shields.io/badge/stability-experimental-orange.svg)](https://nodejs.org/api/documentation.html#documentation_stability_index)
[![build status](https://travis-ci.org/flekschas/regl-line.svg?branch=master)](https://travis-ci.org/flekschas/regl-line)
[![code style prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![regl-line demo](https://img.shields.io/badge/demo-online-6ae3c7.svg)](https://flekschas.github.io/regl-line/)

> A line creator for flat 2D and 3D lines.

This small library is inspired by [Regl's line example](http://regl.party/examples?line) and Matt Deslauriers' [wonderful blog post on drawing lines in WebGL](https://mattdesl.svbtle.com/drawing-lines-is-hard).

## Install

```
npm -i regl-line
```

## Getting started

```javascript
import createRegl from "regl";
import createCamera from "canvas-camera-2d";
import createLine from "regl-line";

// Setup the canvas
const canvas = document.getElementById("canvas");
const { width, height } = canvas.getBoundingClientRect();
canvas.width = width * resize.scale;
canvas.height = height * resize.scale;

// Setup Regl
const regl = createRegl(canvas);
const camera = createCamera(canvas);

// Create a line
const lineSimple = createLine(regl, {
  width: 2,
  color: [0.3, 0.3, 0.3, 1.0],
  is2d: true,
  points: [-0.9, +0.9, +0.9, +0.9, +0.9, -0.9, -0.9, -0.9]
});

line.setPoints();

// Draw
regl.frame(() => {
  regl.clear({ color: [0, 0, 0, 1], depth: 1 });
  camera.tick();
  line.draw({ view: camera.view() });
});
```

See a complete example at [example/index.js](example/index.js).

## API

**createLine(regl, options)**
**line.clear()**
**line.destroy()**
**line.draw({ projection, model, view })**
**line.getBuffer()**
**line.getData()**
**line.getPoints()**
**line.getStyle()**
**line.setPoints(points, widths, is2d)**
**line.setStyle({ color, miter, width })**
