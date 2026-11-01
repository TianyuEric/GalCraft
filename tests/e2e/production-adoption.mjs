import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { createId, DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import { compile, parse } from '../../packages/dsl/dist/index.js';
import { inputCapability } from '../../packages/authoring/dist/production/index.js';
import { StudioProduction } from '../../apps/studio/main/production-providers.mjs';
import { StudioAssets } from '../../apps/studio/main/asset-providers.mjs';
import { ProjectDocuments } from '../../apps/studio/main/document-providers.mjs';
import { ProjectAccess } from '../../apps/studio/main/project-access.mjs';
import { ensureAdoptionFixture, Adoption } from './production-adoption-fixture.mjs';
import { prepareResults, prepareWorkspace, removeWorkspace, checkEvidenceBudget } from './workspace.mjs';

const run = await prepareWorkspace('production-adoption');
const output = await prepareResults('production-adoption');
const fixture = await ensureAdoptionFixture(run), projects = new ProjectDocuments(new ProjectAccess());
const value = result => { assert(result.ok, JSON.stringify(result)); return result.value; };
value(await projects.open(fixture.project));
const configs = ['image', 'music'].map(purpose => ({ id: createId(), revision: 1, name: `Adoption controlled local ${purpose}`,
  protocol: purpose === 'music' ? 'miniMaxMusic' : 'webUI', baseUrl: 'http://127.0.0.1:1/adoption-local-only', auth: 'none',
  credentialId: null, apiKeyHeader: null, model: 'authored-fixture-v1', purposes: purpose === 'music' ? ['music'] : ['image', 'difference'],
  timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null }));
let calls = 0, externalRequests = 0;
const observed = [], checks = [], taskIds = [], history = new Map();
const blockedFetch = globalThis.fetch; globalThis.fetch = async () => { externalRequests++; throw new Error('Adoption ordinary acceptance forbids external requests'); };
const assets = new StudioAssets(projects, resolve('tools/media/runtime/bin'));
const production = new StudioProduction({ userData: fixture.profile, projects, assets,
  connections: { list: async () => structuredClone(configs), read: async id => ({ config: structuredClone(configs.find(config => config.id === id)) }), credential: async () => null },
  resources: { register: () => { throw new Error('No preview URI is required in disk acceptance'); } } });
const localAdapter = {
  inspect: async (config, purpose) => inputCapability(config, { purpose }, null),
  query: async () => { throw new Error('Local output is synchronous'); }, fetch: async () => { throw new Error('Local output is already a file'); },
  cancel: async () => ({ local: 'stopped', remote: 'unsupported' }),
  async *submit(input, context) {
    calls++; observed.push({ input: structuredClone(input), config: structuredClone(context.config), requestId: context.requestId });
    await mkdir(context.directory, { recursive: true });
    const audio = input.purpose === 'music', count = audio ? 1 : input.count, artifacts = [];
    for (let index = 0; index < count; index++) {
      const source = audio ? fixture.media.music : input.purpose === 'difference' ? (index ? fixture.media.tall : fixture.media.padded) : fixture.media.wide;
      const localPath = join(context.directory, `${index}-${basename(source)}`); await copyFile(source, localPath);
      artifacts.push({ kind: audio ? 'audio' : 'image', localPath, mime: audio ? 'audio/wav' : 'image/png', bytes: (await readFile(localPath)).length,
        metadata: audio ? { durationSec: 1 } : source === fixture.media.padded ? { width: 1000, height: 600 }
          : source === fixture.media.tall ? { width: 300, height: 800 } : { width: 960, height: 300 }, role: 'primary', groupId: `local/${index}`, background: null });
    }
    yield { kind: 'output', artifacts, usage: { source: 'controlled-local-provider', externalRequests: 0 } };
  },
};
production.adapter = localAdapter;
const ctx = await production.current();
const session = () => projects.currentSession;
const versions = () => [...session().documents.values()].map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision }));
const script = () => session().readDocument(fixture.sceneDocumentId).files[fixture.scriptPath];
const nodes = () => parse({ documentId: fixture.sceneDocumentId, revision: session().readDocument(fixture.sceneDocumentId).revision, text: script() }).cst;
const node = id => nodes().find(node => node.id === id);
const index = () => JSON.parse([...session().documents.values()].find(document => document.files['assets/index.json']).files['assets/index.json']).data;
const state = () => ({ script: script(), assets: structuredClone(index()) });
const freeze = item => ({ input: item.input, configSnapshot: item.configSnapshot, target: item.target, sourceVersions: item.sourceVersions,
  operationSnapshot: item.operationSnapshot, recipeSnapshot: item.recipeSnapshot, productionSnapshot: item.productionSnapshot, parameterPresetSnapshot: item.parameterPresetSnapshot,
  selectedCandidateId: item.selectedCandidateId, dependencies: item.dependencies });
async function generate(name, usage, statementId = Adoption.sayStatement, characterId = null, count = 1, sceneId = fixture.sceneId) {
  const config = usage === 'bgm' ? configs[1] : configs[0], difference = usage === 'difference';
  const variant = { operation: difference ? 'difference' : usage === 'bgm' ? 'music' : 'image',
    target: { sceneId, statementId: sceneId ? statementId : null, characterId, locale: null, usage, uiScope: null },
    fields: usage === 'bgm' ? { prompt: 'one second authored tone', durationSec: 1, instrumental: true } : {
      positive: 'authored Adoption geometry', negative: '', width: 960, height: 300, count, seed: 12,
      ...(difference ? { instruction: 'two authored states', reference: { assetId: fixture.seedAssetId, variantId: fixture.seedVariantId,
        candidateId: null, artifactIndex: null, localPath: fixture.seedPath, mime: 'image/png' } } : {}) },
    context: [], connectionId: config.id, workflowBindingId: null, model: null, recipe: null, promptPreparation: null,
    backgroundRemoval: null, backgroundPreview: null, sourceVersions: [] };
  const draft = { schemaVersion: 1, id: createId(), projectId: fixture.projectId, revision: 1, activeUse: usage,
    variants: { [usage]: variant }, updatedAt: new Date().toISOString(), submittedTaskId: null };
  value(await production.call('saveDraft', { draft, expectedRevision: null }));
  const plan = value(await production.call('plan', { draftId: draft.id, name }));
  const beforeCalls = calls;
  const task = value(await production.call('submit', plan.planId)); await ctx.service.drain();
  assert.equal(calls, beforeCalls + 1); assert.equal(plan.sendSummary.length, 1);
  assert.deepEqual(observed.at(-1).input, task.items[0].input);
  if (difference) assert.deepEqual(await readFile(task.items[0].input.reference.localPath), await readFile(variant.fields.reference.localPath));
  assert.deepEqual(observed.at(-1).config, plan.task.items[0].configSnapshot);
  assert.equal(plan.task.context.length, 0);
  if (!difference && usage !== 'bgm') assert.deepEqual(observed.at(-1).input.references, []);
  const item = ctx.service.listTasks().find(current => current.id === task.id).items[0];
  assert.equal(item.state, 'review', JSON.stringify(item)); assert.equal(item.attempts.length, 1); assert.equal(item.attempts[0].outcome, 'completed');
  assert.equal(item.candidateIds.length, count);
  const originalPrompt = difference ? variant.fields.instruction : usage === 'bgm' ? variant.fields.prompt : variant.fields.positive;
  const frozenPrompt = item.input.positive ?? item.input.instruction ?? item.input.prompt;
  assert.equal(frozenPrompt.split('\n')[0], originalPrompt);
  const plannedInput = plan.task.items[0].input;
  assert.equal(frozenPrompt, plannedInput.positive ?? plannedInput.instruction ?? plannedInput.prompt);
  if (characterId && !difference && usage !== 'bgm') assert(frozenPrompt.includes(`\"id\":\"${characterId}\"`));
  value(await production.call('select', { taskId: task.id, selections: [{ itemId: item.id, candidateId: item.candidateIds[0] }], target: 'taskOnly', expected: versions() }));
  taskIds.push(task.id); history.set(task.id, structuredClone(freeze(ctx.service.listTasks().find(current => current.id === task.id).items[0])));
  return { taskId: task.id, itemId: item.id, candidateId: item.candidateIds[0], candidateIds: item.candidateIds, draftId: draft.id };
}
async function adopt(generated, choice, label) {
  const before = state(), count = calls;
  const plan = value(await production.call('select', { taskId: generated.taskId, selections: [{ itemId: generated.itemId, candidateId: generated.candidateId }],
    target: 'project', expected: versions(), adoptions: { [generated.candidateId]: choice } }));
  const receipt = value(await production.call('apply', { planId: plan.planId, expected: plan.input.expected }));
  assert.equal(calls, count);
  const after = state(), undo = value(session().planUndo(receipt.documents[0].ref.id, receipt.operationId));
  const undone = session().undo(undo.planId);
  assert(undone.ok, `${label}: ${JSON.stringify({ undone, patches: plan.input.patches })}`);
  assert.deepEqual(state(), before, `${label}: whole adoption is one undo group`);
  value(session().redo(undo.planId)); assert.deepEqual(state(), after, `${label}: redo restores script and asset index`);
  checks.push(`${label}: actual M04 preparation, M02 apply, grouped undo and redo`);
  return { plan, receipt, before, after };
}
try {
  const illustration = await generate('Adoption no-character illustration', 'figure');
  const created = await adopt(illustration, { mode: 'bind', placement: 'new', use: 'illustration' }, 'Create independent illustration');
  const inserted = nodes().filter(item => !created.before.script.includes(`@${item.id};`));
  assert.equal(inserted.length, 1); assert.equal(inserted[0].command, 'changeIllustration'); assert(!('characterId' in inserted[0].object.value));
  assert.equal(script().replace(`${inserted[0].raw}\n`, ''), created.before.script);
  assert.equal(node(Adoption.otherStatement).object.value.objectId, Adoption.other);

  const figure = await generate('Adoption exact same-character replacement', 'figure', Adoption.figureStatement, fixture.characterId);
  const beforeFigure = structuredClone(node(Adoption.figureStatement).object.value), beforeChibi = node(Adoption.chibiStatement).raw;
  await adopt(figure, { mode: 'bind', placement: 'replace' }, 'Replace only the selected same-character figure');
  assert.deepEqual(node(Adoption.figureStatement).object.value, { ...beforeFigure, assetId: node(Adoption.figureStatement).object.value.assetId });
  assert.notEqual(node(Adoption.figureStatement).object.value.assetId, beforeFigure.assetId); assert.equal(node(Adoption.chibiStatement).raw, beforeChibi);

  const difference = await generate('Adoption two named-state candidates', 'difference', Adoption.differenceStatement, null, 2);
  const beforeObjects = [Adoption.illustrationStatement, Adoption.otherStatement, Adoption.figureStatement, Adoption.chibiStatement].map(id => node(id).raw);
  await adopt(difference, { mode: 'bind', placement: 'replace' }, 'Replace the exact difference instruction');
  assert.equal(node(Adoption.differenceStatement).object.value.objectId, Adoption.illustration);
  assert(!('stateName' in node(Adoption.differenceStatement).object.value)); assert(node(Adoption.differenceStatement).object.value.assetId);
  assert.deepEqual([Adoption.illustrationStatement, Adoption.otherStatement, Adoption.figureStatement, Adoption.chibiStatement].map(id => node(id).raw), beforeObjects);
  assert.equal(ctx.service.getCandidate(difference.candidateIds[1]).adoption.length, 0);

  const library = await generate('Adoption no-scene library only', 'cg', null, null, 1, null), beforeLibrary = script();
  await adopt(library, { mode: 'library' }, 'Library only without a scene or character'); assert.equal(script(), beforeLibrary);

  const background = await generate('Adoption background', 'background', Adoption.backgroundStatement);
  const bgBefore = structuredClone(node(Adoption.backgroundStatement).object.value);
  await adopt(background, { mode: 'bind', placement: 'replace' }, 'Background replacement');
  assert.deepEqual(node(Adoption.backgroundStatement).object.value, { ...bgBefore, assetId: node(Adoption.backgroundStatement).object.value.assetId });

  const music = await generate('Adoption BGM', 'bgm');
  await adopt(music, { mode: 'bind', placement: 'new' }, 'BGM new playback instruction'); assert(nodes().some(item => item.command === 'bgm'));

  const conflict = await generate('Adoption adoption conflict', 'figure', Adoption.figureStatement, fixture.characterId);
  const doc = session().readDocument(fixture.sceneDocumentId), text = script();
  const edit = value(session().planEdit({ label: 'Change the other same-character object after generation', origin: 'batch',
    expected: [{ ref: { kind: 'document', id: doc.documentId }, revision: doc.revision }], preparedAssets: [], requiredRefs: [],
    patches: [{ kind: 'text', documentId: doc.documentId, edits: [{ start: 0, end: text.length, before: text,
      after: text.replace('"x":390', '"x":410') }] }] }));
  value(session().applyEdit(edit.planId, edit.input.expected)); const beforeConflict = state(), candidate = ctx.service.getCandidate(conflict.candidateId), attempts = calls;
  const rejected = await production.call('select', { taskId: conflict.taskId, selections: [{ itemId: conflict.itemId, candidateId: conflict.candidateId }],
    target: 'project', expected: versions(), adoptions: { [conflict.candidateId]: { mode: 'bind', placement: 'replace' } } });
  assert.equal(rejected.ok, false); assert.equal(rejected.error.code, 'ADOPTION_CONFLICT'); assert.deepEqual(state(), beforeConflict);
  assert.deepEqual(ctx.service.getCandidate(conflict.candidateId), candidate); assert.equal(calls, attempts);
  checks.push('Changed source rejects adoption; original work, candidate and frozen historical input survive without another request');
  for (const task of ctx.service.listTasks()) assert.deepEqual(freeze(task.items[0]), history.get(task.id));
  const compiled = compile(production.compileInput(session())); assert(compiled.snapshot, JSON.stringify(compiled.issues));
  const savedState = state(), candidates = ctx.service.listTasks().flatMap(task => task.items.flatMap(item => item.candidateIds));
  value(await session().save(value(session().planSave({ kind: 'all' })).planId));
  await production.closeProject(fixture.projectId); value(await session().dispose('saved'));
  value(await projects.open(fixture.project));
  const reopened = await production.current(); assert.deepEqual(state(), savedState); assert.equal(reopened.service.listTasks().length, taskIds.length);
  for (const task of reopened.service.listTasks()) assert.deepEqual(freeze(task.items[0]), history.get(task.id));
  for (const id of candidates) { const candidate = reopened.service.getCandidate(id); assert(candidate); for (const artifact of candidate.artifacts) assert((await readFile(artifact.localPath)).length > 0); }
  const rebuilt = compile(production.compileInput(session())); assert(rebuilt.snapshot, JSON.stringify(rebuilt.issues));
  for (const asset of index().assets) for (const variant of asset.variants) for (const file of variant.files) assert((await readFile(join(fixture.project, 'assets/files', asset.id, variant.id, file.path))).length > 0);
  checks.push('Save and real ProjectDocuments reopen retain adopted script, every indexed media file, all candidates, frozen inputs and one original attempt per task');
  assert.equal(externalRequests, 0); assert.equal(calls, taskIds.length);
  await writeFile(join(output, 'result.json'), JSON.stringify({ result: 'passed', executedAt: new Date().toISOString(), environment: 'Windows / real StudioProduction, M04 importer and M02 disk session / controlled local adapter',
    fixture, calls, externalRequests, tasks: taskIds, candidates, checks, snapshotId: rebuilt.snapshot.snapshotId, observed }, null, 2));

  console.log(JSON.stringify({ result: 'passed', calls, externalRequests, project: fixture.project, checks }));
} catch (error) {
  await writeFile(join(output, 'result.json'), JSON.stringify({ result: 'failed', error: error.stack ?? String(error), calls, externalRequests, checks }, null, 2));
  throw error;
} finally {
  await production.closeProject(fixture.projectId);
  await session()?.dispose('discard');
  globalThis.fetch = blockedFetch;
  await removeWorkspace(run);
  await checkEvidenceBudget();
}
