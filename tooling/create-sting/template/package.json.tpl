{
  "name": "__PROJECT_NAME__",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "postinstall": "sting modules sync",
    "build": "vite build",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@stingjs/core": "1.0.0-rc.1",
    "@stingjs/native": "1.0.0-rc.1",
    "@stingjs/solid": "1.0.0-rc.1",
    "solid-js": "2.0.0-rc.1"
  },
  "devDependencies": {
    "@solidjs/vite-plugin": "3.0.0-next.29",
    "@stingjs/cli": "1.0.0-rc.1",
    "@types/node": "^22.0.0",
    "typescript": "5.9.2",
    "vite": "8.2.2",
    "vitest": "4.1.11"
  },
  "engines": {
    "node": ">=22.12.0"
  },
  "overrides": {
    "seroval": "1.6.3",
    "source-map-js": "1.2.2"
  }
}
