import { Crosshair, Link2, Pin, Play, Settings2, Smile, Undo2 } from 'lucide-react';
import { useReview, useReviewState } from '../context.js';
import { expressionNames, sourceLine, sourceTitle, type Expression, type Source } from '../model.js';
import { eventLabel, eventNames, imageForExpression, speakerName, textBoundary } from './view-details.js';
import './inspector.css';

type Props = { onOpen?: (viewId: string) => void };
const firstExpressions: Expression[] = ['neutral', 'smile', 'surprised'];

export function InspectorView({ onOpen }: Props = {}) {
  const store = useReview(), { project, ui, canUndo } = useReviewState();
  const source = store.source('inspector'), pinned = Boolean(ui.pins.inspector);
  const { scene, line } = sourceLine(project, source);
  const inline = source.kind === 'event' ? line?.events.find(event => event.id === source.id) : undefined;
  const pageObject = source.kind === 'page-object' ? project.page.objects.find(object => object.id === source.id) : undefined;
  const character = source.kind === 'character' || source.kind === 'part' ? project.characters.find(item => item.id === (source.characterId ?? source.id)) : undefined;
  const part = source.kind === 'part' ? character?.parts.find(item => item.id === source.id) : undefined;
  const targetCharacter = project.characters.find(item => item.id === inline?.characterId);
  const lineNumber = scene && line ? scene.lines.indexOf(line) + 1 : 0;
  const typeTitle = inline ? `${inline.kind === 'expression' && targetCharacter ? targetCharacter.name + ' · ' : ''}${eventNames[inline.kind]}事件`
    : pageObject?.name ?? part?.name ?? character?.name ?? (line ? `${speakerName(project, line.speakerId)} · 语句` : '属性');
  const canPin = Boolean(inline || line || character || pageObject);
  const playOrLocate = (preview = false) => {
    if (!scene || !line) return;
    const offset = inline?.offset ?? 0;
    if (preview) {
      const stageSource = store.source('stage');
      if (ui.pins.stage && (stageSource.documentId !== scene.id || (stageSource.lineId ?? stageSource.id) !== line.id)) {
        store.notice('舞台已固定到其他语句。恢复跟随后可预览此事件。');
        onOpen?.('stage');
        return;
      }
      if (ui.sceneId !== scene.id || ui.lineId !== line.id) store.selectLine(scene.id, line.id, offset);
      if (inline && !pinned) store.select(source);
      store.updateUi(state => { state.preview = { ...state.preview, status: 'paused', sceneId: scene.id, lineId: line.id, offset }; });
      onOpen?.('stage');
    } else {
      onOpen?.(`writing:${scene.id}`);
      store.revealLine(scene.id, line.id, offset);
    }
  };
  function selectEvent(eventId: string) {
    if (!scene || !line) return;
    const event = line.events.find(item => item.id === eventId);
    if (!event) return;
    const next: Source = { kind: 'event', documentId: scene.id, id: event.id, lineId: line.id };
    if (pinned) store.updateUi(state => { state.pins.inspector = next; });
    else store.select(next);
  }
  return <section className="gc-r0-inspector-view">
    <div className="gc-r0-inspector-heading">
      {inline?.kind === 'expression' ? <Smile size={18}/> : <Settings2 size={17}/>}
      <strong>{typeTitle}</strong><i/>
      <span className="gc-r0-inspector-source-state" data-pinned={pinned}>{pinned ? <Pin size={13}/> : <Link2 size={14}/>} {pinned ? '已固定' : '跟随选中'}</span>
      <button type="button" disabled={!canPin && !pinned} aria-pressed={pinned} onClick={() => store.pin('inspector')}>{pinned ? <Link2 size={14}/> : <Pin size={14}/>} {pinned ? '恢复跟随' : '固定来源'}</button>
    </div>
    <div className="gc-r0-inspector-provenance">{sourceTitle(project, source)}</div>
    <div className="gc-r0-inspector-body">
      {inline && line ? <>
        <div className="gc-r0-inspector-event-kind"><span>事件类型</span><strong>{{ expression: '切换表情', pause: '停顿', sound: '播放音效' }[inline.kind]}</strong></div>
        {inline.kind === 'expression' && <>
          <label className="gc-r0-inspector-field"><span>角色</span><select value={inline.characterId ?? ''} onChange={event => store.updateEvent(source, { characterId: event.currentTarget.value })}>
            {!inline.characterId && <option value="" disabled>选择角色</option>}
            {project.characters.filter(item => scene?.cast[item.id]?.visible || item.id === inline.characterId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <div className="gc-r0-inspector-field gc-r0-inspector-expression-row"><span>目标表情</span>
            <div className="gc-r0-inspector-expression-options">
              {firstExpressions.map(expression => <button type="button" aria-pressed={inline.value === expression} key={expression} title={expressionNames[expression]} onClick={() => store.updateEvent(source, { value: expression })}>
                <span className="gc-r0-inspector-thumbnail"><img alt="" src={imageForExpression(project, inline.characterId, expression)}/></span><span>{expressionNames[expression]}</span>
              </button>)}
              <select aria-label="全部表情" value={inline.value} onChange={event => store.updateEvent(source, { value: event.currentTarget.value })}>
                {Object.entries(expressionNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
          </div>
        </>}
        {inline.kind === 'pause' && <>
          <label className="gc-r0-inspector-field"><span>推进方式</span><select value={inline.durationMs ? 'timed' : 'click'} onChange={event => store.updateEvent(source, { durationMs: event.currentTarget.value === 'click' ? 0 : 600 })}><option value="timed">定时停顿</option><option value="click">等待点击</option></select></label>
          {inline.durationMs > 0 && <label className="gc-r0-inspector-field"><span>时长（毫秒）</span><input type="number" min={1} step={50} value={inline.durationMs} onChange={event => { if (event.currentTarget.valueAsNumber > 0) store.updateEvent(source, { durationMs: event.currentTarget.valueAsNumber }); }}/></label>}
        </>}
        {inline.kind === 'sound' && <>
          <label className="gc-r0-inspector-field"><span>音效</span><input value={inline.value} onChange={event => store.updateEvent(source, { value: event.currentTarget.value })}/></label>
          <p className="gc-r0-inspector-help">当前审核作品记录音效触发位置。音频服务待接入。</p>
        </>}
        <div className="gc-r0-inspector-trigger">
          <label className="gc-r0-inspector-field"><span>触发位置</span><strong>{inline.offset === line.text.length ? '句末' : `推进到「${line.text.slice(inline.offset, inline.offset + 1)}」之前`}</strong>
            <input aria-label="触发偏移" title="触发偏移" type="number" min={0} max={line.text.length} value={inline.offset} onChange={event => { if (Number.isFinite(event.currentTarget.valueAsNumber)) store.updateEvent(source, { offset: textBoundary(line.text, event.currentTarget.valueAsNumber) }); }}/></label>
          <div className="gc-r0-inspector-anchor"><span>{line.text.slice(0, inline.offset)}<b>{eventLabel(inline)}</b><em/>{line.text.slice(inline.offset)}</span>
            <button type="button" onClick={() => playOrLocate()}><Crosshair size={15}/>定位锚点</button></div>
        </div>
      </> : pageObject ? <label className="gc-r0-inspector-field"><span>内容</span><input value={pageObject.text} onChange={event => store.edit('修改页面内容', draft => { const item = draft.page.objects.find(item => item.id === pageObject.id); if (item) item.text = event.target.value; }, `page:${pageObject.id}:text`)}/></label>
        : character ? <p className="gc-r0-inspector-help">{part?.source ?? character.description}</p>
        : line && scene ? <>
          <label className="gc-r0-inspector-field"><span>说话人</span><select value={line.speakerId ?? ''} onChange={event => store.edit('更换说话人', draft => {
            const item = draft.scenes.find(item => item.id === scene.id)?.lines.find(item => item.id === line.id); if (item) item.speakerId = event.target.value || null;
          })}><option value="">旁白</option>{project.characters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="gc-r0-inspector-line-events">{line.events.map(event => <button type="button" key={event.id} onClick={() => selectEvent(event.id)}>{eventNames[event.kind]} · {eventLabel(event)}</button>)}</div>
          {!line.events.length && <p className="gc-r0-inspector-help">在文稿正文中定位文字，即可插入句内事件。</p>}
        </> : <p className="gc-r0-inspector-help">选中语句、事件或对象以查看属性。</p>}
    </div>
    {line && <div className="gc-r0-inspector-footer">
      <button className="gc-r0-view-primary" type="button" onClick={() => playOrLocate(true)}><Play size={15}/>{inline ? '预览此事件' : '预览语句'}</button>
      {!inline && <button type="button" onClick={() => playOrLocate()}><Crosshair size={15}/>定位第 {lineNumber} 句</button>}
      <i/>
      {inline && <button type="button" title="删除此事件" onClick={() => {
        store.edit('删除句内事件', draft => { const target = sourceLine(draft, source).line; if (target) target.events = target.events.filter(event => event.id !== inline.id); });
        const previous: Source = { kind: 'line', documentId: source.documentId, id: line.id };
        if (pinned) store.updateUi(state => { state.pins.inspector = previous; }); else store.select(previous);
      }}>删除事件</button>}
      <button type="button" disabled={!canUndo} onClick={() => store.undo()}><Undo2 size={15}/>撤销</button>
    </div>}
  </section>;
}
