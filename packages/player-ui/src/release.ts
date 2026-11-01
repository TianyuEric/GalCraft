import { ReleaseManifestSchema, SnapshotSchema } from '@galcraft/contracts';
import type { DebugScenario, Domain, Issue, PlayerHost, Snapshot } from '@galcraft/contracts';
import { emptyContributions, PluginManifestSchema } from '@galcraft/plugins/contracts';
import type { Contributions, GalCraftPlugin, PluginManifest } from '@galcraft/plugins/contracts';
import { ContributionRegistry, createRuntimeDependencyAccess } from '@galcraft/plugins/registry';
import { mountPlayer } from './bootstrap.js';
import { fail, ok } from './common.js';
import { reportCompatibility, type CompatibilityFile } from './compatibility.js';
import type { EngineRestorePort } from './restore.js';
import { loadReleaseFonts } from './fonts.js';
import { installPluginRuntimes } from './plugin-runtimes.js';

async function readJson(url: URL) {
  const response = await fetch(url); if (!response.ok) throw new Error(`Unable to read ${url.pathname}: ${response.status}`); return response.json();
}
export async function readRelease(base: URL) {
  const manifest = ReleaseManifestSchema.parse(await readJson(new URL('release.manifest.json', base)));
  const snapshot = SnapshotSchema.parse(await readJson(new URL(manifest.snapshot, base)));
  if (snapshot.projectId !== manifest.projectId || snapshot.releaseVersion !== manifest.version || snapshot.engineVersion !== manifest.engineVersion)
    throw new Error('Release manifest and snapshot versions differ');
  return { manifest, snapshot };
}
const collections = { command: 'commands', condition: 'conditions', document: 'documents', tool: 'tools', resource: 'resources',
  stage: 'stages', page: 'pages', component: 'components', system: 'systems', platform: 'platform' } as const;

export async function mountRelease(root: HTMLElement, base: URL, host: PlayerHost, snapshot: Snapshot,
  manifest: Awaited<ReturnType<typeof readRelease>>['manifest'], domain: Domain = { projectId: snapshot.projectId, kind: 'player', instance: 'default' }) {
  document.title = snapshot.project.name;
  const icon = snapshot.project.display.icon ? snapshot.assets.find(asset => asset.assetId === snapshot.project.display.icon) : null;
  if (icon) {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.createElement('link');
    link.rel = 'icon'; link.href = new URL(icon.entry, base).href;
    link.type = icon.files.find(file => file.path === icon.entry)?.mime ?? 'image/png';
    document.head.append(link);
  }
  const registry = new ContributionRegistry(), manifests: PluginManifest[] = [], active: GalCraftPlugin[] = [];
  installPluginRuntimes();
  const contributions = emptyContributions();
  let releaseFonts: (() => void) | null = null;
  try {
    releaseFonts = await loadReleaseFonts(root, base);
    let externalRuntime: { url: string; expected: import('@galcraft/contracts').Json } | null = null;
    if (snapshot.assets.some(asset => asset.kind === 'live2d')) {
      const runtime = manifest.live2dRuntime, expected = snapshot.lock.live2dRuntime;
      if (!runtime || !expected || runtime.sdkRelease !== expected.sdkRelease || runtime.coreVersion !== expected.coreVersion ||
        (runtime.motionSync?.coreVersion ?? null) !== expected.motionSyncCoreVersion) throw new Error('Live2D release runtime does not match the project lock');
      const runtimeBase = new URL('runtime/live2d/', base);
      externalRuntime = { url: new URL(runtime.entry, runtimeBase).href, expected };
    }
    for (const dependency of snapshot.lock.plugins) {
      if (!dependency.targets.includes(host.target) && !dependency.required) continue;
      const path = `plugins/runtime/${dependency.id}/${dependency.version}/`;
      const entry = PluginManifestSchema.parse(await readJson(new URL(`${path}manifest.json`, base)));
      if (entry.id !== dependency.id || entry.version !== dependency.version)
        throw new Error(`Release plugin differs from lock: ${dependency.id}@${dependency.version}`);
      const registered = registry.registerInstalled(entry); if (!registered.ok) throw new Error(registered.error.message);
      manifests.push(entry);
    }
    const prepared = registry.prepareContributions(snapshot.lock, host.target, ['runtime']);
    if (!prepared.ok) throw new Error(prepared.error.message);
    for (const dependency of prepared.value.loadOrder) {
      const entry = manifests.find(item => item.id === dependency.id && item.version === dependency.version)!;
      if (!entry.entry.runtime) continue;
      const url = new URL(`plugins/runtime/${entry.id}/${entry.version}/${entry.entry.runtime}`, base).href;
      const module = await import(/* @vite-ignore */ url) as { createPlugin?: () => GalCraftPlugin; default?: GalCraftPlugin };
      const plugin = module.createPlugin ? module.createPlugin() : module.default;
      if (!plugin) throw new Error(`Invalid plugin entry: ${entry.id}`);
      const controller = new AbortController(), releases: (() => void | Promise<void>)[] = [];
      let disposed = false;
      active.push({ activate: context => plugin.activate(context), deactivate: async () => { if (disposed) return; disposed = true; controller.abort(); try { await plugin.deactivate(); } finally { await Promise.allSettled(releases.splice(0).map(release => Promise.resolve().then(release))); } } });
      const offered = await plugin.activate({ pluginId: entry.id, target: host.target, domain, config: snapshot.pluginDocuments[entry.id],
        runtimeDependencies: createRuntimeDependencyAccess(entry.externalRuntimeDependencies ?? [], async key => externalRuntime && key === 'org.galcraft.live2d/cubism'
          ? ok(externalRuntime) : fail('RUNTIME_DEPENDENCY_MISSING', `External runtime is unavailable: ${key}`)),
        signal: controller.signal, onDispose: release => releases.push(release),
        documents: { read: () => fail('RELEASE_DOCUMENT', 'Author documents are unavailable in Player'), propose: () => fail('RELEASE_READ_ONLY', 'Player cannot edit author documents') },
        assets: { resolve: async ref => { const asset = snapshot.assets.find(item => ref.kind === 'variant' ? item.variantId === ref.id : ref.kind === 'asset' && item.assetId === ref.id); return asset ? ok(asset) : fail('ASSET_MISSING', ref.id); },
          readBytes: async (resource, path) => { if (!resource.files.some(file => file.path === path)) throw new Error(`Undeclared resource file: ${path}`);
            const response = await fetch(new URL(path, base)); if (!response.ok) throw new Error(`Missing resource: ${path}`); return new Uint8Array(await response.arrayBuffer()); },
          readText: async (resource, path) => { if (!resource.files.some(file => file.path === path)) throw new Error(`Undeclared resource file: ${path}`);
            const response = await fetch(new URL(path, base)); if (!response.ok) throw new Error(`Missing resource: ${path}`); return response.text(); } },
        platform: { invoke: (key, action, args) => domain.kind === 'player' ? host.platform(`${key}:${action}`, args) : Promise.resolve(ok({ status: 'simulated', action, args })) },
        pages: { open: async () => fail('PAGE_NAVIGATION', 'Use the Player page action') }, log: issue => console.warn(issue.code, issue.message) });
      for (const [kind, collection] of Object.entries(collections) as [keyof typeof collections, keyof Contributions][]) {
        for (const item of offered[collection] ?? []) {
          const key = 'spec' in item ? item.spec.key : 'id' in item ? item.id : item.key, declaration = prepared.value.byKey[key];
          if (declaration?.provider.id === entry.id && declaration.kind === kind) (contributions[collection] as unknown[]).push(item);
          else if (!entry.contributions.some(value => value.kind === kind && value.key === key)) throw new Error(`Undeclared plugin contribution: ${key}`);
        }
      }
    }
    for (const declaration of Object.values(prepared.value.byKey)) {
      if (!(declaration.kind in collections) || ['document', 'tool'].includes(declaration.kind)) continue;
      if (declaration.kind === 'resource' && manifests.find(item => item.id === declaration.provider.id)?.entry.services) continue;
      const collection = collections[declaration.kind as keyof typeof collections];
      if ((contributions[collection] ?? []).filter(item => ('spec' in item ? item.spec.key : 'id' in item ? item.id : item.key) === declaration.key).length !== 1)
        throw new Error(`Missing runtime contribution: ${declaration.key}`);
    }
    for (const platform of contributions.platform) {
      const owner = manifests.find(item => item.id === platform.key.split('/')[0]);
      const invoke = platform.invoke;
      const native = owner?.native.some(item => item.target === host.target);
      platform.invoke = async (action, args, currentDomain) => {
        if (!platform.actions.some(item => item.name === action)) return fail('PLATFORM_ACTION', `Undeclared platform action ${platform.key}:${action}`);
        if (currentDomain.kind !== 'player') return ok({ status: 'simulated', action, args });
        if (native) return host.platform(`${platform.key}:${action}`, args);
        if (!platform.targets.includes(host.target)) return platform.required ? fail('PLATFORM_UNAVAILABLE', `Required platform ${platform.key} is unsupported`) : platform.fallback ? platform.fallback(action, args, currentDomain) : ok({ status: 'skipped', reason: 'targetUnsupported' });
        return invoke(action, args, currentDomain);
      };
    }
    for (const capability of manifest.capabilities.filter(item => item.treatment === 'skipped')) {
      const platform = contributions.platform.find(item => item.key === `${capability.provider}/${capability.feature}`);
      if (platform) {
        const invoke = platform.invoke;
        platform.invoke = (action, args, domain) => domain.kind === 'player'
          ? platform.required ? Promise.resolve(fail('PLATFORM_UNAVAILABLE', capability.reason)) : platform.fallback ? platform.fallback(action, args, domain) : Promise.resolve(ok({ status: 'skipped', reason: capability.reason })) : invoke(action, args, domain);
      }
    }
    const styles: Record<string, string> = {};
    for (const style of snapshot.template.styles) if (style.compiledPath) {
      const response = await fetch(new URL(style.compiledPath, base)); if (!response.ok) throw new Error(`Missing stylesheet: ${style.compiledPath}`);
      let css = await response.text();
      for (const id of style.assets) {
        const asset = snapshot.assets.find(item => item.assetId === id); if (!asset) throw new Error(`Missing CSS asset: ${id}`);
        css = css.replaceAll(`asset:${id}`, new URL(asset.entry, base).href);
      }
      styles[style.compiledPath] = css;
    }
    const conversions = manifest.files.some(file => file.path === 'runtime/engine-conversions.json')
      ? await readJson(new URL('runtime/engine-conversions.json', base)) as { from: string; to: string; entry: string }[] : [];
    const engineRestore: EngineRestorePort = { prepare: async (source, target) => {
      const conversion = conversions.find(item => item.from === source.record.engineVersion && item.to === target.engineVersion);
      if (!conversion) return fail('RESTORE_ENGINE_VERSION', 'No declared engine state conversion');
      try {
        const module = await import(/* @vite-ignore */ new URL(conversion.entry, base).href);
        if (typeof module.convertState !== 'function') return fail('RESTORE_ENGINE_VERSION', 'Engine does not supply a state conversion');
        const converted = await module.convertState({ source: structuredClone(source), target: structuredClone(target) });
        return ok({ source: converted, conversions: [{ provider: 'galcraft', from: conversion.from, to: conversion.to }] });
      } catch (error) { return fail('RESTORE_ENGINE_CONVERSION', String(error)); }
    } };
    const result = await mountPlayer(root, host, snapshot, domain, manifest.entryMappings, contributions.stages,
      { contributions, manifests }, styles, [], engineRestore);
    if (!result.ok) throw new Error(result.error.message);
    const dispose = result.value.view.dispose.bind(result.value.view);
    result.value.view.dispose = () => { dispose(); releaseFonts?.(); void Promise.allSettled(active.splice(0).map(plugin => plugin.deactivate())); };
    root.dataset.releaseReady = snapshot.releaseVersion;
    return { ...result.value, reportCompatibility: (files: CompatibilityFile[], signal?: AbortSignal) => reportCompatibility({
      snapshot, target: host.target, files, signal, restore: result.value.restore, contributions, manifests, entryMappings: manifest.entryMappings }),
      validateScenarios: async (scenarios: DebugScenario[]) => {
        if (domain.kind !== 'sample') throw new Error('Route validation requires a sample domain');
        const reports: { id: string; reached: boolean; issues: Issue[] }[] = [];
        for (const scenario of scenarios) {
          const prepared = await result.value.session.prepareSession({ snapshot, domain, source: { kind: 'entry', scenario }, target: scenario.target });
          if (!prepared.ok) { reports.push({ id: scenario.id, reached: false, issues: prepared.issues }); continue; }
          let stageId: string | null = null;
          try {
            const visual = await result.value.stage.prepareStage(prepared.value.sessionId, prepared.value.state.presentation, null, prepared.value.voiceBinding);
            if (visual.ok) stageId = visual.value.id;
            reports.push({ id: scenario.id, reached: prepared.value.reached && visual.ok,
              issues: [...prepared.value.issues, ...visual.ok ? [] : visual.issues] });
          } finally { if (stageId) result.value.stage.discardPrepared(stageId); result.value.session.disposePrepared(prepared.value.id); }
        }
        return reports;
      } };
  } catch (error) { releaseFonts?.(); await Promise.allSettled(active.map(plugin => plugin.deactivate())); throw error; }
}
