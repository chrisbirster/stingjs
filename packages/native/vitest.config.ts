import { defineConfig } from 'vitest/config';

export default defineConfig({
  // @stingjs/native is a client/native renderer. Vitest's default node
  // environment otherwise resolves solid-js through its `node` condition,
  // which intentionally selects Solid's server runtime and does not exercise
  // client-side render-effect updates. Keep the Node test environment while
  // resolving the same reactive runtime used by Sting native bundles.
  ssr: {
    resolve: {
      conditions: ['browser', 'development', 'import', 'default'],
    },
  },
});
