import { z } from 'zod';
import { ResolvedAssetSchema } from './assets.js';
import { DependencySchema, IdSchema, JsonSchema, LockSchema, RelativePathSchema, RevisionSchema, ScalarSchema, SourceSchema, UtcTimeSchema, VersionSchema } from './common.js';
import { ExprSchema } from './dsl.js';
import { PresentationStateSchema } from './presentation.js';
import { DialogueSegmentSchema } from './dialogue.js';
import { CharacterSchema, FlowSchema, GalleryEntrySchema, ProjectSchema, SceneSchema, VariableSchema } from './project.js';
import { RuntimeTemplateSchema } from './template.js';

const finite = z.number().finite();
export const InstructionSchema = z.strictObject({
  statementId: IdSchema, opcode: z.string(), specVersion: VersionSchema, condition: ExprSchema.nullable(),
  continuation: z.enum(['continue', 'wait', 'cross']), skippable: z.boolean(), args: JsonSchema, source: SourceSchema,
});
export type Instruction = z.infer<typeof InstructionSchema>;
export const CompiledSceneSchema = z.strictObject({
  scene: SceneSchema, instructions: z.array(InstructionSchema), labels: z.record(IdSchema, IdSchema),
});
export type CompiledScene = z.infer<typeof CompiledSceneSchema>;
export const SourceMapEntrySchema = z.strictObject({ statementId: IdSchema, field: z.string(), source: SourceSchema });
export type SourceMapEntry = z.infer<typeof SourceMapEntrySchema>;
export const PositionSchema = z.strictObject({ sceneId: IdSchema, statementId: IdSchema.nullable() });
export type Position = z.infer<typeof PositionSchema>;
export const DebugScenarioSchema = z.strictObject({
  schemaVersion: z.literal(1), id: IdSchema, name: z.string(), projectId: IdSchema, entry: PositionSchema, target: PositionSchema,
  initialProgress: z.record(IdSchema, ScalarSchema), pluginInitial: z.record(z.string(), JsonSchema),
  route: z.array(z.strictObject({ statementId: IdSchema, occurrence: z.number().int().nonnegative(), optionId: IdSchema })),
  playerInputs: z.array(z.strictObject({ statementId: IdSchema, occurrence: z.number().int().nonnegative(), text: z.string() })),
  externalPolicy: z.enum(['simulate', 'explicitTest']), engineVersion: VersionSchema, pluginVersions: z.array(DependencySchema),
});
export type DebugScenario = z.infer<typeof DebugScenarioSchema>;
export const SnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1), snapshotId: IdSchema, projectId: IdSchema, releaseVersion: VersionSchema,
  engineVersion: VersionSchema, lock: LockSchema,
  documents: z.array(z.strictObject({ documentId: IdSchema, revision: RevisionSchema })),
  project: ProjectSchema, scenes: z.array(CompiledSceneSchema), characters: z.array(CharacterSchema),
  variables: z.array(VariableSchema), assets: z.array(ResolvedAssetSchema), gallery: z.array(GalleryEntrySchema),
  flows: z.array(FlowSchema), flowInitials: z.array(DebugScenarioSchema).optional(), template: RuntimeTemplateSchema, pluginDocuments: z.record(z.string(), JsonSchema),
  sourceMap: z.array(SourceMapEntrySchema),
}).refine(value => value.projectId === value.project.projectId && value.releaseVersion === value.project.releaseVersion && value.engineVersion === value.project.engineVersion && value.engineVersion === value.lock.engine.version && value.template.id === value.lock.template.id && value.template.version === value.lock.template.version)
  .refine(value => !value.project.player.name || value.characters.some(character => character.id === value.project.player.name!.characterId), { message: '主角姓名绑定的人物不存在', path: ['project', 'player', 'name', 'characterId'] })
  .refine(value => !value.project.player.name?.allowCustom || value.variables.some(variable => variable.id === value.project.player.name!.variableId && variable.scope === 'progress' && variable.type === 'string'), { message: '主角姓名需要绑定字符串进度变量', path: ['project', 'player', 'name', 'variableId'] })
  .refine(value => {
    const referenced = new Set(value.flows.flatMap(flow => flow.nodes.flatMap(node => node.entry.kind === 'initial' ? [node.entry.debugScenarioId] : [])));
    const initials = value.flowInitials ?? [];
    return initials.length === referenced.size && new Set(initials.map(scenario => scenario.id)).size === initials.length &&
      initials.every(scenario => referenced.has(scenario.id) && scenario.projectId === value.projectId && scenario.engineVersion === value.engineVersion);
  }, { message: '流程独立初值需要携带唯一且明确引用的作品配置', path: ['flowInitials'] })
  .refine(value => (value.flowInitials ?? []).every(scenario => {
    const dependencies = [value.lock.engine, ...value.lock.plugins, value.lock.template];
    return scenario.pluginVersions.length === dependencies.length && dependencies.every(expected => scenario.pluginVersions.some(actual =>
      actual.kind === expected.kind && actual.id === expected.id && actual.version === expected.version)) &&
      [scenario.entry, scenario.target].every(position => position.statementId !== null && value.scenes.some(scene => scene.scene.id === position.sceneId &&
        scene.instructions.some(instruction => instruction.statementId === position.statementId))) &&
      Object.entries(scenario.initialProgress).every(([id, initial]) => value.variables.some(variable => variable.id === id && variable.scope === 'progress' && typeof initial === variable.type)) &&
      Object.keys(scenario.pluginInitial).every(id => value.lock.plugins.some(plugin => plugin.id === id));
  }), { message: '流程独立初值的位置、变量或精确依赖无效', path: ['flowInitials'] });
export type Snapshot = z.infer<typeof SnapshotSchema>;
export const EntryMappingSchema = z.strictObject({
  oldRelease: VersionSchema, oldSceneId: IdSchema, oldStatementId: IdSchema,
  newSceneId: IdSchema, newStatementId: IdSchema, reason: z.string(),
});
export type EntryMapping = z.infer<typeof EntryMappingSchema>;
export const FrameSchema = z.strictObject({
  id: IdSchema, sceneId: IdSchema, locals: z.record(IdSchema, ScalarSchema), returnTo: PositionSchema.nullable(),
  receiver: z.strictObject({ scope: z.enum(['progress', 'local']), variableId: IdSchema, frameId: IdSchema.nullable() }).nullable(),
});
export type Frame = z.infer<typeof FrameSchema>;
export const RuntimeStateSchema = z.strictObject({
  pendingReadStatementId: IdSchema.optional(),
  entryPresentation: z.strictObject({ sceneId: IdSchema, instanceId: IdSchema, completed: z.boolean() }).optional(),
  story: z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('main') }),
    z.strictObject({ kind: z.literal('afterstory'), entryId: IdSchema, characterId: IdSchema, title: z.string() })]).optional(),
  position: PositionSchema, phase: z.enum(['entry', 'waiting', 'completed']), occurrence: z.number().int().nonnegative(),
  frames: z.array(FrameSchema), progress: z.record(IdSchema, ScalarSchema),
  route: z.array(z.strictObject({ statementId: IdSchema, occurrence: z.number().int().nonnegative(), optionId: IdSchema })),
  presentation: PresentationStateSchema,
  wait: z.union([
    z.null(), z.strictObject({ kind: z.literal('say'), textShown: z.number().int().nonnegative(), textComplete: z.boolean(), textAnchor: z.number().int().nonnegative() }),
    z.strictObject({ kind: z.literal('choice'), optionIds: z.array(IdSchema), visibleOptionIds: z.array(IdSchema).optional() }),
    z.strictObject({ kind: z.literal('input'), draft: z.string() }),
    z.strictObject({ kind: z.literal('timer'), remainingMs: finite }),
    z.strictObject({ kind: z.literal('animation'), processIds: z.array(IdSchema) }),
    z.strictObject({ kind: z.literal('plugin'), contribution: z.string(), resumeData: JsonSchema,
      page: z.string().optional(), input: JsonSchema.optional() }),
  ]),
  plugins: z.record(z.string(), z.strictObject({ version: VersionSchema, stateVersion: z.number().int().nonnegative(), progress: JsonSchema })),
  playTimeMs: finite,
});
export type RuntimeState = z.infer<typeof RuntimeStateSchema>;
export const StateOriginSchema = z.strictObject({
  releaseVersion: VersionSchema, engineVersion: VersionSchema, dependencyVersions: z.array(DependencySchema),
});
export type StateOrigin = z.infer<typeof StateOriginSchema>;
export const HistoryEntrySchema = z.strictObject({
  segments: z.array(DialogueSegmentSchema).optional(),
  id: IdSchema, position: PositionSchema, occurrence: z.number().int().nonnegative(), speaker: z.string(),
  speakerKind: z.enum(['character', 'narrator']), text: z.string(), textLocale: z.string(),
  voiceAssetId: IdSchema.nullable(), locale: z.string(), entryState: RuntimeStateSchema.nullable(), unavailableReason: z.string().nullable(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export const SaveRecordSchema = StateOriginSchema.extend({
  schemaVersion: z.literal(1), recordId: IdSchema, projectId: IdSchema, createdAt: UtcTimeSchema,
  kind: z.enum(['manual', 'quick', 'auto', 'continue']),
  summary: z.strictObject({ sceneName: z.string(), speaker: z.string(), text: z.string(), playTimeMs: finite }),
  thumbnail: RelativePathSchema.nullable(), state: RuntimeStateSchema, history: z.array(HistoryEntrySchema),
});
export type SaveRecord = z.infer<typeof SaveRecordSchema>;
export const SaveIndexSchema = z.strictObject({
  schemaVersion: z.literal(1), revision: RevisionSchema,
  manual: z.array(z.strictObject({ slotId: IdSchema, order: z.number().int().nonnegative(), recordId: IdSchema.nullable() })),
  quick: z.array(IdSchema), auto: z.array(IdSchema), continueRecordId: IdSchema.nullable(),
  afterstoryRecords: z.record(IdSchema, IdSchema).optional(),
});
export type SaveIndex = z.infer<typeof SaveIndexSchema>;
export const CurrentMainStorySchema = z.strictObject({
  characterId: IdSchema, variableId: IdSchema.nullable(), effectiveName: z.string().trim().min(1), completed: z.boolean(),
});
export type CurrentMainStory = z.infer<typeof CurrentMainStorySchema>;
export const FlowEntryRecordSchema = StateOriginSchema.extend({
  schemaVersion: z.literal(1), projectId: IdSchema, nodeId: IdSchema, unlockedAt: UtcTimeSchema, state: RuntimeStateSchema,
});
export type FlowEntryRecord = z.infer<typeof FlowEntryRecordSchema>;
export const LongTermSchema = z.strictObject({
  schemaVersion: z.literal(2), revision: RevisionSchema, readStatements: z.array(IdSchema), endings: z.array(z.string()),
  afterstoryCompleted: z.array(IdSchema).optional(),
  cg: z.record(IdSchema, z.array(IdSchema)), music: z.array(IdSchema), video: z.array(IdSchema), flowEntries: z.record(IdSchema, FlowEntryRecordSchema),
  variables: z.record(IdSchema, z.strictObject({ value: ScalarSchema, updatedAt: UtcTimeSchema })),
  plugins: z.record(z.string(), z.strictObject({ version: VersionSchema, stateVersion: z.number().int().nonnegative(), data: JsonSchema })),
});
export type LongTerm = z.infer<typeof LongTermSchema>;
