import type { AssetKind, AssetTypeData, AssetVariant, Id, Json, Result } from '@galcraft/contracts';
import type { StudioPluginContext } from './studio.js';

export type AssetEditorTarget =
  | { kind: 'asset'; assetId: Id; variantId: Id; expectedRevision: number; readonly: boolean }
  | { kind: 'command'; documentId: Id; statementId: Id; expectedRevision: number; readonly: boolean }
  | { kind: 'instance'; documentId: Id; objectId: Id; expectedRevision: number; readonly: boolean };
export type AssetEditorContext = {
  target: AssetEditorTarget; kind: AssetKind; typeData: AssetTypeData; value: Json; locale: string;
  resource?: { assetId: Id; variant: AssetVariant };
  signal: AbortSignal; studio: StudioPluginContext;
  commit(value: Json): Promise<Result<void>>;
  onDispose(release: () => void | Promise<void>): void;
};
export type AssetEditorContribution = { key: string; assetType: AssetKind; contexts: AssetEditorTarget['kind'][];
  mount(root: HTMLElement, context: AssetEditorContext): void | (() => void) };
export type AssetPreviewResource = { root: string; entry: string; files: AssetVariant['files']; read(path: string): Promise<Uint8Array> };
export type AssetPreviewContext = {
  source: { kind: 'asset'; assetId: Id } | { kind: 'candidate'; candidateId: Id };
  kind: AssetKind; name: string; variant: AssetVariant; resource: AssetPreviewResource;
  locale: string; signal: AbortSignal; studio: StudioPluginContext;
  onDispose(release: () => void | Promise<void>): void;
};
export type AssetPreviewContribution = { key: string; assetType: AssetKind;
  mount(root: HTMLElement, context: AssetPreviewContext): void | (() => void) | Promise<void | (() => void)> };
export type AssetThumbnailContribution = AssetPreviewContribution;
