import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

export default defineConfig(({ mode }) => {
  const entry = mode === 'cli' ? 'cli' : mode === 'worker' ? 'worker-entry' : mode === 'compiler' ? 'compiler-utility' : mode === 'style' ? 'style-utility' : 'entry';
  const directory = ['compiler-utility', 'style-utility'].includes(entry) ? 'main' : 'service';
  return { build: { target: 'node22.12', outDir: 'dist-service/service', emptyOutDir: false, minify: false,
    license: { fileName: `licenses/${entry}.md` },
    lib: { entry: `${directory}/${entry}.mjs`, formats: ['es'], fileName: () => `${entry}.mjs` },
    rolldownOptions: { external: [/^node:/, ...builtinModules, 'electron', 'playwright', 'playwright-core', 'sharp', 'onnxruntime-node', '@resvg/resvg-js'],
      output: { codeSplitting: false, banner: "import { createRequire as __galcraftCreateRequire } from 'node:module'; const require = __galcraftCreateRequire(import.meta.url);" } },
  } };
});
