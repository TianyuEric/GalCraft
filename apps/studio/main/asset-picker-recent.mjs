import { createId } from '@galcraft/contracts';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { AssetKindSchema, BuiltinAssetKindSchema, IdSchema } from '@galcraft/contracts';

export class AssetPickerRecent {
  constructor(userData) { this.root = join(userData, 'asset-picker'); }
  path(projectId) { return join(this.root, `${IdSchema.parse(projectId)}.json`); }
  async read(projectId) {
    let value;
    try { value = JSON.parse(await readFile(this.path(projectId), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
    const kinds = [...new Set([...BuiltinAssetKindSchema.options, ...Object.keys(value).filter(kind => AssetKindSchema.safeParse(kind).success)])];
    return Object.fromEntries(kinds.map(kind => [kind,
      [...new Set((value[kind] ?? []).filter(id => IdSchema.safeParse(id).success))].slice(0, 30)]));
  }
  async write(projectId, value) {
    await mkdir(this.root, { recursive: true });
    const path = this.path(projectId), staged = `${path}.${createId()}.tmp`;
    await writeFile(staged, JSON.stringify(value), 'utf8');
    await rename(staged, path);
  }
  async record(projectId, assets) {
    const value = await this.read(projectId);
    for (const asset of assets) value[asset.kind] = [asset.id, ...(value[asset.kind] ?? []).filter(id => id !== asset.id)].slice(0, 30);
    await this.write(projectId, value);
  }
  async remove(projectId, assetId) {
    const value = await this.read(projectId);
    for (const kind of Object.keys(value)) value[kind] = value[kind].filter(id => id !== assetId);
    await this.write(projectId, value);
  }
}
