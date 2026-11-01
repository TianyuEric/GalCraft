import { expect, it } from 'vitest';
import { progressCount, progressPhase } from './task-progress.js';
it('labels actual progress scope and retains unknown totals', () => {
  expect(progressCount({ phase: 'executing', completed: 12, total: 30, scope: 'sampling' }, 'en')).toBe('Current sampling node 12 / 30');
  expect(progressCount({ phase: 'executing', completed: 2, total: null, scope: 'nodes' }, 'en')).toBe('Workflow nodes 2 / total unknown');
  expect(progressCount({ phase: 'running', completed: null, total: null, scope: 'unknown' }, 'ja')).toContain('数量不明');
  expect(progressPhase({ phase: 'releasingResources', completed: null, total: null }, 'en')).toBe('Releasing resources');
});
