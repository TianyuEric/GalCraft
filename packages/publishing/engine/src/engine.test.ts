import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FixtureLock, FixtureProject } from '@galcraft/contracts/fixtures';
import { EngineCatalog } from './catalog.js';
import { EngineManifestSchema, type EngineManifest } from './manifest.js';

const userData = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
  'tmp', 'testing', 'engine-catalog-v');
const catalog = new EngineCatalog(userData);
const files = ['compiler.mjs', 'web/index.html', 'windows/player.exe', 'release-notes.md'];

function manifest(version: string, targets: EngineManifest['targets'] = ['web', 'windows']): EngineManifest {
  return {
    schemaVersion: 1, id: 'galcraft', version, targets,
    projectSchemaVersions: [1], saveSchemaVersions: [1], sdkMajor: 0,
    dslVersion: '0.1.0', templateSchemaVersions: [1],
    entries: { compiler: files[0]!, playerWeb: files[1]!, playerWindows: files[2]!, upgrade: null },
    host: { electron: '43.7.0', supportedWindows: ['Windows 11 x64'],
      supportedBrowsers: [{ name: 'Chrome', minimumMajor: 120 }] },
    conversions: [], files: files.map(path => ({ path, size: 1 })), releaseNotes: files[3]!,
  };
}

async function install(value: EngineManifest): Promise<void> {
  const directory = join(catalog.directory, value.version);
  for (const file of value.files) {
    const fullPath = join(directory, ...file.path.split('/'));
    await mkdir(resolve(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, 'x');
  }
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(value));
}

beforeEach(async () => {
  await rm(userData, { recursive: true, force: true });
});
afterAll(async () => {
  await rm(userData, { recursive: true, force: true });
});

describe('installed engine catalog', () => {
  it('parses exact manifest and rejects undeclared or duplicate entry files', () => {
    expect(EngineManifestSchema.safeParse(manifest('0.1.0')).success).toBe(true);
    expect(EngineManifestSchema.safeParse({ ...manifest('0.1.0'), files: [] }).success).toBe(false);
    const duplicate = manifest('0.1.0');
    expect(EngineManifestSchema.safeParse({ ...duplicate, files: [...duplicate.files, duplicate.files[0]] }).success).toBe(false);
    expect(EngineManifestSchema.safeParse({ ...duplicate, version: 'latest' }).success).toBe(false);
  });

  it('offers installed target versions and never substitutes another version for a missing Lock', async () => {
    await install(manifest('2.0.0'));
    const choices = await catalog.listCreationVersions('windows');
    expect(choices.ok && choices.value.map(value => value.version)).toEqual(['2.0.0']);
    const missing = await catalog.resolveProjectEngine(FixtureProject, FixtureLock, 'windows');
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.code).toBe('ENGINE_MISSING');
      expect(missing.error.actions).toContain('supplyDependency');
    }
    expect(FixtureProject.engineVersion).toBe('0.1.0');
    expect(FixtureLock.engine.version).toBe('0.1.0');

    await install(manifest('0.1.0'));
    const opened = await catalog.resolveProjectEngine(FixtureProject, FixtureLock, 'windows');
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(opened.value.manifest.version).toBe('0.1.0');
      expect(opened.value.compiler).toBe(join(catalog.directory, '0.1.0', 'compiler.mjs'));
      expect(opened.value.player).toBe(join(catalog.directory, '0.1.0', 'windows', 'player.exe'));
    }
    const web = await catalog.resolveProjectEngine(FixtureProject, FixtureLock, 'web');
    expect(web.ok && web.value.player).toBe(join(catalog.directory, '0.1.0', 'web', 'index.html'));

    await rm(join(catalog.directory, '0.1.0'), { recursive: true });
    const removed = await catalog.resolveProjectEngine(FixtureProject, FixtureLock, 'web');
    expect(removed.ok ? null : removed.error.code).toBe('ENGINE_MISSING');
    await install(manifest('0.1.0'));
    const restored = await catalog.resolveProjectEngine(FixtureProject, FixtureLock, 'web');
    expect(restored.ok && restored.value.manifest.version).toBe('0.1.0');
    expect(FixtureLock.engine.version).toBe('0.1.0');
  });

  it('blocks unsupported targets and mismatched project or Lock versions', async () => {
    await install(manifest('0.1.0', ['web']));
    const unsupported = await catalog.resolveProjectEngine(FixtureProject, FixtureLock, 'windows');
    expect(unsupported.ok ? null : unsupported.error.code).toBe('ENGINE_UNSUPPORTED');
    const mismatch = await catalog.resolveProjectEngine({ ...FixtureProject, engineVersion: '2.0.0' }, FixtureLock, 'web');
    expect(mismatch.ok ? null : mismatch.error.code).toBe('ENGINE_LOCK_MISMATCH');
    const wrongId = await catalog.resolveProjectEngine(FixtureProject,
      { ...FixtureLock, engine: { ...FixtureLock.engine, id: 'other' } }, 'web');
    expect(wrongId.ok ? null : wrongId.error.code).toBe('ENGINE_LOCK_MISMATCH');
    const optional = await catalog.resolveProjectEngine(FixtureProject,
      { ...FixtureLock, engine: { ...FixtureLock.engine, required: false } }, 'web');
    expect(optional.ok ? null : optional.error.code).toBe('ENGINE_LOCK_MISMATCH');
    const android = await catalog.resolveEngine('0.1.0', 'android');
    expect(android.ok ? null : android.error.code).toBe('ENGINE_UNSUPPORTED');
  });

  it('keeps malformed and incomplete packages out of the available catalog', async () => {
    await install(manifest('0.1.0'));
    await rm(join(catalog.directory, '0.1.0', 'compiler.mjs'));
    const incomplete = await catalog.resolveEngine('0.1.0', 'web');
    expect(incomplete.ok ? null : incomplete.error.code).toBe('ENGINE_INVALID');
    const list = await catalog.listEngines();
    expect(list.ok && list.value).toEqual([]);
    expect(list.ok && list.warnings.map(item => item.code)).toEqual(['ENGINE_INVALID']);

    await install(manifest('2.0.0'));
    const manifestPath = join(catalog.directory, '2.0.0', 'manifest.json');
    const raw = await readFile(manifestPath, 'utf8');
    await writeFile(manifestPath, raw.replace('"2.0.0"', '"3.0.0"'));
    const wrongVersion = await catalog.resolveEngine('2.0.0', 'web');
    expect(wrongVersion.ok ? null : wrongVersion.error.code).toBe('ENGINE_INVALID');
  });
});
