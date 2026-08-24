import solidPlugin from '@solidjs/vite-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    solidPlugin({
      solid: {
        moduleName: '@stingjs/solid',
        generate: 'universal',
      },
    }),
  ],
  // Sting is a long-lived native client renderer, but Vitest's default Node
  // environment uses the SSR module runner. Solid exposes a `node` condition
  // that resolves to dist/server.js, so these packages must stay inside
  // Vitest/Vite's module graph and resolve with the browser condition instead
  // of being imported natively by Node.
  ssr: {
    resolve: {
      conditions: ['browser', 'development', 'import', 'default'],
    },
  },
  test: {
    server: {
      deps: {
        inline: ['solid-js', '@solidjs/universal'],
      },
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
