import { expect, it, vi } from 'vitest';
import type { PageBlueprint } from '@galcraft/contracts';
import { BlueprintExecutions, waitBlueprint } from './blueprint.js';
import { PageNavigator } from './navigation.js';

const graph: PageBlueprint = {
  revision: 1, entry: 'check1', nodes: [
    { id: 'check1', kind: 'condition', condition: { op: 'truthy', value: { source: 'literal', value: false } } },
    { id: 'wait01', kind: 'wait', milliseconds: 1000 },
    { id: 'open01', kind: 'action', action: { kind: 'open', page: 'settings' } },
    { id: 'local1', kind: 'action', action: { kind: 'toggleLocal', key: 'done' } },
  ], edges: [
    { id: 'edge01', from: 'check1', outcome: 'unmet', to: 'wait01' },
    { id: 'edge02', from: 'wait01', outcome: 'success', to: 'open01' },
    { id: 'edge03', from: 'open01', outcome: 'success', to: 'local1' },
  ],
};
const address = { pageId: 'title1', componentId: 'button', bindingId: 'click1', revision: 1 };

it('merges an in-flight binding, follows the observed branch and ends the graph at committed navigation', async () => {
  const nav = new PageNavigator(), executions = new BlueprintExecutions();
  let owner: AbortSignal | undefined;
  nav.subscribe(() => executions.visitChanged(nav.visitId, owner));
  const run = { ...address, visitId: nav.visitId };
  const execute = vi.fn(async (node: PageBlueprint['nodes'][number], signal: AbortSignal) => {
    if (node.kind === 'condition') return { outcome: 'unmet' as const, value: false };
    if (node.kind === 'wait') return { outcome: 'success' as const };
    owner = signal;
    nav.open('settings');
    owner = undefined;
    return { outcome: 'success' as const, navigated: true };
  });
  const first = executions.run(run, graph, execute), duplicate = executions.run(run, graph, execute);
  expect(first).toBe(duplicate);
  const receipt = await first;
  expect(receipt.status).toBe('navigated');
  expect(receipt.steps.map(step => [step.nodeId, step.outcome, step.nextNodeId])).toEqual([
    ['check1', 'unmet', 'wait01'], ['wait01', 'success', 'open01'], ['open01', 'success', null],
  ]);
  expect(execute).toHaveBeenCalledTimes(3);
});

it.each(['leave', 'stop', 'reopen'] as const)('cancels a pending visit on %s and prevents its next action', async (cancel) => {
  const nav = new PageNavigator(), executions = new BlueprintExecutions();
  nav.subscribe(() => executions.visitChanged(nav.visitId));
  const oldVisit = nav.visitId;
  const execute = vi.fn(async (node: PageBlueprint['nodes'][number], signal: AbortSignal) => {
    if (node.kind === 'wait') await waitBlueprint(node.milliseconds, signal);
    return { outcome: node.kind === 'condition' ? 'unmet' as const : 'success' as const };
  });
  const waiting = executions.run({ ...address, visitId: oldVisit }, graph, execute);
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
  if (cancel === 'leave') { nav.open('settings'); nav.back(); expect(nav.visitId).toBe(oldVisit); }
  if (cancel === 'stop') executions.stop();
  if (cancel === 'reopen') { nav.replace('title'); expect(nav.visitId).not.toBe(oldVisit); }
  expect((await waiting).status).toBe('cancelled');
  expect(execute).toHaveBeenCalledTimes(2);
});

it('ends a stopped breakpoint even if its observer never resolves', async () => {
  const executions = new BlueprintExecutions(), entered = vi.fn(() => new Promise<void>(() => {}));
  const execute = vi.fn(), run = executions.run({ ...address, visitId: 'visit1' }, graph, execute, { beforeNode: entered });
  await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce());
  executions.stop();
  expect(await run).toMatchObject({ status: 'cancelled', steps: [] });
  expect(execute).not.toHaveBeenCalled();
});
