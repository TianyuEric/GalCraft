import type { Asset, AssetKind, AssetReference, AssetListIdentity, AssetVariant, Id, Issue, Patch, Ref, ResolvedAsset, Result, Revision, Target, VersionRef } from '@galcraft/contracts';
import type { AssetQuery, AssetPage, AssetIdsResult } from '@galcraft/contracts';
export type { AssetQuery, AssetPage, AssetIdsResult } from '@galcraft/contracts';

export type AssetIndex = { schemaVersion: 1; documentId: Id; revision: Revision; data: { assets: Asset[] } };
export type { AssetListIdentity } from '@galcraft/contracts';
export type { AssetPickerContext, AssetPickerPage, AssetPickerQuery } from '@galcraft/contracts';
export type { AssetPickerResult as PickerResult } from '@galcraft/contracts';
export type AssetCollection = { assets: ResolvedAsset[]; files: { path: string; bytes: number }[];
  references: AssetReference[]; issues: Issue[] };
export type PreparedIndexEdit = { indexPatches: Patch[]; expected: VersionRef[]; requiredRefs: Ref[]; preparedAssets: Id[] };
export type ImportInput = { projectId: Id; files: string[]; fileNames?: string[]; fileTags?: string[][]; fileSources?: Asset['source'][]; fileTypeData?: AssetVariant['typeData'][]; fileAudioPlayback?: ({ loop?: AssetVariant['metadata']['loop']; encoding?: { format: 'opus'; bitrateKbps: 128 } } | undefined)[]; folder: string[]; conflict: 'ask' | 'keepBoth' | 'replace' | 'skip';
  usage: AssetKind | null; targetBinding: Ref | null };
export type ImportItem = { sourcePath: string; result: Result<{ assetId: Id; variantId: Id; preparationId: Id; issues: Issue[] }> };
export type PreparedImport = { preparationId: Id; asset: Asset; files: string[]; variantIds: Id[];
  replaces: Id | null; replacesIndexedAsset: boolean; expectedRevision?: number };
export type ResolveRequest = { assetId: Id; variantId: Id | null; target: Target; usage: string };
export type ResolveResult = { asset: ResolvedAsset; uri: string; capabilities: AssetVariant['groupCapabilities'];
  playback: 'direct' | 'converted'; issues: Issue[] };
