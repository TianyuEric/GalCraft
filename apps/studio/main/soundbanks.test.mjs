import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SoundBanks, soundBankCatalog } from './soundbanks.mjs';
const testing = fileURLToPath(new URL('../../../tmp/testing/user-data/soundbanks-unit/', import.meta.url));
async function fixtureDirectory(name) { const directory = join(testing, name); await mkdir(directory, { recursive: true }); return directory; }
test('soundbanks list remains offline and missing exact libraries remain diagnosed', async () => {
  const directory = await fixtureDirectory('offline');
  try {
    const banks = new SoundBanks(directory, { fetch() { throw new Error('list must remain offline'); } });
    const listed = await banks.list(); assert.equal(listed.ok, true); assert.equal(listed.value.length, 2); assert.equal(listed.value.every(item => !item.installed), true);
    const absent = await banks.resolve({ id: 'ms-basic', version: '0.1.0' }); assert.equal(absent.ok, false); assert.equal(absent.error.code, 'SOUNDBANK_MISSING');
    assert.equal((await banks.install({ id: 'ms-basic', version: '2.0.0' })).ok, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('partial downloads never replace a complete exact installation', async () => {
  const directory = await fixtureDirectory('partial');
  try {
    const banks = new SoundBanks(directory, { fetch: async () => new Response('partial') });
    assert.equal((await banks.install({ id: 'ms-basic', version: '0.1.0' })).ok, false);
    assert.equal((await banks.list()).value[1].installed, false);
    const entry = soundBankCatalog[1], target = join(directory, entry.id, entry.version); await mkdir(target, { recursive: true });
    const descriptor = { ...entry, notices: [{ name: 'license', text: 'MIT attribution fixture' }] }; delete descriptor.file; delete descriptor.downloadBytes;
    await writeFile(join(target, 'soundbank.json'), JSON.stringify(descriptor));
    await writeFile(join(target, entry.file), 'old complete installation must not be removed before replacement');
    const before = await readFile(join(target, entry.file));
    assert.equal((await banks.install({ id: entry.id, version: entry.version })).ok, false);
    assert.deepEqual(await readFile(join(target, entry.file)), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('explicit local imports keep stable identity, provenance and exact file size across reopening', async () => {
  const directory = await fixtureDirectory('local-import');
  try {
    const source = join(directory, 'supplied.sf2'), fixture = Buffer.alloc(16); fixture.write('RIFF', 0); fixture.writeUInt32LE(8, 4); fixture.write('sfbk', 8); await writeFile(source, fixture);
    const banks = new SoundBanks(join(directory, 'installed'));
    const imported = await banks.import({ path: source, name: '本机音色', license: '作者提供的许可文本', sourceUrl: '本机原创采样' });
    assert.equal(imported.ok, true); assert.match(imported.value.descriptor.id, /^user-/); assert.equal(imported.value.descriptor.license, '作者提供的许可文本');
    const reopened = new SoundBanks(join(directory, 'installed'));
    assert.equal((await reopened.resolve({ id: imported.value.descriptor.id, version: '0.1.0' })).ok, true);
    await writeFile(new URL((await reopened.resolve({ id: imported.value.descriptor.id, version: '0.1.0' })).value.url), fixture.subarray(0, 12));
    assert.equal((await reopened.resolve({ id: imported.value.descriptor.id, version: '0.1.0' })).ok, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
