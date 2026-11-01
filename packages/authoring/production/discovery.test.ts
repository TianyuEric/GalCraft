import { expect, it } from 'vitest';
import { DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import type { ConnectionConfig } from '@galcraft/contracts';
import type { Task } from './types.js';
import { effectiveProductionDefaults, frozenProductionTask } from './discovery.js';

const connection: ConnectionConfig = { id: 'Conn01', revision: 4, name: 'Configured image', protocol: 'webUI', baseUrl: 'http://private.invalid',
  auth: 'bearer', credentialId: 'Secret', apiKeyHeader: null, model: 'configured-model', purposes: ['image'],
  timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 2, parameters: { steps: 20, nested: { apiKey: 'hidden', strength: .5 } }, workflowBindingId: null, serverFileRoot: '/private' };
it('reads configured per-use identities without selecting another service or exposing personal setup', () => {
  const input = { usage: 'figure' as const, connections: [connection], imageRoutes: { figure: { connectionId: connection.id, model: 'figure-model', workflowBindingId: null } }, defaults: {}, workflows: [], recipes: [] };
  const result = effectiveProductionDefaults(input);
  expect(result).toMatchObject({ status: 'available', connection: { id: 'Conn01', revision: 4 }, model: 'figure-model' });
  expect(JSON.stringify(result)).not.toMatch(/private|Secret|hidden/);
  expect(effectiveProductionDefaults({ ...input, connections: [] })).toMatchObject({ status: 'unavailable', connection: { id: 'Conn01', revision: 'unknown' }, model: 'unknown' });
});
it('returns saved frozen inputs and attempts verbatim, keeps provenance and marks unrecorded snapshots unknown', () => {
  const task = { id: 'Task01', projectId: 'Proj01', revision: 8, collaboration: { sessionId: 'Other1' }, items: [{ id: 'Item01', state: 'interrupted',
    target: { usage: 'figure' }, input: { purpose: 'image', positive: '正式人设', references: [{ assetId: 'Asset1', variantId: 'Var001', localPath: '/frozen/reference.png' }] },
    configSnapshot: connection, sourceVersions: [{ ref: { kind: 'document', id: 'Char01' }, revision: 3 }], remote: { id: 'remote-original' },
    attempts: [{ id: 'Attempt', outcome: 'unknown' }], candidateIds: ['Cand01'], selectedCandidateId: null, needsReview: false }] } as unknown as Task;
  const result = frozenProductionTask(task) as any;
  expect(result.items[0]).toMatchObject({ input: task.items[0]!.input, remote: { id: 'remote-original' }, attempts: task.items[0]!.attempts, workflow: 'unknown',
    connection: { revision: 4, parameters: { steps: 20, nested: { strength: .5 } } } });
  expect(result.collaboration.sessionId).toBe('Other1');
  expect(JSON.stringify(result)).not.toMatch(/private|Secret|hidden|credentialId/);
  expect(() => frozenProductionTask(task, 'Miss01')).toThrow('does not exist');
  expect(task.items[0]!.configSnapshot!.parameters).toMatchObject({ nested: { apiKey: 'hidden' } });
});
