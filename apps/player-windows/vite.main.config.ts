import { defineConfig } from 'vite';
export default defineConfig({ build: { target: 'node24', outDir: 'dist-main', license: { fileName: 'licenses/host.md' }, lib: { entry: 'main/main.mjs', formats: ['es'], fileName: () => 'main.mjs' },
  rolldownOptions: { external: [/^node:/, 'electron'] }, minify: false } });
