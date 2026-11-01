import { describe,expect,it } from 'vitest';
import type { DocumentView,SavePlan } from '@galcraft/contracts';
import { FixtureIds } from '@galcraft/contracts/fixtures';
import { applyTextEdits,parse,patchFields } from '@galcraft/dsl';
import { buildSaveChanges,compactSourceDiff,scriptChanges } from './save-changes.js';

const id=FixtureIds.streetDocument, first=FixtureIds.statements[0]!,second=FixtureIds.statements[1]!,third=FixtureIds.statements[2]!;
const say=(statementId:string,text:string,extra='')=>`say {speaker:{kind:"narrator"},text:${JSON.stringify(text)}${extra}} @${statementId};\n`;
const cardSay=(statementId:string,text:string)=>`say ${JSON.stringify({speaker:{kind:'narrator'},text})} @${statementId};\n`;
const dialogueSay=(statementId:string,text:string)=>`say {speaker: ${JSON.stringify({kind:'narrator'})}, text: ${JSON.stringify(text)}} @${statementId};\n`;
describe('logical save changes',()=>{
  it('groups metadata and script files and compares the saved statements with the latest fields',()=>{
    const meta=`scenes/${FixtureIds.street}/scene.json`,script=`scenes/${FixtureIds.street}/script.gal`;
    const savedFiles={[meta]:JSON.stringify({revision:1,data:{name:'旧场景'}}),[script]:say(first,'原句')};
    const files={[meta]:JSON.stringify({revision:4,data:{name:'新场景'}}),[script]:say(first,'最终正文',', keepName: true')};
    const document:DocumentView={documentId:id,revision:4,savedRevision:1,format:'dsl',dirty:true,files,savedFiles};
    const planned:SavePlan['files']=[meta,script].map(path=>({path,documentId:id,oldExists:true,newExists:true}));
    const groups=buildSaveChanges(planned,[document],{[id]:'新场景'});
    expect(groups).toHaveLength(1);expect(groups[0]!.paths).toEqual([meta,script]);expect(groups[0]!.changes).toHaveLength(2);
    expect(groups[0]!.changes[1]).toMatchObject({kind:'update',statementId:first,fields:[{field:'text',before:'原句',after:'最终正文'},{field:'keepName',after:true}]});
  });
  it('recognizes additions, deletions and moves without counting position shifts as moves',()=>{
    expect(scriptChanges(id,say(first,'甲')+say(second,'乙'),cardSay(third,'新')+say(first,'甲')+say(second,'乙'),'zh-CN').map(item=>item.kind)).toEqual(['add']);
    expect(scriptChanges(id,say(first,'甲')+say(second,'乙')+say(third,'丙'),say(third,'丙')+say(first,'甲'),'zh-CN').map(item=>item.kind)).toEqual(['delete','move']);
    const withComment=say(first,'甲')+'// 第一条说明\n';
    expect(scriptChanges(id,withComment+say(second,'乙')+say(third,'丙'),say(third,'丙')+withComment,'zh-CN').map(item=>item.kind)).toEqual(['delete','move']);
    expect(scriptChanges(id,say(first,'甲')+say(second,'乙'),'\n','zh-CN').map(item=>item.kind)).toEqual(['delete','delete']);
    expect(scriptChanges(id,say(first,'甲')+say(second,'乙').trimEnd(),say(second,'乙')+say(first,'甲').trimEnd(),'zh-CN').map(item=>item.kind)).toEqual(['move']);
  });
  it.each(['comment','formatting'])('retains %s alongside changed statement fields',kind=>{
    const before=say(first,'原句'),updated=say(first,'最终正文');
    const after=kind==='comment'?`// 作者注释\n${updated}`:updated.replace('text:', 'text : ');
    const changes=scriptChanges(id,before,after,'zh-CN');
    expect(changes.map(item=>item.kind)).toEqual(['update','source']);
    expect(changes[0]).toMatchObject({statementId:first,fields:[{field:'text',before:'原句',after:'最终正文'}]});
    expect(changes[1]).toMatchObject({before,after});
  });
  it('shows ordinary DSL field patches without a redundant source change',()=>{
    const before=say(first,'原句'),parsed=parse({documentId:id,revision:0,text:before});
    const patched=patchFields(parsed,{documentId:id,revision:0,statementIds:[first],changes:[{field:'text',op:'set',value:'最终正文'},{field:'keepName',op:'set',value:true}]});
    if(!patched.ok)throw new Error(patched.error.message);
    expect(scriptChanges(id,before,applyTextEdits(before,patched.value),'zh-CN').map(item=>item.kind)).toEqual(['update']);
  });
  it('retains whitespace outside a field-edited statement',()=>{
    expect(scriptChanges(id,say(first,'原句'),say(first,'最终正文')+'\n','zh-CN').map(item=>item.kind)).toEqual(['update','source']);
    expect(scriptChanges(id,say(first,'原句')+say(second,'乙'),say(second,'乙')+say(first,'最终正文')+'\n','zh-CN').map(item=>item.kind)).toEqual(['move','update','source']);
  });
  it.each([[false,'// 新注释\n'],[false,'\n'],[true,'// 新注释\n'],[true,'\n']])('retains inserted-statement trivia with field edit %s and suffix %j',(updated,suffix)=>{
    const before=say(first,'原句'),inserted=`say ${JSON.stringify({speaker:{kind:'narrator'},text:'新增句'})} @${second};\n`;
    const after=say(first,updated?'最终正文':'原句')+inserted+suffix;
    const changes=scriptChanges(id,before,after,'zh-CN');
    expect(changes.map(item=>item.kind)).toEqual(updated?['update','add','source']:['add','source']);
    expect(changes.at(-1)).toMatchObject({before,after});
  });
  it('shows a plain card insertion as an addition without redundant source',()=>{
    const before=say(first,'原句'),inserted=`say ${JSON.stringify({speaker:{kind:'narrator'},text:'新增句'})} @${second};\n`;
    for(const [saved,current] of [[before,before+inserted],[before,inserted+before],['',inserted]])expect(scriptChanges(id,saved!,current!,'zh-CN').map(item=>item.kind)).toEqual(['add']);
  });
  it.each([
    ['object block comment',`say {/* 新注释 */ text:"新增"} @${second};\n`],
    ['object line comment',`say { // 新注释\n text:"新增"} @${second};\n`],
    ['nested block comment',`say {speaker:{/* 说话者说明 */ kind:"narrator"},text:"新增"} @${second};\n`],
    ['manual layout',cardSay(second,'新增').replace('{"speaker":','{\n  "speaker" : ')],
  ])('retains inserted-statement %s alongside logical changes',(_,inserted)=>{
    const before=say(first,'原句'),after=say(first,'新句')+inserted;
    expect(scriptChanges(id,before,after,'zh-CN').map(item=>item.kind)).toEqual(['update','add','source']);
    expect(scriptChanges(id,'',inserted!,'zh-CN').map(item=>item.kind)).toEqual(['add','source']);
  });
  it('keeps generated insertions with comment markers inside strings as additions',()=>{
    const text='正文 // 标记和 /* 文本 */ 都属于字符串';
    for(const inserted of [cardSay(second,text),dialogueSay(second,text)])expect(scriptChanges(id,'',inserted,'zh-CN').map(item=>item.kind)).toEqual(['add']);
  });
  it('keeps a generated insertion followed by ordinary field edits as an addition',()=>{
    for(const inserted of [cardSay(second,'原句'),dialogueSay(second,'原句')]) {
      const parsed=parse({documentId:id,revision:0,text:inserted});
      const patched=patchFields(parsed,{documentId:id,revision:0,statementIds:[second],changes:[{field:'text',op:'set',value:'新句'},{field:'speaker',op:'set',value:{kind:'character',id:FixtureIds.an}},{field:'append',op:'set',value:true}]});
      if(!patched.ok)throw new Error(patched.error.message);
      expect(scriptChanges(id,'',applyTextEdits(inserted,patched.value),'zh-CN').map(item=>item.kind)).toEqual(['add']);
    }
  });
  it('keeps the saved source layout when copying a plain statement',()=>{
    const before=say(first,'原句');
    expect(scriptChanges(id,before,before+say(second,'原句'),'zh-CN').map(item=>item.kind)).toEqual(['add']);
  });
  it('retains comments removed by an array field patch',()=>{
    const option={id:third,text:'原选项',target:{sceneId:FixtureIds.street,labelId:null}};
    const before=`choose {options:[/* 选项说明 */ ${JSON.stringify(option)}]} @${first};\n`,parsed=parse({documentId:id,revision:0,text:before});
    const patched=patchFields(parsed,{documentId:id,revision:0,statementIds:[first],changes:[{field:'options',op:'set',value:[{...option,text:'新选项'}]}]});
    if(!patched.ok)throw new Error(patched.error.message);
    expect(scriptChanges(id,before,applyTextEdits(before,patched.value),'zh-CN').map(item=>item.kind)).toEqual(['update','source']);
  });
  it('retains explicit default fields and invalid source as real readable changes',()=>{
    expect(scriptChanges(id,say(first,'甲'),say(first,'甲',',keepName:false'),'zh-CN')[0]).toMatchObject({kind:'update',fields:[{field:'keepName',before:undefined,after:false}]});
    const invalid='say {text:"未结束';expect(scriptChanges(id,say(first,'甲'),invalid,'zh-CN')[0]).toMatchObject({kind:'source',after:invalid});
    expect(scriptChanges(id,say(first,'甲'),`// 作者注释\n${say(first,'甲')}`,'zh-CN')[0]).toMatchObject({kind:'source'});
    expect(compactSourceDiff('相同\n旧行\n末行','相同\n新行\n末行')).toEqual({before:'旧行',after:'新行'});
  });
  it('counts a scene once when only physical file information is available',()=>{
    const groups=buildSaveChanges([{path:'scenes/a/scene.json',documentId:id,oldExists:true,newExists:true},{path:'scenes/a/script.gal',documentId:id,oldExists:true,newExists:true}]);
    expect(groups).toHaveLength(1);expect(groups[0]!.changes).toHaveLength(1);
  });
});

it('names each changed asset and preserves exact variant verification values', () => {
  const path = 'assets/index.json', before = { assets: [{ id: 'AssetA', name: '雨声', variants: [{ id: 'V1', targetStatus: { web: 'unverified' } }] }, { id: 'AssetB', name: '街道', variants: [] }] };
  const after = structuredClone(before); after.assets[0]!.variants[0]!.targetStatus.web = 'verified';
  const document: DocumentView = { documentId: id, revision: 2, savedRevision: 1, format: 'json', dirty: true, files: { [path]: JSON.stringify({ data: after }) }, savedFiles: { [path]: JSON.stringify({ data: before }) } };
  const changes = buildSaveChanges([{ path, documentId: id, oldExists: true, newExists: true }], [document])[0]!.changes;
  expect(changes).toHaveLength(1); expect(changes[0]!.label).toBe('素材 · 雨声');
  expect(changes[0]!.fields).toEqual([{ field: 'variants', before: before.assets[0]!.variants, after: after.assets[0]!.variants }]);
});
