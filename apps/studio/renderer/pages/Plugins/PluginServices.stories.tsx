import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FixtureAsset } from '@galcraft/contracts/fixtures';
import type { FieldSpec, Json, Result, StudioBridge } from '@galcraft/contracts';
import type { ProcessorCandidate } from '@galcraft/assets/processing';
import { ResourceProcessors, type ProcessorSummary } from './resource-processors.js';
import { ServiceConnections } from '../Production/ServiceConnections.js';
import type { ProductionSession } from '../Production/session.js';
import { PluginComponentProperties } from './component-properties.js';
import '../../authoring/shell.css';
import '../Production/production.css';
import './studio-plugins.css';

const field: FieldSpec = { path: 'strength', label: '处理强度', description: '调整本次处理的强度。', type: 'number', required: true, nullable: false, default: 1, min: .5, max: 2, unit: 'ratio', group: 'basic', summary: true, keywords: [] };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
function Example({ theme = 'light', locale = 'zh-CN', view = 'resources', failure = false }: { theme?: string; locale?: string; view?: 'resources' | 'connections' | 'component'; failure?: boolean }) {
  const fixture = useMemo(() => {
    const asset = structuredClone(FixtureAsset), candidates: ProcessorCandidate[] = [];
    asset.name = '午后旧书店 · 雨停后的街道'; const source = asset.variants.find(item => item.id === asset.activeVariantId)!;
    const variant = { ...structuredClone(source), id: 'VarAAA', parentId: source.id };
    candidates.push({ preparationId: 'PrepAA', assetId: asset.id, sourceVariantId: source.id, assetRevision: asset.revision, processorKey: 'org.example.media/brightness', packageVersion: '0.1.0', variant, metadata: { strength: 1.2 } });
    const summary: ProcessorSummary = { key: 'org.example.media/brightness', packageVersion: '0.1.0', inputKinds: ['image'], outputKinds: ['image'], supportsCancel: true, fields: [field] };
    const preview = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#b6d4f0"/><circle cx="610" cy="100" r="48" fill="#fff9d6"/><path d="M0 300 Q200 170 400 280 T800 270 V400 H0Z" fill="#709ac0"/><text x="32" y="360" fill="#163950" font-size="24">Storybook 资源处理候选示例</text></svg>');
    const fail = (): Result<never> => { const error = { code: 'RESOURCE_SOURCE_CHANGED', severity: 'error' as const, owner: 'M04' as const, message: '源素材已变化，请重新审阅或处理。候选已保留。', related: [], actions: [] }; return { ok: false, error, issues: [error] }; };
    const bridge = { get: async () => ok(asset), processorCatalog: async () => ok([summary]), resourceCandidates: async () => ok(structuredClone(candidates)),
      previewResource: async () => ok({ leaseId: 'LeaseA', uri: preview, mime: 'image/svg+xml', bytes: 0 }), releaseRuntime: async () => ok(undefined),
      processResource: async (_input: Json) => { await new Promise(resolve => setTimeout(resolve, 800)); return ok(candidates[0]); }, cancelResource: async () => ok(undefined),
      discardResource: async (id: string) => { candidates.splice(candidates.findIndex(item => item.preparationId === id), 1); return ok(undefined); },
      confirmResource: async () => failure ? fail() : ok({ operationId: 'OperAA', groupId: 'GroupA', documents: [], dirty: [], assetIds: [asset.id] }) } as unknown as StudioBridge['assets'];
    const data = { connections: [], workflows: [], tasks: [], drafts: [], candidates: [], recipes: [], canvas: { width: 1920, height: 1080 }, characters: [], pages: [], scenes: [], assets: [], versions: [],
      providers: [{ key: 'org.example.generation/localText', packageVersion: '1.2.0', purposes: ['text'], configFields: [{ ...field, path: 'model', label: '提供者模型', type: 'string', default: 'sample-text-v1', min: undefined, max: undefined, unit: 'none' }], capabilities: { query: true, refetch: true, cancelPerTask: false, resume: true } }] };
    const session = { data, connectionDirty: false, changed: () => {}, refresh: async () => {}, bridge: { connections: { save: async () => ok('ConnAA'), test: async () => ok({ status: 'unavailable', issues: [], models: [] }) }, production: { saveDefaults: async () => ok({ connections: {}, recipes: {} }) } } } as unknown as ProductionSession;
    return { asset, bridge, session };
  }, [failure]);
  return <div data-theme={theme}><div id="studio-portals" data-theme={theme} lang={locale}/><main className="authoring-shell" data-theme={theme} style={{ display: 'block', minHeight: '100vh', height: 'auto', padding: 24, background: 'var(--background)' }}>
    {view === 'resources' ? <ResourceProcessors bridge={fixture.bridge} selectedIds={[fixture.asset.id]} locale={locale} changed={async () => {}}/> : view === 'connections' ? <ServiceConnections session={fixture.session} locale={locale} editWorkflow={() => {}}/> : <PluginComponentProperties definition={{ key: 'org.example.ui/gauge', componentKey: 'relationship.gauge', publicParts: ['gauge.label', 'gauge.value'], fields: [field], propsSchema: { type: 'object' } }} initial={{ strength: 1 }} locale={locale} references={[]} apply={async () => ok(undefined)}/>}
  </main></div>;
}
const meta = { title: 'Product/Studio/Plugins/Plugin service consumers', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ResourceReview: Story = {};
export const ResourceConflict: Story = { args: { failure: true, theme: 'dark' } };
export const ProviderConnection: Story = { args: { view: 'connections' } };
export const ComponentProperties: Story = { args: { view: 'component' } };
