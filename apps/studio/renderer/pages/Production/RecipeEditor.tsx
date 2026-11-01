import type { ComponentProps } from 'react';
import { localizeRecipe } from '@galcraft/authoring/recipes/operations';
import { displayMessage, operationTitle, operationDescription } from '@galcraft/plugins/contracts';
import { useState, useRef, useEffect } from 'react';
import type { CreationRecipe } from '@galcraft/authoring/recipes';
import { Button, Choice, Field, Modal, Badge } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Separator } from '../../components/ui/separator.js';
import { Disclosure } from '../../components/disclosure.js';
import { requestDialog } from '../../components/request-dialog.js';
import { PluginFields } from '../Plugins/plugin-fields.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs.js';
import { BookOpen, Clapperboard, Mountain, UserRound, Image, CopyPlus, Mic, Music2, LayoutTemplate, PanelsTopLeft, AppWindow, PenTool, FileText, Trash2, UserRoundPlus, FolderPlus, Download } from 'lucide-react';

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
function RecipeChoice({ disabled, label, value, options, onChange, ...accessibility }: ComponentProps<typeof Choice> & { id?: string }) {
  return disabled ? <output {...accessibility} className="preset-readonly-value" aria-label={label}>{options.find(option => option.value === value)?.label ?? value}</output>
    : <Choice {...accessibility} label={label} value={value} options={options} onChange={onChange}/>;
}

export type PresetManagement = 'personal' | 'project' | 'export' | 'writing-default' | 'staging-default' | 'delete';
export function RecipeEditor({ recipe, savedRecipe, onChange, locale, persisted, busy, close, save, use, manage, projectId, error, inline = false, workflows = [], recipes = [], operations = [] }: {
  recipe: CreationRecipe; onChange(recipe: CreationRecipe): void; locale: string; persisted: boolean; busy: boolean;
  close(): void; save(useAfter: boolean): void; use(): void; manage(action: PresetManagement): void; projectId: string; error?: string; savedRecipe?: CreationRecipe; inline?: boolean; workflows?: import('@galcraft/authoring/production').WorkflowBinding[]; recipes?: CreationRecipe[]; operations?: import('@galcraft/contracts').ProductionOperationSnapshot[];
}) {
  recipe = localizeRecipe(recipe, locale);
  const [tab, setTab] = useState('basics');
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const readOnly = recipe.scope === 'official';
  const frozenOperation = recipe.operationSnapshot;
  const displayOperation = operations.find(value => value.id === frozenOperation?.id && value.version === frozenOperation.version && value.provider?.id === frozenOperation.provider?.id && value.provider?.version === frozenOperation.provider?.version) ?? frozenOperation;
  const extension = displayOperation?.provider ? displayOperation.definition : null;
  const PurposeIcon = presetIcon(recipe);
  const saved = useRef(recipe);
  useEffect(() => { saved.current = recipe; }, [recipe.id, recipe.revision]);
  const dirty = !readOnly && JSON.stringify(recipe) !== JSON.stringify(savedRecipe ?? saved.current);
  const requestClose = async () => {
    if (busy) return;
    if (dirty) {
      const confirmed = await requestDialog({ title: t('放弃未保存的预设修改？', 'Discard unsaved preset changes?', '未保存の変更を破棄しますか？'),
        description: t('已保存的预设会保留。继续编辑可以返回当前表单。', 'The saved preset is kept. Cancel to continue editing.', '保存済みのプリセットは保持します。キャンセルで編集を続けられます。'), locale, destructive: true,
        confirmLabel: t('放弃更改', 'Discard changes', '変更を破棄') });
      if (confirmed === null) return;
    }
    close();
  };
  const uses: Record<string, CreationRecipe['uses']> = { script: ['script'], imagePrompt: ['background','figure','cg','ui'], differencePrompt: ['difference'], speechText: ['voice'], musicPrompt: ['bgm'], uiPlan: ['ui'], uiPatch: ['ui'], svg: ['ui'] };
  const title = recipe.parameterPreset ? t('参数预设', 'Parameter preset', 'パラメータプリセット') : recipe.production ? t('制作方案', 'Production scheme', '制作方法') : t('提示规则', 'Prompt rule', 'プロンプトルール');
  const management = persisted && <section className="preset-management persistent-preset-management">
    <div className="gc-actions"><Button tone="quiet" disabled={busy || dirty} onClick={() => manage('personal')}><UserRoundPlus size={15}/>{t('复制到个人','Copy to personal','個人にコピー')}</Button><Button tone="quiet" disabled={busy || dirty} onClick={() => manage('project')}><FolderPlus size={15}/>{t('复制到作品','Copy to project','作品にコピー')}</Button><Button disabled={busy || dirty} onClick={() => manage('export')}><Download size={15}/>{t('导出方案','Export scheme','書き出す')}</Button>{!readOnly&&<><span role="separator" className="preset-action-separator"/><Button disabled={busy} tone="danger" onClick={()=>manage('delete')}><Trash2 size={15}/>{t('删除此预设','Delete preset','プリセットを削除')}</Button></>}</div>
    {dirty && <p>{t('先保存本次修改。', 'Save the current changes first.', '先に変更を保存してください。')}</p>}
  </section>;
  const content = <>
    <header className="preset-document-title"><h2>{recipe.name || title}</h2><Badge>{title}</Badge></header>
    <div className="preset-introduction"><div className="preset-identity"><span className="recipe-symbol" aria-hidden="true"><PurposeIcon size={21}/></span><Badge source={recipe.scope}>{presetSource(recipe.scope, locale)}{readOnly ? t(' · 只读', ' · read only', '・読み取り専用') : t('预设', ' preset', 'プリセット')}</Badge></div>
      <p>{recipe.production ? t('方案保存执行用途和允许调整的参数。保存不发送生成请求，使用时形成独立草稿。', 'A scheme stores execution and adjustable parameters. Saving creates no request; using it opens an independent draft.', '実行用途と調整可能な設定を保存。保存では生成せず、使用時に独立した下書きを開きます。') : t('提示规则保存文字处理风格和输出要求。明确的文字步骤才读取规则。', 'A preset saves your style and output rules. When using it, add a request, choose a service, then review generation.', 'プリセットに文体と出力ルールを保存。使用時に今回の要望とサービスを選び、生成を確認します。')}</p></div>
    {!recipe.production && !recipe.parameterPreset && <Tabs value={tab} onValueChange={value => setTab(String(value))}>
    <TabsList className="preset-sections" aria-label={t('预设设置分组', 'Preset sections', 'プリセットの設定')}>
      {([['basics', t('基本信息', 'Basics', '基本情報')], ['prompts', t('提示词与规则', 'Prompts & rules', 'プロンプトとルール')], ['examples', t('示例（可选）', 'Examples (optional)', '例（任意）')]]).map(([key, label]) => <TabsTrigger key={key} value={key}>{label}</TabsTrigger>)}
    </TabsList>
    <TabsContent value="basics" className="preset-section preset-basics" keepMounted>
      <Field name="recipeName" label={t('预设名称', 'Preset name', 'プリセット名')} required={!readOnly} error={error}><Input value={recipe.name} readOnly={readOnly} onChange={e => onChange({ ...recipe, name: e.target.value })}/></Field>
      <Field name="recipeDescription" label={t('适合什么时候使用', 'When to use it', '使う場面')} help={t('例如：扩写温柔日常，保留角色原有性格。', 'For example: expand gentle everyday scenes while preserving characterization.', '例：キャラクターの性格を保ち、穏やかな日常を膨らませる。')}><Textarea rows={3} readOnly={readOnly} value={recipe.description} onChange={e => onChange({ ...recipe, description: e.target.value })}/></Field>
      <Field label={t('生成内容', 'Output type', '生成する内容')}><RecipeChoice disabled={readOnly} label={t('生成内容', 'Output type', '生成する内容')} value={recipe.purposes[0]!} options={Object.keys(uses).map(key => ({ value: key, label: presetPurpose(key, locale) }))} onChange={key => onChange({ ...recipe, purposes: [key as CreationRecipe['purposes'][number]], uses: uses[key]! })}/></Field>
      {recipe.purposes.includes('script') && <Field label={t('剧情处理方式', 'Story behavior', 'シナリオの処理')}><RecipeChoice disabled={readOnly} label={t('剧情处理方式', 'Story behavior', 'シナリオの処理')} value={recipe.scriptMode ?? 'write'} options={[{value:'write',label:t('写剧情 · 可修改正文', 'Write · allow story changes', '執筆・本文を変更できる')},{value:'performance',label:t('补演出 · 保留台词与分支', 'Stage · preserve dialogue and branches', '演出・台詞と分岐を保持')}]} onChange={mode => onChange({ ...recipe, scriptMode: mode as 'write'|'performance' })}/></Field>}
      {!persisted && <Field label={t('保存到哪里', 'Where to save', '保存先')}><RecipeChoice label={t('保存范围', 'Save scope', '保存範囲')} value={recipe.scope} options={[{value:'personal',label:t('个人 · 在其他作品复用', 'Personal · reuse across projects', '個人・他の作品でも使用')},{value:'project',label:t('作品 · 随作品一起分享', 'Project · share with this project', '作品・作品と一緒に共有')}]} onChange={scope => onChange({ ...recipe, scope: scope as 'personal'|'project', projectId: scope === 'project' ? projectId : null })}/></Field>}
      <Separator/>
      <fieldset className="preset-context"><legend>{t('默认参考资料', 'Default context', '既定の参照資料')}</legend>
        <p>{t('这里只选择资料类型，使用预设时可以检查具体发送内容。', 'Choose source types here; review the exact content before sending.', '資料の種類を選択。具体的な送信内容は使用時に確認できます。')}</p>
        {(['setting','character','script','assetCatalog','media','ui','style'] as const).map((kind, index) => <label key={kind}><input type="checkbox" disabled={readOnly} checked={recipe.contextDefaults.includes(kind)} onChange={e => onChange({ ...recipe, contextDefaults: e.target.checked ? [...recipe.contextDefaults, kind] : recipe.contextDefaults.filter(item => item !== kind) })}/>{[t('世界与大纲','World and outline','世界観とアウトライン'),t('关联角色','Characters','キャラクター'),t('当前剧情','Current story','現在のシナリオ'),t('素材目录','Asset catalog','素材一覧'),t('引用媒体','Referenced media','参照メディア'),t('页面','Pages','ページ'),t('风格','Style','スタイル')][index]}</label>)}
      </fieldset>
    </TabsContent>
    <TabsContent value="prompts" className="preset-section" keepMounted>
      <p className="preset-help">{t('这些规则会与本轮要求一起发送给 AI。保留 {{context}} 与 {{instruction}}，用于填入资料和本轮要求。', 'These rules accompany each request. Keep {{context}} and {{instruction}} to insert context and the current request.', '各リクエストに添えるルールです。資料と今回の要望を入れる {{context}} と {{instruction}} を保持してください。')}</p>
      {(['systemPrompt','taskTemplate','outputGuidance'] as const).map((key, index) => <Field key={key} label={[t('角色与写作风格','Role and writing style','役割と文体'),t('每轮任务模板','Request template','リクエストのテンプレート'),t('输出要求','Output rules','出力ルール')][index]}><Textarea rows={index === 1 ? 7 : 5} readOnly={readOnly} value={recipe[key]} onChange={e => onChange({ ...recipe, [key]: e.target.value })}/></Field>)}
    </TabsContent>
    <TabsContent value="examples" className="preset-section" keepMounted>
      <p className="preset-help">{t('给出一组理想的要求和结果，帮助 AI 理解你想要的风格；也可以留空。', 'Provide an ideal request and response to demonstrate the style, or leave these blank.', '理想の要望と結果で文体を示します。空欄でもかまいません。')}</p>
      <Field label={t('示例要求','Example request','要望の例')}><Textarea rows={4} readOnly={readOnly} value={recipe.examples[0]?.input ?? ''} onChange={e => onChange({ ...recipe, examples: [{ input: e.target.value, output: recipe.examples[0]?.output ?? '' }, ...recipe.examples.slice(1)] })}/></Field>
      <Field label={t('示例结果','Example response','結果の例')}><Textarea rows={8} readOnly={readOnly} value={recipe.examples[0]?.output ?? ''} onChange={e => onChange({ ...recipe, examples: [{ input: recipe.examples[0]?.input ?? '', output: e.target.value }, ...recipe.examples.slice(1)] })}/></Field>
    </TabsContent>
    </Tabs>}
    {recipe.production && <section className="preset-section production-scheme-editor">
      <Field label={t('方案名称', 'Scheme name', '制作方法の名前')} error={error}><Input value={recipe.name} readOnly={readOnly} onChange={e => onChange({ ...recipe, name: e.target.value })}/></Field>
      <Field label={t('用途说明', 'Use description', '用途の説明')}><Textarea rows={3} value={recipe.description} readOnly={readOnly} onChange={e => onChange({ ...recipe, description: e.target.value })}/></Field>
      <Field label={t('执行用途', 'Execution operation', '実行用途')}><RecipeChoice disabled={readOnly || !!extension} label={t('执行用途', 'Execution operation', '実行用途')} value={recipe.production.operation} options={[...(extension ? [{ value: extension.id, label: operationTitle(displayOperation!, locale) }] : []), { value: 'image', label: t('直接图像', 'Direct image', '画像生成') }, { value: 'difference', label: t('图像差分', 'Image variation', '画像差分') }, { value: 'speech', label: t('直接配音', 'Direct speech', '音声生成') }, { value: 'music', label: t('直接音乐', 'Direct music', '音楽生成') }]} onChange={value => onChange({ ...recipe, uses: value === 'image' ? ['background','figure','cg','ui'] : value === 'speech' ? ['voice'] : value === 'music' ? ['bgm'] : ['difference'], production: { ...recipe.production!, operation: value as NonNullable<CreationRecipe['production']>['operation'] } })}/></Field>
      <p>{recipe.production.executor === 'planned' ? t('规划状态：尚无执行器，当前不能生成。', 'Planned: no executor is connected, so generation is unavailable.', '計画中：実行機能未接続のため生成できません。') : t('实际连接按用途在制作草稿中选择；方案不保存个人凭据。', 'Choose the actual connection in the draft. Schemes contain no personal credentials.', '実際の接続は下書きで選択。個人の認証情報は含みません。')}</p>
      <Field label={t('兼容执行方式', 'Compatible executor', '対応する実行方法')}><RecipeChoice disabled={readOnly || !!extension || recipe.production.executor === 'planned'} label={t('兼容执行方式', 'Compatible executor', '対応する実行方法')} value={recipe.production.protocol ?? ''} options={[{ value: '', label: t('按用途选择连接', 'Choose connection by purpose', '用途で接続を選択') }, { value: 'comfyUI', label: 'ComfyUI' }, { value: 'plugin', label: t('插件提供方', 'Plugin provider', 'プラグイン提供元') }]} onChange={protocol => onChange({ ...recipe, production: { ...recipe.production!, protocol: protocol || null } })}/></Field>
      {recipe.production.protocol === 'comfyUI' && <Field label={t('ComfyUI 执行图与语义映射', 'ComfyUI graph and semantic mapping', 'ComfyUI グラフとマッピング')}><RecipeChoice disabled={readOnly} label="ComfyUI" value={recipe.production.workflow?.id ?? ''} options={[{ value: '', label: t('在制作草稿中选择', 'Choose in the draft', '下書きで選択') }, ...workflows.filter(workflow => workflow.purpose === recipe.production!.operation).map(workflow => ({ value: workflow.id, label: workflow.name }))]} onChange={id => onChange({ ...recipe, production: { ...recipe.production!, workflow: structuredClone(workflows.find(workflow => workflow.id === id)) } })}/>{recipe.production.workflow && <p>{t('方案携带此执行图与映射快照；复制与导出会保留。', 'The scheme carries this graph and mapping snapshot through copy and export.', 'コピーと書き出しに実行グラフとマッピングを保持します。')}</p>}</Field>}
      <h3>{t('参数默认与可调边界', 'Parameter defaults and limits', 'パラメータの既定値と範囲')}</h3>
      {recipe.production.parameters.map(parameter => <Field key={parameter.key} label={parameter.label} help={[parameter.help, parameter.min !== null || parameter.max !== null ? `${parameter.min ?? '—'} ～ ${parameter.max ?? '—'}` : ''].filter(Boolean).join(' · ')}>
        {parameter.type === 'boolean' ? <input type="checkbox" disabled={readOnly} checked={recipe.production!.defaults[parameter.key] === true} onChange={e => onChange({ ...recipe, production: { ...recipe.production!, defaults: { ...recipe.production!.defaults, [parameter.key]: e.target.checked } } })}/> : parameter.type === 'enum' ? <RecipeChoice disabled={readOnly} label={parameter.label} value={String(recipe.production!.defaults[parameter.key] ?? parameter.defaultValue)} options={parameter.choices.map(value => ({ value, label: value }))} onChange={value => onChange({ ...recipe, production: { ...recipe.production!, defaults: { ...recipe.production!.defaults, [parameter.key]: value } } })}/> : <Input readOnly={readOnly} type={parameter.type === 'number' ? 'number' : 'text'} min={parameter.min ?? undefined} max={parameter.max ?? undefined} value={String(recipe.production!.defaults[parameter.key] ?? parameter.defaultValue ?? '')} onChange={e => onChange({ ...recipe, production: { ...recipe.production!, defaults: { ...recipe.production!.defaults, [parameter.key]: parameter.type === 'number' ? Number(e.target.value) : e.target.value } } })}/>}
      </Field>)}
      {extension && <fieldset disabled={readOnly}>{extension.fields.some(field => field.type !== 'object') && <PluginFields fields={extension.fields.filter(field => field.type !== 'object')} translate={key => displayMessage(displayOperation?.messages, locale, key, key)} value={recipe.production.defaults} locale={locale} change={defaults => onChange({ ...recipe, production: { ...recipe.production!, defaults: { ...recipe.production!.defaults, ...defaults } } })}/>} {extension.fields.filter(field => field.type === 'object').map(field => <p key={field.path}>{displayMessage(displayOperation?.messages, locale, field.labelKey, field.label)}：{t('预设保留完整起稿，使用后在制作工位继续编辑。', 'The complete starting content is preserved. Edit it in the production workstation after using this preset.', '開始データを保持しています。使用後に制作ワークスペースで編集できます。')}</p>)}</fieldset>}
      {!extension && !recipe.production.parameters.length && <p>{t('此方案当前没有开放参数。', 'This scheme exposes no parameters yet.', 'この制作方法には調整項目がありません。')}</p>}
    </section>}
    {recipe.parameterPreset && <section className="preset-section"><Field label={t('参数预设名称', 'Parameter preset name', 'パラメータプリセット名')} error={error}><Input readOnly={readOnly} value={recipe.name} onChange={e => onChange({ ...recipe, name: e.target.value })}/></Field><p>{t('只复用开放参数，不改变制作用途或增加请求。', 'Reuses adjustable values without changing operation or adding requests.', '調整可能な値を再利用し、用途やリクエストを変更しません。')}</p>{Object.entries(recipe.parameterPreset.values).map(([key, value]) => <Field key={key} label={recipes.find(item => item.id === recipe.parameterPreset?.recipeId)?.production?.parameters.find(parameter => parameter.key === key)?.label ?? key}><Input readOnly={readOnly} type={typeof value === 'number' ? 'number' : 'text'} value={String(value ?? '')} onChange={e => onChange({ ...recipe, parameterPreset: { ...recipe.parameterPreset!, values: { ...recipe.parameterPreset!.values, [key]: typeof value === 'number' ? Number(e.target.value) : e.target.value } } })}/></Field>)}</section>}
    {persisted && <Disclosure><span>{t('管理已保存的预设', 'Manage saved preset', '保存済みプリセットを管理')}</span><div className="preset-management">
      {management}
      <p>{dirty ? t('先保存修改，再复制、导出或设置默认预设。', 'Save your changes before copying, exporting, or setting a default.', '変更を保存してから、コピー・書き出し・既定の設定を行ってください。') : t('管理操作使用已保存的版本。', 'Management actions use the saved version.', '管理操作は保存済みの版を使用します。')}</p>
      {recipe.purposes.includes('script') && <div className="gc-actions"><Button disabled={busy || dirty} onClick={() => manage('writing-default')}>{t('设为写剧情默认','Use by default for writing','執筆の既定に設定')}</Button><Button disabled={busy || dirty} onClick={() => manage('staging-default')}>{t('设为补演出默认','Use by default for staging','演出の既定に設定')}</Button></div>}
    </div></Disclosure>}
    <footer className="dialog-actions"><p>{t('下一步：填写创作要求', 'Next: add your request', '次へ：今回の要望を入力')}</p><Button disabled={busy} onClick={() => void requestClose()}>{t('关闭','Close','閉じる')}</Button>
      {readOnly ? <Button tone="primary" disabled={busy || recipe.production?.executor === 'planned'} onClick={use}>{t('使用此预设','Use this preset','このプリセットを使用')}</Button> : <><Button disabled={busy} onClick={() => { if (!recipe.name.trim()) setTab('basics'); save(false); }}>{t('保存预设','Save preset','保存')}</Button><Button disabled={busy} tone="primary" onClick={() => { if (!recipe.name.trim()) setTab('basics'); save(true); }}>{t('保存并使用','Save and use','保存して使用')}</Button></>}
    </footer>
  </>;
  return inline ? <section className="persistent-recipe-editor">{content}</section> : <Modal title={title} presentation="sheet" close={() => void requestClose()}>{content}</Modal>;
}
