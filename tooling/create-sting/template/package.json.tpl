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
    "@stingjs/core": "0.1.0",
    "@stingjs/native": "0.1.0",
    "@stingjs/solid": "0.1.0",
    "solid-js": "2.0.0-rc.1"
  },
  "devDependencies": {
    "@solidjs/vite-plugin": "3.0.0-next.29",
    "@stingjs/cli": "0.1.0",
    "typescript": "5.9.2",
    "vite": "8.2.2",
    "vitest": "4.1.0"
  },
  "engines": {
    "node": ">=22.12.0"
  }
}
