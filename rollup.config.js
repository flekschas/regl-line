import { terser } from 'rollup-plugin-terser';
import buble from 'rollup-plugin-buble';

const config = (file, format, plugins) => ({
  input: 'src/index.js',
  output: {
    name: 'createLine',
    format,
    file,
    globals: {
      regl: 'createREGL',
    },
  },
  plugins,
  external: ['regl'],
});

export default [
  config('dist/regl-line.js', 'umd', [buble()]),
  config('dist/regl-line.min.js', 'umd', [buble(), terser()]),
];
