import { afterEach, expect, it, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FixtureAsset, FixtureSnapshot, FixtureVoiceAssets } from '@galcraft/contracts/fixtures';
import { SceneDecorLayerSchema, SnapshotSchema } from '@galcraft/contracts';
import { assetFilePath, createAssetIndex } from '@galcraft/assets';
import { compile } from '@galcraft/dsl';
import { PluginManifestSchema } from '@galcraft/plugins/contracts';
import { createOfficialTemplate } from '@galcraft/templates';
import { StudioBuilds } from './build-providers.mjs';
const root = resolve(import.meta.dirname, '../../../tmp/testing/studio-plugin-build');
afterEach(async()=>{await rm(root,{recursive:true,force:true});});
it('collects exact decor, rule images, anchored difference and sound files in release preparation', async () => {
  const projectRoot = join(root, 'project'), project = structuredClone(FixtureSnapshot.project);
  const [scene, target] = FixtureSnapshot.scenes.map(item => structuredClone(item.scene));
  const template = createOfficialTemplate({ kind: 'standard' });
  const lock = { ...FixtureSnapshot.lock, plugins: [], template: template.dependencies.find(item => item.kind === 'template') };
  const versioned = (fixture, id, variantId, activeVariantId) => {
    const asset = structuredClone(fixture), original = { ...asset.variants[0], id: variantId, targets: { web: 'direct' } };
    return { ...asset, id, originalVariantId: variantId, activeVariantId, variants: [original, { ...original, id: activeVariantId }] };
  };
  const image = versioned(FixtureAsset, 'ImageA', 'Image1', 'Image2');
  const decor = versioned(FixtureAsset, 'DecorA', 'Decor1', 'Decor2');
  const rule = versioned(FixtureAsset, 'RulesA', 'Rules1', 'Rules2');
  const audio = versioned(FixtureVoiceAssets[0], 'AudioA', 'Audio1', 'Audio2');
  const assets = [image, decor, rule, audio];
  scene.decorLayers = [SceneDecorLayerSchema.parse({ id: 'Layer1', assetId: decor.id, variantId: decor.originalVariantId })];
  const character = { ...FixtureSnapshot.characters[0], differences: [{ id: 'Smile1', name: 'Smile', avatar: null,
    figure: { assetId: image.id, variantId: image.originalVariantId } }] };
  const ruleImage = { assetId: rule.id, variantId: rule.originalVariantId, durationMs: 300 };
  const events = [{ id: 'Sound1', offset: 1, kind: 'sound', assetId: audio.id, variantId: audio.originalVariantId },
    { id: 'Smile2', offset: 0, kind: 'expression', objectId: 'Figure', characterId: character.id, differenceId: 'Smile1' }];
  const command = (opcode, id, args) => `${opcode} ${JSON.stringify(args)} @${id};`;
  const text = [
    command('changeBg', 'First1', { assetId: image.id, ruleImage }),
    command('changeFigure', 'First2', { objectId: 'Figure', characterId: character.id, assetId: image.id }),
    command('say', 'First3', { speaker: { kind: 'narrator' }, text: '甲乙', events }),
    command('changeScene', 'First4', { sceneId: target.id, ruleImage }),
  ].join('\n');
  const sources = [{ documentId: 'Scene1', revision: 1, kind: 'scene', sceneId: scene.id, text },
    { documentId: 'Scene2', revision: 1, kind: 'scene', sceneId: target.id, text: 'end {endingId:"finish"} @Second;' }];
  const compiled = compile({ projectId: project.projectId, engineVersion: project.engineVersion, project, lock, template,
    documents: sources, scenes: [scene, target], characters: [character], variables: [], assets, gallery: [], flows: [], cancelOperationId: 'Task01' });
  expect(compiled.issues).toEqual([]);
  const snapshot = compiled.snapshot;
  const document = (documentId, path, data) => ({ documentId, revision: 1, files: { [path]: JSON.stringify({ data }) } });
  const index = createAssetIndex('Index1');
  index.data.assets = assets;
  const documents = [document(project.projectId, 'project.json', project), { documentId: 'Index1', revision: 1, files: { 'assets/index.json': JSON.stringify(index) } },
    document('Scene1', `scenes/${scene.id}/scene.json`, scene), document('Scene2', `scenes/${target.id}/scene.json`, target)];
  for (const asset of assets) for (const variant of asset.variants) {
    const file = join(projectRoot, assetFilePath(asset.id, variant.id, variant.entry));
    await mkdir(join(file, '..'), { recursive: true }); await writeFile(file, Buffer.alloc(variant.files[0].bytes));
  }
  const engine = { manifest: { version: project.engineVersion, files: [], conversions: [], entries: { playerWeb: 'web/index.html' } }, directory: root };
  const builds = new StudioBuilds({ projects: { currentSession: { projectId: project.projectId, withSavedSnapshot: async fn => fn(documents) }, currentRoot: projectRoot },
    language: { lastValid: () => ({ ok: true, value: snapshot }), currentInput: () => ({}) },
    engineCatalog: { resolveProjectEngine: async () => ({ ok: true, value: engine }) }, pluginRoot: join(root, 'plugins') });
  let material;
  builds.builder.planBuild = (_input, result) => { material = result; return { ok: true, value: { planId: 'Plan01' } }; };
  const result = await builds.planBuild({ projectId: project.projectId, target: 'web', outputDirectory: join(root, 'release'),
    releaseVersion: project.releaseVersion, snapshotId: snapshot.snapshotId, savedVersions: documents.map(({ documentId, revision }) => ({ ref: { kind: 'document', id: documentId }, revision })),
    keepAssets: [], platformPolicy: {}, font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: [], entryMappings: [] });
  expect(result.ok).toBe(true);
  expect(material.issues.filter(issue => ['BUILD_ASSET_SOURCE', 'BUILD_ASSET_REFERENCE', 'ASSET_MISSING'].includes(issue.code))).toEqual([]);
  expect(material.snapshot.assets.map(({ variantId }) => variantId).sort()).toEqual(['Audio1', 'Decor1', 'Image1', 'Image2', 'Rules1']);
  const locations = variantId => material.capabilities.find(item => item.feature.endsWith(`/${variantId}`)).sources;
  expect(locations('Decor1')).toEqual([{ documentId: 'Scene1', revision: 1, field: '/data/decorLayers/0/assetId' }]);
  expect(locations('Rules1')).toMatchObject([{ statementId: 'First1', field: 'ruleImage.assetId' }, { statementId: 'First4', field: 'ruleImage.assetId' }]);
  expect(locations('Audio1')).toMatchObject([{ eventId: 'Sound1', field: 'events.0.assetId' }]);
  expect(locations('Image1')).toMatchObject([{ eventId: 'Smile2', field: 'events.1.differenceId' }]);
});
it('blocks an unrelated output directory during checking and invalidates the previous Studio plan', async () => {
  const outputDirectory = join(root, 'downloads'); await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, 'personal.txt'), 'keep');
  const snapshot = structuredClone(FixtureSnapshot), withSavedSnapshot = vi.fn();
  const builds = new StudioBuilds({ projects: { currentRoot: join(root, 'project'), currentSession: { projectId: snapshot.projectId, withSavedSnapshot } }, pluginRoot: join(root, 'plugins') });
  builds.latestPlans.set(snapshot.projectId, 'OldPlan');
  const result = await builds.planBuild({ projectId: snapshot.projectId, target: 'web', outputDirectory, releaseVersion: '0.1.0', snapshotId: snapshot.snapshotId,
    savedVersions: [], keepAssets: [], platformPolicy: {}, font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: [], entryMappings: [] });
  expect(result).toMatchObject({ ok: false, error: { code: 'BUILD_OUTPUT_NOT_RELEASE' } });
  expect(withSavedSnapshot).not.toHaveBeenCalled();
  expect(await builds.build('OldPlan')).toMatchObject({ ok: false, error: { code: 'BUILD_PLAN_STALE' } });
});
it.each(['web','windows'])('removes Studio declarations and selects actual Player native files for %s',async(target)=>{
  const pluginId='org.example.mixed',directory=join(root,'plugins',pluginId,'0.1.0');await mkdir(join(directory,'runtime'),{recursive:true});await mkdir(join(directory,'editor'),{recursive:true});
  const runtime='export function createPlugin(){return {activate:async()=>({commands:[],conditions:[],documents:[],tools:[],resources:[],stages:[],pages:[],components:[],systems:[],platform:[]}),deactivate:async()=>{}}}',
    editor='throw new Error("Studio UI must not execute during runtime preparation");export function createStudioPlugin(){}';
  await writeFile(join(directory,'runtime/index.js'),runtime);await writeFile(join(directory,'editor/index.js'),editor);await writeFile(join(directory,'package.json'),'{"type":"module"}');
  const nativeSource='export function createPlatformProvider(){}';
  for(const arch of ['x64','arm64']){await mkdir(join(directory,'native',arch),{recursive:true});await writeFile(join(directory,'native',arch,'provider.mjs'),nativeSource);}
  const manifest={schemaVersion:1,id:pluginId,name:'Mixed',version:'0.1.0',description:'',author:'Example',license:'MIT',homepage:null,engineRange:'^0.1.0',sdkMajor:0,targets:['web','windows'],dependencies:[],
    entry:{runtime:'runtime/index.js',editor:'editor/index.js'},files:[{path:'runtime/index.js',size:Buffer.byteLength(runtime)},{path:'editor/index.js',size:Buffer.byteLength(editor)},{path:'package.json',size:17}],
    contributions:[],studio:[{key:`${pluginId}/authoring`,kind:'workbench',slot:'extensions.navigation'}],stateVersions:{document:0,progress:0,longTerm:0},native:['x64','arm64'].map(arch=>({target:'windows',arch,entry:`native/${arch}/provider.mjs`}))};
  manifest.files.push(...['x64','arm64'].map(arch=>({path:`native/${arch}/provider.mjs`,size:Buffer.byteLength(nativeSource)})));
  await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest));
  const snapshot=structuredClone(FixtureSnapshot);snapshot.scenes.forEach(scene=>scene.instructions=[]);snapshot.assets=[];snapshot.characters=[];snapshot.template=createOfficialTemplate({kind:'standard'});
  snapshot.lock.plugins=[{kind:'plugin',id:pluginId,version:'0.1.0',targets:['web','windows'],required:true}];
  const documents=[{documentId:snapshot.projectId,revision:1,files:{'project.json':JSON.stringify({data:snapshot.project})}},
    {documentId:crypto.randomUUID(),revision:1,files:{'assets/index.json':JSON.stringify({schemaVersion:1,documentId:crypto.randomUUID(),revision:1,data:{assets:[]}})}}];
  snapshot.documents = documents.map(({ documentId, revision }) => ({ documentId, revision }));
  const engine={manifest:{version:'0.1.0',files:[],conversions:[],entries:{playerWeb:'web/index.html',playerWindows:'windows/player.exe'}},directory:root};
  const pe=Buffer.alloc(134);pe.write('MZ');pe.writeUInt32LE(128,0x3c);pe.write('PE\0\0',128);pe.writeUInt16LE(0xaa64,132);await mkdir(join(root,'windows'),{recursive:true});await writeFile(join(root,'windows/player.exe'),pe);
  const builds=new StudioBuilds({projects:{currentSession:{projectId:snapshot.projectId,withSavedSnapshot:async action=>action(documents)},currentRoot:join(root,'project')},
    language:{lastValid:()=>({ok:true,value:snapshot,warnings:[]}),currentInput:()=>({})},engineCatalog:{resolveProjectEngine:async()=>({ok:true,value:engine,warnings:[]})},pluginRoot:join(root,'plugins')});
  let material;builds.builder.planBuild=(_input,value)=>{material=value;return {ok:true,value:{planId:crypto.randomUUID()},warnings:[]};};
  const result=await builds.planBuild({projectId:snapshot.projectId,target,outputDirectory:join(root,'release'),releaseVersion:'0.1.0',snapshotId:snapshot.snapshotId,
    savedVersions:documents.map(document=>({ref:{kind:'document',id:document.documentId},revision:document.revision})),keepAssets:[],platformPolicy:{},font:{mode:'full',fallbackAssetId:null},oldSaveFiles:[],entryMappings:[]});
  expect(result.ok).toBe(true);expect(material.issues.filter(issue=>issue.code==='BUILD_PLUGIN')).toEqual([]);
  const serialized=JSON.parse(material.textFiles[`plugins/runtime/${pluginId}/0.1.0/manifest.json`]);
  expect(serialized.studio).toBeUndefined();expect(serialized.entry.editor).toBeNull();expect(PluginManifestSchema.safeParse(serialized).success).toBe(true);
  expect(material.files.filter(file=>file.role==='plugin').map(file=>file.path)).not.toContain(`plugins/runtime/${pluginId}/0.1.0/editor/index.js`);
  expect(material.snapshot.lock.plugins.map(item=>item.id)).toContain(pluginId);
  expect(serialized.native.map(item=>item.arch)).toEqual(target==='windows'?['arm64']:[]);
});
it('executes the declared publish check without Editor UI and invalidates an earlier plan',async()=>{
  const pluginId='org.example.check',directory=join(root,'plugins',pluginId,'0.1.0');
  const source={
    'definition/index.js':'export function createDefinition(){return {documents:[]};}',
    'services/index.js':`export function createPlugin(){return {activate:async()=>({publishChecks:[{key:'${pluginId}/release',check:async({target,settings,snapshot})=>[{code:'PLUGIN_PUBLISH',severity:target==='web'?'warning':'error',message:settings.font.mode+' '+snapshot.releaseVersion,owner:'M11',related:[],actions:['edit']}]}]}),deactivate:async()=>{}}}`,
    'editor/index.js':'throw new Error("Editor UI executed during publish check");',
    'package.json':'{"type":"module"}',
  };
  for(const [path,text] of Object.entries(source)){await mkdir(join(directory,path,'..'),{recursive:true});await writeFile(join(directory,path),text);}
  await writeFile(join(directory,'manifest.json'),JSON.stringify({schemaVersion:2,id:pluginId,name:'Check',version:'0.1.0',description:'',author:'Example',license:'MIT',homepage:null,engineRange:'^0.1.0',sdkMajor:0,targets:['web','windows'],dependencies:[],
    entry:{runtime:null,editor:'editor/index.js',definition:'definition/index.js',services:'services/index.js'},files:Object.entries(source).map(([path,text])=>({path,size:Buffer.byteLength(text)})),
    contributions:[{kind:'publishCheck',key:`${pluginId}/release`,targets:['web','windows'],required:true}],studio:[{key:`${pluginId}/info`,kind:'workbench',slot:'extensions.navigation'}],stateVersions:{document:1,progress:1,longTerm:1},native:[]}));
  const snapshot=structuredClone(FixtureSnapshot);snapshot.scenes.forEach(scene=>scene.instructions=[]);snapshot.assets=[];snapshot.characters=[];snapshot.template=createOfficialTemplate({kind:'standard'});
  snapshot.lock.plugins=[{kind:'plugin',id:pluginId,version:'0.1.0',targets:['web','windows'],required:true}];
  const scene=snapshot.scenes[0],position={sceneId:scene.scene.id,statementId:'Recall'};
  snapshot.lock.template=snapshot.template.dependencies.find(dependency=>dependency.kind==='template');
  scene.instructions=[{...FixtureSnapshot.scenes[0].instructions[0],statementId:'Recall',opcode:'end',condition:null,args:{},continuation:'continue'}];
  snapshot.flows=[{id:'FlowAA',name:'独立回想',roots:['NodeAA'],nodes:[{id:'NodeAA',name:'回想',x:0,y:0,sceneId:scene.scene.id,statementId:'Recall',unlock:{kind:'literal',value:true},lockedView:'locked',entry:{kind:'initial',debugScenarioId:'InitAA'}}],edges:[]}];
  snapshot.flowInitials=[{schemaVersion:1,id:'InitAA',name:'作者初值',projectId:snapshot.projectId,entry:position,target:position,initialProgress:{},pluginInitial:{[pluginId]:{authorOnly:true}},route:[],playerInputs:[],externalPolicy:'simulate',engineVersion:snapshot.engineVersion,pluginVersions:[snapshot.lock.engine,...snapshot.lock.plugins,snapshot.lock.template]}];
  const documents=[{documentId:snapshot.projectId,revision:1,files:{'project.json':JSON.stringify({data:snapshot.project})}},
    {documentId:crypto.randomUUID(),revision:1,files:{'assets/index.json':JSON.stringify({schemaVersion:1,documentId:crypto.randomUUID(),revision:1,data:{assets:[]}})}}];
  snapshot.documents = documents.map(({ documentId, revision }) => ({ documentId, revision }));
  const engine={manifest:{version:'0.1.0',files:[],conversions:[],entries:{playerWeb:'web/index.html',playerWindows:'windows/player.exe'}},directory:root};
  const builds=new StudioBuilds({projects:{currentSession:{projectId:snapshot.projectId,withSavedSnapshot:async action=>action(documents)},currentRoot:join(root,'project')},language:{lastValid:()=>({ok:true,value:snapshot,warnings:[]}),currentInput:()=>({})},engineCatalog:{resolveProjectEngine:async()=>({ok:true,value:engine,warnings:[]})},pluginRoot:join(root,'plugins')});
  let material;builds.builder.planBuild=(_input,value)=>{material=value;return {ok:true,value:{planId:crypto.randomUUID()},warnings:[]};};
  const input={projectId:snapshot.projectId,target:'web',outputDirectory:join(root,'release'),releaseVersion:'0.1.0',snapshotId:snapshot.snapshotId,savedVersions:documents.map(document=>({ref:{kind:'document',id:document.documentId},revision:document.revision})),keepAssets:[],platformPolicy:{},font:{mode:'full',fallbackAssetId:null},oldSaveFiles:[],entryMappings:[]};
  const web=await builds.planBuild(input);expect(web.ok).toBe(true);expect(material.issues.find(item=>item.code==='PLUGIN_PUBLISH')).toMatchObject({severity:'warning',message:'full 0.1.0'});expect(material.issues.some(item=>item.code==='BUILD_PLUGIN')).toBe(false);
  expect(material.snapshot.lock.plugins).toEqual([]);expect(material.files.some(item=>item.path.includes('services/'))).toBe(false);
  expect(material.snapshot.flowInitials[0].pluginVersions).toEqual([snapshot.lock.engine,snapshot.lock.template]);
  expect(material.snapshot.flowInitials[0].pluginInitial).toEqual({});SnapshotSchema.parse(material.snapshot);
  expect(snapshot.flowInitials[0].pluginInitial[pluginId]).toEqual({authorOnly:true});
  const pe=Buffer.alloc(134);pe.write('MZ');pe.writeUInt32LE(128,0x3c);pe.write('PE\0\0',128);pe.writeUInt16LE(0x8664,132);await mkdir(join(root,'windows'),{recursive:true});await writeFile(join(root,'windows/player.exe'),pe);
  await builds.planBuild({...input,target:'windows'});expect(material.issues.find(item=>item.code==='PLUGIN_PUBLISH')?.severity).toBe('error');
  expect((await builds.build(web.value.planId)).error.code).toBe('BUILD_PLAN_STALE');
  snapshot.documents[0].revision++;
  expect(await builds.planBuild(input)).toMatchObject({ ok: false, error: { code: 'BUILD_SNAPSHOT_REVISION' } });
});
