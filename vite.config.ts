import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
	plugins: [solid()],
	resolve: {
		alias: {
			engine: fileURLToPath(new URL('./src/engine', import.meta.url)),
			game: fileURLToPath(new URL('./src/game', import.meta.url)),
		},
	},
});
