import { afterEach, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FixtureAsset, FixtureCharacters, FixtureIds, FixtureProject, FixtureScenes, FixtureSnapshot, FixtureVoiceAssets } from '@galcraft/contracts/fixtures';
import { DefaultStudioPreferences } from '@galcraft/contracts';
import { replaceDialogueText, styleDialogueRange } from '@galcraft/contracts';
import type { Result, StudioBridge } from '@galcraft/contracts';
import { ProjectSession } from '@galcraft/documents';
import { compile, createCommandRegistry, parse } from '@galcraft/dsl';
import { AuthoringController, classifyAssetDrop, mergeDialoguePaste, previewDialoguePaste, queryDialogueText, reorderIds, resolveResume } from './controller.js';
import type { AuthoringServices, AuthoringSource, SceneSource } from './controller.js';

const root = resolve(import.meta.dirname, '../../../../tmp/testing/authoring-c');
const projectDocumentId = FixtureIds.projectA;
const sceneDocumentId = FixtureIds.streetDocument;
const firstId = FixtureIds.statements[0];
const secondId = FixtureIds.statements[1];
const sourceText = `say {speaker:{kind:"character",id:"${FixtureIds.an}"}, text:"原句", voice:"${FixtureIds.voices[0]}"} @${firstId};\n// 第一条说明\n` +
  `say {speaker:{kind:"narrator"}, text:"后句"} @${secondId};\n`;
const envelope = (id: string, data: unknown) => JSON.stringify({ schemaVersion: 1, documentId: id, revision: 1, data }, null, 2) + '\n';
let session: ProjectSession | null = null;

async function fresh(options: Parameters<typeof ProjectSession.createProject>[3] = {}, initialText = sourceText) {
  await rm(root, { recursive: true, force: true });
  session = await ProjectSession.createProject(root, FixtureProject.projectId, [
    { documentId: projectDocumentId, revision: 1, format: 'json', files: { 'project.json': envelope(projectDocumentId, FixtureProject) } },
    ...FixtureCharacters.map((character,i)=>({documentId:`Actor${i}`,revision:1,format:'json' as const,files:{[`characters/${character.id}.json`]:envelope(`Actor${i}`,character)}})),
    { documentId: sceneDocumentId, revision: 1, format: 'dsl', files: {
      [`scenes/${FixtureIds.street}/scene.json`]: envelope(sceneDocumentId, FixtureScenes[0]),
      [`scenes/${FixtureIds.street}/script.gal`]: initialText,
    } },
    { documentId: FixtureIds.bookshopDocument, revision: 1, format: 'dsl', files: {
      [`scenes/${FixtureIds.bookshop}/scene.json`]: envelope(FixtureIds.bookshopDocument, FixtureScenes[1]),
      [`scenes/${FixtureIds.bookshop}/script.gal`]: '',
    } },
  ], options);
  const read = (): Result<AuthoringSource> => {
    const project = session!.readDocument(projectDocumentId)!;
    const scenes: SceneSource[] = [...session!.documents.values()].filter(document => document.format === 'dsl').map(document => {
      const meta = Object.entries(document.files).find(([path]) => path.endsWith('/scene.json'))![1];
      const scene = JSON.parse(meta).data as { id: string; name: string; chapterId: string };
      const text = Object.entries(document.files).find(([path]) => path.endsWith('/script.gal'))![1];
      return { sceneId: scene.id, documentId: document.documentId, revision: document.revision,
        savedRevision: document.savedRevision, dirty: document.dirty, name: scene.name, chapterId: scene.chapterId, text };
    });
    const createdCharacters = [...session!.documents.values()].flatMap(document => Object.entries(document.files)
      .filter(([path]) => path.startsWith('characters/') && path.endsWith('.json'))
      .map(([, text]) => JSON.parse(text).data));
    return { ok: true, value: { projectDocumentId, projectRevision: project.revision, projectSavedRevision: project.savedRevision,
      projectDirty: project.dirty, project: JSON.parse(project.files['project.json']!).data, scenes,
      characters: createdCharacters, variables: [...session!.documents.values()].flatMap(document => Object.entries(document.files)
        .filter(([path]) => path.startsWith('variables/') && path.endsWith('.json')).map(([, text]) => ({ ...JSON.parse(text).data, declaringSceneId: null }))) }, warnings: [] };
  };
  const docs = {
    list: async () => ({ok:true as const,value:[...session!.documents.values()],warnings:[]}),
    planEdit: async (input: Parameters<ProjectSession['planEdit']>[0]) => session!.planEdit(input),
    applyEdit: async (id: string, expected: Parameters<ProjectSession['applyEdit']>[1]) => session!.applyEdit(id, expected),
    planUndo: async (id: string, op?: string, paths?: string[]) => session!.planUndo(id, op, paths), planRedo: async (id: string, paths?: string[]) => session!.planRedo(id, paths),
    undo: async (id: string) => session!.undo(id), redo: async (id: string) => session!.redo(id),
    planSave: async (scope: Parameters<ProjectSession['planSave']>[0]) => session!.planSave(scope),
    save: async (id: string) => session!.save(id),
  };
  let savedPreferences = structuredClone(DefaultStudioPreferences);
  let resume: Parameters<StudioBridge['authoringPreferences']['writeWorkspace']>[0] | null = null;
  const preferences = {
    readWorkspace: async () => ({ ok: true, value: resume, warnings: [] } as const),
    writeWorkspace: async (record: NonNullable<typeof resume>) => { resume = record; return { ok: true, value: undefined, warnings: [] } as const; },
  };
  const services: AuthoringServices = {
    bridge: { documents: docs, authoringPreferences: preferences } as unknown as AuthoringServices['bridge'],
    read: async () => read(), queryAssets: async () => ({ ok: true, value: { items: [], total: 0, indexRevision: 1 }, warnings: [] }),
    readPreferences: async () => ({ ok: true, value: savedPreferences, warnings: [] }),
    writePreferences: async value => { savedPreferences = value; return { ok: true, value: undefined, warnings: [] }; },
  };
  return { controller: new AuthoringController(services), services, read, getResume: () => resume };
}
afterEach(async () => { if (session) await session.dispose('discard'); session = null; await rm(root, { recursive: true, force: true }); });

describe('M01 authoring over M02/M03', () => {
  it('rebases pending project fields and preserves the chosen workspace value on conflicts',async()=>{
    const {controller,services}=await fresh();await controller.open();const listed=await services.bridge.documents.list();if(!listed.ok)throw new Error(listed.error.message);
    expect((await controller.authorOperation({op:'project.update',changes:{description:'Workspace'}})).ok).toBe(true);
    expect((await controller.authorOperation({op:'project.update',changes:{name:'My name'}},listed.value)).ok).toBe(true);expect(controller.source!.project.description).toBe('Workspace');
    const conflict=await controller.authorOperation({op:'project.update',changes:{description:'My description'}},listed.value);expect(conflict).toMatchObject({ok:false,error:{code:'AUTHOR_CONFLICT'}});
    const resolved=await controller.authorOperation({op:'project.update',changes:{description:'My description'}},listed.value,'current');expect(resolved,JSON.stringify(resolved)).toMatchObject({ok:true});expect(controller.source!.project.description).toBe('Workspace');
  });
  it('switches mixed composite sources together and restores each original source with one undo', async () => {
    const target = { kind: 'object', id: 'Figure' }, animation = { type: 'galcraft.animation', version: 1, durationMs: 100, tracks: [{ path: '/x', mode: 'add', keyframes: [{ timeMs: 100, value: 10, easing: { family: 'linear', direction: 'in' } }] }] };
    const segments = [{ effects: { x: 10 }, durationMs: 100, easing: { family: 'linear', direction: 'in' } }];
    const text = `setComplexAnimation ${JSON.stringify({target,animationId:'Anim01',animation})} @${firstId};\nsetComplexAnimation ${JSON.stringify({target,animationId:'Anim02',segments})} @${secondId};\n`;
    const { controller } = await fresh({}, text); session!.registerDocument({documentId:'Assets',revision:1,format:'json',files:{'assets/index.json':envelope('Assets',{assets:[{...FixtureAsset,id:'Asset1',kind:'animation'}]})}}); await controller.open(); controller.select([firstId!, secondId!]);
    const changedResult=await controller.editFields([{field:'resourceId',op:'set',value:'Asset1'}]);expect(changedResult,JSON.stringify(changedResult)).toMatchObject({ok:true});
    const changed = parse({documentId:sceneDocumentId,revision:controller.scene!.revision,text:controller.scene!.text});
    for (const statement of changed.statements) { expect(statement.args.resourceId).toBe('Asset1'); expect(statement.args.animation).toBeUndefined(); expect(statement.args.segments).toBeUndefined(); }
    expect((await controller.undo()).ok).toBe(true); expect(controller.scene!.text).toBe(text);
  });
  it('clears styled prose, undoes it and reopens its controlled segments through real M02 disk storage', async () => {
    const { controller } = await fresh(); await controller.open(); controller.select([firstId]);
    const content = styleDialogueRange('星空 hello', 0, 2, { ruby: 'ほしぞら', bold: true });
    expect((await controller.editFields([{ field:'text',op:'set',value:content }])).ok).toBe(true);
    expect(controller.parsed()!.readOnly).toBe(false);
    expect(queryDialogueText(controller.source!, '星空').items[0]?.context?.current).toBe('星空 hello');
    expect((await controller.editFields([{ field:'text',op:'set',value:replaceDialogueText(content,'') }])).ok).toBe(true);
    expect(parse({documentId:sceneDocumentId,revision:controller.scene!.revision,text:controller.scene!.text}).statements[0]!.args.text).toBe('');
    expect((await controller.undo()).ok).toBe(true);
    expect(parse({documentId:sceneDocumentId,revision:controller.scene!.revision,text:controller.scene!.text}).statements[0]!.args.text).toEqual(content);
    expect((await controller.save()).ok).toBe(true);
    await session!.dispose('discard'); session=await ProjectSession.open(root,FixtureProject.projectId);
    const saved=session.readDocument(sceneDocumentId)!;
    expect(parse({documentId:sceneDocumentId,revision:saved.revision,text:saved.files[`scenes/${FixtureIds.street}/script.gal`]!}).statements[0]!.args.text).toEqual(content);
  });
  it('undoes an external plugin edit through the shared project history', async () => {
    const { controller } = await fresh(); await controller.open(); controller.select([firstId]);
    expect((await controller.editFields([{ field: 'text', op: 'set', value: '作者已改的台词' }])).ok).toBe(true);
    const document = session!.readDocument(projectDocumentId)!;
    const planned = session!.planEdit({ label: '插件更新作品名称', origin: 'plugin', expected: [{ ref: { kind: 'document', id: projectDocumentId }, revision: document.revision }], patches: [{ kind: 'json', documentId: projectDocumentId, changes: [{ path: '/data/name', op: 'set', before: FixtureProject.name, after: '插件配置后的作品' }] }], preparedAssets: [], requiredRefs: [] });
    expect(planned.ok).toBe(true); if (!planned.ok) return;
    const applied = session!.applyEdit(planned.value.planId, planned.value.input.expected); expect(applied.ok).toBe(true); if (!applied.ok) return;
    await controller.acceptExternalEdit(applied.value, projectDocumentId); expect(controller.source!.project.name).toBe('插件配置后的作品');
    expect((await controller.undo({ documentId: projectDocumentId, paths: ['/data/name'] })).ok).toBe(true); expect(controller.source!.project.name).toBe(FixtureProject.name); expect(controller.scene!.text).toContain('作者已改的台词');
  });
  it('keeps the selected scene history after an external edit to another document', async () => {
    const { controller } = await fresh(); await controller.open(); controller.select([firstId]);
    expect((await controller.editFields([{ field: 'text', op: 'set', value: '页面一' }])).ok).toBe(true);
    expect((await controller.editFields([{ field: 'text', op: 'set', value: '页面二' }])).ok).toBe(true);
    const project = session!.readDocument(projectDocumentId)!;
    const input = { label: '发行版本', origin: 'field' as const, expected: [{ ref: { kind: 'document' as const, id: projectDocumentId }, revision: project.revision }], patches: [{ kind: 'json' as const, documentId: projectDocumentId, changes: [{ path: '/data/releaseVersion', before: FixtureProject.releaseVersion, after: '1.0.1', op: 'set' as const }] }], preparedAssets: [], requiredRefs: [] };
    const planned = session!.planEdit(input); if (!planned.ok) throw new Error(planned.error.message);
    const applied = session!.applyEdit(planned.value.planId, input.expected); if (!applied.ok) throw new Error(applied.error.message);
    await controller.acceptExternalEdit(applied.value, projectDocumentId);
    for (let count=0;count<2;count++) expect((await controller.undo()).ok).toBe(true);
    expect(controller.scene!.text).toBe(sourceText); expect(controller.source!.project.releaseVersion).toBe('1.0.1');
    controller.selectScene(FixtureIds.bookshop); expect((await controller.undo()).ok).toBe(false);
    controller.selectScene(FixtureIds.street);
    for (const text of ['页面一','页面二']) { expect((await controller.redo()).ok).toBe(true); expect(controller.scene!.text).toContain(text); }
    expect(controller.source!.project.releaseVersion).toBe('1.0.1');
  });
  it('restores omitted and explicit switches byte for byte with two genuine history operations', async () => {
    const spec=createCommandRegistry(FixtureProject.engineVersion).get('say')!.fields.find(field=>field.path==='append')!;
    const {controller}=await fresh();await controller.open();controller.select([firstId]);
    const first=await controller.editBooleanField(spec,true);expect(first.ok).toBe(true);
    const enabled=controller.scene!.text;expect(enabled).toContain('append: true');
    const second=await controller.editBooleanField(spec,false);expect(second.ok).toBe(true);
    expect(controller.scene!.text).toBe(sourceText);expect(controller.scene!.dirty).toBe(false);
    if(first.ok&&second.ok)expect(first.value.operationId).not.toBe(second.value.operationId);
    expect((await controller.undo()).ok).toBe(true);expect(controller.scene!.text).toBe(enabled);
    expect((await controller.undo()).ok).toBe(true);expect(controller.scene!.text).toBe(sourceText);
    expect((await controller.redo()).ok).toBe(true);expect(controller.scene!.text).toBe(enabled);
    expect((await controller.redo()).ok).toBe(true);expect(controller.scene!.text).toBe(sourceText);
    expect((await controller.undo()).ok).toBe(true);expect(controller.scene!.text).toBe(enabled);
    expect((await controller.editBooleanField(spec,false)).ok).toBe(true);
    expect(controller.scene!.text).toBe(sourceText);expect(controller.scene!.dirty).toBe(false);
  });
  it('keeps an explicit false switch and restores omission around another edited field', async () => {
    const spec=createCommandRegistry(FixtureProject.engineVersion).get('say')!.fields.find(field=>field.path==='append')!;
    const explicit=sourceText.replace('text:"原句"','append : false, text:"原句"');
    const {controller}=await fresh({},explicit);await controller.open();controller.select([firstId]);
    expect((await controller.editBooleanField(spec,true)).ok).toBe(true);
    expect((await controller.editBooleanField(spec,false)).ok).toBe(true);expect(controller.scene!.text).toBe(explicit);
    const originalNode=controller.parsed()!.parsed.cst.find(node=>node.id===secondId)!.raw;controller.select([secondId]);
    expect((await controller.editBooleanField(spec,true)).ok).toBe(true);
    expect((await controller.editFields([{field:'text',op:'set',value:'独立改句'}])).ok).toBe(true);
    expect((await controller.editBooleanField(spec,false)).ok).toBe(true);
    expect(controller.parsed()!.parsed.cst.find(node=>node.id===secondId)!.raw).toBe(originalNode.replace('后句','独立改句'));
  });
  it('starts a new boolean source form after a successful manual script edit', async () => {
    const spec=createCommandRegistry(FixtureProject.engineVersion).get('say')!.fields.find(field=>field.path==='append')!;
    const {controller}=await fresh();await controller.open();controller.select([firstId]);
    expect((await controller.editBooleanField(spec,true)).ok).toBe(true);
    const explicit=controller.scene!.text.replace('append: true','append : false');
    expect((await controller.editScript(explicit)).ok).toBe(true);
    expect((await controller.editBooleanField(spec,true)).ok).toBe(true);
    expect((await controller.editBooleanField(spec,false)).ok).toBe(true);
    expect(controller.scene!.text).toBe(explicit);expect(controller.scene!.dirty).toBe(true);
  });
  it('preserves another scene\'s boolean source form when a script is committed', async () => {
    const spec=createCommandRegistry(FixtureProject.engineVersion).get('say')!.fields.find(field=>field.path==='append')!;
    const {controller}=await fresh();await controller.open();controller.select([firstId]);
    expect((await controller.editBooleanField(spec,true)).ok).toBe(true);
    expect((await controller.editScript(`say {text:"另一场景"} @${secondId};\n`,FixtureIds.bookshop)).ok).toBe(true);
    expect((await controller.editBooleanField(spec,false)).ok).toBe(true);
    expect(controller.scene!.text).toBe(sourceText);expect(controller.scene!.dirty).toBe(false);
  });
  it.each(['EDIT_REJECTED','CANCELLED'])('keeps the boolean source form when a script edit returns %s', async code => {
    const spec=createCommandRegistry(FixtureProject.engineVersion).get('say')!.fields.find(field=>field.path==='append')!;
    const {controller,services}=await fresh();await controller.open();controller.select([firstId]);
    expect((await controller.editBooleanField(spec,true)).ok).toBe(true);
    const planEdit=services.bridge.documents.planEdit;
    services.bridge.documents.planEdit=async()=>({ok:false,error:{code,message:'脚本未提交',severity:'error',owner:'M02',related:[],actions:[]},issues:[]});
    expect((await controller.editScript(controller.scene!.text.replace('append: true','append: false'))).ok).toBe(false);
    services.bridge.documents.planEdit=planEdit;
    expect((await controller.editBooleanField(spec,false)).ok).toBe(true);
    expect(controller.scene!.text).toBe(sourceText);expect(controller.scene!.dirty).toBe(false);
  });
  it('uses a true schema default as the omitted switch value', async () => {
    const spec=createCommandRegistry(FixtureProject.engineVersion).get('bgm')!.fields.find(field=>field.path==='loop')!;
    expect(spec.default).toBe(true);
    const text=`bgm {op:"play",assetId:"${FixtureIds.voices[0]}"} @${firstId};\n`;
    const {controller}=await fresh({},text);await controller.open();controller.select([firstId]);
    expect((await controller.editBooleanField(spec,false)).ok).toBe(true);expect(controller.scene!.text).toContain('loop: false');
    expect((await controller.editBooleanField(spec,true)).ok).toBe(true);expect(controller.scene!.text).toBe(text);
  });
  it('inserts a Live2D figure and binds locale voice through undoable M02 edits', async () => {
    const { controller, services } = await fresh({ resolveRequiredRef: (ref, documents) => ref.kind === 'asset' &&
      [...documents.values()].some(document => document.files['assets/index.json'] &&
        JSON.parse(document.files['assets/index.json']).data.assets.some((asset: { id: string }) => asset.id === ref.id)) });
    const indexId = crypto.randomUUID(), model = { ...FixtureAsset, id: crypto.randomUUID(), kind: 'live2d' as const }, voice = FixtureVoiceAssets[1]!;
    const plan = session!.planEdit({ label: '准备素材', origin: 'batch', expected: [], requiredRefs: [], preparedAssets: [],
      patches: [{ kind: 'document', documentId: indexId, op: 'create', before: null, after: { format: 'json',
        files: { 'assets/index.json': envelope(indexId, { assets: [FixtureAsset, model, ...FixtureVoiceAssets] }) } } }] });
    if (!plan.ok) throw new Error(plan.error.message);
    expect(session!.applyEdit(plan.value.planId, []).ok).toBe(true);
    const remembered: string[][] = [];
    services.recordAssetUse = async input => { remembered.push(input.assetIds); return { ok: true, value: undefined, warnings: [] }; };
    await controller.open(); controller.select([firstId]);
    const inserted = await controller.insertAssetCommand(model, 'figure', firstId, { characterId: FixtureIds.an });
    expect(inserted.ok, inserted.ok ? undefined : inserted.error.message).toBe(true);
    const figure = controller.parsed()!.parsed.cst.find(node => node.command === 'changeFigure')!;
    expect(figure.object?.value).toMatchObject({ op: 'show', assetId: model.id, characterId: FixtureIds.an, station: 'center' });
    expect(remembered).toEqual([[model.id]]);
    expect((await controller.insertAssetCommand(FixtureAsset, 'figure', firstId, { characterId: FixtureIds.an, station: 'right' })).ok).toBe(true);
    const bound = await controller.insertAssetCommand(voice, 'voice', firstId, { locale: 'ja' });
    expect(bound.ok).toBe(true);
    const dialogue = controller.parsed()!.parsed.cst.find(node => node.id === firstId)!;
    expect(dialogue.object?.value).toMatchObject({ text: '原句', voice: FixtureIds.voices[0], voiceByLocale: { ja: voice.id } });
    const compiled = compile({ projectId: FixtureProject.projectId, engineVersion: FixtureProject.engineVersion,
      lock: FixtureSnapshot.lock, project: FixtureProject, scenes: FixtureScenes, characters: FixtureCharacters,
      variables: FixtureSnapshot.variables, assets: [FixtureAsset, model, ...FixtureVoiceAssets], gallery: [], flows: [],
      template: FixtureSnapshot.template, cancelOperationId: crypto.randomUUID(),
      documents: controller.source!.scenes.map(scene => ({ documentId: scene.documentId, revision: scene.revision,
        kind: 'scene', sceneId: scene.sceneId, text: scene.text })) });
    expect(compiled.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    expect(compiled.snapshot?.assets.some(asset => asset.assetId === model.id && asset.kind === 'live2d')).toBe(true);
    expect((await controller.undo()).ok).toBe(true);
    expect(controller.parsed()!.parsed.cst.find(node => node.id === firstId)?.object?.value).not.toHaveProperty('voiceByLocale');
    expect((await controller.insertAssetCommand(voice, 'voice', figure.id!)).ok).toBe(false);
    expect(remembered).toEqual([[model.id], [FixtureAsset.id], [voice.id]]);
    expect(classifyAssetDrop(FixtureAsset, 'stage', null).ok).toBe(true);
    expect(classifyAssetDrop(FixtureAsset, 'card', 'changeFigure').ok).toBe(true);
    expect(classifyAssetDrop(model, 'stage', null).ok).toBe(true);
    expect(classifyAssetDrop(model, 'card', 'changeFigure').ok).toBe(true);
    expect(classifyAssetDrop(model, 'card', 'changeBg').ok).toBe(false);
    expect(classifyAssetDrop({ ...FixtureAsset, kind: 'font' }, 'gap', null).ok).toBe(false);
  });
  it('reports incomplete coverage when text search includes an invalid scene', async () => {
    const { read } = await fresh(); const source = read(); if (!source.ok) throw new Error('fixture unavailable');
    source.value.scenes[1]!.text = `say {text:"broken" @${secondId};`;
    const page = queryDialogueText(source.value, '不存在');
    expect(page.total).toBe(0);
    expect(page.coverage).toEqual(expect.arrayContaining([expect.objectContaining({ documentId: FixtureIds.bookshopDocument, state: 'partial' })]));
  });
  it('keeps M02 save state separate from M03 compilation and unopened playtest', async () => {
    const { controller, services } = await fresh();
    services.compilePreview = async () => ({ ok: true, value: { snapshot: FixtureSnapshot, lastValid: FixtureSnapshot, current: true, issues: [] }, warnings: [] });
    await controller.open();
    expect(controller.status.compilation).toMatchObject({ state: 'current', snapshotId: FixtureSnapshot.snapshotId });
    expect(controller.status.preview).toBe('none');
    controller.status.save = 'saving'; await controller.refresh();
    expect(controller.status.save).toBe('saving');
    services.compilePreview = async () => ({ ok: true, value: { snapshot: null, lastValid: FixtureSnapshot, current: true, issues: [] }, warnings: [] });
    await controller.refresh();
    expect(controller.status.compilation.state).toBe('lastValid');
    expect(controller.status.preview).toBe('none');
  });
  it('edits a selected source field, keeps the existing voice and saves the actual M02 revision', async () => {
    const { controller, read } = await fresh(); expect((await controller.open()).ok).toBe(true);
    controller.select([firstId]);
    const edited = await controller.editFields([{ field: 'text', op: 'set', value: '新句' }]);
    expect(edited.ok).toBe(true);
    const working = read(); expect(working.ok && working.value.scenes[0]!.dirty).toBe(true);
    expect(controller.status.dirty).toBe(true);
    expect(controller.scene!.text).toContain('voice');
    expect(parse({ documentId: sceneDocumentId, revision: controller.scene!.revision, text: controller.scene!.text }).statements[0]!.args.text).toBe('新句');
    const saved = await controller.save(); expect(saved.ok).toBe(true);
    expect(controller.status.dirty).toBe(false);
    expect(session!.readDocument(sceneDocumentId, 'saved')!.files[`scenes/${FixtureIds.street}/script.gal`]).toContain('新句');
  });
  it('keeps invalid raw script editable while cards show the last valid source', async () => {
    const { controller } = await fresh(); await controller.open(); controller.parsed();
    expect((await controller.editScript('say { text:"broken" @' + firstId + ';')).ok).toBe(true);
    expect(controller.parsed()?.readOnly).toBe(true);
    expect(controller.parsed()?.parsed.statements[0]?.args.text).toBe('原句');
    expect((await controller.editFields([{ field: 'text', op: 'set', value: 'blocked' }], [firstId])).ok).toBe(false);
    expect((await controller.save()).ok).toBe(true);
    expect(session!.readRaw(sceneDocumentId, 'saved')!.raw).toContain('broken');
  });

  it('reuses the current scene parse while invalidating edited and reopened content', async () => {
    const { controller } = await fresh(); await controller.open();
    const original = controller.parsed()!.parsed;
    controller.select([firstId]);
    expect(controller.parsed()!.parsed).toBe(original);
    await controller.editScript(sourceText.replace('原句', '新句'));
    const changed = controller.parsed()!.parsed;
    expect(changed).not.toBe(original);
    expect(changed.statements[0]?.args.text).toBe('新句');
    expect(controller.parsed()!.parsed).toBe(changed);
    controller.close(); await controller.open();
    expect(controller.parsed()!.parsed).not.toBe(changed);
    expect(controller.parsed()!.parsed.statements[0]?.args.text).toBe('新句');
  });
  it('commits autosave to the project document and restores it with M02 undo/redo', async () => {
    const { controller } = await fresh(); await controller.open();
    const changed = await controller.setAutosave(false); expect(changed.ok).toBe(true);
    expect(controller.source?.project.player.autosave).toBe(false);
    const plan = session!.planUndo(projectDocumentId); expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(session!.undo(plan.value.planId).ok).toBe(true);
    expect(JSON.parse(session!.readDocument(projectDocumentId)!.files['project.json']!).data.player.autosave).toBe(true);
    expect(session!.redo(plan.value.planId).ok).toBe(true);
    const save = session!.planSave({ kind: 'current', documentId: projectDocumentId }); expect(save.ok).toBe(true);
    if (save.ok) expect((await session!.save(save.value.planId)).ok).toBe(true);
    expect(JSON.parse(session!.readDocument(projectDocumentId, 'saved')!.files['project.json']!).data.player.autosave).toBe(false);
  });
  it('uses stable IDs for a noncontinuous reorder and refuses the wrong drop type', () => {
    const ids = FixtureIds.statements;
    expect(reorderIds(ids, [ids[0]!, ids[2]!, ids[4]!, ids[6]!], null)).toEqual([ids[1], ids[3], ids[5], ids[7], ids[0], ids[2], ids[4], ids[6]]);
    expect(classifyAssetDrop(FixtureAsset, 'voice', 'say').ok).toBe(false);
  });
  it('previews recognized dialogue speakers and leaves unknown names unresolved', () => {
    const parsed = previewDialoguePaste('杏：早上好\n我：走吧\n旁白：风起', FixtureCharacters);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.map(line => line.speaker.kind)).toEqual(['character', 'character', 'narrator']);
    expect(previewDialoguePaste('陌生人：你好', FixtureCharacters).ok).toBe(false);
    const mapped = previewDialoguePaste('陌生人：你好', FixtureCharacters, { 陌生人: { kind: 'character', id: FixtureIds.an } });
    expect(mapped.ok && mapped.value[0]?.speaker).toEqual({ kind: 'character', id: FixtureIds.an });
    const merged = mergeDialoguePaste([{ speaker: { kind: 'character', id: FixtureIds.an }, text: '第一段' },
      { speaker: { kind: 'character', id: FixtureIds.an }, text: '第二段' }], [false, true]);
    expect(merged.ok && merged.value[0]?.text).toBe('第一段\n第二段');
    expect(mergeDialoguePaste([{ speaker: { kind: 'narrator' }, text: '旁白' },
      { speaker: { kind: 'character', id: FixtureIds.an }, text: '角色' }], [false, true]).ok).toBe(false);
  });
  it('creates a pasted speaker and dialogue in one M02 edit group', async () => {
    const { controller } = await fresh(); await controller.open();
    const id = crypto.randomUUID();
    const preview = previewDialoguePaste('陌生人：你好', controller.source!.characters, { 陌生人: { kind: 'character', id } });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const inserted = await controller.insertDialogue(preview.value, secondId, false, [{ id, name: '陌生人' }]);
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(inserted.value.documents).toHaveLength(2);
    expect(controller.source!.characters.find(item => item.id === id)?.name).toBe('陌生人');
    expect([...session!.documents.values()].some(document => `characters/${id}.json` in document.files)).toBe(true);
    expect(parse({ documentId: sceneDocumentId, revision: controller.scene!.revision, text: controller.scene!.text })
      .statements.some(statement => (statement.args.speaker as { id?: string } | undefined)?.id === id)).toBe(true);
    expect((await controller.undo()).ok).toBe(true);
    expect(controller.scene!.text).toBe(sourceText);
    expect([...session!.documents.values()].some(document => `characters/${id}.json` in document.files)).toBe(false);
  });
  it('inserts a Ctrl+Enter dialogue directly after the current stable statement', async () => {
    const { controller } = await fresh(); await controller.open();
    expect(controller.nextStatementId(firstId)).toBe(secondId);
    const inserted = await controller.insertDialogue([{ speaker: { kind: 'character', id: FixtureIds.an }, text: '' }],
      controller.nextStatementId(firstId), true);
    expect(inserted.ok).toBe(true);
    const parsed = parse({ documentId: sceneDocumentId, revision: controller.scene!.revision, text: controller.scene!.text });
    expect(parsed.cst.map(node => node.id)).toEqual([firstId, controller.selection?.primaryId, secondId]);
    expect(controller.nextStatementId(secondId)).toBeNull();
  });
  it('moves a statement with its comment and leaves stable voice/statement IDs', async () => {
    const { controller } = await fresh(); await controller.open();
    const moved = await controller.moveStatements([firstId], null); expect(moved.ok).toBe(true);
    const parsed = parse({ documentId: sceneDocumentId, revision: controller.scene!.revision, text: controller.scene!.text });
    expect(parsed.cst.map(node => node.id)).toEqual([secondId, firstId]);
    expect(controller.scene!.text.indexOf('// 第一条说明')).toBeGreaterThan(controller.scene!.text.indexOf(firstId));
    expect(parsed.statements[1]!.args.voice).toBe(FixtureIds.voices[0]);
    const undone = await controller.undo(); expect(undone.ok).toBe(true);
    expect(controller.scene!.text).toBe(sourceText);
  });
  it('moves a statement across scenes in one M02 edit group and undoes both documents together', async () => {
    const { controller } = await fresh(); await controller.open();
    const moved = await controller.moveToScene([firstId], FixtureIds.bookshop); expect(moved.ok).toBe(true);
    expect(controller.scene?.sceneId).toBe(FixtureIds.bookshop);
    expect(controller.scene?.text).toContain(firstId);
    expect(session!.readRaw(sceneDocumentId)?.raw).not.toContain(firstId);
    expect(session!.readRaw(FixtureIds.bookshopDocument)?.raw).toContain(FixtureIds.voices[0]);
    expect((await controller.undo()).ok).toBe(true);
    expect(session!.readRaw(sceneDocumentId)?.raw).toBe(sourceText);
    expect(session!.readRaw(FixtureIds.bookshopDocument)?.raw).toBe('');
  });
  it('moves a non-contiguous selection before a target instruction and restores both scenes with one undo', async () => {
    const extraId = 'ExtraA', targetId = 'Target', source = sourceText + `say {text:"第三句"} @${extraId};\n`;
    const { controller } = await fresh({}, source); await controller.open();
    controller.selectScene(FixtureIds.bookshop);
    expect((await controller.editScript(`say {text:"目标原句"} @${targetId};\n`)).ok).toBe(true);
    const originalTarget = controller.scene!.text;
    controller.selectScene(FixtureIds.street);
    const moved = await controller.moveToScene([extraId, firstId], FixtureIds.bookshop, targetId);
    expect(moved.ok).toBe(true);
    expect(controller.scene?.sceneId).toBe(FixtureIds.bookshop);
    expect(parse({ documentId: FixtureIds.bookshopDocument, revision: controller.scene!.revision, text: controller.scene!.text }).cst.map(node => node.id)).toEqual([firstId, extraId, targetId]);
    expect(controller.selection?.statementIds).toEqual(expect.arrayContaining([firstId, extraId]));
    expect(session!.readRaw(sceneDocumentId)?.raw).toContain(secondId);
    expect(session!.readRaw(sceneDocumentId)?.raw).not.toContain(firstId);
    expect(session!.readRaw(sceneDocumentId)?.raw).not.toContain(extraId);
    expect((await controller.undo()).ok).toBe(true);
    expect(session!.readRaw(sceneDocumentId)?.raw).toBe(source);
    expect(session!.readRaw(FixtureIds.bookshopDocument)?.raw).toBe(originalTarget);
  });
  it('deletes only the selected statement in one M02 undo group', async () => {
    const { controller } = await fresh(); await controller.open();
    expect((await controller.deleteStatements([secondId])).ok).toBe(true);
    expect(session!.readRaw(sceneDocumentId)?.raw).toContain(firstId);
    expect(session!.readRaw(sceneDocumentId)?.raw).not.toContain(secondId);
    expect((await controller.undo()).ok).toBe(true);
    expect(session!.readRaw(sceneDocumentId)?.raw).toBe(sourceText);
  });
  it('creates a scene document and chapter membership in one M02 edit and renames it', async () => {
    const { controller } = await fresh(); await controller.open();
    const created = await controller.createScene('新场景', FixtureIds.chapter); expect(created.ok).toBe(true);
    const scene = controller.scene!; expect(scene.name).toBe('新场景');
    expect(controller.source!.project.chapters[0]!.sceneIds).toContain(scene.sceneId);
    expect(session!.readDocument(scene.documentId)!.files[`scenes/${scene.sceneId}/script.gal`]).toBe('');
    expect((await controller.renameScene('改名')).ok).toBe(true);
    expect(controller.scene?.name).toBe('改名');
    const saved = await controller.save(); expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.value.saved.map(item => item.ref.id)).toEqual(expect.arrayContaining([scene.documentId, projectDocumentId]));
  });
  it('inserts and copies a command with new stable statement identity', async () => {
    const { controller } = await fresh(); await controller.open();
    expect((await controller.insertCommand('wait', { durationMs: 0 }, secondId)).ok).toBe(true);
    const before = parse({ documentId: sceneDocumentId, revision: controller.scene!.revision, text: controller.scene!.text });
    expect(before.cst.map(node => node.command)).toEqual(['say', 'wait', 'say']);
    expect((await controller.copyStatements([firstId])).ok).toBe(true);
    const after = parse({ documentId: sceneDocumentId, revision: controller.scene!.revision, text: controller.scene!.text });
    expect(after.cst).toHaveLength(4);
    expect(after.cst[3]!.id).not.toBe(firstId);
    expect(after.statements[3]!.args.voice).toBe(FixtureIds.voices[0]);
  });
  it('resolves moved statement identity before its old scene and persists a personal position separately', async () => {
    const { controller, getResume } = await fresh(); await controller.open(); controller.select([secondId]); await controller.flushResume();
    expect(getResume()?.caret.statementId).toBe(secondId);
    const value = controller.source!; const resume = getResume()!;
    const position = resolveResume(value, { ...resume, sceneId: FixtureIds.bookshop, documentId: FixtureIds.bookshopDocument });
    expect(position.statementId).toBe(secondId);
    expect(position.scene?.sceneId).toBe(FixtureIds.street);
    expect(session!.readDocument(sceneDocumentId)!.dirty).toBe(false);
  });
  it('commits a pending script to its original scene after navigation', async () => {
    const { controller } = await fresh(); await controller.open();
    controller.selectScene(FixtureIds.bookshop);
    const edited = await controller.editScript(sourceText.replace('原句', '失焦提交'), FixtureIds.street);
    expect(edited.ok).toBe(true);
    expect(controller.scene?.sceneId).toBe(FixtureIds.bookshop);
    expect(session!.readDocument(sceneDocumentId)!.files[`scenes/${FixtureIds.street}/script.gal`]).toContain('失焦提交');
    expect(session!.readDocument(FixtureIds.bookshopDocument)!.dirty).toBe(false);
  });
  it('persists actual caret and scroll anchors as personal workspace state', async () => {
    const { controller, getResume } = await fresh(); await controller.open();
    controller.setCaret(secondId, sourceText.indexOf('后句'));
    controller.setScroll(firstId, -12, 7);
    await controller.flushResume();
    expect(getResume()?.caret).toEqual({ statementId: secondId, field: 'text', offset: 0,
      documentOffset: sourceText.indexOf('后句') });
    expect(getResume()?.scroll).toEqual({ statementId: firstId, offsetPx: -12, scrollLeft: 7 });
  });
  it('resumes at the following stable statement when the saved statement was deleted', async () => {
    const { controller, getResume } = await fresh(); await controller.open(); controller.select([firstId]); await controller.flushResume();
    const resume = getResume()!;
    expect(resume.nextStatementId).toBe(secondId);
    expect((await controller.deleteStatements([firstId])).ok).toBe(true);
    const position = resolveResume(controller.source!, resume);
    expect(position.statementId).toBe(secondId);
    expect(position.moved).toBe(true);
  });
  it('reopens at the located statement when its saved scroll anchor was deleted', async () => {
    const { controller, services } = await fresh(); await controller.open();
    controller.select([secondId]); controller.setScroll(firstId, -20, 7); await controller.flushResume();
    expect((await controller.deleteStatements([firstId])).ok).toBe(true);
    controller.close();
    const reopened = new AuthoringController(services); await reopened.open();
    expect(reopened.selection?.primaryId).toBe(secondId);
    expect(reopened.scroll).toEqual({ statementId: secondId, offsetPx: 0, scrollLeft: 7 });
  });
  it('falls back to the next statement and scroll anchor after deleting the selected card', async () => {
    const { controller } = await fresh(); await controller.open(); controller.select([firstId]);
    controller.setScroll(firstId, -8, 5);
    expect((await controller.deleteStatements([firstId])).ok).toBe(true);
    expect(controller.selection?.primaryId).toBe(secondId);
    expect(controller.scroll).toEqual({ statementId: secondId, offsetPx: 0, scrollLeft: 5 });
  });
  it('clamps a reopened field caret to the current source text length', async () => {
    const { controller, getResume } = await fresh(); await controller.open(); controller.select([firstId]); await controller.flushResume();
    const resume = getResume()!;
    const position = resolveResume(controller.source!, { ...resume, caret: { ...resume.caret, field: 'text', offset: 50 } });
    expect(position.statementId).toBe(firstId);
    expect(position.offset).toBe(2);
  });
});


describe('protagonist name settings', () => {
  it('creates the progress string variable in the same edit and reuses its identity', async () => {
    const {controller}=await fresh();await controller.open();
    const name={characterId:FixtureIds.protagonist,defaultName:'春树',allowCustom:true,variableId:null,maxLength:24,promptPolicy:'always' as const};
    expect((await controller.setPlayerName(name)).ok).toBe(true);
    const variableId=controller.source!.project.player.name!.variableId;
    expect(variableId).toBeTruthy();
    expect(controller.source!.variables).toEqual(expect.arrayContaining([expect.objectContaining({id:variableId,type:'string',scope:'progress',initial:'春树'})]));
    expect((await controller.setPlayerName({...name,defaultName:'春日'})).ok).toBe(true);
    expect(controller.source!.project.player.name!.variableId).toBe(variableId);
    expect(controller.source!.variables).toHaveLength(1);
  });
  it('keeps character identity and reverts the configuration and new variable together', async () => {
    const {controller}=await fresh();await controller.open();
    expect((await controller.setPlayerName({characterId:FixtureIds.protagonist,defaultName:'主角',allowCustom:true,variableId:null,maxLength:24,promptPolicy:'always'})).ok).toBe(true);
    expect((await controller.undo({ documentId: projectDocumentId, paths: ['/data/player/name'] })).ok).toBe(true);
    expect(controller.source!.project.player.name).toBeUndefined();
    expect(controller.source!.variables).toHaveLength(0);
    expect(controller.source!.characters[0]!.id).toBe(FixtureCharacters[0]!.id);
  });
  it('rejects unavailable variables and invalid defaults before any commit', async () => {
    const {controller}=await fresh();await controller.open();const before=controller.source!.projectRevision;
    expect((await controller.setPlayerName({characterId:FixtureIds.protagonist,defaultName:'主角',allowCustom:true,variableId:FixtureIds.relation,maxLength:24,promptPolicy:'always'})).ok).toBe(false);
    expect((await controller.setPlayerName({characterId:FixtureIds.protagonist,defaultName:'过长姓名',allowCustom:false,variableId:null,maxLength:2,promptPolicy:'always'})).ok).toBe(false);
    expect(controller.source!.projectRevision).toBe(before);
  });
});
