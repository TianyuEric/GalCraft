import { createId } from '@galcraft/contracts';
import { BuiltinPlayerMenuLocales, ProjectLanguagesSchema, DebugScenarioSchema, DialogueContentSchema, dialoguePlainText, dialogueSegments, ExprSchema, hasSceneParameterDefault, IdSchema, NativeAnimationSchema, SnapshotSchema } from '@galcraft/contracts';
import type { Asset, AssetReference, Character, CommandSpec, CompiledScene, DebugScenario, Expr, FieldSpec, Flow, GalleryEntry, Id, Instruction, Issue, Json, Lock, Project, ResolvedAsset, RuntimeTemplate, Scene, Snapshot, Source, SourceMapEntry, Variable, VersionRef } from '@galcraft/contracts';
import { createCommandRegistry } from './catalog.js';
import { expressionType, parseExpression, variableReads } from './expression.js';
import type { ExprType } from './expression.js';
import { dialogueInterpolations } from './interpolation.js';
import { fieldAt, parse, parseSteps } from './parser.js';
import type { FieldNode, ParseResult, StatementNode, ValueNode } from './parser.js';

export type CompileDocument = { documentId: Id; revision: number; kind: string; text: string; sceneId?: Id; flowId?: Id };
export type CompilePluginDocument = { contribution: string; documentId: Id; revision: number; data: Json };
export type CompileDebugScenario = { documentId: Id; revision: number; data: Json };
export type CompileConfigMapping = { purpose: string; mode: 'multiple' | 'fixed'; required: boolean };
export type CompileInput = {
  projectId: Id; engineVersion: string; lock: Lock; project: Project;
  documents: CompileDocument[]; scenes: Scene[]; characters: Character[]; variables: Variable[];
  assets: Asset[]; gallery: GalleryEntry[]; flows: Flow[]; template: RuntimeTemplate;
  debugScenarios?: CompileDebugScenario[];
  pluginDocuments?: Record<string, Json>; pluginCommands?: CommandSpec[]; assetReferences?: AssetReference[]; entityVersions?: VersionRef[];
  pluginConfigDocuments?: CompilePluginDocument[]; pluginConfigMappings?: Record<string, CompileConfigMapping>;
  pluginMessages?: { pluginId: string; messages: Record<string, Record<string, string>> }[];
  pluginConditions?: Record<string, { args: ExprType[]; returns: ExprType }>;
  cancelOperationId: Id; signal?: AbortSignal;
};
export type SymbolIndex = { statements: Record<Id, Source>; labels: Record<Id, Source>; objects: Record<Id, Source>; variables: Variable[]; assets: Id[] };
export type CompileResult = { snapshot: Snapshot | null; issues: Issue[]; parses: ParseResult[]; symbols: SymbolIndex };

function problem(code: string, message: string, source?: Source, severity: Issue['severity'] = 'error'): Issue {
  return { code, severity, message, owner: 'M03', ...(source ? { source } : {}), related: [], actions: code === 'PLUGIN_MISSING' ? ['supplyDependency'] : ['edit', 'locate'] };
}
function sourceAt(document: CompileDocument, node: StatementNode, field?: FieldNode | ValueNode, path?: string): Source {
  return { documentId: document.documentId, revision: document.revision, ...(node.id ? { statementId: node.id } : {}),
    ...(path ? { field: path } : {}), range: { start: field?.start ?? node.start, end: field?.end ?? node.end } };
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function expr(value: unknown): value is Expr { return ExprSchema.safeParse(value).success; }

/** M09 supplies definitions; M03 freezes every selected document revision in the Player configuration. */
export function compilePluginConfigurations(input: Pick<CompileInput, 'lock' | 'pluginDocuments' | 'pluginConfigDocuments' | 'pluginConfigMappings'>): { configs: Record<string, Json>; issues: Issue[] } {
  const configs = structuredClone(input.pluginDocuments ?? {}), issues: Issue[] = [];
  const mappings = input.pluginConfigMappings ?? {};
  const selected = input.pluginConfigDocuments ?? [];
  const seen = new Set<string>();
  const mappedPlugins = new Set<string>();
  for (const [contribution, mapping] of Object.entries(mappings).sort(([a], [b]) => a.localeCompare(b))) {
    const pluginId = contribution.split('/')[0]!;
    if (!input.lock.plugins.some(item => item.id === pluginId)) { issues.push(problem('PLUGIN_CONFIG_PROVIDER', `Configuration provider ${pluginId} is not locked`)); continue; }
    const documents = selected.filter(item => item.contribution === contribution).sort((a, b) => a.documentId.localeCompare(b.documentId));
    if (mapping.required && !documents.length) issues.push(problem('PLUGIN_CONFIG_REQUIRED', `Required configuration ${contribution} is missing`));
    if (mapping.mode === 'fixed' && documents.length > 1) issues.push(problem('PLUGIN_CONFIG_FIXED', `Configuration ${contribution} requires one fixed instance`));
    if (!mappedPlugins.has(pluginId)) { configs[pluginId] = { schemaVersion: 1, documents: [] }; mappedPlugins.add(pluginId); }
    const output = configs[pluginId] as { schemaVersion: number; documents: Json[] };
    // New definitions replace the former flattened value; legacy packages keep their former shape.
    output.documents = output.documents.filter(item => !record(item) || item.contribution !== contribution);
    for (const document of documents) {
      if (seen.has(document.documentId)) { issues.push(problem('PLUGIN_CONFIG_DUPLICATE', `Configuration document ${document.documentId} is selected twice`, { documentId: document.documentId, revision: document.revision })); continue; }
      seen.add(document.documentId);
      output.documents.push({ ...structuredClone(document), purpose: mapping.purpose });
    }
  }
  for (const document of selected) if (!mappings[document.contribution]) issues.push(problem('PLUGIN_CONFIG_MAPPING', `No runtime mapping for ${document.contribution}`, { documentId: document.documentId, revision: document.revision }));
  return { configs, issues };
}
function scalarType(value: unknown): string { return typeof value; }

function validateField(value: unknown, spec: FieldSpec, path: string, report: (code: string, message: string, path: string) => void, partial = false): unknown {
  if (value === undefined) {
    if (spec.required) report('FIELD_REQUIRED', `${path} is required`, path);
    return spec.default;
  }
  if (value === null) { if (!spec.nullable) report('FIELD_TYPE', `${path} cannot be null`, path); return null; }
  switch (spec.type) {
    case 'string': if (typeof value !== 'string') report('FIELD_TYPE', `${path} must be a string`, path); break;
    case 'boolean': if (typeof value !== 'boolean') report('FIELD_TYPE', `${path} must be boolean`, path); break;
    case 'number': case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value) || (spec.type === 'integer' && (!Number.isSafeInteger(value)))) report('FIELD_TYPE', `${path} must be ${spec.type}`, path);
      else {
        if (spec.min !== undefined && value < spec.min || spec.max !== undefined && value > spec.max || spec.exclusiveMin !== undefined && value <= spec.exclusiveMin) report('FIELD_RANGE', `${path} is out of range`, path);
      }
      break;
    case 'enum': if (typeof value !== 'string' || !spec.enumValues?.includes(value)) report('FIELD_ENUM', `${path} must be one of ${spec.enumValues?.join(', ')}`, path); break;
    case 'ref': if (typeof value !== 'string' || !IdSchema.safeParse(value).success) report('FIELD_REF', `${path} needs a stable ID`, path); break;
    case 'expression': if (!expr(value) && !['string', 'number', 'boolean'].includes(typeof value)) report('FIELD_EXPRESSION', `${path} needs an expression or scalar`, path); break;
    case 'array':
      if (!Array.isArray(value)) report('FIELD_TYPE', `${path} must be an array`, path);
      else {
        if (spec.minItems !== undefined && value.length < spec.minItems) report('FIELD_ITEMS', `${path} needs at least ${spec.minItems} items`, path);
        if (spec.path === 'rgb' && value.length !== 3) report('FIELD_ITEMS', `${path} needs three channels`, path);
        return value.map((entry, index) => spec.item ? validateField(entry, spec.item, `${path}.${index}`, report, partial) : entry);
      }
      break;
    case 'object':
      if (!record(value)) report('FIELD_TYPE', `${path} must be an object`, path);
      else if (spec.children?.length) {
        const output: Record<string, unknown> = {};
        for (const child of spec.children) {
          const childPath = `${path}.${child.path}`;
          const childPartial = partial || ['effects', 'model', 'parameters'].includes(child.path);
          if (Object.hasOwn(value, child.path) || (!partial && child.required)) output[child.path] = validateField(value[child.path], child, childPath, report, childPartial);
          else if (!partial && (child.default !== null || child.nullable) && !['speaker', 'receiver'].includes(spec.path)) output[child.path] = child.default;
        }
        return output;
      }
      break;
  }
  return value;
}

export type CommandValidationContext = Pick<CompileInput, 'engineVersion' | 'documents' | 'scenes' | 'characters' | 'variables' | 'assets' | 'gallery' | 'pluginCommands' | 'pluginConditions'>;
function validateCommand(node: StatementNode, document: CompileDocument, spec: CommandSpec, input: CommandValidationContext, scene: Scene, labels: Map<Id, Set<Id>>, map: SourceMapEntry[], issues: Issue[]): Record<string, unknown> {
  const raw = node.object?.value;
  if (!record(raw)) return {};
  const args: Record<string, unknown> = {};
  const fieldSource = (path: string): Source => {
    const pathParts = path.split('.');
    const field = node.object ? fieldAt(node.object, pathParts) : undefined;
    return sourceAt(document, node, field, path);
  };
  const report = (code: string, message: string, path: string) => issues.push(problem(code, message, fieldSource(path)));
  for (const field of spec.fields) {
    const partial = ['effects', 'model', 'parameters', 'voiceByLocale'].includes(field.path);
    if (node.command === 'say' && field.path === 'text' && Object.hasOwn(raw, 'text')) {
      const content = DialogueContentSchema.safeParse(raw.text);
      if (!content.success) report('DIALOGUE_CONTENT', content.error.message, 'text');
      else args.text = content.data;
    } else if (Object.hasOwn(raw, field.path)) args[field.path] = validateField(raw[field.path], field, field.path, report, partial);
    else if (field.required && !(node.command === 'intro' && field.path === 'paragraphs' && raw.op === 'clear')) validateField(undefined, field, field.path, report, partial);
    else if (field.default !== null || node.command === 'say' && ['textLocale', 'voice', 'fontSize'].includes(field.path)
      || node.command === 'getUserInput' && ['pattern', 'validation', 'cancelTarget'].includes(field.path)
      || node.command === 'end' && field.path === 'endingId') args[field.path] = field.default;
  }
  if (node.command === 'changeFigure') {
    if (raw.op !== 'show' && !Object.hasOwn(raw, 'station')) delete args.station;
    if (!Object.hasOwn(raw, 'z')) delete args.z;
  }
  for (const key of Object.keys(raw)) if (!spec.fields.some(field => field.path === key)) issues.push(problem('FIELD_UNKNOWN', `Unknown field ${key} has no runtime behavior`, fieldSource(key), 'warning'));
  const warnNested = (value: unknown, field: FieldSpec, path: string): void => {
    if (field.type === 'array' && Array.isArray(value) && field.item) value.forEach((entry, index) => warnNested(entry, field.item!, `${path}.${index}`));
    if (field.type !== 'object' || !record(value) || !field.children?.length) return;
    for (const [key, entry] of Object.entries(value)) {
      const child = field.children.find(item => item.path === key);
      if (!child) issues.push(problem('FIELD_UNKNOWN', `Unknown field ${path}.${key} has no runtime behavior`, fieldSource(`${path}.${key}`), 'warning'));
      else warnNested(entry, child, `${path}.${key}`);
    }
  };
  for (const field of spec.fields) if (Object.hasOwn(raw, field.path)) warnNested(raw[field.path], field, field.path);
  const mapFields = (value: ValueNode, path = ''): void => {
    for (const item of value.fields ?? []) {
      const childPath = path ? `${path}.${item.key}` : item.key;
      map.push({ statementId: node.id!, field: childPath, source: sourceAt(document, node, item.valueNode, childPath) });
      mapFields(item.valueNode, childPath);
      item.valueNode.items?.forEach((entry, index) => mapFields(entry, `${childPath}.${index}`));
    }
  };
  if (node.id && node.object) mapFields(node.object);
  const requireField = (path: string) => { if (args[path] === undefined || args[path] === null) report('FIELD_REQUIRED', `${path} is required for ${node.command}`, path); };
  const validateTarget = (value: unknown, path: string, allowStage = false): void => {
    if (!record(value)) return;
    if (value.kind === 'object' && !IdSchema.safeParse(value.id).success) report('TARGET_OBJECT', 'Object target needs an ID', `${path}.id`);
    else if (value.kind === 'station' && !['left', 'leftQuarter', 'leftThird', 'center', 'rightThird', 'rightQuarter', 'right'].includes(String(value.station))) report('TARGET_STATION', 'Station target needs a station', `${path}.station`);
    else if (value.kind === 'stage' && !allowStage) report('TARGET_STAGE', 'Stage target is unavailable here', `${path}.kind`);
  };
  const validateTransition = (value: unknown, path: string): void => {
    if (!record(value)) return;
    if (value.animation !== undefined && !NativeAnimationSchema.safeParse(value.animation).success) report('TRANSITION_ANIMATION', 'Transition animation must be valid native animation data', `${path}.animation`);
    if (value.preset === 'custom' && !IdSchema.safeParse(value.resourceId).success && value.animation === undefined) report('TRANSITION_RESOURCE', 'Custom transition needs a resource or native animation', `${path}.resourceId`);
    if (value.animation !== undefined && (value.preset !== 'custom' || value.resourceId != null)) report('TRANSITION_ANIMATION', 'Use one native animation or one custom resource', `${path}.animation`);
  };
  const validateReferences = (value: unknown, fields: FieldSpec[], prefix = ''): void => {
    if (!record(value)) return;
    for (const field of fields) {
      const path = prefix ? `${prefix}.${field.path}` : field.path;
      const current = value[field.path];
      if (field.refKind === 'asset' && typeof current === 'string') {
        const asset = input.assets.find(item => item.id === current);
        if (!asset) report('ASSET_MISSING', `Asset ${current} is unavailable`, path);
        else if (field.assetKinds?.length && !field.assetKinds.includes(asset.kind)) report('ASSET_KIND', `Asset ${current} has an incompatible kind`, path);
      }
      if (typeof current === 'string' && field.refKind === 'character' && !input.characters.some(item => item.id === current)) report('CHARACTER_MISSING', `Character ${current} is unavailable`, path);
      if (typeof current === 'string' && field.refKind === 'gallery') {
        const entry = input.gallery.find(item => item.id === current);
        const expectedKind = node.command === 'unlockCg' || node.command === 'changeBg' ? 'cg' : node.command === 'unlockBgm' || node.command === 'bgm' ? 'music' : node.command === 'unlockVideo' || node.command === 'video' ? 'video' : null;
        if (!entry) report('GALLERY_MISSING', `Gallery entry ${current} is unavailable`, path);
        else if (expectedKind && entry.kind !== expectedKind) report('GALLERY_KIND', `Gallery entry ${current} must be ${expectedKind}`, path);
      }
      if (typeof current === 'string' && field.refKind === 'variable' && ![...input.variables, ...scene.locals].some(item => item.id === current)) report('VARIABLE_MISSING', `Variable ${current} is unavailable`, path);
      if (field.type === 'object') validateReferences(current, field.children ?? [], path);
      if (field.type === 'array' && Array.isArray(current) && field.item) current.forEach((item, index) => validateReferences({ [field.item!.path]: item }, [field.item!], `${path}.${index}`));
    }
  };
  validateReferences(raw, spec.fields);
  if (node.command === 'unlockCg') {
    const entry = input.gallery.find(item => item.id === args.entryId);
    if (!Array.isArray(args.differenceIds) || !args.differenceIds.length || args.differenceIds.some(id => !entry?.differences?.some(diff => diff.id === id)))
      report('GALLERY_DIFFERENCE', '请选择属于该 CG 的明确差分', 'differenceIds');
  }
  if (args.galleryId && ['changeBg','bgm','video'].includes(node.command)) {
    const entry = input.gallery.find(item => item.id === args.galleryId);
    if (node.command === 'changeBg' ? !entry?.differences?.some(diff => diff.id === args.differenceId && diff.assetId === args.assetId) : !entry?.assets.includes(String(args.assetId)))
      report('GALLERY_MEDIA', '鉴赏关联必须匹配本次呈现的素材与差分', 'galleryId');
  }
  if (record(args.target)) validateTarget(args.target, 'target', ['pixi', 'pixiInit', 'setTransform', 'setAnimation', 'setComplexAnimation', 'setTempAnimation', 'stopAnimation'].includes(node.command));
  if (record(args.playback) && args.playback.wait === true && args.playback.mode !== 'once')
    report('IMAGE_INFINITE_WAIT', 'A looping image cannot wait for its final frame', 'playback.wait');
  if (record(args.transition)) {
    validateTransition(args.transition.enter, 'transition.enter'); validateTransition(args.transition.exit, 'transition.exit');
  }
  validateTransition(args.enter, 'enter'); validateTransition(args.exit, 'exit');
  if (record(args.model)) {
    const model = args.model;
    const asset = input.assets.find(item => item.id === args.assetId);
    const active = asset?.variants.find(item => item.id === asset.activeVariantId);
    const capabilities = active?.groupCapabilities;
    if (record(model.imageMouth) && model.imageMouth.enabled === true) {
      if (!IdSchema.safeParse(model.imageMouth.closed).success) report('MODEL_MOUTH', 'Enabled mouth needs a closed image', 'model.imageMouth.closed');
      if (!IdSchema.safeParse(model.imageMouth.open).success) report('MODEL_MOUTH', 'Enabled mouth needs an open image', 'model.imageMouth.open');
    }
    if (record(model.imageBlink) && model.imageBlink.enabled === true) {
      if (!IdSchema.safeParse(model.imageBlink.closed).success || !IdSchema.safeParse(model.imageBlink.open).success) report('MODEL_BLINK', 'Enabled blink needs open and closed images', 'model.imageBlink');
    }
    if (record(model.imageBlink) && typeof model.imageBlink.intervalMs === 'number' && typeof model.imageBlink.randomMs === 'number' && model.imageBlink.randomMs > model.imageBlink.intervalMs) report('MODEL_BLINK', 'randomMs exceeds intervalMs', 'model.imageBlink.randomMs');
    if (record(model.crop) && (typeof model.crop.x !== 'number' || typeof model.crop.y !== 'number' || typeof model.crop.width !== 'number' || model.crop.width <= 0 || typeof model.crop.height !== 'number' || model.crop.height <= 0)) report('MODEL_CROP', 'Crop needs finite x/y and positive width/height', 'model.crop');
    if (record(model.crop) && active) {
      const width = active.metadata.width ?? active.canvas?.width;
      const height = active.metadata.height ?? active.canvas?.height;
      if (typeof width === 'number' && typeof height === 'number' &&
        (Number(model.crop.x) < 0 || Number(model.crop.y) < 0 || Number(model.crop.x) + Number(model.crop.width) > width || Number(model.crop.y) + Number(model.crop.height) > height)) report('MODEL_CROP', 'Crop exceeds resource bounds', 'model.crop');
    }
    if (capabilities && record(model.parameters)) for (const [name, value] of Object.entries(model.parameters)) {
      const definition = capabilities.parameters.find(item => item.id === name);
      if (!definition || typeof value !== 'number' || !Number.isFinite(value) || value < definition.min || value > definition.max) report('MODEL_PARAMETER', `Invalid model parameter ${name}`, `model.parameters.${name}`);
    }
    const motion = record(model.motion) ? model.motion : null;
    if (capabilities && motion?.op === 'play' && !capabilities.motions.some(item => item.group === motion.group && item.index === motion.index)) report('MODEL_MOTION', 'Motion is unavailable in this resource', 'model.motion');
    if (capabilities && record(model.expression) && model.expression.op === 'set' && !capabilities.expressions.includes(String(model.expression.name))) report('MODEL_EXPRESSION', 'Expression is unavailable in this resource', 'model.expression.name');
    if (capabilities && record(model.lip) && model.lip.mode === 'basic' && !capabilities.capabilities.includes('amplitudeLip'))
      report('MODEL_LIP', 'Basic lip sync is unavailable in this resource', 'model.lip.mode');
    if (capabilities && record(model.lip) && model.lip.mode === 'motionSync' && !capabilities.capabilities.includes('motionSync'))
      report('MODEL_LIP', 'MotionSync is unavailable in this resource', 'model.lip.mode');
  }
  const checkAudioBounds = (): void => {
    const asset = input.assets.find(item => item.id === args.assetId);
    const duration = asset?.variants.find(item => item.id === asset.activeVariantId)?.metadata.durationSec;
    if (duration === undefined || args.op === 'stop') return;
    const start = typeof args.startSec === 'number' ? args.startSec : 0;
    const from = typeof args.loopStartSec === 'number' ? args.loopStartSec : start;
    const end = typeof args.loopEndSec === 'number' ? args.loopEndSec : duration;
    if (start < 0 || start >= duration) report('AUDIO_RANGE', 'startSec is outside the asset', 'startSec');
    if (from < 0 || from >= end || end > duration) report('AUDIO_LOOP', 'Loop interval is outside the asset', 'loopStartSec');
  };
  const requireTarget = (target: unknown, path: string) => {
    if (!record(target) || typeof target.sceneId !== 'string' || !input.scenes.some(item => item.id === target.sceneId)) report('SCENE_MISSING', 'Target scene does not exist', path);
    else if (target.labelId !== null && target.labelId !== undefined && !labels.get(target.sceneId)?.has(target.labelId as Id)) report('LABEL_MISSING', 'Target label does not exist', `${path}.labelId`);
  };
  switch (node.command) {
    case 'say':
      if (args.avatarMode === 'image' && typeof args.avatar !== 'string') report('AVATAR_IMAGE', 'Choose an image for this sentence portrait', 'avatar');
      if (!record(args.speaker) || args.speaker.kind === 'character' && !input.characters.some(item => item.id === (args.speaker as Record<string, unknown>).id)) report('CHARACTER_MISSING', 'Speaker does not exist', 'speaker.id');
      if (DialogueContentSchema.safeParse(args.text).success && !dialoguePlainText(args.text as import('@galcraft/contracts').DialogueContent)) report('TEXT_EMPTY', 'Dialogue text is empty', 'text');
      if (typeof args.textLocale === 'string' && !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(args.textLocale)) report('LOCALE_INVALID', 'textLocale must be BCP 47', 'textLocale');
      if (record(args.speaker) && args.speaker.kind === 'character' && typeof args.text === 'string' && /^「[\s\S]*」$/.test(args.text)) issues.push(problem('DIALOGUE_OUTER_QUOTES', 'Dialogue already has outer quotes', fieldSource('text'), 'warning'));
      if (DialogueContentSchema.safeParse(args.text).success) for (const match of dialogueSegments(DialogueContentSchema.parse(args.text)).flatMap(segment => dialogueInterpolations(segment.text))) {
        if (match.source === null) continue;
        const parsed = match.closed ? parseExpression(match.source) : { ok: false as const, message: 'Expected closing }} for dialogue interpolation' };
        if (!parsed.ok) report('INTERPOLATION_SYNTAX', parsed.message, 'text');
        else try { expressionType(parsed.expr, { variables: input.variables, locals: scene.locals, conditions: input.pluginConditions }); } catch (error) { report('INTERPOLATION_TYPE', String(error), 'text'); }
      }
      break;
    case 'changeBg': if (args.op !== 'clear') requireField('assetId'); break;
    case 'changeFigure': if (args.op === 'show') { requireField('characterId'); if(args.difference!==true)requireField('assetId'); } break;
    case 'characterDifference': {
      const character=input.characters.find(item=>item.id===args.characterId);
      if(!character)report('CHARACTER_MISSING','共同差分角色不存在','characterId');
      else if(args.differenceId&&!character.differences?.some(item=>item.id===args.differenceId))report('CHARACTER_DIFFERENCE_MISSING','角色共同差分不存在','differenceId');
      break;
    }
    case 'changeIllustration': {
      if (args.op !== 'exit') requireField('assetId');
      if (Array.isArray(args.states)) {
        const names = args.states.filter(record).map(state => state.name);
        if (names.some(name => typeof name !== 'string' || !name.trim()) || new Set(names).size !== names.length)
          report('ILLUSTRATION_STATES', 'Illustration state names must be nonempty and unique', 'states');
      }
      break;
    }
    case 'changeIllustrationDiff':
      if (Boolean(args.assetId) === Boolean(args.stateName)) report('ILLUSTRATION_STATE_SOURCE', 'Choose an assetId or a named state', 'stateName');
      break;
    case 'bgm': if (args.op === 'play') { requireField('assetId'); checkAudioBounds(); } break;
    case 'playEffect': if (args.op === 'play') { requireField('soundId'); requireField('assetId'); checkAudioBounds(); } else if (args.all !== true) requireField('soundId'); break;
    case 'stopAnimation': {
      const sources = input.documents.filter(item => item.kind === 'scene').flatMap(item => parse({ documentId: item.documentId, revision: item.revision, text: item.text }).cst)
        .filter(item => item.valid && ['setAnimation', 'setComplexAnimation'].includes(item.command) && record(item.object?.value) && item.object.value.animationId === args.animationId);
      if (!sources.length) report('ANIMATION_REFERENCE_MISSING', 'Choose an animation instance declared by a start command', 'animationId');
      else if (!sources.some(item => {
        const declared = record(item.object!.value) && record(item.object!.value.target) ? item.object!.value.target : {};
        const stopped = record(args.target) ? args.target : {};
        return declared.kind === stopped.kind && (declared.kind === 'stage' || declared.kind === 'object' && declared.id === stopped.id || declared.kind === 'station' && declared.station === stopped.station);
      })) report('ANIMATION_REFERENCE_TARGET', 'The instance reference belongs to a different animation target', 'target');
      break;
    }
    case 'setComplexAnimation': {
      if ([args.resourceId, args.segments, args.animation].filter(value => value !== undefined && value !== null).length !== 1 ||
        Array.isArray(args.segments) && args.segments.length === 0) report('ANIMATION_SOURCE', 'Choose one animation resource, nonempty segments or native tracks', 'segments');
      if (args.animation !== undefined) {
        const checked = NativeAnimationSchema.safeParse(args.animation);
        if (!checked.success) report('ANIMATION_TRACK', checked.error.message, 'animation');
        else args.animation = checked.data;
      }
      break;
    }
    case 'setTransform': if (!record(args.effects) || !Object.keys(args.effects).length) report('EFFECT_EMPTY', 'effects needs one field', 'effects'); break;
    case 'setTempAnimation': if (args.writeDefault === true && args.keepFinal === false) report('ANIMATION_CONFLICT', 'writeDefault requires keepFinal', 'writeDefault'); break;
    case 'pixiInit': if (args.scope === 'instance') requireField('effectId'); if (args.scope === 'target') requireField('target'); break;
    case 'intro': if (args.op === 'show' && (!Array.isArray(args.paragraphs) || args.paragraphs.some(item => typeof item !== 'string' || !item.trim()))) report('INTRO_PARAGRAPH', 'show requires nonempty paragraphs', 'paragraphs'); break;
    case 'miniAvatar': if (args.op === 'set') requireField('assetId'); break;
    case 'callScene': case 'changeScene':
      requireTarget({ sceneId: args.sceneId, labelId: args.labelId }, 'sceneId');
      if (node.command === 'callScene') {
        const target = input.scenes.find(item => item.id === args.sceneId);
        const parameters = record(args.parameters) ? args.parameters : {};
        if (target) for (const name of Object.keys(parameters)) if (!target.parameters.some(item => item.variableId === name)) report('CALL_ARGUMENT', `Unknown parameter ${name}`, `parameters.${name}`);
        if (target) for (const parameter of target.parameters) {
          const variable = target.locals.find(item => item.id === parameter.variableId);
          const actual = parameters[parameter.variableId];
          if (actual === undefined && !hasSceneParameterDefault(parameter, variable)) report('CALL_ARGUMENT', `Missing parameter ${parameter.variableId}`, 'parameters');
          if (actual !== undefined && variable) try {
            const type = expr(actual) ? expressionType(actual, { variables: input.variables, locals: scene.locals, conditions: input.pluginConditions }) : typeof actual;
            if (type !== variable.type) report('CALL_ARGUMENT', `Parameter ${parameter.variableId} needs ${variable.type}`, `parameters.${parameter.variableId}`);
          } catch (error) { report('CALL_ARGUMENT', String(error), `parameters.${parameter.variableId}`); }
        }
        if (record(args.receiver)) {
          const receiver = args.receiver as Record<string, unknown>;
          const variable = [...input.variables, ...scene.locals].find(item => item.id === receiver.variableId && item.scope === receiver.scope);
          if (!variable || target && target.returns !== variable.type) report('CALL_RECEIVER', 'Receiver does not match scene return type', 'receiver.variableId');
        }
      }
      break;
    case 'choose':
      if (Array.isArray(args.options)) for (const [index, option] of args.options.entries()) if (record(option)) {
        requireTarget(option.target, `options.${index}.target`);
        if (option.text === '') report('CHOICE_TEXT', 'Choice text is empty', `options.${index}.text`);
      }
      if (Array.isArray(args.options)) {
        const ids = args.options.filter(record).map(option => option.id);
        if (new Set(ids).size !== ids.length) report('CHOICE_ID', 'Choice option IDs must be unique', 'options');
        if (args.previewDefault !== null && args.previewDefault !== undefined && !ids.includes(args.previewDefault)) report('CHOICE_DEFAULT', 'Preview default must name an option', 'previewDefault');
      }
      break;
    case 'label': if (typeof args.name === 'string' && !args.name.trim()) report('LABEL_NAME', 'Label name is empty', 'name'); break;
    case 'jumpLabel': if (typeof args.labelId === 'string' && !labels.get(scene.id)?.has(args.labelId)) report('LABEL_MISSING', 'Label is not in this scene', 'labelId'); break;
    case 'return':
      if (scene.returns === 'void' && args.value !== undefined) report('RETURN_TYPE', 'Void scene cannot return a value', 'value');
      else if (scene.returns !== 'void') {
        if (args.value === undefined) report('RETURN_TYPE', `Scene must return ${scene.returns}`, 'value');
        else try { const type = expr(args.value) ? expressionType(args.value, { variables: input.variables, locals: scene.locals, conditions: input.pluginConditions }) : typeof args.value; if (type !== scene.returns) report('RETURN_TYPE', `Return value must be ${scene.returns}`, 'value'); }
        catch (error) { report('RETURN_TYPE', String(error), 'value'); }
      }
      break;
    case 'getUserInput': {
      const variable = [...input.variables, ...scene.locals].find(item => item.id === args.variableId);
      if (!variable || variable.type !== 'string') report('VARIABLE_TYPE', 'Input variable must be declared string', 'variableId');
      if (typeof args.pattern === 'string') try { new RegExp(`^(?:${args.pattern})$`); } catch { report('PATTERN_INVALID', 'Invalid regular expression', 'pattern'); }
      if (args.cancelTarget) requireTarget(args.cancelTarget, 'cancelTarget');
      break;
    }
    case 'setVar': {
      const variable = [...input.variables, ...scene.locals].find(item => item.id === args.variableId);
      if (!variable) report('VARIABLE_MISSING', 'Variable is not declared', 'variableId');
      if (variable && args.op !== 'assign' && variable.type !== 'number') report('VARIABLE_TYPE', 'Arithmetic requires a number variable', 'op');
      if (variable && args.value !== undefined) try {
        const actual = expr(args.value) ? expressionType(args.value, { variables: input.variables, locals: scene.locals, conditions: input.pluginConditions }) : typeof args.value;
        if (actual !== variable.type) report('VARIABLE_TYPE', `Value must be ${variable.type}`, 'value');
      } catch (error) { report('EXPR_TYPE', String(error), 'value'); }
      break;
    }
    case 'applyStyle': if (args.op !== 'reset') requireField('styleId'); break;
    case 'end': if (record(args.target)) {
      if (args.target.kind === 'scene') requireTarget(args.target, 'target');
      if (args.target.kind === 'page' && !IdSchema.safeParse(args.target.pageId).success) report('END_TARGET', 'Page target needs pageId', 'target.pageId');
    } break;
  }
  if (args.when !== undefined && args.when !== null) {
    try { if (expr(args.when) && expressionType(args.when, { variables: input.variables, locals: scene.locals, conditions: input.pluginConditions }) !== 'boolean') report('EXPR_TYPE', 'when must be boolean', 'when'); }
    catch (error) { report('EXPR_TYPE', String((error as Error).message), 'when'); }
  }
  const inspectExpr = (value: unknown, path: string): void => {
    if (expr(value)) {
      try { expressionType(value, { variables: input.variables, locals: scene.locals, input: node.command === 'getUserInput' && path === 'validation', conditions: input.pluginConditions }); }
      catch (error) { report('EXPR_TYPE', String((error as Error).message), path); }
      return;
    }
    if (Array.isArray(value)) value.forEach((item, index) => inspectExpr(item, `${path}.${index}`));
    else if (record(value)) for (const [key, item] of Object.entries(value)) inspectExpr(item, path ? `${path}.${key}` : key);
  };
  inspectExpr(raw, '');
  const checkCondition = (value: unknown, path: string, allowNull = false): void => {
    if (value === undefined || allowNull && value === null) return;
    if (typeof value === 'boolean') return;
    if (!expr(value)) { report('EXPR_TYPE', `${path} must be a boolean expression`, path); return; }
    try { if (expressionType(value, { variables: input.variables, locals: scene.locals, input: path === 'validation', conditions: input.pluginConditions }) !== 'boolean') report('EXPR_TYPE', `${path} must be boolean`, path); }
    catch (error) { report('EXPR_TYPE', String(error), path); }
  };
  checkCondition(args.when, 'when');
  if (node.command === 'getUserInput') {
    checkCondition(args.validation, 'validation', true);
    if (typeof args.validation === 'boolean') args.validation = { kind: 'literal', value: args.validation };
  }
  if (node.command === 'choose' && Array.isArray(args.options)) args.options = args.options.map((option, index) => {
    if (!record(option)) return option;
    checkCondition(option.visible, `options.${index}.visible`); checkCondition(option.enabled, `options.${index}.enabled`);
    return { ...option, ...(typeof option.visible === 'boolean' ? { visible: { kind: 'literal', value: option.visible } } : {}),
      ...(typeof option.enabled === 'boolean' ? { enabled: { kind: 'literal', value: option.enabled } } : {}) };
  });
  return args;
}

/** Validate this structured result without requiring unrelated unfinished source to compile. */
export function validateAuthoringCommands(parsed: ParseResult, ids: Id[], scene: Scene, input: CommandValidationContext): Issue[] {
  const registry = createCommandRegistry(input.engineVersion, input.pluginCommands), issues: Issue[] = [], labels = new Map<Id, Set<Id>>();
  for (const document of input.documents) {
    if (!document.sceneId) continue;
    const source = document.documentId === parsed.documentId ? parsed : parse(document);
    labels.set(document.sceneId, new Set(source.cst.filter(node => node.valid && node.command === 'label').flatMap(node => {
      const id = (node.object?.value as { labelId?: Id } | undefined)?.labelId; return id ? [id] : [];
    })));
  }
  for (const id of ids) {
    const node = parsed.cst.find(node => node.id === id), spec = node && registry.get(node.command);
    if (!node?.valid || !node.object) { issues.push(problem('STATEMENT_INVALID', `Statement ${id} needs valid command syntax`)); continue; }
    if (!spec) { issues.push(problem('COMMAND_MISSING', `Command ${node.command} has no installed contract`)); continue; }
    validateCommand(node, { documentId: parsed.documentId, revision: parsed.revision, kind: 'scene', text: parsed.text, sceneId: scene.id }, spec, input, scene, labels, [], issues);
  }
  return issues;
}

function resolveAsset(asset: Asset, variantId: Id = asset.activeVariantId): ResolvedAsset | null {
  const variant = asset.variants.find(item => item.id === variantId);
  if (!variant) return null;
  return { assetId: asset.id, name: asset.name, variantId: variant.id, kind: asset.kind, entry: variant.entry,
    files: variant.files.map(item => ({ path: item.path, bytes: item.bytes, mime: item.mime })),
    metadata: variant.metadata, canvas: variant.canvas, provider: variant.groupCapabilities?.resolver ?? null,
    ...(variant.typeData ? { typeData: structuredClone(variant.typeData) } : {}) };
}

function* compileSteps(input: CompileInput): Generator<void, CompileResult> {
  const configurations = compilePluginConfigurations(input);
  const issues: Issue[] = [...configurations.issues];
  const languages = ProjectLanguagesSchema.safeParse(input.project.languages);
  if (!languages.success) issues.push(problem('PROJECT_LANGUAGES', languages.error.issues.map(issue => issue.message).join('；')));
  else for (const locale of languages.data.menus) if (!(BuiltinPlayerMenuLocales as readonly string[]).includes(locale))
    issues.push(problem('PROJECT_MENU_LOCALE', `Player menu language ${locale} is unavailable`));
  for (const [index, clip] of (input.project.display.startupSequence?.clips ?? []).entries()) {
    if (!['image', 'video'].includes(clip.kind)) continue;
    const asset = input.assets.find(asset => asset.id === clip.assetId);
    const source = input.assetReferences?.find(reference => reference.assetId === clip.assetId && reference.source?.field?.includes(`/startupSequence/clips/${index}/`))?.source;
    if (!asset || asset.kind !== clip.kind) { issues.push(problem('STARTUP_ASSET_KIND', `Startup clip ${clip.name} needs a ${clip.kind} resource`, source)); continue; }
    const duration = asset.variants.find(variant => variant.id === asset.activeVariantId)?.metadata.durationSec;
    if (clip.kind === 'video' && duration !== undefined && (clip.startSec >= duration || clip.endSec !== null && clip.endSec > duration))
      issues.push(problem('STARTUP_VIDEO_RANGE', `Startup clip ${clip.name} exceeds its source duration`, source));
  }
  for (const reference of input.assetReferences ?? []) if (!input.assets.some(asset => asset.id === reference.assetId && (reference.variantId === null || asset.variants.some(variant => variant.id === reference.variantId))))
    issues.push(problem('PLUGIN_CONFIG_ASSET_MISSING', `Referenced asset ${reference.assetId} is unavailable`, reference.source, reference.required ? 'error' : 'warning'));
  const sceneDocuments = input.documents.filter(item => item.kind === 'scene');
  const parses: ParseResult[] = [];
  for (const document of sceneDocuments) {
    parses.push(yield* parseSteps(document));
    if (input.signal?.aborted) return { snapshot: null, issues: [problem('COMPILE_CANCELLED', 'Compilation was cancelled')], parses, symbols: { statements: {}, labels: {}, objects: {}, variables: [], assets: [] } };
    yield;
  }
  const symbols: SymbolIndex = { statements: {}, labels: {}, objects: {}, variables: structuredClone([...input.variables, ...input.scenes.flatMap(scene => scene.locals)]), assets: input.assets.map(asset => asset.id) };
  for (const [index, parsed] of parses.entries()) for (const node of parsed.cst) if (node.id) {
    const document = sceneDocuments[index]!;
    if (symbols.statements[node.id]) issues.push(problem('STATEMENT_DUPLICATE', 'Statement ID is duplicated across scenes', sourceAt(document, node)));
    symbols.statements[node.id] = sourceAt(document, node);
    const args = node.object?.value;
    if (record(args) && node.command === 'label' && typeof args.labelId === 'string') {
      if (symbols.labels[args.labelId]) issues.push(problem('LABEL_DUPLICATE', 'Label ID is duplicated across scenes', sourceAt(document, node)));
      symbols.labels[args.labelId] = sourceAt(document, node, node.fields.find(field => field.key === 'labelId'), 'labelId');
    }
    if (record(args) && ['changeBg', 'changeFigure', 'changeIllustration'].includes(node.command) && (args.op ?? 'show') === 'show' && typeof args.objectId === 'string') symbols.objects[args.objectId] = sourceAt(document, node, node.fields.find(field => field.key === 'objectId'), 'objectId');
  }
  if (input.signal?.aborted) return { snapshot: null, issues: [problem('COMPILE_CANCELLED', 'Compilation was cancelled')], parses, symbols };
  if (input.projectId !== input.project.projectId || input.engineVersion !== input.project.engineVersion || input.engineVersion !== input.lock.engine.version) issues.push(problem('VERSION_MISMATCH', 'Project, engine and lock versions differ'));
  let registry: ReadonlyMap<string, CommandSpec>;
  try { registry = createCommandRegistry(input.engineVersion, input.pluginCommands); }
  catch (error) { issues.push(problem('CONTRIBUTION_CONFLICT', String(error))); registry = createCommandRegistry(input.engineVersion); }
  for (const spec of input.pluginCommands ?? []) {
    const provider = spec.key.split('/')[0];
    const locked = input.lock.plugins.find(item => item.id === provider && item.version === spec.version);
    if (!locked) issues.push(problem('PLUGIN_VERSION', `Command ${spec.key} is not provided by its locked version`));
  }
  const sourceMap: SourceMapEntry[] = [];
  const labels = new Map<Id, Set<Id>>();
  for (const scene of input.scenes) labels.set(scene.id, new Set());
  for (const [index, parsed] of parses.entries()) {
    const sceneId = input.documents.filter(item => item.kind === 'scene')[index]?.sceneId;
    if (!sceneId) continue;
    for (const node of parsed.cst) if (node.command === 'label' && record(node.object?.value) && typeof node.object.value.labelId === 'string') {
      const set = labels.get(sceneId);
      if (set?.has(node.object.value.labelId)) issues.push(problem('LABEL_DUPLICATE', 'Duplicate label ID', sourceAt(input.documents.filter(item => item.kind === 'scene')[index]!, node)));
      set?.add(node.object.value.labelId);
    }
  }
  const scenes: CompiledScene[] = [];
  for (const scene of input.scenes) {
    for (const parameter of scene.parameters) {
      const local = scene.locals.find(value => value.id === parameter.variableId && value.scope === 'local');
      if (!local || parameter.defaultValue !== null && !hasSceneParameterDefault(parameter, local)) {
        const document = sceneDocuments.find(document => document.sceneId === scene.id);
        issues.push(problem('SCENE_PARAMETER', `Parameter ${parameter.variableId} needs a local declaration and a type-correct finite default when provided`, document ? { documentId: document.documentId, revision: document.revision } : undefined));
      }
    }
    if (input.signal?.aborted) return { snapshot: null, issues: [problem('COMPILE_CANCELLED', 'Compilation was cancelled')], parses, symbols };
    const index = sceneDocuments.findIndex(document => document.sceneId === scene.id);
    if (index < 0) { issues.push(problem('SCENE_SCRIPT_MISSING', `Scene ${scene.id} has no script`)); continue; }
    const document = sceneDocuments[index]!;
    const parsed = parses[index]!;
    issues.push(...parsed.issues);
    const instructions: Instruction[] = [];
    const sceneLabels: Record<Id, Id> = {};
    for (const [nodeIndex, node] of parsed.cst.entries()) {
      if (nodeIndex && nodeIndex % 32 === 0) {
        yield;
        if (input.signal?.aborted) return { snapshot: null, issues: [problem('COMPILE_CANCELLED', 'Compilation was cancelled')], parses, symbols };
      }
      if (!node.valid || !node.object || !node.id) continue;
      const spec = registry.get(node.command);
      if (!spec) { issues.push(problem(node.command.includes('/') ? 'PLUGIN_MISSING' : 'COMMAND_UNKNOWN', `Command ${node.command} is unavailable`, sourceAt(document, node))); continue; }
      const args = validateCommand(node, document, spec, input, scene, labels, sourceMap, issues);
      if (node.command === 'say' && languages.success && record(args.voiceByLocale)) {
        const declared = languages.data.voices;
        if (Object.keys(args.voiceByLocale).length || args.voice) for (const locale of declared) {
          if (!args.voiceByLocale[locale] && !args.voice) issues.push(problem('VOICE_LOCALE_MISSING', `Dialogue has no ${locale} voice; the work default or silence will be used`, sourceAt(document, node, undefined, 'voiceByLocale'), 'warning'));
        }
      }
      if (node.command === 'comment') continue;
      const condition = expr(args.when) ? args.when : typeof args.when === 'boolean' ? { kind: 'literal' as const, value: args.when } : null;
      delete args.when;
      const continuation = ['choose', 'getUserInput', 'video', 'intro'].includes(node.command) || record(args.playback) && args.playback.wait === true ? 'wait' :
        args.cross === true || args.loop === true && ['setComplexAnimation'].includes(node.command) ? 'cross' :
        typeof args.continue === 'boolean' ? args.continue ? 'continue' : 'wait' : spec.continuation;
      const skippable = ['choose', 'getUserInput', 'video'].includes(node.command) ? false : typeof args.skippable === 'boolean' ? args.skippable : record(args.playback) && args.playback.wait === true ? true : spec.skippable;
      delete args.continue; delete args.skippable;
      instructions.push({ statementId: node.id, opcode: node.command, specVersion: spec.version, condition, continuation, skippable, args: args as Json, source: sourceAt(document, node) });
      if (node.command === 'label' && typeof args.labelId === 'string') sceneLabels[args.labelId] = node.id;
    }
    scenes.push({ scene, instructions, labels: sceneLabels });
  }
  const flowInitials: DebugScenario[] = [];
  const initialDocuments = new Set<Id>();
  for (const flow of input.flows) for (const [index, node] of flow.nodes.entries()) {
    const flowDocument = input.documents.find(item => item.kind === 'flow' && (item.flowId === flow.id || item.documentId === flow.id));
    const unlockSource: Source = { documentId: flowDocument?.documentId ?? flow.id, revision: flowDocument?.revision ?? 0, field: `nodes.${index}.unlock` };
    const scenarioId = node.entry.kind === 'initial' ? node.entry.debugScenarioId : null;
    if (scenarioId && !flowInitials.some(scenario => scenario.id === scenarioId)) {
      const referenceSource = { ...unlockSource, field: `nodes.${index}.entry.debugScenarioId` };
      const candidates = (input.debugScenarios ?? []).filter(document => record(document.data) && document.data.id === scenarioId);
      if (candidates.length !== 1) issues.push(problem('FLOW_INITIAL_REFERENCE', `流程节点 ${node.name} 需要唯一的独立初值 ${scenarioId}`, referenceSource));
      else {
        const document = candidates[0]!, checked = DebugScenarioSchema.safeParse(document.data);
        const source = { documentId: document.documentId, revision: document.revision };
        if (!checked.success) issues.push(problem('FLOW_INITIAL_INVALID', `独立初值 ${scenarioId} 不符合 DebugScenario 规格：${checked.error.message}`, source));
        else {
          const scenario = checked.data, dependencies = [input.lock.engine, ...input.lock.plugins, input.lock.template];
          if (scenario.projectId !== input.projectId || scenario.engineVersion !== input.engineVersion ||
            scenario.pluginVersions.length !== dependencies.length || dependencies.some(expected => !scenario.pluginVersions.some(actual =>
              actual.kind === expected.kind && actual.id === expected.id && actual.version === expected.version)))
            issues.push(problem('FLOW_INITIAL_VERSION', `Independent initial state "${scenario.name}" belongs to another project or exact dependency set. Update its selected versions.`, source));
          for (const [field, position] of [['entry', scenario.entry], ['target', scenario.target]] as const) {
            const scene = scenes.find(scene => scene.scene.id === position.sceneId);
            position.statementId ??= scene?.instructions[0]?.statementId ?? null;
            if (!position.statementId || !scene?.instructions.some(instruction => instruction.statementId === position.statementId))
              issues.push(problem('FLOW_INITIAL_POSITION', `独立初值 ${scenario.name} 的${field === 'entry' ? '起点' : '目标'}语句不存在`, { ...source, field }));
          }
          for (const [id, value] of Object.entries(scenario.initialProgress))
            if (!input.variables.some(variable => variable.id === id && variable.scope === 'progress' && typeof value === variable.type))
              issues.push(problem('FLOW_INITIAL_VARIABLE', `独立初值 ${scenario.name} 的进度变量 ${id} 无效`, { ...source, field: `initialProgress.${id}` }));
          for (const id of Object.keys(scenario.pluginInitial)) if (!input.lock.plugins.some(plugin => plugin.id === id))
            issues.push(problem('FLOW_INITIAL_PLUGIN', `独立初值 ${scenario.name} 的插件 ${id} 未列入作品依赖`, { ...source, field: `pluginInitial.${id}` }));
          const instructions = scenes.flatMap(scene => scene.instructions);
          for (const [routeIndex, route] of scenario.route.entries()) {
            const instruction = instructions.find(instruction => instruction.statementId === route.statementId), args = record(instruction?.args) ? instruction.args : {};
            if (instruction?.opcode !== 'choose' || !Array.isArray(args.options) || !args.options.some(option => record(option) && option.id === route.optionId))
              issues.push(problem('FLOW_INITIAL_ROUTE', `独立初值 ${scenario.name} 的路线选项不存在`, { ...source, field: `route.${routeIndex}` }));
          }
          for (const [inputIndex, playerInput] of scenario.playerInputs.entries()) if (!instructions.some(instruction => instruction.statementId === playerInput.statementId && instruction.opcode === 'getUserInput'))
            issues.push(problem('FLOW_INITIAL_INPUT', `独立初值 ${scenario.name} 的输入语句不存在`, { ...source, field: `playerInputs.${inputIndex}` }));
          flowInitials.push(structuredClone(scenario)); initialDocuments.add(document.documentId);
        }
      }
    }
    const declaringScenes = new Set<Id>();
    let missingLocal = false;
    for (const reference of variableReads(node.unlock)) if (reference.scope === 'local') {
      const declaration = input.scenes.filter(scene => scene.locals.some(local => local.id === reference.id) || scene.parameters.some(parameter => parameter.variableId === reference.id));
      if (declaration.length !== 1) missingLocal = true;
      else declaringScenes.add(declaration[0]!.id);
    }
    if (missingLocal || declaringScenes.size > 1) {
      issues.push(problem('FLOW_UNLOCK_SCOPE', `Flow node ${node.name} uses missing or mixed scene locals`, unlockSource));
      continue;
    }
    const declaringScene = input.scenes.find(scene => scene.id === [...declaringScenes][0]);
    try { if (expressionType(node.unlock, { variables: input.variables, locals: declaringScene?.locals, conditions: input.pluginConditions }) !== 'boolean') issues.push(problem('FLOW_UNLOCK_TYPE', 'Flow unlock must be boolean', unlockSource)); }
    catch (error) { issues.push(problem('FLOW_UNLOCK_TYPE', String(error), unlockSource)); }
  }
  for(const entry of input.gallery){
    const expected=entry.kind==='cg'?'image':entry.kind==='music'?'audio':'video';
    const ids=entry.kind==='cg'?(entry.differences??[]).map(difference=>difference.assetId):entry.assets;
    if(!ids.length||ids.some(id=>!input.assets.some(asset=>asset.id===id&&asset.kind===expected)))issues.push({...problem('GALLERY_ASSET',`鉴赏条目 ${entry.name} 需要有效的 ${expected} 素材`),entity:{kind:'gallery',id:entry.id}});
    if(entry.cover&&!input.assets.some(asset=>asset.id===entry.cover&&asset.kind==='image'))issues.push({...problem('GALLERY_COVER',`鉴赏条目 ${entry.name} 的封面图片不可用`),entity:{kind:'gallery',id:entry.id}});
  }
  const fixed: {assetId:Id;variantId:Id|null}[] = [];
  const media = (reference: {assetId:Id;variantId:Id|null}, kind:string, description:string) => {
    const asset=input.assets.find(item=>item.id===reference.assetId),variant=asset?.variants.find(item=>item.id===(reference.variantId??asset.activeVariantId));
    if(!asset||asset.kind!==kind||!variant)issues.push(problem('ENTRY_ASSET',`${description} 的${kind}素材或固定版本不可用`));
    fixed.push(reference);
  };
  for(const owner of [...input.project.chapters,...input.scenes]) {
    const interlude=owner.presentation?.interlude;if(!interlude)continue;
    media(interlude.image,'image',owner.name);if(interlude.voice)media(interlude.voice,'audio',owner.name);
    for(const transition of [interlude.oldStageExit,interlude.enter,interlude.exit,interlude.newStageEnter])if(transition.preset==='custom'&&transition.resourceId)media({assetId:transition.resourceId,variantId:null},'animation',owner.name);
  }
  const afterstoryIds=new Set<Id>();
  for(const character of input.characters){
    const ids=new Set<Id>();for(const difference of character.differences??[]){
      if(ids.has(difference.id))issues.push(problem('CHARACTER_DIFFERENCE_ID',`${character.name} 的差分身份重复`));ids.add(difference.id);
      media(difference.figure,'image',`${character.name} / ${difference.name}`);if(difference.avatar?.kind==='image')media(difference.avatar,'image',`${character.name} / ${difference.name} 头像`);
    }
    if(character.initialDifferenceId&&!ids.has(character.initialDifferenceId))issues.push(problem('CHARACTER_DIFFERENCE_INITIAL',`${character.name} 的初始差分不存在`));
    const entry=character.afterstory;if(!entry)continue;
    if(character.narrativeRole!=='main')issues.push(problem('AFTERSTORY_ROLE',`${character.name} 的普通后日谈需要个人路线主角色身份`));
    if(afterstoryIds.has(entry.id))issues.push(problem('AFTERSTORY_ID','后日谈入口身份重复'));afterstoryIds.add(entry.id);
    const scene=scenes.find(item=>item.scene.id===entry.entry.sceneId);
    if(!scene||entry.entry.labelId&&!scene.labels[entry.entry.labelId])issues.push(problem('AFTERSTORY_ENTRY',`${character.name} 的后日谈起点不可用`));
    if(entry.unlockEndingIds.some(id=>!character.personalRoute?.endingIds.includes(id)))issues.push(problem('AFTERSTORY_ENDING',`${character.name} 的后日谈解锁结局不属于个人路线`));
    for(const [id,value]of Object.entries(entry.initialProgress))if(!input.variables.some(variable=>variable.id===id&&variable.scope==='progress'&&typeof value===variable.type))issues.push(problem('AFTERSTORY_VARIABLE',`${character.name} 的后日谈初始变量无效`));
    if(entry.presentation)media(entry.presentation.figure,'image',`${character.name} 后日谈立绘`);
  }
  const assets = input.assets.map(asset => resolveAsset(asset));
  for (const reference of [...(input.assetReferences ?? []),...fixed]) {
    if (reference.variantId === null || assets.some(asset => asset?.assetId === reference.assetId && asset.variantId === reference.variantId)) continue;
    const asset = input.assets.find(asset => asset.id === reference.assetId);
    const resolved = asset && resolveAsset(asset, reference.variantId);
    if (resolved) assets.push(resolved);
  }
  if (assets.some(asset => asset === null)) issues.push(problem('ASSET_VARIANT_MISSING', 'An active asset variant is unavailable'));
  if (issues.some(item => item.severity === 'error')) return { snapshot: null, issues, parses, symbols };
  const snapshot: Snapshot = {
    schemaVersion: 1, snapshotId: createId(input), projectId: input.projectId, releaseVersion: input.project.releaseVersion,
    engineVersion: input.engineVersion, lock: structuredClone(input.lock),
    documents: [...input.documents.map(item => ({ documentId: item.documentId, revision: item.revision })),
      ...(input.entityVersions ?? []).filter(item => item.ref.kind === 'document' && !input.documents.some(document => document.documentId === item.ref.id) &&
        (!(input.debugScenarios ?? []).some(document => document.documentId === item.ref.id) || initialDocuments.has(item.ref.id)))
        .map(item => ({ documentId: item.ref.id, revision: item.revision })),
      ...(input.debugScenarios ?? []).filter(item => initialDocuments.has(item.documentId) && !input.documents.some(document => document.documentId === item.documentId) && !(input.entityVersions ?? []).some(version => version.ref.kind === 'document' && version.ref.id === item.documentId))
        .map(item => ({ documentId: item.documentId, revision: item.revision })),
      ...(input.pluginConfigDocuments ?? []).filter(item => !input.documents.some(document => document.documentId === item.documentId) && !(input.entityVersions ?? []).some(version => version.ref.kind === 'document' && version.ref.id === item.documentId))
        .map(item => ({ documentId: item.documentId, revision: item.revision }))],
    project: structuredClone(input.project), scenes, characters: structuredClone(input.characters), variables: structuredClone(input.variables),
    assets: assets.filter((asset): asset is ResolvedAsset => asset !== null), gallery: structuredClone(input.gallery), flows: structuredClone(input.flows), flowInitials,
    template: (() => {
      const template = structuredClone(input.template);
      for (const { pluginId, messages } of input.pluginMessages ?? []) for (const [locale, strings] of Object.entries(messages)) {
        const translated = template.locales[locale] ??= {};
        for (const [key, value] of Object.entries(strings)) if (key.startsWith(`${pluginId}/`)) translated[key] ??= value;
      }
      return template;
    })(), pluginDocuments: configurations.configs, sourceMap,
  };
  const checked = SnapshotSchema.safeParse(snapshot);
  if (!checked.success) return { snapshot: null, issues: [...issues, problem('SNAPSHOT_INVALID', checked.error.message)], parses, symbols };
  return { snapshot: deepFreeze(checked.data), issues, parses, symbols: deepFreeze(symbols) };
}
export function compile(input: CompileInput): CompileResult {
  const steps = compileSteps(input);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}
export async function compileAsync(input: CompileInput): Promise<CompileResult> {
  const steps = compileSteps(input);
  let next = steps.next();
  while (!next.done) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    if (input.signal?.aborted) return { snapshot: null, issues: [problem('COMPILE_CANCELLED', 'Compilation was cancelled')], parses: [], symbols: { statements: {}, labels: {}, objects: {}, variables: [], assets: [] } };
    next = steps.next();
  }
  return next.value;
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
