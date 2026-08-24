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
  // Vitest's default Node environment resolves conditional exports through
  // Vite's SSR resolver. Solid's `node` condition points at its server runtime,
  // where render effects intentionally do not model persistent client-side
  // reactivity. Sting's renderer is a long-lived native client renderer, so its
  // integration tests must exercise Solid's browser/client runtime instead.
  ssr: {
    resolve: {
      conditions: ['browser', 'development', 'import', 'default'],
    },
  },
  build: {
    target: 'es2022',
    minify: false,
    lib: {
      entry: 'src/index.tsx',
      formats: ['iife'],
      name: 'StingHelloWorld',
      fileName: () => 'sting-app.js',
    },
  },
});
