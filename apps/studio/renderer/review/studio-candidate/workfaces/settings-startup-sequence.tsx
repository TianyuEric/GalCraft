import { useRef, useState } from 'react';
import { Film, Image, Palette, Play, Trash2, Type } from 'lucide-react';
import { createId, startupClipEnd, StartupClipSchema, type Asset, type StartupClip, type StartupSequence } from '@galcraft/contracts';
import { parseStartupNumber } from '../../../authoring/startup-input.js';
import { CandidateButton, CandidateCheckbox, CandidateColorField, CandidateField, CandidateInput, CandidateSection, CandidateSelect, CandidateTextarea, CandidateToolbar } from '../components/controls/index.js';
import { workfaceError } from './workface-helpers.js';

const kinds = { text: { label: '文字', icon: Type }, color: { label: '纯色', icon: Palette }, image: { label: '图片', icon: Image }, video: { label: '视频', icon: Film } };
type Gesture = { id: string; originX: number; start: number; width: number; duration: number; next: number };

export function CandidateStartupSequence({ sequence, locale, assets, busy, buffers, edit, clear, chooseAsset, onChange, onTransient, preview }: {
  sequence: StartupSequence; locale: string; assets: Asset[]; busy: boolean; buffers: Record<string, string>;
  edit(key: string, value: string): void; clear(prefix: string): void; chooseAsset(kind: 'image' | 'video'): Promise<string | undefined>;
  onChange(sequence: StartupSequence): Promise<boolean>; onTransient(id: string, active: boolean): void; preview(clip: StartupClip): void;
}) {
  const [selected, select] = useState(sequence.clips[0]?.id), [error, setError] = useState('');
  const [issues, setIssues] = useState<Record<string, string>>({});
  const gesture = useRef<Gesture | null>(null);
  const [dragging, setDragging] = useState<{ id: string; start: number }>();
  const current = sequence.clips.find(item => item.id === selected) ?? sequence.clips[0];
  const duration = Math.max(1, ...sequence.clips.map(startupClipEnd));
  const patch = (values: Partial<StartupClip>) => current
    ? onChange({ ...sequence, clips: sequence.clips.map(item => item.id === current.id ? { ...item, ...values } : item) })
    : Promise.resolve(false);
  const place = (id: string, startMs: number) => onChange({ ...sequence, clips: sequence.clips.map(item => item.id === id ? { ...item, startMs } : item) });
  const add = async (kind: StartupClip['kind']) => {
    setError('');
    try {
      const assetId = kind === 'image' || kind === 'video' ? await chooseAsset(kind) : null;
      if (assetId === undefined) return;
      const next = StartupClipSchema.parse({
        id: createId(), kind, name: kinds[kind].label, assetId, startMs: Math.max(0, ...sequence.clips.map(startupClipEnd)),
        text: { [locale]: '作者说明' }, color: kind === 'color' ? '#000000' : '#ffffff',
      });
      if (await onChange({ ...sequence, clips: [...sequence.clips, next] })) select(next.id);
    } catch (reason) { setError(workfaceError(reason)); }
  };
  const cancelDrag = () => {
    if (!gesture.current) return;
    gesture.current = null; setDragging(undefined); onTransient('sequence-drag', false);
  };
  const number = (key: string, label: string, unit: string, value: number, apply: (value: number) => void, step = 1, max?: number) => {
    const id = 'sequence/' + key;
    return <CandidateField label={label} unit={unit} error={issues[id]} className="candidate-settings-number">
      <CandidateInput disabled={busy} inputMode={step === 1 ? 'numeric' : 'decimal'} value={buffers[id] ?? String(value)}
        onChange={event => edit(id, event.target.value)} onBlur={event => {
          if (!Object.hasOwn(buffers, id)) return;
          const next = parseStartupNumber(event.target.value.trim(), { step, max });
          if (next === null || next === undefined) { setIssues(previous => ({ ...previous, [id]: '请输入有效数值。' })); return; }
          setIssues(previous => { const next = { ...previous }; delete next[id]; return next; });
          clear(id); if (next !== value) apply(next);
        }}/>
    </CandidateField>;
  };
  const nameKey = 'sequence/' + current?.id + '/name';
  const moveEarlier = () => {
    if (!current) return;
    const index = sequence.clips.findIndex(item => item.id === current.id);
    if (index <= 0) return;
    const clips = [...sequence.clips];
    [clips[index - 1], clips[index]] = [clips[index]!, clips[index - 1]!];
    void onChange({ ...sequence, clips });
  };
  return <CandidateSection title="开屏片段序列" className="candidate-startup-sequence">
    <CandidateToolbar label="添加开屏片段">
      {(Object.keys(kinds) as StartupClip['kind'][]).map(kind => {
        const Icon = kinds[kind].icon;
        return <CandidateButton key={kind} variant="outline" disabled={busy} onClick={() => void add(kind)}><Icon size={14}/>添加{kinds[kind].label}</CandidateButton>;
      })}
    </CandidateToolbar>
    <div className="animation-scroll" tabIndex={0} aria-label="开屏时序滚动区">
      <div style={{ minWidth: Math.max(440, duration / 40) }}>
        <div className="startup-sequence-ruler"><span>0 ms</span><span>{duration} ms</span></div>
        {sequence.clips.map(item => {
          const start = dragging?.id === item.id ? dragging.start : item.startMs;
          return <div className="startup-sequence-row" key={item.id}>
            <CandidateButton aria-pressed={item.id === current?.id} onClick={() => select(item.id)}>{item.name}</CandidateButton>
            <div><CandidateButton className="candidate-startup-timeline-clip" aria-label={item.name + ' ' + start + ' ms'} onClick={() => select(item.id)}
              style={{ marginInlineStart: start / duration * 100 + '%', width: (startupClipEnd(item) - item.startMs) / duration * 100 + '%' }}
              onPointerDown={event => {
                if (busy || event.button !== 0) return;
                select(item.id); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
                const width = event.currentTarget.parentElement!.getBoundingClientRect().width;
                gesture.current = { id: item.id, originX: event.clientX, start: item.startMs, width, duration, next: item.startMs };
              }}
              onPointerMove={event => {
                const active = gesture.current;
                if (!active || active.id !== item.id) return;
                active.next = Math.max(0, Math.round(active.start + (event.clientX - active.originX) / active.width * active.duration));
                setDragging({ id: item.id, start: active.next }); onTransient('sequence-drag', true);
              }}
              onPointerUp={() => {
                const active = gesture.current;
                if (!active) return;
                cancelDrag();
                if (active.next !== active.start) void place(active.id, active.next);
              }}
              onLostPointerCapture={cancelDrag} onPointerCancel={cancelDrag} onKeyDown={event => {
                if (event.key === 'Escape' && gesture.current) { event.preventDefault(); event.stopPropagation(); cancelDrag(); }
                else if (!busy && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                  event.preventDefault();
                  void place(item.id, Math.max(0, item.startMs + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 100 : 10)));
                }
              }}>{start}–{start + startupClipEnd(item) - item.startMs} ms</CandidateButton></div>
          </div>;
        })}
      </div>
    </div>
    {current ? <CandidateSection title="片段属性" actions={<CandidateToolbar label="片段操作">
      <CandidateButton disabled={busy} onClick={() => preview(current)}><Play size={14}/>预览此段</CandidateButton>
      <CandidateButton disabled={busy || sequence.clips[0]?.id === current.id} onClick={moveEarlier}>前移图层</CandidateButton>
      <CandidateButton variant="danger" disabled={busy} onClick={() => {
        clear('sequence/' + current.id);
        void onChange({ ...sequence, clips: sequence.clips.filter(item => item.id !== current.id) });
      }}><Trash2 size={14}/>删除片段</CandidateButton>
    </CandidateToolbar>}>
      <CandidateField label="片段名称" error={issues[nameKey]}>
        <CandidateInput disabled={busy} value={buffers[nameKey] ?? current.name} onChange={event => edit(nameKey, event.target.value)} onBlur={event => {
          if (!Object.hasOwn(buffers, nameKey)) return;
          const name = event.target.value.trim();
          if (!name) { setIssues(previous => ({ ...previous, [nameKey]: '请填写片段名称。' })); return; }
          setIssues(previous => { const next = { ...previous }; delete next[nameKey]; return next; });
          clear(nameKey); if (name !== current.name) void patch({ name });
        }}/>
      </CandidateField>
      <div className="candidate-settings-inline">
        {number(current.id + '/start', '出现时刻', 'ms', current.startMs, startMs => void patch({ startMs }))}
        {number(current.id + '/in', '淡入', 'ms', current.fadeInMs, fadeInMs => void patch({ fadeInMs }))}
        {number(current.id + '/hold', '停留', 'ms', current.holdMs, holdMs => void patch({ holdMs }))}
        {number(current.id + '/out', '淡出', 'ms', current.fadeOutMs, fadeOutMs => void patch({ fadeOutMs }))}
      </div>
      {current.kind === 'text' && <CandidateField label="说明文字" className="candidate-settings-long">
        <CandidateTextarea rows={2} value={current.text[locale] ?? ''} onChange={event => void patch({ text: { ...current.text, [locale]: event.target.value } })}/>
      </CandidateField>}
      {(current.kind === 'text' || current.kind === 'color') && <div className="candidate-settings-color"><span>片段颜色</span>
        <CandidateColorField key={current.id} label="片段颜色" value={current.color} locale={locale} allowAlpha disabled={busy}
          onPreview={() => {}} onSession={active => onTransient('sequence-clip-color', active)}
          onCommit={async color => { if (!await patch({ color })) throw new Error('片段颜色尚未应用。'); }}/>
      </div>}
      {current.assetId && <>
        <p className="candidate-settings-hint">{assets.find(item => item.id === current.assetId)?.name ?? '素材不可用'}</p>
        <CandidateField label="片段适配"><CandidateSelect value={current.fit} disabled={busy} onValueChange={fit => void patch({ fit: fit as StartupClip['fit'] })}>
          <option value="contain">完整显示</option><option value="cover">填满并裁切</option><option value="fill">拉伸</option>
        </CandidateSelect></CandidateField>
      </>}
      {current.kind === 'video' && <div className="candidate-settings-inline">
        {number(current.id + '/source', '视频起点', 's', current.startSec, startSec => void patch({ startSec }), .01)}
        {number(current.id + '/volume', '片段音量', '%', current.volume * 100, volume => void patch({ volume: volume / 100 }), .01, 100)}
      </div>}
    </CandidateSection> : <p className="candidate-settings-hint">添加片段开始编排。</p>}
    <CandidateSection title="序列播放">
      <div className="candidate-settings-color"><span>序列背景</span><CandidateColorField label="序列背景" value={sequence.background} locale={locale} allowAlpha disabled={busy}
        onPreview={() => {}} onSession={active => onTransient('sequence-background-color', active)}
        onCommit={async background => { if (!await onChange({ ...sequence, background })) throw new Error('序列背景尚未应用。'); }}/></div>
      <CandidateField label="标题页揭示方式" layout="row"><CandidateSelect value={sequence.revealMode} disabled={busy} onValueChange={revealMode => void onChange({ ...sequence, revealMode: revealMode as StartupSequence['revealMode'] })}>
        <option value="afterClips">片段结束后淡出背景</option><option value="withLastClip">与最后片段同层淡出</option>
      </CandidateSelect></CandidateField>
      {sequence.revealMode === 'afterClips' ? number('reveal', '揭示主页', 'ms', sequence.revealMs, revealMs => void onChange({ ...sequence, revealMs }))
        : <p className="candidate-settings-hint">标题页资源就绪后开始计时，最后片段的淡出时长控制整个开屏层。</p>}
      <label className="candidate-settings-check"><CandidateCheckbox checked={sequence.allowSkip} disabled={busy}
        onChange={event => void onChange({ ...sequence, allowSkip: event.target.checked })}/>允许右键或 Esc 结束开屏</label>
    </CandidateSection>
    {error && <p role="alert">{error}</p>}
  </CandidateSection>;
}
