import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AssetSchema, RelativePathSchema, createId } from '@galcraft/contracts';
import type { Asset, Id } from '@galcraft/contracts';
import { assetFilePath, indexEdit } from './catalog.js';
import { AssetTypeRegistry } from './type-registry.js';
import type { AssetIndex } from './types.js';

/** Prepare independent exact variants without committing the M04 index. The caller joins its edit to M02. */
export async function prepareTemplateAssets(input: { projectRoot: string; index: AssetIndex; assets: Asset[]; files: Record<string, Uint8Array>; types?: AssetTypeRegistry }) {
  const types = input.types ?? new AssetTypeRegistry(), assetMap: Record<Id, Id> = {}, variantMap: Record<Id, Id> = {};
  for (const asset of input.assets) { assetMap[asset.id] = createId(input.index); for (const variant of asset.variants) variantMap[variant.id] = createId(input.index); }
  const mapping = { ...assetMap, ...variantMap }, assets: Asset[] = [];
  for (const original of input.assets) {
    const checked = types.rewriteAsset(original, mapping); if (!checked.ok) throw new Error(`${checked.error.code}: ${checked.error.message}`);
    const asset = checked.value; asset.id = assetMap[original.id]!; asset.revision = 1; asset.characterId = null; asset.sceneIds = []; asset.groupId = null;
    asset.originalVariantId = variantMap[original.originalVariantId]!; asset.activeVariantId = variantMap[original.activeVariantId]!;
    asset.source = { kind: 'template', description: original.source.description, usage: original.source.usage };
    for (let index = 0; index < asset.variants.length; index++) {
      const variant = asset.variants[index]!, source = original.variants[index]!;
      variant.id = variantMap[source.id]!; variant.parentId = source.parentId ? variantMap[source.parentId] ?? null : null;
      if (variant.processing) { variant.processing.inputVariantId = variantMap[variant.processing.inputVariantId] ?? variant.processing.inputVariantId;
        if (variant.processing.settings.kind === 'mask') variant.processing.settings.maskVariantId = variantMap[variant.processing.settings.maskVariantId] ?? variant.processing.settings.maskVariantId; }
      delete variant.metadata.authorDocument;
      for (const file of variant.files) {
        RelativePathSchema.parse(file.path); const oldPath = assetFilePath(original.id, source.id, file.path), bytes = input.files[oldPath];
        if (!bytes || bytes.length !== file.bytes) throw new Error(`TEMPLATE_ASSET_FILE_MISSING: ${oldPath}`);
        const rewritten = types.rewriteFile(original.kind, source, file.path, bytes, mapping); if (!rewritten.ok) throw new Error(`${rewritten.error.code}: ${rewritten.error.message}`);
        const path = join(input.projectRoot, assetFilePath(asset.id, variant.id, file.path));
        await mkdir(dirname(path), { recursive: true }); await writeFile(path, rewritten.value); file.bytes = rewritten.value.length;
      }
    }
    assets.push(AssetSchema.parse(asset));
  }
  const prepared = indexEdit(input.index, [...input.index.data.assets, ...assets], assets.map(asset => asset.id));
  if (!prepared.ok) throw new Error(`${prepared.error.code}: ${prepared.error.message}`);
  return { assetMap, variantMap, assets, ...prepared.value };
}
