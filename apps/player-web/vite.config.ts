import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { assetsDir: 'runtime', license: { fileName: 'licenses/runtime.md' } } });
