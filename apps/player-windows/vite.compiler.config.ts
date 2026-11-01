import { defineConfig } from 'vite';
export default defineConfig({ build: { target: 'node24', outDir: 'dist-compiler', lib: { entry: '../../packages/dsl/src/index.ts', formats: ['es'], fileName: () => 'compiler.mjs' }, minify: false } });
