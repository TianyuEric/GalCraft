import { setTimeout as delay } from 'node:timers/promises';
import type { ResourceSnapshot, ResourceReleaseReceipt, Result, SubmissionContext } from '@galcraft/contracts';
import { fail, issue, ok } from './validation.js';

export function comfyServiceUrl(base: string): string {
  const url = new URL(base); url.username = ''; url.password = ''; url.search = ''; url.hash = '';
  return url.href.replace(/\/+$/, '');
}
type Request = (ctx: SubmissionContext, path: string, body?: unknown) => Promise<Response>;
const metric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export async function inspectComfyResources(ctx: SubmissionContext, request: Request): Promise<Result<ResourceSnapshot>> {
  try {
    if (ctx.config.protocol !== 'comfyUI') return fail('RESOURCE_UNSUPPORTED', 'This provider has no ComfyUI resource endpoint.');
    const queue = await (await request(ctx, '/queue')).json() as any;
    if (!Array.isArray(queue.queue_running) || !Array.isArray(queue.queue_pending)) throw new Error('ComfyUI did not return its complete instance queue.');
    let stats: any = {}, issues: ResourceSnapshot['issues'] = [];
    try { stats = await (await request(ctx, '/system_stats')).json(); }
    catch (error) { issues = [{ ...issue('RESOURCE_STATS_UNAVAILABLE', String(error)), severity: 'warning' }]; }
    return ok({ serviceUrl: comfyServiceUrl(ctx.config.baseUrl), checkedAt: new Date().toISOString(),
      queue: { running: queue.queue_running.map((row: any[]) => String(row[1])), pending: queue.queue_pending.map((row: any[]) => String(row[1])) },
      system: { ramTotal: metric(stats.system?.ram_total), ramFree: metric(stats.system?.ram_free) },
      devices: (Array.isArray(stats.devices) ? stats.devices : []).map((device: any) => ({ name: String(device.name ?? ''), type: String(device.type ?? ''), index: metric(device.index),
        vramTotal: metric(device.vram_total), vramFree: metric(device.vram_free), torchVramTotal: metric(device.torch_vram_total), torchVramFree: metric(device.torch_vram_free) })), issues });
  } catch (error) { return fail('RESOURCE_INSPECTION', String(error)); }
}
const busy = (snapshot: ResourceSnapshot) => snapshot.queue.running.length > 0 || snapshot.queue.pending.length > 0;
function reclaimed(before: ResourceSnapshot, after: ResourceSnapshot): boolean {
  return after.devices.some((device, index) => { const previous = before.devices[index]; return previous && (
    device.vramFree !== null && previous.vramFree !== null && device.vramFree > previous.vramFree ||
    device.torchVramTotal !== null && previous.torchVramTotal !== null && device.torchVramTotal < previous.torchVramTotal); }) ||
    before.system.ramFree !== null && after.system.ramFree !== null && after.system.ramFree > before.system.ramFree;
}
export async function releaseComfyResources(ctx: SubmissionContext, request: Request, pollMs = 500, waitMs = 10000): Promise<Result<ResourceReleaseReceipt>> {
  const initial = await inspectComfyResources(ctx, request); if (!initial.ok) return initial;
  const before = initial.value;
  if (busy(before)) return ok({ status: 'busy', requestedAt: null, before, after: null, issues: [] });
  try {
    // /free acknowledges flags; the worker unloads models, resets execution caches and collects later.
    await (await request(ctx, '/free', { unload_models: true, free_memory: true })).body?.cancel();
    const requestedAt = new Date().toISOString(), end = Date.now() + waitMs;
    let after = before, observations = 0;
    do {
      await delay(pollMs, undefined, { signal: ctx.signal });
      const result = await inspectComfyResources(ctx, request); if (!result.ok) return result;
      after = result.value; observations++;
      if (busy(after)) return ok({ status: 'unverified', requestedAt, before, after, issues: [issue('RESOURCE_QUEUE_CHANGED', 'The instance became busy while release was being observed.')] });
      if (observations >= 2 && reclaimed(before, after)) return ok({ status: 'observed', requestedAt, before, after, issues: after.issues });
    } while (Date.now() < end);
    const noManagedDeviceAllocation = after.devices.length > 0 && after.devices.every(device => device.torchVramTotal === 0);
    return ok({ status: noManagedDeviceAllocation ? 'idle' : 'unverified', requestedAt, before, after,
      issues: [...after.issues, { ...issue('RESOURCE_CACHES_UNVERIFIED', 'The queue is idle. Standard ComfyUI APIs provide no completion receipt for worker cleanup or third-party caches.'), severity: noManagedDeviceAllocation ? 'warning' : 'error' }] });
  } catch (error) { return fail('RESOURCE_RELEASE', String(error)); }
}
