import { createId, IdSchema } from '@galcraft/contracts';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { isDeepStrictEqual } from 'node:util';
import { UpgradeInputSchema } from '@galcraft/contracts';
import { ProjectSession } from '@galcraft/documents';
import { projectData } from '@galcraft/documents/backup';
import { sameSavedVersions } from '@galcraft/publishing/build';
import { fail, ok } from './result.mjs';

const value = result => { if (!result.ok) throw new Error(result.error.message); return result.value; };
const vector = documents => documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision }));
const filesOf = documents => Object.assign({}, ...documents.map(document => document.files));
const copyProject = (from, to) => cp(from, to, { recursive: true, errorOnExist: true, force: false,
  filter: path => resolve(path) !== resolve(from, '.galcraft') });

export class StudioUpgrades {
  constructor({ userData, projects, engineCatalog, backups, validate }) {
    Object.assign(this, { projects, engineCatalog, backups, validate });
    this.root = join(userData, 'upgrades'); this.plans = new Map(); this.running = new Map();
  }
  async list() { return this.engineCatalog.listEngines(); }
  async history() {
    const session = this.projects.currentSession; if (!session) return ok([]);
    const root = join(this.root, session.projectId);
    let entries; try { entries = await readdir(root, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return ok([]); throw error; }
    const plans = [];
    for (const entry of entries.filter(entry => entry.isDirectory())) {
      let record; try { record = JSON.parse(await readFile(join(root, entry.name, 'upgrade.json'), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      plans.push({ id: record.plan.id, from: record.plan.from, to: record.plan.to, originalCopy: record.plan.originalCopy, state: record.state });
    }
    return ok(plans);
  }
  async persist(record) {
    await writeFile(join(record.directory, 'upgrade.json'), JSON.stringify(record, null, 2));
    this.plans.set(record.plan.id, record);
  }
  async plan(raw) {
    const input = UpgradeInputSchema.parse(raw), session = this.projects.currentSession;
    if (!session || session.projectId !== input.projectId) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M11');
    if (session.dirtyIds().length) return fail('UPGRADE_SAVE_REQUIRED', '升级前请保存全部修改', 'M11');
    const id = input.operationId ?? createId(), controller = new AbortController();
    if (this.running.has(id)) return fail('UPGRADE_ALREADY_RUNNING', '升级操作正在执行', 'M11');
    this.running.set(id, controller);
    let record;
    try {
      await session.withSavedSnapshot(async documents => {
        controller.signal.throwIfAborted();
        const base = vector(documents);
        if (!sameSavedVersions(base, input.expected)) throw new Error('PLAN_STALE：作品版本已变化');
        const { project, lock } = projectData(documents);
        value(await this.engineCatalog.resolveProjectEngine(project, lock, 'windows'));
        const engine = value(await this.engineCatalog.resolveEngine(input.toVersion, 'windows'));
        const conversion = engine.manifest.conversions.find(item => item.from === project.engineVersion && item.to === input.toVersion);
        if (input.toVersion !== project.engineVersion && !conversion) throw new Error(`UPGRADE_UNSUPPORTED：引擎未声明 ${project.engineVersion} → ${input.toVersion} 的转换路径`);
        const directory = join(this.root, input.projectId, id);
        await mkdir(directory, { recursive: true });
        const plan = { id, from: project.engineVersion, to: input.toVersion, base,
          originalCopy: join(directory, 'original'), workingCopy: join(directory, 'working'), changes: [], dependencyChanges: [], validation: null };
        await copyProject(session.root, plan.originalCopy);
        controller.signal.throwIfAborted();
        await copyProject(plan.originalCopy, plan.workingCopy);
        controller.signal.throwIfAborted();
        const original = await ProjectSession.open(plan.originalCopy, input.projectId);
        try { if (!isDeepStrictEqual(filesOf([...original.documents.values()]), filesOf(documents))) throw new Error('PLAN_STALE：磁盘文件与所选保存版本不同'); }
        finally { await original.dispose('saved'); }
        record = { plan, directory, projectId: input.projectId, sourceRoot: session.root, originalFiles: filesOf(documents),
          validatedFiles: null, targets: [...engine.manifest.targets.filter(target => target !== 'android')], input, state: 'prepared' };
        await this.persist(record);
        try {
          if (conversion) {
            const module = await import(pathToFileURL(join(engine.directory, conversion.entry)).href);
            if (typeof module.convertProject !== 'function') throw new Error('引擎转换入口须导出 convertProject');
            await module.convertProject({ projectId: input.projectId, from: plan.from, to: plan.to, directory: plan.workingCopy, signal: controller.signal });
          }
          controller.signal.throwIfAborted();
          const candidate = await ProjectSession.open(plan.workingCopy, input.projectId);
          try {
            const converted = [...candidate.documents.values()], after = projectData(converted);
            if (after.project.projectId !== input.projectId || after.project.engineVersion !== plan.to || after.lock.engine.version !== plan.to)
              throw new Error('转换结果的作品身份或引擎锁不匹配');
            const beforeFiles = record.originalFiles, afterFiles = filesOf(converted);
            plan.changes = [...new Set([...Object.keys(beforeFiles), ...Object.keys(afterFiles)])].filter(file => beforeFiles[file] !== afterFiles[file])
              .map(file => ({ file, description: beforeFiles[file] === undefined ? 'added' : afterFiles[file] === undefined ? 'removed' : 'modified', converted: true }));
            const oldDependencies = lock.plugins, newDependencies = after.lock.plugins;
            plan.dependencyChanges = [...new Set([...oldDependencies, ...newDependencies].map(item => item.id))].flatMap(id => {
              const from = oldDependencies.find(item => item.id === id)?.version ?? null, to = newDependencies.find(item => item.id === id)?.version ?? null;
              return from === to ? [] : [{ pluginId: id, from, to,
                affected: converted.filter(document => Object.keys(document.files).some(path => path.startsWith(`plugins/${id}/`))).map(document => ({ kind: 'document', id: document.documentId })),
                savedData: input.representativeSaves, dependencies: newDependencies.filter(dependency => dependency.id === id), conversions: [], issues: [] }]; });
            plan.validation = await this.validate({ directory: plan.workingCopy, projectId: input.projectId, targets: record.targets,
              representativeSaves: input.representativeSaves, signal: controller.signal });
            plan.validation.sourceVersions = base;
            record.validatedFiles = filesOf(converted);
          } finally { await candidate.dispose('saved'); }
        } finally { controller.signal.throwIfAborted(); }
        await this.persist(record);
      });
      return ok(structuredClone(record.plan));
    } catch (error) {
      if (record) { record.error = String(error); try { await this.persist(record); } catch { /* The preparation error remains authoritative. */ } }
      return fail(controller.signal.aborted ? 'CANCELLED' : String(error).includes('UPGRADE_UNSUPPORTED') ? 'UPGRADE_UNSUPPORTED' : 'UPGRADE_PREPARATION',
        `${error}${record ? `\n副本：${record.plan.workingCopy}` : ''}`, 'M11');
    } finally {
      this.running.delete(id);
    }
  }
  cancel(id) { const running = this.running.get(id); running?.abort(); return ok({ local: running ? 'stopped' : 'alreadyFinished', remote: 'notApplicable' }); }
  async load(id) {
    if (this.plans.has(id)) return this.plans.get(id);
    const session = this.projects.currentSession;
    if (!session || !IdSchema.safeParse(id).success) throw new Error('升级计划不存在');
    const record = JSON.parse(await readFile(join(this.root, session.projectId, id, 'upgrade.json'), 'utf8'));
    this.plans.set(id, record); return record;
  }
  async commit(id) {
    try {
      const record = await this.load(id), session = this.projects.currentSession, { plan } = record;
      if (!session || session.projectId !== record.projectId || resolve(session.root) !== resolve(record.sourceRoot)) throw new Error('作品会话不匹配');
      if (session.dirtyIds().length || !sameSavedVersions(vector([...session.documents.values()]), plan.base)) return fail('PLAN_STALE', '验证后作品已有修改，请重新准备升级', 'M11');
      if (!plan.validation || record.targets.some(target => ['dsl', 'template', 'plugin', 'resource', 'save', 'playtest'].some(kind =>
        !plan.validation.checks.some(check => check.target === target && check.kind === kind && check.result === 'pass'))))
        return fail('UPGRADE_VALIDATION_REQUIRED', '全部目标和验证项通过后才能确认升级', 'M11');
      const candidate = await ProjectSession.open(plan.workingCopy, record.projectId);
      try { if (!isDeepStrictEqual(filesOf([...candidate.documents.values()]), record.validatedFiles)) return fail('PLAN_STALE', '升级副本文档已变化，请重新验证', 'M11'); }
      finally { await candidate.dispose('saved'); }
      const receipt = await this.backups.service.commitUpgrade(session, { directory: plan.workingCopy, expected: { working: plan.base, saved: plan.base } });
      if (!receipt.ok) return receipt;
      record.state = 'committed';
      const warnings = [];
      try { await this.persist(record); }
      catch (error) { warnings.push({ code: 'UPGRADE_RECORD_WRITE', severity: 'warning', message: `作品已升级，升级记录写入失败：${error}`, owner: 'M11', related: [], actions: ['retry'] }); }
      try {
        const reopened = await this.projects.reopenCommitted();
        if (!reopened.ok) throw new Error(reopened.error.message);
      } catch (error) { warnings.push({ code: 'UPGRADE_REOPEN', severity: 'warning', message: `作品已升级，重开会话失败：${error}`, owner: 'M11', related: [], actions: ['retry'] }); }
      return { ...ok({ ...receipt.value, upgradeId: id, originalCopy: plan.originalCopy }), warnings };
    } catch (error) { return fail('UPGRADE_COMMIT', String(error), 'M11'); }
  }
  async restore(id) {
    try {
      const record = await this.load(id), session = this.projects.currentSession;
      if (!session || session.projectId !== record.projectId || record.state !== 'committed') throw new Error('没有可恢复的已提交升级');
      value(await this.engineCatalog.resolveEngine(record.plan.from, 'windows'));
      const destination = join(record.directory, `before-restore-${createId()}.galproject`);
      value(await this.backups.service.createBackup(session, { source: 'saveThenBackup', destination }));
      const current = vector([...session.documents.values()]);
      const receipt = await this.backups.service.commitUpgrade(session, { directory: record.plan.originalCopy, expected: { working: current, saved: current } });
      if (!receipt.ok) return receipt;
      record.state = 'restored'; record.beforeRestore = destination;
      const warnings = [];
      try { await this.persist(record); }
      catch (error) { warnings.push({ code: 'UPGRADE_RECORD_WRITE', severity: 'warning', message: `作品已恢复，升级记录写入失败：${error}`, owner: 'M11', related: [], actions: ['retry'] }); }
      try {
        const reopened = await this.projects.reopenCommitted();
        if (!reopened.ok) throw new Error(reopened.error.message);
      } catch (error) { warnings.push({ code: 'UPGRADE_REOPEN', severity: 'warning', message: `作品已恢复，重开会话失败：${error}`, owner: 'M11', related: [], actions: ['retry'] }); }
      return { ...ok({ ...receipt.value, backup: destination }), warnings };
    } catch (error) { return fail('UPGRADE_RESTORE', String(error), 'M11'); }
  }
}
