import { useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleAlert, Clapperboard, FileImage, FolderPlus, GitCompare, Image, Layers3, Link2, Play, RefreshCcw, Sparkles, Square, Undo2 } from 'lucide-react';
import { useReview, useReviewState } from '../context.js';
import { expressionNames, type Candidate, type Expression } from '../model.js';
import { expressions, Face, Figure, figureUrl, PaneHeader, type WorkfaceProps } from './shared.js';
import './workfaces.css';

const statusName = { idle: '待制作', running: '制作中', failed: '制作失败', ready: '已完成', cancelled: '已取消' };

export function ProductionView({ onOpen }: WorkfaceProps = {}) {
  const store = useReview(), { project, ui, undoLabel } = useReviewState(), task = ui.production;
  const [layout, setLayout] = useState<'side' | 'blend'>('side');
  const [blend, setBlend] = useState(50);
  const [zoom, setZoom] = useState(100);
  const character = project.characters.find(item => item.id === task.characterId);
  const scene = project.scenes.find(item => item.id === ui.preview.sceneId) ?? project.scenes.find(item => item.id === ui.sceneId);
  const selected = task.candidates.find(candidate => candidate.id === task.selectedId);
  const comparison = task.candidates.find(candidate => candidate.id === task.compareId && candidate.id !== task.selectedId) ?? task.candidates.find(candidate => candidate.id !== task.selectedId);
  const preview = task.candidates.find(candidate => candidate.id === ui.preview.temporaryCandidateId);
  const activePart = character?.parts.find(part => part.axis === 'expression' && part.value === task.expression);
  const adopted = task.candidates.find(candidate => candidate.id === task.adoptedId && activePart?.image === candidate.url && activePart.source === candidate.name);
  const active = task.status === 'running', canMake = !!task.request.trim() && !!character;
  const changeTask = (patch: Partial<typeof task>) => store.updateUi(state => { Object.assign(state.production, patch); });
  const retarget = (patch: { characterId?: string; expression?: Expression }) => store.updateUi(state => {
    Object.assign(state.production, { status: 'idle', progress: 0, candidates: [], selectedId: null, compareId: null, adoptedId: null, error: null }, patch);
    state.preview.temporaryCandidateId = null;
  });
  const submit = () => { if (canMake) { store.previewCandidate(null); void store.produce(); } };
  const addToLibrary = (candidate: Candidate) => {
    store.edit('保留制作成果到素材库', project => { if (!project.assets.some(asset => asset.id === candidate.id)) project.assets.push({ id: candidate.id, name: candidate.name, kind: 'image', url: candidate.url, characterId: task.characterId, expression: task.expression }); });
    store.notice('成果已保留到素材库');
  };
  const pick = (candidate: Candidate) => {
    changeTask({ selectedId: candidate.id, ...(candidate.id === comparison?.id && selected ? { compareId: selected.id } : {}) });
    if (preview) store.previewCandidate(candidate.id);
  };
  const showCharacter = () => { if (character) store.select({ kind: 'character', documentId: character.id, id: character.id }); onOpen?.('character'); };
  const audition = () => { if (selected) store.previewCandidate(preview?.id === selected.id ? null : selected.id); };
  const line = scene?.lines.find(line => line.id === ui.preview.lineId) ?? scene?.lines[0];
  const applied = scene && character ? scene.cast[character.id] : undefined;
  const renderCandidate = (candidate: Candidate, label: string) => <div className="gc-r0-prod-card" data-selected={selected?.id === candidate.id}>
    <header><strong>{label} · {candidate.name}</strong>{selected?.id === candidate.id && <span><Check />已选中</span>}</header>
    <div className="gc-r0-prod-art"><div style={{ scale: zoom / 100 }}>{task.overlay ? <Face src={candidate.url} name={`${candidate.name}合成预览`} /> : <img src={candidate.url} alt={`${candidate.name}原始立绘`} draggable={false} />}</div></div>
    <p>{candidate.description}</p>
  </div>;

  return <div className="gc-r0-wf gc-r0-production">
    <div className="gc-r0-wf-toolbar"><strong><Sparkles />表情制作</strong>{onOpen && <button type="button" onClick={showCharacter}><ArrowLeft />返回角色</button>}<span className="gc-r0-wf-meta">{character?.name ?? '选择目标'} / {expressionNames[task.expression]}</span><span className="gc-r0-wf-spacer" /><span role="status" className="gc-r0-wf-badge" data-tone={task.status === 'failed' ? 'danger' : task.status === 'ready' ? 'success' : undefined}>{task.attempt > 0 ? `第 ${task.attempt} 次制作 · ` : ''}{statusName[task.status]}</span></div>
    <div className="gc-r0-production-grid">
      <aside className="gc-r0-wf-pane gc-r0-wf-explorer gc-r0-prod-request">
        <PaneHeader title="要求与参考" icon={<FileImage />} />
        <div className="gc-r0-wf-fields">
          <label className="gc-r0-wf-field"><span>目标角色</span><select aria-label="制作目标角色" value={task.characterId} disabled={active} onChange={event => retarget({ characterId: event.target.value })}>{project.characters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="gc-r0-wf-field"><span>目标表情</span><select aria-label="制作目标表情" value={task.expression} disabled={active} onChange={event => retarget({ expression: event.target.value as Expression })}>{expressions.map(expression => <option key={expression} value={expression}>{expressionNames[expression]}</option>)}</select></label>
          <label className="gc-r0-wf-field gc-r0-wf-field-stacked"><span>制作要求</span><textarea aria-label="制作要求" rows={5} value={task.request} disabled={active} onChange={event => changeTask({ request: event.target.value })} /></label>
          {character && <section className="gc-r0-wf-section"><strong>角色参考</strong><div className="gc-r0-prod-refs"><div><img src={figureUrl(character.prefix)} alt="角色原图" /><span>角色原图</span></div><div><Face src={activePart?.image ?? figureUrl(character.prefix, task.expression)} name="表情参考" /><span>表情参考</span></div></div></section>}
          <section className="gc-r0-wf-section"><strong>保持一致</strong><span className="gc-r0-wf-meta">人物身份、发型、服装和姿态</span><span className="gc-r0-wf-meta">输出 · 教学作品表情 PNG</span></section>
          {active && <div className="gc-r0-prod-progress"><label htmlFor="gc-r0-prod-progress">制作进度 · {task.progress}%</label><progress id="gc-r0-prod-progress" max={100} value={task.progress}>{task.progress}%</progress></div>}
          {task.error && <div role="alert" className="gc-r0-wf-callout" data-tone="danger"><CircleAlert /><div><strong>制作失败</strong><p>{task.error}</p></div></div>}
          {task.status === 'cancelled' && <p role="status" className="gc-r0-wf-callout" data-tone="warning">已取消制作。制作要求仍保留。</p>}
          <div className="gc-r0-wf-actions gc-r0-wf-wrap">
            {active ? <button type="button" onClick={() => store.cancelProduction()}><Square />取消制作</button> : <button type="button" data-primary disabled={!canMake} onClick={submit}>{task.status === 'failed' || task.status === 'cancelled' ? <RefreshCcw /> : <Sparkles />}{task.status === 'failed' || task.status === 'cancelled' ? '重试制作' : task.status === 'ready' ? '再次制作' : '开始制作'}</button>}
          </div>
          <p className="gc-r0-wf-meta">审核服务使用确定性的教学作品成果。</p>
        </div>
      </aside>
      <div className="gc-r0-prod-workspace">
        <section className="gc-r0-wf-pane gc-r0-prod-compare"><PaneHeader title="成果比较" icon={<GitCompare />}>
          <div className="gc-r0-wf-tabs" aria-label="比较方式"><button type="button" aria-pressed={layout === 'side'} onClick={() => setLayout('side')}>并排</button><button type="button" aria-pressed={layout === 'blend'} onClick={() => setLayout('blend')}>叠加</button></div>
          <select aria-label="同步缩放" value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value="75">75%</option><option value="100">100%</option><option value="125">125%</option><option value="150">150%</option></select>
          <button type="button" aria-pressed={task.overlay} onClick={() => changeTask({ overlay: !task.overlay })}><Layers3 />{task.overlay ? '合成查看' : '原始立绘'}</button>
        </PaneHeader>
        {selected ? layout === 'side' || !comparison ? <div className="gc-r0-prod-comparison" data-single={!comparison}>{comparison && renderCandidate(comparison, 'A')}{renderCandidate(selected, 'B')}</div> : <div className="gc-r0-prod-blend" style={{ '--blend': `${blend}%`, '--candidate-zoom': zoom / 100 } as CSSProperties}>
          <div className="gc-r0-prod-blend-art" data-face={task.overlay}><img src={comparison.url} alt={`A · ${comparison.name}`} /><img src={selected.url} alt={`B · ${selected.name}`} /></div><label>A · {comparison.name}<input type="range" aria-label="比较分界" min={0} max={100} value={blend} onChange={event => setBlend(Number(event.target.value))} />B · {selected.name}</label>
        </div> : <div className="gc-r0-prod-placeholder"><Image /><strong>{active ? '正在准备成果' : '这里将显示制作成果'}</strong><span>{active ? `当前进度 ${task.progress}%` : '填写制作要求，完成后可比较与临时试看。'}</span></div>}
        </section>
        <div className="gc-r0-prod-lower">
          <section className="gc-r0-wf-pane gc-r0-prod-results"><PaneHeader title={`本次成果 · ${task.candidates.length}`} icon={<Image />} />
            {task.candidates.length ? <div className="gc-r0-prod-candidates">{task.candidates.map(candidate => <button type="button" key={candidate.id} aria-pressed={candidate.id === task.selectedId} onClick={() => pick(candidate)}><Face src={candidate.url} name="" /><span>{candidate.name}</span>{candidate.id === task.selectedId && <Check />}</button>)}</div> : <p className="gc-r0-wf-empty">暂无成果。</p>}
            {selected && <div className="gc-r0-wf-fields"><label className="gc-r0-wf-field"><span>对照成果 A</span><select value={comparison?.id ?? ''} onChange={event => changeTask({ compareId: event.target.value })} disabled={!comparison}>{task.candidates.filter(candidate => candidate.id !== selected.id).map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select></label></div>}
          </section>
          <section className="gc-r0-wf-pane gc-r0-prod-scene"><PaneHeader title="场景试看" icon={<Clapperboard />}><span className="gc-r0-wf-meta" title={scene?.name}>{scene?.name}</span><button type="button" disabled={!selected || active} aria-pressed={!!preview} onClick={audition}><Play />{preview ? '退出试看' : '临时试看'}</button></PaneHeader>
            <div className="gc-r0-prod-scene-stage">
              {scene && <img src={scene.background} className="gc-r0-prod-scene-bg" alt="" draggable={false} />}
              {character && <div className="gc-r0-prod-scene-figure"><Figure character={character} expression={preview ? task.expression : applied?.expression ?? character.expression} outfit={applied?.outfit ?? character.outfit} parts={preview ? character.parts : applied?.parts ?? character.parts} override={preview?.url} /></div>}
              <span className="gc-r0-prod-scene-status" data-tone={preview ? 'warning' : undefined}>{preview ? `临时试看 · ${preview.name}` : '场景原样'}</span>
              {line && <div className="gc-r0-prod-dialogue"><b>{project.characters.find(item => item.id === line.speakerId)?.name ?? '旁白'}</b><p>{line.text}</p></div>}
            </div>
          </section>
        </div>
      </div>
    </div>
    <footer className="gc-r0-wf-footer gc-r0-prod-footer"><Link2 /><span>{selected ? `${selected.name} → ` : ''}{character?.name ?? '角色'} / 表情 / {expressionNames[task.expression]}</span>
      <span className="gc-r0-wf-spacer" />
      {adopted && <span className="gc-r0-wf-badge" data-tone="success"><Check />已采用 {adopted.name}</span>}
      {adopted && undoLabel === '采用表情制作成果' && <button type="button" onClick={() => store.undo()}><Undo2 />撤销采用</button>}
      <button type="button" disabled={!selected || active || project.assets.some(asset => asset.id === selected.id)} onClick={() => { if (selected) addToLibrary(selected); }}><FolderPlus />保留到素材库</button>
      <button type="button" data-primary disabled={!selected || active || adopted?.id === selected.id} onClick={() => { if (selected) { store.adoptCandidate(selected.id); onOpen?.('character'); } }}><ArrowRight />采用并返回角色</button>
    </footer>
  </div>;
}
