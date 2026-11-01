import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type Issue, type Lock, type Project, type Result, type Target,
  VersionSchema,
} from '@galcraft/contracts';
import { EngineManifestSchema, type EngineManifest } from './manifest.js';

export type ResolvedEngine = {
  manifest: EngineManifest;
  directory: string;
  target: Target;
  availability: 'ready';
};

export type EngineBinding = ResolvedEngine & {
  compiler: string;
  player: string;
  upgrade: string | null;
  releaseNotes: string;
};

function issue(code: string, message: string, actions: Issue['actions']): Issue {
  return { code, severity: 'error', message, owner: 'M11', related: [], actions };
}

function failure<T>(error: Issue): Result<T> {
  return { ok: false, error, issues: [error] };
}

function success<T>(value: T, warnings: Issue[] = []): Result<T> {
  return { ok: true, value, warnings };
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function filePath(directory: string, relative: string): string {
  return join(directory, ...relative.split('/'));
}

/** Reads installed, immutable runtime packages from Studio userData/engines. */
export class EngineCatalog {
  readonly directory: string;

  constructor(studioUserData: string) {
    this.directory = join(studioUserData, 'engines');
  }

  async listEngines(): Promise<Result<EngineManifest[]>> {
    let entries;
    try {
      entries = await readdir(this.directory, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return success([]);
      return failure(issue('ENGINE_IO', `Cannot read engine directory: ${this.directory}`, ['retry']));
    }
    const manifests: EngineManifest[] = [];
    const warnings: Issue[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !VersionSchema.safeParse(entry.name).success) continue;
      const resolved = await this.readInstalled(entry.name);
      if (resolved.ok) manifests.push(resolved.value.manifest);
      else warnings.push({ ...resolved.error, severity: 'warning' });
    }
    manifests.sort((a, b) => a.version.localeCompare(b.version, 'en', { numeric: true }));
    return success(manifests, warnings);
  }

  async listCreationVersions(target: Target): Promise<Result<EngineManifest[]>> {
    const listed = await this.listEngines();
    if (!listed.ok) return listed;
    return success(listed.value.filter(manifest => manifest.targets.includes(target)), listed.warnings);
  }

  async resolveEngine(version: string, target: Target): Promise<Result<ResolvedEngine>> {
    if (!VersionSchema.safeParse(version).success) {
      return failure(issue('ENGINE_VERSION_INVALID', `Engine version must be exact SemVer: ${version}`, ['chooseTarget']));
    }
    const installed = await this.readInstalled(version);
    if (!installed.ok) return installed;
    if (!installed.value.manifest.targets.includes(target)) {
      return failure(issue('ENGINE_UNSUPPORTED', `Engine ${version} does not support ${target}`, ['chooseTarget']));
    }
    return success({ ...installed.value, target, availability: 'ready' });
  }

  async resolveProjectEngine(project: Project, lock: Lock, target: Target): Promise<Result<EngineBinding>> {
    if (lock.engine.kind !== 'engine' || lock.engine.id !== 'galcraft' || !lock.engine.required ||
        project.engineVersion !== lock.engine.version) {
      return failure(issue('ENGINE_LOCK_MISMATCH',
        `Project engine ${project.engineVersion} differs from its galcraft Lock`, ['compare']));
    }
    if (!lock.engine.targets.includes(target)) {
      return failure(issue('ENGINE_UNSUPPORTED',
        `Project Lock does not include ${target} for engine ${lock.engine.version}`, ['chooseTarget']));
    }
    const resolved = await this.resolveEngine(lock.engine.version, target);
    if (!resolved.ok) return resolved;
    const { manifest, directory } = resolved.value;
    return success({
      ...resolved.value,
      compiler: filePath(directory, manifest.entries.compiler),
      player: filePath(directory, target === 'windows' ? manifest.entries.playerWindows : manifest.entries.playerWeb),
      upgrade: manifest.entries.upgrade === null ? null : filePath(directory, manifest.entries.upgrade),
      releaseNotes: filePath(directory, manifest.releaseNotes),
    });
  }

  private async readInstalled(version: string): Promise<Result<{ manifest: EngineManifest; directory: string }>> {
    const directory = join(this.directory, version);
    let raw: string;
    try {
      raw = await readFile(join(directory, 'manifest.json'), 'utf8');
    } catch (error) {
      if (isMissing(error)) {
        return failure(issue('ENGINE_MISSING',
          `Engine ${version} is not installed at ${directory}`, ['supplyDependency']));
      }
      return failure(issue('ENGINE_IO', `Cannot read engine ${version} manifest`, ['retry']));
    }
    let document: unknown;
    try {
      document = JSON.parse(raw) as unknown;
    } catch {
      return failure(issue('ENGINE_INVALID', `Engine ${version} manifest is not JSON`, ['supplyDependency']));
    }
    const parsed = EngineManifestSchema.safeParse(document);
    if (!parsed.success || parsed.data.version !== version) {
      return failure(issue('ENGINE_INVALID', `Engine ${version} manifest is invalid or names another version`, ['supplyDependency']));
    }
    for (const file of parsed.data.files) {
      let details;
      try {
        details = await stat(filePath(directory, file.path));
      } catch (error) {
        if (!isMissing(error)) {
          return failure(issue('ENGINE_IO', `Cannot inspect engine ${version} file ${file.path}`, ['retry']));
        }
        return failure(issue('ENGINE_INVALID', `Engine ${version} is missing ${file.path}`, ['supplyDependency']));
      }
      if (!details.isFile() || details.size !== file.size) {
        return failure(issue('ENGINE_INVALID', `Engine ${version} file differs from manifest: ${file.path}`, ['supplyDependency']));
      }
    }
    return success({ manifest: parsed.data, directory });
  }
}
