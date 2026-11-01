import { createId } from '@galcraft/contracts';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import type { Contributions, GalCraftPlugin, PluginContext, PluginDefinition } from '../contracts/sdk.js';
import type { PluginManifest } from '../contracts/manifest.js';
import { emptyContributions } from '../contracts/state-adapter.js';
import { packageFileRevisions } from './package-files.js';

type ModuleGraph = { revisions: Awaited<ReturnType<typeof packageFileRevisions>>; snapshot: string; references: number; ready: Promise<void> };
const graphs = new Map<string, ModuleGraph>();

/** One ESM identity per actual file revision, shared by all leases of that revision. */
export async function preparePluginModuleGraph(directory: string, manifest: PluginManifest) {
  directory = resolve(directory);
  const revisions = await packageFileRevisions(directory, manifest);
  let graph = graphs.get(directory);
  if (!graph || !isDeepStrictEqual(graph.revisions, revisions)) {
    graph = { revisions, snapshot: join(directory, '..', '.galcraft-load', createId()), references: 0, ready: Promise.resolve() };
    graphs.set(directory, graph);
  }
  const selected = graph;
  if (selected.references++ === 0) selected.ready = selected.ready.then(async () => {
    await mkdir(selected.snapshot, { recursive: true });
    await writeFile(join(selected.snapshot, 'package.json'), '{"type":"module"}');
    for (const file of manifest.files) {
      const destination = join(selected.snapshot, file.path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(directory, file.path), destination);
    }
  });
  let released = false;
  const release = async () => {
    if (released) return; released = true;
    if (--selected.references === 0) {
      selected.ready = selected.ready.catch(() => {}).then(() => rm(selected.snapshot, { recursive: true, force: true }));
      await selected.ready;
    }
  };
  try { await selected.ready; }
  catch (error) { await release(); throw error; }
  return { directory: selected.snapshot,
    importEntry: (entry: string): Promise<Record<string, any>> => import(pathToFileURL(join(selected.snapshot, entry)).href), release };
}

export async function acquirePluginDefinition(directory: string, manifest: PluginManifest): Promise<{ definition: PluginDefinition; release(): Promise<void> }> {
  if (!manifest.entry.definition) return { definition: {}, release: async () => {} };
  const graph = await preparePluginModuleGraph(directory, manifest);
  try {
    const module = await graph.importEntry(manifest.entry.definition);
    const definition: PluginDefinition = module.createDefinition ? await module.createDefinition() : module.definition ?? module.default;
    if (!definition || typeof definition !== 'object') throw new Error(`${manifest.id} definition entry must export createDefinition or definition`);
    return { definition, release: graph.release };
  } catch (error) { await graph.release(); throw error; }
}
/** Definitions contain synchronous data callbacks; callers needing deferred imports retain acquirePluginDefinition's lease. */
export async function loadPluginDefinition(directory: string, manifest: PluginManifest): Promise<PluginDefinition> {
  const lease = await acquirePluginDefinition(directory, manifest);
  try { return lease.definition; } finally { await lease.release(); }
}

function merge(into: Contributions, offered: Partial<Contributions>) {
  for (const collection of Object.keys(into) as (keyof Contributions)[])
    (into[collection] as unknown[]).push(...(offered[collection] ?? []));
}
export async function loadPluginEntries(directory: string, manifest: PluginManifest, mode: 'all' | 'services' | 'runtime'): Promise<GalCraftPlugin> {
  const graph = await preparePluginModuleGraph(directory, manifest), instances: GalCraftPlugin[] = [];
  const releases: (() => void | Promise<void>)[] = [], controller = new AbortController();
  let contextForLog: PluginContext | null = null;
  let disposed = false;
  return {
    activate: async rawContext => {
      contextForLog = rawContext;
      const context: PluginContext = { ...rawContext, signal: controller.signal,
        onDispose: release => { releases.push(release); } };
      const result = emptyContributions();
      if (manifest.entry.definition) {
        const module = await graph.importEntry(manifest.entry.definition);
        const definition: PluginDefinition = module.createDefinition ? await module.createDefinition() : module.definition ?? module.default;
        if (!definition || typeof definition !== 'object') throw new Error(`${manifest.id} missing definition export`);
        result.documents.push(...definition.documents ?? []);
        result.assetTypes!.push(...definition.assetTypes ?? []);
        result.productionOperations!.push(...definition.productionOperations ?? []);
      }
      const editorNeeded = manifest.contributions.some(item => (['tool', 'fieldEditor', 'assetEditor', 'assetPreview', 'assetThumbnail'].includes(item.kind) && !(item.kind==='tool'&&manifest.externalTools?.includes(item.key))) || item.kind === 'document' && !manifest.entry.definition);
      const entries = mode === 'runtime' ? [manifest.entry.runtime] : mode === 'services' ? [manifest.entry.services] : [manifest.entry.runtime,
        ...(context.domain?.kind === 'player' ? [] : [manifest.entry.services, ...(editorNeeded ? [manifest.entry.editor] : [])])];
      for (const entry of new Set(entries.filter((item): item is string => !!item))) {
        const module = await graph.importEntry(entry);
        const plugin: GalCraftPlugin = module.createPlugin ? module.createPlugin() : module.default;
        if (!plugin || typeof plugin.activate !== 'function' || typeof plugin.deactivate !== 'function') throw new Error(`${entry} must export createPlugin or GalCraftPlugin`);
        instances.push(plugin);
        merge(result, await plugin.activate(context));
      }
      return result;
    },
    deactivate: async () => {
      if (disposed) return; disposed = true; controller.abort();
      const stopped = await Promise.allSettled(instances.map(instance => instance.deactivate()));
      const cleaned = await Promise.allSettled(releases.reverse().map(release => Promise.resolve().then(release)));
      for (const result of [...stopped, ...cleaned]) if (result.status === 'rejected') contextForLog?.log({ code: 'PLUGIN_DISPOSE',
        severity: 'warning', owner: 'M09', message: `${manifest.id}: ${String(result.reason)}`, related: [], actions: ['retry'] });
      await graph.release();
    },
  };
}
export const loadPluginServices = (directory: string, manifest: PluginManifest) => loadPluginEntries(directory, manifest, 'services');

export const loadPluginRuntime = (directory: string,manifest:PluginManifest)=>loadPluginEntries(directory,manifest,'runtime');
