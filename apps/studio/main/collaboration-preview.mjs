import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createId, parseAnimationResource } from '@galcraft/contracts';
import { SessionController, resolvePreviewEntry } from '@galcraft/runtime';
import { StageCommandService } from '@galcraft/stage/commands';
import { PlayerDataService } from '@galcraft/player-ui/data';
import { PlayerLongTermService } from '@galcraft/player-ui/long-term';
import { emptyContributions, loadPluginRuntime } from '@galcraft/plugins';
import { assetFilePath } from '@galcraft/assets';
import { compileCollaborationProject } from './collaboration-compile.mjs';

const ok = value => ({ ok: true, value, warnings: [] });
const value = result => { if (!result.ok) throw new Error(result.error.message); return result.value; };

/** Real M03/M05/M06 route preparation in the same isolated author profile used for previews. */
export async function authoringPreview(production, input, plugins) {
  const ctx = await production.current(), compiled = await compileCollaborationProject({production,plugins},ctx.project);
  if (!compiled.snapshot) return { issues: compiled.issues, reached: false, snapshotId: null };
  const snapshot = compiled.snapshot, entry = resolvePreviewEntry(snapshot, input.target ?? null, input.entryId, !!input.entryId);
  const domain = { projectId: snapshot.projectId, kind: 'playtest', instance: `collaboration-${createId()}` }, storage = new Map(); let revision = 0;
  const data = new PlayerDataService({ target: 'windows', storage: {
    read: async key => ok(storage.get(key) ?? null),
    commit: async batch => { if (batch.expectedRevision !== revision) throw new Error('预览资料版本冲突'); for (const write of batch.writes) storage.set(write.key, write.bytes); for (const key of batch.deletes) storage.delete(key); return ok({ revision: ++revision }); },
  } }, domain, snapshot.project.languages.menuDefault, snapshot.project.languages.voiceDefault);
  value(await data.open()); const longTerm = new PlayerLongTermService(data), contributions = emptyContributions(), instances = [];
  try {
    for (const dependency of snapshot.lock.plugins) {
      const exact = value(await plugins.exactDirectory(dependency.id, dependency.version));
      const instance = await loadPluginRuntime(exact.directory, exact.manifest); instances.push(instance);
      const offered = await instance.activate({ ...plugins.context(dependency.id, 'windows', ctx.project), domain });
      for (const collection of Object.keys(contributions)) contributions[collection].push(...offered[collection] ?? []);
    }
    const runtime = new SessionController({ longTerm, contributions,
      stage: new StageCommandService({
        asset: (id, variantId) => { const asset = snapshot.assets.find(asset => asset.assetId === id && (!variantId || asset.variantId === variantId)); if (!asset) throw new Error(`素材缺失 ${id}`); return ok({ variantId: asset.variantId, kind: asset.kind, provider: asset.provider?.id ?? null, providerVersion: asset.provider?.version ?? null }); },
        character: id => snapshot.characters.find(character => character.id === id),
        animation: async (id, parameters) => { const asset = snapshot.assets.find(asset => asset.assetId === id); if (!asset) throw new Error(`动画素材缺失 ${id}`); const entryPath = typeof asset.entry === 'string' ? asset.entry : asset.entry?.path; return parseAnimationResource(await readFile(join(ctx.root, assetFilePath(id, asset.variantId, entryPath)), 'utf8'), parameters); },
      }), onCommitted: () => ({ presentationEntered: true, mediaStarted: false }),
    });
    try {
      const target = input.target ?? entry.entry;
      const scenario = { schemaVersion: 1, id: createId(), name: '外部协作完整入口预览', projectId: snapshot.projectId, engineVersion: snapshot.engineVersion,
        pluginVersions: [snapshot.lock.engine, ...snapshot.lock.plugins, snapshot.lock.template], entry: entry.entry, target,
        route: input.route ?? [], playerInputs: input.playerInputs ?? [], initialProgress: entry.initialProgress, pluginInitial: {}, externalPolicy: 'simulate' };
      const preparation = await runtime.prepareSession({ snapshot, domain, source: { kind: 'entry', scenario }, target, evaluateTarget: true, routePolicy: 'unique', story: entry.story });
      if (!preparation.ok) return { snapshotId: snapshot.snapshotId, entry, target, reached: false, domain,
        issues: [...compiled.issues, ...preparation.issues], mediaPlayback: 'notExecuted' };
      const prepared = preparation.value;
      return { snapshotId: snapshot.snapshotId, entry, target, reached: prepared.reached, blockedAt: prepared.blockedAt, routePreparation: prepared.routePreparation,
        state: prepared.state, domain, issues: [...compiled.issues, ...prepared.issues], mediaPlayback: 'notExecuted' };
    } finally { runtime.dispose(); }
  } finally { await Promise.allSettled(instances.map(instance => instance.deactivate())); }
}
