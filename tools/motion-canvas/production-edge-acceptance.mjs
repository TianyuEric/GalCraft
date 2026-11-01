import { checkEvidenceBudget, removeWorkspace } from '../../tests/e2e/workspace.mjs';
import assert from 'node:assert/strict';
import {copyFile, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join, relative, resolve} from 'node:path';
import {ProjectSession} from '@galcraft/documents';
import {ConnectionConfigSchema, createId, DefaultTimeoutSecByPurpose} from '@galcraft/contracts';
import {FixtureLock, FixtureProject, FixtureScenes} from '@galcraft/contracts/fixtures';
import {createOfficialTemplate, createTemplateDocuments} from '@galcraft/templates';
import {createAssetIndex, decodeSVG} from '../../packages/assets/dist/core/index.js';
import {StudioAssets} from '../../apps/studio/main/asset-providers.mjs';
import {ProjectDocuments} from '../../apps/studio/main/document-providers.mjs';
import {PluginDocuments} from '../../apps/studio/main/plugin-documents.mjs';
import {StudioPluginPackages} from '../../apps/studio/main/plugin-packages.mjs';
import {pluginServiceContext, pluginServicePorts} from '../../apps/studio/main/plugin-service-ports.mjs';
import {StudioProduction} from '../../apps/studio/main/production-providers.mjs';
import {StudioCollaboration} from '../../apps/studio/main/collaboration-providers.mjs';
import {productionRuntimeDependencies} from '../../apps/studio/main/production-runtimes.mjs';
import {ConnectionVault} from '../../apps/studio/main/preferences.mjs';
import {ResourceRegistry} from '../media/src/resources.mjs';
import {runProcess, probeMedia} from '../media/src/process.mjs';
import {operationId, pluginId, projectDocumentKey, renderProviderKey} from '../../plugins/motion-canvas/dist/index.js';

await checkEvidenceBudget();
const repo = resolve(import.meta.dirname, '../..');
const selected = process.argv.includes('--case') ? process.argv[process.argv.indexOf('--case') + 1] : 'all';
assert(['all', 'freeze', 'errors', 'lifecycle'].includes(selected));
const work = join(repo, 'tmp/testing', `motion-canvas-edges-${selected}`);
assert(!relative(join(repo, 'tmp/testing'), work).startsWith('..'));
const evidence = join(repo, 'test-results/latest/motion-canvas', 'MC-edges', selected);
const root = join(work, 'project'), userData = join(work, 'profile');
const value = result => {if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`); return result.value;};
const execute = promisify(execFile);
const report = {target: 'actual StudioProduction/M02/M04/M09 and ordinary plugin 0.1.0', command: `node tools/motion-canvas/production-edge-acceptance.mjs --case ${selected}`, root, userData, executedAt: new Date().toISOString(), result: 'running', records: []};
await mkdir(evidence, {recursive: true});
await rm(work, {recursive: true, force: true});
await mkdir(join(work, 'inputs'), {recursive: true});
let project, production, assets, plugins, connections, config, projects, documents, ports, resources, author, collaboration, collaborationSession;
let writeSessionId = createId(), callSequence = 0;
const persist = async () => writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
const record = async (caseId, actual, result = 'passed') => {report.records.push({caseId, result, actual, executedAt: new Date().toISOString()}); await persist(); console.log(`${caseId}: ${result}`);};
const apply = input => {const plan = value(project.planEdit(input)); return value(project.applyEdit(plan.planId, plan.input.expected));};
const currentAuthor = () => value(documents.list({pluginId})).find(document => document.documentId === author.documentId);
const updateAuthor = async source => {const current = currentAuthor(); apply(value(await documents.update({documentId: current.documentId, expectedRevision: current.revision, data: {project: source}}))); return currentAuthor();};
const service = async () => (await production.current()).service;
const makeProduction = () => new StudioProduction({userData, projects, assets, resources, connections, generationProviders: ports.generationProviders,
  language: {currentInput: () => ({...production.compileInput(project), pluginCommands: [], pluginConditions: []})}});
const prepare = async (source, references, connection = config) => {
  const current = currentAuthor();
  const plan = value(await production.prepareOperation({operation: operationId, connectionId: connection.id, usage: 'cg', fields: {project: source, references},
    sourceVersions: [{ref: {kind: 'document', id: current.documentId}, revision: current.revision}]}));
  assert(!plan.issues.some(issue => issue.severity === 'error'), JSON.stringify(plan.issues)); return plan;
};
const submit = async (source, references, connection = config) => {
  if (!collaboration) {const plan = await prepare(source, references, connection); return {plan, task: value(await production.call('submit', plan.planId))};}
  const prefix = `render-${++callSequence}`, current = currentAuthor();
  const planned = await collaboration.core.invoke('galcraft_production', {action: 'prepare', operation: operationId, connectionId: connection.id, usage: 'cg', fields: {project: source},
    references: references.map(({assetId, variantId, port}) => ({assetId, variantId, port})), sourceVersions: [{ref: {kind: 'document', id: current.documentId}, revision: current.revision}]}, collaborationSession.id, `${prefix}-prepare`);
  assert.equal(planned.state, 'completed', JSON.stringify(planned)); const plan = planned.result;
  const input = {action: 'submit', planId: plan.planId}, callId = `${prefix}-submit`;
  const submitted = await collaboration.core.invoke('galcraft_production', input, collaborationSession.id, callId);
  assert.equal(submitted.state, 'completed', JSON.stringify(submitted)); return {plan, task: submitted.result, callId, input};
};
const finish = async task => {const owner = await service(); await owner.drain(); return owner.listTasks().find(value => value.id === task.id);};
const candidate = async task => {const item = task.items[0]; assert.equal(item.attempts.length, 1); assert.equal(item.candidateIds.length, 1, JSON.stringify(item.issues)); return (await service()).getCandidate(item.candidateIds[0]);};
const taskSummary = task => ({id: task.id, state: task.state, items: task.items.map(item => ({id: item.id, state: item.state, progress: item.progress, attempts: item.attempts, remote: item.remote, candidateIds: item.candidateIds, issues: item.issues}))});
const referencesFor = async ids => Promise.all(ids.map(async (assetId, index) => ({...value(await production.call('mediaInput', {assetId})), port: ['images', 'fonts', 'audio'][index]})));
const ownBrowsers = async () => {
  const {stdout} = await execute('powershell.exe', ['-NoProfile', '-Command', `@(Get-CimInstance Win32_Process -Filter "ParentProcessId=${process.pid}" | Where-Object { $_.Name -eq 'chrome.exe' } | Select-Object ProcessId,ParentProcessId,CommandLine) | ConvertTo-Json -Compress`]);
  if (!stdout.trim()) return []; const parsed = JSON.parse(stdout); return Array.isArray(parsed) ? parsed : [parsed];
};
try {
  const documentId = createId(), lockId = createId(), sceneId = createId(), index = createAssetIndex(createId()), template = createOfficialTemplate({kind: 'standard'});
  const envelope = (documentId, data) => JSON.stringify({schemaVersion: 1, documentId, revision: 1, data});
  const data = {...structuredClone(FixtureProject), name: 'Motion Canvas M10 定向验收', entry: {sceneId: FixtureScenes[0].id, labelId: null}, chapters: [{...FixtureProject.chapters[0], sceneIds: [FixtureScenes[0].id]}], templateDocumentId: template.instanceId};
  const sessionOptions = {resolveRequiredRef: new ProjectDocuments({}).resolveRequiredRef};
  project = await ProjectSession.createProject(root, data.projectId, [{documentId, revision: 1, format: 'json', files: {'project.json': envelope(documentId, data)}},
    {documentId: lockId, revision: 1, format: 'json', files: {'dependencies.lock.json': envelope(lockId, {...FixtureLock, template: {...FixtureLock.template, id: template.id, version: template.version}, plugins: [{id: pluginId, version: '0.1.0', required: true, kind: 'plugin', targets: ['windows', 'web']}]})}},
    {documentId: index.documentId, revision: 1, format: 'json', files: {'assets/index.json': JSON.stringify(index)}},
    {documentId: sceneId, revision: 1, format: 'dsl', files: {[`scenes/${FixtureScenes[0].id}/scene.json`]: envelope(sceneId, FixtureScenes[0]), [`scenes/${FixtureScenes[0].id}/script.gal`]: `end {} @${createId()};\n`}}, ...createTemplateDocuments(template)], sessionOptions);
  projects = {get currentSession() {return project;}, get currentSessionId() {return writeSessionId;}, currentRoot: root, list: () => ({ok: true, warnings: [], value: [...project.documents.values()]})};
  resources = new ResourceRegistry(); assets = new StudioAssets(projects, join(repo, 'tools/media/runtime/bin'), decodeSVG, undefined, resources);
  const productionRuntimes = productionRuntimeDependencies({directory: join(import.meta.dirname, 'runtime'), entry: join(import.meta.dirname, 'render.mjs')});
  plugins = new StudioPluginPackages(join(userData, 'plugins'), resources, (id, target, selected) => pluginServiceContext({projects, assets, productionRuntimes, credential: async () => null}, id, target, selected));
  value(await plugins.install({kind: 'directory', path: join(repo, 'plugins/motion-canvas/package')}));
  ports = pluginServicePorts(plugins); Object.assign(assets, {assetTypes: ports.assetTypes, resourceProcessors: ports.resourceProcessors, resourceProviders: ports.resourceProviders});
  connections = new ConnectionVault(userData);
  config = ConnectionConfigSchema.parse({id: createId(), revision: 1, name: '本机 MC 定向验收', protocol: 'plugin', providerKey: renderProviderKey, baseUrl: 'http://127.0.0.1', auth: 'none', credentialId: null, apiKeyHeader: null, model: 'Motion Canvas 3.17.2', purposes: [operationId], timeoutSecByPurpose: {...DefaultTimeoutSecByPurpose, [operationId]: 600}, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null});
  await connections.save(config); production = makeProduction(); documents = new PluginDocuments(projects, plugins);
  const image = join(work, 'inputs', 'image.png'); await copyFile(join(repo, 'apps/studio/resources/practice/backgrounds/spring-shop.png'), image);
  const sourcePaths = [image, join(repo, 'tools/fonts/cache/NotoSansCJKsc-Regular.otf'), join(repo, 'apps/studio/resources/practice/music/spring-01.opus')], ids = [];
  for (const path of sourcePaths) {const imported = value(await assets.import([path], {conflict: 'keepBoth'})); assert.equal(imported.failed.length, 0, JSON.stringify(imported.failed)); ids.push(imported.succeeded[0].id);}
  let references = await referencesFor(ids);
  const source = {schemaVersion: 1, id: createId(), revision: 1, title: 'M10 冻结旧章', entry: 'project.ts', files: [],
    bindings: references.map((reference, index) => ({alias: ['image', 'font', 'audio'][index], assetId: reference.assetId, variantId: reference.variantId, port: reference.port, purpose: ['image', 'font', 'audio'][index]})),
    render: {width: 960, height: 540, fps: 24, frames: 360, audio: {alias: 'audio', startSec: 0, trimSec: 0, gainDb: 0}}, toolchain: {motionCanvas: '3.17.2', vite: '5.4.21', renderer: '0.1.0'}};
  source.files = await Promise.all(['project.ts', 'scene.tsx'].map(async path => ({path, content: await readFile(join(import.meta.dirname, 'fixture', path), 'utf8')})));
  source.files[0].content = "import {asset} from '@galcraft/motion-canvas-assets';\n" + source.files[0].content.replace("'/media/audio.opus'", "asset('audio')");
  source.files[1].content = "import {asset,font} from '@galcraft/motion-canvas-assets';\n" + source.files[1].content.replace('src="/media/image.png"', "src={asset('image')}").replace('fontFamily="GalCraftMotion"', "fontFamily={font('font')}").replace('春日序章', 'M10 冻结旧章');
  const authorEdit = value(await documents.create({pluginId, contributionKey: projectDocumentKey, name: 'M10 定向作者工程', data: {project: source}})); apply(authorEdit);
  author = value(documents.list({pluginId})).find(document => document.documentId === authorEdit.patches[0].documentId);
  value(await project.save(value(project.planSave({kind: 'all'})).planId));
  const events = []; (await service()).subscribe(next => events.push({taskId: next.id, item: taskSummary(next).items[0]}));

  let oldVideo, oldBytes;
  if (selected === 'all' || selected === 'freeze') {
    const originalImage = await readFile(references[0].localPath), originalReference = structuredClone(references[0]);
    const first = await submit(source, references); let mutation;
    const unsubscribe = (await service()).subscribe(next => {const progress = next.items[0].progress; if (next.id !== first.task.id || mutation || progress?.phase !== 'rendering' || progress.completed < 24) return;
      mutation = (async () => {
        await copyFile(join(repo, 'apps/studio/resources/practice/backgrounds/spring-street.png'), image);
        const imported = value(await assets.import([image], {conflict: 'replace'})); assert.equal(imported.failed.length, 0); assert.equal(imported.succeeded[0].id, ids[0]);
        references = await referencesFor(ids); source.revision = 2; source.title = 'M10 新修订'; source.files[1].content = source.files[1].content.replace('M10 冻结旧章', 'M10 新修订'); source.bindings[0].variantId = references[0].variantId;
        await updateAuthor(source); return {frame: progress.completed, documentRevision: currentAuthor().revision, oldReference: originalReference, newReference: references[0]};
      })();
    });
    const completed = await finish(first.task); unsubscribe(); assert(mutation, 'The author must change during actual frame rendering'); const changed = await mutation;
    const before = await candidate(completed), frozen = completed.items[0].input;
    assert.equal(frozen.fields.project.revision, 1); assert.equal(frozen.references[0].variantId, originalReference.variantId); assert.notEqual(frozen.references[0].localPath, originalReference.localPath);
    assert((await readFile(frozen.references[0].localPath)).equals(originalImage)); assert.notEqual(references[0].variantId, originalReference.variantId);
    assert.equal(before.artifacts[0].metadata.authorDocument.data.project.revision, 1);
    const second = await submit(source, references), newer = await finish(second.task), after = await candidate(newer);
    assert.notEqual(first.task.id, second.task.id); assert.equal(newer.items[0].input.fields.project.revision, 2); assert.equal(newer.items[0].input.references[0].variantId, references[0].variantId);
    assert.equal(after.artifacts[0].metadata.authorDocument.data.project.revision, 2);
    for (const [name, media] of [['frozen-v1', before], ['revision-v2', after]]) {await copyFile(media.artifacts[0].localPath, join(evidence, `${name}.mp4`)); await writeFile(join(evidence, `${name}.candidate.json`), JSON.stringify(media, null, 2)); await runProcess(join(assets.toolDirectory, 'ffmpeg.exe'), ['-v', 'error', '-y', '-ss', '7.5', '-i', media.artifacts[0].localPath, '-frames:v', '1', join(evidence, `${name}.png`)]);}
    assert(!(await readFile(join(evidence, 'frozen-v1.png'))).equals(await readFile(join(evidence, 'revision-v2.png'))));
    oldVideo = before.artifacts[0].localPath; oldBytes = await readFile(oldVideo);
    await record('MC-T03/M10-newRevision', {changed, first: taskSummary(completed), second: taskSummary(newer), frozenSourceRevision: 1, nextSourceRevision: 2, actualFrames: [before.artifacts[0].metadata.frames, after.artifacts[0].metadata.frames], distinctActualFrames: true, frozenInputBytesRetained: true});
  }
  if (selected === 'all' || selected === 'errors') {
    const baseline = await submit(source, references), baselineTask = await finish(baseline.task), baselineCandidate = await candidate(baselineTask);
    oldVideo = baselineCandidate.artifacts[0].localPath; oldBytes = await readFile(oldVideo);
    for (const alias of ['font', 'audio']) {
      const malformed = structuredClone(source), binding = malformed.bindings.find(value => value.alias === alias); binding.variantId = 'MissingVariant';
      const execution = await submit(malformed, references), done = await finish(execution.task), item = done.items[0];
      assert.equal(item.state, 'failed'); assert.equal(item.candidateIds.length, 0); assert.equal(item.issues[0].code, 'MOTION_RESOURCE'); assert(item.issues[0].message.includes(alias)); assert(item.issues[0].message.includes('MissingVariant'));
      await record(`MC-T05/missing-${alias}-binding`, taskSummary(done));
    }
    const malformed = structuredClone(source); malformed.files[1].content = "import 'galcraft-missing-motion-dependency';\n" + malformed.files[1].content;
    const execution = await submit(malformed, references), done = await finish(execution.task), item = done.items[0];
    assert.equal(item.state, 'failed'); assert.equal(item.candidateIds.length, 0); assert(item.issues[0].message.includes('scene.tsx')); assert(item.issues[0].message.includes('galcraft-missing-motion-dependency'));
    await record('MC-T05/dependency', taskSummary(done));
    const fixed = await submit(source, references), repaired = await finish(fixed.task), fixedCandidate = await candidate(repaired);
    assert((await readFile(oldVideo)).equals(oldBytes)); assert.notEqual(fixed.task.id, execution.task.id);
    await copyFile(fixedCandidate.artifacts[0].localPath, join(evidence, 'repaired.mp4'));
    await record('MC-T05/repair', {task: taskSummary(repaired), originalCandidateId: baselineCandidate.id, repairedCandidateId: fixedCandidate.id, originalBytesRetained: true, probe: await probeMedia(assets.toolDirectory, fixedCandidate.artifacts[0].localPath)});
  }
  if (selected === 'all' || selected === 'lifecycle') {
    const short = {...structuredClone(config), id: createId(), name: 'MC 一秒超时验收', timeoutSecByPurpose: {...config.timeoutSecByPurpose, [operationId]: 1}}; await connections.save(short);
    const makeCollaboration = async () => {collaboration = new StudioCollaboration({userData, projects, assets, production, plugins}); await collaboration.ready;};
    const createCollaborationSession = async () => value(await collaboration.call('create', {goal: '本机 Motion Canvas 生命周期与原调用恢复', harness: 'codex',
      scope: {documents: [author.documentId], createKinds: [], tools: ['galcraft_production'], operations: [operationId], connectionIds: [config.id, short.id], models: [config.model], workflowIds: [], maxGenerations: 0}}));
    await makeCollaboration(); collaborationSession = await createCollaborationSession();
    const baseline = await submit(source, references), completed = await finish(baseline.task), completeCandidate = await candidate(completed);
    oldVideo = completeCandidate.artifacts[0].localPath; oldBytes = await readFile(oldVideo);
    const started = performance.now(), timed = await submit(source, references, short); let watchdog = false;
    const timer = setTimeout(() => {watchdog = true; void production.call('cancel', timed.task.id);}, 12000);
    const timeoutTask = await finish(timed.task); clearTimeout(timer);
    await record('MC-T06/timeout', {elapsedMs: Math.round(performance.now() - started), watchdog, task: taskSummary(timeoutTask)}, !watchdog && timeoutTask.items[0].state === 'failed' && /timeout|超时/i.test(JSON.stringify(timeoutTask.items[0].issues)) ? 'passed' : 'failed');
    const crash = await submit(source, references); let killed;
    const stopWatching = (await service()).subscribe(next => {const progress = next.items[0].progress; if (next.id !== crash.task.id || killed || progress?.phase !== 'rendering' || progress.completed < 24) return;
      killed = (async () => {const browsers = await ownBrowsers(); assert.equal(browsers.length, 1); await execute('taskkill.exe', ['/PID', String(browsers[0].ProcessId), '/T', '/F']); return browsers;})();
    });
    let crashWatchdog = false; const crashTimer = setTimeout(() => {crashWatchdog = true; void production.call('cancel', crash.task.id);}, 15000);
    const crashed = await finish(crash.task); clearTimeout(crashTimer); stopWatching(); assert(killed); const killedBrowsers = await killed;
    await record('MC-T06/browser-crash', {killedBrowsers, watchdog: crashWatchdog, task: taskSummary(crashed), survivingBrowsers: await ownBrowsers()}, !crashWatchdog && crashed.items[0].state === 'failed' ? 'passed' : 'failed');
    const authorCancel = await submit(source, references); let cancelRequest;
    const unwatchCancel = (await service()).subscribe(next => {const progress = next.items[0].progress; if (next.id === authorCancel.task.id && !cancelRequest && progress?.phase === 'rendering' && progress.completed >= 24) cancelRequest = production.call('cancel', authorCancel.task.id);});
    const cancelled = await finish(authorCancel.task); unwatchCancel(); assert(cancelRequest); value(await cancelRequest);
    assert.equal(cancelled.items[0].state, 'cancelled'); assert.equal(cancelled.items[0].attempts.length, 1); assert.equal(cancelled.items[0].candidateIds.length, 0); assert(!cancelled.items[0].issues.some(issue => issue.code === 'MOTION_TIMEOUT'));
    assert.deepEqual(await ownBrowsers(), []); await record('MC-T06/M10-author-cancel', {task: taskSummary(cancelled), survivingBrowsers: []});
    value(await project.save(value(project.planSave({kind: 'all'})).planId));
    const beforeTasks = value(await production.call('tasks')), attemptsBefore = beforeTasks.reduce((sum, task) => sum + task.items.reduce((sum, item) => sum + item.attempts.length, 0), 0);
    const originalSession = collaborationSession; await collaboration.close(); collaboration = null;
    for (const active of production.activeServices) await active.close(); await project.dispose('keep');
    project = await ProjectSession.open(root, data.projectId, sessionOptions); writeSessionId = createId(); production = makeProduction(); await makeCollaboration();
    const reopened = value(await production.call('tasks')), attemptsAfter = reopened.reduce((sum, task) => sum + task.items.reduce((sum, item) => sum + item.attempts.length, 0), 0);
    assert.deepEqual(reopened.map(task => task.id), beforeTasks.map(task => task.id)); assert.equal(attemptsAfter, attemptsBefore); assert((await readFile(oldVideo)).equals(oldBytes));
    assert.equal(value(await production.call('candidate', completeCandidate.id)).id, completeCandidate.id); await (await service()).drain();
    assert.equal(value(await production.call('tasks')).reduce((sum, task) => sum + task.items.reduce((sum, item) => sum + item.attempts.length, 0), 0), attemptsBefore);
    const recoveredCalls = [];
    for (const original of [baseline, timed, crash, authorCancel]) {
      const query = await collaboration.core.query(originalSession.id, original.callId), repeat = await collaboration.core.invoke('galcraft_production', original.input, originalSession.id, original.callId);
      assert.equal(query.callId, original.callId); assert.equal(query.result.id, original.task.id); assert.equal(repeat.result.id, original.task.id); assert.equal(query.result.items[0].attempts.length, 1); recoveredCalls.push(query);
    }
    const recoveredMedia = await collaboration.core.invoke('galcraft_production', {action: 'candidate', candidateId: completeCandidate.id}, originalSession.id, 'read-original-candidate'); assert.equal(recoveredMedia.result.candidate.id, completeCandidate.id);
    assert.equal(collaboration.core.get(originalSession.id).generations, 0); assert.equal(value(await production.call('tasks')).length, beforeTasks.length);
    collaborationSession = await createCollaborationSession();
    const remake = await submit(source, references), remade = await finish(remake.task), remakeCandidate = await candidate(remade); assert(!beforeTasks.some(task => task.id === remake.task.id));
    assert.equal(remade.items[0].remote, null); assert.equal(remade.items[0].attempts.length, 1); assert((await readFile(oldVideo)).equals(oldBytes));
    const staging = await readdir(join(userData, 'tasks', data.projectId, crashed.id, 'items', crashed.items[0].id, 'outputs'));
    assert(!staging.some(name => name.startsWith('motion-') || name.endsWith('.part.mp4')));
    await writeFile(join(evidence, 'recovered-calls.json'), JSON.stringify(recoveredCalls, null, 2));
    await record('MC-T06/reopen-explicit-remake', {beforeTaskIds: beforeTasks.map(task => task.id), reopenedTaskIds: reopened.map(task => task.id), attemptsBefore, attemptsAfter, originalSessionId: originalSession.id, originalCallIds: recoveredCalls.map(call => call.callId), originalCallTasks: recoveredCalls.map(call => call.result.id), originalCallsUnchanged: true, localGenerationRequestCount: 0, oldCandidateId: completeCandidate.id, oldCandidateRetained: true, newSessionId: collaborationSession.id, newCallId: remake.callId, newTask: taskSummary(remade), newCandidateId: remakeCandidate.id, staging});
  }
  await writeFile(join(evidence, 'events.json'), JSON.stringify(events, null, 2));
  report.result = report.records.some(record => record.result === 'failed') ? 'failed' : 'passed';
} catch (error) {report.result = 'failed'; report.error = String(error.stack ?? error);}
finally {
  await collaboration?.close();
  if (production) for (const active of production.activeServices) await active.close();
  await project?.dispose('keep'); await removeWorkspace(work); await checkEvidenceBudget(); await persist(); console.log(JSON.stringify({result: report.result, evidence, error: report.error})); if (report.result === 'failed') process.exitCode = 1;
}
