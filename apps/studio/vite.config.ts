/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  build: { license: { fileName: 'licenses/runtime.md' } },
  // Host tests write project, backup, and plugin data through the Windows filesystem.
  test: { maxWorkers: 4, testTimeout: 15_000 },
  server: { watch: { ignored: ['**/dist-service/**', '**/dist-main/**', '**/dist-storybook/**'] } },
  plugins: [tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./renderer', import.meta.url)) } },
});
