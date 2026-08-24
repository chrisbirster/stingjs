import { fileURLToPath } from 'node:url';
import solidPlugin from '@solidjs/vite-plugin';
import { defineConfig } from 'vitest/config';

const solidClientRuntime = fileURLToPath(
  new URL('../../node_modules/solid-js/dist/dev.js', import.meta.url),
);

export default defineConfig(({ mode }) => ({
  plugins: [
    solidPlugin({
      solid: {
        moduleName: '@stingjs/solid',
        generate: 'universal',
      },
    }),
  ],
  // Sting is a long-lived native client renderer. Vitest runs in Node by
  // default, and Node selects Solid's SSR build through the `node` export
  // condition. For tests, bypass conditional exports entirely and point the
  // root `solid-js` import at the client development runtime. Keeping this
  // alias test-only means production/release builds continue to use normal
  // package resolution.
  resolve: {
    alias:
      mode === 'test'
        ? [
            {
              find: /^solid-js$/,
              replacement: solidClientRuntime,
            },
          ]
        : [],
  },
  test: {
    // Solid and the universal renderer must remain inside Vite's module graph
    // so imports made by workspace packages also see the test-only alias.
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
}));
