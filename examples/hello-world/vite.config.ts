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
  // Vitest runs in a Node/SSR environment by default. Vite externalizes
  // node_modules dependencies in that environment, which means Node resolves
  // Solid's conditional exports itself and selects solid-js/dist/server.js.
  //
  // Sting is a long-lived native *client* renderer. Keep Solid and its
  // universal renderer inside Vite's transform pipeline so the browser/client
  // condition is used consistently for both packages, without requiring a DOM
  // shim such as jsdom.
  ssr: {
    noExternal: ['solid-js', '@solidjs/universal'],
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
