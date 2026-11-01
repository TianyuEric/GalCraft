import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PluginManifestSchema } from '@galcraft/plugins/contracts';

const ok = value => ({ ok: true, value, warnings: [] });
const fail = (code, message) => { const error = { code, message, owner: 'M09', severity: 'error', related: [], actions: ['retry'] }; return { ok: false, error, issues: [error] }; };

/** Native entries are loaded exclusively by the Windows main process. */
export async function loadNativePlatforms({ releaseRoot, snapshot, arch = process.arch, domain = { projectId: snapshot.projectId, kind: 'player', instance: 'default' }, importModule = url => import(url) }) {
  if (domain.kind !== 'player') return { invoke: async (name, args) => ok({ status: 'simulated', name, args }), dispose: async () => {}, available: [] };
  const providers = new Map(), failures = new Map(), active = [];
  for (const dependency of snapshot.lock.plugins) {
    const directory = join(releaseRoot, 'plugins/runtime', dependency.id, dependency.version);
    const manifest = PluginManifestSchema.parse(JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')));
    const native = manifest.native.find(item => item.target === 'windows' && item.arch === arch);
    if (!native) continue;
    const declarations = manifest.contributions.filter(item => item.kind === 'platform' && item.targets.includes('windows'));
    try {
      const module = await importModule(pathToFileURL(join(directory, native.entry)).href);
      if (typeof module.createPlatformProvider !== 'function') throw new Error('Native entry must export createPlatformProvider');
      const provider = await module.createPlatformProvider({ pluginId: manifest.id, target: 'windows', arch,
        config: snapshot.pluginDocuments[manifest.id] ?? {}, domain, projectPlatform: snapshot.project.platform,
        runtime: { releaseDirectory: releaseRoot, executable: process.execPath } });
      if (!provider || typeof provider.invoke !== 'function') throw new Error('Native platform provider must implement invoke');
      active.push(provider);
      for (const declaration of declarations) providers.set(declaration.key, provider);
    } catch (error) {
      for (const declaration of declarations) failures.set(declaration.key, String(error));
    }
  }
  return {
    invoke: async (name, args) => {
      const separator = typeof name === 'string' ? name.indexOf(':') : -1;
      if (separator < 1) return fail('PLATFORM_ACTION', 'Platform operation requires a contribution key and action');
      const key = name.slice(0, separator), action = name.slice(separator + 1), provider = providers.get(key);
      if (!provider) return fail('PLATFORM_UNAVAILABLE', failures.get(key) ?? `No native provider for ${key} on windows/${arch}`);
      try { return await provider.invoke(action, args); }
      catch (error) { return fail('PLATFORM_NATIVE', String(error)); }
    },
    dispose: async () => { await Promise.allSettled(active.splice(0).map(provider => provider.dispose?.())); providers.clear(); },
    available: [...providers.keys()],
  };
}
