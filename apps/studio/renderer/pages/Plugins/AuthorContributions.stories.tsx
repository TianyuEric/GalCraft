import { useEffect, useMemo, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FieldSpec, Json, Result } from '@galcraft/contracts';
import type { DocumentContribution, StudioScope } from '@galcraft/plugins/contracts';
import { AuthorContributions, type AuthorContributionServices, type AuthorDocument } from './author-contributions.js';
import '../../authoring/shell.css';
import '../../authoring/workspace.css';
import './studio-plugins.css';

const ok = <T,>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const field = (path: string, type: FieldSpec['type'], value: Json, extra: Partial<FieldSpec> = {}): FieldSpec => ({ path, type, label: path === 'name' ? '称呼' : path === 'maxLength' ? '建议字数' : path === 'character' ? '角色' : path === 'enabled' ? '启用建议' : '备注', description: '', default: value, required: true, nullable: false, unit: 'none', group: 'basic', summary: true, keywords: [], ...extra });
const definition: DocumentContribution = { key: 'org.example.editor/config', titleKey: '文档配置', schema: { type: 'object' }, initial: { name: '夏日来信', enabled: true, character: 'CharAA', notes: [] },
  fields: [field('name', 'string', ''), field('enabled', 'boolean', true), field('character', 'ref', 'CharAA', { refKind: 'character' }), field('notes', 'array', [], { required: false, item: field('note', 'string', '') })],
  instances: 'multiple', stateVersion: 1, collectReferences: () => [], rewriteReferences: data => ok(data) };
function Example({ theme = 'light', locale = 'zh-CN', conflict = false, empty = false, multiple = false, pinTools = false }: { theme?: string; locale?: string; conflict?: boolean; empty?: boolean; multiple?: boolean; pinTools?: boolean }) {
  const workspaceNode = useRef<HTMLDivElement>(null), releases = useRef<(() => void)[]>([]);
  useEffect(() => () => releases.current.forEach(release => release()), []);
  const services = useMemo<AuthorContributionServices>(() => {
    const instances: AuthorDocument[] = empty ? [] : [{ documentId: 'DocAAA', revision: 1, stateVersion: 1, name: '角色称呼 · 窗边旧书店与雨后的街道', pluginId: 'org.example.editor', contributionKey: definition.key, data: definition.initial }];
    if (multiple) instances.push({ ...structuredClone(instances[0]!), documentId: 'DocBBB', name: '第二份角色配置' });
    const scope: StudioScope = { page: 'creation', sceneId: 'SceneA', documentId: 'SceneA', statementIds: ['LineAA', 'LineBB'], textRange: null, assetIds: [], insertion: null, versions: [{ ref: { kind: 'document', id: 'SceneA' }, revision: 4 }] };
    const failure = (): Result<void> => { const error = { code: 'EDIT_CONFLICT', severity: 'error' as const, owner: 'M02' as const, message: '来源版本已变化；本次提案与字段草稿保留，请重新读取来源。', related: [], actions: [] }; return { ok: false, error, issues: [error] }; };
    const tool = { key: 'org.example.editor/trim', titleKey: '台词整理 · 保留作者语气与既有角色事实', inputFields: [field('maxLength', 'integer', 80, { min: 10, max: 200, unit: 'none' })], run: async () => ok(null) };
    return {
      workspace: pinTools ? { open(_id, _title, mount) { let release = () => {}; const editor = mount(() => release(), () => {}); workspaceNode.current?.append(editor.node); release = () => { editor.dispose(); editor.node.remove(); }; releases.current.push(release); return release; } } : undefined,
      tools: () => empty ? [] : [{ tool, title: tool.titleKey, pluginId: 'org.example.editor', available: true, reason: '' }, { tool: { ...tool, key: 'org.example.editor/assets' }, title: '素材引用检查', pluginId: 'org.example.editor', available: false, reason: '请先选择素材' }],
      documentTypes: () => [{ definition, title: definition.titleKey!, pluginId: 'org.example.editor' }], scope: () => scope,
      references: async () => [{ kind: 'character', id: 'CharAA', name: '杏 · 春日来信' }, { kind: 'character', id: 'CharBB', name: '遥 · 雨后的街道' }], translate: (_pluginId, key) => key,
      editor: () => undefined,
      documents: { list: async () => ok(structuredClone(instances)), create: async (entry, name) => { instances.push({ ...instances[0], documentId: `DocAA${instances.length}`, revision: 1, stateVersion: 1, pluginId: entry.pluginId, contributionKey: entry.definition.key, name, data: entry.definition.initial }); return ok(undefined); },
        copy: async (document, name) => { instances.push({ ...structuredClone(document), documentId: `CopyA${instances.length}`, name }); return ok(undefined); }, remove: async document => { const index = instances.findIndex(item => item.documentId === document.documentId); instances.splice(index, 1); return ok(undefined); },
        update: async (document, data) => { if (conflict) return failure(); const item = instances.find(item => item.documentId === document.documentId)!; item.data = data; item.revision++; return ok(undefined); } },
      run: async (_entry, _input, _scope, signal) => { await new Promise(resolve => setTimeout(resolve, 350)); if (signal.aborted) return ok({ kind: 'none' }); return ok({ kind: 'edit', input: { label: '整理两条台词', origin: 'plugin', expected: scope.versions, preparedAssets: [], requiredRefs: [], patches: [{ kind: 'text', documentId: 'SceneA', edits: [{ start: 0, end: 12, before: '我们，我们明天见。', after: '我们明天见。' }, { start: 13, end: 25, before: '等雨停以后，我们再去旧书店。', after: '雨停后，我们再去旧书店。' }] }] } }); },
      apply: async () => conflict ? failure() : ok(undefined), locate: async () => ok(undefined), openProduction: async () => ok(undefined),
    };
  }, [conflict, empty, multiple, pinTools]);
  return <div data-theme={theme}><div id="studio-portals" data-theme={theme} lang={locale}/><main className="authoring-shell" data-theme={theme} style={{ display: 'block', minHeight: '100vh', height: 'auto', padding: 24, background: 'var(--background)', overflow: 'auto' }}><AuthorContributions services={services} locale={locale} documents/><div ref={workspaceNode}/></main></div>;
}
const meta = { title: 'Product/Studio/Plugins/Plugin author tools', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DocumentsAndTools: Story = {};
export const Dark: Story = { args: { theme: 'dark' } };
export const Conflict: Story = { args: { conflict: true } };
export const Empty: Story = { args: { empty: true } };
export const English: Story = { args: { locale: 'en' } };
export const JapaneseDark: Story = { args: { locale: 'ja', theme: 'dark' } };

export const Round2Documents: Story = { args: { multiple: true, conflict: true } };

export const Round2Tool: Story = { args: { pinTools: true, conflict: true } };
