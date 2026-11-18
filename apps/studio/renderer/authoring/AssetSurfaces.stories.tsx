import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AssetTypeCatalogEntry, Result } from '@galcraft/contracts';
import { FixtureAsset, fixtureId } from '@galcraft/contracts/fixtures';
import { createAssetDirectory } from './asset-directory.js';
import { createAssetInspector, disposeAssetInspector } from './asset-inspector.js';
import { createAssetWorkbenchPreview } from './asset-workbench-preview.js';
import type { AssetQuery, AuthoringServices } from './controller.js';
import './shell.css';
import './assets-workbench.css';
import './workbench-production.css';

const ok = <T,>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const asset = structuredClone(FixtureAsset);
asset.name = '雨站 · 角色立绘与透明版本.png';
asset.folder = ['角色', '雨站'];
const fixed = fixtureId(0xea1);
const missing = fixtureId(0xeb1);
const scene = fixtureId(0xec1);
const statement = fixtureId(0xed1);
asset.variants = [2114416, 2288642].map((bytes, index) => {
  const variant = structuredClone(asset.variants[0]!);
  variant.metadata = { width: 1024, height: 1536 };
  variant.files[0]!.bytes = bytes;
  if (index) variant.id = fixed;
  return variant;
});
const types: AssetTypeCatalogEntry[] = (['image', 'audio', 'video'] as const).map((key, index) => ({
  descriptor: { key, contractVersion: 1, typeVersion: 1, title: key, description: '', icon: key,
    schema: true, fields: [], extensions: [], targets: ['web', 'windows'], resourceProviderKey: null, capabilities: [] }, provider: null, count: [26, 15, 4][index],
}));
const folderPaths = [['角色'], asset.folder, ['背景'], ['声音']];
const services = {
  assetTypeCatalog: async () => ok(types),
  bridge: { assets: { references: async () => ok([null, fixed, missing].map((variantId, index) => ({
    assetId: asset.id, variantId, owner: { kind: 'document', id: scene }, usage: 'figure', required: true,
    label: ['雨站重逢 · 立绘', '开场回忆 · 立绘', '旧版本记录 · 立绘'][index],
    ...(index < 2 ? { source: { documentId: scene, statementId: statement, revision: 3 } } : {}),
  }))) } },
  runtimeAssets: {
    resolveRuntime: async (_id: string, variantId: string) => ok({ leaseId: variantId,
      uri: variantId === fixed ? '/practice/figures/chatgpt-serious.png' : '/practice/figures/chatgpt-neutral.png', bytes: 0, mime: 'image/png' }),
    releaseRuntime: async () => ok(undefined),
  },
} as unknown as AuthoringServices;

function AssetSurfaces({ theme = 'light', locale = 'zh-CN', variant = 'active' }: {
  theme?: 'light' | 'dark'; locale?: string; variant?: 'active' | 'fixed' | 'missing';
}) {
  const directorySlot = useRef<HTMLDivElement>(null), previewSlot = useRef<HTMLDivElement>(null), inspectorSlot = useRef<HTMLDivElement>(null);
  const directory = useRef<ReturnType<typeof createAssetDirectory>>(null);
  const [query, setQuery] = useState<AssetQuery>({ kind: null, text: '', limit: 40, offset: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  useEffect(() => setSelected(variant === 'missing' ? missing : variant === 'fixed' ? fixed : null), [variant]);
  useEffect(() => {
    const view = createAssetDirectory(); directory.current = view;
    directorySlot.current?.replaceChildren(view.node);
    return view.dispose;
  }, []);
  useEffect(() => {
    directory.current?.render({ locale, query, catalog: types, folders: folderPaths, onScopeChange: change => setQuery(previous => ({ ...previous, ...change })) });
  }, [locale, query]);
  useEffect(() => {
    const preview = createAssetWorkbenchPreview(asset, selected, { locale, services,
      onBindDifference: (_asset, id) => setFeedback(id), onFollowActive: () => setSelected(null) });
    const inspector = createAssetInspector(asset, { locale, services, viewedVariantId: selected, selectVariant: setSelected,
      locate: source => setFeedback(source.statementId ?? source.documentId), preview: setSelected,
      rename: async name => setFeedback(name), reveal: () => setFeedback(asset.folder.join('/')), transparent: () => setFeedback(asset.id) });
    for (const image of inspector.querySelectorAll('img')) image.src = image.dataset.variantId === fixed
      ? '/practice/figures/chatgpt-serious.png' : '/practice/figures/chatgpt-neutral.png';
    if (inspectorSlot.current?.querySelector<HTMLDetailsElement>('.asset-inspector-references')?.open)
      inspector.querySelector<HTMLDetailsElement>('.asset-inspector-references')?.setAttribute('open', '');
    previewSlot.current?.replaceChildren(preview.node);
    inspectorSlot.current?.replaceChildren(inspector);
    preview.setActive(true);
    return () => { preview.dispose(); disposeAssetInspector(inspector); };
  }, [locale, selected]);
  return <div data-theme={theme} lang={locale} className="authoring-shell gc-workbench" style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, .7fr) minmax(0, 2fr) minmax(240px, 1fr)', height: '100vh' }}>
    <div ref={directorySlot} style={{ overflow: 'auto', background: 'var(--workbench-explorer)' }}/>
    <div ref={previewSlot} style={{ minWidth: 0, minHeight: 0 }}/>
    <div style={{ overflow: 'auto', background: 'var(--workbench-inspector)' }}><div ref={inspectorSlot}/><output>{feedback}</output></div>
  </div>;
}

const meta = { title: 'Product/Studio/Assets/Workbench', component: AssetSurfaces, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof AssetSurfaces>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ActiveVersion: Story = {};
export const FixedVersionDusk: Story = { args: { variant: 'fixed', theme: 'dark' } };
export const MissingVersion: Story = { args: { variant: 'missing', locale: 'en' } };
