import { z } from 'zod';
import { IdSchema, RevisionSchema, UtcTimeSchema } from '@galcraft/contracts';
import { WorkflowBindingSchema } from './discovery.js';

/** Personal reusable configuration, independent of project task drafts and executable bindings. */
export const WorkflowConfigurationDraftSchema = z.strictObject({
  schemaVersion: z.literal(1), id: IdSchema, revision: RevisionSchema, name: z.string(),
  workflow: WorkflowBindingSchema.extend({ purpose: WorkflowBindingSchema.shape.purpose.nullable() }),
  paste: z.string(), availableRevision: RevisionSchema.nullable(), updatedAt: UtcTimeSchema,
}).refine(value => value.id === value.workflow.id, 'Workflow draft identity mismatch');
export type WorkflowConfigurationDraft = z.infer<typeof WorkflowConfigurationDraftSchema>;
