import { createId } from '@galcraft/contracts';
import { copyFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { isDeepStrictEqual } from 'node:util';
import type { Issue, Result } from '@galcraft/contracts';
import { PluginManifestSchema } from '../contracts/manifest.js';
import type { PluginManifest } from '../contracts/manifest.js';
import { checkPackageGraph } from './package-check.js';
import { packageFileRevisions } from './package-files.js';

function fail<T>(code: string, message: string): Result<T> {
  const error: Issue = { code, severity: 'error', message, owner: 'M09', related: [], actions: ['supplyDependency'] };
  return { ok: false, error, issues: [error] };
}

async function sameInstalledPackage(source: string, installed: string, manifest: PluginManifest): Promise<boolean> {
  try {
    const installedManifest = PluginManifestSchema.parse(JSON.parse(await readFile(join(installed, 'manifest.json'), 'utf8')));
    if (!isDeepStrictEqual(installedManifest, manifest)) return false;
    for (const file of manifest.files) {
      const [incoming, existing] = await Promise.all([
        readFile(join(source, file.path)), readFile(join(installed, file.path)),
      ]);
      if (!incoming.equals(existing)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export class PluginPackageStore {
  private inspections = new Map<string, { source: string; revisions: Awaited<ReturnType<typeof packageFileRevisions>>; manifest: PluginManifest }>();
  constructor(private readonly root: string) {}

  async inspectDirectory(directory: string): Promise<Result<PluginManifest>> {
    let input: unknown, source: string;
    try {
      source = await readFile(join(directory, 'manifest.json'), 'utf8');
      input = JSON.parse(source);
    } catch (error) {
      return fail('PLUGIN_LOAD', `无法读取插件清单：${String(error)}`);
    }
    const parsed = PluginManifestSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues.some(item => item.message.startsWith('PLUGIN_STATE_DUPLICATE')) ? 'PLUGIN_STATE_DUPLICATE' : 'PLUGIN_LOAD',
        parsed.error.issues.map(item => `${item.path.join('.')}: ${item.message}`).join('; '));
    }
    for (const file of parsed.data.files) {
      try {
        const actual = await stat(join(directory, file.path));
        if (!actual.isFile() || actual.size !== file.size) return fail('PLUGIN_LOAD', `文件与清单不符：${file.path}`);
      } catch {
        return fail('PLUGIN_LOAD', `清单文件缺失：${file.path}`);
      }
    }
    const revisions = await packageFileRevisions(directory, parsed.data);
    const previous = this.inspections.get(directory);
    if (previous?.source === source && isDeepStrictEqual(previous.revisions, revisions))
      return { ok: true, value: structuredClone(previous.manifest), warnings: [] };
    const graphIssues = await checkPackageGraph(directory, parsed.data);
    if (graphIssues.length) return { ok: false, error: graphIssues[0]!, issues: graphIssues };
    this.inspections.set(directory, { source, revisions, manifest: parsed.data });
    return { ok: true, value: parsed.data, warnings: [] };
  }

  async installDirectory(directory: string): Promise<Result<{ manifest: PluginManifest; directory: string }>> {
    const inspected = await this.inspectDirectory(directory);
    if (!inspected.ok) return { ok: false, error: inspected.error, issues: inspected.issues };
    const manifest = inspected.value;
    const destination = join(this.root, manifest.id, manifest.version);
    let replacing = false;
    try {
      await stat(destination);
      if (await sameInstalledPackage(directory, destination, manifest)) return { ok: true, value: { manifest, directory: destination }, warnings: [] };
      replacing = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return fail('PLUGIN_LOAD', `无法检查已安装插件：${String(error)}`);
    }

    const staged = join(this.root, manifest.id, `${manifest.version}.staging-${createId()}`);
    const previous = `${staged}.previous`;
    let moved = false, committed = false;
    const move = async (source: string, target: string) => {
      for (let attempt = 0; ; attempt++) {
        try { await rename(source, target); return; }
        catch (error) {
          if (process.platform !== 'win32' || !['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '') || attempt >= 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    };
    try {
      await mkdir(staged, { recursive: true });
      await copyFile(join(directory, 'manifest.json'), join(staged, 'manifest.json'));
      for (const file of manifest.files) {
        const destinationFile = join(staged, file.path);
        await mkdir(dirname(destinationFile), { recursive: true });
        await copyFile(join(directory, file.path), destinationFile);
      }
      if (replacing) { await move(destination, previous); moved = true; }
      try { await move(staged, destination); committed = true; }
      catch (error) { if (moved) await move(previous, destination); throw error; }
      return { ok: true, value: { manifest, directory: destination }, warnings: [] };
    } catch (error) {
      await rm(staged, { recursive: true, force: true });
      return fail('PLUGIN_LOAD', `插件安装失败：${String(error)}`);
    } finally {
      if (committed) await rm(previous, { recursive: true, force: true });
    }
  }
}
