import solidPlugin from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    solidPlugin({
      solid: {
        moduleName: '@stingjs/solid',
        generate: 'universal',
      },
    }),
  ],
  build: {
    target: 'es2022',
    minify: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['iife'],
      name: 'StingSolid2Conformance',
      fileName: () => 'sting-solid2-conformance.js',
    },
  },
});
