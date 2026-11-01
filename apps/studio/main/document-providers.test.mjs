import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixtureId, FixtureCharacters, FixtureDsl, FixtureIds, FixtureProject, FixtureScenes } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import {ProjectSchema,CharacterSchema} from '@galcraft/contracts';
import { readTemplateDocuments } from '@galcraft/templates';
import { StudioHost } from './host.mjs';
import { ProjectAccess } from './project-access.mjs';
import { ProjectDocuments } from './document-providers.mjs';

const root = join(process.cwd(), '..', '..', 'tmp', 'testing', 'projects', 'b', 'studio-documents');
const userData = join(process.cwd(), '..', '..', 'tmp', 'testing', 'projects', 'b', 'studio-user-data');
const legacyRoot = join(root, '..', 'studio-legacy-documents');
const projectDocumentId = fixtureId(0xa01);
const envelope = (documentId, data) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data }, null, 2) + '\n';
let host;
let access;

it('creates authoring projects from the actual Web engine and records only its declared targets', async () => {
  let selected;
  const documents = new ProjectDocuments(new ProjectAccess(), undefined, { resolveEngine: async (version, target) => {
    selected = { version, target }; return { ok: true, value: { manifest: { targets: ['web'] } }, warnings: [] };
  } });
  const created = await documents.create({ path: root, name: 'Web-only authoring', template: 'light', width: 960, height: 540, engineVersion: '0.1.0' });
  expect(created.ok).toBe(true); expect(selected).toEqual({ version: '0.1.0', target: 'web' });
  const lock = JSON.parse([...documents.currentSession.documents.values()].find(document => document.files['dependencies.lock.json']).files['dependencies.lock.json']).data;
  expect(lock.engine.targets).toEqual(['web']);
  expect((await documents.close(documents.currentSessionId, 'save')).ok).toBe(true);
});

async function legacyProject(path, draftMenus,obsolete=false) {
  await rm(path, { recursive: true, force: true });
  const project = structuredClone(FixtureProject);
  delete project.languages.menus;
  if(obsolete){project.templateDocumentId='Legacy';project.player.emergencyImage=null;}
  const character=structuredClone(FixtureCharacters[0]);if(obsolete){character.canvas={width:1920,height:1080};character.appearance.costume='蓝色外套';}
  const session = await ProjectSession.createProject(path, project.projectId, [
    { documentId: projectDocumentId, revision: 1, format: 'json', files: { 'project.json': envelope(projectDocumentId, project) } },
    ...(obsolete?[{documentId:fixtureId(0xa02),revision:1,format:'json',files:{[`characters/${character.id}.json`]:envelope(fixtureId(0xa02),character)}}]:[]),
    ...FixtureScenes.map((scene, index) => {
      const documentId = index === 0 ? FixtureIds.streetDocument : FixtureIds.bookshopDocument;
      return { documentId, revision: 1, format: 'dsl', files: {
        [`scenes/${scene.id}/scene.json`]: envelope(documentId, scene), [`scenes/${scene.id}/script.gal`]: '',
      } };
    }),
  ]);
  if (draftMenus !== undefined) {
    const expected = [projectDocumentId, FixtureIds.streetDocument].map(id => ({ ref: { kind: 'document', id }, revision: 1 }));
    const plan = session.planEdit({ label: '崩溃前的作品修改', origin: 'field', expected, preparedAssets: [], requiredRefs: [], patches: [
      { kind: 'json', documentId: projectDocumentId, changes: [
        { path: '/data/name', before: project.name, after: '草稿中的作品名', op: 'set' },
        ...(draftMenus === null ? [] : [{ path: '/data/languages/menus', before: null, after: draftMenus, op: 'set' }]),
      ] },
      { kind: 'text', documentId: FixtureIds.streetDocument, edits: [{ start: 0, end: 0, before: '', after: '// 草稿中的正文\n' }] },
    ] });
    expect(plan.ok).toBe(true);
    expect(session.applyEdit(plan.value.planId, expected).ok).toBe(true);
  }
  expect((await session.dispose(draftMenus === undefined ? 'saved' : 'keep')).ok).toBe(true);
  return readFile(join(path, 'project.json'), 'utf8');
}

beforeAll(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(userData, { recursive: true, force: true });
  await rm(legacyRoot, { recursive: true, force: true });
  await ProjectSession.createProject(root, FixtureProject.projectId, [
    { documentId: projectDocumentId, revision: 1, format: 'json', files: { 'project.json': envelope(projectDocumentId, FixtureProject) } },
    { documentId: FixtureIds.streetDocument, revision: 1, format: 'dsl', files: {
      [`scenes/${FixtureIds.street}/scene.json`]: envelope(FixtureIds.streetDocument, FixtureScenes[0]),
      [`scenes/${FixtureIds.street}/script.gal`]: FixtureDsl.street,
    } },
    { documentId: fixtureId(0xa02), revision: 1, format: 'json', files: {
      [`characters/${FixtureIds.an}.json`]: envelope(fixtureId(0xa02), FixtureCharacters[0]),
    } },
  ]);
  access = new ProjectAccess();
  const documents = new ProjectDocuments(access);
  host = new StudioHost({
    userData, window: {}, shell: { openPath: async () => '' },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    safeStorage: { isEncryptionAvailable: () => true },
    projectAccess: access, projects: documents, documents,
  });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(userData, { recursive: true, force: true });
  await rm(legacyRoot, { recursive: true, force: true });
});

describe('Studio document host integration', () => {
  it.each(['restore','discard','conflict'])('normalizes removed authoring fields after legacy %s recovery without changing saved files',async choice=>{
    const path=join(legacyRoot,`authoring-${choice}`);await legacyProject(path,null,true);
    if(choice==='conflict'){const changed=JSON.parse(await readFile(join(path,'project.json'),'utf8'));changed.data.name='磁盘改名';await writeFile(join(path,'project.json'),JSON.stringify(changed));}
    const saved=await readFile(join(path,'project.json'),'utf8'),documents=new ProjectDocuments(new ProjectAccess());
    try{expect((await documents.open(path)).ok).toBe(true);
      if(choice==='conflict'){expect((await documents.recover('restore')).ok).toBe(false);expect((await documents.resolveRecoveryConflict('local')).ok).toBe(true);}
      else expect((await documents.recover(choice)).ok).toBe(true);
      const session=documents.currentSession,project=session.readDocument(projectDocumentId),character=session.readDocument(fixtureId(0xa02));
      expect(ProjectSchema.safeParse(JSON.parse(project.files['project.json']).data).success).toBe(true);
      const actual=JSON.parse(Object.values(character.files)[0]).data;expect(CharacterSchema.safeParse(actual).success).toBe(true);expect(actual.appearance.notes).toContain('蓝色外套');expect(actual.canvas).toBeUndefined();
      expect(project.savedFiles['project.json']).toBe(saved);expect(await readFile(join(path,'project.json'),'utf8')).toBe(saved);expect(session.operations.some(operation=>operation.label==='Normalize current authoring fields')).toBe(true);
    }finally{await documents.close(documents.currentSessionId,'discard');}
  });
  it('creates a rich project without automatic relationship variables or HUD',async()=>{
    const parent=join(root,'..','rich-core-variables');await rm(parent,{recursive:true,force:true});
    const documents=new ProjectDocuments(new ProjectAccess(),undefined,{resolveEngine:async()=>({ok:true,value:{version:'0.1.0',manifest:{targets:['web','windows']}},warnings:[]})});
    const opened=await documents.create({path:parent,name:'核心关系',template:'rich',width:1920,height:1080,engineVersion:'0.1.0'});
    expect(opened.ok).toBe(true);
    try {
      const listed=documents.list();expect(listed.ok).toBe(true);
      const template=readTemplateDocuments(listed.value),variableDocument=listed.value.find(document=>Object.keys(document.files).some(path=>path.startsWith('variables/')));
      expect(variableDocument).toBeUndefined();
      const walk=component=>[component,...component.children.flatMap(walk)];
      expect(walk(template.pages.find(page=>page.key==='story').root).some(component=>component.part==='story.variableHud')).toBe(false);
      expect(JSON.parse(listed.value.find(document=>document.files['dependencies.lock.json']).files['dependencies.lock.json']).data.plugins).toEqual([]);
    } finally {await documents.close(opened.value.sessionId,'discard');await rm(parent,{recursive:true,force:true});}
  });
  it('validates author references against business identities in the proposed working documents', async () => {
    const documents = new ProjectDocuments(new ProjectAccess());
    await documents.open(root);
    const expected = [{ ref: { kind: 'document', id: projectDocumentId }, revision: 1 }];
    const input = { label: '插件引用', origin: 'plugin', expected, preparedAssets: [], patches: [{
      kind: 'json', documentId: projectDocumentId,
      changes: [{ path: '/data/name', before: FixtureProject.name, after: '插件引用验证', op: 'set' }],
    }] };
    const wrong = documents.planEdit({ ...input, requiredRefs: [{ kind: 'character', id: fixtureId(0xa02) }] });
    expect(documents.applyEdit(wrong.value.planId, expected).error.code).toBe('REQUIRED_REF_MISSING');
    const removed = documents.planEdit({ ...input, expected: [...expected, { ref: { kind: 'document', id: fixtureId(0xa02) }, revision: 1 }],
      requiredRefs: [{ kind: 'character', id: FixtureIds.an }], patches: [...input.patches, {
        kind: 'document', documentId: fixtureId(0xa02), op: 'delete',
        before: { format: 'json', files: documents.currentSession.readDocument(fixtureId(0xa02)).files }, after: null,
      }] });
    expect(documents.applyEdit(removed.value.planId, removed.value.input.expected).error.code).toBe('REQUIRED_REF_MISSING');
    const known = documents.planEdit({ ...input, requiredRefs: [{ kind: 'character', id: FixtureIds.an }, { kind: 'scene', id: FixtureIds.street }] });
    expect(documents.applyEdit(known.value.planId, expected).ok).toBe(true);
    await documents.close(documents.currentSessionId, 'discard');
  });

  it('creates a project from an installed exact engine and reopens every document group', async () => {
    const parent = join(process.cwd(), '..', '..', 'tmp', 'testing', 'projects', 'b', 'studio-created');
    const projectRoot = join(parent, '新作品');
    await rm(projectRoot, { recursive: true, force: true });
    const createdAccess = new ProjectAccess();
    const createdDocuments = new ProjectDocuments(createdAccess, undefined, {
      resolveEngine: async () => ({ ok: true, value: { version: '0.1.0', manifest: { targets: ['web','windows'] } }, warnings: [] }),
    });
    const created = await createdDocuments.create({ path: parent, name: '新作品', template: 'sample',
      width: 1280, height: 720, engineVersion: '0.1.0' });
    expect(created.ok).toBe(true);
    const listed = createdDocuments.list();
    expect(listed.ok).toBe(true);
    expect(listed.value.some(document => document.files['project.json'])).toBe(true);
    const projectDocument = listed.value.find(document => document.files['project.json']);
    expect(JSON.parse(projectDocument.files['project.json']).data.languages).toMatchObject({ menus: ['zh-CN'], voices: [] });
    expect(projectDocument.dirty).toBe(false);
    expect(createdDocuments.currentSession.operations).toEqual([]);
    const template = readTemplateDocuments(listed.value);
    expect(template.features).toContain('flow');
    expect(template.pages.some(page => page.key === 'flow')).toBe(true);
    const components = root => [root, ...root.children.flatMap(components)];
    expect(components(template.pages.find(page => page.key === 'title').root).some(component => component.part === 'title.menu.flow')).toBe(true);
    expect(template.dependencies.filter(dependency => dependency.kind === 'plugin')).toEqual([]);
    expect(JSON.parse(listed.value.find(document => document.files['dependencies.lock.json']).files['dependencies.lock.json']).data.plugins).toEqual([]);
    expect(listed.value.some(document => Object.keys(document.files).some(path => path.endsWith('/script.gal')))).toBe(true);
    expect(listed.value.some(document => document.files['assets/index.json'])).toBe(true);
    expect((await createdDocuments.close(created.value.sessionId, 'save')).ok).toBe(true);
    expect((await createdDocuments.open(projectRoot)).ok).toBe(true);
    expect(createdDocuments.currentSession.dirtyIds()).toEqual([]);
    await createdDocuments.close(createdDocuments.currentSessionId, 'discard');
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('initializes legacy menu languages as a reviewable edit and persists only after saving', async () => {
    const path = join(legacyRoot, 'without-draft');
    const saved = await legacyProject(path);
    const documents = new ProjectDocuments(new ProjectAccess());
    try {
      expect((await documents.open(path)).ok).toBe(true);
      const session = documents.currentSession;
      const project = session.readDocument(projectDocumentId);
      expect(JSON.parse(project.files['project.json']).data).toEqual({
        ...JSON.parse(saved).data, languages: { ...FixtureProject.languages, menus: ['zh-CN', 'en', 'ja'] },
      });
      expect(project.dirty).toBe(true);
      expect(session.readDocument(projectDocumentId, 'saved').files['project.json']).toBe(saved);
      expect(await readFile(join(path, 'project.json'), 'utf8')).toBe(saved);
      const planned = documents.planSave({ kind: 'all' });
      expect(planned.ok).toBe(true);
      expect(planned.value.members).toEqual([projectDocumentId]);
      expect((await documents.save(planned.value.planId)).ok).toBe(true);
      expect(JSON.parse(await readFile(join(path, 'project.json'), 'utf8')).data.languages.menus).toEqual(['zh-CN', 'en', 'ja']);
    } finally { await documents.close(documents.currentSessionId, 'discard'); }
  });

  it.each(['restore', 'discard'])('opens legacy projects before applying the %s recovery choice, then initializes menu languages', async choice => {
    const path = join(legacyRoot, choice);
    const saved = await legacyProject(path, null);
    const draftPath = join(path, '.galcraft', 'recovery', 'draft.json');
    const draft = await readFile(draftPath, 'utf8');
    const documents = new ProjectDocuments(new ProjectAccess());
    try {
      const opened = await documents.open(path);
      expect(opened.ok).toBe(true);
      expect(opened.value.projectId).toBe(FixtureProject.projectId);
      const session = documents.currentSession;
      expect(session.readDocument(projectDocumentId).files['project.json']).toBe(saved);
      expect(session.dirtyIds()).toEqual([]);
      expect(session.operations).toEqual([]);
      expect(await readFile(draftPath, 'utf8')).toBe(draft);
      expect((await documents.listRecovery()).value).toEqual(JSON.parse(draft));
      expect(documents.planSave({ kind: 'all' })).toMatchObject({ ok: false, error: { code: 'RECOVERY_UNRESOLVED' } });
      expect(await session.dispose('saved')).toMatchObject({ ok: false, error: { code: 'RECOVERY_UNRESOLVED' } });

      expect((await documents.recover(choice)).ok).toBe(true);
      const project = session.readDocument(projectDocumentId);
      const working = JSON.parse(project.files['project.json']);
      expect(working.documentId).toBe(projectDocumentId);
      expect(working.data.projectId).toBe(FixtureProject.projectId);
      expect(working.data.name).toBe(choice === 'restore' ? '草稿中的作品名' : FixtureProject.name);
      expect(working.data.languages.menus).toEqual(['zh-CN', 'en', 'ja']);
      expect(project.dirty).toBe(true);
      expect(session.readDocument(projectDocumentId, 'saved')).toMatchObject({ revision: 1, files: { 'project.json': saved }, dirty: false });
      expect(session.readRaw(FixtureIds.streetDocument).raw).toBe(choice === 'restore' ? '// 草稿中的正文\n' : '');
      expect(session.operations.map(operation => operation.label)).toEqual(['初始化作品菜单语言支持列表']);
      expect(await readFile(join(path, 'project.json'), 'utf8')).toBe(saved);
      expect(await readFile(join(path, `scenes/${FixtureIds.street}/script.gal`), 'utf8')).toBe('');

      await session.writeDraft();
      const retained = JSON.parse(await readFile(draftPath, 'utf8'));
      expect(JSON.parse(retained.documents.find(document => document.documentId === projectDocumentId).files['project.json']).data).toEqual(working.data);
      if (choice === 'restore') expect(retained.documents.find(document => document.documentId === FixtureIds.streetDocument).files[`scenes/${FixtureIds.street}/script.gal`]).toBe('// 草稿中的正文\n');
      const planned = documents.planSave({ kind: 'all' });
      expect(planned.ok).toBe(true);
      expect(planned.value.members).toContain(projectDocumentId);
      expect((await documents.save(planned.value.planId)).ok).toBe(true);
      expect(JSON.parse(await readFile(join(path, 'project.json'), 'utf8')).data).toEqual(working.data);
      expect(await readFile(join(path, `scenes/${FixtureIds.street}/script.gal`), 'utf8')).toBe(choice === 'restore' ? '// 草稿中的正文\n' : '');
    } finally { await documents.close(documents.currentSessionId, 'discard'); }
  });

  it('preserves menu languages already present in the recovered draft', async () => {
    const path = join(legacyRoot, 'draft-menus');
    const saved = await legacyProject(path, ['zh-CN', 'ja']);
    const documents = new ProjectDocuments(new ProjectAccess());
    try {
      expect((await documents.open(path)).ok).toBe(true);
      expect((await documents.recover('restore')).ok).toBe(true);
      const project = documents.currentSession.readDocument(projectDocumentId);
      expect(JSON.parse(project.files['project.json']).data.languages.menus).toEqual(['zh-CN', 'ja']);
      expect(project.savedFiles['project.json']).toBe(saved);
      expect(documents.currentSession.operations).toEqual([]);
      expect(await readFile(join(path, 'project.json'), 'utf8')).toBe(saved);
    } finally { await documents.close(documents.currentSessionId, 'discard'); }
  });

  it('waits for a recovery conflict choice before initializing menus and retains the confirmed disk baseline', async () => {
    const path = join(legacyRoot, 'conflict');
    await legacyProject(path, null);
    const external = JSON.parse(await readFile(join(path, 'project.json'), 'utf8'));
    external.data.name = '磁盘上的作品名';
    const saved = JSON.stringify(external, null, 2) + '\n';
    await writeFile(join(path, 'project.json'), saved);
    const draftPath = join(path, '.galcraft', 'recovery', 'draft.json');
    const draft = await readFile(draftPath, 'utf8');
    const documents = new ProjectDocuments(new ProjectAccess());
    try {
      expect((await documents.open(path)).ok).toBe(true);
      expect(await documents.recover('restore')).toMatchObject({ ok: false, error: { code: 'RECOVERY_CONFLICT' } });
      expect(documents.currentSession.readDocument(projectDocumentId).files['project.json']).toBe(saved);
      expect(documents.currentSession.operations).toEqual([]);
      expect(await readFile(draftPath, 'utf8')).toBe(draft);
      expect((await documents.resolveRecoveryConflict('local')).ok).toBe(true);
      const project = documents.currentSession.readDocument(projectDocumentId);
      expect(JSON.parse(project.files['project.json']).data).toMatchObject({ name: '草稿中的作品名', languages: { menus: ['zh-CN', 'en', 'ja'] } });
      expect(project.savedFiles['project.json']).toBe(saved);
      expect(await readFile(join(path, 'project.json'), 'utf8')).toBe(saved);
      const planned = documents.planSave({ kind: 'all' });
      expect(planned.ok).toBe(true);
      expect((await documents.save(planned.value.planId)).ok).toBe(true);
    } finally { await documents.close(documents.currentSessionId, 'discard'); }
  });

  it('opens the same disk project, edits through the named bridge, undoes and saves', async () => {
    const opened = await host.call('projects', 'open', root);
    expect(opened.ok).toBe(true);
    expect(opened.value.projectId).toBe(FixtureProject.projectId);
    expect(access.getRoot(opened.value.sessionId)).toBe(root);
    expect((await host.call('projects', 'open', root)).value.sessionId).toBe(opened.value.sessionId);
    expect((await host.call('documents', 'listRecovery')).value).toBeNull();

    const expected = [{ ref: { kind: 'document', id: projectDocumentId }, revision: 1 }];
    const input = { label: '重命名作品', origin: 'field', expected, preparedAssets: [], requiredRefs: [], patches: [{
      kind: 'json', documentId: projectDocumentId,
      changes: [{ path: '/data/name', before: '春日来信', after: '春日来信·修订', op: 'set' }],
    }] };
    const planned = await host.call('documents', 'planEdit', input);
    expect(planned.ok).toBe(true);
    const applied = await host.call('documents', 'applyEdit', planned.value.planId, expected);
    expect(applied.ok).toBe(true);
    const undo = await host.call('documents', 'planUndo', projectDocumentId, applied.value.operationId);
    expect(undo.ok).toBe(true);
    expect((await host.call('documents', 'undo', undo.value.planId)).ok).toBe(true);
    expect((await host.call('documents', 'redo', undo.value.planId)).ok).toBe(true);

    const save = await host.call('documents', 'planSave', { kind: 'current', documentId: projectDocumentId });
    expect(save.ok).toBe(true);
    const external = JSON.parse(await readFile(join(root, 'project.json'), 'utf8'));
    external.data.name = '外部修改';
    await writeFile(join(root, 'project.json'), JSON.stringify(external, null, 2) + '\n');
    expect((await host.call('documents', 'save', save.value.planId)).error.code).toBe('EXTERNAL_CONFLICT');
    expect((await host.call('documents', 'getConflict', save.value.planId)).value.map(item => item.path)).toContain('project.json');
    expect((await host.call('documents', 'resolveConflict', save.value.planId, 'local')).ok).toBe(true);
    const replanned = await host.call('documents', 'planSave', { kind: 'current', documentId: projectDocumentId });
    expect((await host.call('documents', 'save', replanned.value.planId)).ok).toBe(true);
    expect(JSON.parse(await readFile(join(root, 'project.json'), 'utf8')).data.name).toBe('春日来信·修订');

    expect((await host.call('projects', 'close', opened.value.sessionId, 'cancel')).ok).toBe(true);
    expect(access.getRoot(opened.value.sessionId)).toBe(root);
    expect((await host.call('projects', 'close', opened.value.sessionId, 'save')).ok).toBe(true);
    expect(access.getRoot(opened.value.sessionId)).toBeNull();
    expect((await host.call('documents', 'planSave', { kind: 'all' })).error.code).toBe('PROJECT_SESSION_MISSING');
  });

  it('keeps the session attached when closing cannot finish', async () => {
    const opened = await host.call('projects', 'open', root);
    const session = host.documents.currentSession;
    const dispose = session.dispose.bind(session);
    session.dispose = async () => ({ ok: false, error: { code: 'SAVE_BUSY' }, issues: [] });
    const rejected = await host.call('projects', 'close', opened.value.sessionId, 'discard');
    expect(rejected.error.code).toBe('SAVE_BUSY');
    expect(access.getRoot(opened.value.sessionId)).toBe(root);
    session.dispose = dispose;
    expect((await host.call('projects', 'close', opened.value.sessionId, 'discard')).ok).toBe(true);
    expect(access.getRoot(opened.value.sessionId)).toBeNull();
  });
});
