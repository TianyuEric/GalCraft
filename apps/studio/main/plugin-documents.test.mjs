import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixtureId, FixtureAsset, FixtureLock, FixtureProject } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { ResourceRegistry } from '@galcraft/media-tools/resources';
import { ProjectAccess } from './project-access.mjs';
import { ProjectDocuments } from './document-providers.mjs';
import { PluginDocuments } from './plugin-documents.mjs';
import { StudioPluginPackages } from './plugin-packages.mjs';
import { pluginDocumentReferences } from './plugin-service-ports.mjs';
import { StudioAssets } from './asset-providers.mjs';

const testing = resolve(import.meta.dirname, '../../../tmp/testing/plugin-development');
const root = join(testing, 'projects/node-documents');
const evidence = resolve(import.meta.dirname, '../../../test-results/latest/plugin-development/node-documents.json');
const pluginId = 'org.example.definition-test';
const projectDocumentId = fixtureId(0xd01), lockId = fixtureId(0xd02);
const envelope = (documentId, data) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data });
const value = result => { if (!result.ok) throw new Error(JSON.stringify(result)); return result.value; };
let projects, plugins, documents, access;

beforeAll(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(join(testing, 'node-documents'), { recursive: true, force: true });
  const source = join(testing, 'node-documents/source');
  await mkdir(source, { recursive: true });
  const definition = `const ok = value => ({ok:true,value,warnings:[]});
  const document = (key, instances) => ({key, instances, titleKey:key, stateVersion:1,
    schema:{type:'object',properties:{title:{type:'string',minLength:1},target:{type:'string'},asset:{type:'string'}},required:['title','target'],additionalProperties:false},
    fields:[], initial:{title:'Initial',target:'${projectDocumentId}'},
    collectReferences:data=>[{kind:'document',id:data.target},...(data.asset?[{kind:'asset',id:data.asset}]:[])],
    rewriteReferences:(data,ids)=>ok({...data,target:ids[data.target]??data.target})});
  export function createDefinition() { return {documents:[document('${pluginId}/multiple','multiple'),document('${pluginId}/fixed','fixed')]}; }`;
  const forbidden = 'throw new Error("Definition consumers must not activate editor or runtime");';
  const files = { 'definition.mjs': definition, 'runtime.mjs': forbidden, 'editor.mjs': forbidden };
  for (const [path, content] of Object.entries(files)) await writeFile(join(source, path), content);
  await writeFile(join(source, 'manifest.json'), JSON.stringify({ schemaVersion: 2, id: pluginId, name: 'Definition test', version: '0.1.0',
    description: '', author: 'GalCraft test', license: 'MIT', homepage: null, engineRange: '^0.1.0', sdkMajor: 0,
    targets: ['web','windows'], dependencies: [], environmentDependencies: {definition:[],editor:[],services:[],runtime:[]},
    entry: {definition:'definition.mjs',runtime:'runtime.mjs',editor:'editor.mjs',services:null},
    files: Object.entries(files).map(([path, content]) => ({path,size:Buffer.byteLength(content)})),
    contributions: ['multiple','fixed'].map(name => ({kind:'document',key:`${pluginId}/${name}`,targets:['web','windows'],required:true})),
    stateVersions: {document:1,progress:1,longTerm:1}, native: [] }));
  plugins = new StudioPluginPackages(join(testing, 'node-documents/installed'), new ResourceRegistry());
  value(await plugins.install({kind:'directory',path:source}));
  await ProjectSession.createProject(root, FixtureProject.projectId, [
    {documentId:projectDocumentId,revision:1,format:'json',files:{'project.json':envelope(projectDocumentId,FixtureProject)}},
    {documentId:lockId,revision:1,format:'json',files:{'dependencies.lock.json':envelope(lockId,{...FixtureLock,
      plugins:[{kind:'plugin',id:pluginId,version:'0.1.0',targets:['web','windows'],required:true}]})}},
    {documentId:fixtureId(0xd03),revision:1,format:'json',files:{'assets/index.json':envelope(fixtureId(0xd03),{assets:[FixtureAsset]})}},
  ]);
  access = new ProjectAccess(); projects = new ProjectDocuments(access);
  value(await projects.open(root)); documents = new PluginDocuments(projects, plugins);
});

afterAll(async () => {
  if (projects?.currentSessionId) { const sessionId = projects.currentSessionId; await projects.close(sessionId, 'discard'); access.release(sessionId); }
});

it('runs multi-instance CRUD, reference rewriting, revision conflict, undo and disk reopen through M02', async () => {
  const apply = input => { const plan = value(projects.planEdit(input)); return value(projects.applyEdit(plan.planId,input.expected)); };
  const create = name => documents.create({pluginId,contributionKey:`${pluginId}/multiple`,name,data:{title:name,target:projectDocumentId,asset:FixtureAsset.id}});
  const createdA = value(await create('First')), a = createdA.patches[0].documentId;
  expect(createdA.requiredRefs).toEqual([{kind:'document',id:projectDocumentId},{kind:'asset',id:FixtureAsset.id}]);
  apply(createdA); const createdB = value(await create('Second')); apply(createdB);
  expect(value(documents.list({pluginId,contributionKey:`${pluginId}/multiple`}))).toHaveLength(2);
  const initial = value(documents.current(a)).instance;
  apply(value(await documents.update({documentId:a,expectedRevision:initial.revision,data:{title:'Self reference',target:a,asset:FixtureAsset.id}})));
  const copied = value(await documents.copy({documentId:a,name:'Copied'})), copyId = copied.patches[0].documentId;
  expect(JSON.parse(Object.values(copied.patches[0].after.files)[0]).data.target).toBe(copyId);
  apply(copied);
  const stale = await documents.update({documentId:a,expectedRevision:initial.revision,data:{title:'Stale',target:a}});
  expect(stale.ok).toBe(false); expect(stale.error.code).toBe('EDIT_CONFLICT');
  const fixed = value(await documents.create({pluginId,contributionKey:`${pluginId}/fixed`})); apply(fixed);
  expect((await documents.create({pluginId,contributionKey:`${pluginId}/fixed`})).error.code).toBe('PLUGIN_DOCUMENT_FIXED');
  expect((await documents.update({documentId:a,data:{title:'',target:a}})).ok).toBe(false);
  const deleted = apply(value(documents.remove({documentId:copyId}))), undo = value(projects.planUndo(copyId,deleted.operationId));
  value(projects.undo(undo.planId)); expect(value(documents.current(copyId)).instance.data.target).toBe(copyId);
  const lease = value(await plugins.acquireDefinitions(projects.currentSession));
  try { expect(lease.documents.find(item => item.key === `${pluginId}/multiple`).collectReferences({title:'Reference',target:copyId}))
    .toEqual([{kind:'document',id:copyId}]); } finally { await lease.release(); }
  const assets=new StudioAssets(projects,join(testing,'unused-tools'));
  assets.pluginReferences=(session,id)=>pluginDocumentReferences(plugins,session,id);
  const references=value(await assets.references(FixtureAsset.id));
  expect(references.filter(item=>item.usage==='pluginDocument').map(item=>item.owner.id).sort()).toEqual([a,createdB.patches[0].documentId,copyId].sort());
  expect((await assets.remove([FixtureAsset.id])).error.code).toBe('ASSET_REFERENCED');
  const save = value(projects.planSave({kind:'all'})); value(await projects.save(save.planId));
  const oldSessionId = projects.currentSessionId; value(await projects.close(oldSessionId,'save')); access.release(oldSessionId);
  value(await projects.open(root));
  const reopened = value(documents.list({pluginId}));
  expect(reopened).toHaveLength(4); expect(reopened.every(item => !projects.currentSession.readDocument(item.documentId).dirty)).toBe(true);
  expect(reopened.find(item => item.documentId === copyId).data.target).toBe(copyId);
  const persisted = JSON.parse(await readFile(join(root,`plugins/${pluginId}/multiple/${copyId}.json`),'utf8'));
  expect(persisted.documentId).toBe(copyId); expect(persisted.data.target).toBe(copyId);
  await mkdir(resolve(evidence,'..'),{recursive:true});
  await writeFile(evidence,JSON.stringify({target:'Node + real Windows disk',environment:{node:process.version,platform:process.platform},
    dataset:{pluginId,root},steps:['install definition package','create two instances','update self reference','copy and rewrite identity',
      'reject stale revision and schema','fixed instance uniqueness','delete and undo','read references without editor/runtime','save and reopen'],
    expected:'M02 owns CRUD, revisions, undo, disk persistence and definition references',actual:{documents:reopened,persisted,references},result:'passed',executedAt:new Date().toISOString()},null,2));
});
