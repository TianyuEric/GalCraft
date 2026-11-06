import { CharacterSchema, DialogueContentSchema, GalleryEntrySchema, PerformancePresetSchema, ProjectSchema, SceneSchema, createId, dialoguePlainText, replaceDialogueText, type DocumentView, type EditInput, type Json } from '@galcraft/contracts';
import { FixtureAsset, FixtureVoiceAssets, FixtureLock, FixtureCharacters, FixtureProject, FixtureScenes, fixtureId } from '@galcraft/contracts/fixtures';
import { createOfficialTemplate, createTemplateDocuments, readTemplateDocuments } from '@galcraft/templates';
import { applyTextEdits, parse, toDocumentPatch } from '@galcraft/dsl';
import { prepareAuthoringEdit } from '@galcraft/documents/authoring';
import type { AuthoringSource } from '../../../authoring/controller.js';
import type { InlineEvent, Project, ReviewSeed, Scene } from '../../../studio-r0/model.js';
import type { TextContents } from './text-range.js';
import { sourceAnchorMap } from './source-anchors.js';
import type { CandidateSourceRecovery } from './source-recovery.js';

export type CandidateSeed = { documents: DocumentView[]; taskRecovery?: Record<string,unknown>; sourceRecovery?: CandidateSourceRecovery; savedSourceRecovery?: CandidateSourceRecovery; presentation: Omit<Project, 'scenes'>; ui: ReviewSeed['ui']; sceneDocuments: Record<string, string>; extensionDocuments: Record<string, string> };
export type SceneExtension = { kind: 'candidate-scene-v1'; sceneId: string; background: string; cast: Scene['cast']; events: Record<string, InlineEvent[]> };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function envelope(documentId: string, path: string, data: unknown): DocumentView {
  const files = { [path]: JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data }, null, 2) + '\n' };
  return { documentId, revision: 1, savedRevision: 1, format: 'json', dirty: false, files, savedFiles: structuredClone(files) };
}
export function dataOf(document: DocumentView): unknown { return JSON.parse(Object.values(document.files)[0]!).data; }

/** Convert the review fixture once. The runtime never owns a writable ReviewStore. */
export function createCandidateSeed(review: ReviewSeed,nextId?:()=>string): CandidateSeed {
  const seed = structuredClone(review), ids = new Map<string, string>();
  for(const scene of seed.project.scenes) if(scene.background&&!seed.project.assets.some(asset=>asset.url===scene.background))seed.project.assets.push({id:`background-${scene.id}`,name:`${scene.name} 背景`,kind:'image',url:scene.background});
  if(seed.project.assets.length)seed.project.assets.push({id:'candidate-spring-music',name:'春灯放映会 · 配乐',kind:'audio',url:'/practice/music/spring-01.opus'});
  let sequence = 0xc000;
  const allocate = () => nextId?.()??fixtureId(sequence++);
  const id = (old: string) => { if (!ids.has(old)) ids.set(old, allocate()); return ids.get(old)!; };
  const projectId = id(seed.project.id), chapterId = allocate();
  for (const character of seed.project.characters) character.id = id(character.id);
  for (const asset of seed.project.assets) { asset.id = id(asset.id); if (asset.characterId) asset.characterId = id(asset.characterId); }
  for (const scene of seed.project.scenes) {
    scene.id = id(scene.id);
    scene.cast = Object.fromEntries(Object.entries(scene.cast).map(([key, value]) => [id(key), value]));
    for (const line of scene.lines) {
      line.id = id(line.id); if (line.speakerId) line.speakerId = id(line.speakerId);
      for (const event of line.events) { event.id = id(event.id); if (event.characterId) event.characterId = id(event.characterId); }
    }
  }
  const documents: DocumentView[] = [envelope(allocate(), 'project.json', { ...structuredClone(FixtureProject), projectId, name: seed.project.name, entry: { sceneId: seed.project.scenes[0]!.id, labelId: null }, chapters: [{ id: chapterId, name: '春灯之夜', sceneIds: seed.project.scenes.map(scene => scene.id) }] })];
  const assets = seed.project.assets.map(asset => {
    const base = structuredClone(asset.kind === 'audio' ? FixtureVoiceAssets[0]! : FixtureAsset), variantId = allocate();
    return { ...base, id: asset.id, name: asset.name, characterId: asset.characterId ?? null, sceneIds: [], originalVariantId: variantId, activeVariantId: variantId, variants: [{ ...base.variants[0]!, id: variantId }] };
  });
  documents.push(envelope(allocate(), 'assets/index.json', { assets }));
  documents.push(envelope(allocate(), 'candidate/resources.json', { kind: 'candidate-resources-v1', locations: Object.fromEntries(seed.project.assets.map(asset => [asset.id, asset.url])) }));
  documents.push(envelope(allocate(),'candidate/appearances.json',{kind:'candidate-appearances-v1',appearances:Object.fromEntries(seed.project.characters.map(({id,name:_name,description:_description,...appearance})=>[id,appearance]))}));
  documents.push(envelope(allocate(), 'variables.json', { variables: [] }), envelope(allocate(), 'gallery.json', { entries: [] }));
  const template = createOfficialTemplate({ kind: 'standard', appearance: 'paper' }, allocate);
  documents.push(...createTemplateDocuments(template, allocate).map(document => ({ ...document, dirty: false, savedRevision: document.revision, savedFiles: structuredClone(document.files) })));
  documents.push(envelope(allocate(), 'dependencies.lock.json', { ...structuredClone(FixtureLock), plugins: [], template: template.dependencies.find(item => item.kind === 'template')! }));
  for (const character of seed.project.characters) documents.push(envelope(allocate(), `characters/${character.id}.json`, { ...structuredClone(FixtureCharacters[0]!), id: character.id, name: character.name, description: character.description }));
  const sceneDocuments: Record<string, string> = {}, extensionDocuments: Record<string, string> = {};
  for (const scene of seed.project.scenes) {
    const documentId = allocate(), extensionId = allocate(); sceneDocuments[scene.id] = documentId; extensionDocuments[scene.id] = extensionId;
    const document = envelope(documentId, `scenes/${scene.id}/scene.json`, { ...FixtureScenes[0]!, id: scene.id, chapterId, name: scene.name });
    document.format = 'dsl';
    const opening:string[]=[];
    const background=seed.project.assets.find(asset=>asset.url===scene.background);
    if(background)opening.push(`changeBg ${JSON.stringify({op:'show',assetId:background.id})} @${allocate()};`);
    for(const[characterId,appearance]of Object.entries(scene.cast)){const figure=seed.project.assets.find(asset=>asset.characterId===characterId&&asset.expression===appearance.expression)??seed.project.assets.find(asset=>asset.characterId===characterId);if(figure&&appearance.visible)opening.push(`changeFigure ${JSON.stringify({op:'show',assetId:figure.id,objectId:allocate(),characterId,station:appearance.x<-.1?'left':appearance.x>.1?'right':'center'})} @${allocate()};`);}
    document.files[`scenes/${scene.id}/script.gal`] = [...opening,...scene.lines.map(line => `say ${JSON.stringify({ speaker: line.speakerId ? { kind: 'character', id: line.speakerId } : { kind: 'narrator' }, text: line.text })} @${line.id};`)].join('\n') + '\n';
    document.savedFiles = structuredClone(document.files); documents.push(document);
    const extension: SceneExtension = { kind: 'candidate-scene-v1', sceneId: scene.id, background: scene.background, cast: scene.cast, events: Object.fromEntries(scene.lines.map(line => [line.id, line.events])) };
    documents.push(envelope(extensionId, `candidate/scenes/${scene.id}.json`, extension));
  }
  seed.project.id = projectId;
  const remapSource = (source: ReviewSeed['ui']['selected']) => ({ ...source, documentId: id(source.documentId), id: id(source.id), ...(source.lineId ? { lineId: id(source.lineId) } : {}), ...(source.characterId ? { characterId: id(source.characterId) } : {}) });
  seed.ui.sceneId = id(seed.ui.sceneId); seed.ui.lineId = id(seed.ui.lineId); seed.ui.focusDocument = seed.ui.sceneId;
  seed.ui.selected = remapSource(seed.ui.selected);
  seed.ui.pins = Object.fromEntries(Object.entries(seed.ui.pins).map(([key, value]) => [key, remapSource(value)]));
  if (seed.ui.selection) seed.ui.selection.lineId = id(seed.ui.selection.lineId);
  seed.ui.preview.sceneId = id(seed.ui.preview.sceneId); seed.ui.preview.lineId = id(seed.ui.preview.lineId);
  seed.ui.sourceDrafts = {}; seed.ui.sourceErrors = {}; seed.ui.documentPositions = {};
  const { scenes: _scenes, ...presentation } = seed.project;
  return { documents, presentation, ui: seed.ui, sceneDocuments, extensionDocuments };
}

/** A new work starts from the official template and empty author content. */
export function createEmptyCandidateSeed(base:CandidateSeed,name:string,options?:{template:'light'|'standard'|'rich';width:number;height:number;engineVersion:string}):CandidateSeed {
  const sceneId=createId(),ui=structuredClone(base.ui);
  ui.sceneId=sceneId;ui.lineId='';ui.focusDocument=sceneId;ui.selected={kind:'line',documentId:sceneId,id:''};ui.selection=null;ui.pins={};ui.sourceDrafts={};ui.sourceErrors={};ui.documentPositions={};ui.preview={...ui.preview,sceneId,lineId:'',offset:0,status:'stopped'};
  const seed=createCandidateSeed({project:{...base.presentation,id:createId(),name,characters:[],assets:[],scenes:[{id:sceneId,name:'第一幕',background:'',cast:{},lines:[]}]},ui},()=>createId());
  if(options){
    const project=seed.documents.find(document=>'project.json' in document.files)!,value=JSON.parse(project.files['project.json']!);
    value.data.canvas={...value.data.canvas,width:options.width,height:options.height};value.data.engineVersion=options.engineVersion;value.data.chapters[0].name='第一章';
    project.files['project.json']=JSON.stringify(value);project.savedFiles=structuredClone(project.files);
    const template=createOfficialTemplate({kind:options.template,appearance:'paper'},createId);
    seed.documents=seed.documents.filter(document=>!Object.keys(document.files).some(path=>path.startsWith('ui/')));
    seed.documents.push(...createTemplateDocuments(template,createId).map(document=>({...document,dirty:false,savedRevision:document.revision,savedFiles:structuredClone(document.files)})));
    const lock=seed.documents.find(document=>'dependencies.lock.json' in document.files)!,locked=JSON.parse(lock.files['dependencies.lock.json']!);
    locked.data.engine.version=options.engineVersion;locked.data.template=template.dependencies.find(item=>item.kind==='template');lock.files['dependencies.lock.json']=JSON.stringify(locked);lock.savedFiles=structuredClone(lock.files);
  }
  return copyCandidateIdentity(seed,name);
}
export function copyCandidateIdentity(base:CandidateSeed,name:string):CandidateSeed {
  const seed=structuredClone(base),id=createId();seed.presentation.id=id;seed.presentation.name=name;
  // Requests, connection handoffs and receipts belong to the original work identity.
  delete seed.taskRecovery;
  const document=seed.documents.find(document=>'project.json' in document.files)!;
  const value=JSON.parse(document.files['project.json']!);value.data.projectId=id;value.data.name=name;document.files['project.json']=JSON.stringify(value);document.savedFiles['project.json']=document.files['project.json']!;
  return seed;
}

export function authoringSource(documents: readonly DocumentView[]): AuthoringSource {
  const projectDoc = documents.find(document => 'project.json' in document.files)!;
  const project = ProjectSchema.parse(JSON.parse(projectDoc.files['project.json']!).data);
  const scenes = documents.filter(document => document.format === 'dsl').flatMap(document => {
    const entry = Object.entries(document.files).find(([path]) => path.endsWith('/scene.json'));
    if (!entry) return [];
    const scene = SceneSchema.parse(JSON.parse(entry[1]).data);
    return [{ sceneId: scene.id, documentId: document.documentId, revision: document.revision, savedRevision: document.savedRevision, dirty: document.dirty, chapterId: scene.chapterId, name: scene.name, text: document.files[`scenes/${scene.id}/script.gal`]! }];
  });
  const characters = documents.flatMap(document => Object.entries(document.files).filter(([path]) => path.startsWith('characters/')).map(([, raw]) => CharacterSchema.parse(JSON.parse(raw).data)));
  const index = documents.find(document => 'assets/index.json' in document.files);
  const variables = documents.flatMap(document => Object.entries(document.files).filter(([path])=>path.startsWith('variables/')&&path.endsWith('.json')).map(([,raw])=>JSON.parse(raw).data as import('@galcraft/contracts').Variable));
  const assets = documentData<{assets: import('@galcraft/contracts').Asset[]}>(documents, 'assets/index.json')?.assets ?? [];
  const order=new Map(project.chapters.flatMap(chapter=>chapter.sceneIds).map((id,index)=>[id,index]));scenes.sort((a,b)=>(order.get(a.sceneId)??Number.MAX_SAFE_INTEGER)-(order.get(b.sceneId)??Number.MAX_SAFE_INTEGER));
  const locals=documents.filter(document=>document.format==='dsl').flatMap(document=>Object.entries(document.files).filter(([path])=>path.endsWith('/scene.json')).flatMap(([,raw])=>{const scene=SceneSchema.parse(JSON.parse(raw).data);return scene.locals.map(variable=>({...variable,declaringSceneId:scene.id}));}));
  const references:NonNullable<AuthoringSource['references']>=assets.map(asset=>({kind:'asset',id:asset.id,name:asset.name}));
  for(const scene of scenes)for(const node of parse({documentId:scene.documentId,revision:scene.revision,text:scene.text}).cst){
    if(!node.valid||!node.id)continue;references.push({kind:'statement',id:node.id,name:`${scene.name} · ${node.command}`});
    const args=node.object?.value as Record<string,unknown>|undefined;
    const reference=node.command==='label'?{kind:'label' as const,id:args?.labelId}:['changeBg','changeFigure','changeIllustration'].includes(node.command)&&(args?.op??'show')==='show'?{kind:'object' as const,id:args?.objectId}:node.command==='playEffect'&&args?.op==='play'?{kind:'effect' as const,id:args.soundId}:null;
    if(reference&&typeof reference.id==='string')references.push({...reference,id:reference.id,name:`${scene.name} · ${node.command}`});
  }
  for(const document of documents)for(const [path,raw] of Object.entries(document.files)){
    if(path.startsWith('gallery/')&&path.endsWith('.json')){const gallery=GalleryEntrySchema.parse(JSON.parse(raw).data);references.push({kind:'gallery',id:gallery.id,name:gallery.name},...(gallery.differences??[]).map(difference=>({kind:'galleryDifference' as const,id:difference.id,name:`${gallery.name} · ${difference.name}`})));}
    if(path.startsWith('presentation/presets/')&&path.endsWith('.json')){const preset=PerformancePresetSchema.parse(JSON.parse(raw).data);references.push({kind:'preset',id:preset.id,name:preset.name});}
  }
  try{const template=readTemplateDocuments([...documents]);references.push(...template.pages.map(page=>({kind:'page' as const,id:page.id,name:page.key})),...template.styles.map(style=>({kind:'style' as const,id:style.id,name:style.name})));}catch{/* Template errors are reported by compilation. */}
  return { projectDocumentId: projectDoc.documentId, projectRevision: projectDoc.revision, projectSavedRevision: projectDoc.savedRevision, projectDirty: projectDoc.dirty, project, scenes, characters, variables: [...variables.map(variable => ({...variable, declaringSceneId:null})),...locals], references, ...(index ? {assetIndexDocumentId:index.documentId,assetIndexRevision:index.revision} : {}), anyDirty: documents.some(document => document.dirty), documentVersions: documents.map(document => ({ documentId: document.documentId, revision: document.revision })) };
}

export function documentData<T>(documents: readonly DocumentView[], path: string): T | undefined { const document = documents.find(item => path in item.files); return document ? JSON.parse(document.files[path]!).data as T : undefined; }
export function sceneExtension(documents: readonly DocumentView[], sceneId: string): SceneExtension { return documentData<SceneExtension>(documents, `candidate/scenes/${sceneId}.json`) ?? {kind:'candidate-scene-v1',sceneId,background:'',cast:{},events:{}}; }

export function projectProjection(documents: readonly DocumentView[], seed: CandidateSeed): Project {
  const source = authoringSource(documents);
  const locations = documentData<{locations:Record<string,string>}>(documents,'candidate/resources.json')?.locations ?? {};
  const assets = documentData<{assets: import('@galcraft/contracts').Asset[]}>(documents,'assets/index.json')?.assets ?? [];
  const appearances=documentData<{appearances:Record<string,Omit<Project['characters'][number],'id'|'name'|'description'>>}>(documents,'candidate/appearances.json')?.appearances??{};
  return { ...seed.presentation, name: source.project.name, characters: source.characters.map(character=>({...(appearances[character.id]??{prefix:'',outfit:'default',expression:'neutral',parts:[],autoMouth:false,autoBlink:false}),id:character.id,name:character.name,description:character.description})), assets: assets.filter(asset => asset.kind==='image'||asset.kind==='audio').map(asset => ({...seed.presentation.assets.find(item=>item.id===asset.id),id:asset.id,name:asset.name,kind:asset.kind as 'image'|'audio',url:locations[`${asset.id}/${asset.activeVariantId}`]??(asset.activeVariantId===asset.variants[0]?.id?locations[asset.id]??'':''),...(asset.characterId?{characterId:asset.characterId}:{})})), scenes: source.scenes.map(scene => {
    const extension = sceneExtension(documents, scene.sceneId);
    const parsed = parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text });
    const lines = parsed.cst.flatMap(node => {
      if (!node.valid || node.command !== 'say' || !node.id || !node.object) return [];
      const args = node.object.value as Record<string, unknown>, text = DialogueContentSchema.safeParse(args.text);
      const speaker = args.speaker as { kind?: string; id?: string } | undefined;
      return [{ id: node.id, speakerId: speaker?.kind === 'character' ? speaker.id ?? null : null, text: text.success ? dialoguePlainText(text.data) : '', events: extension.events[node.id] ?? [] }];
    });
    return { id: scene.sceneId, name: scene.name, background: extension.background, cast: extension.cast, lines };
  }) };
}

/** Exact text changes use the existing semantic editor. Structural changes retain non-dialogue source. */
export function prepareCandidateEdit(documents: DocumentView[], seed: CandidateSeed, before: Project, after: Project, label: string, contents: TextContents = {}): EditInput {
  const input: EditInput = { label, origin: 'field', expected: [], patches: [], preparedAssets: [], requiredRefs: [] };
  const touch = (document: DocumentView) => { if (!input.expected.some(item => item.ref.id === document.documentId)) input.expected.push({ ref: { kind: 'document', id: document.documentId }, revision: document.revision }); };
  for (const scene of after.scenes) {
    const previous = before.scenes.find(item => item.id === scene.id); if (!previous) throw new Error('本阶段通过已注册的场景文档编辑。');
    const document = documents.find(item => `scenes/${scene.id}/script.gal` in item.files)!;
    const path = `scenes/${scene.id}/script.gal`, raw = document.files[path]!;
    const parsed = parse({ documentId: document.documentId, revision: document.revision, text: raw });
    const edits: Parameters<typeof applyTextEdits>[1] = [];
    for (const line of previous.lines) {
      const next = scene.lines.find(item => item.id === line.id), node = parsed.cst.find(item => item.id === line.id)!;
      if (!next) { edits.push({ start: node.start, end: node.end, oldText: raw.slice(node.start, node.end), text: '' }); continue; }
      if (next.text === line.text && next.speakerId === line.speakerId && !(line.id in contents)) continue;
      const original = DialogueContentSchema.parse((node.object!.value as Record<string, unknown>).text);
      const content = contents[line.id] ?? replaceDialogueText(original, next.text);
      const changes: { field: string; op: 'set'; value: Json }[] = same(content, original) ? [] : [{ field: 'text', op: 'set', value: content }];
      if (next.speakerId !== line.speakerId) changes.push({ field: 'speaker', op: 'set', value: next.speakerId ? { kind: 'character', id: next.speakerId } : { kind: 'narrator' } });
      if (!changes.length) continue;
      const prepared = prepareAuthoringEdit(documents, { op: 'commands.fields', sceneId: scene.id, ids: [line.id], changes });
      if (!prepared.ok) throw new Error(prepared.error.message);
      for (const patch of prepared.value.patches) if (patch.kind === 'text') edits.push(...patch.edits.map(edit => ({ start: edit.start, end: edit.end, oldText: edit.before, text: edit.after })));
    }
    for (let index = 0; index < scene.lines.length; index++) {
      const line = scene.lines[index]!; if (previous.lines.some(item => item.id === line.id)) continue;
      const nextExisting = scene.lines.slice(index + 1).find(item => previous.lines.some(prior => prior.id === item.id));
      const priorExisting = scene.lines.slice(0, index).reverse().find(item => previous.lines.some(prior => prior.id === item.id));
      const at = priorExisting ? parsed.cst.find(node => node.id === priorExisting.id)!.end : nextExisting ? parsed.cst.find(node => node.id === nextExisting.id)!.start : raw.length;
      const originalIndex = nextExisting ? previous.lines.findIndex(item => item.id === nextExisting.id) - 1 : previous.lines.length - 1;
      const originNode = parsed.cst.find(node => node.id === previous.lines[originalIndex]?.id);
      const originalContent = DialogueContentSchema.safeParse((originNode?.object?.value as Record<string, unknown> | undefined)?.text);
      const content = contents[line.id] ?? (originalContent.success ? replaceDialogueText(originalContent.data, line.text) : line.text);
      const text = `\nsay ${JSON.stringify({ speaker: line.speakerId ? { kind: 'character', id: line.speakerId } : { kind: 'narrator' }, text: content })} @${line.id};\n`;
      const sibling = edits.find(edit => edit.start === at && edit.end === at);
      if (sibling) sibling.text += text; else edits.push({ start: at, end: at, oldText: '', text });
    }
    if (edits.length) { touch(document); input.patches.push(toDocumentPatch(document.documentId, edits)); }
    const extensionDoc = documents.find(item => `candidate/scenes/${scene.id}.json` in item.files);
    const old = sceneExtension(documents, scene.id);
    const next: SceneExtension = { ...old, background: scene.background, cast: scene.cast, events: Object.fromEntries(scene.lines.map(line => [line.id, line.events])) };
    if (!same(old, next)) { if (extensionDoc) { touch(extensionDoc); input.patches.push({ kind: 'json', documentId: extensionDoc.documentId, changes: [{ path: '/data', before: JSON.parse(JSON.stringify(old)), after: JSON.parse(JSON.stringify(next)), op: 'set' }] }); } else { const created=envelope(createId(),`candidate/scenes/${scene.id}.json`,next); input.patches.push({kind:'document',op:'create',documentId:created.documentId,before:null,after:{format:created.format,files:created.files}}); } }
  }
  const appearanceDocument=documents.find(document=>'candidate/appearances.json' in document.files);
  if(appearanceDocument){const old=dataOf(appearanceDocument) as {kind:string;appearances:Record<string,unknown>};const next={...old,appearances:Object.fromEntries(after.characters.map(({id,name:_name,description:_description,...appearance})=>[id,appearance]))};if(!same(old,next)){touch(appearanceDocument);input.patches.push({kind:'json',documentId:appearanceDocument.documentId,changes:[{path:'/data',op:'set',before:JSON.parse(JSON.stringify(old)),after:JSON.parse(JSON.stringify(next))}]});}}
  return input;
}

/** Source editing still enters AuthoringController.editScript; add candidate anchors to its one plan. */
export function withSourceAnchors(input: EditInput, documents: DocumentView[], _seed: CandidateSeed, graphDocuments = documents): EditInput {
  if (input.origin !== 'script') return input;
  const combined = structuredClone(input), scenes = authoringSource(documents).scenes;
  const beforeTexts = new Map<string, string>(), destinations = new Map<string, {sceneId:string;text:string}>();
  const texts=(scene: typeof scenes[number],raw:string)=>parse({documentId:scene.documentId,revision:scene.revision,text:raw}).cst.flatMap(node=>{
    const content=DialogueContentSchema.safeParse((node.object?.value as Record<string,unknown>|undefined)?.text);
    return node.command==='say'&&node.id&&content.success?[{id:node.id,text:dialoguePlainText(content.data)}]:[];
  });
  for(const scene of scenes){
    const baseline = authoringSource(graphDocuments).scenes.find(value => value.sceneId === scene.sceneId)?.text ?? scene.text;
    for(const item of texts(scene,baseline))beforeTexts.set(item.id,item.text);
    let raw=scene.text;
    for(const patch of input.patches)if(patch.kind==='text'&&patch.documentId===scene.documentId)raw=applyTextEdits(raw,patch.edits.map(edit=>({start:edit.start,end:edit.end,oldText:edit.before,text:edit.after})));
    const invalid = parse({documentId:scene.documentId,revision:scene.revision,text:raw}).issues.some(issue=>issue.severity==='error');
    for(const item of texts(scene,invalid ? baseline : raw))destinations.set(item.id,{sceneId:scene.sceneId,text:item.text});
  }
  const extensions=new Map(scenes.map(scene=>[scene.sceneId,{old:sceneExtension(documents,scene.sceneId),next:sceneExtension(documents,scene.sceneId)}]));
  for(const [sceneId,{old,next}]of extensions){
    for(const [id,events]of Object.entries(old.events)){
      const destination=destinations.get(id),before=beforeTexts.get(id);
      if(!destination||destination.sceneId!==sceneId)delete next.events[id];
      if(!destination)continue;
      const changed=structuredClone(events);
      if(before!==undefined&&before!==destination.text&&changed.length){const map=sourceAnchorMap(before,destination.text);for(const event of changed)event.offset=map(event.offset);}
      extensions.get(destination.sceneId)!.next.events[id]=changed;
    }
  }
  for(const [sceneId,{old,next}]of extensions){
    if(same(old,next))continue;
    const document=documents.find(item=>`candidate/scenes/${sceneId}.json` in item.files);
    // Explicit candidate patches (e.g. copy with freshly allocated event identities) already own this sidecar.
    if(document&&input.patches.some(patch=>patch.documentId===document.documentId))continue;
    if(document){combined.expected.push({ref:{kind:'document',id:document.documentId},revision:document.revision});combined.patches.push({kind:'json',documentId:document.documentId,changes:[{path:'/data',op:'set',before:JSON.parse(JSON.stringify(old)),after:JSON.parse(JSON.stringify(next))}]});}
    else {const created=envelope(createId(),`candidate/scenes/${sceneId}.json`,next);combined.patches.push({kind:'document',op:'create',documentId:created.documentId,before:null,after:{format:created.format,files:created.files}});}
  }
  return combined;
}
