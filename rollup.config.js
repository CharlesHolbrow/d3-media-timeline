import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from 'rollup-plugin-babel';

export default {
  input: 'index.mjs',
  output: {
    file: 'build/d3-media-timeline.js',
    format: 'umd', // iife = browser, umd = browser/node
    name: 'MT',
  },
  plugins: [
    babel({
      exclude: 'node_modules/**'
    }),
    resolve({
      mainFields: ['module', 'main:jsnext', 'main'],
    }),
    commonjs({}),
  ],
}
