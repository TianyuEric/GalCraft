import { issueFromError } from '@galcraft/contracts';
import type { BlueprintNode, BlueprintTrigger, Issue, Json, PageBlueprint } from '@galcraft/contracts';
export type { BlueprintTrigger } from '@galcraft/contracts';
export type BlueprintRunIdentity = Pick<BlueprintTrigger, 'pageId' | 'componentId' | 'bindingId'> & {
  visitId: string;
  revision: number | null;
};
export type BlueprintStep = {
  nodeId: string;
  kind: BlueprintNode['kind'];
  outcome: 'success' | 'unmet' | 'failure';
  nextNodeId: string | null;
  value?: Json;
  issue: Issue | null;
};
export type BlueprintRunOptions = {
  signal?: AbortSignal;
  beforeNode?(node: BlueprintNode, run: BlueprintRunIdentity, signal: AbortSignal): void | Promise<void>;
  onStep?(step: BlueprintStep): void;
};
export type BlueprintRunResult = BlueprintRunIdentity & {
  status: 'completed' | 'unmet' | 'failed' | 'cancelled' | 'navigated' | 'unavailable';
  steps: BlueprintStep[];
  issue: Issue | null;
};

export type BlueprintNodeResult = {
  outcome: BlueprintStep['outcome'];
  value?: Json;
  issue?: Issue;
  navigated?: boolean;
};

function interruptible<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    void operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function waitBlueprint(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

type InFlight = { visitId: string; controller: AbortController; task: Promise<BlueprintRunResult> };

export class BlueprintExecutions {
  private readonly active = new Map<string, InFlight>();

  run(run: BlueprintRunIdentity, blueprint: PageBlueprint,
    execute: (node: BlueprintNode, signal: AbortSignal) => BlueprintNodeResult | Promise<BlueprintNodeResult>,
    options: BlueprintRunOptions = {}): Promise<BlueprintRunResult> {
    const key = `${run.visitId}/${run.pageId}/${run.componentId}/${run.bindingId}`;
    const existing = this.active.get(key);
    if (existing && !existing.controller.signal.aborted) return existing.task;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    const task = Promise.resolve().then(() => this.execute(run, blueprint, execute, options, controller.signal)).finally(() => {
      options.signal?.removeEventListener('abort', abort);
      if (this.active.get(key)?.controller === controller) this.active.delete(key);
    });
    this.active.set(key, { visitId: run.visitId, controller, task });
    return task;
  }

  visitChanged(visitId: string, retained?: AbortSignal) {
    for (const run of this.active.values()) if (run.visitId !== visitId && run.controller.signal !== retained) run.controller.abort();
  }

  stop() { for (const run of this.active.values()) run.controller.abort(); }

  private async execute(run: BlueprintRunIdentity, blueprint: PageBlueprint,
    execute: (node: BlueprintNode, signal: AbortSignal) => BlueprintNodeResult | Promise<BlueprintNodeResult>,
    options: BlueprintRunOptions, signal: AbortSignal): Promise<BlueprintRunResult> {
    const steps: BlueprintStep[] = [];
    const finish = (status: BlueprintRunResult['status'], issue: Issue | null = null): BlueprintRunResult => ({ ...run, status, issue, steps });
    const nodes = new Map(blueprint.nodes.map(node => [node.id, node]));
    const edges = new Map(blueprint.edges.map(edge => [`${edge.from}/${edge.outcome}`, edge.to]));
    const visited = new Set<string>();
    let next: string | null = blueprint.entry;
    while (next !== null) {
      if (signal.aborted) return finish('cancelled');
      const node = nodes.get(next);
      if (!node || visited.has(next)) return finish('failed', issueFromError(new Error(`Invalid blueprint path at ${next}.`), 'M07'));
      visited.add(next);
      let result: BlueprintNodeResult;
      try {
        if (options.beforeNode) await interruptible(Promise.resolve(options.beforeNode(node, run, signal)), signal);
        signal.throwIfAborted();
        result = await interruptible(Promise.resolve(execute(node, signal)), signal);
      } catch (error) {
        if (signal.aborted) return finish('cancelled');
        result = { outcome: 'failure', issue: issueFromError(error, 'M07') };
      }
      if (signal.aborted) return finish('cancelled');
      next = result.navigated ? null : edges.get(`${node.id}/${result.outcome}`) ?? null;
      const step: BlueprintStep = { nodeId: node.id, kind: node.kind, outcome: result.outcome, nextNodeId: next,
        ...(result.value === undefined ? {} : { value: result.value }), issue: result.issue ?? null };
      steps.push(step);
      options.onStep?.(step);
      if (result.navigated && result.outcome === 'success') return finish('navigated');
      if (next === null) return finish(result.outcome === 'failure' ? 'failed' : result.outcome === 'unmet' ? 'unmet' : 'completed', step.issue);
    }
    return finish('completed');
  }
}
