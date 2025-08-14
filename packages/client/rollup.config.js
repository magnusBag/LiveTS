import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/connector.ts',
  output: [
    {
      file: 'dist/connector.js',
      format: 'iife',
      name: 'LiveTS',
      exports: 'named'
    },
    {
      file: 'dist/connector.min.js',
      format: 'iife',
      name: 'LiveTS',
      exports: 'named',
      plugins: [terser()]
    },
    {
      file: 'dist/connector.esm.js',
      format: 'es',
      exports: 'named'
    }
  ],
  plugins: [
    typescript({
      tsconfig: './tsconfig.json'
    })
  ]
};