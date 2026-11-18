import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createId } from '@galcraft/contracts';
import { commandInputSchema, CoreCommandSpecsEnglish, parse } from '@galcraft/dsl';
import { createDefinition as createAffectionDefinition } from '@galcraft/official-affection';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { components, readTemplateDocuments } from '@galcraft/templates';
import { RecipeLibrary } from '@galcraft/authoring/recipes';
import { ProjectAccess } from './project-access.mjs';
import { ProjectDocuments } from './document-providers.mjs';
import { StudioAssets } from './asset-providers.mjs';
import { StudioCollaboration } from './collaboration-providers.mjs';

const unwrap=result=>{if(!result.ok)throw new Error(JSON.stringify(result));return result.value;};
const cleanups=[];afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup();});
async function setup({commands=[],conditions=[]}={}){
  const parent=resolve(import.meta.dirname,'../../../tmp/testing');await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'creator-presets-'));
  const projects=new ProjectDocuments(new ProjectAccess(),undefined,{resolveEngine:async()=>({ok:true,value:{version:'0.1.0',manifest:{targets:['web','windows']}},warnings:[]})});
  unwrap(await projects.create({path:root,name:'presets',template:'empty',width:1280,height:720,engineVersion:'0.1.0'}));
  const project=projects.currentSession,assets=new StudioAssets(projects,resolve(import.meta.dirname,'../../../tools/media/runtime/bin')),recipes=await RecipeLibrary.open(join(root,'profile'),project);
  const production={current:async()=>({recipes,service:{drain:async()=>{}}}),generationProviders:{operations:async()=>[]},connections:{list:async()=>[]}};
  const service=new StudioCollaboration({userData:join(root,'profile'),projects,assets,production,plugins:{externalTools:async()=>[],acquireDefinitions:async()=>({ok:true,value:{commands,conditions,documents:[],components:[],pages:[],release:async()=>{}},warnings:[]})}});await service.ready;
  const session=await service.core.create({goal:'Exercise core authoring presets',harness:'codex',projectId:project.projectId,writeSessionId:projects.currentSessionId,projectRoot:projects.currentRoot,projectName:'Presets',scope:{documents:[...project.documents.keys()],createKinds:['asset','document','character'],tools:service.core.catalog().map(tool=>tool.key),operations:['script'],connectionIds:[],models:[],workflowIds:[],maxGenerations:0}});
  cleanups.push(async()=>{await service.close();await project.dispose('discard');await rm(root,{recursive:true,force:true});});
  let sequence=0;const invoke=(tool,input)=>service.core.invoke(tool,input,session.id,`presets-${++sequence}`);
  const call=async(tool,input)=>{const result=await invoke(tool,input);expect(result.state,JSON.stringify(result)).toBe('completed');return result.result;};
  const versions=()=>[...project.documents.values()].map(document=>({ref:{kind:'document',id:document.documentId},revision:document.revision}));
  const scene=[...project.documents.values()].find(document=>document.format==='dsl');
  const text=()=>Object.entries(project.readDocument(scene.documentId).files).find(([path])=>path.endsWith('/script.gal'))[1];
  const setScript=script=>{const current=project.readDocument(scene.documentId),previous=Object.entries(current.files).find(([path])=>path.endsWith('/script.gal'))[1],plan=unwrap(project.planEdit({label:'Fixture scene',origin:'field',expected:[{ref:{kind:'document',id:scene.documentId},revision:current.revision}],patches:[{kind:'text',documentId:scene.documentId,edits:[{start:0,end:previous.length,before:previous,after:script}]}],preparedAssets:[],requiredRefs:[]}));unwrap(project.applyEdit(plan.planId,plan.input.expected));};
  const prepare=(operationKey,target,fields)=>call('galcraft_edit_prepare',{operationKey,target,fields,expected:versions()});
  const apply=prepared=>call('galcraft_edit_apply',{planId:prepared.plan.planId,expected:prepared.plan.input.expected});
  return {root,project,assets,service,session,call,invoke,versions,scene,text,setScript,prepare,apply};
}

describe('core preset discovery and prepared M02 edits',{timeout:30000},()=>{
  it('materializes core and enabled plugin creation defaults through the MCP transport in one edit', async () => {
    const s = await setup(createAffectionDefinition());
    const client = new Client({ name: 'command-creation-test', version: '0.1.0' }, { versionNegotiation: { mode: 'auto' } });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL((await s.service.mcp.start()).endpoint)));
      const call = async (name, input, callId) => {
        const result = await client.callTool({ name, arguments: { projectId: s.project.projectId, sessionId: s.session.id, view: 'full', input, callId } });
        expect(result.isError, JSON.stringify(result)).not.toBe(true);
        return result.structuredContent;
      };
      const created = await s.call('galcraft_edit_prepare', { operation: { op: 'character.create', name: 'Mio' }, expected: s.versions() });
      await s.apply(created);
      await s.service.core.update({ id: s.session.id, expectedRevision: s.session.scopeRevision, scope: { ...s.session.scope, mode: 'currentProject' } });
      const characterPath = [...s.project.documents.values()].flatMap(document => Object.keys(document.files)).find(path => path.startsWith('characters/'));
      const characterId = characterPath?.split('/').at(-1)?.replace('.json', '');
      expect(characterId).toBeTruthy();
      const sceneId = JSON.parse(Object.entries(s.scene.files).find(([path]) => path.endsWith('/scene.json'))[1]).data.id;
      const before = s.text();
      const operationCount = s.project.operations.length;
      const catalog = await call('galcraft_catalog', { category: 'commands', key: 'changeBg' }, 'background-contract');
      expect(catalog.result.entries[0].definition.creation).toMatchObject({ operation: 'commands.insert', initialArgs: { fit: 'cover', positionX: 0.5, transition: { enter: { durationMs: 400 } } } });
      const prepare = (commands, id) => call('galcraft_edit_prepare', { operation: { op: 'commands.insert', sceneId, commands }, expected: s.versions() }, id);
      const invalid = await prepare([{ command: 'wait', args: {} }, { command: 'org.galcraft.affection/add', args: {} }], 'missing-character');
      expect(invalid, JSON.stringify(invalid)).toMatchObject({ state: 'failed', error: { code: 'FIELD_REQUIRED' } });
      expect(s.text()).toBe(before);
      const when = { kind: 'call', name: 'org.galcraft.affection/compare', args: [characterId, 'ge', 0].map(value => ({ kind: 'literal', value })) };
      const badCondition = await prepare([{ command: 'wait', args: { when: { ...when, name: 'org.galcraft.affection/missing' } } }], 'missing-condition');
      expect(badCondition).toMatchObject({ state: 'failed', error: { code: 'EXPR_TYPE' } });
      expect(s.text()).toBe(before);
      const valid = await prepare([{ command: 'wait', args: { when: false } }, { command: 'wait', args: { when } }, { command: 'org.galcraft.affection/add', args: { characterId } }], 'insert-defaults');
      expect(valid.state, JSON.stringify(valid)).toBe('completed');
      expect(s.text()).toBe(before);
      const { plan } = valid.result;
      const edited = await call('galcraft_edit_apply', { planId: plan.planId, expected: plan.input.expected }, 'apply-defaults');
      expect(edited.state, JSON.stringify(edited)).toBe('completed');
      expect(s.project.operations).toHaveLength(operationCount + 1);
      const inserted = parse({ documentId: s.scene.documentId, revision: 2, text: s.text() }).statements.slice(-3);
      expect(inserted.map(command => command.args)).toEqual([{ durationMs: 1000, when: false }, { durationMs: 1000, when }, { characterId, amount: 0 }]);
      const undo = unwrap(s.project.planUndo(s.scene.documentId));
      unwrap(s.project.undo(undo.planId));
      expect(s.text()).toBe(before);
    } finally {
      await client.close();
    }
  });
  it('discovers same-source presets and executable complex schemas, with scoped recipe revisions',async()=>{
    const s=await setup();
    for(const [category,count]of [['animationPresets',16],['weatherPresets',3],['uiAnimationPresets',12],['readingLayouts',2],['actionIcons',15]]){
      const catalog=await s.call('galcraft_catalog',{category});expect(catalog.entries).toHaveLength(count);
      const detail=await s.call('galcraft_catalog',{category,key:catalog.entries[0].key});expect(detail.entries[0].definition.example.tool).toBe('galcraft_edit_prepare');
    }
    expect(s.assets.current().index.data.assets).toHaveLength(0);
    const animation=commandInputSchema(CoreCommandSpecsEnglish.find(spec=>spec.key==='setComplexAnimation'));
    expect(animation.properties.animation.properties.tracks.items.properties.keyframes.items.properties.value).toBeDefined();
    expect(animation.properties.parameters.additionalProperties).toHaveProperty('anyOf');
    const transition=commandInputSchema(CoreCommandSpecsEnglish.find(spec=>spec.key==='setTransition'));
    expect(transition.properties.enter.properties.animation.properties.durationMs.type).toBe('number');
    const weather=commandInputSchema(CoreCommandSpecsEnglish.find(spec=>spec.key==='pixi'));expect(weather.properties.parameters.properties.columns.minimum).toBe(1);
    const recipes=await s.call('galcraft_catalog',{category:'recipes'});expect(recipes.entries.length).toBeGreaterThan(0);
    const detail=await s.call('galcraft_catalog',{category:'recipes',key:recipes.entries[0].key});expect(detail.entries[0].definition.identity.revision).toBeGreaterThanOrEqual(0);
    await s.service.core.update({id:s.session.id,expectedRevision:s.session.scopeRevision,scope:{...s.session.scope,operations:[]}});
    expect((await s.call('galcraft_catalog',{category:'recipes'})).entries).toEqual([]);
    await s.service.core.update({id:s.session.id,expectedRevision:s.session.scopeRevision+1,scope:{...s.session.scope,mode:'currentProject',operations:[]}});
    expect((await s.call('galcraft_catalog',{category:'recipes'})).entries.length).toBeGreaterThan(0);
  });
  it('prepares weather and icons without mutation, applies each resource and binding atomically, reuses assets and saves',async()=>{
    const s=await setup(),end=createId();s.setScript(`end {} @${end};\n`);
    const weather=await s.prepare('stage.applyWeatherPreset',{documentId:s.scene.documentId,statementId:null},{key:'snow'});
    expect(s.assets.current().index.data.assets).toHaveLength(0);expect(s.text()).toBe(`end {} @${end};\n`);expect(weather.plan.input.preparedAssets).toHaveLength(1);
    await s.apply(weather);expect(s.assets.current().index.data.assets).toHaveLength(1);expect(s.text().indexOf('pixi ')).toBeLessThan(s.text().indexOf('end '));
    const undo=unwrap(s.project.planUndo(s.scene.documentId));unwrap(s.project.undo(undo.planId));expect(s.assets.current().index.data.assets).toHaveLength(0);expect(s.text()).toBe(`end {} @${end};\n`);unwrap(s.project.redo(undo.planId));
    const repeated=await s.prepare('stage.applyWeatherPreset',{documentId:s.scene.documentId,statementId:null},{key:'snow'});expect(repeated.plan.input.preparedAssets).toEqual([]);await s.apply(repeated);expect(s.assets.current().index.data.assets).toHaveLength(1);
    const template=()=>readTemplateDocuments([...s.project.documents.values()]),button=components(template().pages.find(page=>page.key==='title').root).find(component=>component.part==='title.menu.start');
    const icon=await s.prepare('component.applyActionIcon',{componentId:button.id},{key:'start'});expect(s.assets.current().index.data.assets).toHaveLength(1);await s.apply(icon);expect(s.assets.current().index.data.assets).toHaveLength(2);
    const binding=components(template().pages.find(page=>page.key==='title').root).find(item=>item.id===button.id).normal.images.icon;expect(binding.assetId).toBeTruthy();
    const save=await s.call('galcraft_save',{action:'plan',scope:{kind:'all'}});await s.call('galcraft_save',{action:'save',planId:save.plan.planId});
    const index=JSON.parse(await readFile(join(s.project.root??s.project.projectRoot??join(s.root,'presets'),'assets/index.json'),'utf8'));expect(index.data.assets).toHaveLength(2);
  });
  it('preserves component and statement identities, real transition lifecycles, voice locales and binding conflicts',async()=>{
    const s=await setup(),template=()=>readTemplateDocuments([...s.project.documents.values()]),story=template().pages.find(page=>page.key==='story'),ids=components(story.root).map(item=>item.id);
    await s.apply(await s.prepare('page.applyReadingPreset',{pageId:story.id},{key:'clear'}));expect(components(template().pages.find(page=>page.key==='story').root).map(item=>item.id).sort()).toEqual(ids.sort());
    await s.apply(await s.prepare('component.applyAnimationPreset',{componentId:story.root.id},{key:'fadeIn',event:'show'}));expect(template().pages.find(page=>page.id===story.id).root.animations.show).toBeTruthy();
    const end=createId(),show=createId(),exit=createId(),object=createId();s.setScript(`changeFigure {op:"replace",objectId:"${object}",assetId:"Asset1"} @${show};\nchangeFigure {op:"exit",objectId:"${object}"} @${exit};\nend {} @${end};\n`);
    await s.apply(await s.prepare('stage.applyAnimationPreset',{documentId:s.scene.documentId,statementId:show},{key:'fadeIn'}));
    await s.apply(await s.prepare('stage.applyAnimationPreset',{documentId:s.scene.documentId,statementId:exit},{key:'fadeOut'}));
    const nodes=()=>parse({documentId:s.scene.documentId,revision:1,text:s.text()}).cst;expect(nodes().find(node=>node.id===show).object.value).toMatchObject({op:'replace',transition:{enter:{preset:'custom'}}});expect(nodes().find(node=>node.id===exit).object.value).toMatchObject({op:'exit',transition:{exit:{preset:'custom'}}});
    await s.apply(await s.prepare('stage.applyAnimationPreset',{documentId:s.scene.documentId,statementId:null},{key:'jump',stageTarget:{kind:'stage'}}));expect(s.text().indexOf('setComplexAnimation ')).toBeLessThan(s.text().indexOf('end '));
    const texture=unwrap(await s.assets.weatherTexture('rain'));
    const background=await s.prepare('scene.setBackground',{documentId:s.scene.documentId,statementId:null},{assetId:texture.id,variantId:texture.activeVariantId});await s.apply(background);
    expect(nodes().find(node=>node.command==='changeBg').object.value).toMatchObject({assetId:texture.id,objectId:expect.any(String),fit:'cover',positionX:.5,positionY:.5,transition:{enter:{durationMs:400},exit:{durationMs:400}}});
    const galleryBackground=createId(),backgroundObject=createId();
    s.setScript(`changeBg {op:"show",objectId:"${backgroundObject}",assetId:"Previous1",galleryId:"Gallery1",differenceId:"Diff01",transition:{enter:{preset:"fade",durationMs:300}}} @${galleryBackground};\nend {} @${end};\n`);
    await s.apply(await s.prepare('scene.setBackground',{documentId:s.scene.documentId,statementId:galleryBackground},{assetId:texture.id,variantId:texture.activeVariantId}));
    const rebound=nodes().find(node=>node.id===galleryBackground).object.value;
    expect(rebound).toMatchObject({assetId:texture.id,objectId:backgroundObject,transition:{enter:{preset:'fade',durationMs:300}}});
    expect(rebound).not.toHaveProperty('galleryId');expect(rebound).not.toHaveProperty('differenceId');
    const rejected=await s.invoke('galcraft_edit_prepare',{operationKey:'scene.setBackground',target:{documentId:s.scene.documentId,statementId:null},fields:{assetId:texture.id,variantId:'Missing1'},expected:s.versions()});expect(rejected.state).toBe('failed');expect(rejected.errorCode).toBe('ASSET_REFERENCE_INVALID');
    const wav=Buffer.alloc(44+1600);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);const audioPath=join(s.root,'voice.wav');await writeFile(audioPath,wav);const audio=unwrap(await s.assets.import([audioPath])).succeeded[0],line=createId();s.setScript(`say {speaker:{kind:"narrator"},text:"Hello",voiceByLocale:{ja:"Prior1"}} @${line};\nend {} @${end};\n`);
    await s.apply(await s.prepare('statement.bindVoice',{documentId:s.scene.documentId,statementId:line},{assetId:audio.id,variantId:audio.activeVariantId,locale:'zh-CN'}));expect(nodes().find(node=>node.id===line).object.value).toMatchObject({text:'Hello',voiceByLocale:{ja:'Prior1','zh-CN':audio.id}});
  });
});
