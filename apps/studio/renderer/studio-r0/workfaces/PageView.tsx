import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowUpRight, Box, Component, Crosshair, FileText, GitBranch, Image, Link2, Maximize, MousePointer2, Plus, Redo2, Settings2, Type, Undo2 } from 'lucide-react';
import { createId } from '@galcraft/contracts';
import { useReview, useReviewState } from '../context.js';
import type { PageObject } from '../model.js';
import { BlueprintView } from './BlueprintView.js';
import { startGraph } from './blueprint-runtime.js';
import { NumberField, PaneHeader, Visibility, type WorkfaceProps } from './shared.js';
import './workfaces.css';

const size = { width: 1920, height: 1080 };
const titleArt = new URL('../../../resources/practice/home/spring-title.png', import.meta.url).href;
const objectIcons = { button: Component, image: Image, text: Type };
type Geometry = Pick<PageObject, 'x' | 'y' | 'width' | 'height'>;
type Gesture = { pointerId: number; x: number; y: number; scaleX: number; scaleY: number; kind: 'move' | 'resize'; objects: Record<string, Geometry> };

export function PageView({ onOpen }: WorkfaceProps = {}) {
  const store = useReview();
  const { project, ui, canUndo, canRedo } = useReviewState();
  const { page } = project;
  const current = ui.selected.kind === 'page-object' && ui.selected.documentId === page.id ? ui.selected.id : null;
  const [mode, setMode] = useState<'layout' | 'behavior' | 'linked'>('layout');
  const [extras, setExtras] = useState<string[]>([]);
  const [zoom, setZoom] = useState('fit');
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState<Record<string, Geometry>>({});
  const [maximize, setMaximize] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const primary = page.objects.find(object => object.id === current);
  const selected = current ? [current, ...extras.filter(id => id !== current)] : [];
  const click = page.nodes.find(node => node.kind === 'click');
  const fade = ui.graphRun.status === 'running' ? page.nodes.find(node => node.id === ui.graphRun.currentId && node.kind === 'fade') : undefined;
  const triggerId = click?.objectId ?? page.objects.find(object => object.kind === 'button')?.id;
  const linked = primary?.id === triggerId;

  const update = (id: string, patch: Partial<PageObject>, group = '') => store.edit('编辑页面对象', project => { const object = project.page.objects.find(entry => entry.id === id); if (object) Object.assign(object, patch); }, group);
  const select = (id: string, extend = false) => {
    setExtras(extend && current && current !== id ? selected.includes(id) ? selected.filter(entry => entry !== id && entry !== current) : [...new Set([...extras, current])] : []);
    if (!extend || !current || !selected.includes(id)) store.updateUi(ui => {
      ui.selected = { kind: 'page-object', documentId: page.id, id };
      if (id === triggerId && click) ui.graphSelection = click.id;
    });
  };
  const openBehavior = () => { if (triggerId) select(triggerId); if (click) store.updateUi(ui => { ui.graphSelection = click.id; }); setMode('linked'); };
  const add = () => {
    const id = createId();
    store.edit('添加页面对象', project => { project.page.objects.push({ id, kind: 'text', name: '新建文本', text: '新建文本', visible: true, x: 850, y: 820, width: 420, height: 120, fontSize: 36 }); });
    select(id);
  };
  const startGesture = (event: PointerEvent<HTMLButtonElement>, object: PageObject, kind: Gesture['kind']) => {
    if (event.button !== 0 || preview) return;
    const extend = event.shiftKey || event.ctrlKey || event.metaKey;
    const ids = kind === 'resize' ? [object.id] : selected.includes(object.id) ? selected : extend ? [...selected, object.id] : [object.id];
    if (!selected.includes(object.id)) select(object.id, extend);
    else if (extend && kind === 'move') { select(object.id, true); return; }
    event.stopPropagation();
    const rect = frame.current?.getBoundingClientRect(); if (!rect?.width || !rect.height) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, scaleX: size.width / rect.width, scaleY: size.height / rect.height, kind, objects: Object.fromEntries(page.objects.filter(entry => ids.includes(entry.id)).map(entry => [entry.id, { x: entry.x, y: entry.y, width: entry.width, height: entry.height }])) };
  };
  const geometry = (event: PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current; if (!active || event.pointerId !== active.pointerId) return null;
    const dx = Math.round((event.clientX - active.x) * active.scaleX), dy = Math.round((event.clientY - active.y) * active.scaleY);
    return Object.fromEntries(Object.entries(active.objects).map(([id, value]) => [id, active.kind === 'move' ? { ...value, x: value.x + dx, y: value.y + dy } : { ...value, width: Math.max(32, value.width + dx), height: Math.max(24, value.height + dy) }]));
  };
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const patch = geometry(event), kind = gesture.current?.kind;
    gesture.current = null; setDraft({});
    if (!patch) return;
    store.edit(kind === 'resize' ? '调整页面对象大小' : '移动页面对象', project => { for (const object of project.page.objects) if (patch[object.id]) Object.assign(object, patch[object.id]); });
  };
  const moveKeys = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (preview || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const amount = event.shiftKey ? 10 : 1, horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight', delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -amount : amount;
    event.preventDefault();
    const ids = selected.includes(id) ? selected : [id];
    store.edit('移动页面对象', project => { for (const object of project.page.objects) if (ids.includes(object.id)) object[horizontal ? 'x' : 'y'] += delta; }, `page-move:${ids.join(',')}`);
  };
  const canvas = <section className="gc-r0-wf-pane gc-r0-page-canvas">
    <PaneHeader title={`${page.name} · ${preview ? '页面预览' : '设计画布'}`} icon={<FileText />}>
      <span className="gc-r0-wf-badge">{preview ? '预览态' : '设计态'}</span>
      <label className="gc-r0-wf-inline"><span className="gc-r0-wf-sr">画布缩放</span><select aria-label="画布缩放" value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">适合窗口</option><option value="75">75%</option><option value="100">100%</option><option value="150">150%</option></select></label>
      <button className="gc-r0-wf-icon" type="button" title={maximize ? '退出最大化' : '最大化画布'} aria-label={maximize ? '退出最大化' : '最大化画布'} aria-pressed={maximize} onClick={() => setMaximize(!maximize)}><Maximize /></button>
    </PaneHeader>
    <div className="gc-r0-page-stage-scroll">
      <div className="gc-r0-page-stage" ref={frame} style={{ '--page-zoom': zoom === 'fit' ? 1 : Number(zoom) / 100 } as CSSProperties}>
        <img className="gc-r0-page-background" src={page.background} alt="" draggable={false} />
        {page.objects.filter(object => object.visible).map(object => {
          const value = draft[object.id] ?? object, active = !preview && selected.includes(object.id);
          const image = object.image ?? (object.id === 'title' && object.text === project.name ? titleArt : undefined);
          const position = { left: `${value.x / size.width * 100}%`, top: `${value.y / size.height * 100}%`, width: `${value.width / size.width * 100}%`, height: `${value.height / size.height * 100}%`, '--object-font': `${object.fontSize / 19.2}cqw` } as CSSProperties;
          const binding = object.id === triggerId;
          return <div key={object.id} className="gc-r0-page-object" data-kind={object.kind} data-selected={active} style={position}>
            {active && <span className="gc-r0-page-object-label">{object.name}</span>}
            <button type="button" className="gc-r0-page-art" title={preview && !binding && object.kind === 'button' ? `${object.name} · 未绑定点击事件` : object.name}
              disabled={preview && !binding} aria-label={`${preview ? '预览' : '选中画布对象'} ${object.name}`} onKeyDown={event => moveKeys(event, object.id)}
              style={object.id === 'title' && fade ? { animation: `gc-r0-page-fade ${fade.durationMs ?? 400}ms ease-out forwards` } : undefined}
              onClick={event => { if (preview) { if (binding) { openBehavior(); startGraph(store); } } else if (event.detail === 0) select(object.id, event.shiftKey); }}
              onPointerDown={event => startGesture(event, object, 'move')} onPointerMove={event => { const next = geometry(event); if (next) setDraft(next); }} onPointerUp={finish} onPointerCancel={() => { gesture.current = null; setDraft({}); }}>
              {image && (object.kind === 'image' || object.id === 'title') ? <img src={image} alt="" draggable={false} /> : object.text}
            </button>
            {active && <button type="button" className="gc-r0-page-resize" aria-label={`调整 ${object.name} 大小`} onPointerDown={event => startGesture(event, object, 'resize')} onPointerMove={event => { const next = geometry(event); if (next) setDraft(next); }} onPointerUp={finish} onPointerCancel={() => { gesture.current = null; setDraft({}); }} />}
          </div>;
        })}
      </div>
    </div>
    <footer className="gc-r0-wf-footer"><MousePointer2 /><span>{selected.length > 1 ? `已选 ${selected.length} 个对象` : primary ? `${page.name} / ${primary.name}` : '选择画布对象开始编辑'}</span>{linked && <button type="button" onClick={openBehavior}><Link2 />定位点击事件</button>}</footer>
  </section>;

  return <div className="gc-r0-wf gc-r0-page" data-maximized={maximize} data-mode={mode}>
    <div className="gc-r0-wf-toolbar" aria-label="页面工具">
      <div className="gc-r0-wf-tabs" aria-label="页面模式">{([['layout', '布局'], ['behavior', '行为'], ['linked', '联动']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={mode === id} onClick={() => { setMode(id); setMaximize(false); }}>{label}</button>)}</div>
      <span className="gc-r0-wf-divider" />
      <button type="button" className="gc-r0-wf-icon" aria-label="撤销页面编辑" title="撤销页面编辑" disabled={!canUndo} onClick={() => store.undo()}><Undo2 /></button>
      <button type="button" className="gc-r0-wf-icon" aria-label="重做页面编辑" title="重做页面编辑" disabled={!canRedo} onClick={() => store.redo()}><Redo2 /></button>
      <span className="gc-r0-wf-spacer" />
      <button type="button" aria-pressed={preview} onClick={() => { setPreview(!preview); if (mode === 'behavior') setMode('layout'); }}><Crosshair />{preview ? '返回设计' : '预览页面'}</button>
      {onOpen && <button type="button" onClick={() => onOpen('blueprint')}><ArrowUpRight />打开独立蓝图</button>}
    </div>
    {mode !== 'behavior' && <div className="gc-r0-page-grid">
      {!maximize && <aside className="gc-r0-wf-pane gc-r0-wf-explorer gc-r0-page-tree">
        <PaneHeader title="对象" icon={<Box />}><button type="button" className="gc-r0-wf-icon" aria-label="添加页面对象" title="添加页面对象" onClick={add}><Plus /></button></PaneHeader>
        <div className="gc-r0-wf-tree-title"><FileText />{page.name}</div>
        {page.objects.map(object => { const Icon = objectIcons[object.kind]; return <div key={object.id} className="gc-r0-wf-tree-row" data-selected={selected.includes(object.id)}>
          <button type="button" aria-pressed={selected.includes(object.id)} onClick={event => select(object.id, event.shiftKey || event.ctrlKey || event.metaKey)}><Icon /><span title={object.name}>{object.name}</span>{object.id === triggerId && <Link2 className="gc-r0-wf-link" />}</button>
          <Visibility visible={object.visible} label={`切换 ${object.name} 可见性`} onChange={visible => update(object.id, { visible })} />
        </div>; })}
        {onOpen && <button className="gc-r0-wf-tree-action" type="button" onClick={() => onOpen('assets')}><Image />查看素材</button>}
      </aside>}
      {canvas}
      {!maximize && <aside className="gc-r0-wf-pane gc-r0-wf-inspector gc-r0-page-inspector">
        <PaneHeader title={primary ? `属性 · ${primary.name}` : '对象属性'} icon={<Settings2 />} />
        {primary ? <div className="gc-r0-wf-fields" key={primary.id} onBlur={() => store.endEditGroup()}>
          <p className="gc-r0-wf-source"><Link2 />{page.name} / {primary.name}</p>
          <label className="gc-r0-wf-field"><span>对象名称</span><input value={primary.name} onChange={event => update(primary.id, { name: event.target.value }, `page-name:${primary.id}`)} /></label>
          {primary.kind !== 'image' && <><label className="gc-r0-wf-field"><span>文本</span><input value={primary.text} onChange={event => update(primary.id, { text: event.target.value }, `page-text:${primary.id}`)} /></label><NumberField label="字号" value={primary.fontSize} min={12} max={200} onChange={fontSize => update(primary.id, { fontSize }, `page-font:${primary.id}`)} /></>}
          <label className="gc-r0-wf-check"><input type="checkbox" checked={primary.visible} onChange={event => update(primary.id, { visible: event.target.checked })} />可见</label>
          <div className="gc-r0-wf-section"><strong>位置与尺寸</strong><div className="gc-r0-wf-field-grid">{([['x', '位置 X'], ['y', '位置 Y'], ['width', '宽度'], ['height', '高度']] as const).map(([key, label]) => <NumberField key={key} label={label} value={primary[key]} min={key === 'width' || key === 'height' ? 24 : undefined} onChange={value => update(primary.id, { [key]: value }, `page-${key}:${primary.id}`)} />)}</div></div>
          {linked && <div className="gc-r0-wf-section"><strong>点击事件</strong><button type="button" onClick={openBehavior}><GitBranch />标题淡出 → 判断序章进度</button></div>}
        </div> : <p className="gc-r0-wf-empty">在画布或对象树中选中对象。</p>}
      </aside>}
    </div>}
    {mode !== 'layout' && !maximize && <BlueprintView onOpen={onOpen} />}
  </div>;
}
