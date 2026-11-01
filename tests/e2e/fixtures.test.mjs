import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { ensureProjectFixture } from './project-fixture.mjs';
import { ProjectDocuments } from '../../apps/studio/main/document-providers.mjs';
import { ProjectAccess } from '../../apps/studio/main/project-access.mjs';
import { StudioProduction } from '../../apps/studio/main/production-providers.mjs';
import { compile } from '../../packages/dsl/dist/index.js';

test('rebuilds the host dataset without personal evidence, then opens and compiles its actual disk documents', async () => {
  const testing = resolve('tmp/testing'); await mkdir(testing, { recursive: true });
  const root = join(testing, 'fixtures', 'project-open-compile');
  assert(root.startsWith(testing + sep));
  await rm(root, { recursive: true, force: true });
  const projects = new ProjectDocuments(new ProjectAccess());
  try {
    const project = await ensureProjectFixture(root), original = await readFile(join(project, 'project.json'), 'utf8');
    assert.equal(await ensureProjectFixture(root), project);
    assert.equal(await readFile(join(project, 'project.json'), 'utf8'), original);
    const opened = await projects.open(project); assert(opened.ok, opened.error?.message);
    const source = StudioProduction.prototype.compileInput.call({}, projects.currentSession);
    const compiled = compile(source);
    assert(compiled.snapshot, JSON.stringify(compiled.issues));
    assert.equal(source.scenes.length, 2); assert(source.characters.length >= 2);
    const asset = source.assets[0], variant = asset.variants[0];
    assert.deepEqual([...(await readFile(join(project, 'assets/files', asset.id, variant.id, variant.entry))).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  } finally {
    await projects.currentSession?.dispose('saved');
    await rm(root, { recursive: true, force: true });
  }
});
