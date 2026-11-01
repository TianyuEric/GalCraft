import { afterEach, expect, it } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { collectEngineConversions } from './engine-conversions.mjs';
const directories = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
it('collects declared module and URL dependencies without copying unrelated runtime files', async () => {
  const directory = resolve('../../tmp/testing/conversion-closure', randomUUID()); directories.push(directory); await mkdir(directory, { recursive: true });
  const contents = { 'upgrade.mjs': 'import { convert } from "./state.mjs"; export { convert }; const data = new URL("./table.json", import.meta.url);',
    'state.mjs': 'export const convert = state => state;', 'table.json': '{}', 'unused.mjs': '' };
  for (const [path, text] of Object.entries(contents)) await writeFile(join(directory, path), text);
  const engine = { directory, manifest: { conversions: [{ entry: 'upgrade.mjs' }], files: Object.entries(contents).map(([path, text]) => ({ path, size: Buffer.byteLength(text) })) } };
  expect((await collectEngineConversions(engine)).map(file => file.path)).toEqual(['runtime/engine-upgrade/upgrade.mjs', 'runtime/engine-upgrade/state.mjs', 'runtime/engine-upgrade/table.json']);
  engine.manifest.files = engine.manifest.files.filter(file => file.path !== 'state.mjs');
  await expect(collectEngineConversions(engine)).rejects.toThrow('state.mjs');
});
