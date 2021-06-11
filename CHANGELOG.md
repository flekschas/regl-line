## v1.0.0

- Update regl dependency to v2

## v0.4.4

- Fix an issue with the line width

## v0.4.3

- Fix an issue of shifted `colorIndices`, `opacities`, and `widths`.

## v0.4.2

- Expose opacities buffer via `getBuffer()` and the data via `getData()`

## v0.4.1

- An issue that caused `opacity` to be set to `undefined`

## v0.4.0

- Add `opacity` and `opacities` property. The `opacity` will override whatever you opacity have specified as the RGBA colors. `opacities` will in turn override `opacity` and allows you to adjust the opacity per line or line component.

## v0.3.1

- Pre-calculate `projection * view * model` for speed
- Fix an issue with the pixel ratio-aware line width

## v0.3.0

- Add support for multi-colored lines
- Add support for drawing large number of lines (this assumes you enabled the `OES_element_index_uint` [extension in Regl](https://github.com/regl-project/regl/blob/master/API.md#all-initialization-options))

**Breaking Changes:**

- `setPoints(points, widths, is2d)` changed to `setPoints(points, options = { colorIndices, widths, is2d })`

## v0.2.0

- Allow drawing multiple lines at once using `setPoints([[...],[...]])`

## v0.1.4

- Either use the project and view matrix from the context or props

## v0.1.3

- Enable alpha blending

## v0.1.2

- Multiply line width by `window.devicePixelRatio`

## v0.1.1

- Add missing shader files to the npm release

## v0.1.0

- First working version
