import { useState } from 'react';
import { AnimationPathSchema, type AnimationGenerationRequest, type AnimationTrack, type NativeAnimation } from '@galcraft/contracts';
import { AnimationPresets, createAnimationPreset, type AnimationPresetId, type AppliedAnimationPreset, type AnimationPresetParameters } from '@galcraft/stage';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateFieldGroup, CandidateInput, CandidateSection, CandidateSelect, CandidateTextarea } from '../controls/index.js';
import { parseProfessionalNumber, professionalError, professionalText } from './professional-fields.js';

const noAmplitude = ['moveLeftQuarter', 'moveRightQuarter', 'moveTo', 'slideInLeft', 'slideInRight', 'slideOutLeft', 'slideOutRight', 'fadeIn', 'fadeOut'];
const defaults = { durationMs: '600', amplitude: '90', cycles: '1', targetX: '960', targetY: '0', offsetY: '0' };

export function CandidateAnimationPresets({ locale, disabled, context, apply }: {
  locale: string; disabled: boolean; context?: AnimationPresetParameters; apply(preset: AppliedAnimationPreset): Promise<void>;
}) {
  const t = professionalText(locale);
  const [id, setId] = useState<AnimationPresetId>('jump');
  const [values, setValues] = useState(defaults);
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const preset = AnimationPresets.find(item => item.id === id)!;
  const number = (key: keyof typeof defaults, label: string, unit?: string) => <CandidateField label={label} unit={unit} className="candidate-pro-short">
    <CandidateInput density="compact" inputMode="decimal" value={values[key]} readOnly={disabled || pending}
      onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))}/>
  </CandidateField>;
  const visible = {
    amplitude: !noAmplitude.includes(id),
    cycles: ['reaction', 'idle', 'emphasis'].includes(preset.group),
    target: id === 'moveTo',
    offset: id === 'moveBy',
  };
  const submit = async () => {
    if (pending || disabled) return;
    const durationMs = parseProfessionalNumber(values.durationMs, 1), amplitude = parseProfessionalNumber(values.amplitude);
    const cycles = parseProfessionalNumber(values.cycles, 1, 32), targetX = parseProfessionalNumber(values.targetX);
    const targetY = parseProfessionalNumber(values.targetY), offsetY = parseProfessionalNumber(values.offsetY);
    if (durationMs === null || visible.amplitude && amplitude === null || visible.cycles && (cycles === null || !Number.isInteger(cycles))
      || visible.target && (targetX === null || targetY === null) || visible.offset && offsetY === null) {
      setError(t('请检查预设时长、数值和动作次数。', 'Check the preset duration, values, and cycle count.', '時間、値、回数を確認してください。'));
      return;
    }
    setPending(true); setError('');
    try {
      await apply(createAnimationPreset(id, { ...context, durationMs, amplitude: amplitude ?? preset.amplitude, cycles: cycles ?? preset.cycles,
        targetX: targetX ?? Number(defaults.targetX), targetY: targetY ?? 0, offsetY: offsetY ?? 0 }));
    } catch (reason) { setError(professionalError(reason)); }
    finally { setPending(false); }
  };
  return <CandidateSection title={t('应用常用动画预设', 'Apply an animation preset', 'アニメーションプリセットを適用')} className="candidate-pro-disclosure" collapsible initiallyOpen={false}>
    <CandidateFieldGroup className="candidate-pro-prep-fields" disabled={disabled || pending}>
      <CandidateField label={t('动画预设', 'Animation preset', 'アニメーションプリセット')}>
        <CandidateSelect value={id} density="compact" onValueChange={value => {
          const next = AnimationPresets.find(item => item.id === value)!;
          setId(next.id); setError('');
          setValues(current => ({ ...current, durationMs: String(next.durationMs), amplitude: String(next.amplitude), cycles: String(next.cycles) }));
        }}>{AnimationPresets.map(item => <option key={item.id} value={item.id}>{item.title[locale === 'en' ? 1 : locale === 'ja' ? 2 : 0]}</option>)}</CandidateSelect>
      </CandidateField>
      {number('durationMs', t('预设时长', 'Preset duration', 'プリセット時間'), 'ms')}
      {visible.amplitude && number('amplitude', id === 'moveBy' ? t('水平相对偏移', 'Relative X offset', '相対X移動') : t('幅度', 'Amplitude', '振幅'), id === 'moveBy' ? 'px' : undefined)}
      {visible.cycles && number('cycles', t('动作次数', 'Cycles', '回数'))}
      {visible.target && <>{number('targetX', t('目标舞台 X', 'Target stage X', '舞台の対象X'), 'px')}{number('targetY', t('目标垂直偏移', 'Target Y offset', '対象Y移動'), 'px')}</>}
      {visible.offset && number('offsetY', t('垂直相对偏移', 'Relative Y offset', '相対Y移動'), 'px')}
    </CandidateFieldGroup>
    <p className="candidate-pro-note">{preset.group === 'exit'
      ? t('退场预设改变外观。剧情中用「退场」释放显示实例。', 'Exit presets change appearance. Use Exit in the story to release the instance.', '退場プリセットは外観を変更します。物語では「退場」で表示を解放します。')
      : preset.group === 'entrance' ? t('先用「显示」建立对象，再应用入场轨道。', 'Use Show to create the object before applying entrance tracks.', '「表示」で対象を作成してから登場トラックを適用します。')
      : preset.group === 'move' ? t('移动结束保留目标位置。左右四分之一取舞台宽度的 25% 和 75%。', 'Movement keeps its endpoint. Quarter positions use 25% and 75% of stage width.', '移動終了後は位置を保持します。左右1/4は舞台幅の25%と75%です。')
      : t('动画基于实际起态，结束时恢复。呼吸支持循环及按实例停止。', 'Uses the starting state and returns to it. Breathing supports looping and stopping by instance.', '実際の開始状態に戻ります。呼吸はループとインスタンス停止に対応します。')}</p>
    <CandidateButton variant="primary" disabled={disabled || pending} onClick={() => void submit()}>{t('应用并编辑关键帧', 'Apply and edit keyframes', '適用してキーを編集')}</CandidateButton>
    {error && <p className="candidate-pro-error" role="alert">{error}</p>}
  </CandidateSection>;
}

export type AnimationGenerationDraft = {
  instruction: string; generationMode: 'new' | 'patch' | 'replace'; generationPath: string;
  rangeEnabled: boolean; rangeStart: number; rangeEnd: number; rangeInput?: [string, string];
};

export function CandidateAnimationGeneration({ locale, value, animation, targetContext, targetLabel, path, label, disabled, change, onGenerate }: {
  locale: string; value: AnimationGenerationDraft; animation: NativeAnimation; targetContext(): string; targetLabel: string;
  path: AnimationTrack['path']; label(path: string): string; disabled: boolean;
  change(value: AnimationGenerationDraft): void; onGenerate(request: AnimationGenerationRequest): Promise<void>;
}) {
  const t = professionalText(locale);
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const range = value.rangeInput ?? [String(value.rangeStart), String(value.rangeEnd)];
  const patch = value.generationMode === 'patch';
  const submit = async () => {
    if (pending || disabled || !value.instruction.trim()) return;
    const startMs = parseProfessionalNumber(range[0], 0, animation.durationMs);
    const endMs = parseProfessionalNumber(range[1], startMs ?? 0, animation.durationMs);
    if (patch && value.rangeEnabled && (startMs === null || endMs === null)) {
      setError(t('请填写总时长内的开始和结束时刻。', 'Enter a start and end within the duration.', '全体の長さ以内で開始と終了を入力してください。'));
      return;
    }
    setPending(true); setError('');
    try {
      await onGenerate({ instruction: value.instruction.trim(), mode: value.generationMode, currentAnimation: value.generationMode === 'new' ? null : animation,
        paths: patch ? [value.generationPath || path] as AnimationTrack['path'][] : [],
        range: patch && value.rangeEnabled ? { startMs: startMs!, endMs: endMs! } : null,
        targetContext: targetContext() || targetLabel, preserveDuration: value.generationMode !== 'new', allowDelete: false, assetId: null, assetRevision: null });
    } catch (reason) { setError(professionalError(reason)); }
    finally { setPending(false); }
  };
  const changeRange = (index: number, text: string) => {
    const input: [string, string] = [...range];
    input[index] = text;
    change({ ...value, rangeInput: input });
  };
  return <CandidateSection title={t('用自然语言制作动画', 'Create animation with a prompt', '指示文からアニメーションを作成')}
    className="candidate-pro-disclosure" collapsible initiallyOpen={false}>
    <CandidateFieldGroup className="candidate-pro-prep-fields" disabled={pending}>
      <CandidateField label={t('生成方式', 'Generation mode', '生成方法')}>
        <CandidateSelect density="compact" value={value.generationMode} onValueChange={generationMode => change({ ...value, generationMode: generationMode as AnimationGenerationDraft['generationMode'] })}>
          <option value="patch">{t('局部修改，保留其他内容', 'Edit a track and preserve the rest', '一部を変更して他を保持')}</option>
          <option value="new">{t('生成新动画', 'Create a new animation', '新しいアニメーション')}</option>
          <option value="replace">{t('重做整段动画', 'Rewrite the whole animation', '全体を作り直す')}</option>
        </CandidateSelect>
      </CandidateField>
      {patch && <>
        <CandidateField label={t('允许修改的轨道', 'Editable track', '編集可能トラック')}>
          <CandidateSelect density="compact" value={value.generationPath || path} onValueChange={generationPath => change({ ...value, generationPath })}>
            {AnimationPathSchema.options.map(path => <option value={path} key={path}>{label(path)}</option>)}
          </CandidateSelect>
        </CandidateField>
        <CandidateField label={t('限定时间范围', 'Limit time range', '時間範囲を限定')} layout="row">
          <CandidateCheckbox checked={value.rangeEnabled} onChange={event => change({ ...value, rangeEnabled: event.currentTarget.checked })}/>
        </CandidateField>
        {value.rangeEnabled && <>
          <CandidateField label={t('开始', 'Start', '開始')} unit="ms" className="candidate-pro-short">
            <CandidateInput density="compact" inputMode="decimal" value={range[0]} onChange={event => changeRange(0, event.currentTarget.value)}/>
          </CandidateField>
          <CandidateField label={t('结束', 'End', '終了')} unit="ms" className="candidate-pro-short">
            <CandidateInput density="compact" inputMode="decimal" value={range[1]} onChange={event => changeRange(1, event.currentTarget.value)}/>
          </CandidateField>
        </>}
      </>}
    </CandidateFieldGroup>
    <CandidateField label={t('动画要求', 'Animation request', 'アニメーションの指示')} className="candidate-pro-instruction">
      <CandidateTextarea value={value.instruction} rows={2} onChange={event => change({ ...value, instruction: event.currentTarget.value })}
        placeholder={t('例如：跳得更高，时长不变', 'For example: jump higher and keep the duration', '例：時間を保ち、もっと高く跳ぶ')}/>
    </CandidateField>
    <p className="candidate-pro-note">{t('下一步使用已配置的文字连接审阅并发送请求。通过校验的候选可以采用。', 'Next, review and send using a configured text connection. Candidates can be adopted after validation.', '次に設定済みの文章接続で確認して送信します。検証済み候補を適用できます。')}</p>
    <CandidateButton variant="primary" disabled={disabled || pending || !value.instruction.trim()} onClick={() => void submit()}>
      {t('准备制作候选', 'Prepare animation production', '制作候補を準備')}
    </CandidateButton>
    {error && <p role="alert" className="candidate-pro-error">{error}</p>}
  </CandidateSection>;
}
