import { describe, expect, it } from 'vitest';
import { DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import type { ConnectionConfig, VersionRef, WorkflowBinding } from '@galcraft/contracts';
import { FixtureProject, FixtureLock } from '@galcraft/contracts/fixtures';
import { createOfficialTemplate } from '@galcraft/templates';
import type { CompileInput } from '@galcraft/dsl';
import { OfficialRecipes } from '../recipes/official.js';
import { createProductionItem, planProductionDraft, createUIPlanItem, productionSources, type ProductionPlanningPorts } from './planning.js';
import { productionContext } from './context.js';
import { reviewProductionCandidates, type CandidateReviewPorts } from './candidate-review.js';
import { prepareCompositionRecord, type UICompositionInput } from './ui.js';
import type { Candidate, FormVariant, ProductionFormDraft, TaskItem } from './types.js';
import { ProductionOperationCatalog } from './operations.js';

const version: VersionRef = { ref: { kind: 'document', id: 'Page01' }, revision: 3 };
const connection = (purpose: 'text' | 'image' | 'speech'): ConnectionConfig => ({ id: `Conn0${purpose === 'text' ? 1 : purpose === 'image' ? 2 : 3}`,
  revision: 4, name: purpose, protocol: purpose === 'text' ? 'chatCompletions' : purpose === 'image' ? 'webUI' : 'openAISpeech',
  baseUrl: 'http://local.invalid', credentialId: null, auth: 'none', apiKeyHeader: null, model: 'frozen-model', purposes: [purpose],
  timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 2, parameters: {}, workflowBindingId: null, serverFileRoot: null });
const source = (): CompileInput => ({ projectId: FixtureProject.projectId, engineVersion: FixtureProject.engineVersion,
  project: structuredClone(FixtureProject), lock: structuredClone(FixtureLock), template: createOfficialTemplate({ kind: 'light' }),
  documents: [], scenes: [], characters: [], variables: [], assets: [], gallery: [], flows: [], cancelOperationId: 'Cancel' });
function variant(operation: FormVariant['operation'] = 'image'): FormVariant {
  return { operation, target: { sceneId: null, statementId: null, characterId: null, locale: null, usage: 'ui', uiScope: null },
    fields: { positive: 'frame', width: 128, height: 64, count: 1, instruction: 'write' }, context: [], connectionId: 'Conn02',
    workflowBindingId: null, model: null, recipe: null, promptPreparation: null, backgroundRemoval: null, backgroundPreview: null, sourceVersions: [] };
}
const draft = (value = variant()): ProductionFormDraft => ({ schemaVersion: 1, id: 'Draft1', projectId: FixtureProject.projectId,
  revision: 2, activeUse: 'ui', variants: { ui: value }, updatedAt: '2026-10-16T00:00:00Z', submittedTaskId: null });
function ports(): ProductionPlanningPorts {
  const connections = [connection('text'), connection('image'), connection('speech')];
  return { readConnection: async id => { const config = connections.find(config => config.id === id); return config ? { config } : null; },
    listConnections: async () => connections, readWorkflow: async () => null,
    recipes: { getRecipe: async (id, scope) => OfficialRecipes.find(recipe => recipe.id === id && recipe.scope === scope) ?? null,
      listRecipes: async () => [...OfficialRecipes] }, source, sources: () => [], freezeProvider: async () => { throw new Error('unused'); } };
}
function candidate(item: TaskItem, id = 'Candi1'): Candidate {
  return { schemaVersion: 1, id, taskId: 'Task01', itemId: item.id, createdAt: '2026-10-16T00:00:00Z', artifacts: [], partial: false,
    backgroundPreview: null, parentCandidateIds: [], input: null, provenance: { connectionName: 'test', protocol: 'webUI', model: null,
      workflowVersion: null, seed: null, usage: null, serviceRequestId: null }, editedText: null, sourceVersions: [], recipeSnapshot: null,
    uiCompositionId: null, checks: [], adoption: [] };
}

describe('M10 planning independent of the desktop host', () => {
  it('rejects a retained same-name workflow binding after its public schema changes before provider inspection', async () => {
    const planning = ports(), operation = 'org.test.workflow/render' as const, value = variant(operation);
    const base = new ProductionOperationCatalog().resolve('image');
    planning.resolveOperation = async () => ({ ...base, id: operation, provider: { id: 'org.test.workflow', version: '0.1.0' }, definition: { ...base.definition, id: operation, purpose: operation,
      connection: { purpose: 'image', protocols: ['comfyUI'] }, inputSchema: { type: 'object', properties: { positive: { type: 'boolean' } } } } });
    const binding: WorkflowBinding = { id: 'FlowSC', revision: 1, name: 'Retained configuration', purpose: operation, operation, imageUsages: null, graphVersion: '1', editorWorkflowPath: null,
      apiGraph: { '1': { class_type: 'Text', inputs: { text: 'retained string' } }, '2': { class_type: 'SaveImage', inputs: { images: ['1', 0] } } },
      inputs: [{ port: 'positive', nodeId: '1', classType: 'Text', input: 'text', valueType: 'string', required: true, transform: 'identity' }], uploads: [], requiredNodes: [], modelNotes: [],
      outputs: [{ nodeId: '2', key: 'images', kind: 'image', decoder: 'comfyFileList', group: 'main', role: 'primary', background: 'unknown' }] };
    value.workflowBindingId = binding.id; planning.readWorkflow = async () => binding;
    planning.readConnection = async () => ({ config: { ...connection('image'), protocol: 'comfyUI' } });
    let inspections = 0; planning.freezeProvider = async () => { inspections++; throw new Error('Must reject locally'); };
    await expect(createProductionItem(planning, draft(value), value)).rejects.toThrow('incompatible with public operation field positive');
    expect(inspections).toBe(0);
  });
  it('uses formal text and exact reference media by default, allows explicit input overrides and keeps direct generation to one item', async () => {
    const form = draft(), planning = ports(), media = { assetId: 'Asset1', variantId: 'Var001', candidateId: null, artifactIndex: null, localPath: 'formal.png', mime: 'image/png' };
    planning.context = async () => [{ id: 'Part01', kind: 'character', label: '角色设定', included: true, text: '安静、银色短发', source: version, media: null, attachment: null, authorEdited: false },
      { id: 'Part02', kind: 'media', label: '正式人设图', included: true, text: null, source: version, media, attachment: null, authorEdited: false }];
    planning.sources = (_variant) => _variant.context.flatMap(part => part.included && part.source ? [part.source] : []);
    const plan = await planProductionDraft(planning, form, '直接制作');
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]!.input).toMatchObject({ purpose: 'image', positive: 'frame\n\n[角色设定]\n安静、银色短发', references: [media] });
    expect(plan.expected).toEqual([version]);
    form.variants.ui!.context = (await planning.context(form.variants.ui!.target)).map(part => ({ ...part, included: false }));
    form.variants.ui!.fields.references = [];
    expect((await planProductionDraft(planning, form, '本次覆盖')).items[0]!.input).toMatchObject({ positive: 'frame', references: [] });
  });
  it('validates explicit workflow identities and image uses before provider inspection, then freezes the actual guidance revision', async () => {
    const binding: WorkflowBinding = { id: 'FlowS4', revision: 7, name: 'Character art', purpose: 'image', imageUsages: ['figure'], graphVersion: '2', editorWorkflowPath: null,
      apiGraph: { '1': { class_type: 'SaveImage', inputs: {} } }, inputs: [], uploads: [], requiredNodes: [], modelNotes: [],
      outputs: [{ nodeId: '1', key: 'images', kind: 'image', decoder: 'comfyFileList', group: 'main', role: 'primary', background: 'unknown' }],
      usageGuidance: { description: 'Original guidance', scenarios: [], inputs: [], promptTips: [], limitations: [], examples: [] } };
    const value = variant(); value.workflowBindingId = binding.id;
    const planning = ports(), config = { ...connection('image'), protocol: 'comfyUI' as const };
    planning.readConnection = async () => ({ config });
    planning.readWorkflow = async () => binding;
    await expect(createProductionItem(planning, draft(value), value)).rejects.toThrow('workflow purpose or image use');
    binding.imageUsages = [];
    await expect(createProductionItem(planning, draft(value), value)).rejects.toThrow('workflow purpose or image use');
    planning.readWorkflow = async () => null;
    await expect(createProductionItem(planning, draft(value), value)).rejects.toThrow('selected workflow is missing');
    binding.imageUsages = ['figure', 'ui'];
    const embedded = new ProductionOperationCatalog().resolve('image');
    embedded.definition = { ...embedded.definition, workflow: structuredClone(binding) as unknown as import('@galcraft/contracts').Json };
    planning.resolveOperation = async () => embedded;
    value.workflowBindingId = 'MissS4';
    await expect(createProductionItem(planning, draft(value), value)).rejects.toThrow('selected workflow is missing');
    value.workflowBindingId = binding.id;
    const templateItem = await createProductionItem(planning, draft(value), value);
    expect(templateItem.workflowSnapshot).toMatchObject({ id: binding.id, revision: 7 });
    planning.readWorkflow = async () => binding;
    const item = await createProductionItem(planning, draft(value), value);
    binding.revision = 8; binding.usageGuidance!.description = 'Later guidance';
    expect(item.workflowSnapshot).toMatchObject({ revision: 7, graphVersion: '2', imageUsages: ['figure', 'ui'], usageGuidance: { description: 'Original guidance' } });
    expect(item.configSnapshot).toMatchObject({ revision: 4 });
  });
  it('requires explicit confirmation before excluding retained inputs after a mode switch', async () => {
    const value = variant(); value.fields.excludedOperationInputs = ['保留的声音描述'];
    await expect(createProductionItem(ports(), draft(value), value)).rejects.toThrow('Confirm the retained inputs');
    value.fields.confirmOperationExclusions = true;
    expect((await createProductionItem(ports(), draft(value), value)).input).toMatchObject({ purpose: 'image' });
  });
  it('keeps image inputs and connection identity frozen with no extra request item', async () => {
    const form = draft(), planned = await planProductionDraft(ports(), form, 'frame');
    expect(planned.items).toHaveLength(1);
    expect(planned.items[0]).toMatchObject({ purpose: 'image', configSnapshot: { id: 'Conn02', revision: 4, concurrency: 2 },
      input: { purpose: 'image', usage: 'ui', positive: 'frame', width: 128, height: 64, count: 1 }, dependencies: [], sourceVersions: [] });
    form.variants.ui!.fields.positive = 'later edit';
    expect(planned.items[0]!.input).toMatchObject({ positive: 'frame' });
    expect(planned).toMatchObject({ sourceDraftId: 'Draft1', sourceDraftRevision: 2, context: [], expected: [] });
  });
  it('preserves the text-preparation to media DAG and prompt selection', async () => {
    const form = draft(), prompt = OfficialRecipes.find(recipe => recipe.purposes.includes('imagePrompt') && recipe.uses.includes('ui'))!;
    form.variants.ui!.promptPreparation = { recipeId: prompt.id, scope: prompt.scope, purpose: 'imagePrompt', usage: 'ui', parameterValues: {} };
    form.variants.ui!.fields.promptConnectionId = 'Conn01';
    const planned = await planProductionDraft(ports(), form, 'prepared');
    expect(planned.items.map(item => item.purpose)).toEqual(['text', 'image']);
    expect(planned.items[1]!.dependencies).toEqual([{ itemId: planned.items[0]!.id, output: 'prompt', selectedCandidateId: null }]);
    expect(planned.items[0]!.recipeSnapshot?.recipe.id).toBe(prompt.id);
  });
  it('rejects missing connections and undeclared UI candidate references before executing', async () => {
    await expect(createProductionItem(ports(), draft(), { ...variant(), connectionId: null })).rejects.toThrow('Select a production connection');
    await expect(createUIPlanItem(ports(), { draft: draft(), selectedAssets: [], proposal: { summary: '', steps: [] },
      step: { key: 'raster', kind: 'raster', description: '', dependsOn: [], recipe: null, instruction: 'frame',
        fields: { references: [{ kind: 'candidate', key: 'upstream' }] }, reuseAssets: [], assetKeys: ['frame'] },
      reference: async () => { throw new Error('must not load'); } })).rejects.toThrow('Reference candidates must come from declared upstream steps');
  });
  it('retains explicitly frozen source versions and diagnoses a removed target', () => {
    const form = variant(); form.context = [{ id: 'Part01', kind: 'ui', label: 'page', included: true, text: '', source: version,
      media: null, attachment: null, authorEdited: true }];
    expect(productionSources([{ documentId: 'Page01', revision: 9, files: {} }], form, source())).toEqual([version]);
    form.target.sceneId = 'Scene1';
    expect(() => productionSources([], form, source())).toThrow('source was removed');
  });
  it('assembles project context without a project session or Electron', () => {
    const current = source(), documents = [{ documentId: 'Projec', revision: 7,
      files: { 'project.json': JSON.stringify({ data: current.project }) } }];
    const context = productionContext(documents, current, { usage: 'ui' });
    expect(context[0]).toMatchObject({ kind: 'setting', included: true, source: { ref: { id: 'Projec' }, revision: 7 } });
    expect(context.at(-1)).toMatchObject({ kind: 'instruction', label: '页面公开字段 / Public UI fields' });
  });
  it('combines M04 media preparations into one adoption plan and blocks discussion adoption', async () => {
    const item = await createProductionItem(ports(), draft(), variant()), result = candidate(item);
    result.artifacts = [{ kind: 'image', localPath: 'frame.svg', mime: 'image/svg+xml', bytes: 1, metadata: { suggestedUse: 'frame' },
      groupId: 'image/0', role: 'primary', background: null }];
    let preparations = 0;
    const context: CandidateReviewPorts = { projectId: FixtureProject.projectId, choices: {}, findItem: () => item,
      scriptSource: source, bindingSource: source, documents: () => [], assetNames: () => [], prepareMedia: async request => {
        preparations++; expect(request.fileTags).toEqual([['ui:frame']]);
        return { assetIds: ['Asset1'], edit: { indexPatches: [], expected: [version], preparedAssets: ['Asset1'], requiredRefs: [] } };
      } };
    expect(await reviewProductionCandidates([result], [], context)).toMatchObject({ ok: true, value: { preparedAssets: ['Asset1'], expected: [version], patches: [] } });
    item.creationMode = 'discuss';
    await expect(reviewProductionCandidates([result], [], context)).rejects.toThrow('Discussion output');
    expect(preparations).toBe(1);
  });
  it('rejects invalid adoption filenames before preparing media or changing candidate ownership', async () => {
    const item = await createProductionItem(ports(), draft(), variant()), result = candidate(item);
    let preparations = 0;
    const before = structuredClone(result);
    const reviewed = await reviewProductionCandidates([result], [], { projectId: FixtureProject.projectId, choices: { [result.id]: { mode: 'library', name: 'characters/A.png' } },
      findItem: () => item, scriptSource: source, bindingSource: source, documents: () => [], assetNames: () => [], prepareMedia: async () => { preparations++; throw new Error('must not prepare'); } });
    expect(reviewed).toMatchObject({ ok: false, error: { code: 'ADOPTION_NAME_INVALID', owner: 'M10' } });
    if (!reviewed.ok) expect(reviewed.error.message).toContain(`adoptions.${result.id}.name`);
    expect(preparations).toBe(0); expect(result).toEqual(before);
  });
  it('plans UI composition from the reviewed item baseline and rejects stale or out-of-scope changes', async () => {
    const item = await createProductionItem(ports(), draft(), variant());
    item.target.uiScope = { pageIds: ['Page01'], componentIds: [] }; item.sourceVersions = [version];
    const result = candidate(item); result.sourceVersions = [{ ...version, revision: 1 }];
    const input: UICompositionInput = { candidateId: result.id, resources: [], proposal: { summary: 'frame', styles: [], assets: [],
      config: [{ key: 'width', pageId: 'Page01', componentId: null, path: 'layout.width', operation: 'set', value: 800, dependsOn: [] }] } };
    const context = { candidate: result, item, revision: () => 3, plans: async () => [], previous: async () => null };
    const planned = await prepareCompositionRecord(input, context);
    expect(planned.composition.baseVersions).toEqual([version]);
    expect(planned.scopePlan?.baseVersions).toEqual([version]);
    await expect(prepareCompositionRecord(input, { ...context, revision: () => 4 })).rejects.toMatchObject({ issue: { code: 'UI_SOURCE_CHANGED', owner: 'M10' } });
    input.proposal.config[0]!.pageId = 'Other1';
    await expect(prepareCompositionRecord(input, context)).rejects.toMatchObject({ issue: { code: 'UI_COMPOSITION_SCOPE', owner: 'M10' } });
  });
  it('adopts no-character art as a new illustration and replaces only the selected object instruction', async () => {
    const form = variant(); form.target = { ...form.target, usage: 'figure', sceneId: 'Scene1', statementId: 'Shown1' };
    const item = await createProductionItem(ports(), draft(form), form), result = candidate(item);
    result.artifacts = [{ kind: 'image', localPath: 'picture.png', mime: 'image/png', bytes: 1, metadata: {}, groupId: 'image/0', role: 'primary', background: null }];
    const text = 'changeIllustration {objectId:"Obj001",assetId:"Old001",effects:{x:123},illustrationFrame:{widthRatio:0.7}} @Shown1;\nchangeIllustration {objectId:"Obj002",assetId:"Old002"} @Shown2;\nchangeIllustrationDiff {objectId:"Obj001",stateName:"happy"} @Diff01;\nchangeBg {assetId:"Old001",fit:"contain",positionX:0.3,positionY:0.8} @Back01;';
    const baseline = { ...source(), documents: [{ documentId: 'SceneD', sceneId: 'Scene1', revision: 3, kind: 'scene', text }] };
    const context: CandidateReviewPorts = { projectId: FixtureProject.projectId,
      choices: { [result.id]: { mode: 'bind', placement: 'new', use: 'illustration' } }, findItem: () => item,
      scriptSource: () => baseline, bindingSource: () => baseline, documents: () => [], assetNames: () => [],
      prepareMedia: async () => ({ assetIds: ['Art001'], edit: { indexPatches: [], expected: [], preparedAssets: ['Art001'], requiredRefs: [] } }) };
    const frozen = structuredClone(item);
    const created = await reviewProductionCandidates([result], [], context);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const insertion = created.value.patches.find(patch => patch.kind === 'text');
    expect(insertion?.kind === 'text' && insertion.edits[0]!.after).toContain('changeIllustration');
    expect(insertion?.kind === 'text' && insertion.edits[0]!.after).not.toContain('characterId');
    context.choices[result.id] = { mode: 'bind', placement: 'replace' };
    const replacement = await reviewProductionCandidates([result], [], context);
    expect(replacement.ok).toBe(true);
    if (replacement.ok) {
      const patch = replacement.value.patches.find(patch => patch.kind === 'text');
      expect(patch?.kind === 'text' && patch.edits).toHaveLength(1);
      expect(patch?.kind === 'text' && patch.edits[0]).toMatchObject({ before: '"Old001"', after: '"Art001"' });
    }
    expect(item).toEqual(frozen);
    item.target.statementId = 'Shown2';
    expect((await reviewProductionCandidates([result], [], context)).ok).toBe(true);
    item.target.statementId = 'Diff01';
    const difference = await reviewProductionCandidates([result], [], context);
    expect(difference.ok && difference.value.patches.find(patch => patch.kind === 'text')).toMatchObject({
      edits: [{ before: ',stateName:"happy"', after: ', assetId: "Art001"' }],
    });
    item.target.statementId = 'Back01'; item.target.usage = 'background';
    const background = await reviewProductionCandidates([result], [], context);
    expect(background.ok && background.value.patches.find(patch => patch.kind === 'text')).toMatchObject({
      edits: [{ before: '"Old001"', after: '"Art001"' }],
    });
    context.choices[result.id] = { mode: 'library' };
    expect(await reviewProductionCandidates([result], [], context)).toMatchObject({ ok: true, value: { patches: [] } });
  });
});
