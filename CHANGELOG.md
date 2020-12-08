## v0.3.1

- Precalculate `projection * view * model` for speed

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
