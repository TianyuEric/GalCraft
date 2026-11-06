import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleAlert, Crosshair, Eye, EyeOff, FileImage, Folder, Layers3, Link2, Search, WandSparkles } from 'lucide-react';
import { useReview, useReviewState } from '../context.js';
import { expressionNames, type Expression, type Part, type PsdLayer } from '../model.js';
import { expressions, Face, Figure, OffsetFields, outfitName, PaneHeader, type WorkfaceProps } from './shared.js';
import './workfaces.css';

const stepNames = ['选择来源', '检查与映射', '确认导入'];
const axisName = { shared: '共用部件', outfit: '服装', expression: '表情' };

function previewParts(layers: PsdLayer[]): Part[] {
  return layers.filter(layer => layer.kept).map(layer => ({ id: layer.id, name: layer.name, axis: layer.axis, value: layer.value, image: layer.image, visible: true, x: (layer.keepSourceOffset === false ? 0 : layer.sourceX) + layer.x, y: (layer.keepSourceOffset === false ? 0 : layer.sourceY) + layer.y, source: layer.name, effect: layer.effect === 'glow' ? layer.strategy : undefined }));
}

export function PsdMappingView({ onOpen }: WorkfaceProps = {}) {
  const store = useReview(), { project, ui } = useReviewState(), draft = ui.importDraft;
  const [search, setSearch] = useState('');
  const [compare, setCompare] = useState(false);
  const character = project.characters.find(item => item.id === draft.characterId);
  const layer = draft.layers.find(layer => layer.id === draft.selectedId);
  const clothes = [...new Set([draft.outfit, '春日常服', '衣装色差样例', ...draft.layers.filter(layer => layer.axis === 'outfit').map(layer => layer.value)])];
  const counts = { retained: draft.layers.filter(layer => layer.kept).length, shared: draft.layers.filter(layer => layer.kept && layer.axis === 'shared').length };
  const nextLabel = draft.step === 1 ? '继续检查与映射' : draft.step === 2 ? '继续：确认导入' : '确认写入角色';
  const patchLayer = (id: string, patch: Partial<PsdLayer>) => store.updateUi(state => { const current = state.importDraft.layers.find(layer => layer.id === id); if (current) Object.assign(current, patch); });
  const selectLayer = (id: string) => store.updateUi(state => { state.importDraft.selectedId = id; });
  const setStep = (step: 1 | 2 | 3) => store.updateUi(state => { state.importDraft.step = step; });
  const choose = (axis: 'outfit' | 'expression', value: string) => store.updateUi(state => { if (axis === 'outfit') state.importDraft.outfit = value; else state.importDraft.expression = value as Expression; });
  const mapAutomatically = () => store.updateUi(state => { for (const current of state.importDraft.layers) {
    const expression = expressions.find(value => current.name.includes(expressionNames[value]));
    if (expression) { current.axis = 'expression'; current.value = expression; }
    else if (current.name.includes('服装')) { current.axis = 'outfit'; current.value = current.name.split('/').at(-1)?.trim() || state.importDraft.outfit; }
  } });
  const next = () => {
    if (draft.step === 1) setStep(2);
    else if (draft.step === 2) setStep(3);
    else { store.applyPsd(); setStep(1); onOpen?.('character'); }
  };
  const duplicate = draft.layers.some((current, index, all) => current.kept && current.axis !== 'shared' && all.slice(index + 1).some(layer => layer.kept && layer.axis === current.axis && layer.value === current.value));
  const hasInvalid = draft.layers.some(layer => layer.kept && layer.axis !== 'shared' && !layer.value);

  if (!character) return <div className="gc-r0-wf gc-r0-wf-empty">导入目标角色已移除。</div>;
  return <div className="gc-r0-wf gc-r0-psd" data-step={draft.step}>
    <div className="gc-r0-wf-toolbar gc-r0-psd-steps"><strong><FileImage />PSD 导入</strong><ol>{stepNames.map((step, index) => <li key={step} aria-current={draft.step === index + 1 ? 'step' : undefined} data-done={draft.step > index + 1}><span>{draft.step > index + 1 ? <Check /> : index + 1}</span>{step}</li>)}</ol><span className="gc-r0-wf-spacer" /><span className="gc-r0-wf-meta">角色 · {character.name}</span></div>
    {draft.step === 1 ? <div className="gc-r0-psd-welcome">
      <section className="gc-r0-wf-pane"><PaneHeader title="选择分层样本" icon={<FileImage />} />
        <div className="gc-r0-wf-fields"><p>使用教学立绘构成的确定性分层样本，审核原始可见性、轴映射、偏移和写入流程。</p>
          <button className="gc-r0-psd-source" type="button" aria-pressed="true" onClick={() => setStep(2)}><FileImage /><span><strong>{draft.name}</strong><small>1024 × 1536 px · {draft.layers.length} 个样本层</small></span><ArrowRight /></button>
          <p className="gc-r0-wf-meta">此审核入口读取预设图层清单。任意 PSD 文件的解析与重导入将在正式角色工作包接入。</p>
        </div>
      </section>
      <section className="gc-r0-wf-pane gc-r0-psd-preview"><PaneHeader title={`目标角色 · ${character.name}`} icon={<Layers3 />} /><div className="gc-r0-psd-art"><Figure character={character} expression={character.expression} outfit={character.outfit} parts={character.parts} /></div></section>
    </div> : draft.step === 2 ? <div className="gc-r0-psd-grid">
      <aside className="gc-r0-wf-pane gc-r0-wf-explorer"><PaneHeader title="PSD 原始图层" icon={<Folder />} />
        <div className="gc-r0-wf-fields"><div className="gc-r0-psd-source"><FileImage /><span><strong>{draft.name}</strong><small>1024 × 1536 px · 确定性样本</small></span></div><label className="gc-r0-wf-search"><Search /><input aria-label="搜索 PSD 图层" placeholder="查找图层" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
        <div className="gc-r0-psd-layer-label"><span>图层</span><span>原稿</span><span>保留</span></div>
        {draft.layers.filter(layer => layer.name.includes(search)).map(current => <div className="gc-r0-psd-layer" data-selected={current.id === draft.selectedId} key={current.id}>
          <button type="button" aria-pressed={current.id === draft.selectedId} onClick={() => selectLayer(current.id)}><Face src={current.image} name="" /><span title={current.name}>{current.name}{current.effect === 'glow' && <small> · fx</small>}</span></button>
          <span title={current.sourceVisible ? '原稿可见' : '原稿隐藏'} role="img" aria-label={current.sourceVisible ? '原稿可见' : '原稿隐藏'}>{current.sourceVisible ? <Eye /> : <EyeOff />}</span>
          <input type="checkbox" aria-label={`保留 ${current.name}`} checked={current.kept} onChange={event => patchLayer(current.id, { kept: event.target.checked })} />
        </div>)}
        <p className="gc-r0-wf-empty">原稿隐藏的图层可以保留为备选。</p>
        {draft.layers.filter(layer => layer.effect === 'glow').map(effect => <section className="gc-r0-psd-effect" key={effect.id}>
          <strong><CircleAlert />{effect.name} · 外发光</strong>
          <label className="gc-r0-wf-check"><input type="radio" name={`effect-${effect.id}`} checked={effect.strategy === 'bake'} onChange={() => patchLayer(effect.id, { strategy: 'bake' })} />烘焙效果</label>
          <label className="gc-r0-wf-check"><input type="radio" name={`effect-${effect.id}`} checked={effect.strategy === 'merge'} onChange={() => patchLayer(effect.id, { strategy: 'merge' })} />合并部件组</label>
          <button type="button" aria-pressed={compare} onClick={() => setCompare(!compare)}>比较效果</button>
          {compare && <div className="gc-r0-psd-effects-preview"><span><Face src={effect.image} name="原稿" />原稿</span><span data-glow={effect.strategy === 'bake'}><Face src={effect.image} name="处理预览" />{effect.strategy === 'bake' ? '烘焙' : '合并'}</span></div>}
        </section>)}
      </aside>
      <section className="gc-r0-wf-pane gc-r0-psd-map"><PaneHeader title="组合轴映射" icon={<Layers3 />}><button type="button" onClick={mapAutomatically}><WandSparkles />自动匹配</button></PaneHeader>
        <div className="gc-r0-psd-map-table">
          <div className="gc-r0-psd-map-row gc-r0-psd-map-label"><span>PSD 来源</span><span>组合轴</span><span>取值</span><span>预览</span></div>
          {draft.layers.filter(layer => layer.kept).map(current => <div key={current.id} className="gc-r0-psd-map-row" data-selected={current.id === draft.selectedId}>
            <button type="button" aria-pressed={current.id === draft.selectedId} onClick={() => selectLayer(current.id)}><Face src={current.image} name="" /><span title={current.name}>{current.name}</span></button>
            <select aria-label={`${current.name} 组合轴`} value={current.axis} onChange={event => { const axis = event.target.value as Part['axis']; patchLayer(current.id, { axis, value: axis === 'shared' ? current.id : axis === 'outfit' ? draft.outfit : draft.expression }); }}>{Object.entries(axisName).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
            {current.axis === 'shared' ? <span className="gc-r0-wf-meta">全部组合</span> : <select aria-label={`${current.name} 映射取值`} value={current.value} onChange={event => patchLayer(current.id, { value: event.target.value })}>{(current.axis === 'outfit' ? clothes : expressions).map(value => <option key={value} value={value}>{current.axis === 'outfit' ? outfitName(value) : expressionNames[value as Expression]}</option>)}</select>}
            {current.axis !== 'shared' && <input type="radio" name={`preview-${current.axis}`} aria-label={`预览 ${current.name}`} checked={current.value === draft[current.axis]} onChange={() => { if (current.axis !== 'shared') choose(current.axis, current.value); selectLayer(current.id); }} />}
          </div>)}
        </div>
        <div className="gc-r0-wf-fields"><p className="gc-r0-wf-source"><Link2 />当前预览 · {outfitName(draft.outfit)} · {expressionNames[draft.expression]}</p>
          <div className="gc-r0-wf-section"><strong>选中映射{layer ? ` · ${layer.name}` : ''}</strong>
            {layer && <><label className="gc-r0-wf-check"><input type="checkbox" checked={layer.keepSourceOffset !== false} onChange={event => patchLayer(layer.id, { keepSourceOffset: event.target.checked })} />保留原画布与部件偏移</label>
              <div className="gc-r0-wf-meta">原画布 1024 × 1536 px · 原始偏移 X {layer.sourceX} / Y {layer.sourceY} px</div>
              <OffsetFields label="额外调整" x={layer.x} y={layer.y} onChange={patch => patchLayer(layer.id, patch)} />
            </>}
          </div>
        </div>
      </section>
      <section className="gc-r0-wf-pane gc-r0-psd-preview"><PaneHeader title={`合成预览 · ${character.name}`} icon={<Crosshair />} /><div className="gc-r0-psd-art"><Figure character={character} expression={draft.expression} outfit={draft.outfit} parts={previewParts(draft.layers)} /></div><footer className="gc-r0-wf-footer">原画布 1024 × 1536 · {layer?.keepSourceOffset === false ? '忽略原始偏移' : '保留原始偏移'}</footer></section>
    </div> : <div className="gc-r0-psd-welcome">
      <section className="gc-r0-wf-pane"><PaneHeader title="确认写入角色定义" icon={<Check />} /><div className="gc-r0-wf-fields">
        <p>将保留的 {counts.retained} 个图层写入「{character.name}」，替换当前组合部件。确认后可撤销。</p>
        <p className="gc-r0-wf-source"><Link2 />{draft.name} → {character.name} / 组合外观</p>
        <ul>{draft.layers.filter(layer => layer.kept).map(layer => <li key={layer.id}>{layer.name} → {axisName[layer.axis]}{layer.effect === 'glow' ? ` · ${layer.strategy === 'bake' ? '烘焙' : '合并'}` : ''}</li>)}</ul>
      </div></section>
      <section className="gc-r0-wf-pane gc-r0-psd-preview"><PaneHeader title="导入结果预览" icon={<Layers3 />} /><div className="gc-r0-psd-art"><Figure character={character} expression={draft.expression} outfit={draft.outfit} parts={previewParts(draft.layers)} /></div></section>
    </div>}
    <footer className="gc-r0-wf-footer gc-r0-psd-footer">
      {draft.step > 1 && <button type="button" onClick={() => setStep(draft.step === 3 ? 2 : 1)}><ArrowLeft />返回</button>}
      {onOpen && <button type="button" onClick={() => { setStep(1); onOpen('character'); }}>退出导入</button>}
      <span role="status" className="gc-r0-wf-meta">保留 {counts.retained} 层 · {counts.shared} 个共用部件 · 尚未写入角色</span>
      {draft.step > 1 && (duplicate || hasInvalid) && <span role="alert" data-tone="danger">请解决重复或未设置的取值。</span>}
      <span className="gc-r0-wf-spacer" /><button type="button" data-primary disabled={draft.step > 1 && (!counts.retained || duplicate || hasInvalid)} onClick={next}>{nextLabel}<ArrowRight /></button>
    </footer>
  </div>;
}
