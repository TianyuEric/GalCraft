import { CandidateButton, CandidateCheckbox, CandidateInput, CandidateTextarea, CandidateFieldGroup, CandidateToolbar, CandidateTab, CandidateTabList, CandidateActionMenu, type CandidateMenuAction, type CandidateMenuTarget } from '../controls/index.js';
import { ProductionChoice, ProductionField, ProductionConfirm, ProductionStatus } from './ProductionControls.js';
import { ProductionSchemaFields } from './ProductionSchemaFields.js';
import type { ComponentProps } from 'react';
import { localizeRecipe } from '@galcraft/authoring/recipes/operations';
import { displayMessage, operationTitle, operationDescription } from '@galcraft/plugins/contracts';
import { useState, useRef, useEffect, useId } from 'react';
import type { CreationRecipe } from '@galcraft/authoring/recipes';

import { BookOpen, Clapperboard, Mountain, UserRound, Image, CopyPlus, Mic, Music2, LayoutTemplate, PanelsTopLeft, AppWindow, PenTool, FileText } from 'lucide-react';

export function presetIcon(recipe: Pick<CreationRecipe, 'purposes' | 'uses' | 'scriptMode' | 'production'>) {
  if (recipe.production?.operation.includes('/')) return recipe.uses.includes('bgm') ? Music2 : recipe.uses.includes('voice') ? Mic : FileText;
  const purpose = recipe.production?.operation === 'speech' ? 'speechText' : recipe.production?.operation === 'music' ? 'musicPrompt' : recipe.production?.operation === 'difference' ? 'differencePrompt' : recipe.purposes[0];
  if (purpose === 'script') return recipe.scriptMode === 'performance' ? Clapperboard : BookOpen;
  if (purpose === 'differencePrompt') return CopyPlus;
  if (purpose === 'speechText') return Mic;
  if (purpose === 'musicPrompt') return Music2;
  if (purpose === 'uiPlan') return LayoutTemplate;
  if (purpose === 'uiPatch') return PanelsTopLeft;
  if (purpose === 'svg') return PenTool;
  if (purpose === 'imagePrompt') return ({ background: Mountain, figure: UserRound, cg: Image, ui: AppWindow } as const)[recipe.uses[0] as 'background' | 'figure' | 'cg' | 'ui'] ?? Image;
  return FileText;
}

export function presetSource(scope: CreationRecipe['scope'], locale: string) {
  const labels = { official: ['官方', 'Official', '公式'], personal: ['个人', 'Personal', '個人'], project: ['作品', 'Project', '作品'] };
  return labels[scope][locale === 'en' ? 1 : locale === 'ja' ? 2 : 0]!;
}

export function presetPurpose(purpose: string, locale: string) {
  const labels: Record<string, [string, string, string]> = {
    script: ['剧情脚本', 'Story script', 'シナリオ'], imagePrompt: ['图像提示词', 'Image prompt', '画像プロンプト'],
    differencePrompt: ['差分提示词', 'Variation prompt', '差分プロンプト'], speechText: ['朗读文字', 'Spoken text', '読み上げ文'],
    musicPrompt: ['音乐提示词', 'Music prompt', '音楽プロンプト'], uiPlan: ['页面创作计划', 'Page design plan', 'ページ制作計画'],
    uiPatch: ['页面修改', 'Page changes', 'ページ変更'], svg: ['SVG 图形', 'SVG graphics', 'SVG画像'],
  };
  return labels[purpose]?.[locale === 'en' ? 1 : locale === 'ja' ? 2 : 0] ?? purpose;
}

/** Read-only recipe facts remain readable; editable choices keep the shared control. */
function RecipeChoice({ disabled, label, value, options, onChange, ...accessibility }: ComponentProps<typeof ProductionChoice> & { id?: string }) {
  return disabled ? <output id={accessibility.id} aria-describedby={accessibility['aria-describedby']}
    className="preset-readonly-value" aria-label={label}>{options.find(option => option.value === value)?.label ?? value}</output>
    : <ProductionChoice {...accessibility} label={label} value={value} options={options} onChange={onChange}/>;
}

export type PresetManagement = 'personal' | 'project' | 'export' | 'writing-default' | 'staging-default' | 'delete';
export function RecipeEditor({ recipe, savedRecipe, onChange, locale, persisted, busy, close, save, use, manage, projectId, error, workflows = [], recipes = [], operations = [] }: {
  recipe: CreationRecipe; onChange(recipe: CreationRecipe): void; locale: string; persisted: boolean; busy: boolean;
  close(): void; save(useAfter: boolean): void; use(): void; manage(action: PresetManagement): void; projectId: string; error?: string; savedRecipe?: CreationRecipe; workflows?: import('@galcraft/authoring/production').WorkflowBinding[]; recipes?: CreationRecipe[]; operations?: import('@galcraft/contracts').ProductionOperationSnapshot[];
}) {
  recipe = localizeRecipe(recipe, locale);
  const [tab, setTab] = useState('basics'), [confirmClose, setConfirmClose] = useState(false);
  const [managementMenu, setManagementMenu] = useState<CandidateMenuTarget | null>(null);
  const id = useId();
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const readOnly = recipe.scope === 'official';
  const frozenOperation = recipe.operationSnapshot;
  const displayOperation = operations.find(value => value.id === frozenOperation?.id && value.version === frozenOperation.version && value.provider?.id === frozenOperation.provider?.id && value.provider?.version === frozenOperation.provider?.version) ?? frozenOperation;
  const extension = displayOperation?.provider ? displayOperation.definition : null;
  const PurposeIcon = presetIcon(recipe);
  const saved = useRef(recipe);
  useEffect(() => { saved.current = recipe; }, [recipe.id, recipe.revision]);
  const dirty = !readOnly && JSON.stringify(recipe) !== JSON.stringify(savedRecipe ?? saved.current);
  const requestClose = () => { if (!busy) { if (dirty) setConfirmClose(true); else close(); } };
  const uses: Record<string, CreationRecipe['uses']> = { script: ['script'], imagePrompt: ['background','figure','cg','ui'], differencePrompt: ['difference'], speechText: ['voice'], musicPrompt: ['bgm'], uiPlan: ['ui'], uiPatch: ['ui'], svg: ['ui'] };
  const title = recipe.parameterPreset ? t('参数预设', 'Parameter preset', 'パラメータプリセット') : recipe.production ? t('制作方案', 'Production scheme', '制作方法') : t('提示规则', 'Prompt rule', 'プロンプトルール');
  const content = <>
    <header className="preset-document-title"><h2>{recipe.name || title}</h2><ProductionStatus>{title}</ProductionStatus></header>
    <div className="preset-introduction"><div className="preset-identity"><span className="recipe-symbol" aria-hidden="true"><PurposeIcon size={21}/></span><ProductionStatus source={recipe.scope}>{presetSource(recipe.scope, locale)}{readOnly ? t(' · 只读', ' · read only', '・読み取り専用') : t('预设', ' preset', 'プリセット')}</ProductionStatus></div>
      <p>{recipe.production ? t('方案保存执行用途和允许调整的参数。保存不发送生成请求，使用时形成独立草稿。', 'A scheme stores execution and adjustable parameters. Saving creates no request; using it opens an independent draft.', '実行用途と調整可能な設定を保存。保存では生成せず、使用時に独立した下書きを開きます。') : t('提示规则保存文字处理风格和输出要求。明确的文字步骤才读取规则。', 'A preset saves your style and output rules. When using it, add a request, choose a service, then review generation.', 'プリセットに文体と出力ルールを保存。使用時に今回の要望とサービスを選び、生成を確認します。')}</p></div>
    {!recipe.production && !recipe.parameterPreset && <>
    <CandidateTabList label={t("预设设置分组", "Preset sections", "プリセットの設定")} className="preset-sections">
      {([["basics", t("基本信息", "Basics", "基本情報")], ["prompts", t("提示词与规则", "Prompts & rules", "プロンプトとルール")], ["examples", t("示例（可选）", "Examples (optional)", "例（任意）")]]).map(([key, label]) =>
        <CandidateTab key={key} title={label!} tabId={id + "-" + key} controls={id + "-" + key + "-panel"} active={tab === key} onActivate={() => setTab(key!)}/>)}
    </CandidateTabList>
    <section id={id + "-basics-panel"} aria-labelledby={id + "-basics"} role="tabpanel" hidden={tab !== "basics"} className="preset-section preset-basics">
      <ProductionField name="recipeName" label={t('预设名称', 'Preset name', 'プリセット名')} required={!readOnly} error={error}><CandidateInput value={recipe.name} readOnly={readOnly} onChange={e => onChange({ ...recipe, name: e.target.value })}/></ProductionField>
      <ProductionField name="recipeDescription" label={t('适合什么时候使用', 'When to use it', '使う場面')} help={t('例如：扩写温柔日常，保留角色原有性格。', 'For example: expand gentle everyday scenes while preserving characterization.', '例：キャラクターの性格を保ち、穏やかな日常を膨らませる。')}><CandidateTextarea rows={3} readOnly={readOnly} value={recipe.description} onChange={e => onChange({ ...recipe, description: e.target.value })}/></ProductionField>
      <ProductionField label={t('生成内容', 'Output type', '生成する内容')}><RecipeChoice disabled={readOnly} label={t('生成内容', 'Output type', '生成する内容')} value={recipe.purposes[0]!} options={Object.keys(uses).map(key => ({ value: key, label: presetPurpose(key, locale) }))} onChange={key => onChange({ ...recipe, purposes: [key as CreationRecipe['purposes'][number]], uses: uses[key]! })}/></ProductionField>
      {recipe.purposes.includes('script') && <ProductionField label={t('剧情处理方式', 'Story behavior', 'シナリオの処理')}><RecipeChoice disabled={readOnly} label={t('剧情处理方式', 'Story behavior', 'シナリオの処理')} value={recipe.scriptMode ?? 'write'} options={[{value:'write',label:t('写剧情 · 可修改正文', 'Write · allow story changes', '執筆・本文を変更できる')},{value:'performance',label:t('补演出 · 保留台词与分支', 'Stage · preserve dialogue and branches', '演出・台詞と分岐を保持')}]} onChange={mode => onChange({ ...recipe, scriptMode: mode as 'write'|'performance' })}/></ProductionField>}
      {!persisted && <ProductionField label={t('保存到哪里', 'Where to save', '保存先')}><RecipeChoice label={t('保存范围', 'Save scope', '保存範囲')} value={recipe.scope} options={[{value:'personal',label:t('个人 · 在其他作品复用', 'Personal · reuse across projects', '個人・他の作品でも使用')},{value:'project',label:t('作品 · 随作品一起分享', 'Project · share with this project', '作品・作品と一緒に共有')}]} onChange={scope => onChange({ ...recipe, scope: scope as 'personal'|'project', projectId: scope === 'project' ? projectId : null })}/></ProductionField>}

      <CandidateFieldGroup className="preset-context" title={t("默认参考资料", "Default context", "既定の参照資料")}>
        <p>{t('这里只选择资料类型，使用预设时可以检查具体发送内容。', 'Choose source types here; review the exact content before sending.', '資料の種類を選択。具体的な送信内容は使用時に確認できます。')}</p>
        {(['setting','character','script','assetCatalog','media','ui','style'] as const).map((kind, index) => <label key={kind}><CandidateCheckbox  disabled={readOnly} checked={recipe.contextDefaults.includes(kind)} onChange={e => onChange({ ...recipe, contextDefaults: e.target.checked ? [...recipe.contextDefaults, kind] : recipe.contextDefaults.filter(item => item !== kind) })}/>{[t('世界与大纲','World and outline','世界観とアウトライン'),t('关联角色','Characters','キャラクター'),t('当前剧情','Current story','現在のシナリオ'),t('素材目录','Asset catalog','素材一覧'),t('引用媒体','Referenced media','参照メディア'),t('页面','Pages','ページ'),t('风格','Style','スタイル')][index]}</label>)}
      </CandidateFieldGroup>
    </section>
    <section id={id + "-prompts-panel"} aria-labelledby={id + "-prompts"} role="tabpanel" hidden={tab !== "prompts"} className="preset-section">
      <p className="preset-help">{t('这些规则会与本轮要求一起发送给 AI。保留 {{context}} 与 {{instruction}}，用于填入资料和本轮要求。', 'These rules accompany each request. Keep {{context}} and {{instruction}} to insert context and the current request.', '各リクエストに添えるルールです。資料と今回の要望を入れる {{context}} と {{instruction}} を保持してください。')}</p>
      {(['systemPrompt','taskTemplate','outputGuidance'] as const).map((key, index) => <ProductionField key={key} label={[t('角色与写作风格','Role and writing style','役割と文体'),t('每轮任务模板','Request template','リクエストのテンプレート'),t('输出要求','Output rules','出力ルール')][index]}><CandidateTextarea rows={index === 1 ? 7 : 5} readOnly={readOnly} value={recipe[key]} onChange={e => onChange({ ...recipe, [key]: e.target.value })}/></ProductionField>)}
    </section>
    <section id={id + "-examples-panel"} aria-labelledby={id + "-examples"} role="tabpanel" hidden={tab !== "examples"} className="preset-section">
      <p className="preset-help">{t('给出一组理想的要求和结果，帮助 AI 理解你想要的风格；也可以留空。', 'Provide an ideal request and response to demonstrate the style, or leave these blank.', '理想の要望と結果で文体を示します。空欄でもかまいません。')}</p>
      <ProductionField label={t('示例要求','Example request','要望の例')}><CandidateTextarea rows={4} readOnly={readOnly} value={recipe.examples[0]?.input ?? ''} onChange={e => onChange({ ...recipe, examples: [{ input: e.target.value, output: recipe.examples[0]?.output ?? '' }, ...recipe.examples.slice(1)] })}/></ProductionField>
      <ProductionField label={t('示例结果','Example response','結果の例')}><CandidateTextarea rows={8} readOnly={readOnly} value={recipe.examples[0]?.output ?? ''} onChange={e => onChange({ ...recipe, examples: [{ input: recipe.examples[0]?.input ?? '', output: e.target.value }, ...recipe.examples.slice(1)] })}/></ProductionField>
    </section>
    </>}
    {recipe.production && <section className="preset-section production-scheme-editor">
      <ProductionField label={t('方案名称', 'Scheme name', '制作方法の名前')} error={error}><CandidateInput value={recipe.name} readOnly={readOnly} onChange={e => onChange({ ...recipe, name: e.target.value })}/></ProductionField>
      <ProductionField label={t('用途说明', 'Use description', '用途の説明')}><CandidateTextarea rows={3} value={recipe.description} readOnly={readOnly} onChange={e => onChange({ ...recipe, description: e.target.value })}/></ProductionField>
      <ProductionField label={t('执行用途', 'Execution operation', '実行用途')}><RecipeChoice disabled={readOnly || !!extension} label={t('执行用途', 'Execution operation', '実行用途')} value={recipe.production.operation} options={[...(extension ? [{ value: extension.id, label: operationTitle(displayOperation!, locale) }] : []), { value: 'image', label: t('直接图像', 'Direct image', '画像生成') }, { value: 'difference', label: t('图像差分', 'Image variation', '画像差分') }, { value: 'speech', label: t('直接配音', 'Direct speech', '音声生成') }, { value: 'music', label: t('直接音乐', 'Direct music', '音楽生成') }]} onChange={value => onChange({ ...recipe, uses: value === 'image' ? ['background','figure','cg','ui'] : value === 'speech' ? ['voice'] : value === 'music' ? ['bgm'] : ['difference'], production: { ...recipe.production!, operation: value as NonNullable<CreationRecipe['production']>['operation'] } })}/></ProductionField>
      <p>{recipe.production.executor === 'planned' ? t('规划状态：尚无执行器，当前不能生成。', 'Planned: no executor is connected, so generation is unavailable.', '計画中：実行機能未接続のため生成できません。') : t('实际连接按用途在制作草稿中选择；方案不保存个人凭据。', 'Choose the actual connection in the draft. Schemes contain no personal credentials.', '実際の接続は下書きで選択。個人の認証情報は含みません。')}</p>
      <ProductionField label={t('兼容执行方式', 'Compatible executor', '対応する実行方法')}><RecipeChoice disabled={readOnly || !!extension || recipe.production.executor === 'planned'} label={t('兼容执行方式', 'Compatible executor', '対応する実行方法')} value={recipe.production.protocol ?? ''} options={[{ value: '', label: t('按用途选择连接', 'Choose connection by purpose', '用途で接続を選択') }, { value: 'comfyUI', label: 'ComfyUI' }, { value: 'plugin', label: t('插件提供方', 'Plugin provider', 'プラグイン提供元') }]} onChange={protocol => onChange({ ...recipe, production: { ...recipe.production!, protocol: protocol || null } })}/></ProductionField>
      {recipe.production.protocol === 'comfyUI' && <ProductionField label={t('ComfyUI 执行图与语义映射', 'ComfyUI graph and semantic mapping', 'ComfyUI グラフとマッピング')}><RecipeChoice disabled={readOnly} label="ComfyUI" value={recipe.production.workflow?.id ?? ''} options={[{ value: '', label: t('在制作草稿中选择', 'Choose in the draft', '下書きで選択') }, ...workflows.filter(workflow => workflow.purpose === recipe.production!.operation).map(workflow => ({ value: workflow.id, label: workflow.name }))]} onChange={id => onChange({ ...recipe, production: { ...recipe.production!, workflow: structuredClone(workflows.find(workflow => workflow.id === id)) } })}/>{recipe.production.workflow && <p>{t('方案携带此执行图与映射快照；复制与导出会保留。', 'The scheme carries this graph and mapping snapshot through copy and export.', 'コピーと書き出しに実行グラフとマッピングを保持します。')}</p>}</ProductionField>}
      <h3>{t('参数默认与可调边界', 'Parameter defaults and limits', 'パラメータの既定値と範囲')}</h3>
      {recipe.production.parameters.map(parameter => <ProductionField key={parameter.key} label={parameter.label} help={[parameter.help, parameter.min !== null || parameter.max !== null ? `${parameter.min ?? '—'} ～ ${parameter.max ?? '—'}` : ''].filter(Boolean).join(' · ')}>
        {parameter.type === 'boolean' ? <CandidateCheckbox  disabled={readOnly} checked={recipe.production!.defaults[parameter.key] === true} onChange={e => onChange({ ...recipe, production: { ...recipe.production!, defaults: { ...recipe.production!.defaults, [parameter.key]: e.target.checked } } })}/> : parameter.type === 'enum' ? <RecipeChoice disabled={readOnly} label={parameter.label} value={String(recipe.production!.defaults[parameter.key] ?? parameter.defaultValue)} options={parameter.choices.map(value => ({ value, label: value }))} onChange={value => onChange({ ...recipe, production: { ...recipe.production!, defaults: { ...recipe.production!.defaults, [parameter.key]: value } } })}/> : <CandidateInput readOnly={readOnly} type={parameter.type === 'number' ? 'number' : 'text'} min={parameter.min ?? undefined} max={parameter.max ?? undefined} value={String(recipe.production!.defaults[parameter.key] ?? parameter.defaultValue ?? '')} onChange={e => onChange({ ...recipe, production: { ...recipe.production!, defaults: { ...recipe.production!.defaults, [parameter.key]: parameter.type === 'number' ? Number(e.target.value) : e.target.value } } })}/>}
      </ProductionField>)}
      {extension && <fieldset disabled={readOnly}>{extension.fields.some(field => field.type !== 'object') && <ProductionSchemaFields fields={extension.fields.filter(field => field.type !== 'object')} translate={key => displayMessage(displayOperation?.messages, locale, key, key)} value={recipe.production.defaults} locale={locale} change={defaults => onChange({ ...recipe, production: { ...recipe.production!, defaults: { ...recipe.production!.defaults, ...defaults } } })}/>} {extension.fields.filter(field => field.type === 'object').map(field => <p key={field.path}>{displayMessage(displayOperation?.messages, locale, field.labelKey, field.label)}：{t('预设保留完整起稿，使用后在制作工位继续编辑。', 'The complete starting content is preserved. Edit it in the production workstation after using this preset.', '開始データを保持しています。使用後に制作ワークスペースで編集できます。')}</p>)}</fieldset>}
      {!extension && !recipe.production.parameters.length && <p>{t('此方案当前没有开放参数。', 'This scheme exposes no parameters yet.', 'この制作方法には調整項目がありません。')}</p>}
    </section>}
    {recipe.parameterPreset && <section className="preset-section"><ProductionField label={t('参数预设名称', 'Parameter preset name', 'パラメータプリセット名')} error={error}><CandidateInput readOnly={readOnly} value={recipe.name} onChange={e => onChange({ ...recipe, name: e.target.value })}/></ProductionField><p>{t('只复用开放参数，不改变制作用途或增加请求。', 'Reuses adjustable values without changing operation or adding requests.', '調整可能な値を再利用し、用途やリクエストを変更しません。')}</p>{Object.entries(recipe.parameterPreset.values).map(([key, value]) => <ProductionField key={key} label={recipes.find(item => item.id === recipe.parameterPreset?.recipeId)?.production?.parameters.find(parameter => parameter.key === key)?.label ?? key}><CandidateInput readOnly={readOnly} type={typeof value === 'number' ? 'number' : 'text'} value={String(value ?? '')} onChange={e => onChange({ ...recipe, parameterPreset: { ...recipe.parameterPreset!, values: { ...recipe.parameterPreset!.values, [key]: typeof value === 'number' ? Number(e.target.value) : e.target.value } } })}/></ProductionField>)}</section>}
    {persisted && <CandidateToolbar label={t("已保存的预设", "Saved preset", "保存済みプリセット")}>
      <CandidateButton variant="outline" aria-haspopup="menu" aria-expanded={!!managementMenu}
        onClick={event => setManagementMenu({ anchor: event.currentTarget })}>{t("管理已保存的预设", "Manage saved preset", "保存済みプリセットを管理")}</CandidateButton>
      <CandidateActionMenu label={t("管理已保存的预设", "Manage saved preset", "保存済みプリセットを管理")}
        target={managementMenu} onDismiss={() => setManagementMenu(null)} actions={[
          { id: "personal", label: t("复制到个人", "Copy to personal", "個人にコピー"), run: () => manage("personal") },
          { id: "project", label: t("复制到作品", "Copy to project", "作品にコピー"), run: () => manage("project") },
          { id: "export", label: t("导出方案", "Export scheme", "書き出す"), run: () => manage("export") },
          ...(recipe.purposes.includes("script") ? [
            { id: "writing-default", separatorBefore: true, label: t("设为写剧情默认", "Use by default for writing", "執筆の既定に設定"), run: () => manage("writing-default") },
            { id: "staging-default", label: t("设为补演出默认", "Use by default for staging", "演出の既定に設定"), run: () => manage("staging-default") },
          ] : []),
        ].map<CandidateMenuAction>(action => ({ ...action, disabledReason: dirty ? t("先保存本次修改", "Save the current changes first", "先に変更を保存してください") : busy ? t("正在处理", "Working", "処理中") : undefined })).concat(!readOnly ? [{
          id: "delete", label: t("删除此预设", "Delete preset", "プリセットを削除"), danger: true, separatorBefore: true,
          run: () => manage("delete"), disabledReason: busy ? t("正在处理", "Working", "処理中") : undefined,
        }] : [])}/>
    </CandidateToolbar>}
    <footer className="candidate-production-footer"><CandidateButton variant="outline" disabled={busy} onClick={() => void requestClose()}>{t('关闭','Close','閉じる')}</CandidateButton>
      {readOnly ? <CandidateButton variant="primary" disabled={busy || recipe.production?.executor === 'planned'} onClick={use}>{t('使用此预设','Use this preset','このプリセットを使用')}</CandidateButton> : <><CandidateButton variant="outline" disabled={busy} onClick={() => { if (!recipe.name.trim()) setTab('basics'); save(false); }}>{t('保存预设','Save preset','保存')}</CandidateButton><CandidateButton disabled={busy} variant="primary" onClick={() => { if (!recipe.name.trim()) setTab('basics'); save(true); }}>{t('保存并使用','Save and use','保存して使用')}</CandidateButton></>}
    </footer>
  </>;
  return <section className="persistent-recipe-editor">{content}
    {confirmClose && <ProductionConfirm title={t("放弃未保存的预设修改？", "Discard unsaved preset changes?", "未保存の変更を破棄しますか？")}
      description={t("已保存的预设会保留。继续编辑可以返回当前表单。", "The saved preset is kept. Keep editing to return to the current form.", "保存済みのプリセットを保持します。編集を続けるとフォームに戻ります。")}
      cancelLabel={t("继续编辑", "Keep editing", "編集を続ける")} onClose={() => setConfirmClose(false)}
      actions={[{ label: t("放弃更改", "Discard changes", "変更を破棄"), tone: "danger", run: close }]}/>}
  </section>;
}
