import { LockSchema, TargetSchema } from '@galcraft/contracts';
import type { Issue, Lock, Result, Target, Version } from '@galcraft/contracts';
import { satisfies } from 'semver';
import { PluginManifestSchema } from '../contracts/manifest.js';
import type { ContributionDeclaration, ContributionKind, PluginManifest } from '../contracts/manifest.js';
import { pluginDependencies } from '../contracts/manifest.js';
export { createRuntimeDependencyAccess } from './external-runtimes.js';
import type { PluginEnvironment } from '../contracts/manifest.js';

export type RegisteredContribution = {
  kind: ContributionKind;
  key: string;
  required: boolean;
  provider: { id: string; version: Version };
};
export type PreparedContributionTable = {
  target: Target;
  engineVersion: Version;
  loadOrder: { id: string; version: Version }[];
  byKey: Record<string, RegisteredContribution>;
  byKind: Record<ContributionKind, RegisteredContribution[]>;
};

function issue(code: string, message: string): Issue {
  return { code, severity: 'error', message, owner: 'M09', related: [], actions: ['supplyDependency'] };
}
function fail<T>(first: Issue, rest: Issue[] = []): Result<T> {
  return { ok: false, error: first, issues: [first, ...rest] };
}
function equalJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (typeof left !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => equalJson(value, right[index]));
  }
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equalJson(a[key], b[key]));
}

export class ContributionRegistry {
  private readonly installed = new Map<string, Map<Version, PluginManifest>>();
  private current: PreparedContributionTable | null = null;

  registerInstalled(input: unknown): Result<PluginManifest> {
    const parsed = PluginManifestSchema.safeParse(input);
    if (!parsed.success) return fail(issue(parsed.error.issues.some(item => item.message.startsWith('PLUGIN_STATE_DUPLICATE')) ? 'PLUGIN_STATE_DUPLICATE' : 'PLUGIN_LOAD',
      parsed.error.issues.map(item => `${item.path.join('.')}: ${item.message}`).join('; ')));
    const manifest = parsed.data;
    const versions = this.installed.get(manifest.id) ?? new Map<Version, PluginManifest>();
    const existing = versions.get(manifest.version);
    if (existing && !equalJson(existing, manifest)) {
      return fail(issue('PACKAGE_VERSION_CONFLICT', `${manifest.id}@${manifest.version} 已安装且声明内容不同`));
    }
    if (!existing) {
      versions.set(manifest.version, manifest);
      this.installed.set(manifest.id, versions);
    }
    return { ok: true, value: structuredClone(existing ?? manifest), warnings: [] };
  }

  resolveExact(id: string, version: Version): PluginManifest | null {
    const manifest = this.installed.get(id)?.get(version);
    return manifest ? structuredClone(manifest) : null;
  }

  prepareContributions(input: Lock, target: Target, environments: PluginEnvironment[] = ['definition', 'editor', 'services', 'runtime']): Result<PreparedContributionTable> {
    const lockResult = LockSchema.safeParse(input);
    if (!lockResult.success || !TargetSchema.safeParse(target).success) {
      return fail(issue('PLUGIN_LOAD', '依赖 Lock 或目标格式无效'));
    }
    const lock = lockResult.data;
    if (!lock.engine.targets.includes(target)) return fail(issue('PLUGIN_TARGET', `引擎 ${lock.engine.id}@${lock.engine.version} 不支持 ${target}`));
    const locked = new Map<string, (typeof lock.plugins)[number]>();
    for (const dependency of lock.plugins) {
      if (locked.has(dependency.id)) return fail(issue('PLUGIN_LOAD', `Lock 重复选择插件 ${dependency.id}`));
      locked.set(dependency.id, dependency);
    }
    const selected = new Map<string, PluginManifest>();
    const warnings: Issue[] = [];
    for (const dependency of lock.plugins) {
      if (!dependency.targets.includes(target)) {
        if (dependency.required) return fail(issue('PLUGIN_TARGET', `必需插件 ${dependency.id}@${dependency.version} 不支持 ${target}`));
        continue;
      }
      const manifest = this.installed.get(dependency.id)?.get(dependency.version);
      if (!manifest) {
        const missing = issue('PLUGIN_LOAD', `缺少锁定插件 ${dependency.id}@${dependency.version}`);
        if (dependency.required) return fail(missing);
        warnings.push({ ...missing, severity: 'warning' });
        continue;
      }
      if (!manifest.targets.includes(target)) return fail(issue('PLUGIN_TARGET', `${manifest.id}@${manifest.version} 未声明 ${target}`));
      if (!satisfies(lock.engine.version, manifest.engineRange)) {
        return fail(issue('PLUGIN_LOAD', `${manifest.id}@${manifest.version} 需要引擎 ${manifest.engineRange}，Lock 为 ${lock.engine.version}`));
      }
      selected.set(manifest.id, manifest);
    }

    const ordered: PluginManifest[] = [];
    const visited = new Set<string>();
    const path: string[] = [];
    const visit = (manifest: PluginManifest): Issue | null => {
      const cycleStart = path.indexOf(manifest.id);
      if (cycleStart >= 0) return issue('PLUGIN_LOAD', `插件循环依赖：${[...path.slice(cycleStart), manifest.id].join(' → ')}`);
      if (visited.has(manifest.id)) return null;
      path.push(manifest.id);
      for (const dependency of environments.flatMap(environment => pluginDependencies(manifest, environment, target))) {
        const lockedDependency = locked.get(dependency.id);
        const provider = selected.get(dependency.id);
        if (!lockedDependency || !provider) return issue('PLUGIN_LOAD', `${manifest.id} 缺少依赖 ${dependency.id} (${dependency.range})`);
        if (!satisfies(lockedDependency.version, dependency.range)) {
          return issue('PLUGIN_LOAD', `${manifest.id} 需要 ${dependency.id}@${dependency.range}，Lock 为 ${lockedDependency.version}`);
        }
        const error = visit(provider);
        if (error) return error;
      }
      path.pop();
      visited.add(manifest.id);
      ordered.push(manifest);
      return null;
    };
    for (const manifest of selected.values()) {
      const error = visit(manifest);
      if (error) return fail(error);
    }

    const offered = new Map<string, RegisteredContribution[]>();
    for (const manifest of ordered) {
      for (const declaration of manifest.contributions) {
        if (!declaration.targets.includes(target)) continue;
        const entry = this.asRegistered(manifest, declaration);
        offered.set(entry.key, [...(offered.get(entry.key) ?? []), entry]);
      }
    }
    const byKey: Record<string, RegisteredContribution> = Object.create(null);
    const byKind: Record<ContributionKind, RegisteredContribution[]> = {
      command: [], condition: [], document: [], tool: [], resource: [], stage: [],
      page: [], component: [], system: [], platform: [],
      textPreparation: [], generationProvider: [], resourceProcessor: [], fieldEditor: [], publishCheck: [], targetBuilder: [], assetType: [], assetEditor: [], assetPreview: [], assetThumbnail: [], productionOperation: [],
    };
    for (const [key, entries] of offered) {
      const kind = entries[0]?.kind;
      if (!kind) continue;
      if (entries.some(entry => entry.kind !== kind)) return fail(issue('CONTRIBUTION_CONFLICT', `贡献键 ${key} 声明了不同类型`));
      const selectedProvider = lock.selectedProviders[key];
      if (entries.length > 1 && !selectedProvider) {
        return fail(issue('CONTRIBUTION_CONFLICT', `贡献键 ${key} 重复：${entries.map(entry => `${entry.provider.id}@${entry.provider.version}`).join('、')}`));
      }
      const chosen = selectedProvider ? entries.find(entry => entry.provider.id === selectedProvider) : entries[0];
      if (!chosen) return fail(issue('CONTRIBUTION_CONFLICT', `贡献键 ${key} 指定的提供者 ${selectedProvider} 不在锁定版本中`));
      byKey[key] = chosen;
      byKind[kind].push(chosen);
    }
    return { ok: true, value: {
      target, engineVersion: lock.engine.version,
      loadOrder: ordered.map(manifest => ({ id: manifest.id, version: manifest.version })), byKey, byKind,
    }, warnings };
  }

  activate(table: PreparedContributionTable): void {
    this.current = structuredClone(table);
  }

  activeContributions(): PreparedContributionTable | null {
    return this.current ? structuredClone(this.current) : null;
  }

  dispose(): void {
    this.current = null;
  }

  private asRegistered(manifest: PluginManifest, declaration: ContributionDeclaration): RegisteredContribution {
    return { kind: declaration.kind, key: declaration.key, required: declaration.required,
      provider: { id: manifest.id, version: manifest.version } };
  }
}
