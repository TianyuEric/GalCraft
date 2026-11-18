import { createId, readPluginDocumentInstances, type DocumentView, type EditInput, type Json, type PluginDocumentInstance, type Result } from '@galcraft/contracts';
import type { ProjectSession } from '@galcraft/documents';
import { validatePluginData, type DocumentContribution } from '@galcraft/plugins/contracts';
import { fail, ok } from './result.mjs';

export const pluginDocumentInstances = readPluginDocumentInstances;

type Projects = {
  readonly currentSession: ProjectSession | null;
  list(): Result<DocumentView[]>;
};
type PluginDefinitions = {
  acquireDefinitions(session: ProjectSession): Promise<Result<{
    documents: DocumentContribution[];
    release(): void | Promise<void>;
  }>>;
};
type CreateInput = { pluginId: string; contributionKey: string; name?: string; data?: Json };
type CurrentInput = { documentId: string; expectedRevision?: number };

function createPlan(input: CreateInput, definition: DocumentContribution, session: ProjectSession, documentId: string,
  expected: EditInput['expected'] = []): Result<EditInput> {
  if (definition.instances === 'fixed' && pluginDocumentInstances([...session.documents.values()]).some(item => item.contributionKey === definition.key)) {
    return fail('PLUGIN_DOCUMENT_FIXED', '固定配置实例已经存在，请编辑已有配置', 'M02');
  }
  const data = input.data ?? definition.initial;
  const checked = definition.validate?.(data) ?? validatePluginData(definition.schema, data);
  if (!checked.ok) return checked;
  const localName = definition.key.slice(input.pluginId.length + 1);
  const metadata = { pluginId: input.pluginId, contributionKey: definition.key,
    name: input.name?.trim() || definition.titleKey || localName, stateVersion: definition.stateVersion ?? 1 };
  const files = { [`plugins/${input.pluginId}/${localName}/${documentId}.json`]: JSON.stringify({
    schemaVersion: 1, documentId, revision: 1, pluginDocument: metadata, data: checked.value,
  }, null, 2) + '\n' };
  return ok({ label: `创建${metadata.name}`, origin: 'plugin', expected,
    patches: [{ kind: 'document', documentId, op: 'create', before: null, after: { format: 'json', files } }],
    preparedAssets: [], requiredRefs: definition.collectReferences(checked.value) });
}

export class PluginDocuments {
  private readonly projects: Projects;
  private readonly plugins: PluginDefinitions;

  constructor(projects: Projects, plugins: PluginDefinitions) {
    this.projects = projects;
    this.plugins = plugins;
  }

  list(input: { pluginId: string; contributionKey?: string }): Result<PluginDocumentInstance[]> {
    const listed = this.projects.list();
    return listed.ok ? ok(pluginDocumentInstances(listed.value).filter(item => item.pluginId === input.pluginId &&
      (!input.contributionKey || item.contributionKey === input.contributionKey))) : listed;
  }

  private async definition<T>(key: string, action: (definition: DocumentContribution, session: ProjectSession) => Result<T>): Promise<Result<T>> {
    const session = this.projects.currentSession;
    if (!session) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02');
    const acquired = await this.plugins.acquireDefinitions(session);
    if (!acquired.ok) return acquired;
    try {
      const definition = acquired.value.documents.find(item => item.key === key);
      return definition ? action(definition, session) : fail('PLUGIN_DOCUMENT_PROVIDER', `缺少文档提供者 ${key}`, 'M09', ['supplyDependency']);
    } finally { await acquired.value.release(); }
  }

  async create(input: CreateInput): Promise<Result<EditInput>> {
    if (!input.contributionKey?.startsWith(`${input.pluginId}/`)) return fail('PLUGIN_DOCUMENT_IDENTITY', '文档类型与插件不符', 'M09');
    return this.definition(input.contributionKey, (definition, session) => createPlan(input, definition, session, createId()));
  }

  current(documentId: string, expectedRevision?: number) {
    const session = this.projects.currentSession;
    if (!session) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02');
    const document = session.readDocument(documentId);
    const instance = document && pluginDocumentInstances([document])[0];
    if (!document || !instance) return fail('PLUGIN_DOCUMENT_MISSING', '插件文档不存在', 'M02');
    if (expectedRevision !== undefined && instance.revision !== expectedRevision) {
      return fail('EDIT_CONFLICT', '文档已变化，请保留结果并重新审阅', 'M02');
    }
    return ok({ document, instance });
  }

  async copy(input: { documentId: string; name?: string }): Promise<Result<EditInput>> {
    const current = this.current(input.documentId);
    if (!current.ok) return current;
    const { instance } = current.value;
    if (!instance.contributionKey.startsWith(`${instance.pluginId}/`)) {
      return fail('PLUGIN_DOCUMENT_IDENTITY', '文档类型与插件不符', 'M09');
    }
    return this.definition(instance.contributionKey, (definition, session) => {
      const documentId = createId();
      const rewritten = definition.rewriteReferences(instance.data, { [instance.documentId]: documentId });
      if (!rewritten.ok) return rewritten;
      return createPlan({ ...instance, data: rewritten.value, name: input.name ?? `${instance.name} 副本` }, definition, session, documentId,
        [{ ref: { kind: 'document', id: instance.documentId }, revision: instance.revision }]);
    });
  }

  async update(input: CurrentInput & { data: Json }): Promise<Result<EditInput>> {
    const current = this.current(input.documentId, input.expectedRevision);
    if (!current.ok) return current;
    const { instance } = current.value;
    return this.definition(instance.contributionKey, definition => {
      if (instance.stateVersion !== (definition.stateVersion ?? 1)) return fail('PLUGIN_DOCUMENT_VERSION', '文档格式需要先执行已声明的版本转换', 'M09');
      const checked = definition.validate?.(input.data) ?? validatePluginData(definition.schema, input.data);
      if (!checked.ok) return checked;
      return ok({ label: `编辑${instance.name}`, origin: 'plugin',
        expected: [{ ref: { kind: 'document', id: instance.documentId }, revision: instance.revision }],
        patches: [{ kind: 'json', documentId: instance.documentId, changes: [{ path: '/data', before: instance.data, after: checked.value, op: 'set' }] }],
        preparedAssets: [], requiredRefs: definition.collectReferences(checked.value) });
    });
  }

  remove(input: CurrentInput): Result<EditInput> {
    const current = this.current(input.documentId, input.expectedRevision);
    if (!current.ok) return current;
    const { document, instance } = current.value;
    return ok({ label: `删除${instance.name}`, origin: 'plugin',
      expected: [{ ref: { kind: 'document', id: instance.documentId }, revision: instance.revision }],
      patches: [{ kind: 'document', documentId: instance.documentId, op: 'delete', before: { format: document.format, files: document.files }, after: null }],
      preparedAssets: [], requiredRefs: [] });
  }
}
