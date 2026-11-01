import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FixtureCharacters, FixtureDsl, FixtureIds, FixtureProject, FixtureScenes, FixtureVariables } from '@galcraft/contracts/fixtures';
import type { DocumentView, Result } from '@galcraft/contracts';
import { parse } from '@galcraft/dsl';
import { ProjectSession } from './index.js';
import { AuthorOperationDefinitions, AuthorOperationSchema, authoringReferences, characterDraft, mergeCharacterDraft, neutralCharacter, normalizeCharacterVoicePresets, prepareAuthoringEdit, rebaseAuthoringOperation, type AuthorOperation } from './authoring.js';
const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };
const json = (documentId: string, path: string, data: unknown): DocumentView => ({ documentId, revision: 1, savedRevision: 1, dirty: false, format: 'json', savedFiles: {}, files: { [path]: JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data }) } });
function documents(): DocumentView[] {
  return [json('ProjAA','project.json',FixtureProject), ...FixtureScenes.map((scene,i)=>({ ...json(i?'SceneB':'SceneA',`scenes/${scene.id}/scene.json`,scene),format:'dsl' as const,files:{...json(i?'SceneB':'SceneA',`scenes/${scene.id}/scene.json`,scene).files,[`scenes/${scene.id}/script.gal`]:i?FixtureDsl.bookshop:FixtureDsl.street}})),
    json('CharAA',`characters/${FixtureCharacters[0]!.id}.json`,FixtureCharacters[0]),json('VariAA',`variables/${FixtureVariables[0]!.id}.json`,FixtureVariables[0])];
}
const cleanups: (()=>Promise<void>)[]=[];
afterEach(async()=>{for(const cleanup of cleanups.splice(0))await cleanup();});
async function session(input=documents()) { const root=await mkdtemp(join(tmpdir(),'galcraft-authoring-')), session=new ProjectSession(root,FixtureProject.projectId); for(const document of input)session.registerDocument(document); cleanups.push(async()=>{await session.dispose('discard');await rm(root,{recursive:true,force:true});});return session; }
function execute(session: ProjectSession, operation: AuthorOperation) { const edit=unwrap(prepareAuthoringEdit([...session.documents.values()],operation)), plan=unwrap(session.planEdit(edit));return unwrap(session.applyEdit(plan.planId,edit.expected)); }
const data=(documents:DocumentView[],path:string)=>JSON.parse(documents.find(document=>path in document.files)!.files[path]!).data;
describe('shared semantic author operations',()=>{
  it('publishes strict independently discoverable contracts and permits empty chapter and scene creation',async()=>{
    expect(new Set(AuthorOperationDefinitions.map(item=>item.key)).size).toBe(AuthorOperationDefinitions.length);
    expect(AuthorOperationSchema.safeParse({op:'chapter.create',name:'C',unexpected:true}).success).toBe(false);
    const project=await session();execute(project,{op:'chapter.create',name:'Empty'});
    const chapter=data([...project.documents.values()],'project.json').chapters.at(-1);expect(chapter.sceneIds).toEqual([]);
    execute(project,{op:'scene.create',name:'Empty scene',chapterId:chapter.id});
    const current=data([...project.documents.values()],'project.json').chapters.at(-1);expect(current.sceneIds).toHaveLength(1);
    expect([...project.documents.values()].find(document=>`scenes/${current.sceneIds[0]}/script.gal`in document.files)?.files[`scenes/${current.sceneIds[0]}/script.gal`]).toBe('');
  });
  it('duplicates chapter internal scene, label, option and statement identities while retaining external references, as one undo group',async()=>{
    const project=await session();const receipt=execute(project,{op:'chapter.duplicate',id:FixtureIds.chapter,name:'Copy'});
    const all=[...project.documents.values()], original=data(all,'project.json').chapters[0],copy=data(all,'project.json').chapters[1];
    expect(copy.sceneIds).toHaveLength(2);expect(copy.sceneIds.some((id:string)=>original.sceneIds.includes(id))).toBe(false);
    const source=all.find(document=>document.files[`scenes/${copy.sceneIds[0]}/script.gal`]!==undefined)!.files[`scenes/${copy.sceneIds[0]}/script.gal`]!;
    expect(source).toContain(FixtureIds.an);expect(source).not.toContain(FixtureIds.streetLabel);expect(source).not.toContain(FixtureIds.street);expect(source).not.toContain(FixtureIds.bookshop);expect(source).toContain(copy.sceneIds[0]);expect(source).toContain(copy.sceneIds[1]);
    const undo=unwrap(project.planUndo('ProjAA',receipt.operationId));unwrap(project.undo(undo.planId));expect(data([...project.documents.values()],'project.json').chapters).toHaveLength(1);
    unwrap(project.redo(undo.planId));expect(data([...project.documents.values()],'project.json').chapters).toHaveLength(2);
  });
  it('blocks destructive references and nonempty chapter deletion without a destination',()=>{
    const input=documents();expect(prepareAuthoringEdit(input,{op:'scene.remove',id:FixtureIds.street})).toMatchObject({ok:false});
    expect(prepareAuthoringEdit(input,{op:'chapter.remove',id:FixtureIds.chapter})).toMatchObject({ok:false});
    expect(authoringReferences(input,{kind:'scene',id:FixtureIds.street}).some(ref=>ref.path==='project.json'&&ref.field==='/entry/sceneId')).toBe(true);
    expect(prepareAuthoringEdit(input,{op:'variable.create',name:'Invalid',type:'number',scope:'progress',initial:'wrong'})).toMatchObject({ok:false});
  });
  it('creates local declaration identities and validates defaults before applying, retaining existing call source',async()=>{
    const project=await session(), source=project.readDocument('SceneA')!.files[`scenes/${FixtureIds.street}/script.gal`];
    execute(project,{op:'scene.declarations',id:FixtureIds.street,returns:'number',locals:[{name:'amount',type:'number',initial:0,parameter:{required:false,defaultValue:3}}]});
    const scene=data([...project.documents.values()],`scenes/${FixtureIds.street}/scene.json`);expect(scene.locals[0].id).toMatch(/^[A-Za-z0-9]{6}$/);expect(scene.parameters).toEqual([{variableId:scene.locals[0].id,required:false,defaultValue:3}]);
    expect(project.readDocument('SceneA')!.files[`scenes/${FixtureIds.street}/script.gal`]).toBe(source);
    expect(prepareAuthoringEdit([...project.documents.values()],{op:'scene.update',id:scene.id,changes:{parameters:[{variableId:scene.locals[0].id,required:false,defaultValue:null}]}})).toMatchObject({ok:true});
  });
  it('preserves legacy parameter flags and falsy defaults through author operations, disk save and reopen',async()=>{
    const project=await session();
    for(const document of project.documents.values())for(const [path,content]of Object.entries(document.files)){await mkdir(dirname(join(project.root,path)),{recursive:true});await writeFile(join(project.root,path),content);}
    execute(project,{op:'scene.declarations',id:FixtureIds.street,returns:'void',locals:[
      {id:'PzeroA',name:'Zero',type:'number',initial:1,parameter:{required:true,defaultValue:0}},
      {id:'PboolA',name:'False',type:'boolean',initial:true,parameter:{required:false,defaultValue:false}},
      {id:'PtextA',name:'Empty',type:'string',initial:'initial',parameter:{required:true,defaultValue:''}},
      {id:'PnodaA',name:'Required',type:'number',initial:1,parameter:{required:false,defaultValue:null}},
    ]});
    const expected=[{variableId:'PzeroA',required:true,defaultValue:0},{variableId:'PboolA',required:false,defaultValue:false},{variableId:'PtextA',required:true,defaultValue:''},{variableId:'PnodaA',required:false,defaultValue:null}];
    const path=`scenes/${FixtureIds.street}/scene.json`,before=project.readDocument('SceneA')!.files;
    expect(data([...project.documents.values()],path).parameters).toEqual(expected);
    expect(prepareAuthoringEdit([...project.documents.values()],{op:'scene.update',id:FixtureIds.street,changes:{parameters:[{variableId:'PzeroA',required:true,defaultValue:'wrong'}]}})).toMatchObject({ok:false});
    expect(project.readDocument('SceneA')!.files).toEqual(before);
    unwrap(await project.save(unwrap(project.planSave({kind:'all'})).planId));
    const reopened=await ProjectSession.open(project.root,FixtureProject.projectId);cleanups.push(async()=>{await reopened.dispose('discard');});
    expect(data([...reopened.documents.values()],path).parameters).toEqual(expected);
  });
  it('shares character creation defaults, alias normalization and difference validation',()=>{
    expect(neutralCharacter('ActorA','A').defaultVoicing).toBe('required');expect(neutralCharacter('ActorB','B',FixtureProject,'viewpoint').defaultVoicing).toBe('intentionalSilent');
    const preset={id:'Preset',revision:1,connectionId:'ConnAA',model:'voice',voice:{kind:'id' as const,value:'speaker'},locale:'zh',speed:1,emotion:null,advanced:{}};
    const character={...neutralCharacter('ActorA','A'),voicePresets:{zh:preset}};
    expect(normalizeCharacterVoicePresets(character,FixtureProject.languages).voicePresets['zh-CN']?.locale).toBe('zh-CN');
    expect(()=>normalizeCharacterVoicePresets({...character,voicePresets:{zh:preset,'zh-CN':{...preset,id:'OtherP',locale:'zh-CN'}}},FixtureProject.languages)).toThrow('VOICE_LOCALE_CONFLICT');
    expect(prepareAuthoringEdit(documents(),{op:'character.create',name:'New',changes:{initialDifferenceId:'Absent'}})).toMatchObject({ok:false});
  });
  it('merges only edited draft fields and keeps the retained original basis for same-field conflicts',()=>{
    const base=characterDraft(FixtureCharacters[0]!), draft={...base,description:'My notes'}, latest={...base,defaultVoicing:'intentionalSilent' as const};
    expect(mergeCharacterDraft(base,draft,latest)).toMatchObject({conflicts:[],value:{description:'My notes',defaultVoicing:'intentionalSilent'}});
    const conflicted=mergeCharacterDraft(base,draft,{...latest,description:'Other notes'});expect(conflicted.conflicts).toEqual(['description']);expect(conflicted.value.description).toBe('My notes');
    expect(mergeCharacterDraft(base,draft,{...latest,description:'Other notes'},'current').value.description).toBe('Other notes');expect(draft.description).toBe('My notes');
  });
  it('merges nested project setting changes and validates their complete result',async()=>{
    const project=await session(),before=data([...project.documents.values()],'project.json');
    execute(project,{op:'project.update',changes:{player:{emergencyKey:'KeyQ'},canvas:{width:1280},languages:{textDefault:'ja'}}});
    execute(project,{op:'project.update',changes:{player:{autosave:false},release:{publisher:'Author'}}});
    const after=data([...project.documents.values()],'project.json');expect(after.player).toEqual({...before.player,emergencyKey:'KeyQ',autosave:false});expect(after.release).toMatchObject({publisher:'Author',executableName:'Game.exe',windowsSigning:'unsigned'});expect(after.canvas.height).toBe(before.canvas.height);expect(after.languages.voices).toEqual(before.languages.voices);
    expect(prepareAuthoringEdit([...project.documents.values()],{op:'project.update',changes:{languages:{menuDefault:'absent'}}})).toMatchObject({ok:false});
  });
  it('inserts author content with generated internal identities and rejects invalid structured fields without changing source',async()=>{
    const project=await session();execute(project,{op:'commands.insert',sceneId:FixtureIds.bookshop,beforeId:null,commands:[{command:'label',args:{name:'Return point'}},{command:'choose',args:{options:[{text:'Continue',target:{sceneId:FixtureIds.street,labelId:null}}]}}]});
    const source=project.readDocument('SceneB')!,parsed=parse({documentId:source.documentId,revision:source.revision,text:source.files[`scenes/${FixtureIds.bookshop}/script.gal`]!});
    const label=parsed.statements.find(node=>node.command==='label'&&node.args.name==='Return point')!,choice=parsed.statements.find(node=>node.command==='choose')!;
    expect(label.args.labelId).toMatch(/^[A-Za-z0-9]{6}$/);expect((choice.args.options as {id:string}[])[0]!.id).toMatch(/^[A-Za-z0-9]{6}$/);
    const before=source.files;
    expect(prepareAuthoringEdit([...project.documents.values()],{op:'commands.fields',sceneId:FixtureIds.bookshop,ids:[label.id!],changes:[{field:'name',op:'set',value:42}]})).toMatchObject({ok:false});
    expect(prepareAuthoringEdit([...project.documents.values()],{op:'commands.insert',sceneId:FixtureIds.bookshop,beforeId:null,commands:[{command:'say',args:{speaker:{kind:'narrator'},text:42}}]})).toMatchObject({ok:false});expect(project.readDocument('SceneB')!.files).toEqual(before);
  });
  it('keeps unfinished source while editing a valid structured statement',async()=>{
    const input=documents(),scene=input.find(document=>document.documentId==='SceneA')!;scene.files[`scenes/${FixtureIds.street}/script.gal`]='label {name:"Ready",labelId:"LabelA"} @StateA;\nsay {text:';
    const project=await session(input);execute(project,{op:'commands.fields',sceneId:FixtureIds.street,ids:['StateA'],changes:[{field:'name',op:'set',value:'New name'}]});
    expect(project.readDocument('SceneA')!.files[`scenes/${FixtureIds.street}/script.gal`]).toContain('say {text:');
    execute(project,{op:'commands.insert',sceneId:FixtureIds.street,beforeId:'StateA',commands:[{command:'label',args:{name:'Inserted'}}]});
    expect(project.readDocument('SceneA')!.files[`scenes/${FixtureIds.street}/script.gal`]).toContain('say {text:');
  });
  it('replaces local references, interpolation and scope as one transaction and keeps unrelated unfinished source',async()=>{
    const input=documents(),scene=input.find(document=>document.documentId==='SceneA')!,meta=JSON.parse(scene.files[`scenes/${FixtureIds.street}/scene.json`]!);meta.data.locals=[{id:'LocalA',name:'Local',type:'number',scope:'local',initial:0}];scene.files[`scenes/${FixtureIds.street}/scene.json`]=JSON.stringify(meta);
    scene.files[`scenes/${FixtureIds.street}/script.gal`]='setVar {variableId:"LocalA",scope:"local",op:"assign",value:3} @StateA;\nsay '+JSON.stringify({speaker:{kind:'narrator'},text:'Count {{local["LocalA"]}}'})+' @StateB;\nsay {text:';
    input.push(json('Global','variables/Global.json',{id:'Global',name:'Global',type:'number',scope:'progress',initial:1}));
    const project=await session(input);execute(project,{op:'variable.replace',id:'LocalA',replacementId:'Global'});
    const source=project.readDocument('SceneA')!.files[`scenes/${FixtureIds.street}/script.gal`]!;expect(source).not.toContain('LocalA');expect(source).toContain('progress');expect(source).toContain('Global');expect(source).toContain('say {text:');expect(data([...project.documents.values()],`scenes/${FixtureIds.street}/scene.json`).locals).toEqual([]);
  });
  it('rejects a local replacement whose consumers belong to another scene',()=>{
    const input=documents(),scene=input.find(document=>document.documentId==='SceneB')!,meta=JSON.parse(scene.files[`scenes/${FixtureIds.bookshop}/scene.json`]!);meta.data.locals=[{id:'LocalB',name:'Local',type:'number',scope:'local',initial:0}];scene.files[`scenes/${FixtureIds.bookshop}/scene.json`]=JSON.stringify(meta);
    input.find(document=>document.documentId==='SceneA')!.files[`scenes/${FixtureIds.street}/script.gal`]=`setVar {variableId:"${FixtureVariables[0]!.id}",scope:"progress",op:"assign",value:1} @StateA;`;
    expect(prepareAuthoringEdit(input,{op:'variable.replace',id:FixtureVariables[0]!.id,replacementId:'LocalB'})).toMatchObject({ok:false,error:{message:expect.stringContaining('LOCAL_SCOPE')}});
  });
  it('creates independent group and difference identities and replaces difference consumers before removal',async()=>{
    const project=await session();execute(project,{op:'character.group.create',characterId:FixtureIds.an,name:'Casual',assetIds:[]});execute(project,{op:'character.difference.create',characterId:FixtureIds.an,name:'Smile',figure:{assetId:'AssetA',variantId:null},avatar:null,initial:true});execute(project,{op:'character.difference.create',characterId:FixtureIds.an,name:'Neutral',figure:{assetId:'AssetB',variantId:null},avatar:null,initial:false});
    const character=data([...project.documents.values()],`characters/${FixtureIds.an}.json`),[first,second]=character.differences;
    expect(character.groups[0].id).not.toBe(first.id);execute(project,{op:'commands.insert',sceneId:FixtureIds.bookshop,beforeId:null,commands:[{command:'characterDifference',args:{characterId:FixtureIds.an,differenceId:first.id}}]});
    expect(prepareAuthoringEdit([...project.documents.values()],{op:'character.difference.remove',characterId:FixtureIds.an,id:first.id})).toMatchObject({ok:false});
    execute(project,{op:'character.difference.remove',characterId:FixtureIds.an,id:first.id,replacementId:second.id});
    expect(data([...project.documents.values()],`characters/${FixtureIds.an}.json`).initialDifferenceId).toBe(second.id);expect(project.readDocument('SceneB')!.files[`scenes/${FixtureIds.bookshop}/script.gal`]).toContain(second.id);expect(project.readDocument('SceneB')!.files[`scenes/${FixtureIds.bookshop}/script.gal`]).not.toContain(first.id);
  });

  it('requires explicit caller argument removal when replacing a parameter with a project variable',async()=>{
    const input=documents(),scene=input.find(document=>document.documentId==='SceneB')!,meta=JSON.parse(scene.files[`scenes/${FixtureIds.bookshop}/scene.json`]!);meta.data.locals=[{id:'ParamA',name:'Amount',type:'number',scope:'local',initial:0}];meta.data.parameters=[{variableId:'ParamA',required:true,defaultValue:null}];scene.files[`scenes/${FixtureIds.bookshop}/scene.json`]=JSON.stringify(meta);
    input.find(document=>document.documentId==='SceneA')!.files[`scenes/${FixtureIds.street}/script.gal`]=`callScene {sceneId:"${FixtureIds.bookshop}",parameters:{ParamA:3}} @Caller;`;
    input.push(json('Global','variables/Global.json',{id:'Global',name:'Global',type:'number',scope:'progress',initial:1}));
    expect(prepareAuthoringEdit(input,{op:'variable.replace',id:'ParamA',replacementId:'Global'})).toMatchObject({ok:false,error:{message:expect.stringContaining('PARAMETER_ARGUMENTS')}});
    const project=await session(input);execute(project,{op:'variable.replace',id:'ParamA',replacementId:'Global',parameterArguments:'remove'});
    expect(data([...project.documents.values()],`scenes/${FixtureIds.bookshop}/scene.json`).parameters).toEqual([]);expect(project.readDocument('SceneA')!.files[`scenes/${FixtureIds.street}/script.gal`]).not.toContain('ParamA');
  });

  it('rebases only entered fields, retaining disjoint workspace edits and explicit conflict choices',()=>{
    const baseline=documents(),current=structuredClone(baseline),project=JSON.parse(current[0]!.files['project.json']!);project.data.description='Workspace description';project.data.player.autosave=false;current[0]!.files['project.json']=JSON.stringify(project);
    const operation:AuthorOperation={op:'project.update',changes:{description:FixtureProject.description,player:{emergencyKey:'KeyQ'}}};
    const rebased=rebaseAuthoringOperation(baseline,current,operation);expect(rebased.conflicts).toEqual([]);expect(rebased.operation).toMatchObject({changes:{player:{emergencyKey:'KeyQ'}}});expect((rebased.operation as {changes:object}).changes).not.toHaveProperty('description');
    const conflict:AuthorOperation={op:'project.update',changes:{description:'My description',player:{emergencyKey:'KeyQ'}}};
    expect(rebaseAuthoringOperation(baseline,current,conflict).conflicts).toEqual(['description']);expect(rebaseAuthoringOperation(baseline,current,conflict,'current').operation).toMatchObject({changes:{player:{emergencyKey:'KeyQ'}}});expect(rebaseAuthoringOperation(baseline,current,conflict,'draft').operation).toMatchObject({changes:{description:'My description'}});
  });

  it('preserves the adopted template source while replacing work-side references',async()=>{
    const input=documents();input.push(json('Global','variables/Global.json',{id:'Global',name:'Global',type:'number',scope:'progress',initial:1}));input.push(json('OldVar','variables/OldVar.json',{id:'OldVar',name:'Old',type:'number',scope:'progress',initial:1}));
    const source={binding:{kind:'variable',id:'OldVar',scope:'progress'}},record={schemaVersion:1,source,sourceFiles:{'baseline.scss':'/* OldVar */'},identities:{OldVar:'OldVar'},hiddenPages:[{binding:{kind:'variable',id:'OldVar',scope:'local',declaringSceneId:FixtureIds.street}}]};input.push(json('Source','ui/source.json',record));
    const project=await session(input);execute(project,{op:'variable.replace',id:'OldVar',replacementId:'Global'});const after=data([...project.documents.values()],'ui/source.json');expect(after.source).toEqual(source);expect(after.sourceFiles).toEqual(record.sourceFiles);expect(after.identities).toEqual({OldVar:'Global'});expect(after.hiddenPages[0].binding.id).toBe('Global');expect(after.hiddenPages[0].binding.declaringSceneId).toBeNull();
  });

  it('updates selected character appearance and effect fields without resetting other configured values',async()=>{
    const project=await session();execute(project,{op:'character.update',id:FixtureIds.an,changes:{defaultEffects:{x:42,bloom:{intensity:.5}},appearance:{referenceAssets:['AssetA']}}});execute(project,{op:'character.update',id:FixtureIds.an,changes:{defaultEffects:{opacity:.5,bloom:{blur:2}},appearance:{notes:'Blue coat'}}});
    const character=data([...project.documents.values()],`characters/${FixtureIds.an}.json`);expect(character.defaultEffects.x).toBe(42);expect(character.defaultEffects.opacity).toBe(.5);expect(character.defaultEffects.bloom).toMatchObject({intensity:.5,blur:2});expect(character.appearance).toMatchObject({referenceAssets:['AssetA'],notes:'Blue coat'});
  });

});
