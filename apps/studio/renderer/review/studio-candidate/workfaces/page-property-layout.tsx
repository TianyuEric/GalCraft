import { ArrowDown, ArrowUp, AlignStartVertical } from 'lucide-react';
import type { ComponentConfig, Layout, PageConfig, PageEditOperation } from '@galcraft/contracts';
import { componentDefinition, componentIsFree, components } from '@galcraft/templates';
import { designerComponentName } from '../../../authoring/designer-labels.js';
import { CandidateButton, CandidateSection, CandidateToolbar } from '../components/controls/index.js';
import { editPage } from './page-edit.js';
import { currentPropertyComponent, currentPropertyPage, PageChoiceField, PageNumberProperty, PagePropertyStatus, PageTextProperty, updateComponent, usePagePropertyAction, type ComponentChanges, type PagePropertySession } from './page-property-fields.js';

export type PagePropertyGeometry = { surface: HTMLElement; canvasWidth: number };
export function pagePlayerSurface(geometry?: PagePropertyGeometry) {
  const surface = geometry?.surface;
  return surface?.matches('.designer-player') ? surface : surface?.querySelector<HTMLElement>('.designer-player') ?? undefined;
}

export function pagePlayerComponent(surface: HTMLElement | undefined, id: string) {
  return surface?.querySelector<HTMLElement>(`[data-gc-component="${CSS.escape(id)}"]`);
}

function freePlacement(component: ComponentConfig, parent: ComponentConfig | undefined, geometry?: PagePropertyGeometry): Partial<Layout> {
  const surface = pagePlayerSurface(geometry);
  const stage = surface?.getBoundingClientRect();
  const target = pagePlayerComponent(surface, component.id)?.getBoundingClientRect();
  const parentFrame = parent && pagePlayerComponent(surface, parent.id)?.getBoundingClientRect();
  if (!geometry || !stage?.width || !target?.width || !target.height) return { position: 'free' };
  const scale = geometry.canvasWidth / stage.width;
  const base = parentFrame ?? stage;
  return { position: 'free', anchorX: 0, anchorY: 0,
    x: { unit: 'px', value: (target.left - base.left) * scale }, y: { unit: 'px', value: (target.top - base.top) * scale },
    width: { unit: 'px', value: target.width * scale }, height: { unit: 'px', value: target.height * scale } };
}

const positionOptions = [{ value: 'free', label: '自由定位' }, { value: 'flow', label: '跟随父容器' }] as const;
const modeOptions = [{ value: 'absolute', label: '自由排布' }, { value: 'row', label: '横排' }, { value: 'column', label: '纵排' }, { value: 'grid', label: '网格' }] as const;

export function PageComponentLayout({ session, page, component, name, selectedIds, geometry, locales }: {
  session: PagePropertySession; page: PageConfig; component: ComponentConfig; name: string;
  selectedIds: readonly string[]; geometry?: PagePropertyGeometry; locales: Record<string, Record<string, string>>;
}) {
  const { store } = session;
  const action = usePagePropertyAction();
  const nodes = components(page.root);
  const parent = nodes.find(node => node.children.some(child => child.id === component.id));
  const index = parent?.children.findIndex(child => child.id === component.id) ?? -1;
  const selected = nodes.filter(node => selectedIds.includes(node.id) && node.id !== page.root.id && !node.locked);
  const invalidParents = new Set(selected.flatMap(components).map(node => node.id));
  const parents = nodes.filter(node => !invalidParents.has(node.id) && (node === page.root || node.plugin || ['container', 'list', 'tab', 'button'].includes(componentDefinition(node.part)?.kind ?? '')));
  const kind = componentDefinition(component.part)?.kind;
  const canArrange = kind === 'container' || kind === 'list' || kind === 'tab';
  const locked = component.locked || action.busy;
  const read = () => currentPropertyComponent(store, page.id, component.id);
  const update = (changes: ComponentChanges) => updateComponent(store, page.id, component.id, changes, '调整组件布局');
  const changePosition = (position: 'free' | 'flow') => action.run(async () => {
    const currentPage = currentPropertyPage(store, page.id), current = read();
    if (current.locked) throw new Error('请先解锁组件。');
    const owner = components(currentPage.root).find(node => node.children.some(child => child.id === current.id));
    await update({ layout: position === 'free' ? freePlacement(current, owner, geometry) : { position } });
  });
  const changeMode = (mode: Layout['mode']) => action.run(async () => {
    const current = read();
    if (current.locked) throw new Error('请先解锁容器。');
    const operation = (id: string, layout: Partial<Layout>): PageEditOperation => ({ kind: 'component.update', pageId: page.id, componentId: id, changes: { layout } });
    const children = mode === 'absolute' ? current.children.filter(child => !componentIsFree(child)) : current.children;
    const operations = [operation(current.id, { mode })];
    for (const child of children) {
      const placement = mode === 'absolute' ? freePlacement(child, current, geometry) : { position: 'flow' as const };
      if (mode !== 'absolute' || placement.x) operations.push(operation(child.id, placement));
    }
    await editPage(store, '调整容器内部排布', operations);
  });
  const reorder = (offset: number) => action.run(async () => {
    const currentPage = currentPropertyPage(store, page.id), current = read();
    const owner = components(currentPage.root).find(node => node.children.some(child => child.id === current.id));
    const at = owner?.children.findIndex(child => child.id === current.id) ?? -1;
    if (current.locked || !owner || at + offset < 0 || at + offset >= owner.children.length) return;
    await editPage(store, '调整组件顺序', [{ kind: 'component.reorder', pageId: page.id, componentId: current.id, index: at + offset }]);
  });
  const align = () => action.run(async () => {
    const current = read(), eligible = components(currentPropertyPage(store, page.id).root).filter(node => selectedIds.includes(node.id) && !node.locked);
    if (!eligible.length) return;
    await editPage(store, '左对齐所选组件', eligible.map(node => ({ kind: 'component.update', pageId: page.id, componentId: node.id, changes: { layout: { x: current.layout.x } } })));
  });
  const number = (key: 'z' | 'gap' | 'columns', label: string, min?: number) => <PageNumberProperty session={session}
    name={`${component.id}/layout/${key}`} label={label} value={component.layout[key]} read={() => read().layout[key]}
    commit={value => update({ layout: { [key]: key === 'gap' ? value : Math.round(value) } })} min={min} disabled={locked}/>;

  return <CandidateSection title="容器与排列" collapsible initiallyOpen>
    <PageTextProperty session={session} name={`${component.id}/name`} label="实例名称" value={component.name ?? name} read={() => read().name ?? name}
      commit={value => update({ name: value })} disabled={action.busy}/>
    {parent && <PageChoiceField label="父容器" value={parent.id} disabled={locked || !selected.length}
      options={parents.map(node => ({ value: node.id, label: node === page.root ? '页面根容器' : designerComponentName(node, store.controller.preferences.locale, locales) }))}
      onChange={parentId => void action.run(() => editPage(store, '移动到容器', [{ kind: 'component.reparent', pageId: page.id, componentIds: selected.map(node => node.id), parentId }]))}/>}
    <div className="candidate-property-grid">
      <PageChoiceField label="自身定位" value={componentIsFree(component) ? 'free' : 'flow'} options={positionOptions} onChange={changePosition} disabled={locked}/>
      {number('z', '层级')}
      {canArrange && <PageChoiceField label="内部排布" value={component.layout.mode} options={modeOptions} onChange={changeMode} disabled={locked}/>}
      {canArrange && number('gap', '子项间距', 0)}
      {canArrange && component.layout.mode === 'grid' && number('columns', '网格列数', 1)}
      {kind === 'container' && componentIsFree(component) && <PageNumberProperty session={session} name={`${component.id}/visualScale`} label="组视觉倍率"
        value={component.visualScale ?? 1} read={() => read().visualScale ?? 1} commit={value => update({ visualScale: value })} step={0.05} min={0.05} disabled={locked}/>}
    </div>
    {(parent || selectedIds.length > 1) && <CandidateToolbar label="组件顺序与对齐">
      {parent && <><CandidateButton disabled={locked || index < 1} onClick={() => void reorder(-1)}><ArrowUp size={14}/>向前排列</CandidateButton>
        <CandidateButton disabled={locked || index >= parent.children.length - 1} onClick={() => void reorder(1)}><ArrowDown size={14}/>向后排列</CandidateButton></>}
      {selectedIds.length > 1 && <CandidateButton disabled={action.busy} onClick={() => void align()}><AlignStartVertical size={14}/>左对齐</CandidateButton>}
    </CandidateToolbar>}
    <PagePropertyStatus fault={action.fault}/>
  </CandidateSection>;
}
