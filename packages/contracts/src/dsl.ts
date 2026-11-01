import { z } from 'zod';
import { AssetKindSchema } from './assets.js';
import { EntityKindSchema, IdSchema, JsonSchema, ScalarSchema, VersionSchema } from './common.js';
import type { AssetKind, EntityKind, Id, Json, Scalar, Version } from './index.js';

export type Expr =
  | { kind: 'literal'; value: Scalar }
  | { kind: 'input' }
  | { kind: 'variable'; scope: 'progress' | 'local' | 'longTerm'; id: Id }
  | { kind: 'unary'; op: '!' | '-' | '+'; value: Expr }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||'; left: Expr; right: Expr }
  | { kind: 'call'; name: string; args: Expr[] };
export const ExprSchema: z.ZodType<Expr> = z.lazy(() => z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('literal'), value: ScalarSchema }),
  z.strictObject({ kind: z.literal('input') }),
  z.strictObject({ kind: z.literal('variable'), scope: z.enum(['progress', 'local', 'longTerm']), id: IdSchema }),
  z.strictObject({ kind: z.literal('unary'), op: z.enum(['!', '-', '+']), value: ExprSchema }),
  z.strictObject({ kind: z.literal('binary'), op: z.enum(['+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=', '&&', '||']), left: ExprSchema, right: ExprSchema }),
  z.strictObject({ kind: z.literal('call'), name: z.string(), args: z.array(ExprSchema) }),
]));

export const StageStationSchema = z.enum(['left', 'leftQuarter', 'leftThird', 'center', 'rightThird', 'rightQuarter', 'right']);
export type StageStation = z.infer<typeof StageStationSchema>;
export const TargetRefSchema = z.strictObject({ sceneId: IdSchema, labelId: IdSchema.nullable() });
export type TargetRef = z.infer<typeof TargetRefSchema>;
export const ObjectTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('stage') }),
  z.strictObject({ kind: z.literal('object'), id: IdSchema }),
  z.strictObject({ kind: z.literal('station'), station: StageStationSchema }),
]);
export type ObjectTarget = z.infer<typeof ObjectTargetSchema>;
export const FramingSchema = z.strictObject({
  mode: z.enum(['full', 'upper', 'custom']), scale: z.number().finite(), offsetX: z.number().finite(), offsetY: z.number().finite(),
  crop: z.strictObject({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite(), height: z.number().finite() }).nullable(),
});
export type Framing = z.infer<typeof FramingSchema>;

export type ScriptValue = Json | Expr | ScriptValue[] | { [key: string]: ScriptValue };
export const ScriptValueSchema: z.ZodType<ScriptValue> = z.lazy(() => z.union([
  JsonSchema, ExprSchema, z.array(ScriptValueSchema), z.record(z.string(), ScriptValueSchema),
]));
export const CommandDraftSchema = z.strictObject({
  command: z.string(), args: z.record(z.string(), ScriptValueSchema), bindings: z.record(z.string(), z.string()).optional(),
});
export type CommandDraft = z.infer<typeof CommandDraftSchema>;

export type FieldSpec = {
  path: string; label: string; description: string; labelKey?: string; descriptionKey?: string;
  placeholder?: string; placeholderKey?: string; enumLabelKeys?: Record<string, string>;
  type: 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'ref' | 'expression' | 'object' | 'array';
  required: boolean; nullable: boolean; default: Json;
  unit: 'none' | 'ms' | 's' | 'px' | 'deg' | 'percent' | 'ratio';
  min?: number; max?: number; exclusiveMin?: number; enumValues?: string[];
  refKind?: EntityKind; assetKinds?: AssetKind[]; children?: FieldSpec[];
  item?: FieldSpec; minItems?: number; visibleWhen?: Expr; requiredWhen?: Expr;
  group: 'basic' | 'effect' | 'animation' | 'model' | 'advanced';
  summary: boolean; keywords: string[];
};
export const FieldSpecSchema: z.ZodType<FieldSpec> = z.lazy(() => z.strictObject({
  path: z.string(), label: z.string(), description: z.string(), labelKey: z.string().optional(), descriptionKey: z.string().optional(),
  placeholder: z.string().optional(), placeholderKey: z.string().optional(), enumLabelKeys: z.record(z.string(), z.string()).optional(),
  type: z.enum(['string', 'number', 'integer', 'boolean', 'enum', 'ref', 'expression', 'object', 'array']),
  required: z.boolean(), nullable: z.boolean(), default: JsonSchema,
  unit: z.enum(['none', 'ms', 's', 'px', 'deg', 'percent', 'ratio']),
  min: z.number().finite().optional(), max: z.number().finite().optional(), exclusiveMin: z.number().finite().optional(),
  enumValues: z.array(z.string()).optional(), refKind: EntityKindSchema.optional(), assetKinds: z.array(AssetKindSchema).optional(),
  children: z.array(FieldSpecSchema).optional(), item: FieldSpecSchema.optional(), minItems: z.number().int().nonnegative().optional(),
  visibleWhen: ExprSchema.optional(), requiredWhen: ExprSchema.optional(),
  group: z.enum(['basic', 'effect', 'animation', 'model', 'advanced']), summary: z.boolean(), keywords: z.array(z.string()),
}));
export const CommandSpecSchema = z.strictObject({
  key: z.string(), version: VersionSchema, name: z.string(), description: z.string(), nameKey: z.string().optional(), descriptionKey: z.string().optional(), icon: z.string(), category: z.string(),
  keywords: z.array(z.string()), fields: z.array(FieldSpecSchema), continuation: z.enum(['continue', 'wait', 'cross']),
  skippable: z.boolean(), executor: z.string(), targetCapabilities: z.array(z.string()),
  constraints: z.array(z.strictObject({ code: z.string(), fields: z.array(z.string()), message: z.string() })),
});
export type CommandSpec = z.infer<typeof CommandSpecSchema>;
