import { useState } from 'react';
import { Boxes, FileImage, Group, LockKeyhole, Plus, Type } from 'lucide-react';
import { type BasicComponentKind, type PageConfig, type PageEditOperation } from '@galcraft/contracts';
import { BasicComponentCatalog, componentDefinition, components, createBasicComponent, insertPluginComponent, pluginComponentCatalog, readTemplateDocuments, templateEdit } from '@galcraft/templates';
import { CandidateButton, CandidateMenuButton, CandidateReviewDialog, CandidateSection, CandidateState } from '../components/controls/index.js';
import { CandidateObjectTree } from '../components/controls/object-tree.js';
import { type PageDesigner } from '../../../authoring/page-designer.js';
import { editPage, type PageStore } from './page-edit.js';
import { resultValue, workfaceError } from './workface-helpers.js';

const basicNames = { container: '容器', text: '文本', image: '图片', button: '按钮', decoration: '装饰', input: '输入框', slider: '滑杆', toggle: '开关', select: '选择器', tabs: '页签', list: '重复列表' };
type PluginComponents = Parameters<typeof pluginComponentCatalog>[0];
export type PageOutlineState = { designer: PageDesigner; page?: PageConfig; selection: string[]; editable: boolean; selectable?: boolean; plugins: PluginComponents; updated: () => void };

function basicAdd(page: PageConfig, selected: string | undefined, kind: BasicComponentKind): PageEditOperation[] {
  const component = createBasicComponent(kind, { name: basicNames[kind] });
  const primary = components(page.root).find(item => item.id === selected);
  const parent = primary && ['container', 'list', 'tab', 'button'].includes(componentDefinition(primary.part)?.kind ?? '') ? primary : page.root;
  component.layout.x = { unit: 'px', value: 40 };
  component.layout.y = { unit: 'px', value: 40 };
  if (parent.layout.mode !== 'absolute') component.layout.position = 'flow';
  if (parent.part === 'basic.tabs' && parent.options?.[0]) component.content.tabValue = parent.options[0].value;
  const edits: PageEditOperation[] = [];
  if (['input', 'slider', 'toggle', 'select', 'tabs'].includes(kind)) {
    const key = 'value_' + component.id.replaceAll('-', '');
    const value = kind === 'toggle' ? false : kind === 'slider' ? 50 : kind === 'select' || kind === 'tabs' ? 'first' : '';
    edits.push({ kind: 'page.update', pageId: page.id, localState: { ...page.localState, [key]: value } });
    component.bindings = { value: { source: 'local', path: key } };
    if (kind === 'select' || kind === 'tabs') component.options = [{ value: 'first', label: '第一项' }, { value: 'second', label: '第二项' }];
    if (kind === 'tabs') component.children = component.options!.map(option => {
      const child = createBasicComponent('text', { name: option.label });
      child.content = { text: option.label, tabValue: option.value };
      child.layout.position = 'flow';
      return child;
    });
  }
  if (kind === 'list') {
    component.layout.mode = 'column';
    component.repeat = { source: { source: 'data', path: 'characters' }, key: 'id', emptyText: '还没有角色' };
    const item = createBasicComponent('text', { name: '角色名称样板' });
    item.bindings = { text: { source: 'item', path: 'name' } };
    item.layout.position = 'flow';
    component.children.push(item);
  }
  edits.push({ kind: 'component.add', pageId: page.id, parentId: parent.id, component });
  return edits;
}

export function PageOutline({ store, outline, onStyle }: { store: PageStore; outline: PageOutlineState; onStyle: () => void }) {
  const { designer, page, selection, editable, selectable = editable, plugins, updated } = outline;
  const [fault, setFault] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string[]>();
  const all = page ? components(page.root) : [];
  const nodes = designer.workbenchComponents();
  const decorate = (items: typeof nodes): typeof nodes => items.map(item => {
    const part = all.find(component => component.id === item.id)?.part ?? '';
    const Icon = item.detail ? LockKeyhole : item.children ? Group : part.includes('image') ? FileImage : part.includes('text') ? Type : Boxes;
    return { ...item, icon: <Icon size={14} aria-hidden="true"/>, ...(item.children ? { children: decorate(item.children) } : {}) };
  });
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setFault('');
    try { await action(); } catch (reason) { setFault(workfaceError(reason)); }
    finally { setBusy(false); }
  };
  const apply = async (label: string, edits: PageEditOperation[]) => {
    const plan = await editPage(store, label, edits);
    if (plan.created.components[0]) {
      await designer.refresh();
      designer.selectComponents([plan.created.components[0]]);
    }
    updated();
  };
  const select = (ids: string[]) => { if (selectable) { designer.selectComponents(ids); updated(); } };
  const locked = (id: string) => all.find(component => component.id === id)?.locked;
  return <CandidateSection title="组件大纲" className="candidate-page-outline" scroll actions={editable && page && <CandidateMenuButton label="添加组件" disabled={busy} actions={[
    ...BasicComponentCatalog.map(({ componentKind }) => ({ id: componentKind, label: basicNames[componentKind], run: () => void run(async () => {
      const latest = readTemplateDocuments(store.host.list()).pages.find(item => item.id === page.id);
      if (!latest) throw new Error('页面已移除。');
      await apply('添加组件', basicAdd(latest, selection[0], componentKind));
    }) })),
    ...pluginComponentCatalog(plugins).map(definition => ({ id: definition.componentKey, label: definition.componentKey, group: '插件组件', run: () => void run(async () => {
      const documents = store.host.list(), template = readTemplateDocuments(documents);
      const latest = template.pages.find(item => item.id === page.id);
      if (!latest) throw new Error('页面已移除。');
      const target = components(latest.root).find(item => item.id === selection[0]) ?? latest.root;
      const inserted = insertPluginComponent(template, page.id, target.id, definition);
      resultValue(await store.applyEdit(templateEdit(documents, inserted.template, '添加插件组件')));
      await designer.refresh(); select([inserted.componentId]);
    }) })),
  ]}><Plus size={14}/>添加组件</CandidateMenuButton>}>
    {selectable ? <CandidateObjectTree label="页面组件" nodes={decorate(nodes)} selected={selection} onSelect={select}
      onRename={editable && page ? async (id, name) => {
        try { await editPage(store, '重命名组件', [{ kind: 'component.update', pageId: page.id, componentId: id, changes: { name } }]); }
        catch (reason) { return workfaceError(reason); }
      } : undefined}
      onMove={editable && page ? (ids, parentId) => void run(async () => {
        const valid = ids.filter(id => id !== page.root.id && !locked(id));
        if (valid.length) await apply('移动到容器', [{ kind: 'component.reparent', pageId: page.id, componentIds: valid, parentId }]);
      }) : undefined}
      menuActions={editable && page ? (node, scope) => [
        { id: 'scoped-style', label: '编辑作用域样式', run: onStyle },
        ...(node.id !== page.root.id && !locked(node.id) ? [
          { id: 'duplicate', label: '复制组件', run: () => void run(() => apply('复制组件', [{ kind: 'component.duplicate', pageId: page.id, componentId: node.id }])) },
          { id: 'remove', label: '删除组件', danger: true, run: () => setRemoving(scope.filter(id => id !== page.root.id && !locked(id))) },
        ] : []),
      ] : undefined}/>
      : <CandidateState kind="empty" title="正在预览页面" description="返回布局或行为模式即可编辑组件。"/>}
    {fault && <p role="alert" className="candidate-page-error">{fault}</p>}
    <CandidateReviewDialog open={!!removing?.length} title="删除组件" description={`将删除 ${removing?.length ?? 0} 个组件及其子项。`} busy={busy} onDismiss={() => setRemoving(undefined)}
      actions={<><CandidateButton disabled={busy} onClick={() => setRemoving(undefined)}>取消</CandidateButton><CandidateButton variant="danger" disabled={busy} onClick={() => {
        if (!page || !removing) return;
        void run(async () => {
          try { await apply('删除组件', [{ kind: 'component.remove', pageId: page.id, componentIds: removing }]); setRemoving(undefined); }
          catch (reason) { setFault(workfaceError(reason)); }
        });
      }}>删除组件</CandidateButton></>}>
      {fault && <p role="alert">{fault}</p>}
    </CandidateReviewDialog>
  </CandidateSection>;
}
