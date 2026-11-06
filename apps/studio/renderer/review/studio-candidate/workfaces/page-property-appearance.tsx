import type { ComponentConfig, PageConfig, PageEditOperation, Visual } from '@galcraft/contracts';
import { explainVisual, readTemplateDocuments } from '@galcraft/templates';
import type { WorkbenchFieldPreview } from '../../../authoring/page-designer.js';
import { CandidateButton, CandidateSection } from '../components/controls/index.js';
import { editPage, type PageStore, type PageTemplate } from './page-edit.js';
import { validColor } from './page-property-background.js';
import { currentPropertyComponent, PageCheck, PageChoiceField, PageNumberProperty, PagePropertyStatus, PageTextProperty, updateComponent, usePagePropertyAction, type ComponentChanges, type PagePropertySession } from './page-property-fields.js';
import { pagePlayerComponent, pagePlayerSurface, type PagePropertyGeometry } from './page-property-layout.js';

export type PageVisualState = Extract<WorkbenchFieldPreview, { kind: 'visual' }>['state'];
export const stateNames: Record<PageVisualState, string> = { normal: '普通', hover: '悬浮', pressed: '按下', focus: '焦点', disabled: '禁用', selected: '选中', locked: '业务锁定', empty: '空槽' };
export const componentVisual = (component: ComponentConfig, state: PageVisualState) => state === 'normal' ? component.normal : component.states[state] ?? {};
export function updatePageVisual(store: PageStore, pageId: string, component: ComponentConfig, state: PageVisualState, changes: Partial<Visual>, label: string) {
  if (state === 'normal') return updateComponent(store, pageId, component.id, { normal: changes }, label);
  // The public operation validates a complete state record. Clear its placeholders in the same transaction.
  const states = { hover: {}, pressed: {}, focus: {}, disabled: {}, selected: {}, locked: {}, empty: {}, ...component.states, [state]: { ...component.states[state], ...changes } };
  const paths = Object.keys(states).filter(key => key !== state && !Object.hasOwn(component.states, key)).map(key => `states.${key}`);
  const operations: PageEditOperation[] = [{ kind: 'component.update', pageId, componentId: component.id, changes: { states } }];
  if (paths.length) operations.push({ kind: 'component.clear', pageId, componentId: component.id, paths });
  return editPage(store, label, operations);
}

const numbers = [
  { key: 'fontSize', label: '字号', min: 0.1, step: 1, unit: 'px' }, { key: 'lineHeight', label: '行高', min: 0.1, step: 0.1, unit: '' },
  { key: 'opacity', label: '不透明度', min: 0, max: 1, step: 0.05, unit: '' }, { key: 'radius', label: '圆角', min: 0, step: 1, unit: 'px' },
] as const;
const aligns = [{ value: 'start', label: '靠前' }, { value: 'center', label: '居中' }, { value: 'end', label: '靠后' }] as const;

export function PageAppearance({ session, page, component, template, state, previewField }: {
  session: PagePropertySession; page: PageConfig; component: ComponentConfig; template: PageTemplate; state: PageVisualState;
  previewField: (value: WorkbenchFieldPreview | null) => void;
}) {
  const { store } = session, action = usePagePropertyAction();
  const current = () => currentPropertyComponent(store, page.id, component.id);
  const visual = componentVisual(component, state);
  const inherited = { ...template.defaultVisual, ...component.normal, ...visual };
  const read = () => { const item = current(); return { ...readTemplateDocuments(store.host.list()).defaultVisual, ...item.normal, ...componentVisual(item, state) }; };
  const update = (changes: Partial<Visual>) => updatePageVisual(store, page.id, current(), state, changes, '调整组件外观');
  const preview = (changes: Partial<Visual> | null) => previewField(changes ? { kind: 'visual', componentId: component.id, state, changes } : null);
  const updateBackground = (changes: Partial<Visual['background']>) => update({ background: { ...read().background, ...changes } });
  const content = (changes: ComponentChanges['content']) => updateComponent(store, page.id, component.id, { content: changes }, '调整阅读面板');
  const color = (key: string, label: string, value: string, readValue: () => string, apply: (next: string) => Promise<unknown>, fieldPreview?: (next: string | null) => void) => <PageTextProperty session={session}
    name={`${component.id}/${state}/${key}`} label={label} value={value} read={readValue} commit={next => {
      if (!validColor(next) && !(key === 'color' && next === 'inherit')) throw new Error('请输入十六进制颜色，例如 #223344。');
      return apply(next);
    }} preview={fieldPreview} short swatch/>;
  const restore = () => action.run(() => state === 'normal'
    ? editPage(store, '恢复普通状态外观', [{ kind: 'component.clear', pageId: page.id, componentId: component.id, paths: Object.keys(current().normal).map(key => `normal.${key}`) }])
    : editPage(store, '恢复组件状态继承', [{ kind: 'component.clear', pageId: page.id, componentId: component.id, paths: [`states.${state}`] }]));
  const contentNumber = (key: string, label: string, initial: number, min: number, max?: number, step = 1) => <PageNumberProperty key={key} session={session}
    name={`${component.id}/content/${key}`} label={label} value={Number(component.content[key] ?? initial)} read={() => Number(current().content[key] ?? initial)}
    commit={value => content({ [key]: value })} min={min} max={max} step={step}/>;

  return <>
    <CandidateSection title={`外观 · ${stateNames[state]}`}>
      {state !== 'normal' && <p className="candidate-property-note">只为当前状态设置覆盖值。其余属性继承普通状态。</p>}
      <div className="candidate-property-grid">
        {color('color', '文字颜色', inherited.color, () => read().color, value => update({ color: value }), value => preview(value && (validColor(value) || value === 'inherit') ? { color: value } : null))}
        {color('background', '背景颜色', inherited.background.color, () => read().background.color, value => updateBackground({ color: value }), value => preview(value && validColor(value) ? { background: { ...inherited.background, color: value } } : null))}
        <PageNumberProperty session={session} name={`${component.id}/${state}/colorOpacity`} label="背景不透明度" value={inherited.background.colorOpacity}
          read={() => read().background.colorOpacity} commit={value => updateBackground({ colorOpacity: value })} min={0} max={1} step={0.05}
          preview={value => preview(value === null ? null : { background: { ...inherited.background, colorOpacity: value } })}/>
        {numbers.map(({ key, label, min, step, unit, ...rest }) => <PageNumberProperty key={key} session={session} name={`${component.id}/${state}/${key}`} label={label}
          value={inherited[key]} read={() => read()[key]} commit={value => update({ [key]: value })} min={min} max={'max' in rest ? rest.max : undefined} step={step} unit={unit}
          preview={value => preview(value === null ? null : { [key]: value })}/>)}
        <PageChoiceField label="文字对齐" value={inherited.textAlign} options={aligns} disabled={action.busy} onChange={textAlign => void action.run(() => update({ textAlign }))}/>
        <PageCheck label="文字换行" value={inherited.wrap} disabled={action.busy} onChange={wrap => void action.run(() => update({ wrap }))}/>
      </div>
      <CandidateButton disabled={action.busy || !Object.keys(visual).length} onClick={() => void restore()}>恢复当前状态</CandidateButton>
      <PagePropertyStatus fault={action.fault}/>
    </CandidateSection>
    {component.part === 'story.readingPanel' && <CandidateSection title="阅读面板" collapsible initiallyOpen={false}>
      <div className="candidate-property-grid">
        {([['portrait', '显示头像槽'], ['nameAbove', '姓名放在上沿'], ['gradient', '顶部渐隐'], ['nvlNameBold', 'NVL 姓名粗体']] as const).map(([key, label]) => <PageCheck key={key} label={label} value={key === 'nvlNameBold' ? component.content[key] !== false : component.content[key] === true}
          disabled={action.busy} onChange={value => void action.run(() => content({ [key]: value }))}/>)}
        {contentNumber('portraitWidth', '头像宽度', 220, 80)}
        {contentNumber('nvlPadding', 'NVL 文字区内边距', 72, 0, 400)}
        {contentNumber('nvlScrimOpacity', 'NVL 暗罩不透明度', .65, 0, 1, .05)}
        {contentNumber('nvlLineHeight', 'NVL 行距', 1.8, 1, 4, .05)}
        {contentNumber('nvlParagraphGap', 'NVL 段落间距', 16, 0, 200)}
        {color('nvlScrimColor', 'NVL 暗罩颜色', String(component.content.nvlScrimColor ?? '#000000'), () => String(current().content.nvlScrimColor ?? '#000000'), value => content({ nvlScrimColor: value }))}
        {color('nvlNameColor', 'NVL 姓名颜色', String(component.content.nvlNameColor ?? '#ffffff'), () => String(current().content.nvlNameColor ?? '#ffffff'), value => content({ nvlNameColor: value }))}
        {color('readingBackground', '共同背景颜色', (component.normal.background ?? template.defaultVisual.background).color,
          () => (current().normal.background ?? readTemplateDocuments(store.host.list()).defaultVisual.background).color,
          value => updateComponent(store, page.id, component.id, { normal: { background: { ...(current().normal.background ?? readTemplateDocuments(store.host.list()).defaultVisual.background), color: value } } }, '调整阅读背景'))}
        {(['top', 'right', 'bottom', 'left'] as const).map((side, index) => <PageNumberProperty key={side} session={session} name={`${component.id}/padding/${side}`} label={['上内边距', '右内边距', '下内边距', '左内边距'][index]!}
          value={component.layout.padding[side]} read={() => current().layout.padding[side]} min={0} unit="px" commit={value => updateComponent(store, page.id, component.id, { layout: { padding: { ...current().layout.padding, [side]: value } } }, '调整阅读内边距')}/>)}
      </div>
    </CandidateSection>}
  </>;
}

const sourceFields = [['color', '文字颜色', 'color'], ['fontSize', '字号', 'font-size'], ['opacity', '不透明度', 'opacity'], ['radius', '圆角', 'border-radius'], ['lineHeight', '行高', 'line-height']] as const;

export function PagePropertySources({ page, component, template, state, geometry, onOpenStyle }: {
  page: PageConfig; component: ComponentConfig; template: PageTemplate; state: PageVisualState; geometry?: PagePropertyGeometry;
  onOpenStyle?: (styleId: string) => void;
}) {
  const element = pagePlayerComponent(pagePlayerSurface(geometry), component.id);
  const computed = element ? getComputedStyle(element) : undefined;
  const styles = template.styles.filter(style => style.scope.pageId === page.id && (!style.scope.componentId || style.scope.componentId === component.id));
  const layerName = (source: string) => source === 'template' ? '模板' : source === 'component' ? '组件' : stateNames[source as PageVisualState] ?? source;
  return <CandidateSection title="组件来源" collapsible initiallyOpen={false}>
    <dl className="candidate-property-sources"><dt>部件类型</dt><dd>{component.part}</dd><dt>组件 ID</dt><dd>{component.id}</dd>
      {sourceFields.map(([field, label, property]) => {
        const source = explainVisual(template, component.id, field, state, undefined, computed?.getPropertyValue(property));
        return <div key={field}><dt>{label}</dt><dd>{String(source.computed)}<span>{source.layers.map(layer => `${layerName(layer.source)} ${String(layer.value)}`).join(' → ')}</span></dd></div>;
      })}
      {computed && <><dt>Player 排布</dt><dd>{computed.position} · {computed.display} · {computed.width} × {computed.height}</dd></>}
    </dl>
    {styles.map(style => onOpenStyle ? <CandidateButton key={style.id} title={style.sourcePath} onClick={() => onOpenStyle(style.id)}>定位样式 · {style.name}</CandidateButton>
      : <p className="candidate-property-note" key={style.id}>{style.name} · {style.sourcePath}</p>)}
  </CandidateSection>;
}
