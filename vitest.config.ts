import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			engine: fileURLToPath(new URL('./src/engine', import.meta.url)),
			game: fileURLToPath(new URL('./src/game', import.meta.url)),
		},
	},
	test: {
		environment: 'node',
	},
});
