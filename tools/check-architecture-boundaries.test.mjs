import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importViolation, staticImports } from './check-architecture-boundaries.mjs';

test('actual static import forms expose dependency violations', () => {
  const source = `import { x } from '../../../apps/studio/renderer/main.js';
    export { y } from '../../../apps/player-web/src/main.js';
    const z = import('electron'); const q = require('electron/main');
    type H = import('electron').Host;`;
  const entries = staticImports(source, 'packages/authoring/production/fixture.ts');
  assert.equal(entries.length, 5);
  assert.deepEqual(entries.map(item => importViolation('packages/authoring/production/fixture.ts', item.value)),
    ['package-to-app', 'package-to-app', 'production-to-electron', 'production-to-electron', 'production-to-electron']);
});

test('CSS imports, package names and legitimate shared exports are distinguished', () => {
  const css = staticImports('@import "../../player-web/src/player.css";', 'apps/player-windows/renderer/style.css');
  assert.equal(importViolation('apps/player-windows/renderer/style.css', css[0].value), 'cross-app-internal');
  const packages = new Map([['@galcraft/studio', { path: 'apps/studio/' }], ['@galcraft/player-ui', { path: 'packages/player-ui/' }]]);
  assert.equal(importViolation('packages/stage/src/view.ts', '@galcraft/studio', packages), 'package-to-app');
  assert.equal(importViolation('apps/studio/renderer/main.ts', '@galcraft/player-ui/player.css', packages), null);
});

test('plugins use public SDK and hosts use ordinary official packages', () => {
  assert.equal(importViolation('plugins/official-affection/src/index.ts', '../../../packages/plugins/contracts/sdk.js'), 'plugin-private-import');
  assert.equal(importViolation('plugins/official-affection/src/index.ts', '@galcraft/plugins/contracts'), null);
  assert.equal(importViolation('apps/studio/main/plugins.mjs', '../../../plugins/official-affection/dist/index.js'), 'official-business-import');
  assert.equal(importViolation('apps/studio/main/plugins.mjs', './official-catalog.mjs'), null);
});

test('renderer runtime imports avoid Node barrels while type imports remain usable', () => {
  const from = 'apps/studio/renderer/pages/Production/session.ts';
  const entries = staticImports(`import type { Task } from '@galcraft/authoring/production';
    import { type Candidate } from '@galcraft/authoring/production';
    import { operation } from '@galcraft/authoring/production';
    import { prepare } from '@galcraft/authoring/production/operations';
    export type { Task } from '@galcraft/authoring/production';`, from);
  assert.deepEqual(entries.map(item => importViolation(from, item.value, new Map(), item.typeOnly)),
    [null, null, 'renderer-to-node', null, null]);
  assert.equal(importViolation(from, 'node:fs/promises'), 'renderer-to-node');
});
