import { afterAll, expect, it } from 'vitest';
import { rm, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FixtureProject, FixtureLock, FixtureCharacters } from '@galcraft/contracts/fixtures';
import { StudioBackups } from './backup-providers.mjs';
const root = resolve('../../tmp/testing/backup-host');
afterAll(async () => { await rm(root, { recursive: true, force: true }); });
it('resolves the bundled exact plugin and its document rewriter without generation credentials', async () => {
  const data = { characters: [{ characterId: FixtureCharacters[0].id, min: 0, max: 100, initial: 0, visible: true, label: '角色' }] };
  const { createOfficialTemplate, createTemplateDocuments } = await import('@galcraft/templates'); const template = createOfficialTemplate({ kind: 'standard' });
  const documents = [...createTemplateDocuments(template), { files: { 'plugins/org.galcraft.affection/documents/config.json': JSON.stringify({ data }) } }];
  const version = '0.1.1', engineVersion = '0.2.0';
  const host = new StudioBackups({ userData: root, projects: { currentRoot: null }, engineCatalog: { resolveProjectEngine: async () => ({ ok: true, value: {}, warnings: [] }) },
    officialPackages: { 'org.galcraft.affection': { [version]: resolve('../../plugins/official-affection/package') } } });
  const lock = { ...FixtureLock, engine: { ...FixtureLock.engine, version: engineVersion },
    template: { ...FixtureLock.template, id: template.id, version: template.version }, plugins: [{ ...FixtureLock.plugins[0], version }] };
  const issues = await host.service.providers.validateDependencies({ ...FixtureProject, engineVersion }, lock, '', documents);
  expect(issues).toEqual([]);
  expect(host.service.providers.pluginDocuments('plugins/org.galcraft.affection/documents/config.json').collectReferences(data)).toContainEqual({ kind: 'character', id: FixtureCharacters[0].id });
  expect(host.service.providers.generationReadiness(FixtureProject.projectId).every(item => item.state === 'needsConnection')).toBe(true);
  expect(JSON.parse(await readFile(join(root, 'plugins/org.galcraft.affection', version, 'manifest.json'), 'utf8')).version).toBe(version);
});
