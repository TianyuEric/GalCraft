import { ImportCoordinator, type AssetIndex, type ImportInput, type ImportItem } from '@galcraft/assets';
import type { ProjectSession } from '@galcraft/documents';
import { fail } from './result.mjs';

type TypeLease = { types?: ConstructorParameters<typeof ImportCoordinator>[6]; release(): Promise<void> };
type ImportBatch = {
  lease: TypeLease;
  ids: Set<string>;
  coordinator?: ImportCoordinator;
  finished?: Promise<void>;
};
type PreparedBatch = ImportBatch & { coordinator: ImportCoordinator };
type ImportAssets = {
  toolDirectory: string;
  svgDecoder?: ConstructorParameters<typeof ImportCoordinator>[4];
  acquireTypes?(project: ProjectSession): Promise<TypeLease>;
  resourceProviders?: { resolve(path: string, project: ProjectSession): ReturnType<NonNullable<ConstructorParameters<typeof ImportCoordinator>[5]>> };
};

/** M04 owns prepared media; this host adapter retains its exact definition lease until adoption ends. */
export class ProductionMediaImporter {
  private readonly assets: ImportAssets;
  private readonly project: ProjectSession;
  private readonly root: string;
  private readonly index: () => AssetIndex;
  private readonly prepared = new Map<string, PreparedBatch>();
  private readonly pending = new Set<Promise<unknown>>();
  private closed = false;
  private closing: Promise<void> | null = null;

  constructor({ assets, project, root, index }: { assets: ImportAssets; project: ProjectSession; root: string; index: () => AssetIndex }) {
    this.assets = assets;
    this.project = project;
    this.root = root;
    this.index = index;
  }
  async importBatch(input: ImportInput): Promise<ImportItem[]> {
    if (this.closed) return this.closedBatch(input);
    const pending = this.prepareBatch(input); this.pending.add(pending);
    try { return await pending; }
    finally { this.pending.delete(pending); }
  }
  closedBatch(input: ImportInput): ImportItem[] {
    return input.files.map(sourcePath => ({ sourcePath, result: fail('PROJECT_STALE', '作品已关闭，请在当前作品中重新准备采用', 'M04') }));
  }
  async prepareBatch(input: ImportInput): Promise<ImportItem[]> {
    const lease = await this.assets.acquireTypes?.(this.project) ?? { release: async () => {} };
    const batch: ImportBatch = { lease, ids: new Set() };
    try {
      if (this.closed) { await this.finish(batch, false); return this.closedBatch(input); }
      const providers = this.assets.resourceProviders;
      const coordinator = new ImportCoordinator(this.root, this.assets.toolDirectory, this.index, undefined, this.assets.svgDecoder,
        providers ? path => providers.resolve(path, this.project) : undefined, lease.types);
      const prepared = Object.assign(batch, { coordinator });
      const imported = await coordinator.importBatch(input);
      for (const item of imported) if (item.result.ok) batch.ids.add(item.result.value.preparationId);
      if (this.closed) { await this.finish(batch, true); return this.closedBatch(input); }
      for (const id of batch.ids) this.prepared.set(id, prepared);
      if (!batch.ids.size) await this.finish(batch, false);
      return imported;
    } catch (error) { await this.finish(batch, true); throw error; }
  }
  prepareIndexEdit(ids: string[]) {
    const batches = new Set(ids.map(id => this.prepared.get(id)));
    const batch = batches.values().next().value;
    if (batches.size !== 1 || !batch) return fail('PREPARATION_MISSING', '本次采用的媒体准备批次已失效', 'M04');
    return batch.coordinator.prepareIndexEdit(ids);
  }
  async prepareAnimations(inputs: Parameters<ImportCoordinator["prepareAnimation"]>[0][]) {
    if (this.closed) return fail('PROJECT_STALE', '作品已关闭，请在当前作品中重新准备采用', 'M04');
    const batch: PreparedBatch = { lease: { release: async () => {} }, ids: new Set(), coordinator: new ImportCoordinator(this.root, this.assets.toolDirectory, this.index) };
    const pending = (async () => {
      try {
        const prepared = [];
        for (const input of inputs) { const result = await batch.coordinator.prepareAnimation(input); if (!result.ok) { await this.finish(batch, true); return result; } prepared.push(result.value); batch.ids.add(result.value.preparationId); }
        if (this.closed) { await this.finish(batch, true); return fail('PROJECT_STALE', '作品已关闭，请重新准备动画采用', 'M04'); }
        for (const value of prepared) this.prepared.set(value.preparationId, batch); return { ok: true as const, value: prepared, warnings: [] };
      } catch (reason) { await this.finish(batch, true); throw reason; }
    })();
    this.pending.add(pending); try { return await pending; } finally { this.pending.delete(pending); }
  }
  pendingVariants() {
    return [...new Set(this.prepared.values())].flatMap(batch => batch.coordinator.pendingVariants());
  }
  async finish(batch: ImportBatch, discard: boolean) {
    if (!batch.finished) batch.finished = (async () => {
      try { if (discard) for (const id of batch.ids) await batch.coordinator?.discard(id); }
      finally { for (const id of batch.ids) this.prepared.delete(id); batch.ids.clear(); await batch.lease.release(); }
    })();
    await batch.finished;
  }
  async confirm(ids: string[]) {
    const batches = new Set<PreparedBatch>();
    for (const id of ids) { const batch = this.prepared.get(id); if (!batch) continue; batch.coordinator.confirm([id]); batch.ids.delete(id); this.prepared.delete(id); batches.add(batch); }
    for (const batch of batches) if (!batch.ids.size) await this.finish(batch, false);
  }
  async discard(id: string) {
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
