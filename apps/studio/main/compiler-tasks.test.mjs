import {expect,it} from 'vitest';
import {CompilerTasks} from './compiler-tasks.mjs';

it('reports a missing worker result as a compile failure and retains the valid snapshot',async()=>{
  const compiler=new CompilerTasks({start:async()=>({ok:true,value:undefined})});
  expect(await compiler.compile({projectId:'Work01',cancelOperationId:'Empty1'})).toMatchObject({ok:false,error:{code:'WORKER_RESULT_MISSING'}});
  expect(compiler.lastValid('Work01').value).toBe(null);
});

it('keeps independent checks and previews from superseding the editor compilation and gives each its own frozen result',async()=>{
  const pending=new Map(),compiler=new CompilerTasks({start:request=>new Promise(resolve=>pending.set(request.operationId,resolve))});
  const oldInput={projectId:'Work01',cancelOperationId:'Old001'},independentInput={projectId:'Work01',cancelOperationId:'Ind001'},newInput={projectId:'Work01',cancelOperationId:'New001'};
  const old=compiler.compile(oldInput),independent=compiler.compile(independentInput,{publish:false}),current=compiler.compile(newInput);
  pending.get('New001')({ok:true,value:{current:true,snapshot:{snapshotId:'New001'},issues:[]}});expect((await current).value.snapshot.snapshotId).toBe('New001');
  pending.get('Ind001')({ok:true,value:{current:true,snapshot:{snapshotId:'Ind001'},issues:[]}});expect((await independent).value).toMatchObject({current:true,snapshot:{snapshotId:'Ind001'}});
  pending.get('Old001')({ok:true,value:{current:true,snapshot:{snapshotId:'Old001'},issues:[]}});expect((await old).value).toMatchObject({current:false,snapshot:null});expect(compiler.lastValid('Work01').value.snapshotId).toBe('New001');expect(compiler.currentInput('Work01')).toEqual(newInput);
});
