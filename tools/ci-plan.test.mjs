import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planChecks } from './ci-plan.mjs';

const packages = [
  { name: '@galcraft/contracts', path: 'packages/contracts', dependencies: [] },
  { name: '@galcraft/documents', path: 'packages/documents', dependencies: ['@galcraft/contracts'] },
  { name: '@galcraft/studio', path: 'apps/studio', dependencies: ['@galcraft/documents'] },
  { name: '@galcraft/unrelated', path: 'plugins/unrelated', dependencies: [] },
];

test('document-only PRs produce a successful no-install plan', () => {
  const plan = planChecks(['README.md', 'docs/testing.md', '.github/ISSUE_TEMPLATE/bug_report.md'], packages);
  assert.equal(plan.install, false); assert.deepEqual(plan.packages, []);
});

test('shared package changes include transitive workspace consumers', () => {
  const plan = planChecks(['packages/contracts/src/index.ts'], packages);
  assert.deepEqual(plan.packages, ['@galcraft/contracts', '@galcraft/documents', '@galcraft/studio']);
  assert.equal(plan.architecture, true);
});

test('local changes, stories and shared setup select their actual routes', () => {
  assert.deepEqual(planChecks(['apps/studio/renderer/page.tsx'], packages).packages, ['@galcraft/studio']);
  assert.equal(planChecks(['apps/studio/renderer/page.stories.tsx'], packages).storybook, true);
  assert.equal(planChecks(['tools/check-architecture-boundaries.mjs'], packages).tools, true);
  const full = planChecks(['pnpm-lock.yaml'], packages);
  assert.equal(full.packages.length, packages.length); assert(full.tools && full.architecture && full.storybook);
});

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
