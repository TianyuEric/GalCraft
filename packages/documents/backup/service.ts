import { createId } from '@galcraft/contracts';

import { cp, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { IdSchema, type Id, type Result, type VersionRef } from '@galcraft/contracts';
import { ProjectSession, type WorkingDocument } from '@galcraft/documents';
import { ProjectPackageSchema, fail, ok, problem, value, type BackupOptions, type BackupProviders, type ProjectPackage, type RestoreOptions, type RestorePlan, type RestoreReceipt, type WorkReadiness } from './types.js';
import { atomicJson, exists, listFiles, put, readJson, removeOwned, under } from './files.js';
import { enumerateIdentities, rewriteDocuments, rewriteProjectPath } from './identity.js';
import { projectData, validateProject } from './validation.js';

export class BackupService {
  constructor(readonly providers: BackupProviders) {}
  async createBackup(session: ProjectSession, options: BackupOptions, signal?: AbortSignal): Promise<Result<ProjectPackage>> {
    const destination = resolve(options.destination), temporary = `${destination}.${createId()}.partial`, verification = `${temporary}.verify`;
    try {
      if (!destination.endsWith('.galproject')) throw new Error('作品备份扩展名须为 .galproject');
      if (options.source === 'saveThenBackup') value(await session.save(value(session.planSave({ kind: 'all' })).planId));
      return await session.withSavedSnapshot(async documents => {
        signal?.throwIfAborted();
        const { project, lock, files } = projectData(documents), entries: Record<string, Uint8Array> = {};
        const manifest: ProjectPackage = { format: 'galcraft-project', schemaVersion: 1, packageId: createId(), projectId: project.projectId, releaseVersion: project.releaseVersion,
          engineVersion: project.engineVersion, createdAt: new Date().toISOString(), documents: documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })), dependencies: lock, files: [], externalDependencies: [] };
        const add = (path: string, bytes: Uint8Array, role: ProjectPackage['files'][number]['role'], owner: ProjectPackage['files'][number]['owner']) => {
          if (entries[path]) throw new Error(`重复包路径：${path}`); entries[path] = bytes; manifest.files.push({ path, bytes: bytes.length, role, owner });
        };
        for (const document of documents) for (const [path, content] of Object.entries(document.files)) add(`project/${path}`, strToU8(content), /\.(css|scss|map)$/.test(path) ? 'style' : 'document', { kind: 'document', id: document.documentId });
        const collection = this.providers.collectAssets(JSON.parse(files['assets/index.json']!));
        if (collection.issues.some(issue => issue.severity === 'error')) throw new Error(collection.issues.map(issue => issue.message).join('; '));
        for (const file of collection.files) { signal?.throwIfAborted(); const bytes = await readFile(under(session.root, file.path)); if (bytes.length !== file.bytes) throw new Error(`素材大小与索引不同：${file.path}`); add(`project/${file.path}`, bytes, 'asset', null); }
        for (const item of await this.providers.dependencies(lock)) {
          const included = item.dependency.kind !== 'engine' && item.redistribute && item.directory !== null;
          manifest.externalDependencies.push({ dependency: item.dependency, included, reason: item.reason, sourceUrl: item.sourceUrl, instructions: item.instructions });
          if (included) for (const path of (await listFiles(item.directory!)).filter(path => !path.startsWith('.galcraft-load/'))) { signal?.throwIfAborted(); add(`dependencies/${item.dependency.kind}/${item.dependency.id}/${item.dependency.version}/${path}`, await readFile(under(item.directory!, path)), 'dependency', null); }
        }
        const issues = await validateProject(session.root, documents, this.providers); if (issues.some(issue => issue.severity === 'error')) throw new Error(issues.map(issue => issue.message).join('; '));
        entries['package.json'] = strToU8(JSON.stringify(ProjectPackageSchema.parse(manifest), null, 2));
        signal?.throwIfAborted(); await put(temporary, zipSync(entries));
        const checked = this.inspectArchive(new Uint8Array(await readFile(temporary))); if (!isDeepStrictEqual(checked.manifest, manifest)) throw new Error('写入包清单不一致');
        for (const [path, bytes] of Object.entries(checked.entries)) if (path.startsWith('project/')) await put(under(verification, path.slice(8)), bytes);
        const unpacked = await ProjectSession.open(verification, project.projectId);
        let verified: RestorePlan['missing'];
        try { verified = await validateProject(verification, [...unpacked.documents.values()], this.providers); }
        finally { await unpacked.dispose('saved'); }
        if (verified.some(issue => issue.severity === 'error')) throw new Error(verified.map(issue => issue.message).join('; '));
        signal?.throwIfAborted(); await rename(temporary, destination); return ok(manifest);
      });
    } catch (error) { await rm(temporary, { force: true }).catch(() => {}); return fail('BACKUP_FAILED', String(error)); }
    finally { await removeOwned(dirname(verification), verification); }
  }
  inspectArchive(bytes: Uint8Array): { manifest: ProjectPackage; entries: Record<string, Uint8Array> } {
    const entries = unzipSync(bytes), manifest = ProjectPackageSchema.parse(JSON.parse(strFromU8(entries['package.json']!)));
    const names = new Set<string>();
    for (const file of manifest.files) {
      under(dirname(process.cwd()), file.path);
      if (!file.path.startsWith(file.role === 'dependency' ? 'dependencies/' : 'project/') || file.path.startsWith('project/.galcraft/') || names.has(file.path.toLowerCase())) throw new Error(`包路径不合法或重复：${file.path}`);
      names.add(file.path.toLowerCase()); if (entries[file.path]?.length !== file.bytes) throw new Error(`包文件与清单不符：${file.path}`);
    }
    if (Object.keys(entries).some(path => path !== 'package.json' && !manifest.files.some(file => file.path === path))) throw new Error('包包含未声明文件');
    const project = JSON.parse(strFromU8(entries['project/project.json']!)).data, lock = JSON.parse(strFromU8(entries['project/dependencies.lock.json']!)).data;
    if (project.projectId !== manifest.projectId || project.engineVersion !== manifest.engineVersion || project.releaseVersion !== manifest.releaseVersion || !isDeepStrictEqual(lock, manifest.dependencies)) throw new Error('作品身份或依赖与包清单不一致');
    return { manifest, entries };
  }
  async prepareRestore(options: RestoreOptions, signal?: AbortSignal): Promise<Result<RestorePlan>> {
    let operationDirectory: string | null = null;
    try {
      signal?.throwIfAborted(); const destination = resolve(options.destination);
      value(await this.recoverDestination(destination));
      if (this.providers.openSession?.(destination)) throw new Error('目标作品仍打开，请先保存并关闭');
      if (await exists(destination) && options.collision !== 'replaceConfirmed') throw new Error('目标目录已存在，请选择新目录或明确替换');
      const { manifest, entries } = this.inspectArchive(new Uint8Array(await readFile(options.packagePath))), planId = createId();
      operationDirectory = join(dirname(destination), '.galcraft-restores', planId);
      const sourceDirectory = join(operationDirectory, 'source'), stagingDirectory = join(operationDirectory, 'staging');
      await mkdir(sourceDirectory, { recursive: true });
      for (const [path, bytes] of Object.entries(entries)) if (path !== 'package.json') { signal?.throwIfAborted(); await put(under(operationDirectory, path.startsWith('project/') ? `source/${path.slice(8)}` : path), bytes); }
      const plan: RestorePlan = { planId, packageId: manifest.packageId, sourceProjectId: manifest.projectId, resultProjectId: manifest.projectId, stagingDirectory, destination, missing: [], idMap: {},
        previousDirectory: await exists(destination) ? join(operationDirectory, 'before') : null, options: { ...options, destination }, operationDirectory, sourceDirectory, manifest, rewritten: false, phase: 'prepared', registryBefore: null, readiness: null };
      await this.persist(plan); return this.checkRestore(operationDirectory, signal);
    } catch (error) { if (operationDirectory && signal?.aborted) await removeOwned(dirname(operationDirectory), operationDirectory); return fail('RESTORE_PREPARE', String(error)); }
  }
  private persist(plan: RestorePlan): Promise<void> { return atomicJson(join(plan.operationDirectory, 'plan.json'), plan); }
  private async load(directory: string): Promise<RestorePlan> {
    const plan = await readJson<RestorePlan>(join(directory, 'plan.json')); IdSchema.parse(plan.planId);
    if (resolve(directory) !== resolve(plan.operationDirectory) || resolve(plan.sourceDirectory) !== join(resolve(directory), 'source') || resolve(plan.stagingDirectory) !== join(resolve(directory), 'staging') ||
      plan.previousDirectory !== null && resolve(plan.previousDirectory) !== join(resolve(directory), 'before')) throw new Error('恢复计划路径不一致');
    return plan;
  }
  async checkRestore(operationDirectory: string, signal?: AbortSignal): Promise<Result<RestorePlan>> {
    try {
      const plan = await this.load(operationDirectory); if (plan.phase !== 'prepared' || !plan.manifest) throw new Error('恢复计划不在包准备状态'); signal?.throwIfAborted();
      const source = await ProjectSession.open(plan.sourceDirectory, plan.sourceProjectId);
      const documents = [...source.documents.values()], { project, lock } = projectData(documents); await source.dispose('saved');
      plan.projectName = project.name;
      const declared = new Map(plan.manifest.documents.map(version => [version.ref.id, version.revision]));
      if (documents.length !== declared.size || documents.some(document => declared.get(document.documentId) !== document.revision)) throw new Error('包文档版本与清单不一致');
      plan.missing = await this.providers.validateDependencies(project, lock, join(operationDirectory, 'dependencies'), documents);
      if (plan.missing.some(issue => issue.severity === 'error')) { plan.readiness = null; await this.persist(plan); return ok(plan); }
      if (plan.options.identity === 'copyNew' && !Object.keys(plan.idMap).length) {
        try { plan.idMap = enumerateIdentities(documents, this.providers); plan.resultProjectId = plan.idMap[plan.sourceProjectId]!; if (!plan.resultProjectId) throw new Error('没有枚举作品身份'); await this.persist(plan); }
        catch (error) { plan.missing = [problem('RESTORE_IDENTITY_PROVIDER', String(error))]; await this.persist(plan); return ok(plan); }
      }
      if (!plan.rewritten) {
        await removeOwned(operationDirectory, plan.stagingDirectory); await mkdir(plan.stagingDirectory, { recursive: true });
        const rewritten = plan.options.identity === 'copyNew' ? rewriteDocuments(documents, plan.idMap, this.providers, project.engineVersion) : documents;
        const documentPaths = new Set(documents.flatMap(document => Object.keys(document.files)));
        for (const path of await listFiles(plan.sourceDirectory)) if (!documentPaths.has(path)) { signal?.throwIfAborted(); await put(under(plan.stagingDirectory, rewriteProjectPath(path, plan.idMap)), await readFile(under(plan.sourceDirectory, path))); }
        for (const document of rewritten) for (const [path, text] of Object.entries(document.files)) { signal?.throwIfAborted(); await put(under(plan.stagingDirectory, path), text); }
        if (plan.options.identity === 'copyNew') {
          const sourceIndex = documents.find(document => document.files['assets/index.json'])!;
          const assets = JSON.parse(sourceIndex.files['assets/index.json']!).data.assets;
          const targetIndex = rewritten.find(document => document.files['assets/index.json'])!;
          const envelope = JSON.parse(targetIndex.files['assets/index.json']!);
          for (const asset of assets) for (const variant of asset.variants) if (variant.typeData || asset.kind.includes('/')) {
            if (!this.providers.assetTypes) throw new Error(`缺少素材类型文件重写提供方：${asset.kind}`);
            for (const file of variant.files) {
              const path = `assets/files/${asset.id}/${variant.id}/${file.path}`;
              const bytes = value(this.providers.assetTypes.rewriteFile(asset.kind, variant, file.path, await readFile(under(plan.sourceDirectory, path)), plan.idMap));
              await put(under(plan.stagingDirectory, rewriteProjectPath(path, plan.idMap)), bytes);
              envelope.data.assets.find((item: any) => item.id === plan.idMap[asset.id])!.variants.find((item: any) => item.id === plan.idMap[variant.id])!.files.find((item: any) => item.path === file.path)!.bytes = bytes.length;
            }
          }
          await put(under(plan.stagingDirectory, 'assets/index.json'), JSON.stringify(envelope, null, 2) + '\n');
        }
        plan.rewritten = true; await this.persist(plan);
      }
      const staged = await ProjectSession.open(plan.stagingDirectory, plan.resultProjectId), current = [...staged.documents.values()];
      plan.missing = await validateProject(plan.stagingDirectory, current, this.providers); await staged.dispose('saved');
      plan.readiness = this.readiness(plan.resultProjectId, plan.missing); await this.persist(plan); return ok(plan);
    } catch (error) { return fail('RESTORE_CHECK', String(error)); }
  }
  private readiness(projectId: Id, issues: RestorePlan['missing']): WorkReadiness {
    const blocked = issues.some(issue => issue.severity === 'error');
    return { projectId, editing: blocked ? 'unavailable' : 'editable', playtest: blocked ? 'unavailable' : 'unchecked', publish: blocked ? 'unavailable' : 'unchecked',
      generation: this.providers.generationReadiness?.(projectId) ?? ['script', 'background', 'figure', 'difference', 'cg', 'voice', 'bgm', 'ui'].map(usage => ({ usage, state: 'needsConnection', issues: [] })),
      issues: issues.map(issue => ({ activity: 'editing', issue })) };
  }
  async commitRestore(operationDirectory: string, signal?: AbortSignal): Promise<Result<RestoreReceipt>> {
    try {
      const original = await this.load(operationDirectory);
      if (original.phase === 'committed') return ok({ projectId: original.resultProjectId, directory: original.destination, identity: original.options.identity, readiness: original.readiness! });
      const plan = value(await this.checkRestore(operationDirectory, signal));
      if (plan.missing.some(issue => issue.severity === 'error') || !plan.readiness) return fail('RESTORE_MISSING_DEPENDENCIES', plan.missing.map(issue => issue.message).join('; '));
      if (this.providers.openSession?.(plan.destination)) throw new Error('目标作品仍打开，请先保存并关闭');
      if (await exists(plan.destination) && plan.options.collision !== 'replaceConfirmed') throw new Error('目标目录已存在');
      plan.previousDirectory = await exists(plan.destination) ? join(operationDirectory, 'before') : null;
      plan.registryBefore = await this.providers.registry.capture(); await this.persist(plan); signal?.throwIfAborted();
      return this.install(plan);
    } catch (error) { return fail('RESTORE_COMMIT', String(error)); }
  }
  private async install(plan: RestorePlan): Promise<Result<RestoreReceipt>> {
    try {
      if (plan.previousDirectory) { if (await exists(plan.previousDirectory)) throw new Error('旧目录保留位置已占用'); await rename(plan.destination, plan.previousDirectory); }
      plan.phase = 'oldMoved'; await this.persist(plan);
      await rename(plan.stagingDirectory, plan.destination); plan.phase = 'installed'; await this.persist(plan);
      const receipt: RestoreReceipt = { projectId: plan.resultProjectId, directory: plan.destination, identity: plan.options.identity, readiness: plan.readiness! };
      await this.providers.registry.register(receipt); plan.phase = 'committed'; await this.persist(plan); return ok(receipt);
    } catch (error) { try { await this.rollback(plan); } catch (rollback) { return fail('RESTORE_RECOVERY_PENDING', `${String(error)}；回滚待重试：${String(rollback)}`); } return fail('RESTORE_COMMIT', String(error)); }
  }
  private async rollback(plan: RestorePlan): Promise<void> {
    if (!await exists(plan.stagingDirectory) && await exists(plan.destination)) await rename(plan.destination, plan.stagingDirectory);
    if (plan.previousDirectory && await exists(plan.previousDirectory)) await rename(plan.previousDirectory, plan.destination);
    await this.providers.registry.restore(plan.registryBefore);
    plan.phase = 'prepared'; await this.persist(plan);
  }
  async recover(operationDirectory: string): Promise<Result<RestorePlan>> {
    try { const plan = await this.load(operationDirectory);
      if (plan.phase !== 'committed' && plan.phase !== 'cancelled' && (plan.phase !== 'prepared' || plan.previousDirectory && await exists(plan.previousDirectory))) await this.rollback(plan);
      return ok(plan);
    } catch (error) { return fail('RESTORE_RECOVERY_PENDING', String(error)); }
  }
  async recoverDestination(destination: string): Promise<Result<void>> {
    try {
      const root = join(dirname(resolve(destination)), '.galcraft-restores');
      if (!await exists(root)) return ok(undefined);
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || !await exists(join(root, entry.name, 'plan.json'))) continue;
        const plan = await this.load(join(root, entry.name));
        if (resolve(plan.destination) === resolve(destination)) value(await this.recover(plan.operationDirectory));
      }
      return ok(undefined);
    } catch (error) { return fail('RESTORE_RECOVERY_PENDING', String(error)); }
  }
  async cancelRestore(operationDirectory: string): Promise<Result<void>> {
    try { const plan = await this.load(operationDirectory); if (plan.phase !== 'prepared') throw new Error('提交已开始，请等待提交或回滚');
      await removeOwned(operationDirectory, plan.stagingDirectory); await removeOwned(operationDirectory, plan.sourceDirectory); plan.phase = 'cancelled'; await this.persist(plan); return ok(undefined);
    } catch (error) { return fail('RESTORE_CANCEL', String(error)); }
  }
  async commitUpgrade(session: ProjectSession, input: { directory: string; expected: { working: VersionRef[]; saved: VersionRef[] } }, signal?: AbortSignal): Promise<Result<RestoreReceipt>> {
    try {
      if (session.dirtyIds().length) throw new Error('升级前须保存当前工作内容');
      const candidate = resolve(input.directory); if (candidate === resolve(session.root) || candidate.startsWith(resolve(session.root) + sep)) throw new Error('升级副本必须独立于源作品');
      const staged = await ProjectSession.open(candidate, session.projectId), documents = [...staged.documents.values()], { project, lock } = projectData(documents); await staged.dispose('saved');
      if (project.projectId !== session.projectId) throw new Error('升级副本更改了作品身份');
      const issues = [...await this.providers.validateDependencies(project, lock, '', documents), ...await validateProject(candidate, documents, this.providers)];
      if (issues.some(issue => issue.severity === 'error')) return fail('UPGRADE_INVALID', issues.map(issue => issue.message).join('; '));
      signal?.throwIfAborted(); const planId = createId(), operationDirectory = join(dirname(session.root), '.galcraft-restores', planId), stagingDirectory = join(operationDirectory, 'staging');
      await mkdir(operationDirectory, { recursive: true }); await cp(candidate, stagingDirectory, { recursive: true });
      // Recovery drafts and transaction logs belong to the source session, never to an upgrade copy.
      await removeOwned(stagingDirectory, join(stagingDirectory, '.galcraft'));
      const plan: RestorePlan = { planId, packageId: createId(), sourceProjectId: session.projectId, resultProjectId: session.projectId, destination: resolve(session.root), stagingDirectory,
        sourceDirectory: join(operationDirectory, 'source'), operationDirectory, options: { packagePath: '', destination: resolve(session.root), identity: 'restoreOriginal', collision: 'replaceConfirmed' },
        previousDirectory: join(operationDirectory, 'before'), missing: [], idMap: {}, manifest: null, rewritten: true, phase: 'prepared', registryBefore: await this.providers.registry.capture(), readiness: this.readiness(session.projectId, issues) };
      await this.persist(plan); signal?.throwIfAborted();
      return session.commitDirectoryChange(input.expected, () => this.install(plan));
    } catch (error) { return fail('UPGRADE_COMMIT', String(error)); }
  }
}
