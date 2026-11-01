import { ImportCoordinator } from '@galcraft/assets';
import { fail } from './result.mjs';

/** M04 owns prepared media; this host adapter retains its exact definition lease until adoption ends. */
export class ProductionMediaImporter {
  constructor({ assets, project, root, index }) {
    Object.assign(this, { assets, project, root, index }); this.prepared = new Map();
    this.pending = new Set(); this.closed = false; this.closing = null;
  }
  async importBatch(input) {
    if (this.closed) return this.closedBatch(input);
    const pending = this.prepareBatch(input); this.pending.add(pending);
    try { return await pending; }
    finally { this.pending.delete(pending); }
  }
  closedBatch(input) {
    return input.files.map(sourcePath => ({ sourcePath, result: fail('PROJECT_STALE', '作品已关闭，请在当前作品中重新准备采用', 'M04') }));
  }
  async prepareBatch(input) {
    const lease = await this.assets.acquireTypes?.(this.project) ?? { release: async () => {} };
    const batch = { lease, ids: new Set() };
    try {
      if (this.closed) { await this.finish(batch, false); return this.closedBatch(input); }
      batch.coordinator = new ImportCoordinator(this.root, this.assets.toolDirectory, this.index, undefined, this.assets.svgDecoder,
        this.assets.resourceProviders ? path => this.assets.resourceProviders.resolve(path, this.project) : undefined, lease.types);
      const imported = await batch.coordinator.importBatch(input);
      for (const item of imported) if (item.result.ok) batch.ids.add(item.result.value.preparationId);
      if (this.closed) { await this.finish(batch, true); return this.closedBatch(input); }
      for (const id of batch.ids) this.prepared.set(id, batch);
      if (!batch.ids.size) await this.finish(batch, false);
      return imported;
    } catch (error) { await this.finish(batch, true); throw error; }
  }
  prepareIndexEdit(ids) {
    const batches = new Set(ids.map(id => this.prepared.get(id)));
    if (batches.size !== 1 || batches.has(undefined)) return fail('PREPARATION_MISSING', '本次采用的媒体准备批次已失效', 'M04');
    return [...batches][0].coordinator.prepareIndexEdit(ids);
  }
  async prepareAnimations(inputs) {
    if (this.closed) return fail('PROJECT_STALE', '作品已关闭，请在当前作品中重新准备采用', 'M04');
    const batch = { lease: { release: async () => {} }, ids: new Set(), coordinator: new ImportCoordinator(this.root, this.assets.toolDirectory, this.index) };
    const pending = (async () => {
      try {
        const prepared = [];
        for (const input of inputs) { const result = await batch.coordinator.prepareAnimation(input); if (!result.ok) { await this.finish(batch, true); return result; } prepared.push(result.value); batch.ids.add(result.value.preparationId); }
        if (this.closed) { await this.finish(batch, true); return fail('PROJECT_STALE', '作品已关闭，请重新准备动画采用', 'M04'); }
        for (const value of prepared) this.prepared.set(value.preparationId, batch); return { ok: true, value: prepared, warnings: [] };
      } catch (reason) { await this.finish(batch, true); throw reason; }
    })();
    this.pending.add(pending); try { return await pending; } finally { this.pending.delete(pending); }
  }
  pendingVariants() {
    return [...new Set(this.prepared.values())].flatMap(batch => batch.coordinator.pendingVariants());
  }
  async finish(batch, discard) {
    if (!batch.finished) batch.finished = (async () => {
      try { if (discard) for (const id of batch.ids) await batch.coordinator.discard(id); }
      finally { for (const id of batch.ids) this.prepared.delete(id); batch.ids.clear(); await batch.lease.release(); }
    })();
    await batch.finished;
  }
  async confirm(ids) {
    const batches = new Set();
    for (const id of ids) { const batch = this.prepared.get(id); if (!batch) continue; batch.coordinator.confirm([id]); batch.ids.delete(id); this.prepared.delete(id); batches.add(batch); }
    for (const batch of batches) if (!batch.ids.size) await this.finish(batch, false);
  }
  async discard(id) {
    const batch = this.prepared.get(id); if (!batch) return;
    try { await batch.coordinator.discard(id); }
    finally { batch.ids.delete(id); this.prepared.delete(id); if (!batch.ids.size) await this.finish(batch, false); }
  }
  close() {
    this.closed = true;
    return this.closing ??= (async () => {
      await Promise.allSettled([...this.pending]);
      for (const batch of new Set(this.prepared.values())) await this.finish(batch, true);
    })();
  }
}
