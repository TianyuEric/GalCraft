import { MessageBox } from '../../components/workbench/MessageBox.js';
import { issueText } from '../../components/issue-text.js';
import { IssueNotice } from '../../components/issue-notice.js';
import { createId, DiagnosticError, type Issue } from '@galcraft/contracts';
import { productionCopy } from './copy.js';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link2, Plus, Trash2, Copy, Layers } from 'lucide-react';
import { SecretInput } from '../../components/secret-input.js';
import { DefaultTimeoutSecByPurpose, type ConnectionConfig, type Purpose, type ImageUsage, type Protocol, type CapabilityReport, type Json } from '@galcraft/contracts';
import { Button, Choice, Field, Modal, Badge } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Disclosure } from '../../components/disclosure.js';
import './workflow.css';
import { unwrap } from './bridge.js';
import type { ProductionSession } from './session.js';
import { PluginFields, fieldDefaults, pluginInputsValid } from '../Plugins/plugin-fields.js';
import { validateFields } from '../../authoring/field-validation.js';
import { ObjectTree } from '../../components/workbench/ObjectTree.js';
import { InspectorSection } from '../../components/workbench/WorkbenchShell.js';

const purposeLabels: Record<Purpose, string> = { text: '剧情与提示准备', image: '图像', difference: '图像差分', speech: '配音', music: '音乐', matting: '去背' };
const providers: { id: string; name: string; protocol: Protocol; url: string; auth: ConnectionConfig['auth']; uses: Purpose[] }[] = [
  { id: 'deepseek', name: 'DeepSeek', protocol: 'chatCompletions', url: 'https://api.deepseek.com', auth: 'bearer', uses: ['text'] },
  { id: 'openai', name: 'OpenAI / 兼容文字服务', protocol: 'chatCompletions', url: '', auth: 'bearer', uses: ['text'] },
  { id: 'anthropic', name: 'Anthropic', protocol: 'anthropic', url: 'https://api.anthropic.com', auth: 'apiKey', uses: ['text'] },
  { id: 'gemini', name: 'Google Gemini', protocol: 'gemini', url: 'https://generativelanguage.googleapis.com', auth: 'apiKey', uses: ['text'] },
  { id: 'ollama', name: 'Ollama（本机）', protocol: 'ollama', url: 'http://127.0.0.1:11434', auth: 'none', uses: ['text'] },
  { id: 'comfyUI', name: 'ComfyUI', protocol: 'comfyUI', url: 'http://127.0.0.1:8188', auth: 'none', uses: ['image'] },
  { id: 'webUI', name: 'Stable Diffusion WebUI', protocol: 'webUI', url: 'http://127.0.0.1:7860', auth: 'none', uses: ['image', 'difference'] },
  { id: 'openAIImage', name: 'OpenAI / 兼容图像服务', protocol: 'openAIImage', url: '', auth: 'bearer', uses: ['image', 'difference'] },
  { id: 'novelAIText', name: 'NovelAI 文字', protocol: 'novelAIText', url: '', auth: 'bearer', uses: ['text'] },
  { id: 'novelAIImage', name: 'NovelAI 图像', protocol: 'novelAIImage', url: '', auth: 'bearer', uses: ['image', 'difference'] },
  { id: 'openAISpeech', name: 'OpenAI / 兼容配音服务', protocol: 'openAISpeech', url: '', auth: 'bearer', uses: ['speech'] },
  { id: 'voiceStudio', name: 'VoiceStudio', protocol: 'voiceStudio', url: 'http://127.0.0.1:3900', auth: 'none', uses: ['speech'] },
  { id: 'gptSoVits', name: 'GPT-SoVITS（本机）', protocol: 'gptSoVits', url: 'http://127.0.0.1:9880', auth: 'none', uses: ['speech'] },
  { id: 'miniMaxSpeech', name: 'MiniMax 配音', protocol: 'miniMaxSpeech', url: '', auth: 'bearer', uses: ['speech'] },
  { id: 'miniMaxMusic', name: 'MiniMax 音乐', protocol: 'miniMaxMusic', url: '', auth: 'bearer', uses: ['music'] },
  { id: 'elevenLabs', name: 'ElevenLabs', protocol: 'elevenLabs', url: 'https://api.elevenlabs.io', auth: 'apiKey', uses: ['speech'] },
];
const preset = (id: string, locale: string, existing: unknown = []): ConnectionConfig => {
  const p = providers.find(p => p.id === id)!;
  return { id: createId(existing), revision: 0, name: productionCopy(locale,p.name), protocol: p.protocol, baseUrl: p.url,
    auth: p.auth, credentialId: null, apiKeyHeader: null, model: '', purposes: [...p.uses],
    timeoutSecByPurpose: { ...DefaultTimeoutSecByPurpose }, concurrency: 1,
    parameters: p.id === 'deepseek' ? { request: { thinking: { type: 'disabled' } }, stream: true } : {},
    workflowBindingId: null, serverFileRoot: null };
};

export function ServiceConnections({ session: s, locale="zh-CN", editWorkflow, importWorkflow, search = '', active = true, explorerContainer, inspectorContainer, workflowEditor, workflowActive = !!workflowEditor, selectedWorkflow = '', showConnection }: { importWorkflow?(): Promise<void>; search?: string; session: ProductionSession; locale?: string; editWorkflow(id?: string): void; active?: boolean; explorerContainer?: HTMLElement; inspectorContainer?: HTMLElement; workflowEditor?: ReactNode; workflowActive?: boolean; selectedWorkflow?: string; showConnection?(): void }) {
  const t=(text:string)=>productionCopy(locale,text);
  const local = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const purposes=Object.fromEntries(Object.entries(purposeLabels).map(([key,label])=>[key,t(label)])) as Record<Purpose,string>;
  const [edit, setEdit] = useState<ConnectionConfig | null>(s.connectionGuiDraft?.edit??null), [provider, setProvider] = useState(s.connectionGuiDraft?.provider??'openai');
  const [secret, setSecret] = useState(s.connectionGuiDraft?.secret??''), [advanced, setAdvanced] = useState<string | null>(s.connectionGuiDraft?.advanced??null);
  const [remove, setRemove] = useState<ConnectionConfig | null>(null), [report, setReport] = useState<CapabilityReport | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [diagnostic, setDiagnostic] = useState<Issue | null>(null);
  const [baseline, setBaseline] = useState(s.connectionGuiDraft?.baseline??''), [discard, setDiscard] = useState(false);
  const [checkPurpose, setCheckPurpose] = useState<Purpose | null>(null), [checkImageUsage, setCheckImageUsage] = useState<ImageUsage>('background');
  const [selection, setSelection] = useState<string[]>(s.connectionGuiDraft?.selection??[]);
  const purposeLabel = (purpose: Purpose) => purposes[purpose] ?? s.data.operations?.find(item => item.definition.purpose === purpose)?.definition.title ?? purpose;
  const pluginProviders = s.data.providers ?? [], pluginProvider = pluginProviders.find(item => item.key === edit?.providerKey);
  const listedConnections = edit && !s.data.connections.some(connection => connection.id === edit.id) ? [...s.data.connections, edit] : s.data.connections;
  const dirty = !!edit && (JSON.stringify(edit) !== baseline || secret !== '' || advanced !== null && advanced !== JSON.stringify(edit.parameters, null, 2));
  useEffect(()=>{s.connectionGuiDraft={edit,provider,secret,advanced,baseline,selection};if(s.connectionDirty!==dirty){s.connectionDirty=dirty;s.changed();}},[s,edit,provider,secret,advanced,baseline,selection,dirty]);
  const closeEditor = async () => { setEdit(null); setDiscard(false); };
  const requestClose = () => { if (!busy) { if (dirty) setDiscard(true); else void closeEditor(); } };
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); setDiagnostic(null); try { await action(); await s.refresh(); } catch (e) { if (e instanceof DiagnosticError) setDiagnostic(e.issue); else setError(String(e).replace(/^Error: /, '')); } finally { setBusy(false); } };
  const openWorkflow = (id?: string) => { setError(''); editWorkflow(id); };
  const open = (c: ConnectionConfig) => { if (edit?.id === c.id) { showConnection?.(); return; } if (dirty) { setError(local('当前配置有未保存修改，请先保存或取消编辑。', 'Save or cancel the current edits before switching connections.', '変更を保存するかキャンセルしてから接続を切り替えてください。')); return; } showConnection?.(); setSelection([c.id]); setEdit(structuredClone(c)); setBaseline(JSON.stringify(c)); setDiscard(false); setProvider(c.protocol === 'plugin' ? c.providerKey ?? '' : c.baseUrl.includes('api.deepseek.com') ? 'deepseek' : providers.find(p => p.protocol === c.protocol && p.id !== 'deepseek')?.id ?? 'openai'); setSecret(''); setAdvanced(null); setError(''); setReport(null); };
  const patch = (p: Partial<ConnectionConfig>) => { setEdit(c => c ? { ...c, ...p } : c); setReport(null); };
  const parameter = (key: string, value: Json) => edit && patch({ parameters: { ...edit.parameters, [key]: value } });
  const request = edit?.parameters.request as Record<string, Json> ?? {};
  const requestParameter = (key: string, value: Json) => parameter('request', { ...request, [key]: value });
  const selectedPurpose = edit?.purposes.includes(checkPurpose!) ? checkPurpose! : edit?.purposes[0];
  const save = async (checkOnly = false) => {
    if (!edit) return null;
    if (!pluginInputsValid(document.querySelector('.service-connection-sheet'))) throw new Error(local('请修正标出的字段。', 'Correct the highlighted fields.', '表示されたフィールドを修正してください。'));
    if (!edit.name.trim()) throw new Error(t("请填写连接名称"));
    if (edit.protocol !== 'plugin' || edit.baseUrl) { const url = new URL(edit.baseUrl); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(t("服务地址需使用 http 或 https")); }
    if (!edit.purposes.length) throw new Error(t("请至少选择一个用途"));
    if (!checkOnly && !['plugin', 'comfyUI', 'webUI', 'gptSoVits'].includes(edit.protocol) && !edit.model.trim()) throw new Error(t("请填写模型名称；可先检查服务获取模型列表"));
    const parameters = advanced === null ? edit.parameters : JSON.parse(advanced);
    if (!parameters || Array.isArray(parameters) || typeof parameters !== 'object') throw new Error(t("高级参数应为 JSON 对象"));
    if (pluginProvider) { const invalid = validateFields(pluginProvider.configFields, parameters, field => field.label, locale); if (invalid.length) throw new Error(invalid.map(item => item.message).join(' · ')); }
    const updated = { ...edit, revision: edit.revision + 1, parameters };
    unwrap(await s.bridge.connections.save(updated, secret || undefined)); setEdit(updated); setBaseline(JSON.stringify(updated)); setSecret(''); setAdvanced(null); s.data.connections = [...s.data.connections.filter(connection => connection.id !== updated.id), updated]; return updated;
  };
  const defaults = s.data.defaults ?? { connections: {}, recipes: {} };
  const inspector = <aside className="production-section-inspector" hidden={!active}>

    <InspectorSection title={workflowActive ? t('ComfyUI 工作流') : edit?.name || local('连接与工具', 'Connections & tools', '接続とツール')}>
      {workflowActive ? <p>{t('把 API 工作流中的输入与输出映射为制作字段，可供多个连接复用。')}</p> : edit ? <><p role="status">{dirty ? local('配置未保存', 'Configuration unsaved', '設定未保存') : s.data.connections.some(c => c.id === edit.id) ? local('配置已保存', 'Configuration saved', '設定保存済み') : local('尚未保存的新连接', 'New connection · not saved', '新規接続・未保存')}</p><div className="service-badges">{edit.purposes.map(p => <Badge key={p}>{purposeLabel(p)}</Badge>)}</div><p>{report ? report.status === 'unavailable' ? t('连接检查未通过') : t('服务已响应') : local('尚未检查当前配置。', 'This configuration has not been checked.', '現在の設定は未確認です。')}</p>{s.data.connections.some(c => c.id === edit.id) && <div className="gc-actions"><Button tone="quiet" disabled={busy || dirty} onClick={() => open({ ...edit, id: createId(s.data), revision: 0, name: `${edit.name} ${t('副本')}` })}><Copy size={15}/>{t('复制')}</Button><Button disabled={busy || dirty} onClick={() => { setRemove(edit); setError(''); }}><Trash2 size={15}/>{t('删除连接')}</Button></div>}</> : <p>{local('选择连接编辑配置，或打开 ComfyUI 工作流。', 'Choose a connection to configure it, or open a ComfyUI workflow.', '接続設定または ComfyUI ワークフローを選択してください。')}</p>}
    </InspectorSection>
    <InspectorSection title={local('用途默认服务', 'Default services by purpose', '用途ごとの既定サービス')}>
      <div className="service-defaults">{(['text', 'speech', 'music'] as const).map(p => <Field key={p} label={`${purposeLabel(p)}${t('默认服务')}`}><Choice label={`${purposeLabel(p)}${t('默认服务')}`} value={defaults.connections[p] ?? ''} options={[{ value: '', label: t('每次选择') }, ...s.data.connections.filter(c => c.purposes.includes(p)).map(c => ({ value: c.id, label: c.name }))]} onChange={id => void run(async () => { const connections = { ...defaults.connections }; if (id) connections[p] = id; else delete connections[p]; unwrap(await s.bridge.production.saveDefaults({ ...defaults, connections })); })}/></Field>)}</div>
      <p>{t('背景、立绘等图像用途在制作表单中分别选择连接和工作流，保存为该用途的默认配置。')}</p>
    </InspectorSection>
  </aside>;
  const explorer = <aside className="connection-workspace-list" hidden={!active}>
    <header className="service-manager-heading"><div><h2>{t("服务连接")}</h2><p>{t("连接个人使用的模型与制作工具，再为不同用途选择默认服务。")}</p></div><Button tone="primary" onClick={() => open(preset('openai',locale,s.data))}><Plus size={16}/>{t("添加服务")}</Button></header>
    {error && (!edit || workflowActive) && !remove && <p role="alert" className="workbench-error">{error}</p>}
    <ObjectTree label={local('服务与工作流', 'Services and workflows', 'サービスとワークフロー')} selected={workflowActive && selectedWorkflow ? [s.data.workflows.some(workflow => workflow.id === selectedWorkflow) ? selectedWorkflow : `workflow-draft:${selectedWorkflow}`] : selection} onSelect={() => {}} onOpen={id => { const connection = listedConnections.find(c => c.id === id); if (connection) open(connection); else if (s.data.workflows.some(w => w.id === id) || s.data.workflowDrafts?.some(w => `workflow-draft:${w.id}` === id)) openWorkflow(id); }} nodes={[
      { id: 'production-connections', name: t('服务连接'), icon: <Link2 size={15}/>, children: listedConnections.filter(c => c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(c => ({ id: c.id, name: c.name, icon: <Link2 size={15}/> })) },
      { id: 'production-workflow-drafts', name: local('配置草稿（跨作品）', 'Configuration drafts (all projects)', '設定下書き（全作品）'), icon: <Layers size={15}/>, children: (s.data.workflowDrafts ?? []).filter(w => w.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(w => ({ id: `workflow-draft:${w.id}`, name: `${w.name || t('未命名工作流')} · ${local('草稿', 'Draft', '下書き')}`, icon: <Layers size={15}/> })) },
      { id: 'production-workflows', name: t('ComfyUI 工作流'), icon: <Layers size={15}/>, children: s.data.workflows.filter(w => w.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(w => ({ id: w.id, name: w.name || t('未命名工作流'), icon: <Layers size={15}/> })) },
    ]}/>
    {!listedConnections.length && <div className="service-empty"><Link2 size={32}/><h3>{t("添加第一个制作服务")}</h3><p>{t("选择 DeepSeek、ComfyUI 或其他服务，按提示完成配置。")}</p></div>}
    <div className="gc-actions"><Button onClick={() => openWorkflow()}><Plus size={15}/>{t('添加工作流')}</Button>{importWorkflow && <Button disabled={busy} onClick={() => void run(importWorkflow)}>{local('导入工作流（新文档）', 'Import workflow (new document)', 'ワークフローを新規文書に読込')}</Button>}</div>
    {!inspectorContainer && inspector}
    </aside>;
  return <section className="service-manager persistent-service-manager" data-explorer-external={!!explorerContainer}>
    {explorerContainer ? createPortal(explorer, explorerContainer) : explorer}
    {inspectorContainer && createPortal(inspector, inspectorContainer)}
    {workflowEditor}
    {edit && <section className="service-connection-sheet connection-workspace-editor" hidden={workflowActive}><header><h2>{edit.name || t("配置服务")}</h2><span role="status">{dirty ? local("配置未保存", "Configuration unsaved", "設定未保存") : s.data.connections.some(c => c.id === edit.id) ? local("配置已保存", "Configuration saved", "設定保存済み") : local('尚未保存的新连接', 'New connection · not saved', '新規接続・未保存')}</span></header>
      {error && <p role="alert" className="workbench-error">{error}</p>}
      {diagnostic && <IssueNotice issue={diagnostic} locale={locale}/>}
      <fieldset disabled={busy} className="workflow-edit-fields"><section className="connection-section"><h3>{local("基本信息", "Basic information", "基本情報")}</h3>
      {!s.data.connections.some(c => c.id === edit.id) && <Field label={t("服务类型")}><Choice label={t("服务类型")} value={provider} options={[...providers.map(p => ({ value: p.id, label: t(p.name) })), ...pluginProviders.map(p => ({ value: p.key, label: `${local('插件服务', 'Plugin service', 'プラグインサービス')} · ${p.key.split('/').at(-1)}` }))]} onChange={id => { setProvider(id); const plugin = pluginProviders.find(item => item.key === id); setEdit(plugin ? { ...preset('openai',locale,s.data), id: edit.id, name: plugin.key.split('/').at(-1)!, protocol: 'plugin', providerKey: plugin.key, purposes: [...plugin.purposes], parameters: fieldDefaults(plugin.configFields) } : { ...preset(id,locale,s.data), id: edit.id }); setAdvanced(null); setReport(null); }}/></Field>}
      {edit.protocol === 'plugin' && !pluginProvider && <p role="alert" className="workbench-error">{local('此连接的插件提供者不可用，配置与历史任务已保留。请安装并启用对应插件。', 'This provider is unavailable. Its connection and historical tasks are preserved. Install and enable the provider plugin.', '提供元を利用できません。接続と履歴タスクは保持されています。プラグインをインストールして有効にしてください。')}</p>}
      <div className="form-grid"><Field label={t("连接名称")} required><Input value={edit.name} onChange={e => patch({ name: e.target.value })}/></Field><Field label={t("服务地址")} required={edit.protocol !== 'plugin'}><Input value={edit.baseUrl} placeholder={t("https://… 或 http://127.0.0.1:8188")} onChange={e => patch({ baseUrl: e.target.value })}/></Field>
      <Field label={t("认证方式")}><Choice label={t("认证方式")} value={edit.auth} options={[{ value: 'none', label: t("无需认证（本机服务）") }, { value: 'bearer', label: t("Bearer API 密钥") }, { value: 'apiKey', label: t("API Key 请求头") }, { value: 'basic', label: t("Basic（Base64 凭据）") }]} onChange={auth => patch({ auth: auth as ConnectionConfig['auth'] })}/></Field>
      {edit.auth !== 'none' && <Field label={edit.credentialId ? t("密钥（留空保留已有凭据）") : t("密钥")}><SecretInput resetKey={`${edit.id}:${edit.revision}`} locale={locale} value={secret} onChange={e => setSecret(e.target.value)}/></Field>}
      {edit.auth === 'apiKey' && <Field label={t("API Key 请求头（留空使用服务默认值）")}><Input value={edit.apiKeyHeader ?? ''} onChange={e => patch({ apiKeyHeader: e.target.value || null })}/></Field>}
      </div></section>
      <section className="connection-section"><h3>{local("模型与用途", "Model and uses", "モデルと用途")}</h3><div className="form-grid">
      {!['plugin', 'comfyUI', 'webUI', 'gptSoVits'].includes(edit.protocol) && <Field label={t("模型名称")} required><Input value={edit.model} placeholder={t("填写服务实际提供的模型标识")} onChange={e => patch({ model: e.target.value })}/></Field>}
      {['comfyUI', 'gptSoVits'].includes(edit.protocol) && <Field label={local('GalCraft 可写的共享目录（高级）', 'GalCraft writable shared directory (advanced)', 'GalCraft 書込先の共有フォルダー（詳細）')} help={local('HTTP 文件上传无需填写。共享目录需已真实互通；宿主把参考文件复制到这里。', 'Not needed for HTTP upload. This existing shared directory receives reference files from the host.', 'HTTP 転送では不要です。既存の共有フォルダーに参照ファイルを書き込みます。')}><Input value={edit.serverFileRoot ?? ''} onChange={e => patch({ serverFileRoot: e.target.value || null })}/></Field>}
      {edit.protocol === 'comfyUI' && <Field label={local('ComfyUI 可读的对应路径前缀', 'Corresponding ComfyUI read prefix', 'ComfyUI 側の対応パス')} help={local('例如本机 D:\\shared 对应容器 /input；留空沿用本机目录。此设置不建立挂载。', 'For example D:\\shared on the host corresponds to /input in a container. Blank uses the writable directory; configure mounts separately.', '例：ホスト D:\\shared とコンテナ /input。空欄は書込先を使用します。マウントは別途必要です。')}><Input value={edit.serverReadRoot ?? ''} onChange={e => patch({ serverReadRoot: e.target.value || null })}/></Field>}
      {edit.protocol === 'comfyUI' && <Field label={t("默认工作流")}><Choice label={t("默认工作流")} value={edit.workflowBindingId ?? ''} options={[{ value: '', label: t("在制作时选择") }, ...s.data.workflows.map(w => ({ value: w.id, label: w.name }))]} onChange={id => patch({ workflowBindingId: id || null })}/></Field>}
      {edit.protocol === 'comfyUI' && <>
        <Field label={local('ComfyUI 实例归属', 'ComfyUI instance ownership', 'ComfyUI インスタンスの所有区分')}><Choice label={local('实例归属', 'Instance ownership', 'インスタンスの所有区分')} value={edit.comfyResources?.ownership ?? 'shared'} options={[{ value: 'shared', label: local('共享实例', 'Shared instance', '共有インスタンス') }, { value: 'exclusive', label: local('Studio 独占实例', 'Studio exclusive instance', 'Studio 専用インスタンス') }]} onChange={ownership => patch({ comfyResources: ownership === 'shared' ? { ownership: 'shared', release: 'manual' } : { ownership: 'exclusive', release: 'onSwitch' } })}/></Field>
        <Field label={local('资源释放策略', 'Resource release policy', 'リソース解放方針')}><Choice label={local('资源释放策略', 'Resource release policy', 'リソース解放方針')} value={edit.comfyResources?.release ?? 'manual'} disabled={(edit.comfyResources?.ownership ?? 'shared') === 'shared'} options={[{ value: 'onSwitch', label: local('切换类型或模型族时释放', 'Release when type or model family changes', '種類またはモデル系統の切り替え時') }, { value: 'afterTask', label: local('每任务后释放（省内存）', 'Release after each task (lower memory)', '各タスク完了後（省メモリー）') }, { value: 'manual', label: local('手动释放', 'Manual release', '手動解放') }]} onChange={release => patch({ comfyResources: { ownership: edit.comfyResources?.ownership ?? 'shared', release: release as 'onSwitch' | 'afterTask' | 'manual' } })}/></Field>
        <p className="field-help">{local('策略作用于此地址的整个实例，指向同实例的连接需保持一致。共享实例仅手动释放；每任务后释放会增加下次模型加载时间。释放前等待整个队列空闲，并核实服务报告的资源变化。', 'The policy applies to the entire instance at this URL; connections to the same instance must agree. Shared instances use manual release. Releasing after each task increases model reload time. Release waits for the entire queue to become idle and checks reported resource changes.', '方針はこの URL のインスタンス全体に作用し、同じインスタンスの接続で統一します。共有は手動解放のみです。タスクごとの解放は再読み込み時間を増やします。キュー全体の空きを待ち、報告されたリソース変化を確認します。')}</p>
      </>}
      </div>
      {edit.protocol === 'webUI' && <div className="form-grid"><Field label={t("采样器名称")}><Input value={String(request.sampler_name ?? '')} placeholder={t("服务默认")} onChange={e => requestParameter('sampler_name', e.target.value)}/></Field><Field label={t("采样步数")}><Input type="number" min={1} value={Number(request.steps ?? 20)} onChange={e => requestParameter('steps', Math.max(1, Number(e.target.value)))}/></Field><Field label={t("提示词引导强度 CFG")}><Input type="number" min={0} step={0.5} value={Number(request.cfg_scale ?? 7)} onChange={e => requestParameter('cfg_scale', Number(e.target.value))}/></Field></div>}
      {edit.protocol === 'openAIImage' && <div className="form-grid"><Field label={t("生成质量")}><Choice label={t("生成质量")} value={String(request.quality ?? 'auto')} options={['auto','low','medium','high'].map(value => ({value,label:value === 'auto' ? t("自动") : value}))} onChange={value => requestParameter('quality', value)}/></Field><Field label={t("背景")}><Choice label={t("图像背景")} value={String(request.background ?? 'auto')} options={[{value:'auto',label:t("自动")},{value:'transparent',label:t("透明（模型支持时）")},{value:'opaque',label:t("不透明")}]} onChange={value => requestParameter('background', value)}/></Field></div>}
      {edit.protocol === 'openAISpeech' && <Field label={t("配音输出格式")}><Choice label={t("输出格式")} value={String(request.response_format ?? 'wav')} options={['wav','mp3','opus','flac'].map(value => ({value,label:value.toUpperCase()}))} onChange={value => requestParameter('response_format', value)}/></Field>}
      <fieldset className="connection-purposes"><legend>{t("用于")}</legend>{(edit.protocol === 'plugin' ? pluginProvider?.purposes ?? edit.purposes : edit.protocol === 'comfyUI' ? Object.keys(purposes).filter(p => p !== 'text') as Purpose[] : providers.find(p => p.protocol === edit.protocol)!.uses).map(p => <label className="check-row" key={p}><input type="checkbox" checked={edit.purposes.includes(p)} onChange={e => patch({ purposes: e.target.checked ? [...edit.purposes, p] : edit.purposes.filter(v => v !== p) })}/>{purposeLabel(p)}</label>)}</fieldset>
      {pluginProvider && <section className="connection-section"><PluginFields fields={pluginProvider.configFields} value={edit.parameters} change={parameters => patch({ parameters })} locale={locale}/><p className="field-help">{local('远端查询', 'Remote query', 'リモート照会')} · {String(pluginProvider.capabilities.query)} · {local('产物重取', 'Refetch outputs', '出力の再取得')} · {String(pluginProvider.capabilities.refetch)} · {local('逐任务取消', 'Per-task cancel', 'タスク単位キャンセル')} · {String(pluginProvider.capabilities.cancelPerTask)} · {local('续接', 'Resume', '再開')} · {String(pluginProvider.capabilities.resume)}</p><details><summary>{local('提供者与实际版本', 'Provider and active version', '提供元と有効バージョン')}</summary><code>{pluginProvider.key} @ {pluginProvider.packageVersion}</code></details></section>}
      {edit.purposes.includes('text') && <div className="form-grid"><label className="check-row"><input type="checkbox" checked={edit.parameters.stream === true} onChange={e => parameter('stream', e.target.checked)}/>{t("流式接收回答")}</label><label className="check-row"><input type="checkbox" checked={edit.parameters.textVision === true} onChange={e => parameter('textVision', e.target.checked)}/>{t("模型支持图像输入")}</label>{edit.protocol === 'chatCompletions' && <Field label={t("思考模式（服务支持时生效）")}><Choice label={t("思考模式")} value={String((edit.parameters.request as { thinking?: { type?: string } } | undefined)?.thinking?.type ?? '')} options={[{ value: '', label: t("服务默认") }, { value: 'disabled', label: t("关闭（DeepSeek）") }, { value: 'enabled', label: t("开启（DeepSeek）") }]} onChange={value => { const request = { ...(edit.parameters.request as Record<string, Json> ?? {}) }; if (value) request.thinking = { type: value }; else delete request.thinking; parameter('request', request); }}/></Field>}</div>}
      <p className="field-help">{edit.protocol === 'comfyUI' ? t("工作流的模型、采样器和节点参数来自导入的 API 工作流；在工作流编辑器中配置输入、输出和用途。") : edit.purposes.includes('speech') ? t("音色、语言、语速与参考音频按每次配音任务填写；服务连接保存通用认证与模型。") : edit.purposes.includes('image') ? t("尺寸、数量和参考图在制作表单中填写；服务特有的质量、采样器等参数可在高级设置中补充。") : t("输出长度、采样温度和本轮要求在制作任务中设置。")} </p>
      </section>
      <section className="connection-section"><h3>{local("高级设置", "Advanced settings", "詳細設定")}</h3>
      <div className="form-grid"><Field label={local('检查用途', 'Inspection purpose', '確認する用途')}><Choice label={local('检查用途', 'Inspection purpose', '確認する用途')} value={selectedPurpose ?? ''} options={edit.purposes.map(value => ({ value, label: purposeLabel(value) }))} onChange={value => { setCheckPurpose(value as Purpose); setReport(null); }}/></Field>{selectedPurpose === 'image' && <Field label={local('检查图像用途', 'Inspection image use', '確認する画像用途')}><Choice label={local('检查图像用途', 'Inspection image use', '確認する画像用途')} value={checkImageUsage} options={(['background', 'figure', 'cg', 'ui'] as const).map(value => ({ value, label: t(({ background: '背景', figure: '立绘', cg: 'CG', ui: 'UI 素材' })[value]) }))} onChange={value => { setCheckImageUsage(value as ImageUsage); setReport(null); }}/></Field>}</div>
      <Disclosure><span>{t("高级设置 · 超时、并行请求与服务参数")}</span><div className="form-grid"><Field label={t("同时执行的请求数")}><Input type="number" min={1} value={edit.concurrency} onChange={e => patch({ concurrency: Math.max(1, Number(e.target.value)) })}/></Field>{edit.purposes.map(p => <Field key={p} label={`${purposeLabel(p)}${t('超时（秒）')}`}><Input type="number" min={1} value={edit.timeoutSecByPurpose[p] ?? 600} onChange={e => patch({ timeoutSecByPurpose: { ...edit.timeoutSecByPurpose, [p]: Math.max(1, Number(e.target.value)) } })}/></Field>)}</div><Field label={t("高级参数 JSON（request 对象写服务请求参数）")}><Textarea rows={7} value={advanced ?? JSON.stringify(edit.parameters, null, 2)} onChange={e => setAdvanced(e.target.value)}/></Field></Disclosure>
      {report && <section className="connection-inspection"><h3>{report.status === 'unavailable' ? t("连接检查未通过") : t("服务已响应")}</h3>{report.issues.length ? report.issues.map((issue, index) => <IssueNotice key={index} issue={issue} locale={locale}/>) : <p>{t("可选择下方模型。检查只读取服务信息，不发送生成请求；真实生成会在任务中单独确认。")}</p>}<div className="gc-actions">{report.models?.map(model => <Button key={model} onClick={() => patch({ model })}>{model}</Button>)}</div></section>}
      </section>
      </fieldset>
      <div className="dialog-actions"><Button disabled={busy} onClick={requestClose}>{t("取消")}</Button><Button disabled={busy || !selectedPurpose} onClick={() => void run(async () => { const config = await save(true); if (!config || !selectedPurpose) return; setReport(unwrap(await s.bridge.connections.test({ connectionId: config.id, model: config.model, purpose: selectedPurpose, imageUsage: selectedPurpose === 'image' ? checkImageUsage : null, workflowBindingId: config.protocol === 'comfyUI' ? config.workflowBindingId : null }))); })}>{t("保存并检查连接")}</Button><Button tone="primary" disabled={busy} onClick={() => void run(async () => { await save(); })}>{t("保存连接")}</Button></div>
    </section>}
    {!edit && !workflowActive && <section className="connection-workspace-editor connection-workspace-empty"><h2>{local("选择连接或本地工具", "Select a connection or local tool", "接続またはローカルツールを選択")}</h2><p>{local("连接配置与检查结果会保持在工作区。", "Connection configuration and inspection stay in this workspace.", "接続設定と確認結果をこのワークスペースに保持します。")}</p></section>}
    {discard && <MessageBox title={local('保存服务连接修改？', 'Save connection changes?', '接続の変更を保存しますか？')} description={local('连接设置尚未保存。继续编辑，或选择保存后关闭。', 'Connection settings have not been saved. Continue editing or save before closing.', '接続の変更は未保存です。編集を続けるか、保存して閉じてください。')} cancelLabel={local('继续编辑', 'Keep editing', '編集を続ける')} onClose={() => setDiscard(false)} actions={[
      { label: local('放弃修改', 'Discard changes', '変更を破棄'), tone: 'danger', run: closeEditor },
      { label: local('保存并关闭', 'Save & close', '保存して閉じる'), tone: 'primary', run: async () => { await save(); await s.refresh(); await closeEditor(); } },
    ]}/>}
    {remove && <MessageBox title={`${t('删除')} “${remove.name}”`} description={<>{t('删除后，使用此连接的未提交草稿需要重新选择服务。历史任务、已生成候选与可复用工作流会保留。')}<br/>{t('默认用途：')}{Object.entries(defaults.connections).filter(([, id]) => id === remove.id).map(([p]) => purposeLabel(p as Purpose)).join('、') || t('无')}</>} cancelLabel={t('取消')} onClose={() => setRemove(null)} actions={[{ label: t('删除连接'), tone: 'danger', run: async () => { unwrap(await s.bridge.production.removeConnection(remove.id)); if (edit?.id === remove.id) { setEdit(null); setReport(null); } setSelection(ids => ids.filter(id => id !== remove.id)); await s.refresh(); } }]}/>}  </section>;
}
