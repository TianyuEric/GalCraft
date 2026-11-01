import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { DocumentView, Result } from '@galcraft/contracts';
import type { StudioContribution, StudioPluginContext } from '@galcraft/plugins/contracts';
import { configPath, createStudioPlugin, pluginId } from '../../../../../plugins/ai-epilogue/src/index.js';
import { mountStudioDialog } from './studio-dialog.js';
import '../../authoring/shell.css';
import './studio-plugins.css';

const characterId = '00000000-0000-4000-8000-000000000001', entryId = '00000000-0000-4000-8000-000000000002';
const view = (id: string, path: string, data: unknown): DocumentView => ({ documentId: id, revision: 1, savedRevision: 1,
  format: 'json', dirty: false, savedFiles: {}, files: { [path]: JSON.stringify({ schemaVersion: 1, documentId: id, revision: 1, data }) } });
const assetId = '00000000-0000-4000-8000-000000000003', removedId = '00000000-0000-4000-8000-000000000004';
const fixture = (empty: boolean, removed: boolean): DocumentView[] => empty ? [] : [
  view(characterId, `characters/${characterId}.json`, { id: characterId, name: '杏 · 春日来信的个人路线主角色', narrativeRole: 'main', personalRoute: { endingIds: ['an-ending'] } }),
  view(entryId, configPath, { entries: [{ id: entryId, characterId, title: '杏的夏日 · 雨停之后，我们再次相约', characterSetting: '喜欢雨天与旧书的杏。',
    startingPoint: '个人路线完结后的暑假。', publicFacts: ['已经共同旅行', '约好再次见面'], interactionRules: '聊暑假计划与最近读过的书。',
    endingCondition: '约定明天见面后结束。', unlockEndingIds: removed ? ['an-ending', 'old-ending'] : ['an-ending'], assetIds: removed ? [assetId, removedId] : [assetId] }] }),
  view(assetId, 'assets/index.json', { assets: [
    { id: assetId, name: '杏 · 夏日散步 / 雨停之后的旧书店 / 便服微笑立绘与长名称', kind: 'image' },
    { id: '00000000-0000-4000-8000-000000000005', name: '午后书店 · 窗边与雨后的街道', kind: 'image' },
    { id: '00000000-0000-4000-8000-000000000006', name: '夏日约定 · 轻柔钢琴', kind: 'audio' },
  ] }),
  { ...view('AB0001', 'scenes/AB0001/scene.json', { name: '杏 · 春日来信 · 再会结局' }), format: 'dsl', files: {
    'scenes/AB0001/scene.json': JSON.stringify({ data: { name: '杏 · 春日来信 · 再会结局' } }),
    'scenes/AB0001/script.gal': 'end {"endingId":"an-ending"} @AB0002;',
  } },
];
function PluginContributions({ locale = 'zh-CN', theme = 'light', empty = false, failure = false, removed = false }: {
  locale?: 'zh-CN' | 'en' | 'ja'; theme?: 'light' | 'dark'; empty?: boolean; failure?: boolean; removed?: boolean;
}) {
  const target = useRef<HTMLDivElement>(null);
  const toggle = useRef<() => void>(() => {}), [open, setOpen] = useState(true);
  useEffect(() => {
    const plugin = createStudioPlugin(), dialogs = new Set<{ dispose(): void }>();
    let mounted = true, contributions: StudioContribution[] = [], release: void | (() => void);
    const title = (item: StudioContribution) => item.title[locale];
    const context: StudioPluginContext = { pluginId, projectId: characterId, target: 'windows',
      documents: { list: async () => ({ ok: true, value: fixture(empty, removed), warnings: [] }), apply: async () => {
        const error = { code: 'EDIT_CONFLICT', severity: 'error' as const, owner: 'M02' as const,
          message: failure ? '作品内容已变化，请放弃草稿并重新读取。' : 'Storybook 只检查组件呈现；作品提交使用真实 Electron 验收。', related: [], actions: ['retry' as const] };
        return { ok: false, error, issues: [error] };
      } },
      open: async (key, input = null): Promise<Result<void>> => {
        const contribution = contributions.find(item => item.key === key);
        if (!contribution) throw new Error(key);
        const dialog = mountStudioDialog({ title: title(contribution), locale, disposed: () => dialogs.delete(dialog),
          mount: close => { const root = document.createElement('section'); const cleanup = contribution.mount(root, { ...context, locale, input, close });
            return { root, dispose: () => { if (typeof cleanup === 'function') cleanup(); root.remove(); } }; } });
        dialogs.add(dialog); return { ok: true, value: undefined, warnings: [] };
      },
    };
    void plugin.activateStudio(context).then(items => {
      contributions = items; if (!mounted) return;
      const mount = () => { release = items.find(item => item.key === `${pluginId}/authoring`)!.mount(target.current!, { ...context, locale, input: null, close() {} }); };
      let shown = true; mount(); setOpen(true);
      toggle.current = () => { if (shown) { if (typeof release === 'function') release(); } else mount(); shown = !shown; setOpen(shown); };
    });
    return () => { mounted = false; if (typeof release === 'function') release(); target.current?.replaceChildren();
      for (const dialog of dialogs) dialog.dispose(); void plugin.deactivate(); };
  }, [locale, empty, failure, removed]);
  return <div data-theme={theme}><div className="authoring-shell" data-locale={locale} style={{ display: 'block', height: '100vh', overflow: 'auto', background: 'var(--background)' }}>
    <div id="studio-portals" lang={locale} data-theme={theme} /><div style={{ padding: '8px 24px', fontSize: 12 }}><button type="button" onClick={() => toggle.current()}>{open ? 'Storybook: 暂时离开工作台' : 'Storybook: 返回工作台'}</button></div><div ref={target} className="studio-plugin-contribution" />
  </div></div>;
}
const meta = { title: 'Product/Studio/Plugins/Plugin contributions', component: PluginContributions,
  args: { locale: 'zh-CN', theme: 'light', empty: false, failure: false, removed: false }, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof PluginContributions>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AuthorSetup: Story = {};
export const JapaneseDark: Story = { args: { locale: 'ja', theme: 'dark' } };
export const Empty: Story = { args: { empty: true } };
export const EditConflict: Story = { args: { failure: true } };
export const RemovedReferences: Story = { args: { removed: true } };
export const EnglishErrors: Story = { args: { locale: 'en', failure: true, removed: true } };
export const JapaneseErrors: Story = { args: { locale: 'ja', theme: 'dark', failure: true, removed: true } };
