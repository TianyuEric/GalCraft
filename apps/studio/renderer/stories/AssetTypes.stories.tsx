import { useEffect, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FixtureAsset } from '@galcraft/contracts/fixtures';
import type { Asset, AssetTypeEditInput } from '@galcraft/contracts';
import type { Contributions, PluginDefinition, AssetEditorContribution, AssetPreviewContribution } from '@galcraft/plugins/contracts';
import type { AuthoringServices } from '../authoring/controller.js';
import { createAssetInspector, disposeAssetInspector } from '../authoring/asset-inspector.js';
import { AssetUiHost, type AssetUiProvider } from '../pages/Plugins/asset-ui-host.js';
import '../authoring/shell.css';
import '../authoring/assets-workbench.css';

const kind = 'org.example.vector-shape/shape' as const;
const definition: PluginDefinition = { assetTypes: [{ key: kind, contractVersion: 1, typeVersion: 1, title: 'Vector shape', description: '', icon: 'shapes', schema: true, fields: [], extensions: ['.shape.json'], targets: ['web', 'windows'], resourceProviderKey: null, capabilities: ['visual'], editorKey: 'org.example.vector-shape/properties', previewKey: 'org.example.vector-shape/preview', collectReferences: () => [], rewriteReferences: value => ({ ok: true, value, warnings: [] }) }] };
const editor: AssetEditorContribution = { key: 'org.example.vector-shape/properties', assetType: kind, contexts: ['asset'], mount(root, context) {
  const label = document.createElement('label'), input = document.createElement('input'), button = document.createElement('button'), error = document.createElement('p');
  const value = context.value as { color: string; vertices: { x: number; y: number }[] }; input.ariaLabel = context.locale === 'en' ? 'Fill color' : context.locale === 'ja' ? '塗りつぶし色' : '填充颜色'; input.value = value.color;
  label.append(input.ariaLabel, input); error.setAttribute('role', 'alert'); button.className = 'studio-button'; button.textContent = context.locale === 'en' ? 'Apply type properties' : context.locale === 'ja' ? '種類のプロパティを適用' : '应用类型属性';
  button.onclick = async () => { if (!/^#[0-9a-f]{6}$/i.test(input.value)) { error.textContent = 'Color must use #rrggbb'; return; } await context.commit({ ...value, color: input.value }); };
  root.append(label); value.vertices.forEach((vertex, index) => { const text = document.createElement('p'); text.textContent = `Vertex ${index + 1}: ${vertex.x}, ${vertex.y}`; root.append(text); }); root.append(error, button);
} };
const preview: AssetPreviewContribution = { key: 'org.example.vector-shape/preview', assetType: kind, mount(root, context) {
  const value = context.variant.typeData!.value as { color: string; vertices: { x: number; y: number }[] }, canvas = document.createElement('canvas'); canvas.width = canvas.height = 512; canvas.style.width = '100%';
  const painter = canvas.getContext('2d')!; painter.fillStyle = value.color; painter.beginPath(); value.vertices.forEach((vertex, index) => index ? painter.lineTo(vertex.x / 2, vertex.y / 2) : painter.moveTo(vertex.x / 2, vertex.y / 2)); painter.closePath(); painter.fill(); root.append(canvas); return () => canvas.remove();
} };
const contributions = { assetEditors: [editor], assetPreviews: [preview] } as Contributions;

function AssetTypes({ locale = 'zh-CN', theme = 'light', missing = false, narrow = false }: { locale?: string; theme?: string; missing?: boolean; narrow?: boolean }) {
  const parent = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = parent.current!; let cancelled = false, dispose: (() => void) | undefined;
    void (async () => {
      let asset: Asset = { ...structuredClone(FixtureAsset), kind: 'org.example.vector-shape/shape', name: 'Triangle · 顶点与颜色', revision: 1 };
      asset.variants[0]!.typeData = { typeVersion: 1, provider: { id: 'org.example.vector-shape', version: '0.1.0' }, value: { vertices: [{ x: 80, y: 80 }, { x: 900, y: 80 }, { x: 450, y: 900 }], color: '#4477cc', texture: null } };
      if (cancelled) return;
      const provider = { manifest: { id: 'org.example.vector-shape', version: '0.1.0' }, definition, contributions, context: {} } as AssetUiProvider;
      const host = new AssetUiHost(() => missing ? [] : [provider], () => locale);
      const services = { assetUi: host, runtimeAssets: { resolveRuntime: async () => ({ ok: true, value: { uri: 'https://example.invalid/shape.json', leaseId: 'LeaseAA', bytes: 1, mime: 'application/json' }, warnings: [] }), releaseRuntime: async () => ({ ok: true, value: undefined, warnings: [] }) }, editAssetTypeData: async (input: AssetTypeEditInput) => {
        const variant = { ...structuredClone(asset.variants[0]!), id: `Version${asset.revision + 1}`, typeData: input.typeData };
        asset = { ...asset, revision: asset.revision + 1, activeVariantId: variant.id, variants: [...asset.variants, variant] };
        return { ok: true, value: { assetId: asset.id, variantId: variant.id, edit: {} }, warnings: [] };
      } } as unknown as AuthoringServices;
      let inspector: HTMLElement;
      const draw = () => { if (inspector) disposeAssetInspector(inspector); inspector = createAssetInspector(asset, { locale, services, rename: async () => {}, preview: () => {}, reveal: () => {}, transparent: () => {}, changed: async () => draw() }); container.replaceChildren(inspector); };
      draw(); dispose = () => { disposeAssetInspector(inspector); host.dispose(); container.replaceChildren(); };
    })();
    return () => { cancelled = true; dispose?.(); };
  }, [locale, theme, missing]);
  return <div data-theme={theme} className="authoring-shell" lang={locale} style={{ display: 'block', width: narrow ? 320 : 440, height: '100vh', overflow: 'auto', background: 'var(--workbench-inspector)', padding: 16 }}><div ref={parent}/></div>;
}
const meta = { title: 'Product/Studio/Authoring/Asset type extensions', component: AssetTypes, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof AssetTypes>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CustomType: Story = {};
export const DuskNarrow: Story = { args: { theme: 'dark', narrow: true } };
export const MissingProvider: Story = { args: { missing: true } };
export const English: Story = { args: { locale: 'en' } };
export const Japanese: Story = { args: { locale: 'ja', theme: 'dark' } };
