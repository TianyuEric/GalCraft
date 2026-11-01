import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { ProjectSession } from '@galcraft/documents';
import { createOfficialTemplate, createTemplateDocuments } from '@galcraft/templates';
import { currentProjectScope } from '@galcraft/collaboration';
import { StudioCollaboration } from './collaboration-providers.mjs';

it('returns fixed completion durations and distinct confirmed sends through the real SDK, with legacy unknowns separate', async context => {
  const root = await mkdtemp(join(tmpdir(), 'galcraft-statistics-')), projectRoot = join(root, 'project'), profile = join(root, 'profile');
  const project = await ProjectSession.createProject(projectRoot, 'Proj01', createTemplateDocuments(createOfficialTemplate()));
  const at = '2026-10-27T10:00:00.000Z';
  const tasks = [{ projectId: 'Proj01', items: [{ attempts: [{ id: 'shared-request', sentAt: at }, { id: 'm10-only', sentAt: at }, { id: 'not-sent', sentAt: null }, { id: 'legacy-unknown' }, { id: 'shared-request' }] },
    { providerSnapshot: { execution: 'local' }, attempts: [{ id: 'local-step', sentAt: at }] }] }, { projectId: 'OtherProject', items: [{ attempts: [{ id: 'other-project', sentAt: at }] }] }];
  const service = new StudioCollaboration({ userData: profile, projects: { currentSession: project, currentRoot: projectRoot, currentSessionId: 'Write1' },
    production: { generationProviders: { operations: async () => [] }, current: async () => ({ service: { listTasks: () => tasks } }) }, assets: {},
    plugins: { externalTools: async () => [], dependencies: () => [], acquireDefinitions: async () => ({ ok: true, value: { documents: [], components: [], pages: [], release: async () => {} } }) } });
  let client;
  context.onTestFinished(async () => { vi.useRealTimers(); await client?.close(); await service.close(); await project.dispose('discard'); await rm(root, { recursive: true, force: true }); });
  await service.ready;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(at));
  const session = await service.core.create({ projectId: 'Proj01', projectRoot, writeSessionId: 'Write1', projectName: 'Statistics fixture', goal: 'Read send facts', harness: 'codex', scope: currentProjectScope() });
  service.core.register({ definition: { key: 'statistics_fixture', version: '0.1.0', title: 'Statistics fixture', description: '', inputSchema: true, outputSchema: true, effects: ['edit'], async: false, cancel: false },
    constraints: () => ({ effects: ['edit'] }), execute: async () => { vi.setSystemTime(new Date('2026-10-27T10:00:02.000Z')); return { operationId: 'Edit01' }; } });
  const completed = await service.core.invoke('statistics_fixture', {}, session.id, 'completed-call');
  const legacy = { ...completed, callId: 'legacy-call', context: { ...completed.context, callId: 'legacy-call' } }; delete legacy.finishedAt;
  await writeFile(join(profile, 'collaboration', 'calls', session.id, 'legacy-call.json'), JSON.stringify(legacy)); await service.core.open();
  for (const requestId of ['shared-request', 'm12-only', 'shared-request']) await service.core.authorize(completed.context, 'statistics_fixture', { effects: ['generate'] }, requestId);
  const { endpoint } = await service.mcp.start();
  client = new Client({ name: 'statistics-regression', version: '0.1.0' }, { versionNegotiation: { mode: 'auto' } });
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  const snapshots = [];
  for (const now of ['2026-10-27T11:00:00.000Z', '2026-10-27T12:00:00.000Z']) {
    vi.setSystemTime(new Date(now));
    const response = await client.callTool({ name: 'galcraft_context', arguments: { projectId: 'Proj01', sessionId: session.id, input: { mode: 'statistics', limit: 100 } } });
    expect(response.isError, JSON.stringify(response)).not.toBe(true);
    const receipt = response.structuredContent;
    const statistics = receipt.result;
    expect(statistics).toMatchObject({ mode: 'statistics', actualGenerationSends: 3, unknownGenerationAttempts: 1 });
    expect(statistics.calls.find(call => call.callId === 'legacy-call').durationMs).toBeNull();
    snapshots.push(statistics.calls.find(call => call.callId === 'completed-call').durationMs);
  }
  expect(snapshots).toEqual([2000, 2000]);
  expect(JSON.parse(await readFile(join(profile, 'collaboration', 'sessions', `${session.id}.json`), 'utf8')).sentRequests).toEqual(['shared-request', 'm12-only']);
});
