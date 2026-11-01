import { defineConfig } from 'vite';
export default defineConfig({ publicDir: false, define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: { target: 'es2022', outDir: 'dist-preview',
  license: { fileName: 'licenses/runtime.md' },
  lib: { entry: 'src/preview.ts', formats: ['es'], fileName: () => 'preview.mjs' } } });
