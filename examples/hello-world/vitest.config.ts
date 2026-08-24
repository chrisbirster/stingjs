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
  test: {
    environment: 'node',
  },
});
