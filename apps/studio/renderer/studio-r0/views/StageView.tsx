import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Link2, Monitor, Pause, Pin, Play, SlidersHorizontal, Square } from 'lucide-react';
import { canvasPlacement, StageController, type Rect } from '@galcraft/stage';
import { useReview, useReviewState } from '../context.js';
import { expressionNames, sourceLine, type Expression } from '../model.js';
import { createStageBridge, design } from './stage-bridge.js';
import { speakerName, textProgressOffsets } from './view-details.js';
import './stage.css';

type Props = { onOpen?: (viewId: string) => void };

export function StageView({ onOpen }: Props = {}) {
  const store = useReview(), { project, ui } = useReviewState();
  const { scene, line } = sourceLine(project, store.source('stage'));
  const pinned = Boolean(ui.pins.stage);
  const activePreview = scene?.id === ui.preview.sceneId && line?.id === ui.preview.lineId;
  const playState = activePreview ? ui.preview.status : 'stopped';
  const lineIndex = scene && line ? scene.lines.indexOf(line) : -1;
  const selected = line?.events.find(event => event.id === ui.selected.id);
  const next = line?.events.find(event => event.kind === 'expression');
  const defaultOffset = selected?.offset ?? next?.offset ?? line?.text.length ?? 0;
  const offset = Math.min(line?.text.length ?? 0, activePreview && playState !== 'stopped' ? ui.preview.offset : defaultOffset);
  const previewCandidate = ui.production.candidates.find(item => item.id === ui.preview.temporaryCandidateId);
  const candidate = previewCandidate ? { characterId: ui.production.characterId, value: previewCandidate } : undefined;
  const castTarget = candidate?.characterId ?? selected?.characterId ?? next?.characterId ?? line?.speakerId ?? undefined;
  const expressions: Record<string, string> = {};
  if (scene && line) for (const prior of scene.lines.slice(0, lineIndex + 1)) {
    for (const event of [...prior.events].sort((left, right) => left.offset - right.offset)) {
      if (event.kind === 'expression' && event.characterId && (prior !== line || event.offset <= offset)) expressions[event.characterId] = event.value;
    }
  }
  if (candidate) expressions[candidate.characterId] = candidate.value.expression;
  const composition = JSON.stringify([scene?.id, line?.id, scene?.background, scene?.cast, project.characters, project.assets, expressions, candidate]);
  const inputs = useRef({ project, scene, line, expressions, candidate });
  inputs.current = { project, scene, line, expressions, candidate };

  const host = useRef<HTMLDivElement>(null);
  const bridge = useMemo(createStageBridge, []);
  const mount = useRef<Promise<StageController> | null>(null);
  const work = useRef<Promise<void>>(Promise.resolve());
  const active = useRef<StageController | null>(null);
  const [surface, setSurface] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [painted, setPainted] = useState(0);
  const [showCast, setShowCast] = useState(false);
  const [pausedAnchors, setPausedAnchors] = useState(0);
  const consumed = useRef(new Set<string>());
  const previousPlayback = useRef({ lineId: '', offset: 0 });

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let stopped = false;
    const canvasHost = element.ownerDocument.createElement('div');
    canvasHost.className = 'gc-r0-stage-canvas';
    element.prepend(canvasHost);
    const instance = StageController.create(canvasHost, design, bridge.resources);
    const resize = () => {
      if (stopped) return;
      const rect = { x: 0, y: 0, width: element.clientWidth, height: element.clientHeight };
      setSurface(rect);
      active.current?.setViewport(rect);
    };
    mount.current = instance;
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    void instance.then(stage => {
      if (stopped) return;
      active.current = stage;
      stage.pause(true);
      resize();
    }).catch(cause => { if (!stopped) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => {
      stopped = true;
      observer.disconnect();
      if (mount.current === instance) mount.current = null;
      active.current = null;
      const pending = work.current;
      void Promise.allSettled([instance, pending]).then(([created]) => {
        if (created.status === 'fulfilled') created.value.dispose();
        canvasHost.remove();
      });
    };
  }, [bridge]);

  useEffect(() => {
    const instance = mount.current;
    const input = inputs.current;
    if (!instance || !input.scene || !input.line) return;
    let obsolete = false;
    const targetScene = input.scene, lineId = input.line.id;
    work.current = work.current.catch(() => {}).then(async () => {
      if (obsolete) return;
      try {
        const stage = await instance;
        if (obsolete) return;
        const built = await bridge.prepare(input.project, targetScene, lineId, input.expressions, input.candidate);
        if (obsolete) return;
        const prepared = await stage.prepareStage(built.owner.sessionId, built.presentation);
        if (!prepared.ok) throw new Error(prepared.error.message);
        if (obsolete) { stage.discardPrepared(prepared.value.id); return; }
        const committed = stage.commitStage(prepared.value.id, built.owner);
        if (!committed.ok) { stage.discardPrepared(prepared.value.id); throw new Error(committed.error.message); }
        setReady(true);
        setPainted(value => value + 1);
        setError('');
      } catch (cause) {
        if (!obsolete) setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
    return () => { obsolete = true; };
  }, [bridge, composition]);

  useEffect(() => {
    if (previousPlayback.current.lineId !== line?.id || offset < previousPlayback.current.offset) consumed.current.clear();
    previousPlayback.current = { lineId: line?.id ?? '', offset };
  }, [line?.id, offset]);

  useEffect(() => {
    if (!line || !scene || playState !== 'playing') return;
    const pause = line.events.find(event => event.kind === 'pause' && event.offset === offset && !consumed.current.has(event.id));
    if (pause && !pause.durationMs) {
      consumed.current.add(pause.id);
      store.updateUi(state => { state.preview.status = 'paused'; });
      return;
    }
    const nextOffset = textProgressOffsets(line.text).find(value => value > offset);
    const timer = setTimeout(() => {
      if (pause) {
        consumed.current.add(pause.id);
        setPausedAnchors(count => count + 1);
        return;
      }
      store.updateUi(state => {
        if (nextOffset === undefined) state.preview.status = 'paused';
        else state.preview.offset = nextOffset;
      });
    }, pause?.durationMs || 42);
    return () => clearTimeout(timer);
  }, [line, scene, playState, offset, pausedAnchors, store]);

  const objectBounds = useMemo(() => castTarget ? active.current?.objectBounds(bridge.objectId(castTarget)) : null, [bridge, castTarget, painted]);
  const place = canvasPlacement(design, surface);
  const left = Math.max(0, objectBounds?.x ?? 0), top = Math.max(0, objectBounds?.y ?? 0);
  const bounds = objectBounds && place.scale > 0 ? {
    left: place.x + left * place.scale,
    top: place.y + top * place.scale,
    width: Math.max(0, Math.min(design.width, objectBounds.x + objectBounds.width) - left) * place.scale,
    height: Math.max(0, Math.min(design.height, objectBounds.y + objectBounds.height) - top) * place.scale,
  } : null;
  const name = castTarget ? speakerName(project, castTarget) : null;
  const expression = castTarget && scene ? expressions[castTarget] ?? scene.cast[castTarget]?.expression : null;
  const stageLabel = name && expression ? `${name} · ${expressionNames[expression as Expression] ?? expression}` : name;

  function play() {
    if (!scene || !line) return;
    if (playState === 'stopped' || offset >= line.text.length) consumed.current.clear();
    store.updateUi(state => {
      state.preview = { ...state.preview, sceneId: scene.id, lineId: line.id, status: playState === 'playing' ? 'paused' : 'playing',
        offset: playState === 'stopped' || offset >= line.text.length ? 0 : offset };
    });
  }

  function locate() {
    if (!scene || !line) return;
    onOpen?.(`writing:${scene.id}`);
    store.revealLine(scene.id, line.id, offset);
  }

  function editCast(characterId: string, field: 'x' | 'y' | 'scale' | 'visible', value: number | boolean) {
    if (!scene) return;
    store.edit('调整舞台角色', draft => {
      const appearance = draft.scenes.find(item => item.id === scene.id)?.cast[characterId];
      if (!appearance) return;
      if (field === 'visible') appearance.visible = Boolean(value);
      else if (typeof value === 'number' && Number.isFinite(value)) appearance[field] = field === 'scale' ? Math.max(.05, value) : value;
    }, `stage:${scene.id}:${characterId}:${field}`);
  }

  return <section className="gc-r0-stage-view">
    <div className="gc-r0-stage-heading"><Monitor size={17}/><strong>舞台</strong><span>{scene?.name ?? '来源已移除'}</span></div>
    <div className="gc-r0-stage-source">
      <span data-pinned={pinned}>{pinned ? <Pin size={14}/> : <Link2 size={15}/>} {pinned ? '已固定' : '跟随编辑位置'}</span>
      {line && <small>第 {lineIndex + 1} 句 · {speakerName(project, line.speakerId)}</small>}
      <i/>
      <button type="button" onClick={() => store.pin('stage')} aria-pressed={pinned}>{pinned ? <Link2 size={14}/> : <Pin size={14}/>} {pinned ? '恢复跟随' : '固定来源'}</button>
    </div>
    <div className="gc-r0-stage-frame" ref={host} aria-label="实际 GalCraft 舞台" data-empty={!line}>
      {(!ready || !line || error) && <p className="gc-r0-stage-status" role={error ? 'alert' : 'status'}>{error || (line ? '正在准备舞台素材…' : '选中一句文稿来查看演出')}</p>}
      {ready && !error && line && bounds && stageLabel && <div className="gc-r0-stage-target" style={bounds}><span>{stageLabel}</span></div>}
      {ready && !error && line && <div className="gc-r0-stage-dialogue" style={{ left: place.x + place.width * .026, right: place.x + place.width * .026, bottom: place.y + place.height * .035 }}>
        {line.speakerId && <strong>{speakerName(project, line.speakerId)}</strong>}
        <span>{line.text.slice(0, offset)}</span>
      </div>}
    </div>
    <div className="gc-r0-stage-controls">
      <button className="gc-r0-view-primary" type="button" onClick={play} disabled={!line}>{playState === 'playing' ? <Pause size={15}/> : <Play size={15}/>} {playState === 'playing' ? '暂停' : playState === 'paused' && line && offset < line.text.length ? '继续预览' : '从此句预览'}</button>
      <button type="button" aria-label="停止预览" title="停止预览" disabled={playState === 'stopped'} onClick={() => { consumed.current.clear(); store.updateUi(state => { state.preview.status = 'stopped'; state.preview.offset = 0; }); }}><Square size={14}/></button>
      <small role="status">{playState === 'playing' ? '正在播放' : playState === 'paused' ? '已暂停' : '定位检查'}</small>
      <i/>
      <button type="button" onClick={locate} disabled={!line}><Crosshair size={15}/>定位文稿</button>
      <button type="button" onClick={() => setShowCast(open => !open)} disabled={!scene} title="调整舞台角色" aria-label="调整舞台角色" aria-expanded={showCast}><SlidersHorizontal size={15}/></button>
    </div>
    {showCast && scene && <div className="gc-r0-stage-cast" aria-label="舞台角色位置">
      {Object.entries(scene.cast).map(([id, appearance]) => <div key={id}>
        <label><input type="checkbox" checked={appearance.visible} onChange={event => editCast(id, 'visible', event.currentTarget.checked)}/>{speakerName(project, id)}</label>
        {(['x', 'y', 'scale'] as const).map(field => <label key={field}>{field === 'scale' ? '缩放' : field.toUpperCase()}
          <input type="number" aria-label={`${speakerName(project, id)} ${field === 'scale' ? '缩放' : field.toUpperCase()}`}
            min={field === 'scale' ? .05 : undefined} step={field === 'scale' ? .05 : 10} value={appearance[field]} onBlur={() => store.endEditGroup()}
            onChange={event => editCast(id, field, event.currentTarget.valueAsNumber)}/>
        </label>)}
      </div>)}
    </div>}
  </section>;
}
