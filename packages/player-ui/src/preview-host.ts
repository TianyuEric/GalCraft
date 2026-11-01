import type { Domain, PlayerHost } from '@galcraft/contracts';
import { fail, ok } from './common.js';
export class PreviewHost implements PlayerHost {
  readonly target = 'web';
  private values = new Map<string, Uint8Array>();
  private revision = 0;
  constructor(readonly domain: Domain, readonly resources: PlayerHost['resources'], private readonly root: HTMLElement) {
    if (domain.kind === 'player') throw new Error('预览不可使用正式玩家资料域');
  }
  readonly storage: PlayerHost['storage'] = {
    read: async key => ok(this.values.get(key)?.slice() ?? null),
    commit: async batch => {
      const prefix = `player/${this.domain.projectId}/${this.domain.kind}/${encodeURIComponent(this.domain.instance)}/`;
      if (JSON.stringify(batch.domain) !== JSON.stringify(this.domain) || [...batch.writes.map(item => item.key), ...batch.deletes].some(key => !key.startsWith(prefix)))
        return fail('STORAGE_DOMAIN', '预览资料域不一致');
      if (batch.expectedRevision !== this.revision) return fail('STORAGE_STALE', '预览资料已变化');
      for (const write of batch.writes) this.values.set(write.key, write.bytes.slice());
      for (const key of batch.deletes) this.values.delete(key); return ok({ revision: ++this.revision });
    },
  };
  readonly transfer: PlayerHost['transfer'] = { importFile: async () => ok(null), exportFile: async () => ok(undefined) };
  viewport() { const { width, height } = this.root.getBoundingClientRect(); return { width, height, pixelRatio: devicePixelRatio,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, orientation: width >= height ? 'landscape' as const : 'portrait' as const }; }
  subscribeLifecycle(fn: Parameters<PlayerHost['subscribeLifecycle']>[0]) {
    const onFocus = () => fn({ type: 'focus', at: new Date().toISOString() });
    const onBlur = () => fn({ type: 'blur', at: new Date().toISOString() });
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); };
  }
  subscribeInput() { return () => {}; }
  async close() { return ok(undefined); }
  async platform() { return ok({ status: 'simulated' }); }
  dispose() { this.values.clear(); this.revision = 0; }
}
