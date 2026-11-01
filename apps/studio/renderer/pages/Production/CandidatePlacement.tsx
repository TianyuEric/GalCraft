import type { CandidateAdoptionChoice } from '@galcraft/authoring/production';
import { Choice, Field } from '../../components/controls.js';

export function CandidatePlacement({ value, characterId, canReplace, locale, onChange }: {
  value: CandidateAdoptionChoice; characterId: string | null; canReplace: boolean; locale: string;
  onChange(value: CandidateAdoptionChoice): void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  return <>
    <Field label={t('采用位置', 'Placement', '配置先')}>
      <Choice label="Candidate placement" value={value.placement ?? 'new'} options={[
        { value: 'new', label: t('另建舞台对象', 'Create a stage object', '新しい舞台オブジェクト') },
        ...(canReplace ? [{ value: 'replace', label: t('替换所选指令的素材', 'Replace the selected instruction’s asset', '選択した命令の素材を置換') }] : []),
      ]} onChange={placement => onChange({ ...value, placement: placement as 'new' | 'replace' })} />
    </Field>
    {(value.placement ?? 'new') === 'new' && <Field label={t('舞台用途', 'Stage use', '舞台の用途')}>
      <Choice label="Candidate stage use" value={value.use ?? (characterId ? 'figure' : 'illustration')} options={[
        { value: 'illustration', label: t('独立演出插图', 'Independent illustration', '独立した挿絵') },
        ...(characterId ? [{ value: 'figure', label: t('角色立绘', 'Character art', 'キャラの立ち絵') }] : []),
      ]} onChange={use => onChange({ ...value, use: use as 'figure' | 'illustration' })} />
    </Field>}
    <p className="field-help">{t('采用位置不改变制作输入。替换只更新选中的指令，保留对象构图。',
      'Placement does not change the generation input. Replacement preserves the selected object’s framing.',
      '採用先は生成入力を変更しません。置換は選択したオブジェクトの構図を保持します。')}</p>
  </>;
}
