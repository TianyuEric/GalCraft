import { CandidateButton, CandidateField, CandidateFieldGroup, CandidateIconButton, CandidateInput, CandidateObjectRow, CandidateSection, CandidateSelect, CandidateState, CandidateToolbar } from '../components/controls/index.js';
import { Crosshair, Play, Settings2, Smile, Trash2, Undo2 } from 'lucide-react';
import { useCandidate, useCandidateState } from '../application/context.js';
import { expressionNames, sourceLine, sourceTitle, type Expression, type InlineEvent, type Source } from '../../../studio-r0/model.js';
import { eventLabel, eventNames, imageForExpression, speakerName, textBoundary, textProgressOffsets } from '../../../studio-r0/views/view-details.js';
import { CandidateSourceBinding } from '../components/CandidateSourceBinding.js';
import { CandidateShortNumber } from './CandidateShortNumber.js';
import '../styles/inspector.css';

type Props = { onOpen?: (viewId: string) => void };
const firstExpressions: Expression[] = ['neutral', 'smile', 'surprised'];

export function CandidateInspectorView({ onOpen }: Props = {}) {
  const store = useCandidate(), { project, ui } = useCandidateState();
  const source = store.source('inspector'), pinned = Boolean(ui.pins.inspector);
  const { canUndo } = store.history(source.documentId);
  const { scene, line } = sourceLine(project, source);
  const inline = source.kind === 'event' ? line?.events.find(event => event.id === source.id) : undefined;
  const targetCharacter = project.characters.find(item => item.id === inline?.characterId);
  const lineNumber = scene && line ? scene.lines.indexOf(line) + 1 : 0;
  const typeTitle = inline ? `${inline.kind === 'expression' && targetCharacter ? targetCharacter.name + ' · ' : ''}${eventNames[inline.kind]}事件`
    : line ? `${speakerName(project, line.speakerId)} · 语句` : '属性';
  const triggerText = line && inline ? line.text.slice(inline.offset, textProgressOffsets(line.text).find(offset => offset > inline.offset)) : '';
  function updateEvent(patch: Partial<Pick<InlineEvent, 'characterId' | 'value' | 'durationMs' | 'offset'>>) {
    store.edit('修改句内事件', draft => {
      const target = sourceLine(draft, source).line;
      const event = target?.events.find(item => item.id === source.id);
      if (target && event) {
        Object.assign(event, patch, { offset: textBoundary(target.text, patch.offset ?? event.offset) });
      }
    });
  }
  const playOrLocate = (preview = false) => {
    if (!scene || !line) return;
    const offset = inline?.offset ?? 0;
    if (preview) {
      const stageSource = store.source('stage');
      const boundStage = sourceLine(project, stageSource);
      if (ui.pins.stage && (boundStage.scene?.id !== scene.id || boundStage.line?.id !== line.id)) {
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
  return <section className="gc-candidate-inspector-view">
    <header className="gc-candidate-inspector-heading">
      {inline?.kind === 'expression' ? <Smile size={16}/> : <Settings2 size={16}/>}
      <h2 title={typeTitle}>{typeTitle}</h2>
    </header>
    <CandidateSourceBinding panel="inspector" description={sourceTitle(project, source)} available={Boolean(line)}
      onLocate={() => { if (line) { store.revealLine(source.documentId, line.id); onOpen?.(`writing:${source.documentId}`); } }}/>
    <div className="gc-candidate-inspector-body">
      {inline && line ? <>
        <CandidateFieldGroup title="事件参数">
          {inline.kind === 'expression' && <>
            <CandidateField label="角色" layout="row">
              <CandidateSelect density="compact" value={inline.characterId ?? ''} onValueChange={characterId => updateEvent({ characterId })}>
                {!inline.characterId && <option value="" disabled>选择角色</option>}
                {project.characters.filter(item => scene?.cast[item.id]?.visible || item.id === inline.characterId).map(item =>
                  <option key={item.id} value={item.id}>{item.name}</option>)}
              </CandidateSelect>
            </CandidateField>
            <CandidateField label="目标表情" layout="row">
              <CandidateSelect density="compact" aria-label="全部表情" value={inline.value} onValueChange={value => updateEvent({ value })}>
                {Object.entries(expressionNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </CandidateSelect>
            </CandidateField>
            <CandidateToolbar className="gc-candidate-inspector-expression-options" label="常用表情">
              {firstExpressions.map(expression => {
                const thumbnail = imageForExpression(project, inline.characterId, expression);
                return <CandidateButton aria-pressed={inline.value === expression} key={expression} title={expressionNames[expression]} onClick={() => updateEvent({ value: expression })}>
                  {thumbnail && <span className="gc-candidate-inspector-thumbnail"><img alt="" src={thumbnail}/></span>}
                  <span>{expressionNames[expression]}</span>
                </CandidateButton>;
              })}
            </CandidateToolbar>
          </>}
          {inline.kind === 'pause' && <>
            <CandidateField label="推进方式" layout="row">
              <CandidateSelect density="compact" value={inline.durationMs ? 'timed' : 'click'} onValueChange={mode => updateEvent({ durationMs: mode === 'click' ? 0 : 600 })}>
                <option value="timed">定时停顿</option><option value="click">等待点击</option>
              </CandidateSelect>
            </CandidateField>
            {inline.durationMs > 0 && <CandidateField label="时长" layout="row" unit="ms">
              <CandidateShortNumber key={inline.id} className="gc-candidate-inspector-short" min={1} step={50} value={inline.durationMs}
                onValueChange={durationMs => updateEvent({ durationMs })}/>
            </CandidateField>}
          </>}
          {inline.kind === 'sound' && <CandidateField label="音效" layout="row" hint="句内预览记录音效名称与触发位置。">
            <CandidateInput density="compact" value={inline.value} onChange={event => updateEvent({ value: event.currentTarget.value })}/>
          </CandidateField>}
        </CandidateFieldGroup>
        <CandidateSection title="触发位置" className="gc-candidate-inspector-trigger">
          <CandidateField label="触发偏移" layout="row" hint={triggerText ? `推进到「${triggerText}」之前` : '句末'}>
            <CandidateShortNumber key={inline.id} className="gc-candidate-inspector-short" title="触发偏移" min={0} max={line.text.length} value={inline.offset}
              onValueChange={offset => updateEvent({ offset })}/>
          </CandidateField>
          <div className="gc-candidate-inspector-anchor">
            <span title={line.text}>{line.text.slice(0, inline.offset)}<b>{eventLabel(inline)}</b><em/>{line.text.slice(inline.offset)}</span>
            <CandidateIconButton label="定位锚点" onClick={() => playOrLocate()}><Crosshair size={15}/></CandidateIconButton>
          </div>
        </CandidateSection>
      </> : line && scene ? <>
        <CandidateField label="说话人" layout="row">
          <CandidateSelect density="compact" value={line.speakerId ?? ''} onValueChange={value => store.edit('更换说话人', draft => {
            const item = draft.scenes.find(item => item.id === scene.id)?.lines.find(item => item.id === line.id);
            if (item) item.speakerId = value || null;
          })}><option value="">旁白</option>{project.characters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</CandidateSelect>
        </CandidateField>
        <CandidateSection title="句内事件" className="gc-candidate-inspector-events">
          {line.events.length ? line.events.map(event => <CandidateObjectRow key={event.id} title={eventNames[event.kind]}
            metadata={eventLabel(event)} onActivate={() => selectEvent(event.id)}/>)
            : <p className="gc-candidate-inspector-help">在文稿正文中定位文字，即可插入句内事件。</p>}
        </CandidateSection>
      </> : <CandidateState kind="empty" title="选择语句或句内事件" description="属性会随文稿中的选择更新。"/>}
    </div>
    {line && <CandidateToolbar className="gc-candidate-inspector-footer" label="属性操作">
      <CandidateButton variant="primary" onClick={() => playOrLocate(true)}><Play size={15}/>{inline ? '预览此事件' : '预览语句'}</CandidateButton>
      {!inline && <CandidateButton onClick={() => playOrLocate()}><Crosshair size={15}/>定位第 {lineNumber} 句</CandidateButton>}
      <span className="gc-candidate-view-spacer"/>
      {inline && <CandidateIconButton label="删除事件" title="删除此事件" onClick={() => {
        store.edit('删除句内事件', draft => { const target = sourceLine(draft, source).line; if (target) target.events = target.events.filter(event => event.id !== inline.id); });
        const previous: Source = { kind: 'line', documentId: source.documentId, id: line.id };
        if (pinned) store.updateUi(state => { state.pins.inspector = previous; }); else store.select(previous);
      }}><Trash2 size={15}/></CandidateIconButton>}
      <CandidateIconButton label="撤销" disabled={!canUndo} onClick={() => store.undo(source.documentId)}><Undo2 size={15}/></CandidateIconButton>
    </CandidateToolbar>}
  </section>;
}
