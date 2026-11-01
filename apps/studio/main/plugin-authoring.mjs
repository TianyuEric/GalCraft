import { RuntimeTemplateSchema } from '@galcraft/contracts';
import { readTemplateDocuments, templateEdit, templateIssues, findComponent, insertPluginComponent } from '@galcraft/templates';
import { validatePluginData } from '@galcraft/plugins/contracts';
import { fail, ok } from './result.mjs';

export class PluginPlayerUi {
  constructor(projects, plugins) { this.projects = projects; this.plugins = plugins; }
  async withTemplate(action) {
    const session = this.projects.currentSession;
    if (!session) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02');
    const definitions = await this.plugins.acquireDefinitions(session);
    if (!definitions.ok) return definitions;
    try {
      const documents = [...session.documents.keys()].map(id => session.readDocument(id));
      return action(readTemplateDocuments(documents), definitions.value, documents);
    } finally { await definitions.value.release(); }
  }
  catalog() {
    return this.withTemplate((template, definitions) => ok({
      pages: template.pages.map(page => ({ id: page.id, key: page.key, titleKey: page.titleKey, root: page.root })),
      components: definitions.components, pluginPages: definitions.pages,
      styles: template.styles, animations: template.animations,
    }));
  }
  change(template, definitions, input) {
    if (input.kind === 'insertComponent') {
      const definition = definitions.components.find(item => item.key === input.key);
      if (!definition) throw new Error(`缺少组件 ${input.key}`);
      const props = input.props ?? definition.sampleProps ?? {};
      const valid = validatePluginData(definition.propsSchema ?? {}, props);
      if (!valid.ok) throw new Error(valid.error.message);
      return insertPluginComponent(template, input.pageId, input.parentId, definition, props).template;
    }
    const next = structuredClone(template), component = findComponent(next, input.componentId);
    if (!component) throw new Error('所选组件不存在');
    for (const field of ['layout', 'normal', 'states', 'visible', 'locked']) if (input[field] !== undefined) {
      component[field] = typeof input[field] === 'object' ? { ...component[field], ...input[field] } : input[field];
    }
    if (input.props !== undefined) {
      const definition = definitions.components.find(item => item.key === component.plugin?.key);
      if (!definition) throw new Error('所选组件没有可编辑插件属性');
      const valid = validatePluginData(definition.propsSchema ?? {}, input.props);
      if (!valid.ok) throw new Error(valid.error.message);
      component.plugin.props = valid.value;
    }
    return RuntimeTemplateSchema.parse(next);
  }
  prepare(input) {
    return this.withTemplate((template, definitions, documents) => {
      const next = this.change(template, definitions, input), issues = templateIssues(next);
      return issues.length ? fail('PLUGIN_UI_LAYOUT', issues.join('；'), 'M08')
        : ok(templateEdit(documents, next, input.label ?? '插件页面编辑'));
    });
  }
  preview(input) {
    return this.withTemplate((template, definitions) => {
      const next = input.componentId || input.kind === 'insertComponent' ? this.change(template, definitions, input) : template;
      return ok({ template: next, issues: templateIssues(next), sample: input.sample ?? null });
    });
  }
}
