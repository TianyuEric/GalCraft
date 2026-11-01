import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within, waitFor } from 'storybook/test';
import type { AssetListIdentity, ProductionOperationSnapshot } from '@galcraft/contracts';
import type { AuthoringServices } from '../../authoring/controller.js';
import { studioFixture } from '../../stories/studio-fixture.js';
import { ProductionSession } from './session.js';
import { ExtensionOperationForm, type ProductionEditorHost } from './ExtensionOperationForm.js';
import type { WorkbenchBridge } from './bridge.js';
import {createDefinition} from '@galcraft/official-novelai/definition';
import {mountNovelAIEditor} from '@galcraft/official-novelai/editor';
import '../../authoring/shell.css';

const snapshot: ProductionOperationSnapshot = { id: 'org.story.clip/generate', version: 1, provider: { id: 'org.story.clip', version: '0.1.0' }, definition: { contractVersion: 1, id: 'org.story.clip/generate', version: 1, title: '视频操作输入示例', description: 'Storybook input transaction fixture', purpose: 'org.story.clip/generate', providerKey: 'org.story.clip/provider', fieldEditorKey: 'org.story.clip/input', fields: [{ path: 'duration', label: '时长（秒）', description: '', type: 'integer', required: true, nullable: false, default: 5, unit: 's', min: 1, max: 15, group: 'basic', summary: true, keywords: [] }], inputSchema: { type: 'object', required: ['duration'], properties: { duration: { type: 'integer', minimum: 1, maximum: 15 } }, additionalProperties: false }, inputs: [], outputs: [{ key: 'video', type: 'video', required: true, multiple: false, mimeTypes: ['video/mp4'] }], capabilities: { query: true, refetch: true, cancelPerTask: true, resume: true }, adoption: { kind: 'asset', assetKind: 'video', usages: ['background'] } } };
function Ready({ s, host, services, locale = 'zh-CN' }: { s: ProductionSession; host?: ProductionEditorHost; services: AuthoringServices; locale?: string }) {
  useSyncExternalStore(s.subscribe, s.snapshot); return <ExtensionOperationForm session={s} host={host} services={services} locale={locale}/>;
}
function Example({ dark = false, media = false, mediaFailure = false, longNames = false, novelai = false, prompt = false, locale = 'zh-CN' }: { dark?: boolean; media?: boolean; mediaFailure?: boolean; longNames?: boolean; novelai?:boolean; prompt?:boolean; locale?:'zh-CN'|'en'|'ja' }) {
  const [model, setModel] = useState<Parameters<typeof Ready>[0] | null>(null);
  useEffect(() => { let active = true; const services: AuthoringServices = studioFixture('normal', locale, dark ? 'dark' : 'light').services, bridge = services.bridge as unknown as WorkbenchBridge;
    bridge.production.saveDraft = async ({ draft }) => ({ ok: true, value: { ...structuredClone(draft), revision: draft.revision + 1 }, warnings: [] });
    const s = new ProductionSession(bridge, 'WorkAA'), definition=createDefinition().productionOperations!.find(value=>value.id.endsWith(prompt?'/prompt':'/image'))!, operation = novelai?{id:definition.id,version:definition.version,provider:{id:'org.galcraft.novelai',version:'0.1.0'},definition,messages:createDefinition().messages}:structuredClone(snapshot);
    if (media) {
      delete operation.definition.fieldEditorKey;
      operation.definition.title = '图片与音轨制作输入'; operation.definition.description = '图片与音轨各选一项，参考图集可以添加多个媒体。此场景使用 Storybook 素材与草稿服务。';
      operation.definition.inputs = [{ key: 'picture', type: 'image', required: true, multiple: false, mimeTypes: [] }, { key: 'soundtrack', type: 'audio', required: true, multiple: false, mimeTypes: [] }, { key: 'moodboard', type: 'image', required: false, multiple: true, mimeTypes: [] }];
      services.queryAssetPicker = async ({ context, query }) => {
        const response = await services.queryAssets({ kind: query.kind, text: query.search, offset: 0, limit: 100 });
        if (!response.ok) return response;
        const all = response.value.items, matching = all.filter(asset => context.allowedKinds.includes(asset.kind)), items = matching.slice(query.offset, query.offset + query.limit);
        const rows: AssetListIdentity[] = all.map(asset => { const variant = asset.variants.find(value => value.id === asset.activeVariantId)!; return { assetId: asset.id, revision: asset.revision, name: asset.name, kind: asset.kind, folder: asset.folder, character: null, sameNameCount: 1, sourceName: asset.sourceName, createdAt: asset.createdAt, shownVariant: { id: variant.id, role: variant.role, metadata: variant.metadata, active: true, currentBinding: context.currentAssetId === asset.id }, currentBindingMissing: false }; });
        return { ok: true, value: { items, rows, total: matching.length, offset: query.offset, indexRevision: 1, current: rows.find(row => row.assetId === context.currentAssetId) ?? null, currentMissing: false, applied: [], recentEntries: [], missingRecentIds: [], empty: matching.length ? null : 'filter' }, warnings: [] };
      };
      bridge.production.mediaInput = async input => {
        if (mediaFailure) { const error = { code: 'STORY_MEDIA_FAILED', severity: 'error' as const, owner: 'M04' as const, message: '参考媒体读取失败，请重试。', related: [], actions: ['retry' as const] }; return { ok: false, error, issues: [error] }; }
        const response = await services.getAsset!(input.assetId);
        if (!response.ok) return response;
        const asset = response.value!, variant = asset.variants.find(value => value.id === (input.variantId ?? asset.activeVariantId))!;
        return { ok: true, value: { assetId: asset.id, variantId: variant.id, candidateId: null, artifactIndex: null, localPath: `C:/storybook/${asset.sourceName}`, mime: variant.files[0]!.mime, kind: asset.kind }, warnings: [] };
      };
    }
    s.data.operations = [operation];
    const host: ProductionEditorHost = { mountProductionFieldEditor: (_operation, _key, root, target) => {
      if(novelai){const abort=new AbortController();const release=mountNovelAIEditor(root,{value:target.fields,locale,signal:abort.signal,studio:{} as never,target,commit:async()=>({ok:true,value:undefined,warnings:[]})});return ()=>{abort.abort();release();};}
      const label = document.createElement('label'), input = document.createElement('input'), save = document.createElement('button'), message = document.createElement('p'); input.type = 'number'; input.min = '1'; input.max = '15'; input.setAttribute('aria-label', '时长（秒）'); input.value = String(target.fields.duration); label.textContent = '时长（秒）'; label.append(input); save.textContent = '保存制作输入'; message.setAttribute('role', 'alert');
      save.onclick = () => { void target.commit({ expectedRevision: target.revision, fields: { duration: Number(input.value) }, references: [] }).then(result => { message.textContent = result.ok ? '制作草稿已保存' : result.error.message; }); }; root.append(label, save, message); return () => root.replaceChildren();
    } };
    void bridge.production.overview().then(async result => { if (result.ok) s.data.assets = result.value.assets.map(asset => longNames ? { ...asset, name: `${'用于长名称换行检查的参考素材'.repeat(12)} · ${asset.name}` } : asset); await s.openOperation(operation); if (active) setModel({ s, host: media ? undefined : host, services, locale }); }); return () => { active = false; s.stop(); };
  }, [dark, media, mediaFailure, longNames, novelai, prompt, locale]);
  return <div className="studio-root" data-theme={dark ? 'dark' : 'light'}><div id="studio-portals" data-theme={dark ? 'dark' : 'light'} lang="zh-CN"/><main className="authoring-shell" data-theme={dark ? 'dark' : 'light'} style={{ display: 'block', height: '100vh', overflow: 'auto', padding: 24 }}>{model && <Ready {...model}/>}</main></div>;
}
const meta = { title: 'Product/Studio/Production/Extension operation input', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Light: Story = { args: {}, play: async ({ canvasElement }) => { const canvas = within(canvasElement); const duration = await canvas.findByLabelText('时长（秒）'); await userEvent.clear(duration); await userEvent.type(duration, '8'); await userEvent.click(canvas.getByRole('button', { name: '保存制作输入' })); await waitFor(() => expect(canvas.getByLabelText('时长（秒）')).toHaveValue(8)); } };
export const Dark: Story = { args: { dark: true } };
export const Narrow: Story = { args: {}, globals: { viewport: { value: 'tablet', isRotated: false } } };
async function selectMedia(canvasElement: HTMLElement, key: string, index = 0) {
  const canvas = within(canvasElement), body = within(canvasElement.ownerDocument.body);
  await userEvent.click(canvas.getByRole('button', { name: new RegExp(`媒体 · ${key}$`) }));
  const dialog = await body.findByRole('dialog'), picker = within(dialog);
  const options = await within(picker.getByRole('listbox', { name: '可选素材' })).findAllByRole('option');
  await userEvent.click(options[index] ?? options[0]!);
  await userEvent.click(picker.getByRole('button', { name: /^应用$/ }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
}
const mediaPlay: NonNullable<Story['play']> = async ({ canvasElement }) => {
  delete canvasElement.dataset.mediaPlay;
  const canvas = within(canvasElement), body = within(canvasElement.ownerDocument.body);
  await canvas.findByRole('button', { name: '选择媒体 · picture' });
  await selectMedia(canvasElement, 'picture'); await selectMedia(canvasElement, 'soundtrack');
  await selectMedia(canvasElement, 'moodboard'); await selectMedia(canvasElement, 'moodboard', 1);
  await selectMedia(canvasElement, 'picture', 1);
  expect(within(canvas.getByRole('group', { name: /^picture/ })).getAllByRole('listitem')).toHaveLength(1);
  expect(within(canvas.getByRole('group', { name: /^soundtrack/ })).getAllByRole('listitem')).toHaveLength(1);
  expect(within(canvas.getByRole('group', { name: 'moodboard' })).getAllByRole('listitem')).toHaveLength(2);
  await userEvent.click(canvas.getByRole('button', { name: '移除 moodboard 1' }));
  expect(within(canvas.getByRole('group', { name: 'moodboard' })).getAllByRole('listitem')).toHaveLength(1);
  const replace = canvas.getByRole('button', { name: '替换媒体 · soundtrack' });
  await userEvent.click(replace); const dialog = await body.findByRole('dialog'); await userEvent.click(within(dialog).getByRole('button', { name: /^取消$/ }));
  await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument());
  expect(replace).toHaveFocus();
  expect(within(canvas.getByRole('group', { name: /^soundtrack/ })).getAllByRole('listitem')).toHaveLength(1);
  canvasElement.dataset.mediaPlay = 'passed';
};
export const MediaPorts: Story = { args: { media: true }, play: mediaPlay };
export const MediaPortsDark: Story = { args: { media: true, dark: true }, play: mediaPlay };
export const MediaPortsNarrow: Story = { args: { media: true }, globals: { viewport: { value: 'tablet', isRotated: false } }, play: mediaPlay };
export const MediaLongNames: Story = { args: { media: true, longNames: true }, globals: { viewport: { value: 'tablet', isRotated: false } }, play: mediaPlay };
export const MediaEmpty: Story = { args: { media: true } };
export const MediaFailure: Story = { args: { media: true, mediaFailure: true } };
export const NovelAIPrompt:Story={args:{novelai:true,prompt:true},play:async({canvas})=>{const instruction=await canvas.findByLabelText('画面要求');await userEvent.type(instruction,'双人在黄昏车站');await userEvent.tab();await waitFor(()=>expect(canvas.getByLabelText('画面要求')).toHaveValue('双人在黄昏车站'));}};
export const NovelAIImage:Story={args:{novelai:true},play:async({canvas})=>{await canvas.findByLabelText('基础提示');await canvas.findByRole('button',{name:'添加媒体 · references'});expect(canvas.getByRole('group',{name:'references'})).toBeInTheDocument();}};

export const NovelAIJapanese: Story = { args: { novelai: true, locale: 'ja' } };
export const NovelAIEnglish: Story = { args: { novelai: true, locale: 'en', dark: true } };
