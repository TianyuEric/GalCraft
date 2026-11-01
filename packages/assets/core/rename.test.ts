import { expect, it } from 'vitest';
import { FixtureAsset, FixtureVoiceAssets, FixtureIds } from '@galcraft/contracts/fixtures';
import { AssetCatalog, createAssetIndex } from './catalog.js';

it('previews and commits only the template stem while preserving each selected suffix and stable versions', () => {
  const image = { ...structuredClone(FixtureAsset), name: '立绘.final.PNG' };
  const audio = { ...structuredClone(FixtureVoiceAssets[0]!), name: '配音.ogg' };
  const index = createAssetIndex(FixtureIds.projectA); index.data.assets = [image, audio];
  const catalog = new AssetCatalog(index), assetIds = [image.id, audio.id];
  const result = catalog.planBatchRename({ assetIds, template: '故事 {number}', values: new Map(assetIds.map(id => [id, { chapter:'',character:'',usage:'' }])) });
  expect(result.ok).toBe(true); if (!result.ok) return;
  expect(result.value.names.map(value => value.after)).toEqual(['故事 1.PNG','故事 2.ogg']);
  expect(result.value.conflicts).toEqual([]);
  expect(catalog.get(image.id)).toEqual(image);
  expect(catalog.get(audio.id)).toEqual(audio);
  expect(JSON.stringify(result.value.edit)).toContain('故事 1.PNG');
});
