import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createId } from '@galcraft/contracts';
import type { Json, ProductionOperationSnapshot } from '@galcraft/contracts';
import type { SpeechLine } from '@galcraft/authoring/production';
import { studioFixture } from '../../stories/studio-fixture.js';
// Captured from the ordinary 0.1.0 plugin definition entry, including its actual bindings.
import snapshots from '../../stories/voice-operations-fixture.json';
import { ProductionSession } from './session.js';
import { DraftWorkstation } from './DraftWorkstation.js';
import { unwrap, type WorkbenchBridge } from './bridge.js';
import '../../authoring/shell.css';
import '../../authoring/workbench-production.css';
import './production.css';

type Model = { session: ProductionSession; services: ReturnType<typeof studioFixture>['services'] };
function Content({ model }: { model: Model }) {
  useSyncExternalStore(model.session.subscribe, model.session.snapshot);
  return <DraftWorkstation session={model.session} services={model.services} locale="zh-CN" busy={false} run={async action => { await action(); }} generated={() => {}} navigate={() => {}}/>;
}
function Example({ theme = 'light', mode = 'breezeClone', batch = true }: { theme?: 'light' | 'dark'; mode?: string; batch?: boolean }) {
  const [model, setModel] = useState<Model | null>(null);
  useEffect(() => {
    const { services } = studioFixture('normal', 'zh-CN', theme), bridge = services.bridge as unknown as WorkbenchBridge;
    let disposed = false, session: ProductionSession | undefined;
    void bridge.production.overview().then(result => {
      if (disposed) return;
      const data = unwrap(result), operations = snapshots as unknown as ProductionOperationSnapshot[];
      const operation = operations.find(value => value.id.endsWith(`/${mode}`))!;
      const projectId = data.tasks[0]!.projectId, connectionId = createId();
      data.operations = structuredClone(operations);
      data.connections = [{ ...data.connections[0]!, id: connectionId, name: '本机双引擎配音', providerKey: operation.definition.providerKey ?? undefined, protocol: 'comfyUI', baseUrl: 'http://127.0.0.1:8188', auth: 'none', credentialId: null, model: '公开节点图', purposes: operations.map(value => value.id as import('@galcraft/contracts').ExtensionOperationId), serverFileRoot: 'D:/ComfyUI/input' }];
      const audio = data.assets.find(asset => asset.kind === 'audio')!;
      audio.name = '角色参考录音（界面示例）';
      const character = data.characters[0]!;
      character.voicePresets = { zh: { id: createId(), revision: 1, locale: 'zh', connectionId, model: '公开节点图', voice: { kind: 'reference', assetId: audio.id, transcript: '这封信，我一直留到了今天。', locale: 'zh' }, speed: 1, emotion: null, advanced: {} } };
      session = new ProductionSession(bridge, projectId); session.data = data; session.newDraft('voice'); session.draft!.revision = 1;
      Object.assign(session.variant!, { operation: operation.id, operationSnapshot: structuredClone(operation), connectionId, model: '公开节点图', productionRecipeId: null, recipe: null, promptPreparation: null,
        fields: { ...Object.fromEntries(operation.definition.fields.map(field => [field.path, field.default])), text: '谢谢你还记得，那年夏天的约定。', voiceDescription: '年轻女性，温暖、清晰、自然的说话声。', performanceInstruction: '轻声开始，在“约定”上稍作停顿。' } });
      if (batch) {
        const lines: SpeechLine[] = ['谢谢你还记得，那年夏天的约定。', '下一站，我们一起去看海吧。'].map((text, index) => ({ id: createId(), sceneId: data.scenes[0]!.id, statementId: createId(), characterId: character.id, original: text, text, language: mode.startsWith('irodori') ? 'ja' : 'zh', voiceId: null, selected: true, ...(index ? { fields: { performanceInstruction: '带着期待，稍微快一点。' } } : {}) }));
        session.variant!.fields.speechLines = lines as unknown as Json;
      }
      setModel({ session, services });
    });
    return () => { disposed = true; session?.stop(); };
  }, [theme, mode, batch]);
  return <div data-theme={theme}><div id="studio-portals" data-theme={theme}/><div className="authoring-shell" style={{ display: 'block', height: '100vh', overflow: 'auto', background: 'var(--workbench-editor)' }}>{model && <Content model={model}/>}</div></div>;
}
const meta = { title: 'Product/Studio/Production/Voice operations', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SentenceClone: Story = {};
export const Dark: Story = { args: { theme: 'dark' } };
export const Design: Story = { args: { mode: 'breezeDesign', batch: false } };
export const Direction: Story = { args: { mode: 'breezeDirection', batch: false } };
export const Irodori: Story = { args: { mode: 'irodoriDirection', batch: true } };
