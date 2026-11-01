import type { StorybookConfig } from '@storybook/react-vite';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const config: StorybookConfig = {
  staticDirs: [...['backgrounds', 'figures', 'music', 'ui', 'voice'].map(directory => ({ from: `../resources/practice/${directory}`, to: `/practice/${directory}` })), '../public'],
  stories: ['../renderer/**/!(PropertyComparison|TreeComparison).stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-mcp'],
  framework: '@storybook/react-vite',
  features: { componentsManifest: true },
  core: { disableTelemetry: true },
  viteFinal: async config => mergeConfig(config, {
    server: { watch: { ignored: ['**/dist-storybook/**', '**/dist-service/**', '**/dist-main/**', '**/resources/practice/**'] } },
    resolve: { alias: [
      { find: /^@galcraft\/player-ui$/, replacement: fileURLToPath(new URL('../../../packages/player-ui/src/index.ts', import.meta.url)) },
      { find: /^@galcraft\/runtime$/, replacement: fileURLToPath(new URL('../../../packages/runtime/src/index.ts', import.meta.url)) },
    ] },
    plugins: [tailwindcss(), {
      name: 'storybook-preview-engine-entry',
      apply: 'build',
      enforce: 'pre',
      buildStart() {
        this.emitFile({ type: 'chunk', id: fileURLToPath(new URL('../renderer/stories/preview-engine.ts', import.meta.url)), fileName: 'preview-engine.js', preserveSignature: 'strict' });
      },
      transform(source, id) {
        if (!id.replaceAll('\\', '/').endsWith('/stories/studio-fixture.ts')) return;
        return source.replace("new URL('./preview-engine.ts',import.meta.url).href", "new URL('./preview-engine.js',window.location.href).href");
      },
    }, {
      name: 'storybook-template-compiler-stub',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source === './compiler.js' && importer?.replaceAll('\\', '/').includes('/packages/templates/dist/')) {
          return fileURLToPath(new URL('./template-compiler-stub.ts', import.meta.url));
        }
      },
    }],
  }),
};

export default config;
