import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { PluginManifest } from '../contracts/manifest.js';

/** File revisions avoid reparsing/copying unchanged emitted packages; no content digest. */
export async function packageFileRevisions(directory: string, manifest: PluginManifest) {
  return Promise.all(['manifest.json', ...manifest.files.map(file => file.path)].map(async path => {
    const value = await stat(join(directory, path));
    if (!value.isFile()) throw new Error(`插件文件不可用：${path}`);
    return { path, size: value.size, modified: value.mtimeMs, changed: value.ctimeMs };
  }));
}
