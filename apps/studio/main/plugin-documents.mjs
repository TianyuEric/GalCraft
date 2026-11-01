import { createId, readPluginDocumentInstances } from '@galcraft/contracts';
import { validatePluginData } from '@galcraft/plugins/contracts';
import { fail, ok } from './result.mjs';

export const pluginDocumentInstances = readPluginDocumentInstances;

export class PluginDocuments {
  constructor(projects, plugins) { this.projects = projects; this.plugins = plugins; }
  list(input) {
    const listed = this.projects.list();
    return listed.ok ? ok(pluginDocumentInstances(listed.value).filter(item => item.pluginId === input.pluginId &&
      (!input.contributionKey || item.contributionKey === input.contributionKey))) : listed;
  }
  async definition(key, action) {
    const session = this.projects.currentSession;
    if (!session) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02');
    const acquired = await this.plugins.acquireDefinitions(session);
    if (!acquired.ok) return acquired;
    try {
      const definition = acquired.value.documents.find(item => item.key === key);
      return definition ? await action(definition, session) : fail('PLUGIN_DOCUMENT_PROVIDER', `缺少文档提供者 ${key}`, 'M09', ['supplyDependency']);
    } finally { await acquired.value.release(); }
  }
  async create(input) {
    if (!input.contributionKey?.startsWith(`${input.pluginId}/`)) return fail('PLUGIN_DOCUMENT_IDENTITY', '文档类型与插件不符', 'M09');
    return this.definition(input.contributionKey, (definition, session) => {
      if (definition.instances === 'fixed' && pluginDocumentInstances([...session.documents.values()]).some(item => item.contributionKey === definition.key))
        return fail('PLUGIN_DOCUMENT_FIXED', '固定配置实例已经存在，请编辑已有配置', 'M02');
      const checked = definition.validate?.(input.data ?? definition.initial) ?? validatePluginData(definition.schema, input.data ?? definition.initial);
      if (!checked.ok) return checked;
      const documentId = createId(), localName = definition.key.slice(input.pluginId.length + 1);
      const metadata = { pluginId: input.pluginId, contributionKey: definition.key,
        name: input.name?.trim() || definition.titleKey || localName, stateVersion: definition.stateVersion ?? 1 };
      const files = { [`plugins/${input.pluginId}/${localName}/${documentId}.json`]: JSON.stringify({
        schemaVersion: 1, documentId, revision: 1, pluginDocument: metadata, data: checked.value }, null, 2) + '\n' };
      return ok({ label: `创建${metadata.name}`, origin: 'plugin', expected: [],
        patches: [{ kind: 'document', documentId, op: 'create', before: null, after: { format: 'json', files } }],
        preparedAssets: [], requiredRefs: definition.collectReferences(checked.value) });
    });
  }
  current(documentId, expectedRevision) {
    const session = this.projects.currentSession;
    if (!session) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02');
    const document = session.readDocument(documentId);
    const instance = document && pluginDocumentInstances([document])[0];
    if (!instance) return fail('PLUGIN_DOCUMENT_MISSING', '插件文档不存在', 'M02');
    if (expectedRevision !== undefined && instance.revision !== expectedRevision)
      return fail('EDIT_CONFLICT', '文档已变化，请保留结果并重新审阅', 'M02');
    return ok({ document, instance });
  }
  async copy(input) {
    const current = this.current(input.documentId);
    if (!current.ok) return current;
    const { instance } = current.value;
    return this.definition(instance.contributionKey, async definition => {
      const documentId = createId(), rewritten = definition.rewriteReferences(instance.data, { [instance.documentId]: documentId });
      if (!rewritten.ok) return rewritten;
      const created = await this.create({ ...instance, data: rewritten.value, name: input.name ?? `${instance.name} 副本` });
      if (!created.ok) return created;
      // Use the identity supplied to reference rewriting for both the envelope and path.
      const patch = created.value.patches[0], generatedId = patch.documentId, files = patch.after.files;
      patch.documentId = documentId;
      patch.after.files = Object.fromEntries(Object.entries(files).map(([path, raw]) => {
        const envelope = JSON.parse(raw); envelope.documentId = documentId;
        return [path.replace(`${generatedId}.json`, `${documentId}.json`), JSON.stringify(envelope, null, 2) + '\n'];
      }));
      created.value.expected = [{ ref: { kind: 'document', id: instance.documentId }, revision: instance.revision }];
      return created;
    });
  }
  async update(input) {
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
  /** @returns {import('@galcraft/contracts').Result<import('@galcraft/contracts').EditInput>} */
  remove(input) {
    const current = this.current(input.documentId, input.expectedRevision);
    if (!current.ok) return current;
    const { document, instance } = current.value;
    return ok({ label: `删除${instance.name}`, origin: 'plugin',
      expected: [{ ref: { kind: 'document', id: instance.documentId }, revision: instance.revision }],
      patches: [{ kind: 'document', documentId: instance.documentId, op: 'delete', before: { format: document.format, files: document.files }, after: null }],
      preparedAssets: [], requiredRefs: [] });
  }
}
