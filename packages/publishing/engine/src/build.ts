import { createId } from '@galcraft/contracts';

import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { BuildInputSchema, PackageFileSchema, RelativePathSchema, ReleaseManifestSchema, SnapshotSchema } from '@galcraft/contracts';
import type { BuildInput, BuildPlanSummary, BuildReceipt, CompatibilityReport, Issue, PackageFile, Project, ReleaseManifest, Result, Snapshot, TargetCapability, VersionRef } from '@galcraft/contracts';
import type { ResolvedEngine } from './catalog.js';
import { brandWindowsExecutable } from './branding.js';

const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
export function buildIssue(code: string, message: string): Issue {
  return { code, message, severity: 'error', owner: 'M11', related: [], actions: ['retry', 'locate'] };
}
const fail = <T = never>(code: string, message: string): Result<T> => { const error = buildIssue(code, message); return { ok: false, error, issues: [error] }; };
const exists = async (path: string) => { try { await stat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } };
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
async function moveRelease(from: string, to: string) {
  for (let attempt = 0; ; attempt++) {
    try { await rename(from, to); return; }
    catch (error) {
      if (attempt === 10 || !['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}
async function writeCommitLog(path: string, log: CommitLog) {
  await writeFile(`${path}.tmp`, json(log)); await rename(`${path}.tmp`, path);
}
const vector = (items: VersionRef[]) => new Map(items.map(item => [`${item.ref.kind}/${item.ref.id}`, item.revision]));
export function sameSavedVersions(a: VersionRef[], b: VersionRef[]): boolean {
  const left = vector(a), right = vector(b);
  return left.size === a.length && right.size === b.length && left.size === right.size && [...left].every(([key, revision]) => right.get(key) === revision);
}
export type BuildMaterial = {
  project: Project; snapshot: Snapshot; savedVersions: VersionRef[]; engine: ResolvedEngine;
  files: PackageFile[]; textFiles: Record<string, string>; capabilities: TargetCapability[]; issues: Issue[];
  entry: string; gameDirectory: string; instructions: string;
  compatibilityFiles?: { file: string; bytes: number[] }[];
  live2dRuntime?: ReleaseManifest['live2dRuntime'];
  windowsBrand?: { icon: string | null };
};
type FrozenPlan = { summary: BuildPlanSummary; material: BuildMaterial };
export type BuildPhase = 'staging' | 'verifying' | 'committing' | 'completed' | 'failed' | 'cancelled';
export type TargetBuildRunner = (input: { plan: BuildPlanSummary; project: Project; stagingDirectory: string; webEntry: string; options: import('@galcraft/contracts').Json }, signal: AbortSignal) => Promise<Result<{
  entry: string; handoff: { path: string; kind: 'directory' | 'archive' | 'file' }; artifacts: NonNullable<BuildReceipt['artifacts']>;signing?:BuildReceipt['targetSigning'] }>>;
type CommitLog = { output: string; staging: string; previous: string; phase: 'prepared' | 'oldMoved' | 'installed' };

/** Owns only release directories. M02 retains ownership of project documents. */
export class ReleaseBuilder {
  private readonly plans = new Map<string, FrozenPlan>();
  private readonly running = new Map<string, { abort: AbortController; committing: boolean }>();
  private readonly outputs = new Set<string>();
  private readonly receipts = new Map<string, BuildReceipt>();
  private readonly reports = new Map<string, CompatibilityReport>();
  constructor(private readonly verify: (directory: string, manifest: ReleaseManifest, signal: AbortSignal,
    files: NonNullable<BuildMaterial['compatibilityFiles']>) => Promise<Result<{ evidencePaths: string[]; compatibility?: CompatibilityReport }>>,
    private readonly changed: (planId: string, phase: BuildPhase) => void = () => {},
    private readonly signWindows?: (file: string, selection: NonNullable<BuildInput['windowsSigning']>, signal: AbortSignal) => Promise<NonNullable<ReleaseManifest['signature']>>,
    private readonly targetBuild?: TargetBuildRunner) {}

  async checkOutput(input: Pick<BuildInput, 'outputDirectory' | 'projectId' | 'target'>): Promise<Result<void>> {
    const output = resolve(input.outputDirectory);
    if (!isAbsolute(input.outputDirectory) || output === dirname(output)) return fail('BUILD_OUTPUT_INVALID', '请选择专用发行目录');
    try {
      const info = await stat(output);
      if (!info.isDirectory()) return fail('BUILD_OUTPUT_INVALID', '输出路径是文件，请选择专用发行目录');
      if (!(await readdir(output)).length) return ok(undefined);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ok(undefined);
      return fail('BUILD_OUTPUT_INVALID', '无法读取输出目录，请检查路径和访问权限');
    }
    let manifest: ReleaseManifest;
    try { manifest = ReleaseManifestSchema.parse(JSON.parse(await readFile(join(output, 'release.manifest.json'), 'utf8'))); }
    catch { return fail('BUILD_OUTPUT_NOT_RELEASE', '输出目录非空，且没有有效的发行清单。请选择新的空目录，或同一作品、同一目标的已有发行目录'); }
    if (manifest.projectId !== input.projectId || manifest.target !== input.target) return fail('BUILD_OUTPUT_MISMATCH', '输出目录属于其他作品或目标，请为当前作品和目标选择专用发行目录');
    return ok(undefined);
  }

  planBuild(rawInput: unknown, material: BuildMaterial): Result<BuildPlanSummary> {
    const parsed = BuildInputSchema.safeParse(rawInput), checked = SnapshotSchema.safeParse(material.snapshot);
    if (!parsed.success) return fail('BUILD_INPUT_INVALID', parsed.error.message);
    if (!checked.success) return fail('BUILD_VERSION_MISMATCH', checked.error.message);
    const input = parsed.data, snapshot = checked.data;
    if (['android', 'ios'].includes(input.target) && (!input.targetBuilder || input.targetOptions === undefined || !this.targetBuild))
      return fail('BUILD_TARGET_BUILDER_REQUIRED', '请从实际目标目录选择构建器精确版本并填写目标选项');
    const uncovered=snapshot.characters.filter(character=>character.narrativeRole==='main'&&!character.afterstory);
    if(uncovered.length)return fail('AFTERSTORY_COVERAGE',`主角色后日谈尚未配置：${uncovered.map(character=>character.name).join('、')}`);
    const snapshotVersions = snapshot.documents.map(document => ({ ref: { kind: 'document' as const, id: document.documentId }, revision: document.revision }));
    if (input.projectId !== material.project.projectId || input.projectId !== snapshot.projectId || input.snapshotId !== snapshot.snapshotId ||
      input.releaseVersion !== material.project.releaseVersion || input.releaseVersion !== snapshot.project.releaseVersion || input.releaseVersion !== snapshot.releaseVersion ||
      !sameSavedVersions(input.savedVersions, material.savedVersions) || !sameSavedVersions(snapshotVersions, material.savedVersions))
      return fail('BUILD_VERSION_MISMATCH', '所选保存版本、快照和发行版本不一致');
    if (snapshot.engineVersion !== material.engine.manifest.version || input.target !== material.engine.target)
      return fail('BUILD_ENGINE_MISMATCH', '构建运行包与快照的精确引擎或目标不一致');
    if (!isAbsolute(input.outputDirectory) || resolve(input.outputDirectory) === dirname(resolve(input.outputDirectory)))
      return fail('BUILD_OUTPUT_INVALID', '请选择专用发行目录');
    const paths = [...material.files.map(file => file.path), ...Object.keys(material.textFiles),
      `${material.gameDirectory}/snapshot.json`, `${material.gameDirectory}/template.json`, 'README.html'];
    if (paths.some(path => !RelativePathSchema.safeParse(path).success) || material.files.some(file => !PackageFileSchema.safeParse(file).success))
      return fail('BUILD_FILE_INVALID', '发行文件必须使用包内相对路径');
    if (new Set(paths).size !== paths.length || paths.includes('release.manifest.json'))
      return fail('BUILD_FILE_COLLISION', '发行文件路径重复');
    const issueList = [...material.issues, ...material.capabilities.filter(item => item.treatment === 'blocked')
      .map(item => buildIssue('BUILD_CAPABILITY', `${item.provider}/${item.feature}: ${item.reason}`))];
    if (input.target === 'windows' && material.project.release?.windowsSigning === 'certificate' && input.windowsSigning?.mode !== 'certificate')
      issueList.push(buildIssue('BUILD_SIGNING_REQUIRED', '作品选择了证书签名，请选择本机代码签名证书'));
    if (input.target === 'windows' && input.windowsSigning?.mode === 'certificate' && !this.signWindows)
      issueList.push(buildIssue('BUILD_SIGNING_UNAVAILABLE', '当前发行宿主不能访问所选签名证书'));
    const summary: BuildPlanSummary = { planId: createId(), input: { ...input, outputDirectory: resolve(input.outputDirectory) }, issues: issueList, capabilityResults: material.capabilities };
    this.plans.set(summary.planId, structuredClone({ summary, material }));
    return ok(structuredClone(summary));
  }

  receipt(planId: string): Result<BuildReceipt | null> { return ok(structuredClone(this.receipts.get(planId) ?? null)); }
  compatibility(planId: string): Result<CompatibilityReport | null> { return ok(structuredClone(this.reports.get(planId) ?? null)); }
  resolveDirectory(planId: string): string | null { return this.receipts.get(planId)?.outputDirectory ?? null; }
  cancel(planId: string) {
    const task = this.running.get(planId);
    if (!task || task.committing) return { local: task ? 'commitInProgress' : 'alreadyFinished', remote: 'notApplicable' };
    task.abort.abort(); return { local: 'stopped', remote: 'notApplicable' };
  }
  cancelAll(): void { for (const [planId] of this.running) this.cancel(planId); }

  async recover(outputDirectory: string): Promise<void> {
    const output = resolve(outputDirectory), logFile = join(dirname(output), `.${basename(output)}.galcraft-build.json`);
    if (!await exists(logFile)) return;
    const log = JSON.parse(await readFile(logFile, 'utf8')) as CommitLog;
    if (log.output !== output || dirname(log.staging) !== dirname(output) || dirname(log.previous) !== dirname(output) ||
      !basename(log.staging).startsWith(`.${basename(output)}.staging-`) || !basename(log.previous).startsWith(`.${basename(output)}.previous-`))
      throw new Error('发行恢复日志路径无效');
    if (!await exists(output) && await exists(log.previous)) await rename(log.previous, output);
    if (await exists(output) && !await exists(log.staging)) await rm(log.previous, { recursive: true, force: true });
    await rm(logFile, { force: true });
  }

  async build(planId: string): Promise<Result<BuildReceipt>> {
    const planned = this.plans.get(planId);
    if (!planned) return fail('BUILD_PLAN_MISSING', '构建计划不存在');
    const { summary, material } = planned, { input } = summary;
    if (summary.issues.some(issue => issue.severity === 'error')) return fail('BUILD_BLOCKED', summary.issues.map(issue => issue.message).join('\n'));
    const output = input.outputDirectory;
    if (this.outputs.has(output)) return fail('BUILD_BUSY', '该发行目录已有构建任务');
    this.outputs.add(output);
    const task = { abort: new AbortController(), committing: false }; this.running.set(planId, task);
    const parent = dirname(output), staging = join(parent, `.${basename(output)}.staging-${planId}`), previous = join(parent, `.${basename(output)}.previous-${planId}`);
    const logFile = join(parent, `.${basename(output)}.galcraft-build.json`);
    let committed = false;
    const cancelled = () => { if (task.abort.signal.aborted) throw new Error('BUILD_CANCELLED'); };
    try {
      await this.recover(output);
      const checked = await this.checkOutput(input); if (!checked.ok) { this.changed(planId, 'failed'); return checked; }
      cancelled(); this.changed(planId, 'staging'); await mkdir(staging, { recursive: true });
      const files: ReleaseManifest['files'] = [];
      const put = async (path: string, content: string) => { cancelled(); const destination = join(staging, path); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, content); files.push({ path, size: Buffer.byteLength(content) }); };
      for (const file of material.files) {
        cancelled(); const destination = join(staging, file.path);
        if ((await stat(file.source)).size !== file.size) throw new Error(`构建源文件已变化：${file.path}`);
        await mkdir(dirname(destination), { recursive: true }); await copyFile(file.source, destination);
        if ((await stat(destination)).size !== file.size) throw new Error(`复制文件大小不一致：${file.path}`);
        files.push({ path: file.path, size: file.size });
      }
      for (const [path, content] of Object.entries(material.textFiles)) await put(path, content);
      const snapshotPath = `${material.gameDirectory}/snapshot.json`;
      const playerSnapshot = structuredClone(material.snapshot);
      for (const asset of playerSnapshot.assets) {
        const metadata = asset.metadata as typeof asset.metadata & { musicSource?: unknown };
        delete metadata.authorDocument;
        delete metadata.musicSource;
      }
      await put(snapshotPath, json(playerSnapshot));
      await put(`${material.gameDirectory}/template.json`, json(material.snapshot.template));
      await put('README.html', material.instructions);
      let signature: ReleaseManifest['signature'];
      if (input.target === 'windows') {
        if (material.windowsBrand) {
          const changed = await brandWindowsExecutable(join(staging, material.entry), material.project,
            material.windowsBrand.icon ? join(staging, material.windowsBrand.icon) : undefined);
          for (const path of [join(staging, material.entry), ...changed]) {
            const file = { path: path.slice(staging.length + 1).replaceAll('\\', '/'), size: (await stat(path)).size };
            const existing = files.find(item => item.path === file.path);
            if (existing) existing.size = file.size; else files.push(file);
          }
        }
        cancelled();
        const selection = input.windowsSigning ?? { mode: 'unsigned' as const };
        signature = selection.mode === 'certificate' ? await this.signWindows!(join(staging, material.entry), selection, task.abort.signal) : { status: 'unsigned' };
        if (selection.mode === 'certificate' && (signature.status !== 'signed' || signature.certificateThumbprint.toLowerCase() !== selection.certificateThumbprint.toLowerCase()))
          throw new Error('BUILD_SIGNING_FAILED: 签名回执与所选证书不一致');
        files.find(item => item.path === material.entry)!.size = (await stat(join(staging, material.entry))).size;
      }
      const manifest = ReleaseManifestSchema.parse({ schemaVersion: 1, packageType: 'game', projectId: input.projectId,
        name: material.project.name, version: material.snapshot.releaseVersion, engineVersion: material.snapshot.engineVersion, target: input.target,
        builtAt: new Date().toISOString(), entry: material.entry, snapshot: snapshotPath,
        dependencies: [material.snapshot.lock.engine, ...material.snapshot.lock.plugins, material.snapshot.lock.template],
        resources: material.snapshot.assets.map(asset => ({ assetId: asset.assetId, variantId: asset.variantId,
          files: asset.files.map(file => file.path), mime: asset.files.find(file => file.path === asset.entry)?.mime ?? 'application/octet-stream', bytes: asset.files.reduce((sum, file) => sum + file.bytes, 0) })),
        template: { id: material.snapshot.template.id, version: material.snapshot.template.version, config: `${material.gameDirectory}/template.json`, css: `${material.gameDirectory}/style.css` },
        capabilities: material.capabilities, entryMappings: input.entryMappings, live2dRuntime: material.live2dRuntime, files, helpVersion: material.snapshot.engineVersion, releaseNotes: '', signature });
      await writeFile(join(staging, 'release.manifest.json'), json(manifest));
      cancelled(); this.changed(planId, 'verifying');
      for (const file of manifest.files) if ((await stat(join(staging, file.path))).size !== file.size) throw new Error(`发行清单大小不一致：${file.path}`);
      if (!files.some(file => file.path === manifest.entry) || !files.some(file => file.path === manifest.template.css)) throw new Error('发行入口或样式缺失');
      for (const resource of manifest.resources) for (const path of resource.files) if (!files.some(file => file.path === path)) throw new Error(`资源映射缺少文件：${path}`);
      const verified = await this.verify(staging, manifest, task.abort.signal, material.compatibilityFiles ?? []);
      if (!verified.ok) throw new Error(verified.error.message);
      if (verified.value.compatibility) this.reports.set(planId, verified.value.compatibility);
      let targetOutput: (Awaited<ReturnType<TargetBuildRunner>> extends Result<infer T> ? T : never) | undefined;
      if (input.targetBuilder) {
        if (!this.targetBuild) throw new Error('BUILD_TARGET_BUILDER_REQUIRED');
        const built = await this.targetBuild({ plan: summary, project: material.project, stagingDirectory: staging, webEntry: material.entry, options: input.targetOptions ?? null }, task.abort.signal);
        if (!built.ok) throw new Error(built.error.message);
        targetOutput = built.value;
        for (const path of [targetOutput.entry, targetOutput.handoff.path, ...targetOutput.artifacts.map(item => item.path)]) RelativePathSchema.parse(path);
        for (const artifact of targetOutput.artifacts) { const artifactStat = await stat(join(staging, artifact.path)); if (artifactStat.isFile() && artifactStat.size !== artifact.bytes) throw new Error(`目标产物大小不一致：${artifact.path}`); }
        manifest.entry = targetOutput.entry;
        const scan = async (directory: string, prefix = ''): Promise<ReleaseManifest['files']> => {
          const found: ReleaseManifest['files'] = [];
          for (const item of await readdir(directory, { withFileTypes: true })) {
            const path = `${prefix}${item.name}`;
            if (item.isDirectory()) found.push(...await scan(join(directory, item.name), `${path}/`));
            else if (path !== 'release.manifest.json') found.push({ path, size: (await stat(join(directory, item.name))).size });
          } return found;
        };
        manifest.files = await scan(staging);
        await writeFile(join(staging, 'release.manifest.json'), json(ReleaseManifestSchema.parse(manifest)));
      }
      cancelled(); task.committing = true; this.changed(planId, 'committing');
      const log: CommitLog = { output, staging, previous, phase: 'prepared' };
      await writeCommitLog(logFile, log);
      if (await exists(output)) await moveRelease(output, previous);
      log.phase = 'oldMoved'; await writeCommitLog(logFile, log);
      await moveRelease(staging, output); committed = true;
      const receipt: BuildReceipt = { projectId: input.projectId, releaseVersion: manifest.version, target: input.target,
        outputDirectory: output, entry: join(output, targetOutput?.entry ?? material.entry), handoff: targetOutput ? { ...targetOutput.handoff, path: join(output, targetOutput.handoff.path) } : { path: output, kind: 'directory' },
        artifacts: targetOutput?.artifacts.map(item => ({ ...item, path: join(output, item.path) })),
        targetSigning:targetOutput?.signing,
        instructionsPath: join(output, 'README.html'), localTest: { result: 'notExecuted', evidencePaths: [] }, signature };
      this.receipts.set(planId, receipt);
      await this.recover(output).catch(() => {});
      this.changed(planId, 'completed'); return ok(structuredClone(receipt));
    } catch (error) {
      const occupied = task.committing && ['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '');
      if (!committed) {
        await this.recover(output).catch(() => {});
        if (!occupied) await rm(staging, { recursive: true, force: true }).catch(() => {});
      }
      const aborted = task.abort.signal.aborted; this.changed(planId, aborted ? 'cancelled' : 'failed');
      return fail(aborted ? 'BUILD_CANCELLED' : occupied ? 'BUILD_OUTPUT_OCCUPIED' : 'BUILD_FAILED',
        occupied ? `${error}\n已保留构建目录，可关闭占用程序后重试：${staging}` : String(error));
    } finally { this.running.delete(planId); this.outputs.delete(output); }
  }
}
