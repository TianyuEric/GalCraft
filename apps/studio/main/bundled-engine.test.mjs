import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { EngineCatalog } from '@galcraft/publishing/engine';
import { installBundledEngine } from './bundled-engine.mjs';

it('refreshes the unpublished 0.1.0 engine while preserving other versions and personal preferences', async () => {
  await mkdir(resolve('../../tmp/testing'), { recursive: true });
  const root = await mkdtemp(resolve('../../tmp/testing/bundled-engine-'));
  const bundle = new EngineCatalog(join(root, 'bundle')), installed = new EngineCatalog(join(root, 'user'));
  const files = ['compiler.mjs', 'web/index.html', 'windows/player.exe', 'release-notes.md'];
  const prepare = async (catalog, version, content) => {
    const directory = join(catalog.directory, version);
    for (const file of files) {
      await mkdir(dirname(join(directory, file)), { recursive: true });
      await writeFile(join(directory, file), content);
    }
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({
      schemaVersion: 1, id: 'galcraft', version, targets: ['web','windows'], projectSchemaVersions:[1],
      saveSchemaVersions:[1], sdkMajor:0, dslVersion:'0.1.0', templateSchemaVersions:[1],
      entries:{compiler:files[0],playerWeb:files[1],playerWindows:files[2],upgrade:null},
      host:{electron:'43.7.0',supportedWindows:['Windows 11 x64'],supportedBrowsers:[]},
      conversions:[],files:files.map(path=>({path,size:Buffer.byteLength(content)})),releaseNotes:files[3],
    }));
  };
  await prepare(bundle, '0.1.0', 'new-player');
  await prepare(installed, '0.1.0', 'old-player');
  await prepare(installed, '2.0.0', 'other');
  await writeFile(join(root, 'user', 'preferences.json'), '{"theme":"blue"}');
  await installBundledEngine(installed, join(root, 'bundle'), '0.1.0');
  expect((await installed.resolveEngine('0.1.0','windows')).ok).toBe(true);
  expect(await readFile(join(installed.directory,'0.1.0','windows/player.exe'),'utf8')).toBe('new-player');
  expect(await readFile(join(installed.directory,'2.0.0','windows/player.exe'),'utf8')).toBe('other');
  expect(await readFile(join(root,'user','preferences.json'),'utf8')).toBe('{"theme":"blue"}');
  await writeFile(join(installed.directory, '0.1.0', 'compiler.mjs'), 'broken');
  expect((await installed.resolveEngine('0.1.0','windows')).ok).toBe(false);
  await installBundledEngine(installed, join(root, 'bundle'), '0.1.0');
  expect((await installed.resolveEngine('0.1.0','windows')).ok).toBe(true);
  await writeFile(join(bundle.directory, '0.1.0', 'compiler.mjs'), 'invalid');
  await expect(installBundledEngine(installed, join(root, 'bundle'), '0.1.0')).rejects.toThrow('Studio 默认引擎不可用');
  expect(await readFile(join(installed.directory,'0.1.0','compiler.mjs'),'utf8')).toBe('new-player');
});
