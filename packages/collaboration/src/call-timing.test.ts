import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { CollaborationService, currentProjectScope } from './service.js';

it('keeps the original completion time across provider lookups and persisted original-call queries', async context => {
  const root = await mkdtemp(join(tmpdir(), 'galcraft-call-timing-'));
  const binding = { projectId: 'Proj01', writeSessionId: 'Write1' };
  let service = new CollaborationService(root, () => binding), executions = 0, lookups = 0;
  context.onTestFinished(async () => { vi.useRealTimers(); await service.close(); await rm(root, { recursive: true, force: true }); });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-27T10:00:00.000Z'));
  await service.open();
  const session = await service.create({ ...binding, projectName: 'Timing fixture', goal: 'Read completion facts', harness: 'codex', scope: currentProjectScope() });
  const tool = { definition: { key: 'timing', version: '0.1.0', title: 'Timing', description: '', inputSchema: true, outputSchema: true, effects: ['edit'] as ['edit'], async: false, cancel: false },
    constraints: () => ({ effects: ['edit'] as ['edit'] }),
    async execute() { executions++; vi.setSystemTime(new Date('2026-10-27T10:00:02.000Z')); return { operationId: 'Edit01' }; },
    async lookup() { lookups++; return { operationId: 'Edit01' }; } };
  service.register(tool);
  const completed = await service.invoke('timing', {}, session.id, 'original-call');
  expect(completed).toMatchObject({ state: 'completed', createdAt: '2026-10-27T10:00:00.000Z', finishedAt: '2026-10-27T10:00:02.000Z' });
  await service.close();
  service = new CollaborationService(root, () => binding); await service.open(); service.register(tool);
  for (const now of ['2026-10-27T11:00:00.000Z', '2026-10-27T12:00:00.000Z']) {
    vi.setSystemTime(new Date(now));
    expect((await service.query(session.id, 'original-call')).finishedAt).toBe(completed.finishedAt);
  }
  const persisted = JSON.parse(await readFile(join(root, 'calls', session.id, 'original-call.json'), 'utf8'));
  expect(persisted.finishedAt).toBe(completed.finishedAt);
  expect(executions).toBe(1); expect(lookups).toBe(2);
});
