# Regl Line

[![npm version](https://img.shields.io/npm/v/regl-line.svg)](https://www.npmjs.com/package/regl-line)
[![stability experimental](https://img.shields.io/badge/stability-experimental-orange.svg)](https://nodejs.org/api/documentation.html#documentation_stability_index)
[![build status](https://travis-ci.org/flekschas/regl-line.svg?branch=master)](https://travis-ci.org/flekschas/regl-line)
[![gzipped size](https://img.shields.io/badge/gzipped%20size-2.2%20KB-6ae3c7.svg)](https://unpkg.com/regl-line)
[![code style prettier](https://img.shields.io/badge/code_style-prettier-80a1ff.svg)](https://github.com/prettier/prettier)
[![regl-line demo](https://img.shields.io/badge/demo-online-f264ab.svg)](https://flekschas.github.io/regl-line/)

> A line creator for flat 2D and 3D lines.

<p align="center">
  <img src="https://flekschas.github.io/regl-line/teaser.gif" />
</p>

This small library is inspired by [Regl's line example](http://regl.party/examples?line) and Matt Deslauriers' [wonderful blog post on drawing lines in WebGL](https://mattdesl.svbtle.com/drawing-lines-is-hard).

## Install

```
npm -i regl-line
```

## Getting started

```javascript
import createRegl from "regl";
import createCamera from "canvas-orbit-camera";
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
  color: [0.8, 0.2, 0.0, 1.0],
  is2d: true,
  points: [-0.9, +0.9, +0.9, +0.9, +0.9, -0.9, -0.9, -0.9, -0.9, +0.85]
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

#### createLine(regl, options)

Create a line instance.

Args:

1. `regl` [regl]: Regl instance to be used for drawing the line.
2. `options` [object]: An object with the following props to customize the line creator.
   - `projection` [[mat4](http://glmatrix.net/docs/module-mat4.html)]: projection matrix (Defaut: _identity matrix_)
   - `model` [[mat4](http://glmatrix.net/docs/module-mat4.html)]: model matrix (Defaut: _identity matrix_)
   - `view` [[mat4](http://glmatrix.net/docs/module-mat4.html)]: view matrix (Defaut: _identity matrix_)
   - `points` [array]: flat list of coordinates alternating x,y if `is2d` is `true` or x,y,z. (Defaut: `[]`)
   - `widths` [array]: flat array of point-wise widths, i.e., the line width at every point. (Defaut: `[]`)
   - `color` [array]: a quadruple of floats (RGBA) ranging in [0,1] defining the color of the line. (Defaut: `[0.8, 0.5, 0, 1]`)
   - `width` [number]: uniform line width scalar. This number sets the base line width. (Defaut: `1`)
   - `miter` [boolean]: if `true` line segments are [miter joined](https://en.wikipedia.org/wiki/Miter_joint). (Defaut: `true`)
   - `is2d` [boolean]: if `true` points are expected to have only x,y coordinates otherwise x,y,z coordinates are expected. (Defaut: `false`)
   - `zPos2d` [number]: if `is2d` is `true` this value defines the uniform z coordinate. (Defaut: `0`)

Returns: `line` instance.

#### line.clear()

Clears all of the data to remove the drawn line.

#### line.destroy()

Destroys all related objects to free memory.

#### line.draw({ projection, model, view })

Draws the line according to the `projection`, `model`, and `view` matrices.

Args:

1 `options` [object]:
   - `projection` [[mat4](http://glmatrix.net/docs/module-mat4.html)]: projection matrix (Defaut: _identity matrix_)
   - `model` [[mat4](http://glmatrix.net/docs/module-mat4.html)]: model matrix (Defaut: _identity matrix_)
   - `view` [[mat4](http://glmatrix.net/docs/module-mat4.html)]: view matrix (Defaut: _identity matrix_)

#### line.getBuffer()

Get a reference to the point and width buffer object. This can be useful for efficient animations.

Returns: `{ points, widths }`. `points` and `widths` are [Regl buffers](http://regl.party/api#buffers).

#### line.getData()

Get a reference to the typed data arrays of the point and width buffer.

Returns: `{ points, widths }`. `points` and `widths` are [typed arrays](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays) containing the buffer data.

#### line.getPoints()

Get the original list of points defining the line.

Return: flat `array` of points

#### line.getStyle()

Get all the style settings.

Returns: `{ color, miter, width }`

#### line.setPoints(points, widths, is2d)

Set points defining the line, the point-wise widths, and change the dimensionality.

Args:

1. `points` [array]: flat list of coordinates alternating x,y if `is2d` is `true` or x,y,z.
2. `widths` [array]: flat array of point-wise widths, i.e., the line width at every point.
3. `is2d` [boolean]: if `true` points are expected to have only x,y coordinates otherwise x,y,z coordinates are expected.

#### line.setStyle({ color, miter, width })

Args:

1. `option` [object]:
   - `color` [array]: a quadruple of floats (RGBA) ranging in [0,1] defining the color of the line.
   - `width` [number]: uniform line width scalar. This number sets the base line width.
   - `miter` [boolean]: if `true` line segments are [miter joined](https://en.wikipedia.org/wiki/Miter_joint).
