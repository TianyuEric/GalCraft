import { z } from 'zod';
import { IdSchema, IssueSchema, JsonSchema } from './common.js';

export const OfficialPageKeys = ['title', 'story', 'choice', 'input', 'save', 'load', 'history', 'settings', 'cg', 'music', 'flow', 'characters', 'videoError'] as const;
export type PageKey = (typeof OfficialPageKeys)[number] | string;
export const PageKeySchema = z.string().min(1);
export const OfficialActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('start') }),
  z.strictObject({ kind: z.literal('continue') }),
  z.strictObject({ kind: z.literal('open'), page: PageKeySchema }),
  z.strictObject({ kind: z.literal('back') }),
  z.strictObject({ kind: z.literal('advance') }),
  z.strictObject({ kind: z.literal('toggleUI') }),
  z.strictObject({ kind: z.literal('toggleAuto') }),
  z.strictObject({ kind: z.literal('toggleSkip') }),
  z.strictObject({ kind: z.literal('replayVoice') }),
  z.strictObject({ kind: z.literal('quickSave') }),
  z.strictObject({ kind: z.literal('quickLoad') }),
  z.strictObject({ kind: z.literal('saveSlot'), slotId: IdSchema }),
  z.strictObject({ kind: z.literal('loadSlot'), slotId: IdSchema }),
  z.strictObject({ kind: z.literal('selectOption'), optionId: IdSchema }),
  z.strictObject({ kind: z.literal('submitInput'), text: z.string() }),
  z.strictObject({ kind: z.literal('cancelInput') }),
  z.strictObject({ kind: z.literal('jumpHistory'), historyId: IdSchema }),
  z.strictObject({ kind: z.literal('playHistoryVoice'), historyId: IdSchema }),
  z.strictObject({ kind: z.literal('openCg'), entryId: IdSchema }),
  z.strictObject({ kind: z.literal('nextDifference'), delta: z.union([z.literal(-1), z.literal(1)]) }),
  z.strictObject({ kind: z.literal('music'), op: z.enum(['play', 'pause', 'stop', 'seek']), entryId: IdSchema, seconds: z.number().finite().optional() }),
  z.strictObject({ kind: z.literal('enterFlow'), flowId: IdSchema, nodeId: IdSchema }),
  z.strictObject({ kind: z.literal('returnTitle') }),
  z.strictObject({ kind: z.literal('exit') }),
  z.strictObject({ kind: z.literal('toolbarLock'), locked: z.boolean() }),
  z.strictObject({ kind: z.literal('toolbarReveal') }),
  z.strictObject({ kind: z.literal('preference'), path: z.string(), value: JsonSchema }),
  z.strictObject({ kind: z.literal('resetPreferences'), paths: z.array(z.string()) }),
  z.strictObject({ kind: z.literal('exportData'), scopes: z.array(z.string()) }),
  z.strictObject({ kind: z.literal('importData'), planId: IdSchema }),
  z.strictObject({ kind: z.literal('clearData'), scopes: z.array(z.enum(['saves', 'longTerm', 'preferences'])) }),
  z.strictObject({ kind: z.literal('emergency'), enabled: z.boolean() }),
  z.strictObject({ kind: z.literal('videoRetry') }),
  z.strictObject({ kind: z.literal('confirm'), requestId: IdSchema, accepted: z.boolean(), remember: z.boolean() }),
]);
export type OfficialAction = z.infer<typeof OfficialActionSchema>;

export const BasicComponentKinds = ['container', 'text', 'image', 'button', 'decoration', 'input', 'slider', 'toggle', 'select', 'tabs', 'list'] as const;
export const BasicComponentKindSchema = z.enum(BasicComponentKinds);
export type BasicComponentKind = z.infer<typeof BasicComponentKindSchema>;
export const UIValueBindingSchema = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('literal'), value: JsonSchema }),
  z.strictObject({ source: z.literal('variable'), variableId: IdSchema, scope: z.enum(['progress', 'local', 'longTerm']), missingText: z.string().optional() }),
  z.strictObject({ source: z.enum(['data', 'local', 'item', 'event']), path: z.string().min(1) }),
]);
export type UIValueBinding = z.infer<typeof UIValueBindingSchema>;
export type UICondition = { op: 'truthy'; value: UIValueBinding } | { op: 'equals' | 'notEquals' | 'greater' | 'less'; left: UIValueBinding; right: UIValueBinding }
  | { op: 'all' | 'any'; conditions: UICondition[] } | { op: 'not'; condition: UICondition };
export const UIConditionSchema: z.ZodType<UICondition> = z.lazy(() => z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('truthy'), value: UIValueBindingSchema }),
  z.strictObject({ op: z.enum(['equals', 'notEquals', 'greater', 'less']), left: UIValueBindingSchema, right: UIValueBindingSchema }),
  z.strictObject({ op: z.enum(['all', 'any']), conditions: z.array(UIConditionSchema) }),
  z.strictObject({ op: z.literal('not'), condition: UIConditionSchema }),
]));
export const UIActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('official'), action: OfficialActionSchema, bindings: z.record(z.string(), UIValueBindingSchema).optional() }),
  z.strictObject({ kind: z.literal('open'), page: PageKeySchema }),
  z.strictObject({ kind: z.literal('setLocal'), key: z.string().min(1), value: UIValueBindingSchema }),
  z.strictObject({ kind: z.literal('toggleLocal'), key: z.string().min(1) }),
  z.strictObject({ kind: z.literal('plugin'), key: z.string().min(1), arguments: z.record(z.string(), UIValueBindingSchema) }),
]);
export type UIAction = z.infer<typeof UIActionSchema>;
export const UIInteractionSchema = z.strictObject({
  event: z.enum(['click', 'change', 'input', 'submit', 'focus', 'blur', 'pointerEnter', 'pointerLeave']),
  condition: UIConditionSchema.optional(), actions: z.array(UIActionSchema),
});
export type UIInteraction = z.infer<typeof UIInteractionSchema>;
export const UIRepeatSchema = z.strictObject({ source: UIValueBindingSchema, key: z.string().min(1), emptyText: z.string().optional() });
export type UIRepeat = z.infer<typeof UIRepeatSchema>;
export const NavigationResultSchema = z.strictObject({
  frameId: IdSchema, page: PageKeySchema, focusKey: z.string(), sessionId: IdSchema.nullable(),
  outcome: z.enum(['opened', 'returned', 'awaitingConfirmation', 'completed']), issue: IssueSchema.nullable(),
});
export type NavigationResult = z.infer<typeof NavigationResultSchema>;
