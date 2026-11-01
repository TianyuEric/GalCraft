import { beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ProjectDocuments } from './document-providers.mjs';
import { ProjectAccess } from './project-access.mjs';
import { StudioAssets } from './asset-providers.mjs';
import { populatePracticeProject } from './practice-project.mjs';
import { compileInput } from '../renderer/authoring/bridge.js';
import { compile } from '@galcraft/dsl';
import { templateIssues } from '@galcraft/templates';
import { SessionController } from '../../../packages/runtime/src/session.ts';
import { StageCommandService } from '../../../packages/stage/src/commands.ts';
import { prepareMediaTools } from '../../../tools/media/prepare.mjs';
import { StudioPluginPackages } from './plugin-packages.mjs';
import { acceptPracticeRuntime } from './practice-runtime-acceptance.mjs';
import { parseAnimationResource } from '@galcraft/contracts';
import { practiceMediaFiles } from '../../../tools/practice-distribution.mjs';
const unwrap = result => { if (!result.ok) throw new Error(JSON.stringify(result)); return result.value; };
let mediaTools;
beforeAll(async () => { mediaTools = await prepareMediaTools(); }, 180000);

describe('editable practice project', () => {
  it('imports the complete spring story, binds every voice and expression, reaches three endings, and reopens the saved project', async () => {
    await mkdir(resolve('../../tmp/testing'), { recursive: true });
    const parent = await mkdtemp(resolve('../../tmp/testing/practice-'));
    const documents = new ProjectDocuments(new ProjectAccess(), undefined, {resolveEngine:async()=>({ok:true,value:{version:'0.1.0',manifest:{targets:['web','windows']}},warnings:[]})});
    const opened = unwrap(await documents.create({path:parent,name:'我自己的春灯',template:'sample',width:1920,height:1080,engineVersion:'0.1.0'}));
    try {
      const assets = new StudioAssets(documents, mediaTools);
      const plugins = new StudioPluginPackages(join(parent, 'plugins'), { register: () => ({ uri: 'sample-test://resource', release() {} }) });
      for (const name of ['music-composition','motion-canvas']) unwrap(await plugins.install({ kind: 'directory', path: resolve(`../../plugins/${name}/package`) }));
      const manifest=JSON.parse(await readFile(resolve('resources/practice/manifest.json'),'utf8')),assetCount=practiceMediaFiles(manifest).length+2;
      await populatePracticeProject(documents, assets, undefined, plugins);
      const listed = unwrap(documents.list()), input = unwrap(compileInput(listed));
      expect(input.assets).toHaveLength(assetCount); expect(input.scenes).toHaveLength(9); expect(input.characters).toHaveLength(4);
      expect(input.project.name).toBe('我自己的春灯');
      expect(input.project.chapters[0].name).toBe('今晚，让春天亮起来');
      expect(input.project.languages).toEqual({ menus: ['zh-CN', 'en', 'ja'], menuDefault: 'zh-CN', textDefault: 'zh-CN', voiceDefault: 'ja', voices: ['ja'] });
      expect(input.template.readingStyles).toEqual({read:{color:'#c6b8aa'}});
      for (const asset of input.assets) {
        const variant = asset.variants[0];
        const bytes = await readFile(join(documents.currentRoot,'assets/files',asset.id,variant.id,variant.entry));
        expect(bytes.length).toBeGreaterThan(asset.kind==='animation'||variant.entry.endsWith('.svg') ? 100 : 1000);
      }
      const compiled = compile(input); expect(compiled.issues.filter(issue=>issue.severity==='error')).toEqual([]); expect(compiled.snapshot).not.toBeNull();
      const snapshot = compiled.snapshot, opening = snapshot.scenes.find(scene=>scene.scene.id===snapshot.project.entry.sceneId);
      expect(snapshot.lock.plugins.some(plugin=>plugin.id==='org.galcraft.affection')).toBe(false);
      const relationships=snapshot.variables.filter(variable=>variable.name.endsWith('好感度'));
      expect(relationships).toHaveLength(0);
      const walk=component=>[component,...component.children.flatMap(walk)];
      expect(snapshot.template.pages.some(page=>page.key==='relations')).toBe(false);
      expect(snapshot.template.features).not.toContain('coreRelations');
      expect(walk(snapshot.template.pages.find(page=>page.key==='title').root).some(component=>component.interactions?.some(interaction=>interaction.actions.some(action=>action.kind==='open'&&action.page==='relations')))).toBe(false);
      expect(walk(snapshot.template.pages.find(page=>page.key==='story').root).flatMap(component=>component.bindings?.text?.source==='variable'?[component.bindings.text.variableId]:[])).toEqual([]);
      expect(snapshot.variables.filter(variable=>variable.scope==='progress').map(variable=>variable.type).sort()).toEqual(['boolean','boolean','boolean','string']);
      const viewpoint = input.characters.find(character => character.narrativeRole === 'viewpoint');
      expect(viewpoint).toMatchObject({ name: '玩家', avatar: null, groups: [], differences: [], initialDifferenceId: null, voicePresets: {}, defaultVoicing: 'intentionalSilent', afterstory: null });
      expect(input.project.player.name).toEqual({ characterId: viewpoint.id, defaultName: '玩家', allowCustom: true, variableId: input.variables.find(variable => variable.name === '主角姓名').id, maxLength: 8, promptPolicy: 'firstAndAfterCompletion' });
      expect(manifest.voiceReferences).toBeUndefined();
      expect(input.assets.some(asset => /reference|anj_207_0038|ena_002_0078|rir_000_0021/.test(asset.name))).toBe(false);
      const evidence = resolve('../../test-results/latest/sample-refresh/project');
      await mkdir(evidence, { recursive: true });
      await writeFile(join(evidence, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
      await writeFile(join(evidence, 'source-map.json'), JSON.stringify({ projectRoot: documents.currentRoot, projectId: snapshot.projectId,
        snapshotId: snapshot.snapshotId, scenes: snapshot.scenes.map(scene => ({ id: scene.scene.id, name: scene.scene.name,
          statements: scene.instructions.map(instruction => ({ id: instruction.statementId, opcode: instruction.opcode, args: instruction.args })) })),
        characters: input.characters.map(character => ({ id: character.id, name: character.name, afterstory: character.afterstory })),
        gallery: snapshot.gallery, flows: snapshot.flows }, null, 2));
      const instructions = snapshot.scenes.flatMap(scene => scene.instructions);
      const allocated = [opened.projectId, opened.sessionId, snapshot.snapshotId, ...listed.map(document => document.documentId),
        ...input.project.chapters.map(chapter => chapter.id), ...input.scenes.map(scene => scene.id),
        ...input.characters.flatMap(character => [character.id, ...character.groups.map(group => group.id), ...character.differences.map(difference=>difference.id)]),
        ...input.assets.flatMap(asset => [asset.id, ...asset.variants.map(variant => variant.id)]), ...instructions.map(instruction => instruction.statementId)];
      expect(allocated.every(id => /^[A-Za-z0-9]{6}$/.test(id))).toBe(true);
      expect(instructions.filter(item => item.opcode === 'changeBg').every(item =>
        item.args.transition.enter.preset === 'fade' && item.args.transition.enter.durationMs === 500)).toBe(true);
      expect(instructions.filter(item => item.opcode === 'pixi').map(item => item.args.type)).toEqual(expect.arrayContaining(['cherryBlossoms', 'rain', 'snow']));
      expect(instructions.some(item => item.opcode === 'intro' && item.args.backgroundImage)).toBe(false);
      const figureShows = input.documents.flatMap(document => document.text.split('\n').filter(line => line.startsWith('changeFigure ')))
        .map(line => JSON.parse(line.slice('changeFigure '.length, line.lastIndexOf(' @')))).filter(args => args.op === 'show');
      expect(figureShows).toHaveLength(45);
      for (const args of figureShows) {
        expect(args.difference).toBe(true);
        expect(args.framing).toEqual({ mode: 'upper', scale: 1.1133, offsetX: 0, offsetY: 684, crop: null });
      }
      expect(instructions.filter(item => item.opcode === 'setVar').every(item => item.args.op === 'assign' && item.args.value.value === true)).toBe(true);
      expect(snapshot.template.styles.length).toBe(snapshot.template.pages.length);
      expect(snapshot.template.styles.every(style => style.activation === 'page' && style.issues.length === 0)).toBe(true);
      expect(templateIssues(snapshot.template)).toEqual([]);
      expect(snapshot.template.features).toContain('flow');
      expect(snapshot.template.pages.some(page => page.key === 'flow')).toBe(true);
      const parts = node => [node, ...node.children.flatMap(parts)];
      for (const [page, part] of [['title', 'title.menu.flow'], ['story', 'story.toolbar.flow']])
        expect(parts(snapshot.template.pages.find(item => item.key === page).root).find(item => item.part === part)?.visible).toBe(true);
      expect(snapshot.template.pages.find(page => page.key === 'title').background.imageId).toBe(input.project.display.titleBackground);
      const choice = instructions.find(instruction=>instruction.opcode==='choose');
      expect(choice.args.options).toHaveLength(3);
      const playerLines = instructions.filter(instruction => instruction.opcode === 'say' && instruction.args.speaker.id === viewpoint.id);
      expect(playerLines.some(instruction => instruction.args.text.startsWith('愿意。'))).toBe(true);
      expect(playerLines.every(instruction => instruction.args.voice === null && Object.keys(instruction.args.voiceByLocale).length === 0 && instruction.args.avatarMode === 'hidden')).toBe(true);
      for (const scene of snapshot.scenes.filter(scene => scene.scene.name.includes('·'))) expect(scene.instructions.some(instruction => instruction.opcode === 'say' && instruction.args.speaker.id === viewpoint.id)).toBe(true);
      const voiced = instructions.filter(instruction => instruction.opcode === 'say' && instruction.args.voiceByLocale?.ja);
      expect(voiced).toHaveLength(39); expect(new Set(voiced.map(instruction => instruction.args.voiceByLocale.ja)).size).toBe(39);
      expect(voiced.every(instruction=>Object.keys(instruction.args.voiceByLocale).join(',')==='ja')).toBe(true);
      const frozen = JSON.parse(await readFile(resolve('resources/practice',manifest.voiceSources,'lines.json'), 'utf8'));
      const expectedCrops = {
        deepseek: { x: .2969, y: 0, width: .375, height: .25 },
        chatgpt: { x: .2891, y: 0, width: .3906, height: .2604 },
        claude: { x: .3125, y: 0, width: .3594, height: .2396 },
      };
      for (const [key, name] of [['deepseek','澜汐'],['chatgpt','绮白'],['claude','绯书']]) {
        const character = input.characters.find(item => item.name === name);
        for (const args of figureShows.filter(args => args.characterId === character.id))
          expect(args.portrait).toEqual({ enabled: true, crop: expectedCrops[key] });
        const avatar = input.assets.find(item => item.id === character.avatar);
        expect(avatar.name).toBe(`${key}-head.png`);
        const variant = avatar.variants.find(item => item.id === avatar.activeVariantId);
        const png = await readFile(join(documents.currentRoot, 'assets/files', avatar.id, variant.id, variant.entry));
        const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
        expect(width).toBe(height); expect(width).toBeLessThanOrEqual(400); expect(width).toBeGreaterThan(300);
        const voices = input.assets.filter(item => item.name.startsWith(`${key}-ja-`) && item.name.endsWith('.mp3'));
        expect(voices).toHaveLength(13);
        const lines = voiced.filter(instruction => instruction.args.speaker.id === character.id);
        expect(lines.map(instruction => instruction.args.voiceByLocale.ja).sort()).toEqual(voices.map(item => item.id).sort());
        expect(lines.map(instruction => instruction.args.text)).toEqual(frozen.lines.filter(line=>line.characterKey===key).map(line => line.zh));
        expect(character.voicePresets).toEqual({}); expect(character.defaultVoicing).toBe('required');
        for (const voice of voices) {
          const variant = voice.variants.find(variant => variant.id === voice.activeVariantId);
          expect(variant.files.some(file => file.path === 'VOICE-PRODUCTION.json')).toBe(false);
          const source = JSON.parse(await readFile(join(documents.currentRoot, 'assets/files', voice.id, variant.id, 'VOICE-SOURCE.json'), 'utf8'));
          expect(source).toMatchObject({ key: voice.name.replace('.mp3', ''), character: name, locale: 'ja', model: 'Aratako/Irodori-TTS-v4.1-Small' });
          expect(Object.keys(source).sort()).toEqual(['schemaVersion', 'producedAt', 'tool', 'model', 'locale', 'textLocale', 'key', 'character', 'characterKey', 'zh', 'ja'].sort());
        }
        expect(character.afterstory.unlockEndingIds).toEqual(character.personalRoute.endingIds);
        expect(input.scenes.some(scene => scene.id === character.afterstory.entry.sceneId)).toBe(true);
        const figureNames=new Set(Object.values(manifest.figures[key]).map(path=>path.split('/').at(-1)));
        const figures = input.assets.filter(item => figureNames.has(item.name));
        expect(figures).toHaveLength(6);
        expect(character.differences).toHaveLength(6);
        expect(character.differences.find(difference=>difference.id===character.initialDifferenceId).name).toBe('日常');
        for (const figure of figures) {
          const difference=character.differences.find(difference=>difference.figure.assetId===figure.id);
          expect(difference.figure.variantId).toBe(figure.activeVariantId);
          expect(difference.avatar).toEqual({kind:'crop',crop:expectedCrops[key]});
          expect(instructions.some(instruction=>instruction.opcode==='characterDifference'&&instruction.args.characterId===character.id&&instruction.args.differenceId===difference.id)).toBe(true);
        }
      }
      const videos = instructions.filter(instruction => instruction.opcode === 'video');
      expect(videos).toHaveLength(4); expect(videos.every(instruction => instruction.continuation === 'wait')).toBe(true);
      const videoSources = input.documents.flatMap(document => document.text.split('\n').filter(line => line.startsWith('video ')));
      expect(videoSources).toHaveLength(4);
      expect(videoSources.every(line => JSON.parse(line.slice(6, line.lastIndexOf(' @'))).skippable === true)).toBe(true);
      const endings = instructions.filter(instruction => instruction.opcode === 'end');
      expect(endings.filter(instruction => instruction.args.endingId).map(instruction => instruction.args.endingId).sort()).toEqual(['spring-dragon','spring-letter','spring-whale']);
      expect(endings.filter(instruction => !instruction.args.endingId)).toHaveLength(3);
      expect(snapshot.gallery).toHaveLength(18);
      expect(snapshot.flows[0].nodes.filter(node => node.entry.kind === 'firstUnlock')).toHaveLength(4);
      expect(snapshot.flows[0].nodes.filter(node => node.entry.kind === 'initial')).toHaveLength(3);
      const music = input.assets.filter(item => /^spring-0\d\.opus$/.test(item.name));
      expect(music).toHaveLength(5);
      expect(instructions.filter(item => item.opcode === 'bgm' && item.args.op === 'play').every(item => item.args.volume === 65)).toBe(true);
      for (const asset of music) {
        const variant = asset.variants.find(item => item.id === asset.activeVariantId), author = variant.metadata.authorDocument;
        expect(variant.metadata.container).toMatch(/ogg|opus/);
        expect((await readFile(join(documents.currentRoot,'assets/files',asset.id,variant.id,variant.entry))).toString('ascii',0,4)).toBe('OggS');
        const source = listed.find(document => document.documentId === author.documentId);
        expect(source).toBeDefined();
        const score = JSON.parse(Object.values(source.files)[0]);
        expect(score.pluginDocument.contributionKey).toBe('org.galcraft.music-composition/score');
        expect(score.data.score.tracks.length).toBeGreaterThanOrEqual(6);
        expect(variant.metadata.loop.endSec).toBeGreaterThan(85);
      }
      const effects = instructions.filter(instruction => instruction.opcode === 'playEffect');
      expect(effects).toHaveLength(3);
      expect(effects[0].args.loop).toBe(true); expect(effects[1].args.loop).toBe(false);
      expect(effects[0].args.soundId).not.toBe(effects[1].args.soundId);
      expect(effects[2].args.soundId).toBe(effects[0].args.soundId);
      expect(effects[2].args.op).toBe('stop'); expect(effects[2].args.all).toBe(false);
      const preparation = snapshot.scenes.find(scene => scene.instructions.some(instruction => instruction.opcode === 'choose'));
      const bellIndex = preparation.instructions.findIndex(instruction => instruction.statementId === effects[1].statementId);
      expect(preparation.instructions[bellIndex + 1].args.durationMs).toBe(1500);
      expect(preparation.instructions[bellIndex + 2].statementId).toBe(effects[2].statementId);
      expect(instructions.filter(instruction => instruction.opcode === 'stopAnimation')).toHaveLength(1);
      const breathAsset=input.assets.find(asset=>asset.kind==='animation'&&asset.name.startsWith('角色呼吸'));
      const breath=instructions.find(instruction=>instruction.opcode==='setComplexAnimation'&&instruction.args.resourceId===breathAsset.id);
      expect(breath.args.loop).toBe(false);
      const breathVariant=breathAsset.variants.find(variant=>variant.id===breathAsset.activeVariantId);
      const breathData=JSON.parse(await readFile(join(documents.currentRoot,'assets/files',breathAsset.id,breathVariant.id,breathVariant.entry),'utf8'));
      expect(breathData.durationMs).toBe(2600);
      expect(input.project.chapters.map(chapter=>chapter.sceneIds.length)).toEqual([6,3]);
      expect(input.characters.filter(character=>character.afterstory).every(character=>character.afterstory.presentation.figure.variantId)).toBe(true);
      const move=instructions.find(instruction=>instruction.opcode==='setComplexAnimation'&&instruction.args.animation?.tracks?.some(track=>track.path==='/x'&&track.keyframes.at(-1).value===150));
      expect(move.args.animation.durationMs).toBe(500);
      const moveIndex=preparation.instructions.indexOf(move);
      expect(preparation.instructions[moveIndex+1].args.durationMs).toBe(200);
      expect(preparation.instructions[moveIndex+3].args.durationMs).toBe(300);
      expect(instructions.some(instruction => instruction.opcode === 'readingMode' && instruction.args.mode === 'nvl')).toBe(true);
      for (const type of ['oldFilm','dot','reflection','glitch','rgbSplit','godray']) expect(instructions.some(instruction => instruction.opcode === 'pixi' && instruction.args.type === type)).toBe(true);
      expect(instructions.filter(instruction => instruction.opcode === 'callScene')).toHaveLength(3);
      expect(instructions.filter(instruction => instruction.opcode === 'return')).toHaveLength(1);
      const readAnimation = async (id, parameters) => { const asset = input.assets.find(item => item.id === id), variant = asset.variants.find(item => item.id === asset.activeVariantId);
        return parseAnimationResource(await readFile(join(documents.currentRoot,'assets/files',asset.id,variant.id,variant.entry),'utf8'), parameters); };
      const longTerm = {schemaVersion:2,revision:0,readStatements:[],endings:[],cg:{},music:[],video:[],flowEntries:{},variables:{},plugins:{}};
      let writes = 0;
      const runtime = new SessionController({contributions:{commands:[],conditions:[],documents:[],tools:[],resources:[],stages:[],pages:[],components:[],systems:[],platform:[]},
        stage:new StageCommandService({animation:readAnimation,character:id=>snapshot.characters.find(character=>character.id===id),asset:id=>{const asset=snapshot.assets.find(asset=>asset.assetId===id);return {ok:true,value:{variantId:asset.variantId,kind:asset.kind,provider:null,providerVersion:null},warnings:[]};}}),
        longTerm:{current:()=>structuredClone(longTerm),prepareFlowUnlocks:input=>({ok:true,value:{sessionId:input.sessionId,snapshotId:input.snapshot.snapshotId,sequence:input.sequence,expectedLongTermRevision:input.longTermAfter.revision,entries:[]},warnings:[]}),commitRuntimeLongTerm:async()=>{writes++;throw new Error('preview must not write');}}});
      for (const option of choice.args.options) {
        const ending = snapshot.scenes.find(scene=>scene.scene.id===option.target.sceneId), target = {sceneId:ending.scene.id,statementId:ending.instructions.at(-1).statementId};
        const entry = {sceneId:opening.scene.id,statementId:opening.instructions[0].statementId};
        const scenario = {schemaVersion:1,id:crypto.randomUUID(),name:'春灯路线',projectId:snapshot.projectId,engineVersion:snapshot.engineVersion,pluginVersions:[],entry,target,route:[],playerInputs:[],initialProgress:{},pluginInitial:{},externalPolicy:'simulate'};
        const domain = {projectId:snapshot.projectId,kind:'sample',instance:crypto.randomUUID()};
        const blocked = unwrap(await runtime.prepareSession({snapshot,domain,source:{kind:'entry',scenario},target}));
        expect(blocked.reached).toBe(false); expect(blocked.state.wait.kind).toBe('choice');
        scenario.route.push({statementId:choice.statementId,occurrence:blocked.state.occurrence,optionId:option.id});runtime.disposePrepared(blocked.id);
        const reached = unwrap(await runtime.prepareSession({snapshot,domain,source:{kind:'entry',scenario},target}));
        expect(reached.reached).toBe(true);expect(reached.state.presentation.objects.filter(item => item.characterId).length).toBe(0);
        const character=snapshot.characters.find(character=>character.personalRoute?.sceneIds.includes(ending.scene.id));
        expect(reached.state.presentation.characterDifferences[character.id].differenceId).toBe(character.differences.find(difference=>difference.name==='微笑').id);
        expect(reached.state.frames).toHaveLength(0); runtime.disposePrepared(reached.id);
      }
      expect(writes).toBe(0);
      const runtimeAcceptance = await acceptPracticeRuntime(snapshot, join(parent, 'player-profile'), readAnimation);
      expect(runtimeAcceptance.endings.sort()).toEqual(['spring-dragon', 'spring-letter', 'spring-whale']);
      expect(runtimeAcceptance.endings.sort()).toEqual(runtimeAcceptance.endingIds.sort());
      expect(runtimeAcceptance.index.continueRecordId).toBe(runtimeAcceptance.mainContinueId);
      expect(runtimeAcceptance.index.afterstoryRecords).toEqual(runtimeAcceptance.afterstoryRecords);
      expect(runtimeAcceptance.restoredContinues).toHaveLength(4);
      for(const route of runtimeAcceptance.routeVariableValues){
        const character=input.characters.find(character=>character.personalRoute?.sceneIds.includes(route.sceneId));
        for(const variable of snapshot.variables)expect(route.values[variable.id]).toBe(variable.type === 'string' ? '玩家' : variable.name===`已进入${character.name}路线`);
      }
      for (const restored of runtimeAcceptance.restoredContinues) {
        expect(restored.variables).toEqual(restored.expectedVariables);
        expect(restored.characterDifferences).toEqual(restored.expectedCharacterDifferences);
        expect(restored.position).toEqual(restored.expectedPosition); expect(restored.occurrence).toBe(restored.expectedOccurrence);
        expect(restored.entryId ? restored.story.entryId : restored.story?.kind ?? 'main').toBe(restored.entryId ?? 'main');
      }
      expect(runtimeAcceptance.completed.sort()).toEqual(input.characters.filter(character => character.afterstory).map(character => character.afterstory.id).sort());
      expect(runtimeAcceptance.firstUnlockCount).toBe(4);
      expect(runtimeAcceptance.resolvedVoices).toHaveLength(39);
      expect(runtimeAcceptance.resolvedVoices.every(voice => voice.locale === 'ja')).toBe(true);
      expect(runtimeAcceptance.flowSnapshots.every(node => node.sceneId === node.storedSceneId && node.flag === true && node.objects > 0)).toBe(true);
      expect(runtimeAcceptance.unacknowledgedGallery).toEqual({ cg: {}, music: [], video: [] });
      await writeFile(join(evidence, 'runtime-disk.json'), JSON.stringify(runtimeAcceptance, null, 2));
      const root = documents.currentRoot; unwrap(await documents.close(opened.sessionId,'save')); unwrap(await documents.open(root));
      const reopened = compile(unwrap(compileInput(unwrap(documents.list()))));
      expect(reopened.issues.filter(issue => issue.severity === 'error')).toEqual([]);
      expect(reopened.snapshot.project.name).toBe('我自己的春灯'); expect(reopened.snapshot.characters).toHaveLength(4);
      expect(reopened.snapshot.scenes).toHaveLength(9); expect(reopened.snapshot.assets).toHaveLength(assetCount);
    } finally { if(documents.currentSessionId) await documents.close(documents.currentSessionId,'discard'); }
  },180000);
});
