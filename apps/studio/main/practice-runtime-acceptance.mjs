import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createId } from '@galcraft/contracts';
import { SessionController } from '../../../packages/runtime/src/session.ts';
import { StageCommandService } from '../../../packages/stage/src/commands.ts';
import { PlayerDataService } from '../../../packages/player-ui/src/data.ts';
import { PlayerLongTermService } from '../../../packages/player-ui/src/long-term.ts';
import { playerVariableValues } from '../../../packages/player-ui/src/variables.ts';

const unwrap = result => { if (!result.ok) throw new Error(JSON.stringify(result.error)); return result.value; };
const ok = value => ({ ok: true, value, warnings: [] });

/** Real runtime/M07 disk acceptance; media completion is simulated and makes no successful-playback claim. */
export async function acceptPracticeRuntime(snapshot, directory, animation) {
  const domain = { projectId: snapshot.projectId, kind: 'player', instance: 'default' };
  const host = { target: 'windows', storage: {
    read: async key => { try { return ok(new Uint8Array(await readFile(join(directory, key)))); } catch (error) { if (error.code === 'ENOENT') return ok(null); throw error; } },
    commit: async input => { for (const item of input.writes) { const path = join(directory, item.key); await mkdir(dirname(path), { recursive: true }); await writeFile(path, item.bytes); }
      for (const key of input.deletes) try { await unlink(join(directory, key)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      return ok({ revision: input.expectedRevision + 1 }); },
  } };
  const data = new PlayerDataService(host, domain, 'zh-CN', snapshot.project.languages.voiceDefault); unwrap(await data.open());
  const longTerm = new PlayerLongTermService(data);
  const runtime = new SessionController({ longTerm,
    contributions: { commands: [], conditions: [], documents: [], tools: [], resources: [], stages: [], pages: [], components: [], systems: [], platform: [] },
    stage: new StageCommandService({ animation, asset: id => { const asset = snapshot.assets.find(item => item.assetId === id); return ok({ variantId: asset.variantId, kind: asset.kind, provider: null, providerVersion: null }); }, character: id => snapshot.characters.find(character => character.id === id) }),
    onCommitted: () => ({ presentationEntered: true, mediaStarted: false }),
  });
  const start = async (sceneId, story = { kind: 'main' }) => {
    const position = { sceneId, statementId: snapshot.scenes.find(scene => scene.scene.id === sceneId).instructions[0].statementId }, scenario = { schemaVersion: 1, id: createId(), name: '样例运行与磁盘资料', projectId: snapshot.projectId,
      engineVersion: snapshot.engineVersion, pluginVersions: [], entry: position, target: position, route: [], playerInputs: [], initialProgress: {}, pluginInitial: {}, externalPolicy: 'simulate' };
    const prepared = unwrap(await runtime.prepareSession({ snapshot, domain, source: { kind: 'entry', scenario }, target: null, story }));
    unwrap(runtime.activate(prepared.id)); longTerm.setActiveSession(runtime.inspect().sessionId); unwrap(await runtime.start());
  };
  const advance = async optionId => {
    const current = runtime.inspect(), wait = current.state.wait;
    if (wait?.kind === 'say') {
      const reading = current.state.presentation.text.reading, text = current.state.presentation.text.text;
      if (reading?.mode === 'nvl' && reading.end === null) unwrap(runtime.updateNvlLayout({ token: current.token, start: reading.start, end: Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).length }));
      unwrap(await runtime.updateTextProgress({ token: current.token, textShown: 100000 }));
      return unwrap(await runtime.dispatch({ kind: 'advance', token: current.token }));
    }
    if (wait?.kind === 'choice') return unwrap(await runtime.dispatch({ kind: 'choose', token: current.token, optionId }));
    if (wait?.kind === 'animation') return unwrap(await runtime.dispatch({ kind: 'animation', token: current.token }));
    if (wait?.kind === 'timer') return unwrap(await runtime.dispatch({ kind: 'timer', token: current.token }));
    throw new Error(`Unsupported sample wait ${JSON.stringify(wait)}`);
  };
  const saveContinue = async () => {
    const current = runtime.inspect(), recordId = createId();
    const record = { schemaVersion: 1, recordId, projectId: snapshot.projectId, createdAt: new Date().toISOString(), kind: 'continue',
      releaseVersion: snapshot.releaseVersion, engineVersion: snapshot.engineVersion, dependencyVersions: [snapshot.lock.engine, ...snapshot.lock.plugins, snapshot.lock.template],
      summary: { sceneName: snapshot.scenes.find(scene => scene.scene.id === current.state.position.sceneId).scene.name, speaker: '', text: current.state.presentation.text.text, playTimeMs: 0 },
      thumbnail: null, state: current.state, history: current.history };
    unwrap(await data.save({ kind: 'continue', record, expectedIndexRevision: data.current().index.revision })); return recordId;
  };
  const choices = snapshot.scenes.flatMap(scene => scene.instructions).find(instruction => instruction.opcode === 'choose').args.options;
  let mainContinueId;
  const routeVariableValues=[];
  const resolvedVoices = new Map();
  const collectVoices = () => { for (const entry of runtime.inspect().history) if (entry.voiceAssetId) resolvedVoices.set(entry.voiceAssetId, { assetId: entry.voiceAssetId, text: entry.text, locale: entry.locale }); };
  for (const [i, option] of choices.entries()) {
    await start(snapshot.project.entry.sceneId);
    if (i === 0) mainContinueId = await saveContinue();
    for (let step = 0; runtime.inspect().status !== 'ended' && step < 300; step++) await advance(option.id);
    if (runtime.inspect().status !== 'ended') throw new Error('Sample route did not end');
    routeVariableValues.push({sceneId:option.target.sceneId,values:playerVariableValues(snapshot,runtime.inspect().state,data.current().longTerm).progress});
    collectVoices();
  }
  const endingIds = [...data.current().longTerm.endings], afterstoryRecords = {};
  for (const character of snapshot.characters.filter(character => character.afterstory)) {
    const after = character.afterstory;
    if (!after.unlockEndingIds.every(id => endingIds.includes(id))) throw new Error('Sample afterstory did not unlock');
    await start(after.entry.sceneId, { kind: 'afterstory', entryId: after.id, characterId: character.id, title: after.title });
    await advance();
    afterstoryRecords[after.id] = await saveContinue();
    for (let step = 0; runtime.inspect().status !== 'ended' && step < 100; step++) await advance();
    if (runtime.inspect().status !== 'ended') throw new Error('Sample afterstory did not end');
    collectVoices();
  }
  const reopened = new PlayerDataService(host, domain, 'zh-CN', snapshot.project.languages.voiceDefault); const profile = unwrap(await reopened.open()), restoredContinues = [];
  for (const [entryId, recordId] of [[null, mainContinueId], ...Object.entries(afterstoryRecords)]) {
    const record = unwrap(await reopened.record(recordId));
    const restored = unwrap(await runtime.prepareSession({ snapshot, domain, source: { kind: 'restored', state: record.state, history: record.history, voiceLocale: snapshot.project.languages.voiceDefault }, target: null }));
    unwrap(runtime.activate(restored.id)); longTerm.setActiveSession(runtime.inspect().sessionId); unwrap(await runtime.start());
    const actual = runtime.inspect().state;
    restoredContinues.push({ entryId, recordId, story: actual.story, position: actual.position, expectedPosition: record.state.position, occurrence: actual.occurrence, expectedOccurrence: record.state.occurrence,
      variables:playerVariableValues(snapshot,actual,reopened.current().longTerm).progress,expectedVariables:record.state.progress,
      characterDifferences:actual.presentation.characterDifferences,expectedCharacterDifferences:record.state.presentation.characterDifferences });
  }
  const routeNodes = snapshot.flows.flatMap(flow => flow.nodes).filter(node => node.entry.kind === 'firstUnlock' && node.sceneId !== snapshot.project.entry.sceneId);
  const flowSnapshots = routeNodes.map(node => ({ nodeId: node.id, sceneId: node.sceneId, storedSceneId: profile.longTerm.flowEntries[node.id]?.state.position.sceneId,
    flag: profile.longTerm.flowEntries[node.id]?.state.progress[node.unlock.id], objects: profile.longTerm.flowEntries[node.id]?.state.presentation.objects.length }));
  runtime.dispose();
  return { environment: 'Real SessionController, StageCommandService, PlayerLongTermService and filesystem-backed PlayerDataService; media completion simulated and presentation not acknowledged',
    endings: profile.longTerm.endings, endingIds, mainContinueId, index: profile.index, afterstoryRecords, restoredContinues, completed: profile.longTerm.afterstoryCompleted,routeVariableValues,
    firstUnlockCount: Object.keys(profile.longTerm.flowEntries).length, flowSnapshots, resolvedVoices: [...resolvedVoices.values()],
    unacknowledgedGallery: { cg: profile.longTerm.cg, music: profile.longTerm.music, video: profile.longTerm.video } };
}
