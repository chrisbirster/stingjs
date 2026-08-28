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
      entry: 'src/index.tsx',
      formats: ['iife'],
      name: 'StingNativeBenchmark',
      fileName: () => 'sting-benchmark.js',
    },
  },
});
