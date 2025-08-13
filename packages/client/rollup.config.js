import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/connector.ts',
  output: [
    {
      file: 'dist/connector.js',
      format: 'iife',
      name: 'LiveTSConnector'
    },
    {
      file: 'dist/connector.min.js',
      format: 'iife',
      name: 'LiveTSConnector',
      plugins: [terser()]
    },
    {
      file: 'dist/connector.esm.js',
      format: 'es'
    }
  ],
  plugins: [
    typescript({
      tsconfig: './tsconfig.json'
    })
  ]
};