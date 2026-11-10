import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FixtureAsset, FixtureCharacters, FixtureDsl, FixtureIds, FixtureProject, FixtureScenes, FixtureVariables } from '@galcraft/contracts/fixtures';
import { SceneDecorLayerSchema, type DocumentView, type Result } from '@galcraft/contracts';
import { parse } from '@galcraft/dsl';
import { ProjectSession, type SessionOptions } from './index.js';
import { AuthorOperationDefinitions, AuthorOperationSchema, authoringReferences, characterDraft, characterEdit, mergeCharacterDraft, neutralCharacter, normalizeCharacterVoicePresets, prepareAuthoringEdit, rebaseAuthoringOperation, type AuthorOperation } from './authoring.js';
const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };
const json = (documentId: string, path: string, data: unknown): DocumentView => ({ documentId, revision: 1, savedRevision: 1, dirty: false, format: 'json', savedFiles: {}, files: { [path]: JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data }) } });
function documents(): DocumentView[] {
  return [json('ProjAA','project.json',FixtureProject), ...FixtureScenes.map((scene,i)=>({ ...json(i?'SceneB':'SceneA',`scenes/${scene.id}/scene.json`,scene),format:'dsl' as const,files:{...json(i?'SceneB':'SceneA',`scenes/${scene.id}/scene.json`,scene).files,[`scenes/${scene.id}/script.gal`]:i?FixtureDsl.bookshop:FixtureDsl.street}})),
    json('CharAA',`characters/${FixtureCharacters[0]!.id}.json`,FixtureCharacters[0]),json('VariAA',`variables/${FixtureVariables[0]!.id}.json`,FixtureVariables[0])];
}
const cleanups: (()=>Promise<void>)[]=[];
afterEach(async()=>{for(const cleanup of cleanups.splice(0))await cleanup();});
async function session(input=documents(), options?: SessionOptions) { const root=await mkdtemp(join(tmpdir(),'galcraft-authoring-')), session=new ProjectSession(root,FixtureProject.projectId,options); for(const document of input)session.registerDocument(document); cleanups.push(async()=>{await session.dispose('discard');await rm(root,{recursive:true,force:true});});return session; }
function execute(session: ProjectSession, operation: AuthorOperation) { const edit=unwrap(prepareAuthoringEdit([...session.documents.values()],operation)), plan=unwrap(session.planEdit(edit));return unwrap(session.applyEdit(plan.planId,edit.expected)); }
const data=(documents:DocumentView[],path:string)=>JSON.parse(documents.find(document=>path in document.files)!.files[path]!).data;
describe('shared semantic author operations',()=>{
  it('edits ordered decor atomically, freezes its asset revision, and allocates copied layer identities', async () => {
    const input = [...documents(), json('IndexA', 'assets/index.json', { assets: [FixtureAsset] })];
    const project = await session(input, { resolveRequiredRef: ref => [FixtureAsset.id, FixtureAsset.activeVariantId].includes(ref.id) });
    const layer = SceneDecorLayerSchema.parse({ id: 'Decor1', assetId: FixtureAsset.id, variantId: FixtureAsset.activeVariantId, cameraFollow: .5 });
    const layers = [layer, { ...layer, id: 'Decor2', visible: false, z: 5, cameraFollow: 0 }];
    const operation = { op: 'scene.update' as const, id: FixtureIds.street, changes: { decorLayers: layers } };
    const current = () => [...project.documents.values()];
    const edit = unwrap(prepareAuthoringEdit(current(), operation));
    expect(edit.expected).toContainEqual({ ref: { kind: 'document', id: 'IndexA' }, revision: 1 });
    expect(edit.requiredRefs).toEqual([{ kind: 'asset', id: layer.assetId }, { kind: 'variant', id: layer.variantId }]);
    const applied = execute(project, operation);
    const path = `scenes/${FixtureIds.street}/scene.json`;
    expect(data(current(), path).decorLayers).toEqual(layers);
    const undo = unwrap(project.planUndo('SceneA', applied.operationId));
    unwrap(project.undo(undo.planId));
    expect(data(current(), path).decorLayers).toBeUndefined();
    unwrap(project.redo(undo.planId));
    expect(data(current(), path).decorLayers).toEqual(layers);
    const invalid = prepareAuthoringEdit(current(), { ...operation, changes: { decorLayers: [{ ...layer, variantId: 'Absent' }] } });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'DECOR_IMAGE', source: { field: '/data/decorLayers/0/variantId' } } });
    execute(project, { op: 'scene.duplicate', id: FixtureIds.street, name: 'Decor copy' });
    const copied = current().flatMap(document => Object.entries(document.files).filter(([name]) => name.endsWith('/scene.json'))
      .map(([, raw]) => JSON.parse(raw).data)).find(scene => scene.name === 'Decor copy');
    expect(copied.decorLayers.map(({ id, ...decor }: typeof layer) => decor)).toEqual(layers.map(({ id, ...decor }) => decor));
    expect(copied.decorLayers.every(({ id }: typeof layer) => !layers.some(item => item.id === id))).toBe(true);
  });

  it('edits, splits, merges, copies, moves and removes anchored dialogue through atomic history', async () => {
    const input = documents(), path = `scenes/${FixtureIds.street}/script.gal`, other = `scenes/${FixtureIds.bookshop}/script.gal`;
    input[1]!.files[path] = 'say {speaker:{kind:"narrator"},text:"甲乙丙"} @Line01;';
    input[2]!.files[other] = '';
    const project = await session(input);
    const lines = (documentId = 'SceneA') => {
      const doc = project.readDocument(documentId)!;
      return parse({ documentId, revision: doc.revision, text: doc.files[documentId === 'SceneA' ? path : other]! }).statements;
    };
    const target = { sceneId: FixtureIds.street, statementId: 'Line01' };
    const events = [
      { id: 'EventA', offset: 1, kind: 'wait' as const, durationMs: 100 },
      { id: 'EventB', offset: 2, kind: 'wait' as const, durationMs: null },
      { id: 'EventC', offset: 2, kind: 'wait' as const, durationMs: 200 },
    ];
    execute(project, { op: 'dialogue.update', ...target, events });
    execute(project, { op: 'dialogue.update', ...target, text: '甲新乙丙' });
    expect(lines()[0]?.args.events).toEqual(events.map((event, index) => ({ ...event, offset: index ? 3 : 1 })));
    const split = execute(project, { op: 'dialogue.split', ...target, offset: 3 });
    const [first, second] = lines();
    expect(first).toMatchObject({ id: 'Line01', args: { text: '甲新乙', events: [events[0]] } });
    expect(second?.id).not.toBe(first?.id);
    expect(second?.args).toMatchObject({ text: '丙', events: events.slice(1).map(event => ({ ...event, offset: 0 })) });
    const undo = unwrap(project.planUndo('SceneA', split.operationId));
    unwrap(project.undo(undo.planId));
    expect(lines()).toHaveLength(1);
    unwrap(project.redo(undo.planId));
    expect(lines()[1]?.id).toBe(second?.id);
    execute(project, { op: 'dialogue.merge', ...target, nextStatementId: second!.id! });
    expect(lines()[0]?.args.events).toEqual(events.map((event, index) => ({ ...event, offset: index ? 3 : 1 })));
    execute(project, { op: 'commands.duplicate', sceneId: target.sceneId, ids: ['Line01'], beforeId: null });
    const copy = lines()[1]!;
    expect(copy.id).not.toBe('Line01');
    const copiedEvents = copy.args.events as typeof events;
    expect(copiedEvents.map(event => event.offset)).toEqual([1, 3, 3]);
    expect(copiedEvents.every(event => !events.some(old => old.id === event.id))).toBe(true);
    execute(project, { op: 'commands.move', sceneId: target.sceneId, ids: [copy.id!], targetSceneId: FixtureIds.bookshop, beforeId: null });
    expect(lines('SceneB')[0]).toMatchObject({ id: copy.id, args: { events: copiedEvents } });
    execute(project, { op: 'dialogue.update', ...target, events: [events[0]!] });
    expect(lines()[0]?.args.events).toEqual([events[0]]);
  });

  it('rejects an event identity committed concurrently in another scene and recovers invalid raw anchors after reopen', async () => {
    const input = documents();
    const scenes = FixtureScenes.map((scene, index) => ({ id: scene.id, documentId: index ? 'SceneB' : 'SceneA', path: `scenes/${scene.id}/script.gal` }));
    for (const [index, scene] of scenes.entries()) input[index + 1]!.files[scene.path] = `say {speaker:{kind:"narrator"},text:"甲乙"} @Line0${index};`;
    const project = await session(input);
    for (const document of project.documents.values()) for (const [path, content] of Object.entries(document.files)) {
      await mkdir(dirname(join(project.root, path)), { recursive: true });
      await writeFile(join(project.root, path), content);
    }
    const plans = scenes.map((scene, index) => {
      const edit = unwrap(prepareAuthoringEdit([...project.documents.values()], { op: 'dialogue.update', sceneId: scene.id, statementId: `Line0${index}`,
        events: [{ id: 'EventA', offset: 1, kind: 'wait', durationMs: 100 }] }));
      return unwrap(project.planEdit(edit));
    });
    const first = unwrap(project.applyEdit(plans[0]!.planId, plans[0]!.input.expected));
    expect(project.applyEdit(plans[1]!.planId, plans[1]!.input.expected)).toMatchObject({ ok: false, error: { code: 'DIALOGUE_EVENT_DUPLICATE', source: { eventId: 'EventA' } } });
    const history = unwrap(project.planUndo('SceneA', first.operationId));
    unwrap(project.undo(history.planId));
    const second = unwrap(project.applyEdit(plans[1]!.planId, plans[1]!.input.expected));
    expect(project.redo(history.planId)).toMatchObject({ ok: false, error: { code: 'DIALOGUE_EVENT_DUPLICATE' } });
    unwrap(project.undo(unwrap(project.planUndo('SceneB', second.operationId)).planId));
    unwrap(project.redo(history.planId));
    const { documentId, path } = scenes[0]!;
    const document = project.readDocument(documentId)!;
    const valid = document.files[path]!, invalid = valid.replace('甲乙', '👩‍🚀乙');
    const raw = { label: 'Raw source', origin: 'script' as const, expected: [{ ref: { kind: 'document' as const, id: documentId }, revision: document.revision }],
      requiredRefs: [], preparedAssets: [], patches: [{ kind: 'text' as const, documentId, edits: [{ start: 0, end: valid.length, before: valid, after: invalid }] }] };
    expect(project.planEdit({ ...raw, origin: 'field' })).toMatchObject({ ok: false, error: { code: 'DIALOGUE_EVENT_ANCHOR' } });
    const sourceEdit = unwrap(project.planEdit(raw));
    unwrap(project.applyEdit(sourceEdit.planId, raw.expected));
    unwrap(await project.save(unwrap(project.planSave({ kind: 'all' })).planId));
    const reopened = await ProjectSession.open(project.root, FixtureProject.projectId);
    cleanups.push(async () => { await reopened.dispose('discard'); });
    expect(reopened.readAuthoringDocument(documentId)).toMatchObject({ files: { [path]: invalid }, lastValidSceneSource: { revision: document.revision, text: valid } });
  });

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
  it('blocks semantic commands in the invalid scene and keeps another scene editable',async()=>{
    const input=documents(),scene=input.find(document=>document.documentId==='SceneA')!, path=`scenes/${FixtureIds.street}/script.gal`;
    scene.files[path]='label {name:"Ready",labelId:"LabelA"} @StateA;\nsay {text:';
    const project=await session(input), current=()=>[...project.documents.values()];
    const invalid={ok:false,error:{code:'SCENE_SOURCE_INVALID',source:{documentId:'SceneA',revision:1}}};
    expect(prepareAuthoringEdit(current(),{op:'commands.fields',sceneId:FixtureIds.street,ids:['StateA'],changes:[{field:'name',op:'set',value:'New name'}]})).toMatchObject(invalid);
    expect(prepareAuthoringEdit(current(),{op:'commands.insert',sceneId:FixtureIds.street,beforeId:'StateA',commands:[{command:'label',args:{name:'Inserted'}}]})).toMatchObject(invalid);
    expect(project.planEdit({label:'direct candidate',origin:'candidate',expected:[{ref:{kind:'document',id:'SceneA'},revision:1}],preparedAssets:[],requiredRefs:[],patches:[{kind:'text',documentId:'SceneA',edits:[{start:0,end:0,before:'',after:'// candidate\n'}]}]})).toMatchObject(invalid);
    execute(project,{op:'commands.insert',sceneId:FixtureIds.bookshop,beforeId:null,commands:[{command:'label',args:{name:'Inserted'}}]});
    expect(project.readDocument('SceneA')!.files[path]).toBe(scene.files[path]);
  });
  it('blocks a rebind on unfinished source, then replaces local references, interpolation and scope as one transaction after repair',async()=>{
    const input=documents(),scene=input.find(document=>document.documentId==='SceneA')!,meta=JSON.parse(scene.files[`scenes/${FixtureIds.street}/scene.json`]!);meta.data.locals=[{id:'LocalA',name:'Local',type:'number',scope:'local',initial:0}];scene.files[`scenes/${FixtureIds.street}/scene.json`]=JSON.stringify(meta);
    const path=`scenes/${FixtureIds.street}/script.gal`, valid='setVar {variableId:"LocalA",scope:"local",op:"assign",value:3} @StateA;\nsay '+JSON.stringify({speaker:{kind:'narrator'},text:'Count {{local["LocalA"]}}'})+' @StateB;', invalid=valid+'\nsay {text:';
    scene.files[path]=invalid;
    input.push(json('Global','variables/Global.json',{id:'Global',name:'Global',type:'number',scope:'progress',initial:1}));
    const project=await session(input), operation={op:'variable.replace',id:'LocalA',replacementId:'Global'} as const;
    expect(prepareAuthoringEdit([...project.documents.values()],operation)).toMatchObject({ok:false,error:{code:'SCENE_SOURCE_INVALID'}});
    const expected=[{ref:{kind:'document' as const,id:'SceneA'},revision:1}];
    const repair=unwrap(project.planEdit({label:'Repair raw source',origin:'script',expected,preparedAssets:[],requiredRefs:[],patches:[{kind:'text',documentId:'SceneA',edits:[{start:0,end:invalid.length,before:invalid,after:valid}]}]}));
    unwrap(project.applyEdit(repair.planId,expected)); execute(project,operation);
    const source=project.readDocument('SceneA')!.files[path]!;expect(source).not.toContain('LocalA');expect(source).toContain('progress');expect(source).toContain('Global');expect(data([...project.documents.values()],`scenes/${FixtureIds.street}/scene.json`).locals).toEqual([]);
  });
  it('rejects a local replacement whose consumers belong to another scene',()=>{
    const input=documents(),scene=input.find(document=>document.documentId==='SceneB')!,meta=JSON.parse(scene.files[`scenes/${FixtureIds.bookshop}/scene.json`]!);meta.data.locals=[{id:'LocalB',name:'Local',type:'number',scope:'local',initial:0}];scene.files[`scenes/${FixtureIds.bookshop}/scene.json`]=JSON.stringify(meta);
    input.find(document=>document.documentId==='SceneA')!.files[`scenes/${FixtureIds.street}/script.gal`]=`setVar {variableId:"${FixtureVariables[0]!.id}",scope:"progress",op:"assign",value:1} @StateA;`;
    expect(prepareAuthoringEdit(input,{op:'variable.replace',id:FixtureVariables[0]!.id,replacementId:'LocalB'})).toMatchObject({ok:false,error:{message:expect.stringContaining('LOCAL_SCOPE')}});
  });
  it('creates independent group and difference identities and replaces difference consumers before removal',async()=>{
    const project = await session([...documents(), json('IndexA', 'assets/index.json', { assets: [FixtureAsset] })], { resolveRequiredRef: ref => ref.id === FixtureAsset.id });
    const figure = { assetId: FixtureAsset.id, variantId: null };
    execute(project,{op:'character.group.create',characterId:FixtureIds.an,name:'Casual',assetIds:[]});execute(project,{op:'character.difference.create',characterId:FixtureIds.an,name:'Smile',figure,avatar:null,initial:true});execute(project,{op:'character.difference.create',characterId:FixtureIds.an,name:'Neutral',figure,avatar:null,initial:false});
    const character=data([...project.documents.values()],`characters/${FixtureIds.an}.json`),[first,second]=character.differences;
    expect(character.groups[0].id).not.toBe(first.id);execute(project,{op:'commands.insert',sceneId:FixtureIds.bookshop,beforeId:null,commands:[{command:'characterDifference',args:{characterId:FixtureIds.an,differenceId:first.id}}]});
    expect(prepareAuthoringEdit([...project.documents.values()],{op:'character.difference.remove',characterId:FixtureIds.an,id:first.id})).toMatchObject({ok:false});
    execute(project,{op:'character.difference.remove',characterId:FixtureIds.an,id:first.id,replacementId:second.id});
    expect(data([...project.documents.values()],`characters/${FixtureIds.an}.json`).initialDifferenceId).toBe(second.id);expect(project.readDocument('SceneB')!.files[`scenes/${FixtureIds.bookshop}/script.gal`]).toContain(second.id);expect(project.readDocument('SceneB')!.files[`scenes/${FixtureIds.bookshop}/script.gal`]).not.toContain(first.id);
  });

  it('checks exact character image bindings across named operations and forms without blocking unrelated legacy edits', async () => {
    const other = { ...FixtureAsset, id: 'ImageB', name: 'Other image', activeVariantId: 'VersnB', variants: [{ ...FixtureAsset.variants[0]!, id: 'VersnB' }] };
    const project = await session([...documents(), json('IndexA', 'assets/index.json', { assets: [FixtureAsset, other] })],
      { resolveRequiredRef: ref => [FixtureAsset.id, FixtureAsset.activeVariantId, other.id, other.activeVariantId].includes(ref.id) });
    const current = () => [...project.documents.values()];
    const figure = { assetId: FixtureAsset.id, variantId: FixtureAsset.activeVariantId };
    const operation = { op: 'character.difference.create', characterId: FixtureIds.an, name: 'Smile', figure,
      avatar: { kind: 'image', assetId: other.id, variantId: other.activeVariantId }, initial: true } as const;
    const broken = { ...operation, avatar: { ...operation.avatar, variantId: figure.variantId } };
    expect(prepareAuthoringEdit(current(), broken)).toMatchObject({ ok: false, error: { message: expect.stringContaining('does not belong to image Other image') } });
    const edit = unwrap(prepareAuthoringEdit(current(), operation));
    expect(edit.expected).toContainEqual({ ref: { kind: 'document', id: 'IndexA' }, revision: 1 });
    expect(edit.requiredRefs).toEqual([{ kind: 'asset', id: figure.assetId }, { kind: 'variant', id: figure.variantId }, { kind: 'asset', id: other.id }, { kind: 'variant', id: other.activeVariantId }]);
    const receipt = execute(project, operation);
    const path = `characters/${FixtureIds.an}.json`;
    const saved = data(current(), path) as typeof FixtureCharacters[number];
    expect(saved.differences?.[0]).toMatchObject({ figure, avatar: operation.avatar });
    const stale = FixtureCharacters[0]!;
    expect(() => characterEdit({ project: FixtureProject, characters: [stale] }, current(), [{ ...stale, description: 'Retained draft' }])).toThrow('CHARACTER_BASIS_CHANGED');
    expect(prepareAuthoringEdit(current(), { op: 'character.difference.update', characterId: saved.id, id: saved.differences![0]!.id, changes: { avatar: broken.avatar } })).toMatchObject({ ok: false });
    const source = { project: FixtureProject, characters: [saved] };
    expect(() => characterEdit(source, current(), [{ ...saved, differences: [{ ...saved.differences![0]!, figure: { assetId: figure.assetId, variantId: other.activeVariantId } }] }])).toThrow('does not belong');
    const older = { ...saved, differences: [{ ...saved.differences![0]!, avatar: broken.avatar }] };
    const legacy = characterEdit({ ...source, characters: [older] }, current().map(document => document.documentId === 'CharAA' ? json('CharAA', path, older) : document), [{ ...older, description: 'Updated profile' }]);
    expect(legacy.requiredRefs).toEqual([]);
    expect(legacy.expected).not.toContainEqual({ ref: { kind: 'document', id: 'IndexA' }, revision: 1 });
    const undo = unwrap(project.planUndo('CharAA', receipt.operationId));
    unwrap(project.undo(undo.planId));
    expect(data(current(), path).differences).toBeUndefined();
    unwrap(project.redo(undo.planId));
    expect(data(current(), path).differences[0]).toMatchObject({ figure, avatar: operation.avatar });
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
