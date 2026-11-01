import { join } from 'node:path';
import { ConnectionConfigSchema, IdSchema } from '@galcraft/contracts';
import type { CapabilityReport, ConnectionCheck, ConnectionConfig, ConnectionSelection, Result } from '@galcraft/contracts';
import type { GenerationAdapterLease, WorkflowBinding } from './types.js';
import { ProductionStore } from './store.js';
import { fail, ok, validateWorkflow } from './validation.js';
import { HttpGenerationAdapter } from '@galcraft/generation-services';
import { readOptional, replaceFile } from '../recipes/storage.js';
import { workflowSupportsPurpose } from '@galcraft/generation-services/validation';
import { readdir } from 'node:fs/promises';
import { WorkflowBindingSchema } from './discovery.js';
import { WorkflowConfigurationDraftSchema, type WorkflowConfigurationDraft } from './workflow-configuration.js';

export class GenerationConnections {
  private store: Pick<ProductionStore, 'userData' | 'read' | 'write'>;
  private workflowTail: Promise<void> = Promise.resolve();
  private changeWorkflow<T>(action: () => Promise<Result<T>>): Promise<Result<T>> {
    const result = this.workflowTail.then(action, action);
    this.workflowTail = result.then(() => {}, () => {});
    return result;
  }
  constructor(store: Pick<ProductionStore, 'userData' | 'read' | 'write'> | string, private adapter: HttpGenerationAdapter,
    private acquireAdapter?: (config: ConnectionConfig) => Promise<GenerationAdapterLease>,
    private readConnection?: (id: string) => Promise<ConnectionConfig | null>) {
    this.store = typeof store === 'string' ? { userData: store,
      read: async <T>(path: string) => { const raw = await readOptional(path); return raw === null ? null : JSON.parse(raw) as T; },
      write: (path, value) => replaceFile(path, JSON.stringify(value, null, 2) + '\n'),
    } : store;
  }
  private path(id: string) { return join(this.store.userData, 'connections', `${IdSchema.parse(id)}.json`); }
  async saveConnection(config: ConnectionConfig, expectedRevision: number | null): Promise<Result<ConnectionConfig>> {
    try { ConnectionConfigSchema.parse(config); const previous = await this.store.read<ConnectionConfig>(this.path(config.id));
      if ((previous?.revision ?? null) !== expectedRevision) return fail('CONNECTION_CONFLICT', '连接版本已变化');
      const url = new URL(config.baseUrl); if (url.username || url.password || url.search) throw new Error('认证须保存在凭据存储，地址不能包含认证或查询参数');
      if (Object.keys(config.parameters).some(key => /authorization|api.?key|secret|password|token$/i.test(key))) throw new Error('凭据只通过 credentialId 引用');
      const next = structuredClone({ ...config, revision: (previous?.revision ?? 0) + 1 }); await this.store.write(this.path(config.id), next); return ok(next);
    } catch (error) { return fail('CONNECTION_SAVE', String(error)); }
  }
  loadConnection(id: string): Promise<ConnectionConfig | null> { return this.readConnection ? this.readConnection(id) : this.store.read(this.path(id)); }
  async saveWorkflow(workflow: WorkflowBinding, expectedRevision: number | null): Promise<Result<WorkflowBinding>> {
    return this.changeWorkflow(async () => {
    try { WorkflowBindingSchema.parse(workflow); validateWorkflow(workflow); const path = join(this.store.userData, 'connections/workflows', `${IdSchema.parse(workflow.id)}.json`);
      const previous = await this.store.read<WorkflowBinding>(path); if ((previous?.revision ?? null) !== expectedRevision) return fail('WORKFLOW_CONFLICT', '工作流版本已变化');
      const next = { ...structuredClone(workflow), revision: (previous?.revision ?? 0) + 1 }; await this.store.write(path, next); return ok(next);
    } catch (error) { return fail('WORKFLOW_SAVE', String(error)); }
    });
  }
  async listWorkflowDrafts(): Promise<Result<WorkflowConfigurationDraft[]>> {
    try {
      const directory = join(this.store.userData, 'connections/workflow-drafts');
      const names = await readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      const drafts = await Promise.all(names.filter(name => name.endsWith('.json')).map(async name => WorkflowConfigurationDraftSchema.parse(await this.store.read(join(directory, name)))));
      return ok(drafts);
    } catch (error) { return fail('WORKFLOW_DRAFT_READ', String(error)); }
  }
  async saveWorkflowDraft(draft: WorkflowConfigurationDraft, expectedRevision: number | null): Promise<Result<WorkflowConfigurationDraft>> {
    return this.changeWorkflow(async () => {
    try {
      WorkflowConfigurationDraftSchema.parse(draft);
      const path = join(this.store.userData, 'connections/workflow-drafts', `${IdSchema.parse(draft.id)}.json`);
      const previous = await this.store.read<WorkflowConfigurationDraft>(path);
      if ((previous?.revision ?? null) !== expectedRevision) return fail('WORKFLOW_DRAFT_CONFLICT', '工作流配置草稿已变化，请重新打开后合并修改。');
      const next = { ...structuredClone(draft), revision: (previous?.revision ?? 0) + 1, updatedAt: new Date().toISOString() };
      await this.store.write(path, next); return ok(next);
    } catch (error) { return fail('WORKFLOW_DRAFT_SAVE', String(error)); }
    });
  }
  async inspectConnection(selection: ConnectionSelection): Promise<Result<ConnectionCheck>> {
    const result = await this.testConnection(selection);
    return result.ok ? ok(result.value.check) : result;
  }
  async testConnection(selection: ConnectionSelection): Promise<Result<{ report: CapabilityReport; check: ConnectionCheck }>> {
    const config = await this.loadConnection(selection.connectionId); if (!config) return fail('CONNECTION_MISSING', '服务待连接');
    if (!config.purposes.includes(selection.purpose)) return fail('PURPOSE_UNSUPPORTED', '连接未声明该用途');
    const workflow = selection.workflowBindingId ? await this.store.read<WorkflowBinding>(join(this.store.userData, 'connections/workflows', `${IdSchema.parse(selection.workflowBindingId)}.json`)) : null;
    const selectedConfig = { ...structuredClone(config), model: selection.model, workflowBindingId: selection.workflowBindingId };
    const lease = this.acquireAdapter ? await this.acquireAdapter(selectedConfig) : null;
    let report;
    try { report = await (lease?.adapter ?? this.adapter).inspect(selectedConfig, selection.purpose); }
    finally { await lease?.release(); }
    const mapping = config.protocol !== 'comfyUI' ? ok(undefined) : !workflow ? fail('WORKFLOW_MISSING', '缺少用途工作流')
      : !workflowSupportsPurpose(workflow, selection.purpose, selection.imageUsage) ? fail('WORKFLOW_PURPOSE', '工作流未绑定所选用途')
        : await this.adapter.checkWorkflow(selectedConfig, workflow);
    const check: ConnectionCheck = { connectionId: config.id, connectionRevision: config.revision, workflowBindingId: selection.workflowBindingId, workflowRevision: workflow?.revision ?? null,
      purpose: selection.purpose, imageUsage: selection.imageUsage, model: selection.model, reachable: report.status === 'unavailable' ? 'failed' : 'passed', mapping: mapping.ok ? 'passed' : 'failed',
      trial: { taskId: null, result: 'notRun', checkedAt: null }, issues: [...report.issues, ...(!mapping.ok ? mapping.issues : [])] };
    const path = join(this.store.userData, 'connections/checks', config.id, `${selection.purpose}-${selection.imageUsage ?? 'none'}-${selection.workflowBindingId ?? 'none'}-${encodeURIComponent(JSON.stringify(selection.model))}.json`);
    const previous = await this.store.read<ConnectionCheck>(path)
      ?? await this.store.read<ConnectionCheck>(join(this.store.userData, 'connections/checks', config.id, `${selection.purpose}-${selection.imageUsage ?? 'none'}-${workflow?.id ?? 'none'}.json`));
    if (previous && previous.connectionRevision === check.connectionRevision && previous.workflowRevision === check.workflowRevision
      && previous.purpose === check.purpose && previous.imageUsage === check.imageUsage && previous.workflowBindingId === check.workflowBindingId && previous.model === check.model) check.trial = previous.trial;
    await this.store.write(path, check);
    return ok({ report: { ...report, status: !mapping.ok ? 'unavailable' : report.status, issues: check.issues }, check });
  }
}
