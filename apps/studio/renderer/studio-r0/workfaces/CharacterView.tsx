import { useRef, useState } from 'react';
import { AudioLines, Check, ChevronDown, Clapperboard, Crosshair, FileImage, Folder, ImagePlus, Layers3, Link2, Play, Sparkles, UserRound } from 'lucide-react';
import { createId } from '@galcraft/contracts';
import { useReview, useReviewState } from '../context.js';
import { expressionNames, type Character, type Expression, type Part } from '../model.js';
import { AudioSample, expressions, Face, Figure, figureUrl, OffsetFields, outfitName, PaneHeader, practice, selectCharacter, Visibility, type WorkfaceProps } from './shared.js';
import './workfaces.css';

const regular = '春日常服', alternate = '衣装色差样例';

export function CharacterView({ onOpen }: WorkfaceProps = {}) {
  const store = useReview();
  const { project, ui } = useReviewState();
  const character = selectCharacter(project.characters, ui.selected, ui.importDraft.characterId);
  if (!character) return <div className="gc-r0-wf gc-r0-wf-empty">作品中没有角色定义。</div>;
  return <CharacterDesk key={character.id} character={character} onOpen={onOpen} />;
}

function CharacterDesk({ character, onOpen }: WorkfaceProps & { character: Character }) {
  const store = useReview(), { project, ui } = useReviewState();
  const [query, setQuery] = useState('');
  const [checker, setChecker] = useState(false);
  const [zoom, setZoom] = useState('fit');
  const [showFace, setShowFace] = useState(true);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const scene = project.scenes.find(scene => scene.id === ui.sceneId);
  const applied = scene?.cast[character.id];
  const currentPart = character.parts.find(part => part.id === (ui.selected.kind === 'part' ? ui.selected.id : null)) ?? character.parts.find(part => part.axis === 'expression' && part.value === character.expression);
  const outfits = [...new Set([regular, alternate, ...character.parts.filter(part => part.axis === 'outfit').map(part => part.value), character.outfit])];
  const grouped = (['shared', 'outfit', 'expression'] as const).map(axis => ({ axis, name: { shared: '共用部件', outfit: '服装', expression: '面部' }[axis], parts: character.parts.filter(part => part.axis === axis && `${part.name} ${part.source}`.includes(query)) }));
  const selectedFigure = character.parts.find(part => part.axis === 'expression' && part.value === character.expression)?.image ?? figureUrl(character.prefix, character.expression);

  const edit = (label: string, change: (character: Character) => void, group = '') => store.edit(label, project => { const current = project.characters.find(item => item.id === character.id); if (current) change(current); }, group);
  const selectPart = (part: Part) => store.select({ kind: 'part', documentId: character.id, id: part.id, characterId: character.id });
  const patchPart = (id: string, patch: Partial<Part>, group = '') => edit('编辑组合部件', current => { const part = current.parts.find(part => part.id === id); if (part) Object.assign(part, patch); }, group);
  const choose = (axis: 'outfit' | 'expression', value: string) => {
    const part = character.parts.find(part => part.axis === axis && part.value === value);
    const addedId = createId();
    edit(`切换${axis === 'outfit' ? '服装' : '表情'}取值`, current => {
      if (axis === 'outfit') current.outfit = value;
      else current.expression = value as Expression;
      if (!part && axis === 'outfit') current.parts.push({ id: addedId, name: outfitName(value), axis, value, image: figureUrl(current.prefix), visible: true, x: 0, y: 0, source: '教学立绘 · 衣装校验样例' });
    });
    if (part) selectPart(part);
    else if (axis === 'outfit') store.select({ kind: 'part', documentId: character.id, id: addedId, characterId: character.id });
  };
  const changeCharacter = (id: string) => store.select({ kind: 'character', documentId: id, id });
  const addPng = () => {
    const id = createId();
    edit('添加现有 PNG 部件', current => { current.parts.push({ id, name: '共用 PNG 部件', axis: 'shared', value: id, image: figureUrl(current.prefix, 'neutral'), visible: true, x: 0, y: 0, source: '教学立绘 · PNG 样本' }); });
    store.select({ kind: 'part', documentId: character.id, id, characterId: character.id });
  };
  const startPsd = () => {
    store.updateUi(state => { if (state.importDraft.characterId !== character.id) { state.importDraft.characterId = character.id; state.importDraft.name = `${character.name}_春日组合.psd`; state.importDraft.step = 1; state.importDraft.layers = state.importDraft.layers.map(layer => ({ ...layer, image: layer.image.replace(/\/figures\/(?:chatgpt|deepseek|claude)-/, `/figures/${character.prefix}-`) })); } });
    onOpen?.('psd');
  };
  const startProduction = () => { store.updateUi(state => { if (state.production.status !== 'running' && (state.production.characterId !== character.id || state.production.expression !== character.expression)) { Object.assign(state.production, { characterId: character.id, expression: character.expression, status: 'idle', progress: 0, candidates: [], selectedId: null, compareId: null, adoptedId: null, error: null }); state.preview.temporaryCandidateId = null; } }); onOpen?.('production'); };

  return <div className="gc-r0-wf gc-r0-character">
    <div className="gc-r0-wf-toolbar"><strong><Layers3 />组合外观</strong><label className="gc-r0-wf-inline"><span>角色</span><select aria-label="选择角色" value={character.id} onChange={event => changeCharacter(event.target.value)}>{project.characters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <span className="gc-r0-wf-spacer" /><button type="button" onClick={addPng}><ImagePlus />添加 PNG 部件</button>{onOpen && <button type="button" onClick={startPsd}><FileImage />导入 PSD</button>}{onOpen && <button type="button" onClick={startProduction}><Sparkles />制作当前表情</button>}
    </div>
    <div className="gc-r0-character-grid">
      <aside className="gc-r0-wf-pane gc-r0-wf-explorer gc-r0-character-axes">
        <PaneHeader title="组合轴" icon={<Layers3 />}><span className="gc-r0-wf-meta">2 个轴</span></PaneHeader>
        <section className="gc-r0-axis"><h4>服装 <span>{outfitName(character.outfit)}</span></h4><div className="gc-r0-axis-options gc-r0-axis-outfits">
          {outfits.map(value => <button type="button" key={value} aria-label={outfitName(value)} aria-pressed={character.outfit === value} onClick={() => choose('outfit', value)} title={outfitName(value)}>
            <span className="gc-r0-axis-costume"><Figure character={character} outfit={value} expression={character.expression} parts={character.parts} /></span><strong>{outfitName(value)}</strong>{character.outfit === value && <Check className="gc-r0-axis-check" />}
          </button>)}
        </div><p>保留表情：{expressionNames[character.expression]}</p></section>
        <section className="gc-r0-axis"><h4>表情 <span>{expressionNames[character.expression]}</span></h4><div className="gc-r0-axis-options gc-r0-axis-expressions">
          {expressions.map(value => <button type="button" key={value} aria-pressed={character.expression === value} onClick={() => choose('expression', value)}>
            <Face src={character.parts.find(part => part.axis === 'expression' && part.value === value)?.image ?? figureUrl(character.prefix, value)} name="" /><strong>{expressionNames[value]}</strong>{character.expression === value && <Check className="gc-r0-axis-check" />}
          </button>)}
        </div><p>保留服装：{outfitName(character.outfit)}</p></section>
        <details className="gc-r0-wf-disclosure" open><summary><AudioLines />自动动作</summary><div className="gc-r0-wf-fields">
          <label className="gc-r0-wf-check"><input type="checkbox" checked={character.autoMouth} onChange={event => edit('设置随配音动嘴', character => { character.autoMouth = event.target.checked; })} />随配音动嘴</label>
          <label className="gc-r0-wf-check"><input type="checkbox" checked={character.autoBlink} onChange={event => edit('设置自动眨眼', character => { character.autoBlink = event.target.checked; })} />自动眨眼</label>
          <AudioSample playing={playing} onPlaying={value => {
            setPlaying(value);
            if (value) { if (audio.current) audio.current.currentTime = 0; void audio.current?.play().catch(() => setPlaying(false)); }
            else audio.current?.pause();
          }} />
          <audio ref={audio} src={`${practice}/voice/${character.prefix}-ja-01.mp3`} preload="none" onEnded={() => setPlaying(false)} />
        </div></details>
        <details className="gc-r0-wf-disclosure"><summary><UserRound />角色资料</summary><div className="gc-r0-wf-fields"><label className="gc-r0-wf-field"><span>简介</span><textarea rows={3} value={character.description} onChange={event => edit('编辑角色简介', c => { c.description = event.target.value; }, `character-description:${character.id}`)} onBlur={() => store.endEditGroup()} /></label></div></details>
      </aside>
      <section className="gc-r0-wf-pane gc-r0-character-preview">
        <PaneHeader title={`合成预览 · ${character.name}`} icon={<UserRound />}><span className="gc-r0-wf-badge">{outfitName(character.outfit)} · {expressionNames[character.expression]}</span><select aria-label="立绘缩放" value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">适合窗口</option><option value="1">100%</option><option value="1.4">140%</option></select><button type="button" aria-pressed={checker} onClick={() => setChecker(!checker)}>透明</button><button type="button" aria-pressed={showFace} onClick={() => setShowFace(!showFace)}><Crosshair />面部细节</button></PaneHeader>
        <div className="gc-r0-character-stage" data-checker={checker}>
          <div className="gc-r0-character-portrait" style={{ scale: zoom === 'fit' ? 1 : Number(zoom) }}><Figure character={character} outfit={character.outfit} expression={character.expression} parts={character.parts} blink={character.autoBlink} moving={character.autoMouth} playing={playing} /></div>
          {showFace && <div className="gc-r0-character-face-detail"><span>面部 · {expressionNames[character.expression]}</span><Face src={selectedFigure} name={`${character.name}面部细节`} /></div>}
        </div>
        <footer className="gc-r0-wf-footer"><Clapperboard /><span title={scene?.name}>用于场景 · {scene?.name ?? '未选择场景'}</span>{applied && <span className="gc-r0-wf-badge">{outfitName(applied.outfit)} · {expressionNames[applied.expression]}</span>}
          {onOpen && <button type="button" onClick={() => onOpen('stage')}><Play />在场景中查看</button>}
          <button type="button" data-primary disabled={!applied} title={!applied ? '当前场景没有该角色' : undefined} onClick={() => store.applyAppearance(character.id)}>将此外观用于场景</button>
        </footer>
      </section>
      <aside className="gc-r0-character-right">
        <section className="gc-r0-wf-pane gc-r0-wf-explorer gc-r0-character-parts"><PaneHeader title="部件" icon={<Layers3 />} />
          <div className="gc-r0-wf-fields"><input aria-label="搜索角色部件" placeholder="搜索部件…" value={query} onChange={event => setQuery(event.target.value)} /></div>
          {grouped.map(group => <details key={group.axis} className="gc-r0-wf-disclosure" open={group.axis !== 'shared'}><summary><Folder />{group.name} <span className="gc-r0-wf-meta">{group.parts.length}</span></summary>
            {group.parts.map(part => <div key={part.id} className="gc-r0-wf-tree-row" data-selected={currentPart?.id === part.id}>
              <button type="button" aria-pressed={currentPart?.id === part.id} onClick={() => selectPart(part)}><Face src={part.image} name="" /><span title={part.name}>{part.name}</span></button>
              <Visibility visible={part.visible} label={`切换 ${part.name} 可见性`} onChange={visible => patchPart(part.id, { visible })} />
            </div>)}{!group.parts.length && <p className="gc-r0-wf-empty">{query ? '没有匹配部件。' : '暂无独立素材。'}</p>}
          </details>)}
        </section>
        <section className="gc-r0-wf-pane gc-r0-wf-inspector"><PaneHeader title="部件属性" icon={<Crosshair />} />
          {currentPart ? <div className="gc-r0-wf-fields" key={currentPart.id} onBlur={() => store.endEditGroup()}>
            <p className="gc-r0-wf-source"><Link2 />{character.name} / {currentPart.name}</p>
            <label className="gc-r0-wf-field"><span>部件名称</span><input value={currentPart.name} onChange={event => patchPart(currentPart.id, { name: event.target.value }, `part-name:${currentPart.id}`)} /></label>
            <label className="gc-r0-wf-field"><span>组合轴</span><select value={currentPart.axis} onChange={event => patchPart(currentPart.id, { axis: event.target.value as Part['axis'] })}><option value="shared">共用</option><option value="outfit">服装</option><option value="expression">表情</option></select></label>
            {currentPart.axis === 'shared' ? <label className="gc-r0-wf-field"><span>取值</span><input value={currentPart.value} onChange={event => patchPart(currentPart.id, { value: event.target.value }, `part-value:${currentPart.id}`)} /></label> : <label className="gc-r0-wf-field"><span>取值</span><select value={currentPart.value} onChange={event => patchPart(currentPart.id, { value: event.target.value })}><option value={currentPart.value}>{currentPart.axis === 'expression' ? expressionNames[currentPart.value as Expression] ?? currentPart.value : outfitName(currentPart.value)}</option>{(currentPart.axis === 'expression' ? expressions : outfits).filter(value => value !== currentPart.value).map(value => <option key={value} value={value}>{currentPart.axis === 'expression' ? expressionNames[value as Expression] : outfitName(value)}</option>)}</select></label>}
            <label className="gc-r0-wf-check"><input type="checkbox" checked={currentPart.visible} onChange={event => patchPart(currentPart.id, { visible: event.target.checked })} />可见</label>
            <OffsetFields x={currentPart.x} y={currentPart.y} onChange={patch => patchPart(currentPart.id, patch, `part-offset:${currentPart.id}`)} />
            <p className="gc-r0-wf-source"><FileImage />{currentPart.source}</p>{onOpen && <button type="button" onClick={() => onOpen('assets')}><Crosshair />定位素材</button>}
          </div> : <p className="gc-r0-wf-empty">选择部件查看属性。</p>}
        </section>
      </aside>
    </div>
  </div>;
}
