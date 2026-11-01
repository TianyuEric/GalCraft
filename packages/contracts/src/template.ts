import { z } from 'zod';
import { DependencySchema, IdSchema, IssueSchema, JsonSchema, RefSchema, RelativePathSchema, RevisionSchema, VersionSchema } from './common.js';
import { BackgroundFrameSchema, EasingSchema } from './presentation.js';
import { PageKeySchema, UIInteractionSchema, UIRepeatSchema, UIValueBindingSchema } from './ui.js';
import type { UIInteraction, UIRepeat, UIValueBinding } from './ui.js';

const finite = z.number().finite();
const nonnegative = finite.nonnegative();
const opacity = finite.min(0).max(1);
export const UIImageBindingSchema = z.strictObject({
  assetId: IdSchema, variantId: IdSchema, mode: z.enum(['contain', 'cover', 'native', 'nineSlice']),
  positionX: opacity, positionY: opacity, colorMode: z.enum(['original', 'mask']), tint: z.string().nullable(), opacity,
  slices: z.strictObject({ top: nonnegative, right: nonnegative, bottom: nonnegative, left: nonnegative }).nullable(),
  borders: z.strictObject({ top: nonnegative, right: nonnegative, bottom: nonnegative, left: nonnegative }).nullable(), fillCenter: z.boolean(),
});
export type UIImageBinding = z.infer<typeof UIImageBindingSchema>;
export const LengthSchema = z.discriminatedUnion('unit', [
  z.strictObject({ unit: z.literal('px'), value: nonnegative }),
  z.strictObject({ unit: z.literal('percent'), value: nonnegative }),
  z.strictObject({ unit: z.literal('auto') }),
]);
export type Length = z.infer<typeof LengthSchema>;
const PositionLengthSchema = z.discriminatedUnion('unit', [
  z.strictObject({ unit: z.literal('px'), value: finite }),
  z.strictObject({ unit: z.literal('percent'), value: finite }),
]);
export const InsetsSchema = z.strictObject({ top: nonnegative, right: nonnegative, bottom: nonnegative, left: nonnegative });
export type Insets = z.infer<typeof InsetsSchema>;
export const LayoutSchema = z.strictObject({
  position: z.enum(['free', 'flow']).optional(),
  mode: z.enum(['absolute', 'row', 'column', 'grid']), anchorX: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
  anchorY: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
  x: PositionLengthSchema, y: PositionLengthSchema, width: LengthSchema, height: LengthSchema,
  minWidth: nonnegative, minHeight: nonnegative, maxWidth: nonnegative.nullable(), maxHeight: nonnegative.nullable(),
  margin: InsetsSchema, padding: InsetsSchema, gap: nonnegative, align: z.enum(['start', 'center', 'end', 'stretch']),
  justify: z.enum(['start', 'center', 'end', 'spaceBetween']), columns: z.number().int().positive(), z: z.number().int().refine(Number.isSafeInteger),
  overflow: z.enum(['clip', 'scroll', 'visible']), safeArea: z.boolean(),
}).refine(value => (value.maxWidth === null || value.maxWidth >= value.minWidth) && (value.maxHeight === null || value.maxHeight >= value.minHeight));
export type Layout = z.infer<typeof LayoutSchema>;
export const BackgroundSchema = BackgroundFrameSchema.extend({
  imageId: IdSchema.nullable(), imageOpacity: opacity, color: z.string(), colorOpacity: opacity,
});
export type Background = z.infer<typeof BackgroundSchema>;
export const VisualSchema = z.strictObject({
  background: BackgroundSchema, images: z.record(z.string(), UIImageBindingSchema.nullable()),
  fontId: IdSchema.nullable(), fontSize: finite.positive(), color: z.string(), lineHeight: finite.positive(),
  textAlign: z.enum(['start', 'center', 'end']), wrap: z.boolean(), borderColor: z.string(), borderWidth: nonnegative,
  radius: nonnegative, opacity,
  shadow: z.strictObject({ x: finite, y: finite, blur: finite, spread: finite, color: z.string() }).nullable(),
});
export type Visual = z.infer<typeof VisualSchema>;
export type ComponentConfig = {
  id: string; part: string; layout: Layout; visible: boolean; locked: boolean;
  name?: string; visualScale?: number;
  bindings?: Record<string, UIValueBinding>; interactions?: UIInteraction[]; repeat?: UIRepeat;
  options?: { value: string; label: string }[];
  content: Record<string, string | number | boolean | z.infer<typeof RefSchema> | null>;
  normal: Partial<Visual>; states: Partial<Record<'hover' | 'pressed' | 'focus' | 'disabled' | 'selected' | 'locked' | 'empty', Partial<Visual>>>;
  children: ComponentConfig[]; animations: Partial<Record<'enter' | 'exit' | 'show' | 'hide' | 'hover' | 'focus' | 'pressed', string>>;
  plugin?: { key: string; props: z.infer<typeof JsonSchema> };
};
export const ComponentConfigSchema: z.ZodType<ComponentConfig> = z.lazy(() => z.strictObject({
  id: IdSchema, part: z.string(), layout: LayoutSchema, visible: z.boolean(), locked: z.boolean(),
  name: z.string().optional(), visualScale: finite.positive().optional(),
  bindings: z.record(z.string(), UIValueBindingSchema).optional(), interactions: z.array(UIInteractionSchema).optional(), repeat: UIRepeatSchema.optional(),
  options: z.array(z.strictObject({ value: z.string(), label: z.string() })).optional(),
  content: z.record(z.string(), z.union([z.string(), finite, z.boolean(), RefSchema, z.null()])),
  normal: VisualSchema.partial(),
  states: z.strictObject({
    hover: VisualSchema.partial().optional(), pressed: VisualSchema.partial().optional(),
    focus: VisualSchema.partial().optional(), disabled: VisualSchema.partial().optional(),
    selected: VisualSchema.partial().optional(), locked: VisualSchema.partial().optional(), empty: VisualSchema.partial().optional(),
  }),
  children: z.array(ComponentConfigSchema),
  plugin: z.strictObject({ key: z.string().min(1), props: JsonSchema }).optional(),
  animations: z.strictObject({
    enter: IdSchema.optional(), exit: IdSchema.optional(), show: IdSchema.optional(),
    hide: IdSchema.optional(), hover: IdSchema.optional(), focus: IdSchema.optional(), pressed: IdSchema.optional(),
  }),
}));
export const ToolbarLayoutSchema = z.strictObject({
  anchor: z.enum(['bottom', 'right', 'top', 'left']), orientation: z.enum(['row', 'column']),
  enterFrom: z.enum(['left', 'right', 'up', 'down']), exitTo: z.enum(['left', 'right', 'up', 'down']),
  triggerSize: finite, offset: finite, showMs: finite, hideMs: finite, easing: EasingSchema,
});
export type ToolbarLayout = z.infer<typeof ToolbarLayoutSchema>;
export const PageConfigSchema = z.strictObject({
  id: IdSchema, key: PageKeySchema, titleKey: z.string(), layout: LayoutSchema, background: BackgroundSchema,
  root: ComponentConfigSchema, portalRootId: IdSchema, toolbar: ToolbarLayoutSchema.nullable(),
  localState: z.record(z.string(), JsonSchema).optional(),
});
export type PageConfig = z.infer<typeof PageConfigSchema>;
export const UIAnimationSchema = z.strictObject({
  id: IdSchema, name: z.string(), version: z.literal(1),
  segments: z.array(z.strictObject({
    durationMs: finite.min(0), easing: EasingSchema, opacity: opacity.optional(), translateX: finite.optional(),
    translateY: finite.optional(), scale: finite.optional(),
  })),
  reduced: z.enum(['finish', 'fade']),
});
export type UIAnimation = z.infer<typeof UIAnimationSchema>;
export const NamedStyleSchema = z.strictObject({
  id: IdSchema, name: z.string(), scope: z.strictObject({ pageId: IdSchema, componentId: IdSchema.nullable() }),
  enabled: z.boolean().optional(),
  activation: z.enum(['page', 'command']).optional(),
  language: z.enum(['css', 'scss']), sourcePath: RelativePathSchema, sourceRevision: RevisionSchema,
  compiledPath: RelativePathSchema.nullable(), compiledSourceRevision: RevisionSchema.nullable(),
  assets: z.array(IdSchema), issues: z.array(IssueSchema),
});
export type NamedStyle = z.infer<typeof NamedStyleSchema>;
export const ReadingTextStyleSchema = z.strictObject({
  fontId: IdSchema.nullable().optional(), fontSize: finite.positive().optional(),
  color: z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i).optional(),
  bold: z.boolean().optional(), italic: z.boolean().optional(),
});
export type ReadingTextStyle = z.infer<typeof ReadingTextStyleSchema>;
export const ReadingStylesSchema = z.strictObject({ unread: ReadingTextStyleSchema.optional(), read: ReadingTextStyleSchema.optional() });
export type ReadingStyles = z.infer<typeof ReadingStylesSchema>;
export const RuntimeTemplateSchema = z.strictObject({
  id: z.string(), version: VersionSchema, instanceId: IdSchema, features: z.array(z.string()),
  defaultVisual: VisualSchema, pages: z.array(PageConfigSchema), styles: z.array(NamedStyleSchema),
  readingStyles: ReadingStylesSchema.optional(),
  animations: z.array(UIAnimationSchema), locales: z.record(z.string(), z.record(z.string(), z.string())),
  menuDefault: z.string(), dependencies: z.array(DependencySchema),
});
export type RuntimeTemplate = z.infer<typeof RuntimeTemplateSchema>;
/** Normal loading removes the explicitly retired field; the public schema stays exact. */
export function normalizeRuntimeTemplate(value:unknown):RuntimeTemplate {
  if(!value||typeof value!=='object'||Array.isArray(value))return RuntimeTemplateSchema.parse(value);
  const {fallbackFonts:_retired,...current}=value as Record<string,unknown>;
  return RuntimeTemplateSchema.parse(current);
}

/** Exact adopted content belongs to the work, independently of an installed package. */
export const TemplateSourceRecordSchema = z.strictObject({
  schemaVersion: z.literal(1), source: RuntimeTemplateSchema,
  identities: z.record(IdSchema, IdSchema), sourceFiles: z.record(RelativePathSchema, z.string()),
  hiddenPages: z.array(PageConfigSchema),
  hiddenStyles:z.array(NamedStyleSchema).optional(),hiddenAnimations:z.array(UIAnimationSchema).optional(),hiddenLocales:z.record(z.string(),z.record(z.string(),z.string())).optional(),
});
export type TemplateSourceRecord = z.infer<typeof TemplateSourceRecordSchema>;
export function normalizeTemplateSourceRecord(value:unknown):TemplateSourceRecord {
  if(!value||typeof value!=='object'||Array.isArray(value))return TemplateSourceRecordSchema.parse(value);
  const record=value as Record<string,unknown>;
  return TemplateSourceRecordSchema.parse({...record,source:normalizeRuntimeTemplate(record.source)});
}
export const TemplateSwitchOptionsSchema = z.strictObject({
  pageChoices: z.record(z.string(), z.enum(['current', 'incoming'])).optional(),
  resolutions: z.record(z.string(), z.enum(['current', 'incoming'])).optional(),
  missingBaseline: z.enum(['current', 'incoming']).optional(),
  authorStyles: z.enum(['enabled', 'disabled']).optional(),
});
export type TemplateSwitchOptions = z.infer<typeof TemplateSwitchOptionsSchema>;
const TemplateIdentityFields = { id: z.string().min(1), version: VersionSchema };
export const TemplateLibraryInputSchema = z.discriminatedUnion('action', [
  z.strictObject({action:z.literal('list'),offset:z.number().int().nonnegative().optional(),limit:z.number().int().min(1).max(100).optional(),search:z.string().optional()}),
  z.strictObject({action:z.literal('detail'),...TemplateIdentityFields}),
  z.strictObject({action:z.literal('import'),path:z.string().min(1),choice:z.enum(['cancel','copy','update']).optional()}),
  z.strictObject({action:z.literal('export'),...TemplateIdentityFields,path:z.string().min(1)}),
  z.strictObject({action:z.literal('copy'),...TemplateIdentityFields,name:z.string().optional()}),
  z.strictObject({action:z.literal('rename'),...TemplateIdentityFields,name:z.string().min(1)}),
  z.strictObject({action:z.literal('delete'),...TemplateIdentityFields}),
  z.strictObject({action:z.literal('exportCurrent'),path:z.string().min(1),name:z.string().min(1),description:z.string(),includeExamples:z.boolean().optional()}),
]);
export type TemplateLibraryInput = z.infer<typeof TemplateLibraryInputSchema>;
export const TemplateSwitchInputSchema = z.strictObject({ ...TemplateIdentityFields, options: TemplateSwitchOptionsSchema.optional(),
  mappings:z.record(z.string(),IdSchema.nullable()).optional() });
export type TemplateSwitchRequest = z.infer<typeof TemplateSwitchInputSchema>;
export type TemplateSwitchResult = {
  planId: string; template: RuntimeTemplate; sourceRecord: TemplateSourceRecord; files: Record<string,string>;
  conflicts: {path:string;kind:'field'|'missingBaseline'|'reference';before:unknown;current:unknown;incoming:unknown;resolution:'current'|'incoming'|null}[];
  changes: {path:string;outcome:'current'|'incoming'|'conflict';before:unknown;current:unknown;incoming:unknown}[];
  blocked:boolean;keptFields:string[];replacedFields:string[];addedPages:string[];hiddenPages:string[];
  dependencies:RuntimeTemplate['dependencies'];requiredEntrances:string[];edit:import('./documents.js').EditInput|null;
};
