import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DefaultTimeoutSecByPurpose, NativeAnimationSchema, resolveAnimationGeneration, type AnimationGenerationRequest, type ConnectionConfig } from '@galcraft/contracts';
import { createPlugin, preparation } from './services.js';
import {HttpGenerationAdapter} from '@galcraft/generation-services';
import type {GenerationAdapter} from '@galcraft/contracts';
const createAdapter=(credentials?:{read(id:string):Promise<string|null>},fetcher?:typeof fetch):GenerationAdapter=>{const adapter=new HttpGenerationAdapter({credential:id=>credentials?.read(id)??Promise.resolve(null),fetch:fetcher,probe:async()=>({metadata:{}})});return {...adapter,inspect:(config,purpose)=>adapter.inspect(config,purpose),query:(ref,ctx)=>adapter.query(ref,ctx),fetch:(ref,output,ctx)=>adapter.fetch(ref,output,ctx),cancel:(ref,ctx)=>adapter.cancel(ref,ctx),async *submit(input,ctx){let text='';try{const prepared=preparation.prepare(input);for await(const event of adapter.submit(prepared,ctx)){if(event.kind==='textDelta')text+=event.text;if(event.kind==='output'){const raw=event.artifacts.find(artifact=>artifact.kind==='text');const content=raw?await readFile(raw.localPath,'utf8'):text;yield {...event,artifacts:await preparation.process(content,input,ctx)};}else yield event;}}catch(error){yield {kind:'error',remoteStatus:'failed',issue:{code:'PREPARATION',message:String(error),severity:'error',owner:'M10',related:[],actions:[]}};}}};};
import { operationId } from './definition.js';
const animation = NativeAnimationSchema.parse({ type: 'galcraft.animation', version: 1, durationMs: 1000, tracks: [
  { path: '/y', mode: 'add', keyframes: [{ timeMs: 0, value: 0 }, { timeMs: 500, value: -40 }, { timeMs: 1000, value: 0 }] },
  { path: '/x', mode: 'add', keyframes: [{ timeMs: 1000, value: 30 }] },
] });
const request: AnimationGenerationRequest = { instruction: '跳得更高，时长不变', mode: 'patch', currentAnimation: animation, paths: ['/y'], range: null, preserveDuration: true, allowDelete: false, targetContext: '图片立绘 / center', assetId: null, assetRevision: null };
const model = structuredClone(animation); model.tracks[0]!.keyframes[1]!.value = -120; model.tracks[1]!.keyframes[0]!.value = 999;
const config: ConnectionConfig = { id: 'Conn01', revision: 4, name: 'Existing text connection', protocol: 'chatCompletions', baseUrl: 'https://configured.example/v1', model: 'configured-model', credentialId: 'Secret', auth: 'bearer', apiKeyHeader: null, purposes: ['text', operationId], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: { request: { temperature: .4 } }, workflowBindingId: null, serverFileRoot: null };
const roots: string[] = []; afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
it('preserves every unselected track and outside-range keyframe and rejects unrequested duration or deletion', () => {
  const result = resolveAnimationGeneration(model, request); expect(result.tracks[1]).toEqual(animation.tracks[1]); expect(result.tracks[0]!.keyframes[1]!.value).toBe(-120);
  const scoped = resolveAnimationGeneration(model, { ...request, range: { startMs: 400, endMs: 600 } }); expect(scoped.tracks[0]!.keyframes[0]).toEqual(animation.tracks[0]!.keyframes[0]); expect(scoped.tracks[0]!.keyframes[2]).toEqual(animation.tracks[0]!.keyframes[2]);
  expect(() => resolveAnimationGeneration({ ...model, durationMs: 2000 }, request)).toThrow('duration');
  expect(() => resolveAnimationGeneration({ animation: model, deletePaths: ['/x'] }, request)).toThrow('deletion');
  expect(() => resolveAnimationGeneration({ ...model, tracks: [{ path: '/unknown', keyframes: [{ timeMs: 0, value: 1 }] }] }, request)).toThrow();
});
it('sends one request with the frozen configured endpoint/model and reads the existing credential reference', async () => {
  const root = await mkdtemp(join(tmpdir(), 'galcraft-gca-')); roots.push(root); let posts = 0, credentials = 0;
  const adapter = createAdapter({ read: async id => { expect(id).toBe('Secret'); credentials++; return 'fixture-secret'; } }, async (url, init) => {
    posts++; expect(url).toBe('https://configured.example/v1/chat/completions'); expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer fixture-secret');
    const body = JSON.parse(String(init!.body)); expect(body.model).toBe('configured-model'); expect(body.temperature).toBe(.4); expect(body.stream).toBe(false);
    expect(JSON.parse(body.messages[1].content)).toEqual(request);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ animation: model, deletePaths: [] }) } }], usage: { total_tokens: 100 } }), { headers: { 'content-type': 'application/json' } });
  });
  const events = []; for await (const event of adapter.submit({ purpose: operationId, fields: request as unknown as Record<string, import('@galcraft/contracts').Json>, references: [] }, { config, requestId: 'Req001', directory: root, workflow: null, signal: new AbortController().signal })) events.push(event);
  const output = events.find(event => event.kind === 'output'); expect(output?.kind).toBe('output'); if (output?.kind !== 'output') throw new Error(JSON.stringify(events));
  const result = JSON.parse(await readFile(output.artifacts[0]!.localPath, 'utf8')); expect(result.tracks[1]).toEqual(animation.tracks[1]); expect(posts).toBe(1); expect(credentials).toBe(1);
});
it('validates frozen scope before sending', async () => {
  let posts = 0; const adapter = createAdapter(undefined, async () => { posts++; throw new Error('No request expected'); });
  const events = []; for await (const event of adapter.submit({ purpose: operationId, fields: { ...request, paths: [] } as unknown as Record<string, import('@galcraft/contracts').Json>, references: [] }, { signal: new AbortController().signal } as never)) events.push(event);
  expect(posts).toBe(0); expect(events[0]?.kind).toBe('error');
});
it('retains invalid service output for M10 candidate validation without another request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'galcraft-gca-')); roots.push(root); let posts = 0;
  const raw = '{"type":"galcraft.animation","tracks":[{"path":"/not-supported"}]}';
  const adapter = createAdapter({ read: async () => 'fixture' }, async () => { posts++; return new Response(JSON.stringify({ choices: [{ message: { content: raw } }] })); });
  const events = []; for await (const event of adapter.submit({ purpose: operationId, fields: request as unknown as Record<string, import('@galcraft/contracts').Json>, references: [] }, { config, requestId: 'ReqBad', directory: root, workflow: null, signal: new AbortController().signal })) events.push(event);
  const output = events.find(event => event.kind === 'output'); if (output?.kind !== 'output') throw new Error(JSON.stringify(events));
  expect(await readFile(output.artifacts[0]!.localPath, 'utf8')).toBe(raw);
  expect(output.artifacts[0]!.metadata).toMatchObject({ originalAnimation: animation, validationError: expect.any(String) });
  expect(posts).toBe(1); expect(request.currentAnimation).toEqual(animation);
});
it('reports cancellation of the submitted synchronous request as unknown and never resends', async () => {
  let posts = 0; const abort = new AbortController();
  const adapter = createAdapter({ read: async () => 'fixture' }, async (_url, init) => { posts++; return new Promise((_resolve, reject) => { init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true }); abort.abort(new Error('Author cancelled')); }); });
  const events = []; for await (const event of adapter.submit({ purpose: operationId, fields: request as unknown as Record<string, import('@galcraft/contracts').Json>, references: [] }, { config, requestId: 'ReqCan', directory: '', workflow: null, signal: abort.signal })) events.push(event);
  expect(events.at(-1)).toMatchObject({kind:'error',remoteStatus:'unknown'});expect(events.filter(event=>event.kind==='output')).toHaveLength(0);
  expect(await adapter.cancel({} as never, {} as never)).toEqual({ local: 'stopped', remote: 'unsupported' }); expect(posts).toBe(1);
});

it('checks the complete current asset before preparing a patch and rejects omitted unselected tracks',async()=>{
  const plugin=createPlugin(),asset={id:'Anim01',kind:'animation',revision:3,activeVariantId:'Vari01'};
  const offered=await plugin.activate({assets:{get:async()=>({ok:true,warnings:[],value:asset}),resolve:async()=>({ok:true,warnings:[],value:{entry:'source.gca'}}),readText:async()=>JSON.stringify(animation)}} as never);
  try{const provider=offered.textPreparations![0]!,input={purpose:operationId,fields:{...request,assetId:'Anim01',assetRevision:3},references:[]};
    expect((await provider.validateInput!(input)).ok).toBe(true);
    const omitted=await provider.validateInput!({...input,fields:{...input.fields,currentAnimation:{...animation,tracks:[animation.tracks[0]!]}}});expect(omitted).toMatchObject({ok:false,error:{code:'ANIMATION_SOURCE',message:expect.stringContaining('complete current asset')}});
    expect((await provider.validateInput!({...input,fields:{...input.fields,assetRevision:2}})).ok).toBe(false);
  }finally{await plugin.deactivate();}
});
