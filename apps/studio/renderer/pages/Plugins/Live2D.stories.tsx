import { useEffect, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createPlugin } from '../../../../../plugins/official-live2d/src/editor.js';
import type { AssetEditorContext, PluginContext } from '@galcraft/plugins/contracts';
import '../../authoring/shell.css';
import '../../authoring/workspace.css';
function Example({ theme = 'light', readonly = false }: { theme?: string; readonly?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const plugin = createPlugin(), abort = new AbortController(); let disposed = false;
    void plugin.activate({} as PluginContext).then(contributions => {
      if (disposed) return;
      contributions.assetEditors![0]!.mount(root.current!, {
        target: { kind: 'command', documentId: 'SceneN2', statementId: 'StatementN2', expectedRevision: 1, readonly },
        kind: 'live2d', typeData: { typeVersion: 1, provider: { id: 'org.galcraft.live2d', version: '0.1.0' }, value: {} },
        value: { lip: { mode: 'basic', gain: 1 } }, locale: 'zh-CN', signal: abort.signal,
        studio: {} as AssetEditorContext['studio'], onDispose() {}, commit: async () => ({ ok: true, value: undefined, warnings: [] }),
        resource: { assetId: 'ModelN2', variant: { id: 'VariantN2', parentId: null, role: 'group', entry: 'model.model3.json', files: [], metadata: {}, canvas: null, processing: null, targets: {},
          groupCapabilities: { resolver: 'org.galcraft.live2d/resource', resolverVersion: '0.1.0', format: 'live2d-model3', formatVersion: '3', capabilities: ['motion', 'expression', 'physics', 'amplitudeLip', 'motionSync'],
            parameters: [{ id: 'ParamAngleX', min: -30, max: 30, default: 0 }, { id: 'ParamMouthOpenY', min: 0, max: 1, default: 0 }], motions: [{ group: 'Idle', index: 0, name: '待机', durationMs: null }], expressions: ['微笑'], missingFiles: [] } } },
      });
    });
    return () => { disposed = true; abort.abort(); void plugin.deactivate(); root.current?.replaceChildren(); };
  }, [readonly]);
  return <div data-theme={theme}><main className="authoring-shell" data-theme={theme} style={{ display: 'block', height: '100vh', padding: 20, background: 'var(--background)', overflow: 'auto' }}>
    <section style={{ maxWidth: 420, background: 'var(--workbench-inspector)', padding: 16 }}><h2>Live2D 立绘</h2><div ref={root}/></section>
  </main></div>;
}
const meta = { title: 'Product/Studio/Plugins/Live2D plugin', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Inspector: Story = {};
export const InspectorDark: Story = { args: { theme: 'dark' } };
export const Readonly: Story = { args: { readonly: true } };
