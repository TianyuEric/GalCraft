import { z } from 'zod';
import { IdSchema, JsonSchema, VersionRefSchema } from '@galcraft/contracts';

const key = z.string().min(1), keys = z.array(key), scope = z.strictObject({ pageId: IdSchema, componentId: IdSchema.nullable() });
export const UIPatchProposalSchema = z.strictObject({
  summary: z.string(),
  config: z.array(scope.extend({key, path:key, operation:z.enum(['set','clear']), value:JsonSchema, dependsOn:keys})),
  styles: z.array(z.strictObject({key,styleId:IdSchema.nullable(),name:z.string(),scope,language:z.enum(['css','scss']),source:z.string(),dependsOn:keys})),
  assets: z.array(z.strictObject({key,source:z.discriminatedUnion('kind',[
    z.strictObject({kind:z.literal('existing'),assetId:IdSchema,variantId:IdSchema}),z.strictObject({kind:z.literal('candidate'),key}),
  ]),use:z.enum(['icon','frame','background','texture','logo','decoration'])})),
});
export const UICompositionInputSchema = z.strictObject({
  id:IdSchema.optional(),revision:z.number().int().nonnegative().optional(),candidateId:IdSchema,proposal:UIPatchProposalSchema,
  resources:z.array(z.strictObject({key,taskId:IdSchema,candidateId:IdSchema,artifactIndex:z.number().int().nonnegative()})),
});
export const UICompositionSelectionSchema = z.strictObject({
  compositionId:IdSchema,expectedCompositionRevision:z.number().int().positive(),changeKeys:keys,assetKeys:keys,
  substitutions:z.array(z.strictObject({key,assetId:IdSchema,variantId:IdSchema})),expected:z.array(VersionRefSchema),
  previewId:IdSchema.optional(),
});
