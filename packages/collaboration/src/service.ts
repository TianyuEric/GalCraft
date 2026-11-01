import { isDeepStrictEqual } from 'node:util';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CollaborationScopeSchema, ExternalToolDefinitionSchema, createId, enrichIssue, issueFromError, issueSummary } from '@galcraft/contracts';
import { z } from 'zod';
import type { CollaborationContext, ExternalToolDefinition, Issue, Json } from '@galcraft/contracts';
import type { CallRecord, CallHistoryQuery, CallHistoryPage, CallSummary, CollaborationSession, Constraint } from './contracts.js';
import { toolDisplay } from './display.js';

export type ExternalTool = {
  definition: ExternalToolDefinition;
  constraints(input: Json): Constraint;
  execute(input: Json, context: CollaborationContext, check: (constraint: Constraint) => void,signal?:AbortSignal): Promise<Json>;
  lookup?(context: CollaborationContext, input: Json, previous?: Json): Promise<Json | undefined>;
};
export class CollaborationError extends Error {
  readonly issue: Issue;
  constructor(readonly code:string, message:string, issue?:Issue) { super(message); this.issue=enrichIssue(issue??{code,message,severity:'error',owner:'M12',related:[],actions:['retry']}); }
}
const fail = (code:string,message:string):never => {throw new CollaborationError(code,message);};
const safeId = (value:string) => {if(!/^[a-zA-Z0-9_-]{1,160}$/.test(value))fail('CALL_ID','Call IDs may contain only ASCII letters, digits, underscores and hyphens.');return value;};
const validateToolData=(schema:Json,data:Json)=>schema===true?{success:true as const}:schema===false?{success:false as const,error:{message:'Value is disallowed'}}:z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]).safeParse(data);
function validOutput(tool: ExternalTool, input: Json, result: Json) {
  if (!validateToolData(tool.definition.outputSchema, result).success) return false;
  if (input && typeof input === 'object' && !Array.isArray(input) && result && typeof result === 'object' && !Array.isArray(result)) {
    for (const tag of ['action', 'mode']) if (tag in input && tag in result && input[tag] !== result[tag]) return false;
  }
  return true;
}
const toolIdentity=(key:string,version:string,provider?:ExternalToolDefinition['provider'])=>JSON.stringify([key,version,provider?.id??null,provider?.version??null]);
const parseScope=(scope:CollaborationSession['scope'])=>({...CollaborationScopeSchema.parse(scope),mode:scope.mode??'restricted' as const});
export const currentProjectScope=():CollaborationSession['scope']=>({mode:'currentProject',documents:[],createKinds:[],tools:[],operations:[],connectionIds:[],models:[],workflowIds:[],maxGenerations:null});
export class CollaborationService {
  private sessions = new Map<string,CollaborationSession>();
  private deleted = new Map<string,{id:string;projectId:string;reboundFrom?:string;ended:true}>();
  private preferences = new Map<string,CollaborationSession['scope']>();
  private calls = new Map<string,CallRecord>();
  private tools = new Map<string,ExternalTool>();
  private queryProviders = new Map<string,ExternalTool>();
  private inFlight = new Map<string,Promise<CallRecord>>();
  private controllers=new Map<string,AbortController>();
  private tail:Promise<unknown> = Promise.resolve();
  constructor(readonly root:string, private binding:()=>{projectId:string;writeSessionId:string;createdDocuments?:(sessionId:string)=>string[]}|null) {}
  private serial<T>(action:()=>Promise<T>):Promise<T>{const work=this.tail.then(action);this.tail=work.then(()=>undefined,()=>undefined);return work;}
  private async save(path:string,value:unknown){await mkdir(dirname(path),{recursive:true});const temp=`${path}.tmp`;await writeFile(temp,JSON.stringify(value,null,2)+'\n');await rename(temp,path);}
  private sessionPath(id:string){return join(this.root,'sessions',`${safeId(id)}.json`);}
  private callPath(sessionId:string,callId:string){return join(this.root,'calls',safeId(sessionId),`${safeId(callId)}.json`);}
  async open(){
    const read=async(path:string)=>{try{return await readdir(path);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}};
    try{const state=JSON.parse(await readFile(join(this.root,'rounds.json'),'utf8'));this.deleted=new Map(state.deleted??[]);this.preferences=new Map(state.preferences??[]);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    for(const file of await read(join(this.root,'sessions')))if(file.endsWith('.json')){const value=JSON.parse(await readFile(join(this.root,'sessions',file),'utf8')) as CollaborationSession;if(this.deleted.has(value.id))continue;value.scope=parseScope(value.scope);this.sessions.set(value.id,value);
      for(const entry of await read(join(this.root,'calls',value.id)))if(entry.endsWith('.json')){const call=JSON.parse(await readFile(join(this.root,'calls',value.id,entry),'utf8')) as CallRecord;if(['accepted','running'].includes(call.state))call.state='uncertain';this.calls.set(`${value.id}/${call.callId}`,call);}
    }
  }
  register(tool:ExternalTool){ExternalToolDefinitionSchema.parse(tool.definition);if(this.tools.has(tool.definition.key))fail('TOOL_DUPLICATE',`Duplicate external tool: ${tool.definition.key}`);this.tools.set(tool.definition.key,tool);this.queryProviders.set(toolIdentity(tool.definition.key,tool.definition.version,tool.definition.provider),tool);}
  unregister(key:string){this.tools.delete(key);}
  catalog(){return structuredClone([...this.tools.values()].map(value=>value.definition));}
  private roundState(){return this.save(join(this.root,'rounds.json'),{deleted:[...this.deleted],preferences:[...this.preferences]});}
  lineage(id:string){const session=this.sessions.get(id)??this.deleted.get(id);if(!session)fail('SESSION_MISSING','The collaboration session does not exist.');return structuredClone(session!);}
  private terminal(id:string){return ![...this.sessions.values(),...this.deleted.values()].some(next=>next.reboundFrom===id);}
  active(projectId:string){const sessions=[...this.sessions.values()].filter(session=>session.projectId===projectId&&!session.ended&&this.terminal(session.id));if(sessions.length>1)fail('SESSION_AMBIGUOUS','Several unfinished rounds exist. Choose the intended round and end the others.');return sessions[0]?structuredClone(sessions[0]):null;}
  settings(projectId:string){return structuredClone(this.preferences.get(projectId)??[...this.sessions.values()].filter(session=>session.projectId===projectId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]?.scope??currentProjectScope());}
  valid(session:CollaborationSession){const current=this.binding();return !session.ended&&this.terminal(session.id)&&!!current&&current.projectId===session.projectId&&current.writeSessionId===session.writeSessionId;}
  list(){return structuredClone([...this.sessions.values()].map(session=>({...session,bindingValid:this.valid(session)})));}
  records(sessionId?:string){return structuredClone([...this.calls.values()].filter(call=>!sessionId||call.sessionId===sessionId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)));}
  history(input: CallHistoryQuery): CallHistoryPage {
    this.get(input.sessionId);
    const limit = Math.min(100, Math.max(1, Math.trunc(input.limit))), search = input.search?.trim().toLocaleLowerCase();
    const calls = [...this.calls.values()].filter(call => {
      if (call.sessionId !== input.sessionId || input.state && call.state !== input.state) return false;
      if (!search) return true;
      const tool = this.tools.get(call.tool)?.definition;
      const titles = tool ? ['zh-CN', 'en', 'ja'].map(locale => toolDisplay(tool, locale).title).join(' ') : '';
      return `${call.tool} ${titles} ${call.callId} ${call.error ?? ''}`.toLocaleLowerCase().includes(search);
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.callId.localeCompare(a.callId));
    const offset = Math.min(Math.max(0, Math.trunc(input.offset)), Math.max(0, Math.ceil(calls.length / limit) - 1) * limit);
    const items = calls.slice(offset, offset + limit).map((call): CallSummary => {
      const value = call.result && typeof call.result === 'object' && !Array.isArray(call.result) ? call.result : {};
      const nested = value.result && typeof value.result === 'object' && !Array.isArray(value.result) ? value.result : {};
      const documents = value.documents ?? nested.documents;
      const task = value.task && typeof value.task === 'object' && !Array.isArray(value.task) ? value.task : {};
      return { sessionId: call.sessionId, callId: call.callId, tool: call.tool, state: call.state, createdAt: call.createdAt, updatedAt: call.updatedAt, error: call.error?.slice(0, 400), summary: String(task.name ?? value.name ?? '').slice(0, 240), documentIds: Array.isArray(documents) ? documents.slice(0, 3).flatMap(document => { if (!document || typeof document !== 'object' || Array.isArray(document)) return []; const ref = document.ref; return typeof document.documentId === 'string' ? [document.documentId] : ref && typeof ref === 'object' && !Array.isArray(ref) && typeof ref.id === 'string' ? [ref.id] : []; }) : [] };
    });
    return { items, total: calls.length, offset, limit };
  }
  readCall(sessionId: string, callId: string): CallRecord {
    this.get(sessionId); const record = this.calls.get(`${sessionId}/${callId}`);
    if (!record) return fail('CALL_MISSING', 'The stored call does not exist.');
    return structuredClone(record);
  }
  get(id:string){const session=this.sessions.get(id);if(!session)fail(this.deleted.has(id)?'SESSION_ENDED':'SESSION_MISSING',this.deleted.has(id)?'This ended collaboration was deleted. Recover its original task through the owning module.':'The collaboration session does not exist.');return structuredClone(session!);}
  async handoffTarget(id:string,target:NonNullable<CollaborationSession['target']>){return this.serial(async()=>{const session=this.get(id);if(!this.valid(session))fail('BINDING_STALE','Connect to the current collaboration before handing off an author target.');session.target=structuredClone(target);await this.save(this.sessionPath(id),session);this.sessions.set(id,session);return structuredClone(target);});}
  async create(input:Omit<CollaborationSession,'id'|'scopeRevision'|'paused'|'createdAt'|'updatedAt'|'generations'|'sentRequests'>){return this.serial(async()=>{
    if(input.authorControlCallId){const previous=[...this.sessions.values()].find(session=>session.authorControlCallId===input.authorControlCallId);if(previous)return structuredClone(previous);}
    const active=this.active(input.projectId);if(active)return active;
    const scope=parseScope(input.scope);const now=new Date().toISOString();const session:CollaborationSession={...structuredClone(input),scope,id:createId(),scopeRevision:1,paused:false,createdAt:now,updatedAt:now,generations:0,sentRequests:[]};
    if(!this.valid(session))fail('BINDING_STALE','Create the collaboration in the current project.');await this.save(this.sessionPath(session.id),session);this.sessions.set(session.id,session);this.preferences.set(session.projectId,scope);await this.roundState();return structuredClone(session);
  });}
  async update(input:{id:string;expectedRevision:number;goal?:string;scope?:CollaborationSession['scope'];paused?:boolean}){return this.serial(async()=>{
    const session=this.get(input.id);if(session.scopeRevision!==input.expectedRevision)fail('SCOPE_CONFLICT','The collaboration scope has changed. Read it again.');
    if(session.ended)fail('SESSION_ENDED','This collaboration has ended. Create a new collaboration for new work.');
    if(!this.terminal(session.id))fail('BINDING_STALE','This identity was rebound. Explicitly connect to the current round.');
    if(input.scope)session.scope=parseScope(input.scope);if(input.goal!==undefined)session.goal=input.goal;if(input.paused!==undefined)session.paused=input.paused;
    if(!session.paused&&!this.valid(session))fail('BINDING_STALE','The original write session has expired. Rebind this collaboration.');session.scopeRevision++;session.updatedAt=new Date().toISOString();await this.save(this.sessionPath(session.id),session);this.sessions.set(session.id,session);this.preferences.set(session.projectId,session.scope);await this.roundState();return structuredClone(session);
  });}
  /** A reopened write session gets a new identity; original calls and quota facts retain theirs. */
  async rebind(input:{id:string;expectedRevision:number;writeSessionId:string;scope:CollaborationSession['scope'];authorControlCallId?:string;paused?:boolean}){return this.serial(async()=>{
    const previous=input.authorControlCallId?[...this.sessions.values()].find(session=>session.authorControlCallId===input.authorControlCallId):undefined;
    if(previous)return structuredClone(previous);
    const source=this.get(input.id),current=this.binding();
    if(source.scopeRevision!==input.expectedRevision)fail('SCOPE_CONFLICT','The collaboration scope changed. Review the current difference.');
    if(source.ended)fail('SESSION_ENDED','Ended collaborations cannot be rebound. Create a new collaboration for new work.');
    if(!this.terminal(source.id))fail('BINDING_STALE','This identity already has a successor. Explicitly connect to the current round.');
    if(!current||current.projectId!==source.projectId||current.writeSessionId!==input.writeSessionId)fail('BINDING_STALE','Open the original project before rebinding.');
    if(this.valid(source))fail('BINDING_CURRENT','The collaboration already has the current write binding. Resume it instead.');
    const scope=parseScope(input.scope),now=new Date().toISOString();
    const next:CollaborationSession={...source,id:createId(),writeSessionId:input.writeSessionId,scope,scopeRevision:1,paused:source.paused,ended:false,createdAt:now,updatedAt:now,authorControlCallId:input.authorControlCallId,reboundFrom:source.id};
    await this.save(this.sessionPath(next.id),next);this.sessions.set(next.id,next);return structuredClone(next);
  });}
  async end(input:{id:string;expectedRevision:number}){
    const session=await this.serial(async()=>{const session=this.get(input.id);if(!this.terminal(session.id))fail('BINDING_STALE','End the current successor of this round.');if(session.scopeRevision!==input.expectedRevision)fail('SCOPE_CONFLICT','The collaboration scope has changed. Read it again.');session.ended=true;session.paused=true;session.scopeRevision++;session.updatedAt=new Date().toISOString();await this.save(this.sessionPath(session.id),session);this.sessions.set(session.id,session);this.preferences.set(session.projectId,session.scope);await this.roundState();return structuredClone(session);});
    const ids=[session.id];let ancestor=session;while(ancestor.reboundFrom){ids.push(ancestor.reboundFrom);ancestor=this.get(ancestor.reboundFrom);}await Promise.allSettled([...this.inFlight.entries()].filter(([key])=>ids.some(id=>key.startsWith(`${id}/`))).map(([,work])=>work));return session;
  }
  async deleteEnded(input:{id:string;expectedRevision:number},beforeDelete?:(sessions:CollaborationSession[])=>Promise<void>){return this.serial(async()=>{
    const session=this.get(input.id);if(!session.ended||!this.terminal(session.id))fail('SESSION_NOT_ENDED','Delete the ended current identity of this round.');if(session.scopeRevision!==input.expectedRevision)fail('SCOPE_CONFLICT','The collaboration changed. Read it again.');
    const ids:string[]=[];let cursor:ReturnType<CollaborationService['lineage']>|undefined=session;
    while(cursor){ids.push(cursor.id);cursor=cursor.reboundFrom?this.lineage(cursor.reboundFrom):undefined;}
    if([...this.inFlight.keys()].some(key=>ids.some(id=>key.startsWith(`${id}/`))))fail('SESSION_BUSY','Wait for accepted calls to settle before deleting this ended round.');
    await beforeDelete?.(ids.map(id=>this.get(id)));
    for(const id of ids){const current=this.get(id);this.deleted.set(id,{id,projectId:current.projectId,...(current.reboundFrom?{reboundFrom:current.reboundFrom}:{}),ended:true});}
    this.preferences.set(session.projectId,session.scope);await this.roundState();
    for(const id of ids){await rm(this.sessionPath(id),{force:true});await rm(join(this.root,'calls',safeId(id)),{recursive:true,force:true});this.sessions.delete(id);for(const key of this.calls.keys())if(key.startsWith(`${id}/`))this.calls.delete(key);}
    return {sessionIds:ids};
  });}
  check(context:CollaborationContext, tool:string, constraint:Constraint){
    const session=this.get(context.sessionId);if(session.projectId!==context.projectId||session.writeSessionId!==context.writeSessionId)fail('BINDING_STALE','The call is bound to another project or write session.');
    if(session.ended)fail('SESSION_ENDED','This collaboration has ended. Query original call IDs or create a new collaboration.');
    const mutation=constraint.effects.some(effect=>['edit','import','generate','adopt'].includes(effect));
    if(!this.valid(session))fail('BINDING_STALE','The target write session has closed. Explicitly connect with galcraft_collaboration.');
    if(mutation&&context.callId==='read')fail('CALL_ID_REQUIRED','Mutations require a stable callId.');
    if(mutation&&session.paused)fail('SESSION_PAUSED','The collaboration is paused. Accepted calls and original remote outputs remain queryable.');
    if(session.scope.mode==='currentProject')return;
    if(!session.scope.tools.includes(tool))fail('TOOL_SCOPE',`Tool ${tool} is outside the current scope. Review a scope change with galcraft_collaboration.`);
    for(const id of constraint.documents??[])if(!session.scope.documents.includes(id)&&!this.binding()?.createdDocuments?.(session.id).includes(id))fail('DOCUMENT_SCOPE',`Document ${id} is outside the current scope. Review the complete impact and a scope change with galcraft_collaboration.`);
    for(const kind of constraint.createKinds??[])if(!session.scope.createKinds.includes(kind))fail('CREATE_SCOPE',`Creating ${kind} is outside the current scope.`);
    for(const [value,allowed,label] of [[constraint.operation,session.scope.operations,'operation'],[constraint.connectionId,session.scope.connectionIds,'connection'],[constraint.model,session.scope.models,'model'],[constraint.workflowId,session.scope.workflowIds,'workflow']] as const)
      if(value!==undefined&&!allowed.includes(value))fail('PRODUCTION_SCOPE',`The ${label} ${value} is outside the current scope.`);
  }
  async authorize(context:CollaborationContext,tool:string,constraint:Constraint,requestId?:string){return this.serial(async()=>{
    this.check(context,tool,constraint);const session=this.get(context.sessionId);if(!requestId){if(constraint.effects.includes('generate')&&session.scope.maxGenerations!==null&&session.generations>=session.scope.maxGenerations)fail('GENERATION_LIMIT','The generation quota is exhausted. Querying and refetching original outputs remain available.');return;}if(session.sentRequests.includes(requestId))return;
    if(session.scope.maxGenerations!==null&&session.generations>=session.scope.maxGenerations)fail('GENERATION_LIMIT','The generation quota is exhausted. Querying and refetching original outputs remain available.');
    session.generations++;session.sentRequests.push(requestId);session.updatedAt=new Date().toISOString();await this.save(this.sessionPath(session.id),session);this.sessions.set(session.id,session);
  });}
  /** Internal consumers can read provider data directly; MCP always uses invoke's persisted receipt. */
  async call(toolKey:string,input:Json,sessionId:string,callId?:string):Promise<Json>{
    const record=await this.invoke(toolKey,input,sessionId,callId);
    const mutation=this.tools.get(toolKey)!.constraints(input).effects.some(effect=>['edit','import','generate','adopt'].includes(effect));
    if(mutation)return record as unknown as Json;
    if(record.error)throw new CollaborationError(record.state==='uncertain'?'CALL_UNCERTAIN':'CALL_FAILED',record.error);
    return record.result ?? null;
  }
  async invoke(toolKey:string,input:Json,sessionId:string,callId?:string,requestSignal?:AbortSignal):Promise<CallRecord>{
    const tool=this.tools.get(toolKey);if(!tool)fail('TOOL_MISSING',`Tool ${toolKey} is not currently available.`);
    const checked=validateToolData(tool!.definition.inputSchema,input);if(!checked.success){
      const errors='issues' in checked.error?checked.error.issues:[];
      throw new CollaborationError('TOOL_INPUT',checked.error.message,{code:'TOOL_INPUT',message:'The input does not match the selected authoritative contract.',severity:'error',owner:'M12',related:[],actions:['edit'],details:{applied:false,validation:errors.map(item=>({path:item.path.map(String).join('.'),message:item.message,expected:'expected' in item?String(item.expected):item.message})),next:'Read the selected exact contract, correct the indicated fields and use a new callId.'}});
    }
    const session=this.get(sessionId),context:CollaborationContext={sessionId,callId:callId??'read',scopeRevision:session.scopeRevision,projectId:session.projectId,writeSessionId:session.writeSessionId,toolKey:toolKey,projectRoot:session.projectRoot};
    const constraint=tool!.constraints(input),mutation=constraint.effects.some(effect=>['edit','import','generate','adopt'].includes(effect));
    if(mutation&&!callId)fail('CALL_ID_REQUIRED','Editing, importing, adopting and generating require a stable callId.');callId??=createId();safeId(callId);context.callId=callId;const key=`${sessionId}/${callId}`;
    const registration=await this.serial(async()=>{
      this.check(context,toolKey,constraint);
      const previous=this.calls.get(key);if(previous){if(previous.tool!==toolKey||!isDeepStrictEqual(previous.input,input))fail('CALL_CONFLICT','This callId was already used for different input. Use a new callId for a new action.');return {record:previous,fresh:false};}
      const now=new Date().toISOString();const record:CallRecord={sessionId,callId:callId!,tool:toolKey,version:tool!.definition.version,provider:tool!.definition.provider,input:structuredClone(input),context,state:'accepted',createdAt:now,updatedAt:now};
      await this.save(this.callPath(sessionId,callId!),record);this.calls.set(key,record);return {record,fresh:true};
    });
    if(this.inFlight.has(key))return tool!.definition.async?structuredClone(this.calls.get(key)!):await this.inFlight.get(key)!;
    if(!registration.fresh)return await this.query(sessionId,callId!);
    const controller=new AbortController(),abort=()=>controller.abort(requestSignal?.reason);if(requestSignal?.aborted)abort();else requestSignal?.addEventListener('abort',abort,{once:true});this.controllers.set(key,controller);
    const work=(async()=>{const record=registration.record;try{record.state='running';await this.save(this.callPath(sessionId,callId!),record);const result=await tool!.execute(input,context,value=>this.check(context,toolKey,value),controller.signal);if(!validOutput(tool!,input,result)){record.errorCode='TOOL_OUTPUT';throw new Error('The provider result does not match the declared action schema. Query the original call before taking another action.');}record.result=result;record.state='completed';}
      catch(error){record.state=!mutation||error instanceof CollaborationError?'failed':'uncertain';record.issue=issueFromError(error,'M12');record.error=issueSummary(record.issue);record.errorCode??=error instanceof CollaborationError?error.code:record.issue.code==='UNKNOWN_ERROR'?'TOOL_EXECUTION':record.issue.code;delete record.result;}
      record.finishedAt=record.updatedAt=new Date().toISOString();await this.save(this.callPath(sessionId,callId!),record);return structuredClone(record);
    })().finally(()=>{requestSignal?.removeEventListener('abort',abort);this.inFlight.delete(key);this.controllers.delete(key);});this.inFlight.set(key,work);if(tool!.definition.async)return structuredClone(registration.record);return await work;
  }
  async cancel(sessionId:string,callId:string){const record=this.calls.get(`${sessionId}/${callId}`);if(!record)fail('CALL_MISSING','The call record does not exist.');const controller=this.controllers.get(`${sessionId}/${callId}`);const status=['completed','failed','cancelled'].includes(record!.state)?'alreadyFinished':!this.tools.get(record!.tool)?.definition.cancel?'unsupported':controller?'requested':'alreadyFinished';if(status==='requested')controller?.abort();return {sessionId,callId,status};}
  async close(){await Promise.allSettled(this.inFlight.values());await this.tail;}
  async query(sessionId:string,callId:string):Promise<CallRecord>{
    const record=this.calls.get(`${sessionId}/${callId}`);if(!record)fail('CALL_MISSING','The call record does not exist.');
    if(this.inFlight.has(`${sessionId}/${callId}`))return structuredClone(record!);
    const tool=this.queryProviders.get(toolIdentity(record!.tool,record!.version,record!.provider));
    if(tool&&!['failed','cancelled'].includes(record!.state)){
      try {
        const result=await tool.lookup?.(record!.context,record!.input,record!.result);
        if(result!==undefined){if(!validOutput(tool,record!.input,result))throw new CollaborationError('TOOL_OUTPUT','The recovered provider result does not match the original action schema. Verify the original business state before retrying.');if(record!.state!=='completed')record!.finishedAt??=new Date().toISOString();record!.result=result;record!.state='completed';delete record!.error;delete record!.errorCode;delete record!.issue;}
        if(record!.result!==undefined&&!validOutput(tool,record!.input,record!.result))throw new CollaborationError('TOOL_OUTPUT','The stored result does not match the public schema. Verify the original call.');
      } catch(error) {record!.state='uncertain';record!.issue=issueFromError(error,'M12');record!.error=issueSummary(record!.issue);record!.errorCode=error instanceof CollaborationError?error.code:'TOOL_RECOVERY';delete record!.result;}
      record!.updatedAt=new Date().toISOString();await this.save(this.callPath(sessionId,callId),record);
    }
    return structuredClone(record!);
  }
}
