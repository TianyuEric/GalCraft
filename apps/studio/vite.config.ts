import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  build: { license: { fileName: 'licenses/runtime.md' } },
  server: { watch: { ignored: ['**/dist-service/**', '**/dist-main/**', '**/dist-storybook/**'] } },
  plugins: [tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./renderer', import.meta.url)) } },
});
