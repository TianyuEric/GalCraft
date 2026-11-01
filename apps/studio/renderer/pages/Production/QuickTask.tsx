import { operationSupportsConnection } from '@galcraft/authoring/production/operations';
import { useState } from 'react';
import { Button, Choice, Field, Modal } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { ContextTable } from './ContextTable.js';
import { Disclosure } from '../../components/disclosure.js';
import { openAssetPicker } from '../../authoring/asset-picker.js';
import type { AuthoringServices } from '../../authoring/controller.js';
import type { ProductionSession, QuickIntent } from './session.js';
import { unwrap } from './bridge.js';

export const quickLabels: Record<QuickIntent, [string, string, string]> = {
  voice: ['配音', 'Speech', '音声'], music: ['音乐服务', 'Music service', '音楽サービス'], cg: ['CG', 'CG', 'CG'], difference: ['差分', 'Variation', '差分'],
  script: ['写剧情', 'Write story', 'シナリオを書く'], stage: ['配演出', 'Stage a scene', '演出を付ける'],
  background: ['生成背景', 'Create background', '背景を作る'], figure: ['生成立绘', 'Create character art', '立ち絵を作る'],
  page: ['设计页面', 'Design a page', 'ページをデザイン'], 'ui-assets': ['制作 UI 素材', 'Create UI assets', 'UI 素材を作る'],
};
export function QuickTask({ session: s, locale, services, busy, run, close, advanced, generated }: {
  session: ProductionSession; locale: string; services: AuthoringServices; busy: boolean;
  run(action: () => Promise<void>): Promise<void>; close(): void; advanced(): void; generated(): void;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [error, setError] = useState('');
  const v = s.variant!, draft = s.draft!, intent = s.quickIntent!;
  const image = s.purpose === 'image', requestCount = v.promptPreparation && !v.recipe ? 2 : 1;
  const connection = s.data.connections.find(connection => connection.id === v.connectionId);
  const promptConnection = s.data.connections.find(connection => connection.id === v.fields.promptConnectionId);
  const field = (key: string, label: string) => <Field label={label}><Input type="number" min="1" value={Number(v.fields[key] ?? 1)} onChange={e => s.field(key, Number(e.target.value))}/></Field>;
  const selectImageMode = (mode: string) => {
    const recipe = s.data.recipes.find(recipe => recipe.scope === 'official' && recipe.purposes.includes(mode === 'svg' ? 'svg' : 'imagePrompt') && recipe.uses.includes('ui'));
    const selection = recipe ? { recipeId: recipe.id, scope: recipe.scope, usage: 'ui' as const, purpose: mode === 'svg' ? 'svg' as const : 'imagePrompt' as const, parameterValues: {} } : null;
    s.update({ recipe: mode === 'svg' ? selection : null, promptPreparation: mode === 'svg' ? null : selection });
    s.applyDefaults(); s.changed();
  };
  return <Modal wide title={t(...quickLabels[intent])} close={close}>
    <div className="quick-task-intro">
      <p>{t('写下这次想完成的事。作品资料会随任务带入，生成结果保留为可审阅候选。', 'Describe what you want to make. Project context accompanies the request, and results remain editable candidates.', '今回作りたい内容を書いてください。作品情報を含め、結果を編集可能な候補として保存します。')}</p>
      {intent === 'script' && <Field label={t('这次如何开始', 'Start with', '開始方法')}><Choice label="创作方式" value={String(v.fields.creationMode ?? 'write')} options={[{ value: 'write', label: t('直接写剧情', 'Write a script directly', 'シナリオを直接作成') }, { value: 'discuss', label: t('先讨论情节', 'Discuss the story first', '先に展開を相談') }]} onChange={mode => s.field('creationMode', mode)}/></Field>}
      {intent === 'stage' && <p className="quick-mode-hint">{t('补演出会锁定台词、说话者和剧情分支，只配置背景、立绘、声音与过渡。要修改故事内容，请使用“写剧情”。', 'Stage direction preserves dialogue, speakers and branches while adding visuals, sound and transitions. Use Write story to change the narrative.', '演出では台詞、話者、分岐を保持し、画像、音、切り替えを設定します。物語の変更は「シナリオを書く」を選んでください。')}</p>}
      <Field label={t('创作需求', 'Your request', '制作の要望')} required error={error}>
        <Textarea autoFocus rows={4} value={String(v.fields.instruction ?? '')} placeholder={t('例如：黄昏的海边，主角终于说出约定，气氛温柔而克制。', 'For example: a quiet sunset beach scene where the protagonist finally shares their promise.', '例：夕暮れの海辺で、主人公が約束を静かに語る。')} onChange={e => { s.field('instruction', e.target.value); setError(''); }}/>
      </Field>
    </div>
    <div className="form-grid">
      {!['page', 'ui-assets'].includes(intent) && <Field label={t('目标场景', 'Scene', 'シーン')}>
        <Choice label="Scene" value={v.target.sceneId ?? ''} options={[{ value: '', label: t('只制作素材', 'Asset only', '素材のみ') }, ...s.data.scenes.map(scene => ({ value: scene.id, label: scene.name }))]} onChange={id => void run(() => s.setQuickScene(id || null))}/>
      </Field>}
      {intent === 'figure' && <Field label={t('角色', 'Character', 'キャラクター')}><Choice label="Character" value={v.target.characterId ?? ''} options={[{ value: '', label: t('选择角色（可选）', 'Choose character (optional)', 'キャラクターを選択（任意）') }, ...s.data.characters.map(character => ({ value: character.id, label: character.name }))]} onChange={id => void run(async () => { s.update({ target: { ...v.target, characterId: id || null } }); await s.captureContext(); })}/></Field>}
      {['page', 'ui-assets'].includes(intent) && <Field label={t('目标页面', 'Page', 'ページ')}><Choice label="Page" value={v.target.uiScope?.pageIds[0] ?? ''} options={s.data.pages.map(page => ({ value: page.id, label: page.labels?.[locale] ?? page.key }))} onChange={id => void run(async () => { s.update({ target: { ...v.target, uiScope: { pageIds: [id], componentIds: [] } } }); await s.captureContext(); })}/></Field>}
      {intent === 'ui-assets' && <Field label={t('素材类型', 'Asset type', '素材の種類')}><Choice label="Asset type" value={v.recipe ? 'svg' : 'raster'} options={[{ value: 'svg', label: t('SVG 图形', 'SVG graphic', 'SVG 図形') }, { value: 'raster', label: t('UI 位图', 'UI raster image', 'UI ビットマップ') }]} onChange={selectImageMode}/></Field>}
      {image && <>{field('width', t('宽度', 'Width', '幅'))}{field('height', t('高度', 'Height', '高さ'))}{field('count', t('候选数量', 'Candidates', '候補数'))}</>}
    </div>
    <section className="quick-request-scope" aria-label={t('发送范围', 'Request scope', '送信範囲')}>
      <strong>{t('本次发送', 'This request', '今回の送信')} · {requestCount} {t('次请求', 'requests', '回のリクエスト')}</strong>
      <p>{[...(requestCount === 2 ? [promptConnection?.name ?? t('文字服务待配置', 'Text connection required', 'テキスト接続が必要')] : []), connection?.name ?? t('生成服务待配置', 'Generation connection required', '生成接続が必要')].join(' → ')}</p>
      <p>{v.context.filter(part => part.included).length} {t('块作品上下文', 'project context blocks', '件の作品情報')} · {v.target.replaceStatementIds?.length ?? 0} {t('条选定语句', 'selected statements', '件の選択文')} · {t('费用：服务未提供报价', 'Cost: quote unavailable', '料金：見積もり未提供')}</p>
    </section>
    <Disclosure><span>{t('查看与调整上下文', 'Review project context', '作品情報を確認')}</span>
      <ContextTable parts={v.context} change={context => s.update({ context })} locale={locale}/>
    </Disclosure>
    <Disclosure><span>{t('高级设置', 'Advanced settings', '詳細設定')}</span>
      <div className="form-grid">
        <Field label={t('生成连接', 'Generation connection', '生成接続')}><Choice label="Connection" value={v.connectionId ?? ''} options={[{ value: '', label: t('选择连接', 'Choose connection', '接続を選択') }, ...s.data.connections.filter(connection => operationSupportsConnection(s.operationDefinition, connection, s.purpose)).map(connection => ({ value: connection.id, label: connection.name }))]} onChange={id => { const connection = s.data.connections.find(connection => connection.id === id); s.update({ connectionId: id || null, model: connection?.model ?? null, workflowBindingId: s.matchingWorkflows().find(workflow => workflow.id === connection?.workflowBindingId)?.id ?? null }); }}/></Field>
        <Field label={t('模型', 'Model', 'モデル')}><Input value={v.model ?? ''} onChange={e => s.update({ model: e.target.value })}/></Field>
        {connection?.protocol === 'comfyUI' && <Field label={t('用途工作流', 'Workflow for this use', '用途のワークフロー')}><Choice label="Workflow" value={v.workflowBindingId ?? ''} options={[{ value: '', label: t('选择工作流', 'Choose workflow', 'ワークフローを選択') }, ...s.matchingWorkflows().map(workflow => ({ value: workflow.id, label: workflow.name }))]} onChange={id => s.update({ workflowBindingId: id || null })}/></Field>}
        {requestCount === 2 && <Field label={t('提示准备连接', 'Prompt preparation connection', 'プロンプト作成の接続')}><Choice label="Prompt connection" value={String(v.fields.promptConnectionId ?? '')} options={[{ value: '', label: '—' }, ...s.data.connections.filter(connection => connection.purposes.includes('text')).map(connection => ({ value: connection.id, label: connection.name }))]} onChange={id => { const connection = s.data.connections.find(connection => connection.id === id); s.field('promptConnectionId', id || null); s.field('promptModel', connection?.model ?? null); }}/></Field>}
      </div>
      {image && <Button onClick={() => void run(() => s.rememberImageRoute())}>{t('作为此用途的默认配置', 'Use as default for this purpose', 'この用途の既定にする')}</Button>}
      {image && <Button onClick={() => void run(async () => { await openAssetPicker({ services, projectId: s.projectId, allowedKinds: ['image'], locale, sceneId: v.target.sceneId ?? undefined, characterId: v.target.characterId ?? undefined, purpose: draft.activeUse, remember: false, onApply: async choice => { const media = await s.bridge.production.mediaInput({ assetId: choice.assetId, variantId: choice.variantId ?? undefined }); if (media.ok) { s.field('reference', media.value); s.field('references', [media.value]); } return media; } }); })}>{t('选择参考图', 'Choose reference image', '参照画像を選択')}</Button>}
      {!!(v.fields.references as unknown[])?.length && <p>{t('已附参考图', 'Reference image attached', '参照画像あり')}</p>}
      <Button onClick={advanced}>{t('打开完整制作表单', 'Open full production form', '制作フォーム全体を開く')}</Button>
    </Disclosure>
    <div className="dialog-actions gc-actions">
      <Button onClick={() => void run(async () => { await s.saveDraft(true); close(); })}>{t('保存草稿', 'Save draft', '下書きを保存')}</Button>
      <Button tone="primary" disabled={busy || !v.connectionId || requestCount === 2 && !promptConnection || connection?.protocol === 'comfyUI' && !v.workflowBindingId} onClick={() => void run(async () => {
        if (!String(v.fields.instruction ?? '').trim()) { setError(t('请填写本次创作需求', 'Describe what you want to make', '制作の要望を入力してください')); return; }
        if (draft.activeUse === 'script' && !v.target.sceneId) { setError(t('请选择目标场景', 'Choose a target scene', '対象シーンを選択してください')); return; }
        await s.saveDraft(true);
        s.plan = unwrap(await s.bridge.production.plan({ draftId: draft.id, name: `${t(...quickLabels[intent])} · ${String(v.fields.instruction).split(/\r?\n/)[0]!.slice(0, 28)}` }));
        const task = unwrap(await s.bridge.production.submit(s.plan.planId));
        s.taskId = task.id; draft.submittedTaskId = task.id; s.selected.clear(); generated();
      })}>{t('生成候选', 'Generate candidates', '候補を生成')} · {requestCount} {t('次请求', 'requests', '回')}</Button>
    </div>
  </Modal>;
}
