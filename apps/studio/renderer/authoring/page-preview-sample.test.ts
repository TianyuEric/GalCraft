import { describe, expect, it } from 'vitest';
import { SnapshotSchema, type LongTerm, type Result } from '@galcraft/contracts';
import { FixtureSnapshot } from '@galcraft/contracts/fixtures';
import { SessionController } from '../../../../packages/runtime/src/index.js';
import { pagePreviewSample } from './page-preview-sample.js';

const ok=<T>(value:T):Result<T>=>({ok:true,value,warnings:[]});
async function run(page:'story'|'choice'|'input',sample='normal') {
  const original=structuredClone(FixtureSnapshot);
  original.scenes[0]!.instructions[0]!.opcode='wait';original.scenes[0]!.instructions[0]!.args={durationMs:60000};
  const snapshot=SnapshotSchema.parse(pagePreviewSample(original,original.template,page,sample));
  let longTerm:LongTerm={schemaVersion: 2,revision:0,readStatements:[],endings:[],cg: {}, music: [], video: [],flowEntries:{},variables:{},plugins:{}};
  const session=new SessionController({contributions:{commands:[],conditions:[],documents:[],tools:[],resources:[],stages:[],pages:[],components:[],systems:[],platform:[]},
    stage:{prepare:async input=>ok({state:input.state,delta:null})},longTerm:{current:()=>longTerm,prepareFlowUnlocks:input=>ok({sessionId:input.sessionId,snapshotId:input.snapshot.snapshotId,sequence:input.sequence,expectedLongTermRevision:input.longTermAfter.revision,entries:[]}),
      commitRuntimeLongTerm:async input=>{longTerm={...input.next,revision:input.next.revision+1};return ok({revision:longTerm.revision});}}});
  const scene=snapshot.scenes.find(scene=>scene.scene.id===snapshot.project.entry.sceneId)!;
  const position={sceneId:scene.scene.id,statementId:scene.instructions[0]!.statementId};
  const prepared=await session.prepareSession({snapshot,domain:{projectId:snapshot.projectId,kind:'sample',instance:'page-test'},source:{kind:'entry',scenario:{schemaVersion:1,id:crypto.randomUUID(),name:'Page sample',projectId:snapshot.projectId,entry:position,target:position,initialProgress:{},pluginInitial:{},route:[],playerInputs:[],externalPolicy:'simulate',engineVersion:snapshot.engineVersion,pluginVersions:[]}},target:null});
  if(!prepared.ok)throw prepared.error;expect(session.activate(prepared.value.id).ok).toBe(true);
  const started=await session.start();if(!started.ok)throw started.error;
  return {session,snapshot,original};
}
describe('independent page preview states',()=>{
  it('enters three actual choices even when the author opening waits on media or a timer',async()=>{
    const {session}=await run('choice');const inspection=session.inspect()!;
    expect(inspection.state.wait).toMatchObject({kind:'choice',optionIds:expect.any(Array)});
    if(inspection.state.wait?.kind!=='choice')throw new Error('Choice wait missing');
    expect(inspection.state.wait.optionIds).toHaveLength(3);
    const selected=await session.dispatch({kind:'choose',token:inspection.token!,optionId:inspection.state.wait.optionIds[0]!});
    expect(selected.ok).toBe(true);expect(session.inspect()?.state.wait?.kind).toBe('say');
  });
  it('creates locked choice state and empty choice state from real option availability',async()=>{
    const locked=(await run('choice','locked')).session.inspect()!.state.wait;
    expect(locked).toMatchObject({kind:'choice',optionIds:expect.any(Array),visibleOptionIds:expect.any(Array)});
    if(locked?.kind!=='choice')throw new Error('Choice wait missing');
    expect(locked.optionIds).toHaveLength(2);expect(locked.visibleOptionIds).toHaveLength(3);
    expect((await run('choice','empty')).session.inspect()!.state.wait).toMatchObject({kind:'choice',optionIds:[]});
  });
  it('enters Japanese long dialogue and input without altering the author snapshot',async()=>{
    const {session,snapshot,original}=await run('story','ja');
    expect(session.inspect()!.state.wait?.kind).toBe('say');expect(session.inspect()!.state.presentation.text.text).toContain('雨がやみました');
    expect(snapshot.project.languages.menuDefault).toBe('ja');expect(original.scenes[0]!.instructions[0]!.opcode).toBe('wait');
    expect((await run('input')).session.inspect()!.state.wait?.kind).toBe('input');
  });
});
