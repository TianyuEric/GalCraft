import { createId } from '@galcraft/contracts';
import type { ConnectionConfig, DocumentView, Purpose, VersionRef } from '@galcraft/contracts';
import { parse, type CompileInput } from '@galcraft/dsl';
import type { RecipeLibrary } from '../recipes/library.js';
import type { FormVariant, GenerationInput, GenerationProviderSnapshot, MediaInput, ProductionFormDraft, TaskItem, TaskPlanInput, WorkflowBinding } from './types.js';
import { variantOperation, operationPurpose, speechLines, resolveProductionParameters } from './draft.js';
import { baseTextInput, discussionSystem, prepareRecipe, speechPreparationInstruction } from './recipe-preparer.js';
import { compactContextParts } from './context-identities.js';
import { inputCapability, confirmInput } from './capabilities.js';
import type { UIPlanProposal, UIPlanStep } from './ui.js';
import { ProductionOperationCatalog, operationSupportsConnection } from './operations.js';
import { resolveVoiceVariant } from './voice-input.js';
import { validateWorkflow } from './validation.js';
import { workflowSupportsPurpose, workflowOperationDiagnostics } from '@galcraft/generation-services/validation';

const value = <T>(result: import('@galcraft/contracts').Result<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };

export async function createUIPlanItem(ports: ProductionPlanningPorts, input: {
  draft: ProductionFormDraft; step: UIPlanStep; proposal: UIPlanProposal; selectedAssets: string[];
  reference(assetId: string, variantId?: string): Promise<MediaInput>;
}): Promise<TaskItem> {
  const { draft, step } = input, variant = draft.variants.ui;
  if (!variant) throw new Error('The page production draft is missing');
  const references: MediaInput[] = [], selectedReferences = step.fields.references ?? [];
  if (!Array.isArray(selectedReferences)) throw new Error('Choose an exact project asset version for reference media');
  for (const ref of selectedReferences) {
    if (ref && typeof ref === 'object' && !Array.isArray(ref) && ref.kind === 'existing' && typeof ref.assetId === 'string' &&
      step.reuseAssets.includes(ref.assetId) && input.selectedAssets.includes(ref.assetId)) {
      references.push(await input.reference(ref.assetId, typeof ref.variantId === 'string' ? ref.variantId : undefined));
    } else if (ref && typeof ref === 'object' && !Array.isArray(ref) && ref.kind === 'candidate') {
      const upstream = input.proposal.steps.find(step => typeof ref.key === 'string' && step.assetKeys.includes(ref.key));
      if (!upstream || !step.dependsOn.includes(upstream.key)) throw new Error('Reference candidates must come from declared upstream steps');
    } else throw new Error('Choose an exact project asset version for reference media');
  }
  const connectionId = step.fields.connectionId || variant.connectionId, workflowBindingId = step.fields.workflowBindingId || null;
  if (connectionId !== null && typeof connectionId !== 'string' || workflowBindingId !== null && typeof workflowBindingId !== 'string')
    throw new Error('Invalid production connection or workflow identity');
  return createProductionItem(ports, { ...draft, activeUse: 'ui' }, {
    ...variant, operation: step.kind === 'raster' ? 'image' : step.kind === 'svg' ? 'svg' : 'uiPatch',
    productionRecipeId: null, parameterPresetId: null, parameterOverrides: {}, promptPreparation: null,
    connectionId, model: null, workflowBindingId,
    recipe: step.recipe, fields: { ...variant.fields, model: null, ...step.fields, references,
      instruction: step.instruction, ...(step.kind === 'raster' ? { positive: step.fields.positive || step.instruction } : {}) },
  });
}
export type PlanningDocument = Pick<DocumentView, 'documentId' | 'revision' | 'files'>;
export type ProductionPlanningPorts = {
  readConnection(id: string | null): Promise<{ config: ConnectionConfig } | null>;
  listConnections(): Promise<ConnectionConfig[]>;
  readWorkflow(id: string): Promise<WorkflowBinding | null>;
  recipes: Pick<RecipeLibrary, 'getRecipe' | 'listRecipes'>;
  source(): CompileInput;
  sources(variant: FormVariant, source: CompileInput): VersionRef[];
  freezeProvider(config: ConnectionConfig, purpose: Purpose): Promise<GenerationProviderSnapshot>;
  resolveOperation?(id: string, frozen?: import('@galcraft/contracts').ProductionOperationSnapshot): Promise<import('@galcraft/contracts').ProductionOperationSnapshot>;
  resolveMedia?(assetId: string): Promise<MediaInput>;
  context?(target: FormVariant['target']): Promise<import('./types.js').ContextPart[]>;
};
type PlanningFields = {
  model?: string; sizeMode?: string; instruction?: string; maxOutputTokens?: number;
  positive?: string; negative?: string; width?: number; height?: number; count?: number; seed?: number | null;
  references?: MediaInput[]; spokenText?: string; text?: string; language?: string; voiceId?: string | null;
  referenceAudio?: MediaInput | null; referenceText?: string | null; referenceLanguage?: string | null; emotion?: string | null; speed?: number | null;
  prompt?: string; durationSec?: number; instrumental?: boolean; lyrics?: string | null; reference?: MediaInput;
  omittedPorts?: string[]; creationMode?: 'write' | 'performance' | 'discuss';
  [key: string]: unknown;
};
export function productionSources(documents: PlanningDocument[], variant: FormVariant, source: CompileInput): VersionRef[] {
    const related = new Map<string, VersionRef>();
    const add = (id: string | null | undefined, revision?: number) => { if (!id || related.has(id)) return; const document = documents.find(document => document.documentId === id), previous = variant.sourceVersions?.find(source => source.ref.id === id); const expected = revision ?? document?.revision ?? previous?.revision; if (expected !== undefined) related.set(id, { ref: { kind: 'document', id }, revision: expected }); };
    for (const part of variant.context ?? []) if (part.included && part.source?.ref.kind === 'document') add(part.source.ref.id, part.source.revision);
    const scenes = new Set([variant.target.sceneId, ...speechLines(variant).filter(line => line.selected).map(line => line.sceneId)].filter(Boolean));
    if ([...scenes].some(sceneId => !source.documents.some(document => document.sceneId === sceneId))) throw new Error('The adoption scene or selected dialogue source was removed. Select the current source again.');
    for (const document of source.documents) if (scenes.has(document.sceneId ?? null)) add(document.documentId);
    if (variant.target.uiScope?.pageIds.length) {
      add(source.template.instanceId);
      for (const pageId of variant.target.uiScope.pageIds) add(pageId);
      for (const style of source.template.styles) if (variant.target.uiScope.pageIds.includes(style.scope.pageId)) add(style.id);
      for (const document of documents) if (document.files['assets/index.json']) add(document.documentId);
    }
    if (variant.fields.sizeMode === 'project') for (const document of documents) if (document.files['project.json']) add(document.documentId);
    if (variant.target.usage === 'voice') {
      const characterIds = new Set([variant.target.characterId, ...speechLines(variant).filter(line => line.selected).map(line => line.characterId)]);
      for (const document of documents) if (Object.keys(document.files).some(path => [...characterIds].some(id => id && path === `characters/${id}.json`))) add(document.documentId);
    }
    const references = [variant.fields.reference, variant.fields.referenceAudio, ...(Array.isArray(variant.fields.references) ? variant.fields.references : [])];
    if (typeof variant.fields.assetId==='string'||references.some(reference => reference && typeof reference === 'object' && !Array.isArray(reference) && reference.assetId)) for (const document of documents) if (document.files['assets/index.json']) add(document.documentId);
    return [...related.values()].map(current => variant.context?.find(part => part.included && part.source?.ref.id === current.ref.id)?.source ?? variant.sourceVersions?.find(expected => expected.ref.kind === 'document' && expected.ref.id === current.ref.id) ?? current);
  }

export async function createProductionItem(ports: ProductionPlanningPorts, draft: ProductionFormDraft, variant: FormVariant, purposeOverride?: Purpose): Promise<TaskItem> {
    const entry = await ports.readConnection(variant.connectionId);
    if (!entry) throw new Error("Select a production connection");
    const originalFields: PlanningFields = variant.fields;
    if (Array.isArray(originalFields.excludedOperationInputs) && originalFields.excludedOperationInputs.length && originalFields.confirmOperationExclusions !== true) throw new Error('Confirm the retained inputs excluded by this mode, or choose a compatible mode');
    const config = {
      ...entry.config,
      model: originalFields.model || variant.model || entry.config.model,
    };
    let workflow = variant.workflowBindingId ? await ports.readWorkflow(variant.workflowBindingId) : null;
    if (workflow) workflow = structuredClone(workflow);
    let f: PlanningFields = variant.fields;
    const
      usage = draft.activeUse;
    const operation = variantOperation(variant, usage);
    const purpose = purposeOverride ?? operationPurpose(operation);
    const operationSnapshot = ports.resolveOperation ? await ports.resolveOperation(operation, variant.operationSnapshot) : new ProductionOperationCatalog().resolve(operation, variant.operationSnapshot);
    if (!workflow && operationSnapshot.definition.workflow && (!variant.workflowBindingId || variant.workflowBindingId === (operationSnapshot.definition.workflow as { id?: string }).id)) workflow = structuredClone(operationSnapshot.definition.workflow) as unknown as WorkflowBinding;
    if (operationSnapshot.definition.purpose !== purpose) throw new Error('The operation catalog purpose does not match its input');
    if (!variant.context.length && ports.context && !['speech', 'music'].includes(purpose)) {
      const context = await ports.context(variant.target);
      variant = { ...variant, context: context.map(part => {
        const previous = variant.sourceVersions?.find(version => part.source?.ref.id === version.ref.id);
        return previous ? { ...part, source: previous } : part;
      }) };
    }
    if (purpose !== 'text') variant = { ...variant, context: variant.context.map(part => ({ ...part,
      included: part.included && (part.kind === 'character' || part.kind === 'media' || part.kind === 'setting' && part.label.includes('outline')) })) };
    if (!operationSupportsConnection(operationSnapshot, config, purpose)) throw new Error(operationSnapshot.definition.connection ? 'Select a configured compatible text connection (Chat Completions)' : 'The operation does not match the selected generation provider');
    if (operationSnapshot.definition.connection) { config.purposes = [...new Set([...config.purposes, purpose])]; }
    const scheme = variant.productionRecipeId ? await ports.recipes.getRecipe(variant.productionRecipeId, (await ports.recipes.listRecipes()).find(recipe => recipe.id === variant.productionRecipeId)?.scope ?? 'personal') : null;
    const preset = variant.parameterPresetId ? (await ports.recipes.listRecipes()).find(recipe => recipe.id === variant.parameterPresetId) : null;
    if (variant.parameterPresetId && (!preset?.parameterPreset || preset.parameterPreset.recipeId !== scheme?.id || preset.parameterPreset.recipeRevision !== scheme?.revision)) throw new Error('The parameter preset does not match the production recipe version. Select it again.');
    if (scheme?.production?.workflow) workflow = structuredClone(scheme.production.workflow);
    if (variant.workflowBindingId && !workflow) throw new Error('The selected workflow is missing. Select a saved workflow.');
    if (variant.workflowBindingId && workflow?.id !== variant.workflowBindingId) throw new Error('The selected workflow does not match the operation or recipe workflow.');
    if (workflow) {
      if (workflow.operation && workflow.operation !== operation) throw new Error('The workflow is configured for another public operation');
      if (!workflowSupportsPurpose(workflow, purpose, purpose === 'image' ? usage as import('@galcraft/contracts').ImageUsage : null)) throw new Error('The workflow purpose or image use does not match the selected operation');
      for (const upload of workflow.uploads) if (upload.method === 'serverPath' && !upload.serverRoot) upload.serverRoot = config.serverReadRoot ?? config.serverFileRoot;
      validateWorkflow(workflow);
      if (operationSnapshot.provider) {
        const diagnostics = workflowOperationDiagnostics(workflow, operationSnapshot);
        if (diagnostics.length) throw new Error(diagnostics.map(diagnostic => diagnostic.message).join('\n'));
      }
      if (operationSnapshot.provider) for (const field of operationSnapshot.definition.fields) if (field.required && field.path !== 'language' && !workflow.inputs.some(port => port.port === field.path)) throw new Error(`The workflow does not bind required field: ${field.label}`);
    }
    const parameters = resolveProductionParameters(variant, scheme, preset);
    f = parameters.fields;
    if (variant.productionRecipeId && !scheme?.production) throw new Error('The production recipe is missing. Select it again.');
    if (scheme?.production?.executor === 'planned') throw new Error('This recipe is still planned and has no executable provider');
    if (scheme?.production && (scheme.production.operation !== operation || scheme.production.protocol && config.protocol !== scheme.production.protocol)) throw new Error('The recipe does not match the execution purpose or connection');
    for (const parameter of scheme?.production?.parameters ?? []) {
      const value = f[parameter.key];
      if (value === null || value === undefined) continue;
      if (parameter.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || parameter.min !== null && value < parameter.min || parameter.max !== null && value > parameter.max)) throw new Error(`${parameter.label} is outside the recipe range`);
      if (parameter.type === 'enum' && !parameter.choices.some(choice => choice === value)) throw new Error(`${parameter.label} is outside the recipe choices`);
    }
    if (!config.purposes.includes(purpose))
      throw new Error("The connection does not support the selected purpose");
    let providerSnapshot;
    if (config.providerKey) {
      providerSnapshot = await ports.freezeProvider(config, purpose);
      config.parameters = { ...config.parameters, capabilityInputs: providerSnapshot.capability.inputs,
        textVision: providerSnapshot.capability.textVision?.supported ?? false };
    }
    const identitySource = ports.source();
    if (f.sizeMode === 'project' && ['image', 'difference'].includes(purpose)) { f = { ...f, width: identitySource.project.canvas.width, height: identitySource.project.canvas.height }; }
    const sourceVersions = ports.sources(variant, identitySource);
    const compactedContext = compactContextParts(variant.context, identitySource.engineVersion, identitySource.pluginCommands);
    const referenceText = variant.context.filter(part => part.included && ['setting', 'character'].includes(part.kind) && part.text).map(part => `[${part.label}]\n${part.text}`).join('\n\n');
    const referenceMedia = variant.context.filter(part => part.included && part.media).map(part => structuredClone(part.media!));
    if (referenceMedia.some(media => !media.localPath)) throw new Error('Resolve the selected character reference images through the media input port before planning.');
    if (purpose === 'text' && variant.context.some(part => part.included && part.media?.mime.startsWith('image/') && !part.attachment))
      throw new Error('The selected character image cannot enter this text operation as an attachment. Use PNG, JPEG or WebP, or override the context.');
    if (purpose === 'image') f = { ...f, positive: [f.positive, referenceText].filter(Boolean).join('\n\n'), references: f.references ?? referenceMedia };
    if (purpose === 'difference') f = { ...f, instruction: [f.instruction, referenceText].filter(Boolean).join('\n\n'), reference: f.reference ?? referenceMedia[0] };
    if (operationSnapshot.provider && referenceMedia.length && !Object.hasOwn(f, 'references')) {
      const port = operationSnapshot.definition.inputs.find(port => port.type === 'image');
      if (!port || !port.multiple && referenceMedia.length > 1) throw new Error('The selected operation cannot accept these character reference images. Select a compatible image port or override the context.');
      f = { ...f, references: referenceMedia.map(media => ({ ...media, port: port.key })) };
    }
    const operationFields=Object.fromEntries(operationSnapshot.definition.fields.map(field=>[field.path,f[field.path]??field.default])) as Record<string,import('@galcraft/contracts').Json>;
    const operationSchema=operationSnapshot.definition.inputSchema as {properties?:Record<string,unknown>};
    for(const key of Object.keys(operationSchema.properties??{}))if(f[key]!==undefined)operationFields[key]=f[key] as import('@galcraft/contracts').Json;
    let input: GenerationInput =
      operationSnapshot.provider
        ? { purpose: purpose as import('@galcraft/contracts').ExtensionOperationId, fields: operationFields, references: f.confirmOperationExclusions === true ? (f.references ?? []).filter(media => operationSnapshot.definition.inputs.some(port => port.key === media.port && port.type !== 'text')) : f.references ?? [] }
        : purpose === "text"
        ? baseTextInput(operation, usage, compactedContext.context, f.instruction ?? "", f.maxOutputTokens ?? 4096)
        : purpose === "image"
          ? {
              purpose,
              usage: usage as Extract<GenerationInput, { purpose: 'image' }>['usage'],
              positive: f.positive ?? "",
              negative: f.negative ?? "",
              width: f.width ?? 1024,
              height: f.height ?? 1024,
              count: f.count ?? 1,
              seed: f.seed ?? null,
              references: f.references ?? [],
              ...(f.novelaiPrompt ? {novelai:{prompt:f.novelaiPrompt as import('@galcraft/contracts').Json,settings:(f.novelaiSettings??{modelProfile:'v5-full',quality:'none',transparent:false,negativePreset:null}) as import('@galcraft/contracts').Json,references:(f.novelaiReference??null) as import('@galcraft/contracts').Json}} : {}),
            }
          : purpose === "speech"
            ? {
                purpose,
                text: f.spokenText ?? f.text ?? "",
                language: f.language ?? "ja",
                voiceId: f.voiceId ?? null,
                referenceAudio: f.referenceAudio ?? null,
                referenceText: f.referenceText ?? null,
                referenceLanguage: f.referenceLanguage ?? null,
                emotion: f.emotion || null,
                speed: f.speed ?? null,
              }
            : purpose === "music"
              ? {
                  purpose,
                  prompt: f.prompt ?? "",
                  durationSec: f.durationSec ?? 30,
                  instrumental: f.instrumental ?? true,
                  lyrics: f.lyrics || null,
                  seed: f.seed ?? null,
                }
              : {
                  purpose: purpose as 'difference',
                  reference: f.reference!,
                  instruction: f.instruction ?? "",
                  negative: f.negative ?? "",
                  width: f.width ?? 1024,
                  height: f.height ?? 1024,
                  count: f.count ?? 1,
                  seed: f.seed ?? null,
                };
    let recipeSnapshot = null;
    if (variant.recipe && purpose === "text") {
      const recipe = await ports.recipes.getRecipe(
        variant.recipe.recipeId,
        variant.recipe.scope,
      );
      if (!recipe) throw new Error("The creation recipe is missing");
      recipeSnapshot = value(
        prepareRecipe({
          recipe,
          selection: variant.recipe,
          context: variant.context,
          instruction: (f.instruction ?? "") + (variant.recipe?.purpose === 'novelaiPrompt' ? `\nAuthor choices (retain as settings)：${JSON.stringify(f.novelaiSettings ?? {modelProfile:'v5-full',quality:'none',transparent:false,negativePreset:null})}` : ''),
          settings: {
            maxOutputTokens: f.maxOutputTokens ?? 4096,
            temperature: null,
            seed: null,
          },
          capability: inputCapability(config, input, workflow),
          sourceVersions,
          engineVersion: identitySource.engineVersion,
          pluginCommands: identitySource.pluginCommands,
        }),
      );
      recipeSnapshot.omittedPorts = f.omittedPorts ?? [];
      input = recipeSnapshot.assembledInput;
    } else if (f.omittedPorts?.length) {
      // M10 validates the original values before applying the author's explicit exclusions.
      input = confirmInput(config, input, workflow, f.omittedPorts);
    }
    const writingSystem = input.purpose === 'text' ? input.system : undefined;
    const creationMode = f.creationMode ?? recipeSnapshot?.recipe.scriptMode ?? 'write';
    if (input.purpose === 'text' && usage === 'script' && creationMode === 'discuss') input = { ...input, system: discussionSystem };
    return {
      id: createId(),
      purpose,
      operation,
      operationSnapshot,
      parameterSources: parameters.sources,
      ...(f.voicePresetSnapshot ? { voicePresetSnapshot: f.voicePresetSnapshot as unknown as import('./voice-input.js').FrozenVoicePreset } : {}),
      omittedPorts: [...(f.omittedPorts ?? [])],
      ...(providerSnapshot ? { providerSnapshot } : {}),
      ...(scheme ? { productionSnapshot: structuredClone(scheme) } : {}),
      ...(preset ? { parameterPresetSnapshot: structuredClone(preset) } : {}),
      ...(usage === 'script' ? { creationMode, writingSystem } : {}),
      ...(creationMode === 'performance' ? { protectedScript: ports.source().documents.filter(scene => scene.sceneId === variant.target.sceneId).flatMap(scene => {
        const parsed = parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text });
        return parsed.cst.filter(node => node.id && variant.target.replaceStatementIds?.includes(node.id)).map(node => scene.text.slice(node.start, node.end));
      }).join('\n') } : {}),
      target: variant.target,
      backgroundRemoval: variant.backgroundRemoval,
      backgroundPreview: variant.backgroundPreview,
      dependencies: [],
      input,
      sourceVersions,
      configSnapshot: config,
      workflowSnapshot: workflow ? structuredClone(workflow) : null,
      recipeSnapshot,
      idAliases: recipeSnapshot?.idAliases ?? compactedContext.idAliases,
      idCommands: identitySource.pluginCommands,
      state: "draft",
      remote: null,
      progress: { phase: "draft", completed: null, total: null },
      attempts: [],
      candidateIds: [],
      selectedCandidateId: null,
      needsReview: false,
      issues: [],
    };
  }

export async function planProductionDraft(ports: ProductionPlanningPorts, draft: ProductionFormDraft, name: string): Promise<TaskPlanInput> {
        const variant = draft.variants[draft.activeUse];
        if (!variant) throw new Error("The production draft purpose is not configured");
        const items: TaskItem[] = [];
        const promptFields: { promptModel?: string } = variant.fields;
        const operation = variantOperation(variant, draft.activeUse);
        const definition = ports.resolveOperation ? await ports.resolveOperation(operation, variant.operationSnapshot) : new ProductionOperationCatalog().resolve(operation, variant.operationSnapshot);
        const voice = draft.activeUse === 'voice' && definition.definition.adoption.kind === 'asset' && definition.definition.adoption.usages.includes('voice');
        if (voice && speechLines(variant).length) {
          const lines = speechLines(variant).filter(line => line.selected);
          if (!lines.length) throw new Error('Select at least one speech line');
          for (const line of lines) {
            const scoped = (await resolveVoiceVariant(variant, line, ports.source().characters, definition, ports.resolveMedia)).variant;
            const item = await createProductionItem(ports, draft, scoped);
            if (variant.promptPreparation) {
              const textConnection = (await ports.listConnections()).find(connection => connection.id === variant.fields.promptConnectionId && connection.purposes.includes('text'));
              if (!textConnection) throw new Error('Pronunciation preparation requires an explicitly selected text connection');
              const preparation = await createProductionItem(ports, draft, { ...scoped, operation: 'speechText', productionRecipeId: null, parameterPresetId: null, recipe: variant.promptPreparation, promptPreparation: null, connectionId: textConnection.id, workflowBindingId: null, model: promptFields.promptModel || textConnection.model, fields: { ...scoped.fields, model: promptFields.promptModel || textConnection.model, instruction: speechPreparationInstruction(line.text, String(variant.fields.instruction ?? '')) } });
              items.push(preparation); item.dependencies.push({ itemId: preparation.id, output: 'prompt', selectedCandidateId: null });
            }
            items.push(item);
          }
        } else if (variant.promptPreparation && operationPurpose(variantOperation(variant, draft.activeUse)) !== 'text') {
          const textConnection = (await ports.listConnections()).find(connection => connection.id === variant.fields.promptConnectionId && connection.purposes.includes('text'))
            ?? (await ports.listConnections()).find(connection => connection.purposes.includes('text'));
          if (!textConnection) throw new Error('Prompt preparation requires a configured text connection');
          const preparation = await createProductionItem(ports, draft, { ...variant, operation: variant.promptPreparation.purpose, productionRecipeId: null, parameterPresetId: null, recipe: variant.promptPreparation, promptPreparation: null,
            connectionId: textConnection.id, workflowBindingId: null, model: promptFields.promptModel || textConnection.model, fields: { ...variant.fields, model: promptFields.promptModel || textConnection.model, instruction: variant.promptPreparation.purpose === 'speechText' ? `Spoken text: ${variant.fields.spokenText || variant.fields.text || ''}\nPreparation request: ${variant.fields.instruction || 'Preserve the original text and check pronunciation'}` : variant.fields.instruction || variant.fields.positive || variant.fields.prompt || '' } });
          items.push(preparation);
          const item = await createProductionItem(ports, draft, { ...variant, fields: { ...variant.fields, positive: variant.fields.positive || variant.fields.instruction || null, prompt: variant.fields.prompt || variant.fields.instruction || null, text: variant.fields.text || variant.fields.instruction || null } });
          item.dependencies.push({ itemId: preparation.id, output: 'prompt', selectedCandidateId: null });
          items.push(item);
        } else items.push(await createProductionItem(ports, draft, variant));
        return {
          projectId: draft.projectId,
          name,
          sourceDraftId: draft.id,
          sourceDraftRevision: draft.revision,
          context: variant.promptPreparation || operationPurpose(variantOperation(variant, draft.activeUse)) === 'text' ? variant.context : [],
          items,
          policy: "waitForSelection",
          selectionRule: null,
          expected: [...new Map(items.flatMap(item => item.sourceVersions).map(version => [version.ref.id, version])).values()],
        };
      }
