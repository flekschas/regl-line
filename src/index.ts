import { mat4 } from "gl-matrix";

import type {
	Attributes,
	Buffer,
	DrawCommand,
	Elements,
	Regl,
	Texture2D,
} from "regl";

const FRAGMENT_SHADER = `
precision mediump float;
varying vec4 color;
void main() {
  gl_FragColor = color;
}`;

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

  float len = width;

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
      len = width / dot(miter, perp);
      dir = tangent;
    } else {
      dir = dirA;
    }
  }

  vec2 normal = vec2(-dir.y, dir.x) * len;
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

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;

const isPositiveNumber = (n: number | undefined): n is number => {
	return n !== undefined && Number.isFinite(n);
};

const isNestedArray = (arr: number[][] | number[]): arr is number[][] => {
	return arr.length > 0 && Array.isArray(arr[0]);
};

const { push, splice } = Array.prototype;

const createMesh = (numPointsPerLine: number[], buffer: number[] = []) => {
	let numPrevPoints = 0;
	for (const numPoints of numPointsPerLine) {
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
	}
	return buffer;
};

function bufferDuplicate(buffer: number[], stride = 1, dupScale = 1) {
	const out: number[] = [];
	const component = new Array<number>(stride * 2);
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
}

function bufferCopyElement(
	buffer: number[],
	sourceElementIndex: number,
	targetIndex: number,
	stride: number,
) {
	const component = new Array(stride);
	const ai = sourceElementIndex * stride;
	// Copy source element component wise
	for (let i = 0; i < stride; i++) {
		component[i] = buffer[ai + i];
	}
	splice.call(buffer, targetIndex * stride, 0, ...component);
	return buffer;
}

function bufferIncreaseStride(
	buffer: number[],
	stride: number,
	newStride: number,
	undefValue = 0,
) {
	const out: number[] = [];
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

const createLine = (
	regl: Regl,
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
		miter = true,
		is2d = false,
		zPos2d = 0,
	}: Partial<{
		projection: Float32Array;
		model: Float32Array;
		view: Float32Array;
		points: number[][] | number[];
		colorIndices: number[];
		color: number[][] | number[];
		opacity: number | null;
		opacities: number[];
		width: number;
		widths: number[];
		miter: boolean;
		is2d: boolean;
		zPos2d: number;
	}> = {},
) => {
	if (!regl) {
		console.error("Regl instance is undefined.");
		return;
	}

	const pvm = new Float32Array(16);

	let numLines: number;
	let numPoints: number;
	let numPointsPerLine: number[];
	let pointsPadded: number[];
	let pointsDup: Float32Array;
	let colorIndicesDup: number[];
	let opacitiesDup: number[];
	let widthsDup: number[];
	let indices: number[];
	let pointBuffer: Buffer;
	let opacityBuffer: Buffer;
	let widthBuffer: Buffer;
	let colorTex: Texture2D;
	let colorTexRes: number;
	let colorIndexBuffer: Buffer;
	let attributes: Attributes;
	let elements: Elements;
	let drawLine: DrawCommand;
	let dim = is2d ? 2 : 3;

	const useOpacity = () =>
		+(opacities.length === numPoints || opacity !== null);

	const init = () => {
		// @ts-ignore
		pointBuffer = regl.buffer();
		// @ts-ignore
		opacityBuffer = regl.buffer();
		// @ts-ignore
		widthBuffer = regl.buffer();
		// @ts-ignore
		colorIndexBuffer = regl.buffer();

		attributes = {
			prevPosition: {
				// Typing issue in Regl
				buffer: (() => pointBuffer) as unknown as typeof pointBuffer,
				offset: 0,
				stride: FLOAT_BYTES * 3,
			},
			currPosition: {
				// Typing issue in Regl
				buffer: (() => pointBuffer) as unknown as typeof pointBuffer,
				// note that each point is duplicated, hence we need to skip over the first two
				offset: FLOAT_BYTES * 3 * 2,
				stride: FLOAT_BYTES * 3,
			},
			nextPosition: {
				// Typing issue in Regl
				buffer: (() => pointBuffer) as unknown as typeof pointBuffer,
				// note that each point is duplicated, hence we need to skip over the first four
				offset: FLOAT_BYTES * 3 * 4,
				stride: FLOAT_BYTES * 3,
			},
			opacity: {
				// Typing issue in Regl
				buffer: (() => opacityBuffer) as unknown as typeof opacityBuffer,
				// note that each point is duplicated, hence we need to skip over the first two
				offset: FLOAT_BYTES * 2,
				stride: FLOAT_BYTES,
			},
			offsetScale: {
				// Typing issue in Regl
				buffer: (() => widthBuffer) as unknown as typeof widthBuffer,
				// note that each point is duplicated, hence we need to skip over the first two
				offset: FLOAT_BYTES * 2,
				stride: FLOAT_BYTES,
			},
			colorIndex: {
				// Typing issue in Regl
				buffer: (() => colorIndexBuffer) as unknown as typeof colorIndexBuffer,
				// note that each point is duplicated, hence we need to skip over the first two
				offset: FLOAT_BYTES * 2,
				stride: FLOAT_BYTES,
			},
		};

		// @ts-ignore
		elements = regl.elements();

		drawLine = regl<
			// Uniforms
			{
				projectionViewModel: Float32Array;
				aspectRatio: number;
				colorTex: Texture2D;
				colorTexRes: number;
				colorTexEps: number;
				pixelRatio: number;
				width: number;
				useOpacity: number;
				useColorOpacity: number;
				miter: number;
			},
			Attributes,
			// Props
			{
				projection: Float32Array;
				model: Float32Array;
				view: Float32Array;
			},
			// Context
			{
				projection: Float32Array;
				model: Float32Array;
				view: Float32Array;
			}
		>({
			attributes,
			depth: { enable: !is2d },
			blend: {
				enable: true,
				func: {
					// biome-ignore lint/style/useNamingConvention: predefined property
					srcRGB: "src alpha",
					srcAlpha: "one",
					// biome-ignore lint/style/useNamingConvention: predefined property
					dstRGB: "one minus src alpha",
					dstAlpha: "one minus src alpha",
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
						mat4.multiply(pvm, view, model),
					) as Float32Array;
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
				useColorOpacity: () => Number(!useOpacity()),
				miter: Number(Boolean(miter)),
			},
			elements: () => elements,
			vert: VERTEX_SHADER,
			frag: FRAGMENT_SHADER,
		});
	};

	const prepare = () => {
		if (numLines === 1 && points.length % dim > 0) {
			console.warn(
				`The length of points (${numPoints}) does not match the dimensions (${dim}). Incomplete points are ignored.`,
			);
		}

		// Copy all points belonging to complete points
		pointsPadded = points.flat().slice(0, numPoints * dim);

		// Add the missing z point
		if (is2d) {
			pointsPadded = bufferIncreaseStride(pointsPadded, 2, 3, zPos2d);
		}

		if (colorIndices.length !== numPoints) {
			colorIndices = new Array(numPoints).fill(0);
		}

		if (widths.length !== numPoints) {
			widths = new Array(numPoints).fill(1);
		}

		const finalColorIndices = colorIndices.slice();
		const finalOpacities =
			opacities.length === numPoints
				? opacities.slice()
				: new Array<number>(numPoints).fill(opacity === null ? 1 : opacity);
		const finalWidths = widths.slice();

		let k = 0;
		for (const n of numPointsPerLine) {
			const lastPointIdx = k + n - 1;
			// For each line, duplicate the first and last point.
			// E.g., [1,2,3] -> [1,1,2,3,3]
			// First, copy the last point to the end
			bufferCopyElement(pointsPadded, lastPointIdx, lastPointIdx, 3);
			// Second, copy the first point to the beginning
			bufferCopyElement(pointsPadded, k, k, 3);

			bufferCopyElement(finalColorIndices, lastPointIdx, lastPointIdx, 1);
			bufferCopyElement(finalColorIndices, k, k, 1);
			bufferCopyElement(finalOpacities, lastPointIdx, lastPointIdx, 1);
			bufferCopyElement(finalOpacities, k, k, 1);
			bufferCopyElement(finalWidths, lastPointIdx, lastPointIdx, 1);
			bufferCopyElement(finalWidths, k, k, 1);

			k += n + 2;
		}

		// duplicate each point for the positive and negative width (see below)
		pointsDup = new Float32Array(bufferDuplicate(pointsPadded, 3));
		// duplicate each color, opacity, and width such that we have a positive
		// and negative width
		colorIndicesDup = bufferDuplicate(finalColorIndices);
		opacitiesDup = bufferDuplicate(finalOpacities);
		widthsDup = bufferDuplicate(finalWidths, 1, -1);
		// create the line mesh, i.e.,: number[] the vertex indices
		indices = createMesh(numPointsPerLine);

		pointBuffer({
			usage: "dynamic",
			type: "float",
			length: pointsDup.length * FLOAT_BYTES,
			data: pointsDup,
		});

		opacityBuffer({
			usage: "dynamic",
			type: "float",
			length: opacitiesDup.length * FLOAT_BYTES,
			data: opacitiesDup,
		});

		widthBuffer({
			usage: "dynamic",
			type: "float",
			length: widthsDup.length * FLOAT_BYTES,
			data: widthsDup,
		});

		colorIndexBuffer({
			usage: "dynamic",
			type: "float",
			length: colorIndicesDup.length * FLOAT_BYTES,
			data: colorIndicesDup,
		});

		elements({
			primitive: "triangles",
			usage: "dynamic",
			type: indices.length > 2 ** 16 ? "uint32" : "uint16",
			data: indices,
		});
	};

	const clear = () => {
		destroy();
		init();
	};

	const destroy = () => {
		points = [];
		pointsPadded = [];
		pointsDup = new Float32Array();
		widthsDup = [];
		indices = [];
		pointBuffer.destroy();
		widthBuffer.destroy();
		elements.destroy();
	};

	const draw = ({
		projection: newProjection,
		model: newModel,
		view: newView,
	}: Partial<{
		projection: Float32Array;
		model: Float32Array;
		view: Float32Array;
	}> = {}) => {
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

	const getPerPointProperty = (property: number[], newValues: number[]) => {
		const flatValues = newValues.flat(2);

		if (flatValues.length === numPoints) {
			return flatValues;
		}

		if (flatValues.length === numLines) {
			return numPointsPerLine.flatMap((n, i) => Array(n).fill(flatValues[i]));
		}

		return property;
	};

	const getPoints = () => points;

	const setPoints = (
		newPoints: number[][] | number[] = [],
		{
			colorIndices: newColorIndices = colorIndices,
			opacities: newOpacities = opacities,
			widths: newWidths = widths,
			is2d: newIs2d = is2d,
		} = {},
	) => {
		points = newPoints;
		is2d = newIs2d;
		dim = is2d ? 2 : 3;

		numLines = isNestedArray(points) ? points.length : 1;
		numPointsPerLine = isNestedArray(points)
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

	const createColorTexture = () => {
		const colors = isNestedArray(color) ? color : [color];

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

	const setColor = (newColor: number[], newOpacity = opacity) => {
		color = newColor;
		opacity = newOpacity;
		if (colorTex) {
			colorTex.destroy();
		}
		createColorTexture();
	};

	const getStyle = () => ({ color, miter, width });

	const setStyle = ({
		color: newColor,
		opacity: newOpacity,
		miter: newMiter,
		width: newWidth,
	}: Partial<{
		color: number[];
		opacity: number;
		miter: boolean;
		width: number;
	}> = {}) => {
		if (newColor) {
			setColor(newColor, newOpacity || opacity);
		}
		if (newMiter) {
			miter = Boolean(newMiter);
		}
		if (isPositiveNumber(newWidth)) {
			width = newWidth;
		}
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
