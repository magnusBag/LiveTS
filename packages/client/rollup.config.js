import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/connector.ts',
  output: [
    {
      file: 'dist/connector.js',
      format: 'iife',
      name: 'LiveTS'
    },
    {
      file: 'dist/connector.min.js',
      format: 'iife',
      name: 'LiveTS',
      plugins: [terser({
        compress: {
          passes: 2,
          drop_console: false,
          drop_debugger: true,
          pure_funcs: ['console.log'],
          unsafe_arrows: true,
          unsafe_methods: true
        },
        mangle: {
          properties: {
            regex: /^_/
          }
        }
      })]
    },
    {
      file: 'dist/connector.esm.js',
      format: 'es'
    }
  ],
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: false
    })
  ]
};