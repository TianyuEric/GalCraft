import { productionCopy } from './copy.js';
import { useState } from 'react';
import { MessageSquare, Send, GitBranch } from 'lucide-react';
import type { Task, TaskPlan, GenerationInput, Candidate } from '@galcraft/authoring/production';
import { Button, Choice, Field } from '../../components/controls.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Disclosure } from '../../components/disclosure.js';
import { CodeBlock } from '../../components/code-block.js';
import type { ContinuationView, ProductionSession } from './session.js';
import { unwrap } from './bridge.js';
import { inputTextSummary } from '@galcraft/authoring/production/preview';

export function CandidateUsage({ candidate, locale="zh-CN" }: { candidate: Candidate; locale?: string }) {
  const t=(text:string)=>productionCopy(locale,text);
  const raw = candidate.provenance.usage;
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {};
  const valueOf = (...values: unknown[]) => values.find(v => typeof v === 'number' && Number.isFinite(v)) as number | undefined;
  const input = valueOf(value.prompt_tokens, value.input_tokens, value.promptTokenCount);
  const output = valueOf(value.completion_tokens, value.output_tokens, value.candidatesTokenCount);
  const hit = valueOf(value.prompt_cache_hit_tokens, value.cache_read_input_tokens, value.prompt_tokens_details?.cached_tokens);
  return <p className="candidate-usage">{t("输入 ")}{input ?? t("未提供")}{input!==undefined?' token':''}{t(" · 输出 ")}{output ?? t("未提供")}{output!==undefined?' token':''}{t(" · 缓存命中 ")}{hit ?? t("服务未提供")}{hit!==undefined?' token':''}{hit !== undefined && input ? `（${Math.round(hit / input * 100)}%）` : ''}</p>;
}

export function ConversationPanel({ session: s, task, view, locale="zh-CN" }: { session: ProductionSession; task: Task; view: ContinuationView; locale?: string }) {
  const t=(text:string)=>productionCopy(locale,text);
  const tr=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
  const candidates = s.data.candidates.map(r => r.candidate).filter(c => c.taskId === task.id && !c.partial && task.items.some(i => i.id === c.itemId && i.target.usage === 'script' && i.purpose === 'text'));
  const { sourceId, mode, instruction, summary } = view;
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [prepared, setPrepared] = useState<{ plan: TaskPlan & { continuationTaskId: string }; view: ContinuationView; sourceId: string; sourceText: string | null } | null>(null);
  const source = candidates.find(c => c.id === sourceId) ?? candidates.at(-1), item = task.items.find(i => i.id === source?.itemId);
  const input = item?.input as GenerationInput | undefined;
  const plan = prepared?.view === view && prepared.sourceId === source?.id && prepared.sourceText === source?.editedText && prepared.plan.expected.every(expected => s.data.versions.some(current => current.ref.kind === expected.ref.kind && current.ref.id === expected.ref.id && current.revision === expected.revision)) ? prepared.plan : null;
  const update = (patch: Partial<ContinuationView>) => { s.updateContinuation(task.id, patch); setPrepared(null); };
  const hasActive = task.items.some(i => ['queued', 'blocked', 'running', 'submitting', 'fetching'].includes(i.state));
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); await s.refresh(); } catch (e) { setError(String(e).replace(/^Error: /, '')); } finally { setBusy(false); } };
  if (!candidates.length) return null;
  return <section className="conversation-panel">
    <header><div><MessageSquare size={18}/><h3>{t("继续创作")}</h3></div><small>{t("沿用资料与历史回答，每轮保留为新候选")}</small></header>
    <p className="production-cache-help">{tr('写剧情、补演出和讨论情节支持多轮。保持系统规则与历史不变、在末尾追加新要求有机会复用缓存；实际命中以服务回执为准。','Writing, staging and discussion support multiple rounds. Keeping system rules and history unchanged and appending requests can reuse a cached prefix; actual hits come from the service receipt.','執筆・演出・相談は複数ラウンドに対応します。システムルールと履歴を保持して要望を末尾に追加するとキャッシュを再利用できる場合があります。実際のヒットはサービスの応答で確認します。')}</p>
    {input?.purpose==='text'&&<p>{tr('已有规则与消息','Existing rules and messages','既存のルールとメッセージ')}: {inputTextSummary(input).textCharacters.toLocaleString(locale)} {tr('字符；本轮合计在发送计划中显示。','characters; this round’s total appears in the send plan.','文字。今回の合計は送信計画に表示します。')}</p>}
    {((mode==='discuss')!==((item?.conversation?.mode??item?.creationMode)==='discuss')||summary.trim())&&<p className="production-cache-help">{tr('本轮将切换系统规则或整理历史，可复用的前缀会变化。','This round switches system rules or summarizes history, changing the reusable prefix.','システムルールの切替または履歴の要約により、再利用できる接頭部分が変わります。')}</p>}
    <div className="conversation-controls"><Field label={t("从哪个版本继续")}><Choice label={t("继续创作的版本")} value={source?.id ?? ''} options={candidates.map((c, i) => ({ value: c.id, label: `${t('版本')} ${i + 1}${c.adoption.length ? t(" · 已采用") : ''}${(task.items.find(t => t.id === c.itemId)?.conversation?.mode ?? task.items.find(t => t.id === c.itemId)?.creationMode) === 'discuss' ? t(" · 讨论") : ''}` }))} onChange={sourceId => update({ sourceId })}/></Field>
    <Field label={t("本轮模式")}><Choice label={t("本轮模式")} value={mode} options={[{ value: 'write', label: t("写剧情 · 新写、续写与改写") }, { value: 'performance', label: t("补演出 · 锁定台词和分支") }, { value: 'discuss', label: t("讨论情节 · 只讨论，不采用") }]} onChange={mode => update({ mode: mode as ContinuationView['mode'] })}/></Field></div>
    <p className="field-help">{mode === 'performance' ? t("在选定剧本上配置背景、立绘、表情、声音和过渡。台词、说话者、语句身份与分支由程序检查。") : mode === 'discuss' ? t("先讨论走向、人物动机或演出建议。讨论结果可以继续用于下一轮写剧情。") : t("例如：保留前两段，只把最后两句改得更含蓄。结果可与此前版本比较后采用。")}</p>
    <Textarea aria-label={t("本轮创作要求")} value={instruction} rows={3} onChange={e => update({ instruction: e.target.value })} placeholder={t("描述这次想保留什么、修改什么…")}/>
    <Disclosure><span>{t("会话资料与整理")}</span><p>{t("当前沿用 ")}{input?.purpose === 'text' ? input.messages.length : 0}{t(" 条消息。整理时保留初始资料和选定回答，以确认的摘要替换中间轮次；旧轮次仍保存在任务中。")}</p><Field label={t("作者确认的会话摘要（可选）")}><Textarea value={summary} onChange={e => update({ summary: e.target.value })} rows={3} placeholder={t("写下已确定的事实、人物决定和未解决事项；留空沿用完整消息。")}/></Field>{input?.purpose === 'text' && <CodeBlock code={JSON.stringify({ system: input.system, messages: input.messages }, null, 2)} language="json" locale={locale}/>}</Disclosure>
    {error && <p role="alert">{error}</p>}
    <div className="conversation-actions"><small><GitBranch size={13}/>{t(" 从旧版本继续会保留原有分支")}</small><Button tone="primary" disabled={busy || hasActive || !instruction.trim() || !source || mode === 'performance' && (item?.conversation?.mode ?? item?.creationMode) === 'discuss'} onClick={() => void run(async () => { const plan = unwrap(await s.bridge.production.planContinuation({ taskId: task.id, candidateId: source!.id, instruction, mode, ...(summary.trim() ? { summary } : {}) })); setPrepared({ plan, view, sourceId: source!.id, sourceText: source!.editedText }); })}><Send size={15}/>{t("查看本轮发送计划")}</Button></div>
    {hasActive && <p className="field-help">{t("当前轮次完成或取消后，可以继续发送。")}</p>}
    {mode === 'performance' && (item?.conversation?.mode ?? item?.creationMode) === 'discuss' && <p className="field-help">{t("补演出需要剧本版本，请先选择已有剧本或写出剧情。")}</p>}
    {plan && <section className="production-send-review"><h3>{t("确认继续创作")}</h3><p>{t("发送 1 次请求，结果加入当前任务。作品内容在采用前保持当前版本。")}</p>{plan.sendSummary.map(v => <p key={v.itemId}>{v.destination} · {v.model} · {v.textCharacters.toLocaleString()}{t(" 字符")}</p>)}{plan.issues.map(i => <p key={i.code}>{i.message}</p>)}<Disclosure><span>{t("完整发送内容")}</span><CodeBlock code={JSON.stringify(plan.task.items[0]?.input, null, 2)} language="json" locale={locale}/></Disclosure>{error && <p role="alert">{error}</p>}<div className="dialog-actions"><Button disabled={busy} onClick={() => setPrepared(null)}>{t("返回修改")}</Button><Button tone="primary" disabled={busy || plan.issues.some(i => i.severity === 'error')} onClick={() => void run(async () => { unwrap(await s.bridge.production.submitContinuation({ taskId: task.id, planId: plan.planId })); setPrepared(null); if (s.continuationView(task.id) === view) s.updateContinuation(task.id, { instruction: '', summary: '', sourceId: '' }); })}>{t("确认发送本轮")}</Button></div></section>}
  </section>;
}
