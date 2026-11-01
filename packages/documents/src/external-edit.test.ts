import {expect,it} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectSession} from './index.js';
import type {CollaborationContext,EditInput} from '@galcraft/contracts';
it('persists the working version with its external receipt and recovers it without repeating an edit',async()=>{
  const root=await mkdtemp(join(tmpdir(),'external-edit-')),path=join(root,'project');
  const context:CollaborationContext={projectId:'Proj01',writeSessionId:'Write1',sessionId:'Sess01',callId:'edit-1',scopeRevision:1};
  let session=await ProjectSession.createProject(path,'Proj01',[{documentId:'Doc001',revision:1,format:'json',files:{'project.json':JSON.stringify({schemaVersion:1,documentId:'Doc001',revision:1,data:{title:'before'}})}}]);
  try{const expected=[{ref:{kind:'document' as const,id:'Doc001'},revision:1}];const input:EditInput={label:'外部修改',origin:'plugin',expected,preparedAssets:[],requiredRefs:[],patches:[{kind:'json',documentId:'Doc001',changes:[{path:'/data/title',op:'set',before:'before',after:'after'}]}]};
    const plan=await session.prepareExternalEdit(input,context);if(!plan.ok)throw new Error(plan.error.message);const receipt=await session.applyExternalEdit(plan.value.planId,expected,context);expect(receipt.ok).toBe(true);expect(session.operations).toHaveLength(1);expect(await session.applyExternalEdit(plan.value.planId,expected,context)).toEqual(receipt);expect(session.operations).toHaveLength(1);
    expect(JSON.parse(await readFile(join(path,'project.json'),'utf8')).data.title).toBe('before');
    // Lose the later result journal; the atomically persisted recovery image still owns the result.
    await rm(join(path,'.galcraft/external-results.json'));const reopened=await ProjectSession.open(path,'Proj01');expect(await reopened.lookupExternalCall(context)).toEqual(receipt);expect(await reopened.applyExternalEdit(plan.value.planId,expected,context)).toEqual(receipt);await reopened.dispose('discard');
  }finally{await session.dispose('discard');await rm(root,{recursive:true,force:true});}
});
