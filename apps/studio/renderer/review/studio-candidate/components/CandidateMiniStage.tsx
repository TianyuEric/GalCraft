import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Eye, Pause, Play, Square, Volume2, VolumeX } from 'lucide-react';
import { type MiniStage, type MiniStageWorkbenchState } from '../../../authoring/mini-stage.js';
import { CandidateButton, CandidateField, CandidateIconButton, CandidateInput, CandidateSelect, CandidateToolbar } from './controls/index.js';
import '../styles/mini-stage.css';

/** One set of candidate controls for the same live MiniStage used by both consumers. */
export function mountCandidateMiniStageControls(stage: MiniStage) {
  const host = document.createElement('div');
  host.className = 'candidate-mini-stage-chrome';
  const root = createRoot(host);
  stage.root.prepend(host);
  const release = stage.useWorkbenchControls(state => root.render(<StageControls stage={stage} state={state}/>));
  return () => { release(); host.remove(); queueMicrotask(() => root.unmount()); };
}

function StageControls({ stage, state }: { stage: MiniStage; state: MiniStageWorkbenchState }) {
  return <>
    <CandidateToolbar label="Player 运行控制" className="candidate-mini-stage-transport">
      <CandidateButton disabled={!state.hasTarget} aria-pressed={state.mode === 'inspection'} onClick={() => stage.run('inspection')}><Eye size={14}/>定位检查</CandidateButton>
      <CandidateButton disabled={!state.hasTarget} aria-pressed={state.mode === 'current'} onClick={() => stage.run('current')}><Play size={14}/>播放当前</CandidateButton>
      <CandidateButton disabled={!state.hasTarget} aria-pressed={state.mode === 'playtest'} onClick={() => stage.run('playtest')}><Play size={14}/>从此处试玩</CandidateButton>
      <span className="candidate-mini-stage-separator"/>
      <CandidateIconButton label={state.paused ? '继续播放' : '暂停播放'} disabled={!state.ready || state.mode === 'inspection'} onClick={() => stage.pauseOrResume()}>{state.paused ? <Play size={14}/> : <Pause size={14}/>}</CandidateIconButton>
      <CandidateIconButton label="停止播放" disabled={!state.hasTarget || state.mode === 'inspection'} onClick={() => stage.stop()}><Square size={14}/></CandidateIconButton>
      <CandidateIconButton label={state.muted ? '开启预览声音' : '关闭预览声音'} aria-pressed={!state.muted} onClick={() => stage.setMuted(!state.muted)}>{state.muted ? <VolumeX size={14}/> : <Volume2 size={14}/>}</CandidateIconButton>
    </CandidateToolbar>
    {state.entry && <CandidateField label="预览入口" layout="row" className="candidate-mini-stage-entry">
      <CandidateSelect density="compact" value={state.entry.value} onValueChange={value => stage.selectEntry(value)}>{state.entry.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</CandidateSelect>
    </CandidateField>}
    {(state.route.length > 0 || state.input) && <div className="candidate-mini-stage-route">
      {state.input && <RouteInput key={state.input.label} input={state.input}/>}
      {state.route.length > 0 && <CandidateToolbar label="预览路线">{state.route.map(action => <CandidateButton key={action.id} onClick={action.run}>{action.label}</CandidateButton>)}</CandidateToolbar>}
    </div>}
  </>;
}

function RouteInput({ input }: { input: NonNullable<MiniStageWorkbenchState['input']> }) {
  const [text, setText] = useState('');
  return <form className="candidate-mini-stage-input" onSubmit={event => { event.preventDefault(); input.submit(text); }}>
    <CandidateField label={input.label}><CandidateInput value={text} placeholder={input.placeholder} onChange={event => setText(event.target.value)}/></CandidateField>
    <CandidateButton type="submit" variant="primary">采用输入</CandidateButton>
  </form>;
}
