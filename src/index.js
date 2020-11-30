import FRAG_SHADER from "./line.fs";
import VERT_SHADER from "./line.vs";

const { push, splice } = Array.prototype;

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;

const createMesh = (numPointsPerLine, buffer = []) => {
  let numPrevPoints = 0;
  numPointsPerLine.forEach(numPoints => {
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
  }
};

const createLine = (
  regl,
  {
    projection = I,
    model = I,
    view = I,
    points = [],
    widths = [],
    color = [0.8, 0.5, 0, 1],
    width = 1,
    miter = 1,
    is2d = false,
    zPos2d = 0
  } = {}
) => {
  if (!regl) {
    console.error("Regl instance is undefined.");
    return;
  }

  let pointsFlat = points.flatMap(x => x);
  let numLines;
  let numPoints;
  let numPointsPerLine;
  let numPointsTotal;
  let pointsPadded;
  let pointsDup;
  let widthsDup;
  let indices;
  let pointBuffer;
  let widthBuffer;
  let attributes;
  let elements;
  let drawLine;
  let dim = is2d ? 2 : 3;

  const init = () => {
    pointBuffer = regl.buffer();

    widthBuffer = regl.buffer();

    attributes = {
      prevPosition: {
        buffer: () => pointBuffer,
        offset: 0,
        stride: FLOAT_BYTES * 3
      },
      currPosition: {
        buffer: () => pointBuffer,
        // note that each point is duplicated, hence we need to skip over the first two
        offset: FLOAT_BYTES * 3 * 2,
        stride: FLOAT_BYTES * 3
      },
      nextPosition: {
        buffer: () => pointBuffer,
        // note that each point is duplicated, hence we need to skip over the first four
        offset: FLOAT_BYTES * 3 * 4,
        stride: FLOAT_BYTES * 3
      },
      offsetScale: () => widthBuffer
    };

    elements = regl.elements();

    drawLine = regl({
      attributes,
      depth: { enable: !is2d },
      blend: {
        enable: true,
        func: {
          srcRGB: "src alpha",
          srcAlpha: "one",
          dstRGB: "one minus src alpha",
          dstAlpha: "one minus src alpha"
        }
      },
      uniforms: {
        projection: (context, props) => context.projection || props.projection,
        model: (context, props) => context.model || props.model,
        view: (context, props) => context.view || props.view,
        aspectRatio: ({ viewportWidth, viewportHeight }) =>
          viewportWidth / viewportHeight,
        color: () => color,
        width: ({ viewportWidth }) =>
          (width / viewportWidth) * window.devicePixelRatio,
        miter
      },
      elements: () => elements,
      vert: VERT_SHADER,
      frag: FRAG_SHADER
    });
  };

  const prepare = () => {
    if (numLines === 1 && points.length % dim > 0) {
      console.warn(
        `The length of points (${numPoints}) does not match the dimensions (${dim}). Incomplete points are ignored.`
      );
    }

    // Copy all points belonging to complete points
    pointsPadded = pointsFlat.slice(0, numPoints * dim);

    // Add the missing z point
    if (is2d) {
      pointsPadded = Buffer.increaseStride(pointsPadded, 2, 3, zPos2d);
    }

    if (widths.length !== numPoints)
      widths = new Array(numPoints + (numLines - 1) * 2).fill(1);

    let k = 0;
    numPointsPerLine.forEach(n => {
      // For each line, duplicate the first and last point.
      // E.g., [1,2,3] -> [1,1,2,3,3]
      // First, copy the last point to the end
      Buffer.copyElement(pointsPadded, k + n - 1, k + n - 1, 3);
      // Second, copy the first point to the beginning
      Buffer.copyElement(pointsPadded, k, k, 3);

      k += n + 2;
    });

    // duplicate each point for the positive and negative width (see below)
    pointsDup = new Float32Array(Buffer.duplicate(pointsPadded, 3));
    // duplicate each width such that we have a positive and negative width
    widthsDup = Buffer.duplicate(widths, 1, -1);
    // create the line mesh, i.e., the vertex indices
    indices = createMesh(numPointsPerLine);

    pointBuffer({
      usage: "dynamic",
      type: "float",
      // 3 because its a 3-vector and 2 because each point is duplicated
      length: numPointsTotal * 3 * 2 * FLOAT_BYTES,
      data: pointsDup
    });

    widthBuffer({
      usage: "dynamic",
      type: "float",
      // 1 because its a scalar and 2 because each width is duplicated
      length: numPoints * 1 * 2 * FLOAT_BYTES,
      data: widthsDup
    });

    elements({
      primitive: "triangles",
      usage: "dynamic",
      type: "uint16",
      data: indices
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
    view: newView
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

  const getPoints = () => points;

  const setPoints = (newPoints = [], newWidths = widths, newIs2d = is2d) => {
    points = newPoints;
    pointsFlat = points.flatMap(x => x);
    is2d = newIs2d;
    dim = is2d ? 2 : 3;

    numLines = Array.isArray(points[0]) ? points.length : 1;
    numPointsPerLine =
      numLines > 1
        ? points.map(pts => Math.floor(pts.length / dim))
        : [Math.floor(points.length / dim)];
    numPoints = numPointsPerLine.reduce((n, nPts) => n + nPts, 0);
    numPointsTotal = numPoints + 2 * numLines;

    if (newWidths.length === numPoints) widths = newWidths;

    if (points && numPoints > 1) {
      prepare();
    } else {
      clear();
    }
  };

  const getStyle = () => ({ color, miter, width });

  const setStyle = ({
    color: newColor,
    miter: newMiter,
    width: newWidth
  } = {}) => {
    if (newColor) color = newColor;
    if (newMiter) miter = newMiter;
    if (+newWidth > 0) width = newWidth;
  };

  const getBuffer = () => ({
    points: pointBuffer,
    widths: widthBuffer
  });

  const getData = () => ({
    points: pointsDup,
    widths: widthsDup
  });

  // initialize parameters
  init();

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
    setStyle
  };
};

export default createLine;
