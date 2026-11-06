import { describe, expect, it } from 'vitest';
import { type Asset, type Result } from '@galcraft/contracts';
import { FixtureAsset, fixtureId } from '@galcraft/contracts/fixtures';
import { failedAssetPaths, mergeAssetImportResult } from '../../../authoring/asset-import-model.js';
import { createCandidateHost } from '../adapters/candidate-host.js';
import { documentData, envelope } from './documents.js';
import { candidateAssets, createCandidateServices } from './services.js';

const indexPath = 'assets/index.json', resourcesPath = 'candidate/resources.json';
const original = '/practice/backgrounds/spring-station.png';
const retryPath = '/practice/backgrounds/spring-town.png';
const transparent = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function makeHost(assets: Asset[] = [], locations: Record<string, string> = {}) {
  return createCandidateHost([
    envelope(fixtureId(0xd60), indexPath, { assets }),
    envelope(fixtureId(0xd61), resourcesPath, { kind: 'candidate-resources-v1', locations }),
  ]);
}

describe('candidate asset services', () => {
  it('uses the active transparent file in thumbnails, preview, and runtime while preserving explicit original requests', async () => {
    const asset = structuredClone(FixtureAsset);
    const transparentId = fixtureId(0xd62), missingId = fixtureId(0xd63);
    const variant = { ...asset.variants[0]!, parentId: asset.originalVariantId, role: 'transparent' as const,
      entry: 'transparent.png', files: [{ path: 'transparent.png', role: 'primary', bytes: 68, mime: 'image/png' }] };
    asset.activeVariantId = transparentId;
    asset.variants.push({ ...variant, id: transparentId }, { ...variant, id: missingId });
    const host = makeHost([asset], { [asset.id]: original, [`${asset.id}/${transparentId}`]: transparent });
    const assets = createCandidateServices(host).bridge.assets!;

    expect(unwrap(await assets.preview(asset.id))).toMatchObject({ uri: transparent, mime: 'image/png' });
    expect(unwrap(await assets.resolveRuntime(asset.id, transparentId))).toMatchObject({ uri: transparent, mime: 'image/png' });
    expect(unwrap(await assets.thumbnails([
      { assetId: asset.id }, { assetId: asset.id, variantId: asset.originalVariantId }, { assetId: asset.id, variantId: missingId },
    ]))).toEqual([
      { assetId: asset.id, variantId: transparentId, uri: transparent },
      { assetId: asset.id, variantId: asset.originalVariantId, uri: original },
    ]);
    expect(await assets.preview(asset.id, missingId)).toMatchObject({ ok: false });
  });

  it('commits successful imports and adds only failed files on retry', async () => {
    const host = makeHost();
    const services = createCandidateServices(host, 'light', { importPaths: [original, retryPath], failImportOnce: [retryPath] });
    const initial = unwrap(await services.importAssets!(unwrap(await services.pickAssetFiles!())));
    expect(initial.succeeded.map(asset => asset.name)).toEqual(['spring-station.png']);
    expect(initial.failed).toEqual([expect.objectContaining({ path: retryPath, issue: expect.objectContaining({ actions: ['retry'] }) })]);
    expect(candidateAssets(host.list())).toEqual(initial.succeeded);
    expect(host.list().map(document => document.revision)).toEqual([2, 2]);

    const summary = mergeAssetImportResult(initial);
    const retry = unwrap(await services.importAssets!(failedAssetPaths(summary)));
    expect(retry.succeeded.map(asset => asset.name)).toEqual(['spring-town.png']);
    expect(mergeAssetImportResult(retry, summary)).toEqual({ succeeded: 2, failed: [] });
    expect(candidateAssets(host.list())).toEqual([...initial.succeeded, ...retry.succeeded]);
    expect(host.list().map(document => document.revision)).toEqual([3, 3]);
    expect(documentData<{ locations: Record<string, string> }>(host.list(), resourcesPath)?.locations).toEqual({
      [initial.succeeded[0]!.id]: original, [retry.succeeded[0]!.id]: retryPath,
    });
  });
});
