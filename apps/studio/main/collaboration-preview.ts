import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createId, parseAnimationResource, type DebugScenario, type Domain, type Result } from '@galcraft/contracts';
import { SessionController, resolvePreviewEntry } from '@galcraft/runtime';
import { StageCommandService } from '@galcraft/stage/commands';
import { PlayerDataService } from '@galcraft/player-ui/data';
import { PlayerLongTermService } from '@galcraft/player-ui/long-term';
import { emptyContributions, loadPluginRuntime } from '@galcraft/plugins';
import { assetFilePath } from '@galcraft/assets';
import { compileCollaborationProject } from './collaboration-compile.mjs';
import { DialoguePreviewTargetSchema, PreviewRouteFields, resolvePreviewEventSource } from './collaboration-preview-target.ts';
import { awaitPreviewCapture } from './preview-capture-protocol.ts';
import type { StudioProduction } from './production-providers.mts';
import type { StudioPluginPackages } from './plugin-packages.mjs';
import type { CompilationState } from '@galcraft/dsl';
import { z } from 'zod';

const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
const value = <T>(result: Result<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };
const StatePreview = z.union([
  z.object({ ...PreviewRouteFields, ...DialoguePreviewTargetSchema.shape }),
  z.object({ ...PreviewRouteFields, eventId: z.undefined().optional() }),
]);

/** Real M03/M05/M06 route preparation in the same isolated author profile used for previews. */
export async function authoringPreview(production: StudioProduction, raw: unknown, plugins: StudioPluginPackages, signal?: AbortSignal) {
  const input = StatePreview.parse(raw);
  signal?.throwIfAborted();
  const ctx = await production.current();
  const compiled: CompilationState = await compileCollaborationProject({ production, plugins }, ctx.project);
  signal?.throwIfAborted();
  if (!compiled.snapshot) return { issues: compiled.issues, reached: false, snapshotId: null };
  const snapshot = compiled.snapshot, entry = resolvePreviewEntry(snapshot, input.target ?? null, input.entryId, !!input.entryId);
  const eventSource = resolvePreviewEventSource(snapshot, input);
  const domain: Domain = { projectId: snapshot.projectId, kind: 'playtest', instance: `collaboration-${createId()}` };
  const storage = new Map<string, Uint8Array>();
  let revision = 0;
  const data = new PlayerDataService({ target: 'windows', storage: {
    read: async key => ok(storage.get(key) ?? null),
    commit: async batch => { if (batch.expectedRevision !== revision) throw new Error('预览资料版本冲突'); for (const write of batch.writes) storage.set(write.key, write.bytes); for (const key of batch.deletes) storage.delete(key); return ok({ revision: ++revision }); },
  } }, domain, snapshot.project.languages.menuDefault, snapshot.project.languages.voiceDefault);
  value(await data.open());
  const longTerm = new PlayerLongTermService(data), contributions = emptyContributions(), instances: Awaited<ReturnType<typeof loadPluginRuntime>>[] = [];
  try {
    for (const dependency of snapshot.lock.plugins) {
      signal?.throwIfAborted();
      const exact = value<{ directory: string; manifest: Parameters<typeof loadPluginRuntime>[1] }>(await plugins.exactDirectory(dependency.id, dependency.version));
      const instance = await loadPluginRuntime(exact.directory, exact.manifest); instances.push(instance);
      const offered = await instance.activate({ ...plugins.context(dependency.id, 'windows', ctx.project), domain });
      for (const collection of Object.keys(contributions) as (keyof typeof contributions)[]) {
        const target: unknown[] | undefined = contributions[collection];
        target?.push(...offered[collection] ?? []);
      }
    }
    const runtime = new SessionController({ longTerm, contributions,
      stage: new StageCommandService({
        asset: (id, variantId) => {
          const asset = snapshot.assets.find(asset => asset.assetId === id && (!variantId || asset.variantId === variantId));
          if (!asset) throw new Error(`素材缺失 ${id}`);
          const pluginId = asset.typeData?.provider.id ?? (asset.provider === 'galcraft.live2d' ? 'org.galcraft.live2d' : asset.provider?.split('/')[0]);
          return ok({ variantId: asset.variantId, kind: asset.kind, provider: asset.provider,
            providerVersion: snapshot.lock.plugins.find(plugin => plugin.id === pluginId)?.version ?? null });
        },
        character: id => snapshot.characters.find(character => character.id === id),
        animation: async (id, parameters) => { const asset = snapshot.assets.find(asset => asset.assetId === id); if (!asset) throw new Error(`动画素材缺失 ${id}`); return parseAnimationResource(await readFile(join(ctx.root, assetFilePath(id, asset.variantId, asset.entry)), 'utf8'), parameters); },
      }), onCommitted: () => ({ presentationEntered: true, mediaStarted: false }),
    });
    try {
      const target = input.target ?? entry.entry;
      const scenario: DebugScenario = { schemaVersion: 1, id: createId(), name: '外部协作完整入口预览', projectId: snapshot.projectId, engineVersion: snapshot.engineVersion,
        pluginVersions: [snapshot.lock.engine, ...snapshot.lock.plugins, snapshot.lock.template], entry: entry.entry, target,
        route: input.route ?? [], playerInputs: input.playerInputs ?? [], initialProgress: entry.initialProgress, pluginInitial: {}, externalPolicy: 'simulate' };
      const preparation = await awaitPreviewCapture(runtime.prepareSession({ snapshot, domain, source: { kind: 'entry', scenario }, target, evaluateTarget: true, routePolicy: 'unique', story: entry.story }), signal);
      if (!preparation.ok) return { snapshotId: snapshot.snapshotId, entry, target, reached: false, domain,
        issues: [...compiled.issues, ...preparation.issues], mediaPlayback: 'notExecuted' };
      const prepared = preparation.value;
      const inspection = eventSource?.eventId && prepared.reached ? await runtime.prepareDialogueInspection(prepared.id, eventSource.eventId) : null;
      if (inspection && !inspection.ok) return { snapshotId: snapshot.snapshotId, entry, target, reached: false, domain,
        issues: [...compiled.issues, ...prepared.issues, ...inspection.issues], mediaPlayback: 'notExecuted' };
      return { snapshotId: snapshot.snapshotId, entry, target, reached: prepared.reached, blockedAt: prepared.blockedAt, routePreparation: prepared.routePreparation,
        state: inspection?.value ?? prepared.state, ...(inspection ? { eventSource } : {}), domain,
        issues: [...compiled.issues, ...prepared.issues], mediaPlayback: 'notExecuted' };
    } finally { runtime.dispose(); }
  } finally { await Promise.allSettled(instances.map(instance => instance.deactivate())); }
}
