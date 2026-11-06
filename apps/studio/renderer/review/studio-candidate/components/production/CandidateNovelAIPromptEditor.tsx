import { useState } from 'react';
import { issueDetails, issueFromError, localizeIssue, type Diagnostic, type Json } from '@galcraft/contracts';
import {
  defaultNovelAISettings, emptyNovelAIPrompt, novelAIBasePrompt, novelAISeparatedPrompt,
  NovelAIPromptSchema, NovelAIReferenceSchema, NovelAISettingsSchema,
  type NovelAIPromptDraft, type NovelAISettings,
} from '@galcraft/generation-services/novelai';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateFieldGroup, CandidateInput, CandidateNumberField, CandidateTextarea, CandidateToolbar } from '../controls/index.js';
import { ProductionChoice, ProductionDisclosure, productionText } from './ProductionControls.js';

type PromptFields = { novelaiPrompt: NovelAIPromptDraft; novelaiSettings: NovelAISettings };
type CharacterPrompt = NovelAIPromptDraft['characters'][number];
const defaultReference = { mode: 'img2img', strength: .7, informationExtracted: 1, fidelity: 1, description: 'character' };

export function CandidateNovelAIPromptEditor({ fields, change, locale }: {
  fields: Record<string, Json>;
  change(key: string, value: Json): void;
  locale: string;
}) {
  const [pending, setPending] = useState<Partial<PromptFields>>({});
  const [referenceDraft, setReferenceDraft] = useState<string | null>(null);
  const [issue, setIssue] = useState<Diagnostic>();
  const [status, setStatus] = useState('');
  const t = (zh: string, en: string, ja: string) => productionText(locale, zh, en, ja);
  const prompt = pending.novelaiPrompt ?? (fields.novelaiPrompt as NovelAIPromptDraft | undefined) ?? emptyNovelAIPrompt();
  const settings = pending.novelaiSettings ?? (fields.novelaiSettings as NovelAISettings | undefined) ?? defaultNovelAISettings();
  const modelLabel = t('模型配置', 'Model profile', 'モデル設定');
  const qualityLabel = t('质量词', 'Quality tags', '品質タグ');
  const referenceLabel = t('参考参数（img2img / vibe / precise）', 'Reference parameters (img2img / vibe / precise)', '参照パラメーター（img2img / vibe / precise）');

  const validationIssue = (code: string, error: unknown, field: string) => {
    const message = error instanceof Error ? error.message : String(error);
    setIssue({ code, message, severity: 'error', owner: 'M09', details: { field }, actions: ['edit'] });
    setStatus('');
  };
  const apply = (patch: Partial<PromptFields> = {}, reference?: Json) => {
    const next = { novelaiPrompt: patch.novelaiPrompt ?? prompt, novelaiSettings: patch.novelaiSettings ?? settings };
    const parsed = NovelAIPromptSchema.safeParse(next.novelaiPrompt);
    if ((reference === undefined && referenceDraft !== null) || !parsed.success) {
      setPending(next);
      if (!parsed.success) validationIssue('NOVELAI_PROMPT_SCHEMA', parsed.error, 'novelaiPrompt');
      return;
    }
    if (next.novelaiPrompt !== fields.novelaiPrompt) change('novelaiPrompt', next.novelaiPrompt);
    if (next.novelaiSettings !== fields.novelaiSettings) change('novelaiSettings', next.novelaiSettings);
    if (reference !== undefined) change('novelaiReference', reference);
    setPending({});
    setIssue(undefined);
  };
  const applyReference = () => {
    if (referenceDraft === null) return;
    let value: unknown;
    try { value = JSON.parse(referenceDraft); }
    catch (error) {
      validationIssue('NOVELAI_REFERENCE_JSON', error, 'novelaiReference');
      return;
    }
    const parsed = NovelAIReferenceSchema.safeParse(value);
    if (!parsed.success) {
      validationIssue('NOVELAI_REFERENCE_SCHEMA', parsed.error, 'novelaiReference');
      return;
    }
    setReferenceDraft(null);
    apply({}, parsed.data);
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(t('已复制', 'Copied', 'コピーしました'));
    } catch (error) { setIssue(issueFromError(error, 'M09')); }
  };

  const updatePrompt = (patch: Partial<NovelAIPromptDraft>) => apply({ novelaiPrompt: { ...prompt, ...patch } });
  const stagePrompt = (patch: Partial<NovelAIPromptDraft>) => setPending({ ...pending, novelaiPrompt: { ...prompt, ...patch } });
  const applyStagedPrompt = () => { if (pending.novelaiPrompt) apply(); };
  const updateSettings = (patch: Partial<NovelAISettings>) => apply({ novelaiSettings: { ...settings, ...patch } });
  const updateCharacters = (characters: CharacterPrompt[]) => updatePrompt({ characters });
  const editedCharacters = (index: number, patch: Partial<CharacterPrompt>) => prompt.characters.map((character, position) => position === index ? { ...character, ...patch } : character);
  const updateCharacter = (index: number, patch: Partial<CharacterPrompt>) => updateCharacters(editedCharacters(index, patch));
  const moveCharacter = (index: number, to: number) => {
    const characters = [...prompt.characters];
    characters.splice(to, 0, characters.splice(index, 1)[0]!);
    updateCharacters(characters);
  };
  const textField = (label: string, value: string, edit: (value: string) => void) => <CandidateField label={label} className="candidate-production-long">
    <CandidateTextarea rows={3} value={value} onChange={event => edit(event.target.value)} onBlur={applyStagedPrompt}/>
  </CandidateField>;
  const quality = { none: t('无', 'None', 'なし'), light: t('轻量', 'Light', '軽め'), standard: t('标准', 'Standard', '標準') };
  const referenceError = issue?.code === 'NOVELAI_REFERENCE_JSON' || issue?.code === 'NOVELAI_REFERENCE_SCHEMA';

  return <CandidateFieldGroup title={t('NovelAI 提示', 'NovelAI prompt', 'NovelAI プロンプト')}
    description={t('完整提示、角色块、设置与参考参数保存在制作草稿。复制和原生请求共用同一展开规则。', 'Prompt blocks, settings and reference parameters belong to this draft. Copy and native requests use the same expansion rules.', 'プロンプト、キャラクターブロック、設定、参照設定は制作下書きに保存されます。コピーとネイティブ要求は同じ展開規則を使います。')}>
    <CandidateField label={modelLabel}>
      <ProductionChoice label={modelLabel} value={settings.modelProfile}
        options={NovelAISettingsSchema.shape.modelProfile.options.map(value => ({ value, label: value }))}
        onChange={value => updateSettings({ modelProfile: NovelAISettingsSchema.shape.modelProfile.parse(value) })}/>
    </CandidateField>
    <CandidateField label={qualityLabel}>
      <ProductionChoice label={qualityLabel} value={settings.quality}
        options={NovelAISettingsSchema.shape.quality.options.map(value => ({ value, label: quality[value] }))}
        onChange={value => updateSettings({ quality: NovelAISettingsSchema.shape.quality.parse(value) })}/>
    </CandidateField>
    <label className="check-row"><CandidateCheckbox checked={settings.transparent} onChange={event => updateSettings({ transparent: event.target.checked })}/>{t('透明背景意图', 'Transparent background intent', '透過背景の意図')}</label>
    {textField(t('基础提示', 'Base prompt', '基本プロンプト'), prompt.basePrompt, value => stagePrompt({ basePrompt: value }))}
    {textField(t('基础负面提示', 'Base negative prompt', '基本の除外プロンプト'), prompt.negativePrompt ?? '', value => stagePrompt({ negativePrompt: value || null }))}
    <CandidateNumberField label={t('官方负面预设编号', 'Official negative preset number', '公式の除外プリセット番号')}
      value={settings.negativePreset === null ? null : Number(settings.negativePreset)} step={1} allowEmpty locale={locale}
      onCommit={value => updateSettings({ negativePreset: value === null ? null : String(value) })}/>
    <CandidateToolbar label={t('基础提示操作', 'Base prompt actions', '基本プロンプトの操作')} className="w-full">
      <CandidateButton variant="outline" onClick={() => void copy(novelAIBasePrompt(prompt, settings))}>{t('复制基础提示', 'Copy base prompt', '基本プロンプトをコピー')}</CandidateButton>
    </CandidateToolbar>
    {prompt.characters.map((character, index) => <CandidateFieldGroup key={index} className="w-full" title={`${t('角色', 'Character', 'キャラクター')} ${index + 1}`}>
      <CandidateField label={t('角色名称', 'Character name', 'キャラクター名')}>
        <CandidateInput value={character.name} onChange={event => stagePrompt({ characters: editedCharacters(index, { name: event.target.value }) })} onBlur={applyStagedPrompt}/>
      </CandidateField>
      {textField(t('角色提示', 'Character prompt', 'キャラクタープロンプト'), character.prompt, value => stagePrompt({ characters: editedCharacters(index, { prompt: value }) }))}
      {textField(t('角色负面提示', 'Character negative', 'キャラクターの除外プロンプト'), character.negativePrompt ?? '', value => stagePrompt({ characters: editedCharacters(index, { negativePrompt: value || null }) }))}
      <label className="check-row"><CandidateCheckbox checked={character.position !== null} onChange={event => updateCharacter(index, { position: event.target.checked ? { x: .5, y: .5 } : null })}/>{t('指定位置', 'Set position', '位置を指定')}</label>
      {character.position && (['x', 'y'] as const).map(axis => <CandidateNumberField key={axis} label={axis.toUpperCase()}
        value={character.position![axis]} min={0} max={1} step={.05} locale={locale}
        onCommit={value => updateCharacter(index, { position: { ...character.position!, [axis]: value } })}/>)}
      <CandidateToolbar label={t('角色提示操作', 'Character prompt actions', 'キャラクタープロンプトの操作')} className="w-full">
        <CandidateButton variant="outline" onClick={() => void copy(character.prompt)}>{t('复制角色提示', 'Copy character prompt', 'キャラクタープロンプトをコピー')}</CandidateButton>
        <CandidateButton variant="outline" onClick={() => void copy(character.negativePrompt ?? '')}>{t('复制角色负面', 'Copy character negative', 'キャラクターの除外プロンプトをコピー')}</CandidateButton>
        <CandidateButton variant="ghost" disabled={index === 0} onClick={() => moveCharacter(index, index - 1)}>{t('上移', 'Move up', '上へ')}</CandidateButton>
        <CandidateButton variant="ghost" disabled={index === prompt.characters.length - 1} onClick={() => moveCharacter(index, index + 1)}>{t('下移', 'Move down', '下へ')}</CandidateButton>
        <CandidateButton variant="danger" onClick={() => updateCharacters(prompt.characters.filter((_, position) => position !== index))}>{t('移除角色', 'Remove character', 'キャラクターを削除')}</CandidateButton>
      </CandidateToolbar>
    </CandidateFieldGroup>)}
    <CandidateToolbar label={t('提示操作', 'Prompt actions', 'プロンプトの操作')} className="w-full">
      <CandidateButton variant="outline" onClick={() => updateCharacters([...prompt.characters, { name: '', prompt: '', negativePrompt: null, position: null }])}>{t('添加角色块', 'Add character block', 'キャラクターブロックを追加')}</CandidateButton>
      <CandidateButton variant="outline" onClick={() => void copy(novelAISeparatedPrompt(prompt, settings))}>{t('复制分隔提示（单一提示框）', 'Copy separated prompt (single field)', '区切り付きプロンプトをコピー（単一入力欄）')}</CandidateButton>
    </CandidateToolbar>
    {textField(t('建议（供审阅）', 'Suggestions for review', '提案（確認用）'), prompt.suggestions ?? '', value => stagePrompt({ suggestions: value || null }))}
    <CandidateField label={referenceLabel} className="candidate-production-long" error={referenceError ? <span role="alert">{localizeIssue(issue!, locale)}</span> : undefined}>
      <CandidateTextarea rows={6} value={referenceDraft ?? JSON.stringify(fields.novelaiReference ?? defaultReference, null, 2)}
        onChange={event => setReferenceDraft(event.target.value)} onBlur={applyReference}/>
    </CandidateField>
    <p role="status" className={status ? 'w-full' : 'sr-only'}>{status}</p>
    {issue && <>
      {!referenceError && <p role="alert" className="field-error">{localizeIssue(issue, locale)}</p>}
      <ProductionDisclosure><span>{t('诊断详情', 'Diagnostic details', '診断の詳細')}</span><pre className="whitespace-pre-wrap break-words">{issueDetails(issue)}</pre></ProductionDisclosure>
    </>}
  </CandidateFieldGroup>;
}
