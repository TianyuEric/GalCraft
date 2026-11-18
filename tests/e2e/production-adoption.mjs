import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { createId, DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import { readTemplateDocuments } from '@galcraft/templates';
import { compile, parse } from '../../packages/dsl/dist/index.js';
import { inputCapability } from '../../packages/authoring/dist/production/index.js';
import { StudioProduction } from '../../apps/studio/main/production-providers.mts';
import { StudioAssets } from '../../apps/studio/main/asset-providers.mjs';
import { ProjectDocuments } from '../../apps/studio/main/document-providers.mjs';
import { ProjectAccess } from '../../apps/studio/main/project-access.mjs';
import { ResourceRegistry } from '../../tools/media/src/resources.mjs';
import { ensureAdoptionFixture, Adoption } from './production-adoption-fixture.mjs';
import { prepareResults, prepareWorkspace, removeWorkspace, checkEvidenceBudget } from './workspace.mjs';

const run = await prepareWorkspace('production-adoption');
const output = await prepareResults('production-adoption');
const fixture = await ensureAdoptionFixture(run), projects = new ProjectDocuments(new ProjectAccess());
const value = result => { assert(result.ok, JSON.stringify(result)); return result.value; };
value(await projects.open(fixture.project));
const protocols = { image: 'webUI', music: 'miniMaxMusic', speech: 'openAISpeech', text: 'chatCompletions' };
const configs = Object.entries(protocols).map(([purpose, protocol]) => ({ id: createId(), revision: 1, name: `Adoption controlled local ${purpose}`,
  protocol, baseUrl: 'http://127.0.0.1:1/adoption-local-only', auth: 'none',
  credentialId: null, apiKeyHeader: null, model: 'authored-fixture-v1', purposes: purpose === 'image' ? ['image', 'difference'] : [purpose],
  timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null }));
let calls = 0, externalRequests = 0;
const observed = [], checks = [], taskIds = [], history = new Map();
const blockedFetch = globalThis.fetch; globalThis.fetch = async () => { externalRequests++; throw new Error('Adoption ordinary acceptance forbids external requests'); };
const assets = new StudioAssets(projects, resolve('tools/media/runtime/bin'));
const resources = new ResourceRegistry();
const production = new StudioProduction({ userData: fixture.profile, projects, assets,
  connections: { list: async () => structuredClone(configs), read: async id => ({ config: structuredClone(configs.find(config => config.id === id)) }), credential: async () => null },
  resources });
const localAdapter = {
  inspect: async (config, purpose) => inputCapability(config, { purpose }, null),
  query: async () => { throw new Error('Local output is synchronous'); }, fetch: async () => { throw new Error('Local output is already a file'); },
  cancel: async () => ({ local: 'stopped', remote: 'unsupported' }),
  async *submit(input, context) {
    calls++; observed.push({ input: structuredClone(input), config: structuredClone(context.config), requestId: context.requestId });
    await mkdir(context.directory, { recursive: true });
    if (input.purpose === 'text') {
      yield { kind: 'textDelta', text: textOutput };
      yield { kind: 'output', artifacts: [], usage: { source: 'controlled-local-provider', externalRequests: 0 } };
      return;
    }
    const audio = ['music', 'speech'].includes(input.purpose), count = audio ? 1 : input.count, artifacts = [];
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
let textOutput = '';
const target = (usage, values = {}) => ({ sceneId: fixture.sceneId, statementId: null, characterId: null, locale: null, usage, uiScope: null, ...values });
const form = (operation, target, fields, config, extras = {}) => ({ operation, target, fields,
  context: [], connectionId: config.id, workflowBindingId: null, model: null, recipe: null, promptPreparation: null,
  backgroundRemoval: null, backgroundPreview: null, sourceVersions: [], ...extras });
const draftFor = (variant, origin) => ({ schemaVersion: 1, id: createId(), projectId: fixture.projectId, revision: 1, activeUse: variant.target.usage,
  variants: { [variant.target.usage]: variant }, updatedAt: new Date().toISOString(), submittedTaskId: null, origin });
const freeze = item => ({ input: item.input, configSnapshot: item.configSnapshot, target: item.target, sourceVersions: item.sourceVersions,
  operationSnapshot: item.operationSnapshot, recipeSnapshot: item.recipeSnapshot, productionSnapshot: item.productionSnapshot, parameterPresetSnapshot: item.parameterPresetSnapshot,
  selectedCandidateId: item.selectedCandidateId, dependencies: item.dependencies });
async function executeDraft(draft, name, destination) {
  const saved = value(await production.call('saveDraft', { draft, expectedRevision: null }));
  if (destination) {
    saved.variants[saved.activeUse].target = destination;
    const updated = value(await production.call('saveDraft', { draft: saved, expectedRevision: saved.revision }));
    assert.deepEqual(updated.origin, draft.origin);
    assert.deepEqual(updated.variants[saved.activeUse].context, draft.variants[saved.activeUse].context);
  }
  const plan = value(await production.call('plan', { draftId: draft.id, name }));
  const beforeCalls = calls;
  const task = value(await production.call('submit', plan.planId));
  await ctx.service.drain();
  const [item] = ctx.service.listTasks().find(current => current.id === task.id).items;
  assert.equal(calls, beforeCalls + 1);
  assert.equal(plan.sendSummary.length, 1);
  assert.deepEqual(observed.at(-1).input, item.input);
  assert.deepEqual(observed.at(-1).config, plan.task.items[0].configSnapshot);
  assert.equal(item.state, 'review', JSON.stringify(item));
  assert.equal(item.attempts.length, 1);
  assert.equal(item.attempts[0].outcome, 'completed');
  assert(item.candidateIds.length > 0);
  value(await production.call('select', { taskId: task.id, selections: [{ itemId: item.id, candidateId: item.candidateIds[0] }], target: 'taskOnly', expected: versions() }));
  taskIds.push(task.id);
  history.set(task.id, structuredClone(freeze(ctx.service.listTasks().find(current => current.id === task.id).items[0])));
  return { taskId: task.id, itemId: item.id, candidateId: item.candidateIds[0], item, plan };
}
async function generate(name, usage, statementId = Adoption.sayStatement, characterId = null, count = 1, sceneId = fixture.sceneId) {
  const config = usage === 'bgm' ? configs[1] : configs[0], difference = usage === 'difference';
  const variant = form(difference ? 'difference' : usage === 'bgm' ? 'music' : 'image',
    target(usage, { sceneId, statementId: sceneId ? statementId : null, characterId }),
    usage === 'bgm' ? { prompt: 'one second authored tone', durationSec: 1, instrumental: true } : {
      positive: 'authored Adoption geometry', negative: '', width: 960, height: 300, count, seed: 12,
      ...(difference ? { instruction: 'two authored states', reference: { assetId: fixture.seedAssetId, variantId: fixture.seedVariantId,
        candidateId: null, artifactIndex: null, localPath: fixture.seedPath, mime: 'image/png' } } : {}) }, config);
  const draft = draftFor(variant);
  const result = await executeDraft(draft, name);
  const { plan, item } = result;
  if (difference) assert.deepEqual(await readFile(item.input.reference.localPath), await readFile(variant.fields.reference.localPath));
  assert.equal(plan.task.context.length, 0);
  if (!difference && usage !== 'bgm') assert.deepEqual(observed.at(-1).input.references, []);
  assert.equal(item.candidateIds.length, count);
  const originalPrompt = difference ? variant.fields.instruction : usage === 'bgm' ? variant.fields.prompt : variant.fields.positive;
  const frozenPrompt = item.input.positive ?? item.input.instruction ?? item.input.prompt;
  assert.equal(frozenPrompt.split('\n')[0], originalPrompt);
  const plannedInput = plan.task.items[0].input;
  assert.equal(frozenPrompt, plannedInput.positive ?? plannedInput.instruction ?? plannedInput.prompt);
  if (characterId && !difference && usage !== 'bgm') assert(frozenPrompt.includes(`\"id\":\"${characterId}\"`));
  return { ...result, candidateIds: item.candidateIds };
}
async function adopt(generated, choice, label) {
  const before = state(), count = calls;
  const plan = value(await production.call('select', { taskId: generated.taskId, selections: [{ itemId: generated.itemId, candidateId: generated.candidateId }],
    target: 'project', expected: versions(), adoptions: { [generated.candidateId]: choice } }));
  const receipt = value(await production.call('apply', { planId: plan.planId, expected: plan.input.expected }));
  assert.equal(calls, count);
  assert.equal(ctx.service.adoptionState(generated.candidateId), 'adopted');
  const after = state(), undo = value(session().planUndo(receipt.documents[0].ref.id, receipt.operationId));
  const undone = session().undo(undo.planId);
  assert(undone.ok, `${label}: ${JSON.stringify({ undone, patches: plan.input.patches })}`);
  assert.deepEqual(state(), before, `${label}: whole adoption is one undo group`);
  assert.equal(ctx.service.adoptionState(generated.candidateId), 'unadopted');
  value(session().redo(undo.planId)); assert.deepEqual(state(), after, `${label}: redo restores script and asset index`);
  assert.equal(ctx.service.adoptionState(generated.candidateId), 'adopted');
  checks.push(`${label}: M02 apply, grouped undo and redo`);
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

  const sourceOrigin = { page: 'scenario', sceneId: fixture.sceneId, statementId: Adoption.figureStatement, pageIds: [], componentIds: [] };
  const sourceReference = { assetId: fixture.seedAssetId, variantId: fixture.seedVariantId, candidateId: null, artifactIndex: null,
    localPath: fixture.seedPath, mime: 'image/png' };
  const contextB = { id: createId(), kind: 'setting', label: 'outline B', text: 'Explicit B send material', included: true,
    source: null, media: null, attachment: null, authorEdited: true };
  const retargeted = form('difference', target('difference', { statementId: sourceOrigin.statementId }),
    { instruction: 'Frozen material B', reference: sourceReference, width: 960, height: 300, count: 1 }, configs[0], { context: [contextB] });
  const material = await executeDraft(draftFor(retargeted, sourceOrigin), 'Distinct origin, material and destination',
    target('difference', { statementId: Adoption.differenceStatement }));
  assert.equal(material.item.target.statementId, Adoption.differenceStatement);
  assert.deepEqual(await readFile(material.item.input.reference.localPath), await readFile(fixture.seedPath));
  assert.equal(material.item.input.reference.variantId, fixture.seedVariantId);
  assert.equal(material.item.input.instruction, 'Frozen material B\n\n[outline B]\nExplicit B send material');
  assert(!JSON.stringify(material.item.input).includes(sourceOrigin.statementId));
  assert(!JSON.stringify(material.item.input).includes(material.item.target.statementId));
  const originBefore = node(sourceOrigin.statementId).raw;
  await adopt(material, { mode: 'bind', placement: 'replace' }, 'Open from figure A, freeze asset version B and bind difference C');
  assert.equal(node(sourceOrigin.statementId).raw, originBefore);

  const scriptVariant = form('script', target('script', { statementId: Adoption.sayStatement,
    replaceStatementIds: [Adoption.sayStatement, Adoption.nextSayStatement] }), { instruction: 'Replace exactly two consecutive authored lines.' }, configs[3]);
  const beforeSpeech = nodes().filter(line => !scriptVariant.target.replaceStatementIds.includes(line.id)).map(line => line.raw);
  const replacement = ['来晚了。', '灯还亮着。'];
  textOutput = scriptVariant.target.replaceStatementIds.map((id, line) => `say ${JSON.stringify({ speaker: { kind: 'narrator' }, text: replacement[line] })} @${id};`).join('\n');
  const writing = await executeDraft(draftFor(scriptVariant), 'Consecutive scene statements');
  const preview = value(await production.call('previewScript', writing.candidateId));
  assert.equal(preview.project.entry.sceneId, fixture.sceneId);
  await adopt(writing, { mode: 'bind' }, 'Adopt the compiled consecutive-statement range');
  assert.deepEqual(scriptVariant.target.replaceStatementIds.map(id => node(id).object.value.text), replacement);
  assert.deepEqual(nodes().filter(line => !scriptVariant.target.replaceStatementIds.includes(line.id)).map(line => line.raw), beforeSpeech);

  const otherLine = node(Adoption.nextSayStatement).raw;
  const voices = [];
  for (const [locale, spokenText] of [['zh-CN', '来晚了。'], ['ja', '遅くなった。']]) {
    const voice = form('speech', target('voice'), { language: locale, voiceId: 'alloy', speechLines: [
      { id: createId(), sceneId: fixture.sceneId, statementId: Adoption.sayStatement, characterId: null, original: replacement[0],
        text: spokenText, language: locale, voiceId: null, selected: true },
      { id: createId(), sceneId: fixture.sceneId, statementId: Adoption.nextSayStatement, characterId: null, original: replacement[1],
        text: 'unselected line', language: locale, voiceId: null, selected: false },
    ] }, configs[2]);
    const speech = await executeDraft(draftFor(voice), `Selected voice ${locale}`);
    assert.equal(speech.item.target.statementId, Adoption.sayStatement);
    assert.equal(speech.item.input.text, spokenText);
    assert.equal(speech.item.input.language, locale);
    await adopt(speech, { mode: 'bind' }, `Bind one dialogue ID and locale ${locale}`);
    voices.push([locale, node(Adoption.sayStatement).object.value.voiceByLocale[locale]]);
    assert.deepEqual(node(Adoption.sayStatement).object.value.voiceByLocale, Object.fromEntries(voices));
    assert.equal(node(Adoption.sayStatement).object.value.text, replacement[0]);
    assert.equal(node(Adoption.nextSayStatement).raw, otherLine);
  }

  const template = () => readTemplateDocuments([...session().documents.values()]);
  const title = template().pages.find(page => page.key === 'title');
  const scopedUI = form('uiPatch', target('ui', { sceneId: null, uiScope: { pageIds: [title.id], componentIds: [] } }),
    { instruction: 'Review a layout and stylesheet for this page only.' }, configs[3]);
  const pageOrigin = { page: 'pages', sceneId: null, statementId: null, pageIds: [title.id], componentIds: [] };
  const raster = form('image', scopedUI.target, { positive: 'R4 title background', width: 960, height: 300, count: 1 }, configs[0]);
  const pageImage = await executeDraft(draftFor(raster, pageOrigin), 'Page raster candidate');
  const beforeTitle = structuredClone(title);
  const beforeStyles = structuredClone(template().styles);
  const beforePageAssets = structuredClone(index());
  const layout = { key: 'layout', pageId: title.id, componentId: title.root.id, path: 'layout.gap', operation: 'set', value: 37, dependsOn: [] };
  const style = { key: 'style', name: 'Adoption title background', styleId: null, scope: { pageId: title.id, componentId: null }, language: 'css',
    source: '[data-gc-part="title.background"] { background-image: url("candidate-asset:image"); }', dependsOn: ['image'] };
  const pageProposal = { summary: 'Controlled page layout, style and image', config: [layout], styles: [style],
    assets: [{ key: 'image', source: { kind: 'candidate', key: 'image' }, use: 'background' }] };
  textOutput = JSON.stringify(pageProposal);
  const pageCandidate = await executeDraft(draftFor(scopedUI, pageOrigin), 'Existing page proposal');
  const composition = value(await production.call('saveComposition', { candidateId: pageCandidate.candidateId, proposal: pageProposal,
    resources: [{ key: 'image', taskId: pageImage.taskId, candidateId: pageImage.candidateId, artifactIndex: 0 }] }));
  const compositionPreview = value(await production.call('previewComposition', { id: composition.id, revision: composition.revision, keys: ['layout', 'style', 'image'] }));
  assert.deepEqual(compositionPreview.unresolvedStyleMatches, []);
  assert.equal(compositionPreview.template.pages.find(page => page.id === title.id).root.layout.gap, layout.value);
  assert(compositionPreview.styles[compositionPreview.template.styles.find(item => item.name === style.name).sourcePath].includes(`asset:${pageImage.candidateId}`));
  const previewImage = await resources.response(new Request(compositionPreview.locations[0].uri));
  assert.equal(previewImage.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await previewImage.arrayBuffer()), await readFile(fixture.media.wide));
  assert.deepEqual(template().pages.find(page => page.id === title.id), beforeTitle);
  const pagePlan = value(await production.call('prepareUIAdoption', { compositionId: composition.id, expectedCompositionRevision: composition.revision,
    changeKeys: ['layout', 'style'], assetKeys: ['image'], assetAdoptions: [{ key: 'image', source: null, destination: 'newAsset',
      replace: { mode: 'none', refs: [] } }], substitutions: [], expected: versions(), previewId: compositionPreview.previewId }));
  const pageReceipt = value(await production.call('apply', { planId: pagePlan.planId, expected: pagePlan.input.expected }));
  assert.equal(ctx.service.adoptionState(pageImage.candidateId), 'adopted');
  const adoptedTemplate = structuredClone(template());
  assert.equal(adoptedTemplate.pages.find(page => page.id === title.id).root.layout.gap, layout.value);
  const adoptedStyle = adoptedTemplate.styles.find(item => item.name === style.name);
  const adoptedImage = index().assets.find(asset => asset.source.taskId === pageImage.taskId);
  assert(adoptedImage);
  assert.equal(adoptedImage.source.candidateId, pageImage.candidateId);
  assert(pageReceipt.assetIds.includes(adoptedImage.id));
  assert(ctx.service.getCandidate(pageImage.candidateId).adoption.some(fact => fact.groupId === pageReceipt.groupId));
  assert.deepEqual(adoptedStyle.assets, [adoptedImage.id]);
  assert(session().readDocument(adoptedTemplate.instanceId).files[adoptedStyle.sourcePath].includes(`asset:${adoptedImage.id}`));
  const pageUndo = value(session().planUndo(pageReceipt.documents[0].ref.id, pageReceipt.operationId));
  value(session().undo(pageUndo.planId));
  assert.deepEqual(template().pages.find(page => page.id === title.id), beforeTitle);
  assert.deepEqual(template().styles, beforeStyles);
  assert.deepEqual(index(), beforePageAssets);
  value(session().redo(pageUndo.planId));
  assert.deepEqual(template(), adoptedTemplate);
  assert(index().assets.some(asset => asset.id === adoptedImage.id));
  checks.push('Scoped page candidates preview layout, stylesheet and raster, then adopt, undo and redo the combined M04/M08/M02 transaction');

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
  assert.deepEqual(template(), adoptedTemplate);
  assert.equal(index().assets.find(asset => asset.id === adoptedImage.id).source.candidateId, pageImage.candidateId);
  assert.equal(reopened.service.adoptionState(pageImage.candidateId), 'saved');
  for (const task of reopened.service.listTasks()) assert.deepEqual(freeze(task.items[0]), history.get(task.id));
  for (const id of candidates) { const candidate = reopened.service.getCandidate(id); assert(candidate); for (const artifact of candidate.artifacts) assert((await readFile(artifact.localPath)).length > 0); }
  const rebuilt = compile(production.compileInput(session())); assert(rebuilt.snapshot, JSON.stringify(rebuilt.issues));
  for (const asset of index().assets) for (const variant of asset.variants) for (const file of variant.files) assert((await readFile(join(fixture.project, 'assets/files', asset.id, variant.id, file.path))).length > 0);
  checks.push('Save and real ProjectDocuments reopen retain adopted script, every indexed media file, all candidates, frozen inputs and one original attempt per task');
  assert.equal(externalRequests, 0); assert.equal(calls, taskIds.length);
  await writeFile(join(output, 'result.json'), JSON.stringify({ result: 'passed', executedAt: new Date().toISOString(), environment: 'Windows / real StudioProduction, M04 importer and M02 disk session / controlled local adapter',
    fixture, calls, externalRequests, tasks: taskIds, candidates, checks, snapshotId: rebuilt.snapshot.snapshotId, observed,
    retargeting: { sourceOrigin, material: { assetId: fixture.seedAssetId, variantId: fixture.seedVariantId }, destination: material.item.target },
    scriptRange: scriptVariant.target.replaceStatementIds, voices: Object.fromEntries(voices),
    pageAdoption: { pageId: title.id, componentId: title.root.id, groupId: pageReceipt.groupId, taskId: pageImage.taskId,
      candidateId: pageImage.candidateId, assetId: adoptedImage.id, variantId: adoptedImage.activeVariantId },
  }, null, 2));

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
