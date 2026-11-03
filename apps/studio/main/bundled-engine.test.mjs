import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { EngineCatalog } from '@galcraft/publishing/engine';
import { installBundledEngine } from './bundled-engine.mjs';
import { bundledEngineVersion } from './bundled-engine-version.mjs';
import { AuthoringPreferences } from './preferences.mjs';
import { ProjectAccess } from './project-access.mjs';
import { ProjectDocuments } from './document-providers.mjs';

const temporaryRoot = resolve('../../tmp/testing');
const roots = [];
async function fixtureRoot() {
  await mkdir(temporaryRoot, { recursive: true });
  const root = await mkdtemp(join(temporaryRoot, 'bundled-engine-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!root.startsWith(temporaryRoot + sep)) throw new Error('Engine fixture cleanup must stay inside tmp/testing');
    await rm(root, { recursive: true, force: true });
  }
});
async function prepare(catalog, version, content) {
  const files = ['compiler.mjs', 'web/index.html', 'windows/player.exe', 'release-notes.md'];
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
}

it('refreshes the selected bundled engine while preserving other versions and personal preferences', async () => {
  const root = await fixtureRoot();
  const bundle = new EngineCatalog(join(root, 'bundle')), installed = new EngineCatalog(join(root, 'user'));
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

it('installs the current bundled engine beside 0.1.0 and creates a project bound to the newest available engine', async () => {
  const root = await fixtureRoot(), userData = join(root, 'user');
  const bundle = new EngineCatalog(join(root, 'bundle')), installed = new EngineCatalog(userData);
  await prepare(bundle, bundledEngineVersion, 'current-player');
  await prepare(installed, '0.1.0', 'previous-player');
  const previous = await readFile(join(installed.directory, '0.1.0', 'manifest.json'));
  const preferences = new AuthoringPreferences(userData), settings = await preferences.readPreferences();
  settings.theme = 'dark'; settings.editor.fontSize = 15;
  await preferences.writePreferences(settings);
  const preferencesBefore = await readFile(join(userData, 'preferences.json'));

  await installBundledEngine(installed, join(root, 'bundle'), bundledEngineVersion);

  expect((await installed.resolveEngine(bundledEngineVersion, 'windows')).ok).toBe(true);
  expect((await installed.resolveEngine('0.1.0', 'windows')).ok).toBe(true);
  expect(await readFile(join(installed.directory, '0.1.0', 'manifest.json'))).toEqual(previous);
  expect(await readFile(join(installed.directory, '0.1.0', 'windows/player.exe'), 'utf8')).toBe('previous-player');
  expect(await readFile(join(userData, 'preferences.json'))).toEqual(preferencesBefore);
  expect(await preferences.readPreferences()).toEqual(settings);
  const versions = await installed.listCreationVersions('web');
  expect(versions.ok).toBe(true);
  expect(versions.value.map(engine => engine.version)).toEqual(['0.1.0', bundledEngineVersion]);
  const selected = versions.value.at(-1).version;
  expect(selected).toBe(bundledEngineVersion);

  const documents = new ProjectDocuments(new ProjectAccess(), undefined, installed);
  try {
    const created = await documents.create({ path: root, name: 'Current engine project', template: 'light', width: 960, height: 540, engineVersion: selected });
    expect(created.ok).toBe(true);
    const projectRoot = join(root, 'Current engine project');
    const project = JSON.parse(await readFile(join(projectRoot, 'project.json'), 'utf8')).data;
    const lock = JSON.parse(await readFile(join(projectRoot, 'dependencies.lock.json'), 'utf8')).data;
    expect(project.engineVersion).toBe(bundledEngineVersion);
    expect(lock.engine.version).toBe(bundledEngineVersion);
    expect((await installed.resolveProjectEngine(project, lock, 'web')).ok).toBe(true);
  } finally {
    if (documents.currentSession) await documents.close(documents.currentSessionId, 'discard');
  }
});
