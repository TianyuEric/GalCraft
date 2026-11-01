import { z } from 'zod';
import { IdSchema, JsonSchema } from './common.js';
import { BackgroundSchema, ComponentConfigSchema, LayoutSchema, UIAnimationSchema, VisualSchema } from './template.js';
import { BasicComponentKindSchema, PageKeySchema, UIInteractionSchema, UIRepeatSchema, UIValueBindingSchema } from './ui.js';
const LayoutChangesSchema = z.strictObject(LayoutSchema.shape).partial();

export const ComponentChangesSchema = z.strictObject({
  name: z.string().optional(), visible: z.boolean().optional(), locked: z.boolean().optional(), visualScale: z.number().finite().positive().optional(),
  layout: LayoutChangesSchema.optional(), normal: VisualSchema.partial().optional(),
  states: z.record(z.enum(['hover', 'pressed', 'focus', 'disabled', 'selected', 'locked', 'empty']), VisualSchema.partial()).optional(),
  content: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean(), z.strictObject({ kind: z.string(), id: IdSchema }), z.null()])).optional(),
  bindings: z.record(z.string(), UIValueBindingSchema).optional(), interactions: z.array(UIInteractionSchema).optional(), repeat: UIRepeatSchema.nullable().optional(),
  options: z.array(z.strictObject({ value: z.string(), label: z.string() })).optional(),
  animations: z.record(z.enum(['enter', 'exit', 'show', 'hide', 'hover', 'focus', 'pressed']), IdSchema).optional(),
});
export const PageEditOperationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('page.create'), id: IdSchema.optional(), key: PageKeySchema, title: z.string(), root: ComponentConfigSchema.optional() }),
  z.strictObject({ kind: z.literal('page.update'), pageId: IdSchema, titleKey: z.string().optional(), background: BackgroundSchema.optional(), layout: LayoutChangesSchema.optional(), localState: z.record(z.string(), JsonSchema).optional() }),
  z.strictObject({ kind: z.literal('page.remove'), pageId: IdSchema }),
  z.strictObject({ kind: z.literal('component.add'), pageId: IdSchema, parentId: IdSchema, index: z.number().int().nonnegative().optional(),
    component: ComponentConfigSchema.optional(), componentKind: BasicComponentKindSchema.optional(), id: IdSchema.optional(), name: z.string().optional(), changes: ComponentChangesSchema.optional() }),
  z.strictObject({ kind: z.literal('component.update'), pageId: IdSchema, componentId: IdSchema, changes: ComponentChangesSchema }),
  z.strictObject({ kind: z.literal('component.text'), pageId: IdSchema, componentId: IdSchema,
    locale: z.string().min(1).describe('The Player menu locale being edited. Other locales keep their original label.'),
    text: z.string().nullable().describe('Static display text for this component and locale. Empty text is an explicit override; null restores the default.') }),
  z.strictObject({ kind: z.literal('component.clear'), pageId: IdSchema, componentId: IdSchema, paths: z.array(z.string().min(1)) }),
  z.strictObject({ kind: z.literal('component.duplicate'), pageId: IdSchema, componentId: IdSchema, parentId: IdSchema.optional(), index: z.number().int().nonnegative().optional() }),
  z.strictObject({ kind: z.literal('component.remove'), pageId: IdSchema, componentIds: z.array(IdSchema).min(1) }),
  z.strictObject({ kind: z.literal('component.reparent'), pageId: IdSchema, componentIds: z.array(IdSchema).min(1), parentId: IdSchema, index: z.number().int().nonnegative().optional() }),
  z.strictObject({ kind: z.literal('component.reorder'), pageId: IdSchema, componentId: IdSchema, index: z.number().int().nonnegative() }),
  z.strictObject({ kind: z.literal('animation.upsert'), animation: UIAnimationSchema }),
  z.strictObject({ kind: z.literal('animation.remove'), animationId: IdSchema, unbind: z.boolean().optional() }),
  z.strictObject({ kind: z.literal('style.remove'), styleId: IdSchema, unbind: z.boolean().optional() }),
]);
export type PageEditOperation = z.infer<typeof PageEditOperationSchema>;
export const PageEditInputSchema = z.strictObject({ label: z.string().min(1), operations: z.array(PageEditOperationSchema).min(1) });
export type PageEditInput = z.infer<typeof PageEditInputSchema>;
export const StyleEditInputSchema = z.strictObject({
  label: z.string().min(1), styleId: IdSchema.optional(), name: z.string().min(1), pageId: IdSchema, componentId: IdSchema.nullable(),
  language: z.enum(['css', 'scss']), activation: z.enum(['page', 'command']), source: z.string(),
});
export type StyleEditInput = z.infer<typeof StyleEditInputSchema>;
