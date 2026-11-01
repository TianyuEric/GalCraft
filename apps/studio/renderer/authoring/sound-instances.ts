import { parse } from '@galcraft/dsl';
import type { Asset } from '@galcraft/contracts';
import type { SceneSource } from './controller.js';
export type SoundInstanceOption = { id: string; name: string; source: string; loop: boolean; current: boolean };
/** Authoring reachability is distinct from live playback: branch-dependent entries stay explicit. */
export function soundInstances(scenes: readonly SceneSource[], sceneId: string | undefined, statementId: string | undefined, assets: readonly Asset[]): SoundInstanceOption[] {
  const nearby = new Map<string, SoundInstanceOption>(), elsewhere = new Map<string, SoundInstanceOption>();
  for (const scene of scenes) {
    const local = scene.sceneId === sceneId;
    for (const [index, node] of parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }).cst.entries()) {
      if (local && node.id === statementId) break;
      const args = node.object?.value as Record<string, unknown> | undefined;
      if (!node.valid || node.command !== 'playEffect' || !args) continue;
      if ((args.op ?? 'play') === 'stop') { if (local) { if (args.all) nearby.clear(); else nearby.delete(String(args.soundId)); } continue; }
      if (typeof args.soundId !== 'string' || typeof args.assetId !== 'string') continue;
      const item = { id: args.soundId, name: assets.find(asset => asset.id === args.assetId)?.name ?? args.assetId,
        source: `${scene.name} · ${index + 1}`, loop: args.loop === true, current: local && !args.when };
      (local ? nearby : elsewhere).set(item.id, item);
    }
  }
  return [...nearby.values(), ...[...elsewhere.values()].filter(item => !nearby.has(item.id)).map(item => ({ ...item, current: false }))];
}
