import { mat4 } from 'gl-matrix';

import FRAG_SHADER from './line.fs';
import VERT_SHADER from './line.vs';

const { push, splice } = Array.prototype;

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;

const createMesh = (numPointsPerLine, buffer = []) => {
  let numPrevPoints = 0;
  numPointsPerLine.forEach((numPoints) => {
    for (let i = 0; i < numPoints - 1; i++) {
      const a = numPrevPoints + i * 2; // `2`  because we duplicated all points
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      buffer.push(a, b, c, c, b, d);
    }
    // Each line adds an additional start and end point, hence, `numPoints + 2`
    // And again, since all points are duplicated, we have `* 2`
    numPrevPoints += (numPoints + 2) * 2;
  });
  return buffer;
};

const Buffer = {
  duplicate(buffer, stride = 1, dupScale = 1) {
    const out = [];
    const component = new Array(stride * 2);
    for (let i = 0, il = buffer.length / stride; i < il; i++) {
      const index = i * stride;
      for (let j = 0; j < stride; j++) {
        const value = buffer[index + j];
        component[j] = value;
        component[j + stride] = value * dupScale;
      }
      push.apply(out, component);
    }
    return out;
  },

  mapElement(buffer, elementIndex, stride, map) {
    for (let i = 0, il = buffer.length / stride; i < il; i++) {
      const index = elementIndex + i * stride;
      buffer[index] = map(buffer[index], index, i);
    }
    return buffer;
  },

  copyElement(buffer, sourceElementIndex, targetIndex, stride) {
    const component = new Array(stride);
    const ai = sourceElementIndex * stride;
    // Copy source element component wise
    for (let i = 0; i < stride; i++) component[i] = buffer[ai + i];
    splice.call(buffer, targetIndex * stride, 0, ...component);
    return buffer;
  },

  increaseStride(buffer, stride, newStride, undefValue = 0) {
    const out = [];
    const component = new Array(newStride).fill(undefValue);
    for (let i = 0, il = buffer.length / stride; i < il; i++) {
      const index = i * stride;
      for (let j = 0; j < stride; j++) {
        component[j] = buffer[index + j];
      }
      push.apply(out, component);
    }
    return out;
  },
};

const createLine = (
  regl,
  {
    projection = I,
    model = I,
    view = I,
    points = [],
    colorIndices = [],
    color = [0.8, 0.5, 0, 1],
    opacity = null,
    opacities = [],
    width = 1,
    widths = [],
    miter = 1,
    is2d = false,
    zPos2d = 0,
  } = {}
) => {
  if (!regl) {
    console.error('Regl instance is undefined.');
    return;
  }

  const pvm = new Float32Array(16);

  let numLines;
  let numPoints;
  let numPointsPerLine;
  let pointsPadded;
  let pointsDup;
  let colorIndicesDup;
  let opacitiesDup;
  let widthsDup;
  let indices;
  let pointBuffer;
  let opacityBuffer;
  let widthBuffer;
  let colorTex;
  let colorTexRes;
  let colorIndexBuffer;
  let attributes;
  let elements;
  let drawLine;
  let dim = is2d ? 2 : 3;

  const useOpacity = () =>
    +(opacities.length === numPoints || opacity !== null);

  const init = () => {
    pointBuffer = regl.buffer();
    opacityBuffer = regl.buffer();
    widthBuffer = regl.buffer();
    colorIndexBuffer = regl.buffer();

    attributes = {
      prevPosition: {
        buffer: () => pointBuffer,
        offset: 0,
        stride: FLOAT_BYTES * 3,
      },
      currPosition: {
        buffer: () => pointBuffer,
        // note that each point is duplicated, hence we need to skip over the first two
        offset: FLOAT_BYTES * 3 * 2,
        stride: FLOAT_BYTES * 3,
      },
      nextPosition: {
        buffer: () => pointBuffer,
        // note that each point is duplicated, hence we need to skip over the first four
        offset: FLOAT_BYTES * 3 * 4,
        stride: FLOAT_BYTES * 3,
      },
      opacity: {
        buffer: () => opacityBuffer,
        // note that each point is duplicated, hence we need to skip over the first two
        offset: FLOAT_BYTES * 2,
        stride: FLOAT_BYTES,
      },
      offsetScale: {
        buffer: () => widthBuffer,
        // note that each point is duplicated, hence we need to skip over the first two
        offset: FLOAT_BYTES * 2,
        stride: FLOAT_BYTES,
      },
      colorIndex: {
        buffer: () => colorIndexBuffer,
        // note that each point is duplicated, hence we need to skip over the first two
        offset: FLOAT_BYTES * 2,
        stride: FLOAT_BYTES,
      },
    };

    elements = regl.elements();

    drawLine = regl({
      attributes,
      depth: { enable: !is2d },
      blend: {
        enable: true,
        func: {
          srcRGB: 'src alpha',
          srcAlpha: 'one',
          dstRGB: 'one minus src alpha',
          dstAlpha: 'one minus src alpha',
        },
      },
      uniforms: {
        projectionViewModel: (context, props) => {
          const projection = context.projection || props.projection;
          const model = context.model || props.model;
          const view = context.view || props.view;
          return mat4.multiply(
            pvm,
            projection,
            mat4.multiply(pvm, view, model)
          );
        },
        aspectRatio: ({ viewportWidth, viewportHeight }) =>
          viewportWidth / viewportHeight,
        colorTex: () => colorTex,
        colorTexRes: () => colorTexRes,
        colorTexEps: () => 0.5 / colorTexRes,
        pixelRatio: ({ pixelRatio }) => pixelRatio,
        width: ({ pixelRatio, viewportHeight }) =>
          (width / viewportHeight) * pixelRatio,
        useOpacity,
        useColorOpacity: () => +!useOpacity(),
        miter,
      },
      elements: () => elements,
      vert: VERT_SHADER,
      frag: FRAG_SHADER,
    });
  };

  const prepare = () => {
    if (numLines === 1 && points.length % dim > 0) {
      console.warn(
        `The length of points (${numPoints}) does not match the dimensions (${dim}). Incomplete points are ignored.`
      );
    }

    // Copy all points belonging to complete points
    pointsPadded = points.flat().slice(0, numPoints * dim);

    // Add the missing z point
    if (is2d) {
      pointsPadded = Buffer.increaseStride(pointsPadded, 2, 3, zPos2d);
    }

    if (colorIndices.length !== numPoints)
      colorIndices = new Array(numPoints).fill(0);

    if (widths.length !== numPoints) widths = new Array(numPoints).fill(1);

    let finalColorIndices = colorIndices.slice();
    let finalOpacities =
      opacities.length === numPoints
        ? opacities.slice()
        : new Array(numPoints).fill(+opacity);
    let finalWidths = widths.slice();

    let k = 0;
    numPointsPerLine.forEach((n) => {
      const lastPointIdx = k + n - 1;
      // For each line, duplicate the first and last point.
      // E.g., [1,2,3] -> [1,1,2,3,3]
      // First, copy the last point to the end
      Buffer.copyElement(pointsPadded, lastPointIdx, lastPointIdx, 3);
      // Second, copy the first point to the beginning
      Buffer.copyElement(pointsPadded, k, k, 3);

      Buffer.copyElement(finalColorIndices, lastPointIdx, lastPointIdx, 1);
      Buffer.copyElement(finalColorIndices, k, k, 1);
      Buffer.copyElement(finalOpacities, lastPointIdx, lastPointIdx, 1);
      Buffer.copyElement(finalOpacities, k, k, 1);
      Buffer.copyElement(finalWidths, lastPointIdx, lastPointIdx, 1);
      Buffer.copyElement(finalWidths, k, k, 1);

      k += n + 2;
    });

    // duplicate each point for the positive and negative width (see below)
    pointsDup = new Float32Array(Buffer.duplicate(pointsPadded, 3));
    // duplicate each color, opacity, and width such that we have a positive
    // and negative width
    colorIndicesDup = Buffer.duplicate(finalColorIndices);
    opacitiesDup = Buffer.duplicate(finalOpacities);
    widthsDup = Buffer.duplicate(finalWidths, 1, -1);
    // create the line mesh, i.e., the vertex indices
    indices = createMesh(numPointsPerLine);

    pointBuffer({
      usage: 'dynamic',
      type: 'float',
      length: pointsDup.length * FLOAT_BYTES,
      data: pointsDup,
    });

    opacityBuffer({
      usage: 'dynamic',
      type: 'float',
      length: opacitiesDup.length * FLOAT_BYTES,
      data: opacitiesDup,
    });

    widthBuffer({
      usage: 'dynamic',
      type: 'float',
      length: widthsDup.length * FLOAT_BYTES,
      data: widthsDup,
    });

    colorIndexBuffer({
      usage: 'dynamic',
      type: 'float',
      length: colorIndicesDup.length * FLOAT_BYTES,
      data: colorIndicesDup,
    });

    elements({
      primitive: 'triangles',
      usage: 'dynamic',
      type: indices.length > 2 ** 16 ? 'uint32' : 'uint16',
      data: indices,
    });
  };

  const clear = () => {
    destroy();
    init();
  };

  const destroy = () => {
    points = null;
    pointsPadded = null;
    pointsDup = null;
    widthsDup = null;
    indices = null;
    pointBuffer.destroy();
    widthBuffer.destroy();
    elements.destroy();
  };

  const draw = ({
    projection: newProjection,
    model: newModel,
    view: newView,
  } = {}) => {
    // cache the view-defining matrices
    if (newProjection) {
      projection = newProjection;
    }
    if (newModel) {
      model = newModel;
    }
    if (newView) {
      view = newView;
    }
    // only draw when some points have been specified
    if (points && points.length > 1) {
      drawLine({ projection, model, view });
    }
  };

  const getPerPointProperty = (property, newValues) => {
    const flatNewValues = newValues.flat(2);

    if (flatNewValues.length === numPoints) {
      return flatNewValues;
    } else if (flatNewValues.length === numLines) {
      return numPointsPerLine
        .map((n, i) => Array(n).fill(flatNewValues[i]))
        .flat();
    }

    return property;
  };

  const getPoints = () => points;

  const setPoints = (
    newPoints = [],
    {
      colorIndices: newColorIndices = colorIndices,
      opacities: newOpacities = opacities,
      widths: newWidths = widths,
      is2d: newIs2d = is2d,
    } = {}
  ) => {
    points = newPoints;
    is2d = newIs2d;
    dim = is2d ? 2 : 3;

    numLines = Array.isArray(points[0]) ? points.length : 1;
    numPointsPerLine =
      numLines > 1
        ? points.map((pts) => Math.floor(pts.length / dim))
        : [Math.floor(points.length / dim)];
    numPoints = numPointsPerLine.reduce((n, nPts) => n + nPts, 0);

    colorIndices = getPerPointProperty(colorIndices, newColorIndices);
    opacities = getPerPointProperty(opacities, newOpacities);
    widths = getPerPointProperty(widths, newWidths);

    if (points && numPoints > 1) {
      prepare();
    } else {
      clear();
    }
  };

  const getNestedness = (arr, level = -1) => {
    if (!Array.isArray(arr)) return level;
    if (arr.length && !Array.isArray(arr[0])) return level + 1;
    return getNestedness(arr[0], ++level);
  };

  const createColorTexture = () => {
    const colors = getNestedness(color) === 0 ? [color] : color;

    colorTexRes = Math.max(2, Math.ceil(Math.sqrt(colors.length)));
    const rgba = new Uint8Array(colorTexRes ** 2 * 4);

    colors.forEach((color, i) => {
      rgba[i * 4] = Math.min(255, Math.max(0, Math.round(color[0] * 255))); // r
      rgba[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(color[1] * 255))); // g
      rgba[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(color[2] * 255))); // b
      rgba[i * 4 + 3] = Number.isNaN(+color[3])
        ? 255
        : Math.min(255, Math.max(0, Math.round(color[3] * 255))); // a
    });

    colorTex = regl.texture({
      data: rgba,
      shape: [colorTexRes, colorTexRes, 4],
    });
  };

  const setColor = (newColor, newOpacity = opacity) => {
    color = newColor;
    opacity = newOpacity;
    if (colorTex) colorTex.destroy();
    createColorTexture();
  };

  const getStyle = () => ({ color, miter, width });

  const setStyle = ({
    color: newColor,
    opacity: newOpacity,
    miter: newMiter,
    width: newWidth,
  } = {}) => {
    if (newColor) setColor(newColor, newOpacity);
    if (newMiter) miter = newMiter;
    if (+newWidth > 0) width = newWidth;
  };

  const getBuffer = () => ({
    points: pointBuffer,
    widths: widthBuffer,
    opacities: opacityBuffer,
    colorIndices: colorIndexBuffer,
  });

  const getData = () => ({
    points: pointsDup,
    widths: widthsDup,
    opacities: opacitiesDup,
    colorIndices: colorIndicesDup,
  });

  // initialize parameters
  init();
  createColorTexture();

  // prepare data if points are already specified
  if (points && points.length > 1) {
    setPoints(points);
  }

  return {
    clear,
    destroy,
    draw,
    getPoints,
    setPoints,
    getData,
    getBuffer,
    getStyle,
    setStyle,
  };
};

export default createLine;
