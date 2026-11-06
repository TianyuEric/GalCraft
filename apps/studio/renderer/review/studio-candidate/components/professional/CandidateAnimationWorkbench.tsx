import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimationPathSchema, NativeAnimationSchema, type AnimationGenerationRequest, type AnimationTrack, type NativeAnimation } from '@galcraft/contracts';
import { sampleAnimation, type AppliedAnimationPreset, type AnimationPresetParameters } from '@galcraft/stage';
import { Plus, Trash2 } from 'lucide-react';
import type { AuthoringServices } from '../../../../authoring/controller.js';
import type { AnimationPreviewResource } from '../../../../authoring/professional/AnimationPreview.js';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateFieldGroup, CandidateInput, CandidateSection, CandidateSelect, CandidateState, CandidateToolbar } from '../controls/index.js';
import { CandidateAnimationPresets, CandidateAnimationGeneration, type AnimationGenerationDraft } from './CandidateAnimationPreparation.js';
import { CandidateAnimationPreview, CandidateAnimationTransport, useCandidatePlayhead } from './CandidateAnimationPreview.js';
import { CandidateAnimationTimeline, patchAnimationFrame } from './CandidateAnimationTimeline.js';
import { ProfessionalNumber, professionalError, professionalText, type ProfessionalNumberDraft } from './professional-fields.js';
import '../../styles/professional.css';

type Selection = [number, number];
export type CandidateAnimationGuiDraft = AnimationGenerationDraft & {
  draft: NativeAnimation; accepted: NativeAnimation; selection: Selection; name: string;
  numbers: Record<string, ProfessionalNumberDraft>;
};

export type CandidateAnimationWorkbenchProps = {
  animation: NativeAnimation; locale?: string; targetLabel: string; image?: string; preview?: ReactNode; active?: boolean;
  readonly?: boolean; statusLabel?: string; defaultName?: string; previewServices?: AuthoringServices;
  choosePreviewTarget?(): Promise<AnimationPreviewResource | null>;
  onChange(value: NativeAnimation): Promise<void>; onPreview?(value: NativeAnimation, timeMs: number): void;
  onSave?(name: string, value: NativeAnimation): Promise<string>; onDraftChange?(dirty: boolean): void;
  onPreset?(preset: AppliedAnimationPreset): Promise<void>; presetContext?: AnimationPresetParameters;
  onGenerate?(request: AnimationGenerationRequest): Promise<void>;
  guiDraft?: CandidateAnimationGuiDraft | null; onGuiDraftChange?(draft: CandidateAnimationGuiDraft): void;
};

const easingFamilies = ['linear', 'sine', 'quad', 'cubic', 'quart', 'quint', 'expo', 'circ', 'back', 'elastic', 'bounce'];
const stations = ['left', 'leftQuarter', 'leftThird', 'center', 'rightThird', 'rightQuarter', 'right'];
const blendModes = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'add'];
const sameAnimation = (a: NativeAnimation, b: NativeAnimation) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** The caller owns persistence, the real project stage and undo. Seeking only changes the preview. */
export function CandidateAnimationWorkbench({ animation, locale = 'zh-CN', targetLabel, image, preview, active = true, readonly = false, statusLabel, defaultName = '',
  onChange, onPreview, onSave, onDraftChange, onPreset, presetContext, onGenerate, previewServices, choosePreviewTarget, guiDraft, onGuiDraftChange }: CandidateAnimationWorkbenchProps) {
  const t = professionalText(locale);
  const [draft, setDraft] = useState(() => guiDraft && sameAnimation(guiDraft.accepted, animation) ? guiDraft.draft : animation);
  const latest = useRef(draft), accepted = useRef(animation), external = useRef(animation);
  const [selection, select] = useState<Selection>(guiDraft?.selection ?? [0, 0]);
  const [zoom, setZoom] = useState(1), [snap, setSnap] = useState(true);
  const [pending, setPending] = useState(false), busy = useRef(false);
  const [failure, setFailure] = useState<{ message: string; action: 'apply' | 'save' | 'conflict' | 'invalid' } | null>(null);
  const failedWrite = useRef<typeof onChange>(null);
  const [saved, setSaved] = useState('');
  const [name, setName] = useState(guiDraft?.name ?? (defaultName || t('动画', 'Animation', 'アニメーション')));
  const [numbers, setNumbers] = useState<Record<string, ProfessionalNumberDraft>>(() => guiDraft && sameAnimation(guiDraft.accepted, animation) ? guiDraft.numbers : {});
  const [generation, setGeneration] = useState<AnimationGenerationDraft>(() => ({
    instruction: guiDraft?.instruction ?? '', generationMode: guiDraft?.generationMode ?? 'patch', generationPath: guiDraft?.generationPath ?? '',
    rangeEnabled: guiDraft?.rangeEnabled ?? false, rangeStart: guiDraft?.rangeStart ?? 0, rangeEnd: guiDraft?.rangeEnd ?? animation.durationMs,
    rangeInput: guiDraft?.rangeInput,
  }));
  const targetContext = useRef('');
  const previewCallback = useRef(onPreview); previewCallback.current = onPreview;
  const dirtyCallback = useRef(onDraftChange); dirtyCallback.current = onDraftChange;
  const clock = useCandidatePlayhead(draft.durationMs, active, time => previewCallback.current?.(latest.current, time));
  const buffered = Object.keys(numbers).length > 0;
  const dirty = buffered || !sameAnimation(draft, accepted.current);
  const blocked = readonly || pending || failure?.action === 'conflict';
  const toolsBlocked = blocked || buffered || failure?.action === 'apply';

  const show = (next: NativeAnimation) => {
    latest.current = next;
    setDraft(next);
    previewCallback.current?.(next, Math.min(clock.at.current, next.durationMs));
  };
  const restore = () => {
    setNumbers({}); setFailure(null); show(accepted.current);
  };
  useEffect(() => {
    if (sameAnimation(external.current, animation) || busy.current) return;
    external.current = animation;
    if (sameAnimation(accepted.current, animation)) return;
    accepted.current = animation;
    if (dirty) {
      setFailure({ action: 'conflict', message: t('原动画已变化。恢复最新已提交值后可继续编辑。', 'The source animation changed. Restore the latest applied values to continue.', '元のアニメーションが変更されました。最新の適用値に戻して続行してください。') });
    } else {
      setFailure(null); show(animation);
    }
  }, [animation, pending]);
  useEffect(() => { dirtyCallback.current?.(dirty); }, [dirty]);
  useEffect(() => () => dirtyCallback.current?.(false), []);
  useEffect(() => {
    onGuiDraftChange?.({ ...generation, draft, accepted: accepted.current, selection, name, numbers });
  }, [draft, pending, selection, name, numbers, generation, onGuiDraftChange]);

  async function commit(next: NativeAnimation, write = onChange) {
    if (readonly || busy.current || failure?.action === 'conflict') return;
    const validated = NativeAnimationSchema.safeParse(next);
    if (!validated.success) {
      const message = t('关键帧时刻须递增且位于区间内。请检查时长与属性值。', 'Keyframes must increase within the duration. Check time and property values.', '時刻を区間内で昇順にし、属性値を確認してください。');
      setFailure({ message, action: 'invalid' }); throw new Error(message);
    }
    show(validated.data); setFailure(null);
    if (sameAnimation(validated.data, accepted.current)) return;
    busy.current = true; setPending(true); clock.play(false);
    try { await write(validated.data); accepted.current = validated.data; }
    catch (reason) { failedWrite.current = write; setFailure({ message: professionalError(reason), action: 'apply' }); throw reason; }
    finally { busy.current = false; setPending(false); }
  }
  const apply = (next: NativeAnimation) => { void commit(next).catch(() => {}); };
  const selectPreset = async (preset: AppliedAnimationPreset) => {
    await commit(preset.animation, onPreset ? async () => onPreset(preset) : onChange);
    select([0, 0]); clock.seek(0);
  };
  const save = async () => {
    if (!onSave || !name.trim() || busy.current || readonly) return;
    busy.current = true; setPending(true); setFailure(null);
    try { setSaved(await onSave(name.trim(), latest.current)); }
    catch (reason) { setFailure({ message: professionalError(reason), action: 'save' }); }
    finally { busy.current = false; setPending(false); }
  };
  const updateNumber = (key: string, value?: ProfessionalNumberDraft) => setNumbers(current => {
    const next = { ...current };
    if (value) next[key] = value;
    else delete next[key];
    return next;
  });

  const ti = Math.max(0, Math.min(selection[0], draft.tracks.length - 1)), track = draft.tracks[ti]!;
  const ki = Math.max(0, Math.min(selection[1], track.keyframes.length - 1)), frame = track.keyframes[ki]!;
  const label = (path: string) => ({
    '/x': 'X', '/y': 'Y', '/opacity': t('透明度', 'Opacity', '不透明度'), '/scaleX': t('水平缩放', 'Scale X', '横倍率'),
    '/scaleY': t('垂直缩放', 'Scale Y', '縦倍率'), '/rotationDeg': t('旋转', 'Rotation', '回転'),
    '/station': t('站位', 'Station', '立ち位置'), '/blend': t('混合', 'Blend', '合成'),
  }[path] ?? path.slice(1));
  const numeric = typeof frame.value === 'number';
  const framePatch = (patch: Partial<typeof frame>, source = latest.current) => patchAnimationFrame(source, [ti, ki], patch);
  const sampled = sampleAnimation(draft, clock.time, Object.fromEntries(draft.tracks.map(item => {
    const value = item.keyframes[0]!.value;
    return [item.path, item.path.includes('scale') || item.path === '/opacity' ? 1 : typeof value === 'number' ? 0 : value];
  })));
  const at = Math.round(clock.time);
  const addFrame = () => {
    const next = structuredClone(latest.current), keys = next.tracks[ti]!.keyframes;
    keys.push({ ...structuredClone(frame), timeMs: at });
    keys.sort((a, b) => a.timeMs - b.timeMs);
    select([ti, keys.findIndex(item => item.timeMs === at)]); apply(next);
  };
  const addTrack = (path: AnimationTrack['path']) => {
    const next = structuredClone(latest.current);
    const value = path === '/station' ? 'center' : path === '/blend' ? 'normal' : path.startsWith('/filters/') || path === '/circle/invert' ? false : 1;
    next.tracks.push({ path, mode: 'absolute', keyframes: [{ timeMs: next.durationMs, value, easing: { family: 'linear', direction: 'in' } }] });
    select([next.tracks.length - 1, 0]); apply(next);
  };
  const removeFrame = () => {
    const next = structuredClone(latest.current);
    next.tracks[ti]!.keyframes.splice(ki, 1);
    select([ti, 0]); apply(next);
  };
  const removeTrack = () => {
    const next = structuredClone(latest.current);
    next.tracks.splice(ti, 1);
    select([0, 0]); apply(next);
  };
  const number = (key: string, name: string, value: number, step: number, update: (n: number, source: NativeAnimation) => NativeAnimation, unit?: string, min?: number, max?: number) =>
    <ProfessionalNumber key={key} label={name} locale={locale} value={value} draft={numbers[key]} step={step} unit={unit} min={min} max={max}
      readOnly={blocked || buffered && !numbers[key]}
      onDraft={next => updateNumber(key, next)}
      onPreview={value => {
        const next = NativeAnimationSchema.safeParse(update(value, latest.current));
        if (next.success) show(next.data);
      }}
      onCommit={value => commit(update(value, latest.current))}
      onCancel={() => { show(accepted.current); setFailure(null); }}/>;
  const choice = (name: string, value: string, options: string[], onChange: (value: string) => void, labels = options) =>
    <CandidateField label={name}>
      <CandidateSelect density="compact" value={value} disabled={toolsBlocked} onValueChange={onChange}>
        {options.map((option, index) => <option key={option} value={option}>{labels[index]}</option>)}
      </CandidateSelect>
    </CandidateField>;
  const before = track.keyframes[ki - 1]?.timeMs, after = track.keyframes[ki + 1]?.timeMs;
  const id = track.path + ':' + ki + ':';
  const directionLabels = [t('渐入', 'In', 'イン'), t('渐出', 'Out', 'アウト'), t('渐入渐出', 'In and out', 'インアウト')];

  return <section className="candidate-pro-editor" aria-label={t('动画编辑器', 'Animation editor', 'アニメーションエディター')}>
    <header className="candidate-pro-heading">
      <div><h2>{t('动画与关键帧', 'Animation & keyframes', 'アニメーションとキーフレーム')}</h2><p>{targetLabel}</p></div>
      <span role="status">{pending ? t('正在提交', 'Applying', '適用中') : statusLabel ?? t('预览不写入作品', 'Preview leaves the work unchanged', 'プレビューは作品を変更しません')}</span>
    </header>
    <div className="candidate-pro-board">
      <div className="candidate-pro-preview">
        {preview ?? <CandidateAnimationPreview animation={draft} timeMs={clock.time} locale={locale} active={active} image={image}
          previewServices={previewServices} choosePreviewTarget={choosePreviewTarget} onTargetContext={value => { targetContext.current = value; }}/>}
        {preview ? <output className="candidate-pro-note">{at} / {draft.durationMs} ms</output>
          : <output className="candidate-pro-sampled" aria-label={t('实际采样', 'Sampled values', 'サンプル値')} aria-live="off">
            {Object.entries(sampled).map(([path, value]) => <span key={path}>{label(path)} {typeof value === 'number' ? Number(value.toFixed(3)) : String(value)}</span>)}
          </output>}
      </div>
      <CandidateFieldGroup className="candidate-pro-keyfields" aria-busy={pending} title={label(track.path) + ' · ' + t('当前关键帧', 'Selected keyframe', '選択中のキーフレーム')}>
        {number(id + 'time', t('时刻', 'Time', '時刻'), frame.timeMs, 10, (timeMs, source) => framePatch({ timeMs }, source), 'ms',
          before === undefined ? 0 : before + Math.min(1, (frame.timeMs - before) / 2),
          after === undefined ? draft.durationMs : after - Math.min(1, (after - frame.timeMs) / 2))}
        {numeric ? number(id + 'value', t('数值', 'Value', '値'), Number(frame.value), .1, (value, source) => framePatch({ value }, source))
          : choice(t('关键帧值', 'Keyframe value', 'キーフレーム値'), String(frame.value), typeof frame.value === 'boolean' ? ['false', 'true'] : track.path === '/station' ? stations : blendModes,
            value => apply(framePatch({ value: typeof frame.value === 'boolean' ? value === 'true' : value as typeof frame.value })))}
        {choice(t('计算方式', 'Value mode', '計算方式'), track.mode, numeric ? ['absolute', 'add', 'multiply'] : ['absolute'], mode => {
          const next = structuredClone(latest.current); next.tracks[ti]!.mode = mode as AnimationTrack['mode']; apply(next);
        }, [t('绝对值', 'Absolute', '絶対'), t('加量', 'Add', '加算'), t('乘量', 'Multiply', '乗算')])}
        {choice(t('缓动曲线', 'Easing curve', 'イージング'), frame.easing.family, easingFamilies, family =>
          apply(framePatch({ easing: { ...frame.easing, family: family as typeof frame.easing.family } })))}
        {choice(t('缓动方向', 'Easing direction', 'イージング方向'), frame.easing.direction, ['in', 'out', 'inOut'], direction =>
          apply(framePatch({ easing: { ...frame.easing, direction: direction as typeof frame.easing.direction } })), directionLabels)}
      </CandidateFieldGroup>
    </div>
    <CandidateAnimationTransport locale={locale} duration={draft.durationMs} clock={clock} disabled={pending || !active}>
      <CandidateField label={t('时间轴缩放', 'Timeline zoom', 'タイムライン倍率')} layout="row" className="candidate-pro-zoom">
        <CandidateSelect value={zoom} density="compact" onValueChange={value => setZoom(Number(value))}>
          {[1, 2, 4].map(value => <option key={value} value={value}>{value * 100}%</option>)}
        </CandidateSelect>
      </CandidateField>
      <CandidateField label={t('吸附 100 ms', 'Snap 100 ms', '100 ms に吸着')} layout="row" className="candidate-pro-snap">
        <CandidateCheckbox checked={snap} onChange={event => setSnap(event.currentTarget.checked)}/>
      </CandidateField>
    </CandidateAnimationTransport>
    <CandidateAnimationTimeline animation={draft} locale={locale} label={label} time={clock.time} selection={[ti, ki]} zoom={zoom} snap={snap}
      disabled={toolsBlocked} onSelect={select} onPause={() => clock.play(false)} onPreview={show} onCommit={apply}/>
    <CandidateToolbar label={t('关键帧操作', 'Keyframe actions', 'キーフレーム操作')}>
      <CandidateButton variant="outline" disabled={toolsBlocked || at > draft.durationMs || track.keyframes.some(key => key.timeMs === at)} onClick={addFrame}>
        <Plus size={16}/>{t('在播放头添加', 'Add at playhead', '再生位置に追加')}
      </CandidateButton>
      <CandidateButton disabled={toolsBlocked || track.keyframes.length === 1} onClick={removeFrame}>
        <Trash2 size={16}/>{t('删除关键帧', 'Delete keyframe', 'キーフレーム削除')}
      </CandidateButton>
      <small className="candidate-pro-note">{t('← → 移动 10 ms · Shift 移动 100 ms · 拖动后松开提交 · Esc 取消', '← → 10 ms · Shift 100 ms · Release to apply · Esc cancels drag', '← → 10 ms・Shift 100 ms・ドロップで適用・Esc で中止')}</small>
    </CandidateToolbar>
    <CandidateSection title={t('轨道与总时长', 'Tracks and duration', 'トラックと長さ')} className="candidate-pro-disclosure" collapsible initiallyOpen={false}>
      <CandidateFieldGroup className="candidate-pro-prep-fields">
        {number('duration', t('总时长', 'Duration', '長さ'), draft.durationMs, 10, (durationMs, source) => ({ ...source, durationMs }), 'ms',
          Math.max(...draft.tracks.map(track => track.keyframes.at(-1)!.timeMs)))}
        <CandidateField label={t('添加属性轨道', 'Add property track', '属性トラックを追加')}>
          <CandidateSelect density="compact" value="" disabled={toolsBlocked} onValueChange={path => { if (path) addTrack(path as AnimationTrack['path']); }}>
            <option value="">{t('选择属性…', 'Choose property…', '属性を選択…')}</option>
            {AnimationPathSchema.options.filter(path => !draft.tracks.some(item => item.path === path)).map(path => <option value={path} key={path}>{label(path)}</option>)}
          </CandidateSelect>
        </CandidateField>
      </CandidateFieldGroup>
      <CandidateButton disabled={toolsBlocked || draft.tracks.length === 1} onClick={removeTrack}><Trash2 size={16}/>{t('删除当前轨道', 'Delete selected track', '選択トラックを削除')}</CandidateButton>
    </CandidateSection>
    <CandidateAnimationPresets locale={locale} disabled={toolsBlocked} context={presetContext} apply={selectPreset}/>
    {onGenerate && <CandidateAnimationGeneration locale={locale} value={generation} change={setGeneration} animation={draft} path={track.path} label={label}
      disabled={toolsBlocked} targetLabel={targetLabel} targetContext={() => targetContext.current} onGenerate={onGenerate}/>}
    {onSave && <CandidateToolbar label={t('保存动画', 'Save animation', 'アニメーションを保存')} className="candidate-pro-save">
      <CandidateField label={t('动画名称', 'Animation name', 'アニメーション名')} layout="row">
        <CandidateInput density="compact" value={name} readOnly={blocked} onChange={event => setName(event.currentTarget.value)}/>
      </CandidateField>
      <CandidateButton variant="primary" disabled={toolsBlocked || !name.trim()} onClick={() => void save()}>{t('保存为动画素材', 'Save animation asset', 'アニメーション素材を保存')}</CandidateButton>
      {saved && <span role="status">{saved}</span>}
    </CandidateToolbar>}
    {failure && <CandidateState kind="error" title={t('动画编辑失败', 'Animation edit failed', 'アニメーションを編集できませんでした')} description={failure.message}
      action={<CandidateToolbar label={t('恢复动画编辑', 'Recover animation edit', 'アニメーション編集を復元')}>
        {failure.action === 'apply' && <CandidateButton variant="outline" disabled={readonly || pending} onClick={() => {
          if (Object.values(numbers).some(draft => draft.value === null)) return;
          void commit(latest.current, failedWrite.current ?? onChange).then(() => setNumbers({})).catch(() => {});
        }}>{t('重试提交', 'Retry apply', '再試行')}</CandidateButton>}
        {failure.action === 'save' && <CandidateButton variant="outline" disabled={blocked} onClick={() => void save()}>{t('重试保存', 'Retry save', '保存を再試行')}</CandidateButton>}
        <CandidateButton disabled={pending} onClick={restore}>{t('还原已提交值', 'Restore applied values', '適用済みの値へ戻す')}</CandidateButton>
      </CandidateToolbar>}/>}
  </section>;
}
