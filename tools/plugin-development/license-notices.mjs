import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { copyDistributionLicenses } from '../studio-runtime-files.mjs';

export async function stageOfficialPluginLicenses(output) {
  const root = resolve(import.meta.dirname, '../..');
  await copyDistributionLicenses(root, output);
  const files = [];
  async function collect(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await collect(join(directory, entry.name), path);
      else if (['LICENSE', 'LICENSING.md', 'THIRD_PARTY_NOTICES.md'].includes(path) || path.startsWith('LICENSES/') || path.includes('/licenses/')) files.push(path);
    }
  }
  await collect(output, '');
  return files;
}
