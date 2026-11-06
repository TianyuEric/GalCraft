import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Link2, Pause, Play, Plus } from 'lucide-react';
import type { CollaborationOverview, CollaborationSession, CollaborationScope, CollaborationTarget, CallRecord, HarnessConfiguration } from '@galcraft/collaboration/contracts';
import type { Result } from '@galcraft/contracts';
import type { CandidateCollaborationBridge } from '../adapters/task-collaboration.js';
import { CandidateButton, CandidateCheckbox, CandidateField, CandidateFieldGroup, CandidateIconButton, CandidateInput, CandidateReviewDialog, CandidateSection, CandidateSelect, CandidateState, CandidateTextarea, CandidateToolbar } from './controls/index.js';
import { CandidateCodeReadout } from './collaboration/CandidateCodeReadout.js';
import { toolDisplay, actionDisplay } from '@galcraft/collaboration/display';
import type { ExternalToolDefinition } from '@galcraft/contracts';
import { CandidateHarnessConfigurationPanel } from './CandidateHarnessConfigurationPanel.js';
import '../styles/collaboration.css';

const unwrap = <T,>(value:Result<T>):T => {if(!value.ok)throw new Error(value.error.message);return value.value;};
const blankScope = ():CollaborationScope => ({mode:'currentProject',documents:[],createKinds:[],tools:[],operations:[],connectionIds:[],models:[],workflowIds:[],maxGenerations:null});
type Options = {documents:{id:string;name:string;kind:string}[];operations:{id:string;title:string}[];connections:{id:string;name:string;model:string}[];workflows:{id:string;name:string}[]};
export type CandidateCollaborationPreferences = { tabs: string[]; selected: string; workspaces: Record<string, string> };
type CollaborationProps = {bridge:CandidateCollaborationBridge;locale:string;active?:boolean;preferences:CandidateCollaborationPreferences;refreshVersion?: number; onUnappliedChange?(dirty:boolean):void; renderAudit?(round: CollaborationSession): ReactNode; targetStatement?(source: CollaborationTarget['source']): string | undefined};

export function CollaborationCandidate({bridge,locale,active=true,preferences,refreshVersion,onUnappliedChange,renderAudit,targetStatement}:CollaborationProps) {
  const t=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
  const [data,setData]=useState<CollaborationOverview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [selected,setSelected]=useState(() => preferences.selected),[callId,setCallId]=useState<string|null>(null);
  const firstRead = useRef(true);
  useEffect(() => { preferences.selected = selected; }, [preferences, selected]);
  const [forms,setForms]=useState<Record<string,{goal:string;harness:CollaborationSession['harness'];scope:CollaborationScope;revision:number}>>({});
  const [harness,setHarness]=useState<HarnessConfiguration['harness']>('dsh'),[destination,setDestination]=useState<'personal'|'project'>('project'),[purpose,setPurpose]=useState<'mcp'|'skill'>('mcp');
  const [stopping,setStopping]=useState(false);
  const [serviceOperation,setServiceOperation]=useState<{phase:'busy'|'success'|'error';message:string}|null>(null);
  const [deleting,setDeleting]=useState<CollaborationSession|null>(null),[definitions,setDefinitions]=useState<Record<string,ExternalToolDefinition>>({});
  const workspace = useRef<HTMLElement>(null), refreshRequest = useRef(0), running = useRef(false);
  const [historyPage, setHistoryPage] = useState(0), [historySearch, setHistorySearch] = useState(''), [historyState, setHistoryState] = useState('all');
  const [call, setCall] = useState<CallRecord | null>(null), [historyLoading, setHistoryLoading] = useState(false);
  const historySelected = !['service', 'configuration', 'tools', 'new'].includes(selected);
  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current;
    const next = unwrap(await bridge.overview(historySelected ? { history: { sessionId: selected, offset: historyPage * 25, limit: 25, search: historySearch, ...(historyState === 'all' ? {} : { state: historyState as CallRecord['state'] }) } } : {}));
    if (request === refreshRequest.current) {
      if (firstRead.current && selected === 'service') {
        const current = next.currentSessionId ?? next.sessions.find(round => !round.ended && round.projectId === next.currentProjectId)?.id;
        if (current) setSelected(current);
      }
      firstRead.current = false;
      setData(next);
      setHistoryLoading(false);
    }
    return next;
  }, [bridge, selected, historySelected, historyPage, historySearch, historyState]);
  useEffect(() => {
    if (!active) return;
    let mounted = true, pending = false;
    const update = async () => { if (pending || document.hidden || !workspace.current?.isConnected) return; pending = true; try { await refresh(); } catch (reason) { if (mounted) { setError(String(reason).replace(/^Error: /, '')); setHistoryLoading(false); } } finally { pending = false; } };
    setHistoryLoading(true); void update();
    const timer = setInterval(() => void update(), 1500);
    const resume = () => { if (!document.hidden) void update(); }; document.addEventListener('visibilitychange', resume);
    return () => { mounted = false; ++refreshRequest.current; clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [active, refresh, refreshVersion]);
  const selectedSummary = data?.callPage?.items.find(item => `${item.sessionId}/${item.callId}` === callId);
  const selectedCallVersion = selectedSummary?.updatedAt ?? call?.updatedAt;
  useEffect(() => { setCall(null); }, [callId]);
  useEffect(() => {
    if (!active || !callId) return;
    let mounted = true;
    const [sessionId, id] = callId.split('/');
    void bridge.readCall({ sessionId: sessionId!, callId: id! }).then(result => { if (mounted) setCall(unwrap(result)); }).catch(reason => { if (mounted) setError(String(reason).replace(/^Error: /, '')); });
    return () => { mounted = false; };
  }, [active, bridge, callId, selectedCallVersion]);
  const history = data?.callPage;

  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try { await action(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { running.current = false; setBusy(false); }
  };
  const open=(id:string)=>{setMessage('');setError('');if(id!==selected)setServiceOperation(null);setSelected(id);if(id!==selected){setHistoryPage(0);setHistorySearch('');setHistoryState('all');}setCallId(null);};
  const session=data?.sessions.find(item=>item.id===selected);
  const options=(data as (CollaborationOverview&{options?:Options})|null)?.options;
  const form=forms[selected]??{goal:session?.goal??'',harness:session?.harness??'dsh',scope:session?.scope??data?.defaultScope??blankScope(),revision:session?.scopeRevision??0};
  const dirtyForm = (id:string) => {
    const draft=forms[id]; if(!draft)return false;
    const saved=data?.sessions.find(item=>item.id===id);
    return JSON.stringify([draft.goal,draft.harness,draft.scope]) !== JSON.stringify([saved?.goal??'',saved?.harness??'dsh',saved?.scope??data?.defaultScope??blankScope()]);
  };
  const unapplied=Object.keys(forms).some(dirtyForm);
  useEffect(()=>{onUnappliedChange?.(unapplied);},[unapplied,onUnappliedChange]);
  useEffect(()=>()=>onUnappliedChange?.(false),[onUnappliedChange]);
  const display=(tool:{key:string;title:string;description:string})=>toolDisplay(tool,locale);
  const toolTitle=(key:string)=>{const tool=data?.tools.find(item=>item.key===key);return tool?display(tool).title:key;};
  const terminalSessions=data?.sessions.filter(item=>!data.sessions.some(next=>next.reboundFrom===item.id))??[];
  const resumable = terminalSessions.find(round => !round.ended && round.projectId === data?.currentProjectId);
  const patch=(value:Partial<typeof form>)=>setForms(current=>({...current,[selected]:{...form,...value}}));
  const changeScope=(key:'documents'|'createKinds'|'tools'|'operations'|'connectionIds'|'workflowIds',id:string,enabled:boolean)=>{
    const values=enabled?[...new Set([...form.scope[key],id])]:form.scope[key].filter(value=>value!==id),scope={...form.scope,[key]:values};
    if(key==='connectionIds')scope.models=[...new Set(options?.connections.filter(connection=>values.includes(connection.id)).map(connection=>connection.model)??[])];patch({scope});
  };
  const status=(value:CollaborationSession&{bindingValid?:boolean})=>value.ended?t('已结束','Ended','終了済み'):value.bindingValid===false?t('绑定已失效','Binding expired','接続先が無効'):value.paused?t('已暂停','Paused','一時停止中'):t('协作中','Active','連携中');
  const callStatus=(value:CallRecord['state'])=>({accepted:t('已受理','Accepted','受付済み'),running:t('执行中','Running','実行中'),completed:t('已完成','Completed','完了'),failed:t('失败','Failed','失敗'),cancelled:t('已取消','Cancelled','取消済み'),uncertain:t('待核实','Needs verification','確認が必要')}[value]);
  const title=(id:string)=>id==='service'?t('本机服务','Local service','ローカルサービス'):id==='configuration'?t('Harness 配置','Harness configuration','Harness 設定'):id==='tools'?t('工具目录','Tools','ツール一覧'):id==='new'?t('新建协作','New collaboration','新しい連携'):data?.sessions.find(item=>item.id===id)?.goal??id;
  const checkList=(key:'documents'|'createKinds'|'tools'|'operations'|'connectionIds'|'workflowIds',items:{id:string;name:string;detail?:string}[])=>items.length?<div className="collaboration-check-list">{items.map(item=><label key={item.id}><CandidateCheckbox checked={form.scope[key].includes(item.id)} onChange={event=>changeScope(key,item.id,event.target.checked)}/><span>{item.name}{item.detail&&<small>{item.detail}</small>}</span></label>)}</div>:<p className="collaboration-meta">{t('当前没有可选项','No options available','選択肢がありません')}</p>;
  const currentProjectScope = form.scope.mode === 'currentProject';
  const toolCount = currentProjectScope ? data?.tools.length ?? 0 : form.scope.tools.length;
  const scopeEditor = <form className="candidate-collab-scope" onSubmit={event => {
    event.preventDefault();
    if (session?.ended) return;
    void run(async () => {
      if (!form.goal.trim()) throw new Error(t('请填写创作目标', 'Enter a creative goal', '制作目標を入力してください'));
      const saved = unwrap(session
        ? await bridge.update({ id: session.id, expectedRevision: form.revision, goal: form.goal, scope: form.scope })
        : await bridge.create({ goal: form.goal, harness: form.harness, scope: form.scope }));
      setForms(current => {
        const next = { ...current };
        delete next[selected];
        delete next[saved.id];
        return next;
      });
      open(saved.id);
      setMessage(t('协作范围已保存', 'Scope saved', '範囲を保存しました'));
    });
  }}>
    <CandidateFieldGroup title={t('轮次设置', 'Round settings', 'セッション設定')} disabled={busy || !!session?.ended}>
      <CandidateField className="candidate-collab-goal" label={t('创作目标', 'Creative goal', '制作目標')}>
        <CandidateTextarea required value={form.goal} rows={3} onChange={event => patch({ goal: event.target.value })}/>
      </CandidateField>
      {!session && <CandidateField label={t('使用的 harness', 'Harness', '使用する harness')}>
        <CandidateSelect value={form.harness} onValueChange={value => patch({ harness: value as CollaborationSession['harness'] })}>
          <option value="dsh">DSH</option><option value="claude">Claude Code</option><option value="codex">Codex</option>
        </CandidateSelect>
      </CandidateField>}
      <CandidateField label={t('执行范围', 'Execution scope', '実行範囲')} hint={t('专项限制只授权下方选定的对象和能力。', 'Restricted scope permits only the selected objects and capabilities.', '範囲を限定すると選択した対象と機能だけを許可します。')}>
        <CandidateSelect value={form.scope.mode ?? 'restricted'} onValueChange={mode => patch({ scope: { ...form.scope, mode: mode as 'currentProject' | 'restricted' } })}>
          <option value="currentProject">{t('当前作品 · 全部可用', 'Current project · All available', '現在の作品・利用可能な全機能')}</option>
          <option value="restricted">{t('专项限制', 'Restricted scope', '範囲を限定')}</option>
        </CandidateSelect>
      </CandidateField>
      <CandidateField label={t('新增生成提交上限', 'New generation request limit', '新規生成リクエスト上限')}
        hint={t('查询和重取沿用原请求。已发送的请求计入额度，包括结果待核实的请求。', 'Queries and retrieval use the original request. Sent requests count, including those awaiting verification.', '照会と再取得には元のリクエストを使います。送信済みで結果の確認待ちのものも数えます。')}>
        <CandidateInput type="number" min={0} step={1} placeholder={t('不设置', 'No extra limit', '追加上限なし')}
          value={form.scope.maxGenerations ?? ''} onChange={event => patch({ scope: { ...form.scope, maxGenerations: event.target.value === '' ? null : Number(event.target.value) } })}/>
      </CandidateField>
    </CandidateFieldGroup>
    {!currentProjectScope && <fieldset className="candidate-collab-restricted" disabled={busy || !!session?.ended}>
      <CandidateSection title={t('允许修改的文档', 'Documents that may change', '変更を許可する文書')}>
        <p>{t('选择完整事务涉及的文档。新增场景还需要允许修改所属章节的作品文档。', 'Select every document the transaction changes. A new scene also changes its project chapter.', 'トランザクションに含まれる全ての文書を選択してください。新しい場面は作品のチャプターも変更します。')}</p>
        {checkList('documents', options?.documents.map(document => ({ id: document.id, name: document.name, detail: document.kind })) ?? [])}
      </CandidateSection>
      <CandidateSection title={t('允许新增', 'Allowed additions', '追加を許可')}>
        {checkList('createKinds', [{ id: 'scene', name: t('场景', 'Scenes', '場面') }, { id: 'character', name: t('角色', 'Characters', 'キャラクター') },
          { id: 'asset', name: t('素材', 'Assets', '素材') }, { id: 'document', name: t('其他作者文档', 'Other author documents', 'その他の制作文書') }])}
      </CandidateSection>
      <CandidateSection collapsible initiallyOpen={false} title={`${t('可调用工具', 'Allowed tools', '利用できるツール')} · ${form.scope.tools.length}`}>
        {checkList('tools', data?.tools.map(tool => ({ id: tool.key, name: display(tool).title, detail: display(tool).description })) ?? [])}
      </CandidateSection>
      <CandidateSection collapsible initiallyOpen={false} title={t('制作范围', 'Production scope', '制作範囲')}>
        <CandidateFieldGroup title={t('允许的操作', 'Operations', '操作')}>{checkList('operations', options?.operations.map(operation => ({ id: operation.id, name: operation.title })) ?? [])}</CandidateFieldGroup>
        <CandidateFieldGroup title={t('连接与模型', 'Connections and models', '接続とモデル')}>{checkList('connectionIds', options?.connections.map(connection => ({ id: connection.id, name: connection.name, detail: connection.model })) ?? [])}</CandidateFieldGroup>
        <CandidateFieldGroup title={t('工作流', 'Workflows', 'ワークフロー')}>{checkList('workflowIds', options?.workflows.map(workflow => ({ id: workflow.id, name: workflow.name })) ?? [])}</CandidateFieldGroup>
      </CandidateSection>
    </fieldset>}
    <CandidateToolbar label={t('范围操作', 'Scope actions', '範囲の操作')}>
      <CandidateButton type="submit" variant="primary" disabled={busy || !!session?.ended}>
        {session ? t('保存范围', 'Save scope', '範囲を保存') : t('确认范围并建立协作', 'Confirm scope and create', '範囲を確認して開始')}
      </CandidateButton>
      <span className="collaboration-meta">{toolCount} {t('个工具已授权。作品修改由作者审阅并保存。', 'tools allowed. The author reviews and saves project changes.', '個のツールを許可。作者が作品の変更を確認して保存します。')}</span>
    </CandidateToolbar>
  </form>;

  const navigator = <CandidateToolbar label={t('协作与接入', 'Collaboration and setup', '連携と接続')} className="candidate-collab-navigation">
    <CandidateField label={t('协作轮次', 'Collaboration round', '連携セッション')}>
      <CandidateSelect value={historySelected ? selected : ''} onValueChange={open} disabled={!terminalSessions.length || busy}>
        <option value="" disabled>{t('选择轮次', 'Choose a round', 'セッションを選択')}</option>
        {terminalSessions.map(item => <option key={item.id} value={item.id}>{item.goal} · {status(item)}</option>)}
      </CandidateSelect>
    </CandidateField>
    {!resumable && <CandidateButton disabled={!data?.currentProjectId || busy} variant="outline" onClick={() => open('new')}><Plus size={14} aria-hidden="true"/>{title('new')}</CandidateButton>}
    <CandidateButton disabled={busy} aria-pressed={selected === 'service'} onClick={() => open('service')}><Link2 size={14} aria-hidden="true"/>{title('service')}</CandidateButton>
    <CandidateButton disabled={busy} aria-pressed={selected === 'configuration'} onClick={() => open('configuration')}>{title('configuration')}</CandidateButton>
    <CandidateButton disabled={busy} aria-pressed={selected === 'tools'} onClick={() => open('tools')}>{title('tools')}</CandidateButton>
  </CandidateToolbar>;

  const documentName = (id: string) => options?.documents.find(document => document.id === id)?.name ?? id;
  type ReceiptResult = {
    taskId?: string; id?: string; name?: string; groupId?: string; task?: { name?: string };
    documents?: { ref?: { id: string }; documentId?: string }[];
    result?: { documents?: ReceiptResult['documents'] };
  };
  const result = call?.result as ReceiptResult | undefined;
  const documentIds = (result?.documents ?? result?.result?.documents)?.flatMap(item => {
    const id = item.ref?.id ?? item.documentId;
    return id ? [id] : [];
  });
  const resultSummary = documentIds?.length ? documentIds.map(documentName).join(' · ') : result?.task?.name ?? result?.name ??
    (result?.groupId ? t('作品工作版本已更新', 'Working documents updated', '作業文書を更新済み') :
      call?.state === 'uncertain' ? t('保留原调用标识核实结果', 'Verify with the original call ID', '元の呼び出しIDで結果を確認') : undefined);
  const receipt = call ? <CandidateSection title={t('调用详情', 'Call details', '呼び出し詳細')} className="candidate-collab-receipt">
    <h3>{toolTitle(call.tool)} · {callStatus(call.state)}</h3>
    {resultSummary && <p>{resultSummary}</p>}
    {call.error && <CandidateState kind="error" title={call.error}/>}
    <CandidateSection key={callId} collapsible initiallyOpen={false} title={t('参数与真实结果', 'Parameters and actual result', 'パラメータと実際の結果')}>
      <CandidateCodeReadout code={JSON.stringify(call, null, 2)} locale={locale} language="json"/>
    </CandidateSection>
    {(call.state === 'completed' || call.state === 'uncertain') && <CandidateButton variant="outline" disabled={busy} onClick={() => void run(async () => {
      unwrap(await bridge.open({
        page: call.tool === 'galcraft_production' ? 'production' : 'creation', taskId: result?.taskId ?? result?.id,
        documentId: documentIds?.[0] ?? (call.input as { documentId?: string } | undefined)?.documentId, sessionId: call.sessionId,
      }));
    })}>{t('打开所属工作区', 'Open owning workspace', '担当ワークスペースを開く')}</CandidateButton>}
  </CandidateSection> : callId && <CandidateState kind="loading" title={t('正在读取调用详情', 'Loading call details', '呼び出し詳細を読み込み中')}/>;

  const page = history ? Math.floor(history.offset / 25) : historyPage;
  const pageCount = Math.ceil((history?.total ?? 0) / 25);
  const historyView = <CandidateSection title={`${t('调用与实际结果', 'Calls and actual results', '呼び出しと実際の結果')} · ${history?.total ?? 0}`} className="candidate-collab-history">
    <CandidateToolbar label={t('筛选调用', 'Filter calls', '呼び出しを絞り込む')} className="candidate-collab-filters">
      <CandidateInput type="search" aria-label={t('搜索调用', 'Search calls', '呼び出しを検索')} placeholder={t('搜索工具或调用标识', 'Search tool or call ID', 'ツールや呼び出しIDを検索')}
        value={historySearch} onChange={event => { setHistorySearch(event.target.value); setHistoryPage(0); }}/>
      <CandidateSelect aria-label={t('调用状态', 'Call status', '呼び出しの状態')} value={historyState} onValueChange={value => { setHistoryState(value); setHistoryPage(0); }}>
        <option value="all">{t('全部状态', 'All states', 'すべての状態')}</option>
        {(['running', 'accepted', 'completed', 'failed', 'uncertain', 'cancelled'] as const).map(value => <option value={value} key={value}>{callStatus(value)}</option>)}
      </CandidateSelect>
    </CandidateToolbar>
    <div className="candidate-collab-call-list" aria-busy={historyLoading}>
      {historyLoading ? <CandidateState kind="loading" title={t('正在读取调用', 'Loading calls', '呼び出しを読み込み中')}/> :
        !history?.total ? <CandidateState kind="empty" title={historySearch || historyState !== 'all'
          ? t('没有匹配的调用', 'No matching calls', '一致する呼び出しがありません')
          : t('等待 harness 调用', 'Waiting for harness calls', 'Harness からの呼び出しを待っています')}
          description={historySearch || historyState !== 'all'
            ? t('调整搜索或状态可查看其他记录。', 'Change the search or status filter.', '検索や状態を変更してください。')
            : t('接入后先读取本会话与能力目录。', 'Read this session and its capability catalog after connecting.', '接続後にセッションと機能一覧を取得してください。')}/> :
        history.items.map(item => <CandidateButton className="candidate-collab-call" key={`${item.sessionId}/${item.callId}`} aria-pressed={callId === `${item.sessionId}/${item.callId}`}
          onClick={() => setCallId(`${item.sessionId}/${item.callId}`)}>
          <span className="candidate-collab-call-tool">{toolTitle(item.tool)}</span>
          <span className="candidate-collab-call-state" data-state={item.state}>{callStatus(item.state)}</span>
          <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(locale)}</time>
          {(item.summary || item.documentIds.length > 0) && <small>{item.summary || item.documentIds.map(documentName).join(' · ')}</small>}
          {item.error && <small>{item.error}</small>}
        </CandidateButton>)}
    </div>
    {history && pageCount > 1 && <CandidateToolbar label={t('调用历史分页', 'Call history pages', '呼び出し履歴のページ')} className="candidate-collab-pagination">
      <span className="candidate-collab-pagination-count">{history.offset + 1}–{history.offset + history.items.length} / {history.total}</span>
      <CandidateIconButton label={t('首页', 'First page', '最初のページ')} disabled={historyLoading || page === 0} onClick={() => setHistoryPage(0)}><ChevronsLeft size={15} aria-hidden="true"/></CandidateIconButton>
      <CandidateIconButton label={t('上一页', 'Previous page', '前のページ')} disabled={historyLoading || page === 0} onClick={() => setHistoryPage(page - 1)}><ChevronLeft size={15} aria-hidden="true"/></CandidateIconButton>
      <output>{page + 1} / {pageCount}</output>
      <CandidateIconButton label={t('下一页', 'Next page', '次のページ')} disabled={historyLoading || page + 1 >= pageCount} onClick={() => setHistoryPage(page + 1)}><ChevronRight size={15} aria-hidden="true"/></CandidateIconButton>
      <CandidateIconButton label={t('末页', 'Last page', '最後のページ')} disabled={historyLoading || page + 1 >= pageCount} onClick={() => setHistoryPage(pageCount - 1)}><ChevronsRight size={15} aria-hidden="true"/></CandidateIconButton>
    </CandidateToolbar>}
    {receipt}
  </CandidateSection>;

  const changeService = () => {
    if (data?.endpoint) { setError(''); setStopping(true); return; }
    void run(async () => {
      setServiceOperation({ phase: 'busy', message: t('正在开启本机服务…', 'Starting local service…', 'ローカルサービスを開始中…') });
      try {
        unwrap(await bridge.start());
        setServiceOperation({ phase: 'success', message: t('本机服务已开启', 'Local service started', 'ローカルサービスを開始しました') });
      } catch (reason) { setServiceOperation({ phase: 'error', message: reason instanceof Error ? reason.message : String(reason) }); }
    });
  };
  const serviceView = data && <CandidateSection title={t('本机服务与助手接入', 'Local service and assistant setup', 'ローカルサービスとアシスタント接続')} className="candidate-collab-flow">
    <div className="candidate-collab-endpoint">
      <span data-running={!!data.endpoint || undefined}>{data.service?.error ? t('启动失败', 'Startup failed', '起動失敗') :
        data.endpoint ? t('服务运行中', 'Service running', 'サービス稼働中') : t('服务已关闭', 'Service stopped', 'サービス停止中')}</span>
      {data.endpoint && <code>{data.endpoint}</code>}
    </div>
    <p>{t('开启本机服务并配置助手，再开始或接入当前作品的协作。重新接入保留范围、暂停状态和实际用量。', 'Start the service, configure the assistant, then open a project round. Reconnecting preserves scope, pause and usage.', 'サービスとアシスタントを設定し、現在の作品の連携を開始または接続します。再接続で範囲・一時停止・使用量を保持します。')}</p>
    {data.service?.error && <CandidateState kind="error" title={t('MCP 服务启动失败', 'MCP service could not start', 'MCP サービスを開始できませんでした')}
      description={<>{data.service.error.code} · {data.service.error.message}</>}/>}
    {data.endpoint && data.service?.addressChange && <CandidateSection title={t('MCP 地址已变更', 'MCP address changed', 'MCP アドレスが変更されました')}>
      <p><code>{data.service.addressChange.previous}</code> → <code>{data.endpoint}</code></p>
      <p>{t('请审阅配置并更新助手保存的地址，再重新加载客户端。', 'Review the configuration, update the assistant’s saved address, then reload the client.', '設定を確認してアシスタントの URL を更新し、クライアントを再読み込みしてください。')}</p>
      <CandidateButton onClick={() => { setPurpose('mcp'); open('configuration'); }}>{t('修复客户端配置', 'Repair client configuration', 'クライアント設定を修正')}</CandidateButton>
    </CandidateSection>}
    <CandidateToolbar label={t('服务操作', 'Service actions', 'サービスの操作')}>
      <CandidateButton variant="primary" disabled={busy} onClick={changeService}>{data.endpoint
        ? t('关闭服务', 'Stop service', 'サービスを停止') : data.service?.error ? t('重试启动', 'Retry startup', '起動を再試行') : t('开启服务', 'Start service', 'サービスを開始')}</CandidateButton>
      <CandidateButton disabled={busy} onClick={() => open('configuration')}>{t('配置 harness', 'Configure harness', 'Harness を設定')}</CandidateButton>
      {resumable ? <CandidateButton disabled={busy} onClick={() => open(resumable.id)}>{t('查看当前活动', 'Current activity', '現在の作業')}</CandidateButton>
        : <CandidateButton disabled={busy || !data.currentProjectId} onClick={() => open('new')}>{t('开始协作', 'Start collaboration', '連携を開始')}</CandidateButton>}
    </CandidateToolbar>
    {serviceOperation && <p className="collaboration-operation-feedback" data-phase={serviceOperation.phase} role={serviceOperation.phase === 'error' ? 'alert' : 'status'}>{serviceOperation.message}</p>}
    <p className="collaboration-meta">{t('配置记录在当前浏览器。请在桌面 Studio 和助手中确认外部客户端连接。', 'Configuration is stored in this browser. Confirm external client connectivity in desktop Studio and the assistant.', '設定はブラウザーに保存されます。外部接続はデスクトップ Studio とアシスタントで確認してください。')}</p>
  </CandidateSection>;

  const toolCatalog = data && <CandidateSection title={t('当前工具目录', 'Current tool catalog', '現在のツール一覧')} className="candidate-collab-flow">
    <p>{t('目录来自已装配的提供方。每次调用检查会话范围和当前版本。', 'The catalog comes from loaded providers. Every call checks the current scope and versions.', '読み込まれた提供元の一覧です。呼び出しごとに範囲とバージョンを検証します。')}</p>
    {data.tools.map(tool => <CandidateSection key={tool.key} title={display(tool).title} collapsible initiallyOpen={false} className="candidate-collab-tool">
      <p>{display(tool).description}</p>
      {!!tool.actions?.length && <p>{tool.actions.map(action => actionDisplay(action, locale)).join(' · ')}</p>}
      {tool.example !== undefined && <CandidateCodeReadout code={JSON.stringify(tool.example, null, 2)} locale={locale} language="json"/>}
      <p className="collaboration-meta">{tool.key} · {tool.version}</p>
      {definitions[tool.key] ? <CandidateCodeReadout code={JSON.stringify(definitions[tool.key], null, 2)} locale={locale} language="json"/> :
        <CandidateButton disabled={busy} onClick={() => void run(async () => {
          const definition = unwrap(await bridge.toolDefinition({ key: tool.key }));
          setDefinitions(current => ({ ...current, [tool.key]: definition }));
        })}>{t('读取精确英文契约', 'Read exact English contract', '正確な英語仕様を読み込む')}</CandidateButton>}
    </CandidateSection>)}
  </CandidateSection>;

  const roundView = data && session && <div className="candidate-collab-round">
    <CandidateSection title={session.goal} className="candidate-collab-flow">
      <div className="candidate-collab-session-line"><strong>{status(session)}</strong><span>{session.projectName}</span></div>
      <CandidateToolbar label={t('轮次操作', 'Round actions', 'セッションの操作')}>
        {session.ended ? <>
          <CandidateButton disabled={busy || session.projectId !== data.currentProjectId} onClick={() => {
            if (data.currentSessionId) { open(data.currentSessionId); return; }
            setForms(current => ({ ...current, new: { goal: session.goal, harness: session.harness, scope: structuredClone(data.defaultScope ?? blankScope()), revision: 0 } }));
            open('new');
          }}>{data.currentSessionId && session.projectId === data.currentProjectId
            ? t('接入当前协作', 'Open current collaboration', '現在の連携を開く') : t('开始新一轮协作', 'Start a new round', '新しい連携を開始')}</CandidateButton>
          <CandidateButton variant="danger" disabled={busy} onClick={() => { setError(''); setDeleting(session); }}>{t('删除本轮历史', 'Delete round history', '連携履歴を削除')}</CandidateButton>
        </> : <>
          <CandidateButton variant="outline" disabled={busy || session.bindingValid === false} onClick={() => void run(async () => {
            unwrap(await bridge.update({ id: session.id, expectedRevision: session.scopeRevision, paused: !session.paused }));
          })}>{session.paused ? <Play size={14} aria-hidden="true"/> : <Pause size={14} aria-hidden="true"/>}
            {session.paused ? t('恢复协作', 'Resume', '再開') : t('暂停协作', 'Pause', '一時停止')}</CandidateButton>
          <CandidateButton disabled={busy} onClick={() => void run(async () => {
            unwrap(await bridge.end({ id: session.id, expectedRevision: session.scopeRevision }));
            setMessage(t('协作已结束；作品、原任务及历史调用保留。', 'Collaboration ended. Project content, original tasks and call history remain.', '連携を終了しました。作品、元のタスク、履歴を保持します。'));
          })}>{t('结束协作', 'End collaboration', '連携を終了')}</CandidateButton>
          {session.bindingValid === false && session.projectId === data.currentProjectId && <CandidateButton disabled={busy} onClick={() => void run(async () => {
            const connected = unwrap(await bridge.rebind({ id: session.id, expectedRevision: session.scopeRevision }));
            open(connected.id);
          })}>{t('重新接入本轮', 'Reconnect this round', 'この連携に再接続')}</CandidateButton>}
        </>}
      </CandidateToolbar>
      {!session.ended && session.bindingValid === false && <CandidateState kind="error"
        title={t('当前写绑定已失效', 'The write binding expired', '書き込み接続が無効です')}
        description={t('打开原作品并重新接入本轮。范围、暂停和实际用量会保留；旧客户端需取得新身份。', 'Open the original project and reconnect. Scope, pause and usage are retained. Clients need the new identity.', '元の作品を開いて同じ連携に再接続してください。範囲・一時停止・使用量を保持し、クライアントは新しい識別子を取得します。')}/>}
      {!session.ended && session.paused && <p role="status">{t('新写入、采用和新增生成已暂停。已有任务仍可查询和取回。', 'New edits, adoption and generation sends are paused. Existing work can still be queried and retrieved.', '新しい編集、採用、生成送信を停止しています。既存タスクの照会と取得は継続できます。')}</p>}
      {session.ended && session.projectId !== data.currentProjectId && <p>{t('打开所属作品后可开始新一轮协作。', 'Open the owning project to start a new round.', '元の作品を開いて新しい連携を開始してください。')}</p>}
    </CandidateSection>
    <CandidateSection title={t('轮次目标与用量', 'Round target and usage', 'セッションの対象と使用量')} className="candidate-collab-round-target">
      <dl className="candidate-collab-facts">
        <div><dt>{t('已交接对象', 'Handed-off target', '引き継いだ対象')}</dt><dd>{session.target
          ? documentName(session.target.source.documentId) : t('等待明确交接', 'Awaiting handoff', '引き継ぎ待ち')}</dd></div>
        {session.target?.source.statementId && <div><dt>{t('已选语句', 'Selected statement', '選択した文')}</dt><dd>{targetStatement?.(session.target.source)
          ?? t('语句已移除', 'Statement unavailable', '文が見つかりません')}</dd></div>}
        <div><dt>{t('新增生成', 'New generation requests', '新規生成')}</dt><dd>{session.generations} / {session.scope.maxGenerations ?? t('不限', 'Unlimited', '無制限')}</dd></div>
        <div><dt>{t('已发请求', 'Sent requests', '送信済み')}</dt><dd>{session.sentRequests.length}</dd></div>
        <div><dt>{t('在途调用', 'In-flight calls', '実行中の呼び出し')}</dt><dd>{data.calls.filter(call => call.sessionId === session.id).length}</dd></div>
      </dl>
      <CandidateSection title={t('轮次身份与范围', 'Round identity and scope', 'セッションの識別子と範囲')} collapsible initiallyOpen={false}>
        <CandidateCodeReadout code={JSON.stringify(session, null, 2)} locale={locale} language="json"/>
      </CandidateSection>
    </CandidateSection>
    <CandidateSection title={t('查看与调整执行范围', 'Review and adjust scope', '実行範囲を確認・調整')} collapsible initiallyOpen={false} key={session.id}>
      {scopeEditor}
    </CandidateSection>
    {session.id === data.currentSessionId && renderAudit?.(session)}
    {historyView}
  </div>;

  const cancel = t('取消', 'Cancel', 'キャンセル');
  return <section ref={workspace} className="candidate-collab-workspace" aria-label={t('外部创作协作', 'External creative collaboration', '外部制作連携')}>
    {navigator}
    {unapplied && <CandidateToolbar label={t('未保存范围', 'Unsaved scope', '未保存の範囲')} className="candidate-collab-unsaved">
      <span role="status">{t('有未保存的协作范围', 'Unsaved collaboration scope', '未保存の連携範囲')}</span>
      <CandidateButton disabled={busy} onClick={() => setForms({})}>{t('还原未保存范围', 'Restore unsaved scope', '未保存の範囲を復元')}</CandidateButton>
    </CandidateToolbar>}
    <div className="candidate-collab-scroll">
      <div className="candidate-collab-content">
        {error && !stopping && !deleting && <CandidateState kind="error" title={error} action={!data && <CandidateButton onClick={() => void run(async () => {})}>{t('重新读取', 'Reload', '再読込')}</CandidateButton>}/>}
        {message && <p className="collaboration-operation-feedback" data-phase="success" role="status">{message}</p>}
        {!data ? !error && <CandidateState kind="loading" title={t('正在读取协作状态', 'Loading collaboration', '連携を読み込み中')}/> :
          selected === 'service' ? serviceView : selected === 'configuration' ? <CandidateHarnessConfigurationPanel preferences={preferences} bridge={bridge} locale={locale}
            endpoint={data.endpoint} projectId={data.currentProjectId} harness={harness} destination={destination} purpose={purpose} onHarness={setHarness} onDestination={setDestination} onPurpose={setPurpose}/> :
          selected === 'tools' ? toolCatalog : selected === 'new' ?
            <CandidateSection title={t('确定本次创作目标与范围', 'Set the creative goal and scope', '今回の制作目標と範囲を指定')}>{scopeEditor}</CandidateSection> :
            roundView ?? <CandidateState kind="empty" title={t('选择协作轮次', 'Choose a collaboration round', '連携セッションを選択してください')}/>}
      </div>
    </div>
    <CandidateReviewDialog open={active && stopping} busy={busy} title={t('关闭本机 MCP 服务', 'Stop local MCP service', 'ローカル MCP サービスを停止')}
      description={t('服务停止期间，外部助手无法连接。作品、协作记录和制作任务继续保留。', 'External assistants cannot connect while the service is stopped. Projects, records and tasks are retained.', '停止中は外部アシスタントから接続できません。作品、連携履歴、制作タスクは保持します。')}
      onDismiss={() => { setStopping(false); setError(''); }}
      actions={<><CandidateButton disabled={busy} onClick={() => { setStopping(false); setError(''); }}>{cancel}</CandidateButton>
        <CandidateButton variant="primary" disabled={busy} onClick={() => void run(async () => {
          unwrap(await bridge.stop());
          setStopping(false);
          setServiceOperation({ phase: 'success', message: t('本机服务已关闭', 'Local service stopped', 'ローカルサービスを停止しました') });
        })}>{t('关闭服务', 'Stop service', 'サービスを停止')}</CandidateButton></>}>
      {error && stopping && <CandidateState kind="error" title={error}/>}
    </CandidateReviewDialog>
    <CandidateReviewDialog open={active && !!deleting} busy={busy} title={t('删除已结束协作的个人历史', 'Delete ended collaboration history', '終了した連携の履歴を削除')}
      description={deleting?.goal} onDismiss={() => { setDeleting(null); setError(''); }}
      actions={<><CandidateButton disabled={busy} onClick={() => { setDeleting(null); setError(''); }}>{cancel}</CandidateButton>
        <CandidateButton variant="danger" disabled={busy} onClick={() => deleting && void run(async () => {
          unwrap(await bridge.deleteEnded({ id: deleting.id, expectedRevision: deleting.scopeRevision }));
          setDeleting(null);
          open('service');
          setMessage(t('本轮个人历史已删除', 'Round history deleted', '連携履歴を削除しました'));
        })}>{t('删除个人历史', 'Delete personal history', '個人用履歴を削除')}</CandidateButton></>}>
      <p>{t('删除本轮及续接身份的目标、调用参数、结果日志和审阅缓存。作品修改、制作任务、候选、冻结输入及原请求身份由所属工作区保留。', 'Delete goal details, call inputs and results, and review cache for this round and its rebound identities. Project edits, tasks, candidates, frozen inputs and original request identities remain in their workspaces.', 'この連携と再接続した識別子の目標、入力、結果、確認キャッシュを削除します。作品の変更、タスク、候補、固定入力、元のリクエストは担当画面に保持されます。')}</p>
      {error && deleting && <CandidateState kind="error" title={error}/>}
    </CandidateReviewDialog>
  </section>;
}
