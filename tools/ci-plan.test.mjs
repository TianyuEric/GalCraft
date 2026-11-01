import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planChecks } from './ci-plan.mjs';

const packages = [
  { name: '@galcraft/contracts', path: 'packages/contracts', dependencies: [] },
  { name: '@galcraft/studio', path: 'apps/studio', dependencies: ['@galcraft/contracts'] },
  { name: '@galcraft/player-web', path: 'apps/player-web', dependencies: ['@galcraft/contracts'] },
];

test('npm entry and CI scheduling changes select their tool checks', () => {
  const plan = planChecks(['tools/studio-npm-entry.mjs', 'tools/package-studio-npm-entry.mjs', 'tools/ci-plan.test.mjs', 'tools/ci-checks.mjs'], packages);
  assert.deepEqual(plan.packages, []);
  assert.equal(plan.tools, true);
  assert.equal(plan.install, true);
  assert.equal(plan.architecture, false);
  assert.equal(plan.storybook, false);
});

test('Studio implementation and full application packaging select Studio consumers', () => {
  for (const path of ['apps/studio/main/bundled-engine.mjs', 'tools/package-studio-npm.mjs']) {
    assert(planChecks([path], packages).packages.includes('@galcraft/studio'));
  }
});

test('shared contracts still select the actual Studio and Player consumers', () => {
  assert.deepEqual(planChecks(['packages/contracts/src/index.ts'], packages).packages, ['@galcraft/contracts', '@galcraft/player-web', '@galcraft/studio']);
});
