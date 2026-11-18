import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createId, StartupClipSchema, StartupSequenceSchema, startupClipEnd, type Asset, type StartupClip, type StartupSequence } from '@galcraft/contracts';
import { Button, Choice, Field } from '../components/controls.js';
import { Input } from '../components/ui/input.js';
import { StudioColorField, type ColorInputDraft } from '../components/editor-fields/StudioColorField.js';
import { Type, Palette, Image, Film } from 'lucide-react';

export type StartupSequenceInput = { applyCurrent(): Promise<boolean>; isComposing(): boolean };
export type StartupSequenceDraft = { selected?: string; buffers: Record<string, string>; colors: Record<string, ColorInputDraft> };

export function StartupColorInput({ label, value, locale, draftKey, drafts, onChange, onDraftChange, onColorDraftChange }: {
  label: string; value: string; locale: string; draftKey: string; drafts: Map<string, ColorInputDraft>;
  onChange(value: string): unknown; onDraftChange(dirty: boolean): void; onColorDraftChange?(): void;
}) {
  const restored = useRef(drafts.get(draftKey));
  return <Field label={label}><StudioColorField label={label} value={value} locale={locale} allowAlpha inputDraft={restored.current}
    onPreview={() => {}} onCommit={async next => {
      if (await onChange(next) === false) throw new Error(locale === 'en' ? 'Color was not applied. Resolve the form error and retry.' : locale === 'ja' ? '色を適用できませんでした。フォームのエラーを修正して再試行してください。' : '颜色未应用，请修复表单错误后重试。');
    }} onSession={onDraftChange} onInputDraftChange={draft => {
      if (draft) drafts.set(draftKey, draft); else drafts.delete(draftKey);
      onColorDraftChange?.();
    }}/></Field>;
}

export function StartupSequenceEditor({ sequence, locale, assets, visible = true, active = visible, onChange, chooseAsset, preview, onDraftChange, registerInput, revealInput, guiDraft, onGuiDraftChange }: {
  sequence: StartupSequence; locale: string; assets: Asset[];
  visible?: boolean; active?: boolean;
  onChange(sequence: StartupSequence): void | Promise<unknown>; chooseAsset(): Promise<string | null>;
  preview(clip: StartupClip): void; onDraftChange?(dirty: boolean): void;
  registerInput?(input: StartupSequenceInput | null): void; revealInput?(): void;
  guiDraft?: StartupSequenceDraft; onGuiDraftChange?(draft: StartupSequenceDraft): void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [selected, select] = useState<string | undefined>(guiDraft?.selected ?? sequence.clips[0]?.id), [error, setError] = useState('');
  const [buffers, setBuffers] = useState<Record<string, string>>(guiDraft?.buffers ?? {});
  const drag = useRef<{ id: string; x: number; start: number; width: number; duration: number; next: number } | null>(null);
  const [dragTime, setDragTime] = useState<{ id: string; start: number } | null>(null);
  const root = useRef<HTMLElement>(null), composing = useRef(false), current = useRef(sequence), pending = useRef(Promise.resolve(true));
  const bufferValues = useRef(buffers), colors = useRef(new Set(Object.keys(guiDraft?.colors ?? {})));
  const colorDrafts = useRef(new Map(Object.entries(guiDraft?.colors ?? {})));
  const numberInputs = useRef(new Map<string, { seconds: boolean; apply(value: number): unknown; element: HTMLInputElement | null }>());
  const invalidNumber = useRef<string | null>(null);
  const applyingInputs = useRef<Promise<boolean> | null>(null);
  useLayoutEffect(() => {
    if (!visible || !invalidNumber.current) return;
    numberInputs.current.get(invalidNumber.current)?.element?.focus();
    invalidNumber.current = null;
  });
  current.current = sequence;
  const capture = () => onGuiDraftChange?.({ selected, buffers: bufferValues.current, colors: Object.fromEntries(colorDrafts.current) });
  useEffect(capture, [selected, buffers, onGuiDraftChange]);
  const report = () => onDraftChange?.(Object.keys(bufferValues.current).length > 0 || colors.current.size > 0 || !!drag.current);
  const updateBuffers = (next: Record<string, string>) => { bufferValues.current = next; setBuffers(next); report(); };
  const colorPending = (key: string, active: boolean) => { if (active) colors.current.add(key); else colors.current.delete(key); report(); };
  const clip = sequence.clips.find(clip => clip.id === selected) ?? sequence.clips[0];
  const commit = (next: StartupSequence): Promise<boolean> => {
    const checked = StartupSequenceSchema.safeParse(next);
    if (!checked.success) { setError(checked.error.issues.map(issue => issue.message).join(' · ')); return Promise.resolve(false); }
    setError(''); current.current = checked.data;
    const task = Promise.resolve().then(async () => await onChange(checked.data) !== false);
    pending.current = task.catch(reason => { setError(reason instanceof Error ? reason.message : String(reason)); return false; });
    return pending.current;
  };
  const patch = (values: Partial<StartupClip>) => { if (clip) return commit({ ...current.current, clips: current.current.clips.map(item => item.id === clip.id ? { ...item, ...values } : item) }); };
  const validateNumber = (key: string, raw: string) => {
    const input = numberInputs.current.get(key), next = raw === '' ? NaN : Number(raw);
    if (!input || !Number.isFinite(next) || next < 0 || !input.seconds && !Number.isInteger(next)) {
      setError(t('请填写非负有效数值。当前草稿和有效预览已保留。', 'Enter a valid nonnegative value. The draft and valid preview remain.', '有効な正の値を入力してください。入力とプレビューを保持します。'));
      return undefined;
    }
    return next;
  };
  const confirmNumber = async (key: string, raw: string) => {
    if (composing.current) return false;
    const next = validateNumber(key, raw); if (next === undefined) return false;
    if (await numberInputs.current.get(key)!.apply(next) === false) return false;
    if (bufferValues.current[key] === raw) { const remaining = { ...bufferValues.current }; delete remaining[key]; updateBuffers(remaining); }
    return true;
  };
  const applyCurrent = () => {
    if (composing.current) return Promise.resolve(false);
    if (applyingInputs.current) return applyingInputs.current;
    const task = Promise.resolve().then(applyInputs).finally(() => { applyingInputs.current = null; });
    applyingInputs.current = task; return task;
  };
  const applyInputs = async () => {
    if (composing.current) return false;
    await pending.current;
    const color = colors.current.values().next().value;
    if (color || drag.current) {
      if (color?.startsWith('clip:')) select(color.slice('clip:'.length));
      revealInput?.(); return false;
    }
    const revealNumber = (key: string) => {
      const element = numberInputs.current.get(key)?.element;
      if (visible && element) element.focus();
      else {
        invalidNumber.current = key;
        const clipId = key.split('.')[0];
        if (clipId && clipId !== 'reveal') select(clipId);
        revealInput?.();
      }
      return false;
    };
    const entries = Object.entries(bufferValues.current);
    for (const [key, raw] of entries) if (validateNumber(key, raw) === undefined) return revealNumber(key);
    for (const [key, raw] of entries) if (!await confirmNumber(key, raw)) return revealNumber(key);
    await pending.current;
    return !composing.current && !Object.keys(bufferValues.current).length && !colors.current.size && !drag.current;
  };
  useEffect(() => { registerInput?.({ applyCurrent, isComposing: () => composing.current }); return () => registerInput?.(null); });
  const number = (key: string, label: string, value: number, apply: (value: number) => unknown, seconds = false) => {
    const input = { seconds, apply, element: null as HTMLInputElement | null }; numberInputs.current.set(key, input);
    return <Field label={label}><Input ref={element => { input.element = element as HTMLInputElement | null; }} type="number" min={0} step={seconds ? .01 : 1} aria-label={label} value={buffers[key] ?? value}
      onChange={event => updateBuffers({ ...bufferValues.current, [key]: event.target.value })}
      onBlur={event => { if (key in bufferValues.current) void confirmNumber(key, event.target.value); }}/></Field>;
  };
  const types = [['text', t('文字', 'Text', '文字')], ['color', t('纯色底', 'Color', '単色')], ['image', t('图片', 'Image', '画像')], ['video', t('视频', 'Video', '動画')]];
  const add = async (kind: string) => { let assetId: string | null = null; if (['image', 'video'].includes(kind)) { assetId = await chooseAsset(); if (!assetId) return;
      const asset = assets.find(asset => asset.id === assetId); if (asset && asset.kind !== kind) { setError(t('素材类型与片段不符。', 'The resource type does not match the clip.', '素材の種類が一致しません。')); return; } }
    const next = StartupClipSchema.parse({ id: createId(), kind, name: types.find(([value]) => value === kind)![1], assetId,
      startMs: Math.max(0, ...sequence.clips.map(startupClipEnd)), text: { [locale]: t('作者说明', 'Author notice', '作者の案内') }, color: kind === 'color' ? '#000000' : '#ffffff' });
    commit({ ...sequence, clips: [...sequence.clips, next] }); select(next.id); };
  const removeClip = async (id: string) => {
    if (!await commit({ ...current.current, clips: current.current.clips.filter(item => item.id !== id) })) return;
    const prefix = `${id}.`;
    for (const key of numberInputs.current.keys()) if (key.startsWith(prefix)) numberInputs.current.delete(key);
    colors.current.delete(`clip:${id}`);
    colorDrafts.current.delete(`clip:${id}`);
    updateBuffers(Object.fromEntries(Object.entries(bufferValues.current).filter(([key]) => !key.startsWith(prefix))));
    select(previous => previous === id ? undefined : previous);
  };
  const duration = Math.max(1, ...sequence.clips.map(startupClipEnd));
  const icons = { text: Type, color: Palette, image: Image, video: Film };
  const cancelDrag = () => { drag.current = null; setDragTime(null); report(); };
  return <section ref={root} className="startup-sequence" hidden={!visible} style={visible ? undefined : { display: 'none' }} aria-label={t('开屏片段序列', 'Startup clip sequence', '起動画面シーケンス')}
    onCompositionStartCapture={() => { composing.current = true; }} onCompositionEndCapture={() => { composing.current = false; }}>
    <header className="startup-clip-heading">
      <h3>{t('开屏片段', 'Startup clips', '起動画面クリップ')}</h3>
      <div className="gc-actions">{types.map(([kind, label]) => { const Icon = icons[kind as keyof typeof icons]; return <Button key={kind} onClick={() => void add(kind!)}><Icon size={16}/>{t('添加', 'Add', '追加')} {label}</Button>; })}</div>
    </header>
    <div className="animation-scroll" tabIndex={0} aria-label={t('开屏时序滚动区', 'Scrollable startup timing', '起動画面の時刻スクロール')}><div style={{ minWidth: Math.max(620, duration / 40) }}>
      <div className="startup-sequence-ruler"><span>0 ms</span><span>{duration} ms</span></div>
      {sequence.clips.map(item => { const start = dragTime?.id === item.id ? dragTime.start : item.startMs; return <div className="startup-sequence-row" key={item.id}><button aria-pressed={item.id === clip?.id} onClick={() => select(item.id)}>{item.name}</button><div><button aria-label={`${item.name} ${start} ms`} onClick={() => select(item.id)} style={{ marginLeft: `${start / duration * 100}%`, width: `${(startupClipEnd(item) - item.startMs) / duration * 100}%`, touchAction: 'none' }}
        onPointerDown={event => { if (event.button !== 0) return; select(item.id); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: item.id, x: event.clientX, start: item.startMs, next: item.startMs, width: event.currentTarget.parentElement!.getBoundingClientRect().width, duration }; }}
        onPointerMove={event => { const gesture = drag.current; if (!gesture || gesture.id !== item.id) return; gesture.next = Math.max(0, Math.round(gesture.start + (event.clientX - gesture.x) / gesture.width * gesture.duration)); setDragTime({ id: item.id, start: gesture.next }); onDraftChange?.(true); }}
        onPointerUp={() => { const gesture = drag.current; if (!gesture) return; drag.current = null; setDragTime(null); if (gesture.next !== gesture.start) commit({ ...sequence, clips: sequence.clips.map(value => value.id === gesture.id ? { ...value, startMs: gesture.next } : value) }); report(); }}
        onPointerCancel={cancelDrag} onKeyDown={event => { if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopPropagation(); cancelDrag(); } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); commit({ ...sequence, clips: sequence.clips.map(value => value.id === item.id ? { ...value, startMs: Math.max(0, value.startMs + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 100 : 10)) } : value) }); } }}
        >{start}–{start + startupClipEnd(item) - item.startMs} ms</button></div></div>; })}
    </div></div>
    {clip ? <section className="startup-clip-editor" key={clip.id} aria-label={t('当前片段', 'Current clip', '現在のクリップ')}>
      <header className="startup-clip-heading"><h3>{clip.name}</h3><div className="gc-actions"><Button onClick={() => preview(clip)}>{t('预览此段', 'Preview clip', 'クリップをプレビュー')}</Button><Button disabled={sequence.clips[0]?.id === clip.id} onClick={() => { const index = sequence.clips.findIndex(item => item.id === clip.id); if (index <= 0) return; const clips = [...sequence.clips]; [clips[index - 1], clips[index]] = [clips[index]!, clips[index - 1]!]; commit({ ...sequence, clips }); }}>{t('前移图层', 'Move layer earlier', 'レイヤーを前へ')}</Button><Button tone="danger" onClick={() => void removeClip(clip.id)}>{t('删除片段', 'Delete clip', 'クリップ削除')}</Button></div></header>
      <div className="startup-clip-properties">
      <Field label={t('片段名称', 'Clip name', 'クリップ名')}><Input aria-label={t('片段名称', 'Clip name', 'クリップ名')} value={clip.name} onChange={event => patch({ name: event.target.value })}/></Field>
      {number(`${clip.id}.start`, t('出现时刻 · ms', 'Start time · ms', '開始時刻・ms'), clip.startMs, startMs => patch({ startMs }))}
      {number(`${clip.id}.in`, t('片段淡入 · ms', 'Clip fade in · ms', 'フェードイン・ms'), clip.fadeInMs, fadeInMs => patch({ fadeInMs }))}
      {number(`${clip.id}.hold`, t('片段停留 · ms', 'Clip hold · ms', '表示時間・ms'), clip.holdMs, holdMs => patch({ holdMs }))}
      {number(`${clip.id}.out`, t('片段淡出 · ms', 'Clip fade out · ms', 'フェードアウト・ms'), clip.fadeOutMs, fadeOutMs => patch({ fadeOutMs }))}
      {clip.kind === 'text' && <Field name="clip-text" label={t('说明文字', 'Notice text', '案内文')}><textarea aria-label={t('说明文字', 'Notice text', '案内文')} value={clip.text[locale] ?? ''} onChange={event => patch({ text: { ...clip.text, [locale]: event.target.value } })}/></Field>}
      {active && ['text', 'color'].includes(clip.kind) && <StartupColorInput draftKey={`clip:${clip.id}`} drafts={colorDrafts.current} onDraftChange={dirty => colorPending(`clip:${clip.id}`, dirty)} onColorDraftChange={capture} label={t('片段颜色', 'Clip color', 'クリップ色')} value={clip.color} locale={locale} onChange={color => patch({ color })}/>}
      {clip.assetId && <><p>{assets.find(asset => asset.id === clip.assetId)?.name ?? t('素材不可用', 'Missing asset', '素材がありません')}</p><Choice label={t('片段适配', 'Clip fit', 'クリップ表示')} value={clip.fit} options={['contain', 'cover', 'fill'].map(value => ({ value, label: value }))} onChange={fit => patch({ fit: fit as StartupClip['fit'] })}/></>}
      {clip.kind === 'video' && <>{number(`${clip.id}.source`, t('视频起点 · s', 'Video start · s', '動画開始・s'), clip.startSec, startSec => patch({ startSec }), true)}
        {number(`${clip.id}.volume`, t('片段音量 · %', 'Clip volume · %', 'クリップ音量・%'), clip.volume * 100, value => patch({ volume: value / 100 }), true)}</>}
      </div>
    </section> : <p>{t('添加片段开始编排。', 'Add a clip to begin.', 'クリップを追加してください。')}</p>}
    <section className="startup-sequence-options">
      <h3>{t('从开屏进入主页', 'Transition to home', 'ホームへの切り替え')}</h3>
      {active && <StartupColorInput draftKey="background" drafts={colorDrafts.current} onDraftChange={dirty => colorPending('background', dirty)} onColorDraftChange={capture} label={t('序列背景', 'Sequence background', 'シーケンス背景')} value={sequence.background} locale={locale} onChange={background => commit({ ...sequence, background })}/>}
      <Field label={t('标题页揭示方式','Title reveal','タイトルの表示')}>
        <Choice label={t('标题页揭示方式','Title reveal','タイトルの表示')} value={sequence.revealMode} options={[{value:'afterClips',label:t('片段结束后淡出背景','Fade background after clips','クリップ終了後に背景をフェード')},{value:'withLastClip',label:t('与最后片段同层淡出','Fade the final clip and background together','最後のクリップと背景を同時にフェード')}]} onChange={value=>commit({...sequence,revealMode:value as StartupSequence['revealMode']})}/>
      </Field>
      {sequence.revealMode==='withLastClip'&&<p className="startup-help">{t('最后片段的淡出时长控制整个开屏层。标题页资源就绪后才开始计时。','The final clip fade controls the entire opening layer. Timing starts after title resources are ready.','最後のフェードで起動画面全体を表示します。タイトル準備後に計時を開始します。')}</p>}
      {sequence.revealMode==='afterClips'&&number('reveal', t('揭示主页 · ms', 'Reveal home · ms', 'ホームへ・ms'), sequence.revealMs, revealMs => commit({ ...current.current, revealMs }))}
      <label className="startup-check"><input type="checkbox" checked={sequence.allowSkip} onChange={event => commit({ ...sequence, allowSkip: event.target.checked })}/>{t('允许右键或物理 Esc 结束整个开屏', 'Allow right click or physical Esc to end startup', '右クリック／物理 Esc で終了を許可')}</label>
    </section>
    {error && <p className="field-error" role="alert">{error}</p>}
  </section>;
}
