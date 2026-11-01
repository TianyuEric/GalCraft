import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

export default defineConfig(({ mode }) => {
  const entry = mode === 'compiler' ? 'compiler-utility' : mode === 'style' ? 'style-utility' : 'main';
  return { build: { target: 'node24', outDir: 'dist-main/main', emptyOutDir: entry === 'main',
    license: { fileName: `licenses/${entry}.md` },
    lib: { entry: `main/${entry}.mjs`, formats: ['es'], fileName: () => `${entry}.mjs` },
    rolldownOptions: { external: [/^node:/, ...builtinModules, 'electron', 'sharp', 'onnxruntime-node'], output: {
      codeSplitting: false, banner: "import { createRequire as __galcraftCreateRequire } from 'node:module'; const require = __galcraftCreateRequire(import.meta.url);" } }, minify: false } };
});
