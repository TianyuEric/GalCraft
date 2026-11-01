import type { Id, Json, Result } from '@galcraft/contracts';
import type { PluginMediaInput } from './services.js';

/** Personal M10 draft transaction. This callback never creates an M02 edit receipt. */
export type ProductionFieldEditorContext = {
  kind: 'production'; operation: { id: string; version: number }; draftId: Id; revision: number;
  fields: Record<string, Json>; references: PluginMediaInput[]; readonly: boolean;
  connection?: { id: Id; name: string; model: string } | null;
  resolveReference(input: { assetId: Id; variantId?: Id }): Promise<Result<PluginMediaInput>>;
  /** Read-only discovery through the current connection's exact provider; never submits generation. */
  inspectConnection?(): Promise<Result<import('@galcraft/contracts').CapabilityReport>>;
  commit(input: { expectedRevision: number; fields: Record<string, Json>; references: PluginMediaInput[] }): Promise<Result<{ revision: number }>>;
};
