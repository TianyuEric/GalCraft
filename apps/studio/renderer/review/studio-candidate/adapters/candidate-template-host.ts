import {
  createId, LockSchema, StyleEditInputSchema, TemplateLibraryInputSchema, TemplateSwitchInputSchema,
  type DocumentView, type EditInput, type Issue, type Json, type Lock, type NamedStyle, type Result, type RuntimeTemplate,
  type StudioBridge, type StyleEditInput, type TemplateSwitchOptions, type TemplateSwitchResult,
} from '@galcraft/contracts';
import {
  components, createOfficialTemplate, planTemplate, preparePageEdit, readTemplateDocuments, readTemplateSource,
  restoreHiddenTemplatePage, templateEdit, inspectTemplate, templateExternalReferences, mapTemplateExternalReferences,
  type PageEditPlan, type TemplateExternalReference,
} from '@galcraft/templates';
import { templateReferenceTargets } from './template-reference-targets.js';

type CompileStyle = typeof import('@galcraft/templates/compiler').compileStyle;
type TemplateIdentity = { id: string; version: string };
type LibraryEntry = { template: RuntimeTemplate; name: string; official: boolean; references?: TemplateExternalReference[]; files?: Record<string, string> };
const keyOf = ({ id, version }: TemplateIdentity) => `${id}@${version}`;
const filesOf = (documents: DocumentView[]): Record<string, string> => Object.assign({}, ...documents.map(document => document.files));

async function run<T>(work: () => T | Promise<T>): Promise<Result<T>> {
  try { return { ok: true, value: await work(), warnings: [] }; }
  catch (reason) {
    const error: Issue = { code: 'CANDIDATE_TEMPLATE', message: reason instanceof Error ? reason.message : String(reason),
      owner: 'M08', severity: 'error', related: [], actions: ['edit', 'retry'] };
    return { ok: false, error, issues: [error] };
  }
}

function expectDocument(edit: EditInput, document: DocumentView) {
  if (!edit.expected.some(version => version.ref.kind === 'document' && version.ref.id === document.documentId)) {
    edit.expected.push({ ref: { kind: 'document', id: document.documentId }, revision: document.revision });
  }
}

function templateRoot(documents: DocumentView[]) {
  const root = documents.find(document => 'ui/template.json' in document.files);
  if (!root) throw new Error('作品缺少界面模板文档。');
  return root;
}

function patchStyleFile(edit: EditInput, document: DocumentView, path: string, after: string | null) {
  const before = document.files[path] ?? null;
  if (before === after) return;
  expectDocument(edit, document);
  edit.patches.push({ kind: 'file', documentId: document.documentId, path, before, after });
}

function prepareStyle(documents: DocumentView[], input: StyleEditInput, compileStyle: CompileStyle): PageEditPlan {
  const request = StyleEditInputSchema.parse(input);
  const template = readTemplateDocuments(documents);
  const page = template.pages.find(item => item.id === request.pageId);
  if (!page || request.componentId && !components(page.root).some(item => item.id === request.componentId)) throw new Error('样式目标已变化。');
  const index = template.styles.findIndex(item => item.id === request.styleId);
  const previous = template.styles[index];
  if (request.styleId && !previous) throw new Error('命名样式已被删除。');
  const id = previous?.id ?? createId(documents);
  const sourcePath = previous && previous.language === request.language && previous.sourcePath !== previous.compiledPath
    ? previous.sourcePath : `ui/styles/${id}.source.${request.language}`;
  const compiledPath = previous?.compiledPath && previous.compiledPath !== sourcePath ? previous.compiledPath : `ui/styles/${id}.compiled.css`;
  const style: NamedStyle = {
    ...previous, id, name: request.name, scope: { pageId: page.id, componentId: request.componentId }, activation: request.activation,
    language: request.language, sourcePath, sourceRevision: (previous?.sourceRevision ?? 0) + 1, compiledPath,
    compiledSourceRevision: previous?.compiledSourceRevision ?? null, assets: previous?.assets ?? [], issues: [],
  };
  const files = filesOf(documents);
  const compiled = compileStyle({ style, source: request.source, instanceId: template.instanceId, modules: files, lastValidCss: files[compiledPath] });
  if (previous) template.styles[index] = compiled.style;
  else template.styles.push(compiled.style);
  const root = templateRoot(documents);
  const sourceOwner = documents.find(document => sourcePath in document.files) ?? root;
  const edit = templateEdit(documents, template, request.label);
  patchStyleFile(edit, sourceOwner, sourcePath, request.source);
  if (compiled.css !== null && compiled.style.compiledPath) {
    const path = compiled.style.compiledPath;
    patchStyleFile(edit, documents.find(document => path in document.files) ?? root, path, compiled.css);
  }
  if (previous && previous.sourcePath !== sourcePath && previous.sourcePath !== previous.compiledPath) {
    const owner = documents.find(document => previous.sourcePath in document.files);
    if (owner) patchStyleFile(edit, owner, previous.sourcePath, null);
  }
  return { template, edit, affected: { pageIds: [page.id], componentIds: request.componentId ? [request.componentId] : [], styleIds: [id], animationIds: [] },
    created: { pages: [], components: [], styles: previous ? [] : [id], animations: [] }, issues: compiled.style.issues };
}

function prepareSwitch(documents: DocumentView[], source: RuntimeTemplate, options: TemplateSwitchOptions | undefined, compileStyle: CompileStyle, sourceFiles: Record<string, string> = {}): TemplateSwitchResult {
  const plan = planTemplate(readTemplateDocuments(documents), source, [], {
    baseline: readTemplateSource(documents), options, currentFiles: filesOf(documents), sourceFiles,
  });
  for (const [index, style] of plan.template.styles.entries()) {
    const sourceText = plan.files[style.sourcePath];
    if (style.enabled === false || sourceText === undefined) continue;
    const compiled = compileStyle({ style, source: sourceText, instanceId: plan.template.instanceId, modules: plan.files,
      lastValidCss: style.compiledPath ? plan.files[style.compiledPath] : undefined });
    plan.template.styles[index] = compiled.style;
    if (compiled.css !== null && compiled.style.compiledPath) plan.files[compiled.style.compiledPath] = compiled.css;
    if (compiled.style.issues.some(issue => issue.severity === 'error')) {
      plan.conflicts.push({ path: `/styles/${style.id}`, kind: 'reference', before: null, current: style, incoming: compiled.style.issues, resolution: null });
      plan.blocked = true;
    }
  }
  const lockDocument = documents.find(document => 'dependencies.lock.json' in document.files);
  const before = lockDocument ? JSON.parse(lockDocument.files['dependencies.lock.json']!).data as Lock : null;
  const lock = before ? LockSchema.parse(before) : null;
  const plugins = [...(lock?.plugins ?? [])];
  for (const dependency of plan.dependencies.filter(item => item.kind === 'plugin')) {
    const existing = plugins.find(item => item.id === dependency.id);
    if (existing && existing.version !== dependency.version) {
      plan.conflicts.push({ path: `/dependencies/${dependency.id}`, kind: 'reference', before: existing, current: existing, incoming: dependency, resolution: null });
      plan.blocked = true;
    } else if (!existing) plugins.push(dependency);
  }
  if (plan.blocked) return { ...plan, edit: null };
  const root = templateRoot(documents);
  const edit = templateEdit(documents, plan.template, '应用 Player 界面模板', plan.sourceRecord);
  for (const document of documents) {
    if (Object.keys(document.files).some(path => path.startsWith('ui/'))) expectDocument(edit, document);
  }
  for (const [path, value] of Object.entries(plan.files)) {
    patchStyleFile(edit, documents.find(document => path in document.files) ?? root, path, value);
  }
  if (lockDocument && before && lock) {
    const after = { ...lock, template: { ...lock.template, id: source.id, version: source.version }, plugins };
    expectDocument(edit, lockDocument);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      edit.patches.push({ kind: 'json', documentId: lockDocument.documentId, changes: [{ path: '/data', before, after, op: 'set' }] });
    }
  }
  return { ...plan, edit };
}

/** The review library keeps package identities in the browser session. The work owns every applied change. */
export function createCandidateTemplateHost(host: { list(): DocumentView[] }, packages: readonly Uint8Array[] = []): StudioBridge['templates'] {
  const library = new Map<string, LibraryEntry>();
  for (const kind of ['light', 'standard', 'rich'] as const) {
    const template = createOfficialTemplate({ kind });
    library.set(keyOf(template), { template, name: template.id, official: true });
  }
  // Installed review inputs use the real template package format. Absolute-path
  // installation remains a desktop operation; this is per-session package data.
  for (const bytes of packages) {
    const entry = inspectTemplate(bytes);
    if (entry.assets.length) throw new Error('带二进制素材的模板包需要桌面安装服务。');
    const files = Object.fromEntries(Object.entries(entry.files).filter(([path]) => path.startsWith('ui/styles/') && /\.(css|scss)$/.test(path))
      .map(([path, value]) => [path, new TextDecoder().decode(value)]));
    library.set(keyOf(entry.template), { template: entry.template, name: entry.manifest.name, official: false, references: entry.externalReferences, files });
  }
  const get = (identity: TemplateIdentity) => {
    const entry = library.get(keyOf(identity));
    if (!entry) throw new Error('模板版本不存在，请重新选择。');
    return entry;
  };
  const summary = ({ template, name, official }: LibraryEntry) => ({ id: template.id, version: template.version, name, official,
    description: '', features: template.features, targets: ['web', 'windows'], dependencies: template.dependencies });
  // The direct entry provides the existing Sass browser build. Storybook's stub covers internal package imports.
  const compiler = () => import('@galcraft/templates/compiler');
  return {
    library: raw => run((): Json => {
      const input = TemplateLibraryInputSchema.parse(raw);
      if (input.action === 'list') {
        const search = input.search?.toLocaleLowerCase() ?? '';
        const selected = [...library.values()].map(summary).filter(entry => `${entry.name} ${entry.id}`.toLocaleLowerCase().includes(search));
        const offset = input.offset ?? 0, limit = input.limit ?? 30;
        return { items: selected.slice(offset, offset + limit), total: selected.length, offset, limit, nextOffset: offset + limit < selected.length ? offset + limit : null };
      }
      if (input.action === 'import' || input.action === 'export' || input.action === 'exportCurrent') {
        throw new Error('模板交换包的绝对路径读写需要桌面 Studio。');
      }
      const entry = get(input);
      if (input.action === 'detail') return { ...summary(entry), externalReferences: entry.references ?? templateExternalReferences(entry.template), examples: [], pages: entry.template.pages.map(({ id, key }) => ({ id, key })) };
      if (input.action === 'copy') {
        const template = structuredClone(entry.template);
        template.id = `review.template.${createId()}`;
        template.dependencies = template.dependencies.map(dependency => dependency.kind === 'template' && dependency.id === entry.template.id
          ? { ...dependency, id: template.id } : dependency);
        const copied = { ...structuredClone(entry), template, name: input.name?.trim() || `${entry.name} 副本`, official: false };
        library.set(keyOf(template), copied);
        return summary(copied);
      }
      if (entry.official) throw new Error('请先复制官方模板，再管理用户副本。');
      if (input.action === 'rename') {
        const name = input.name.trim();
        if (!name) throw new Error('请输入模板名称。');
        entry.name = name;
      } else library.delete(keyOf(input));
      return summary(entry);
    }),
    prepareTemplateSwitch: raw => run(async () => {
      const input = TemplateSwitchInputSchema.parse(raw);
      const entry = get(input);
      const documents = host.list();
      const references = entry.references ?? templateExternalReferences(entry.template);
      const targets = templateReferenceTargets(documents);
      const variables = targets.flatMap(target => target.variable ? [target.variable] : []);
      for (const reference of references) {
        const id = input.mappings?.[reference.key];
        if (id && !targets.some(target => target.kind === reference.kind && target.id === id)) throw new Error(`TEMPLATE_REFERENCE_TARGET_MISSING: ${reference.key}`);
      }
      const source = references.length ? mapTemplateExternalReferences(entry.template, references, input.mappings ?? {}, variables) : entry.template;
      const { compileStyle } = await compiler();
      const plan = prepareSwitch(documents, source, input.options, compileStyle, entry.files);
      if (plan.edit) for (const reference of references) {
        const target = targets.find(target => target.kind === reference.kind && target.id === input.mappings?.[reference.key]);
        for (const id of target?.documentIds ?? []) expectDocument(plan.edit, documents.find(document => document.documentId === id)!);
      }
      return plan;
    }),
    preparePageEdit: request => run(() => preparePageEdit({ documents: host.list(), request })),
    preparePageStyleEdit: request => run(async () => {
      const documents = host.list();
      const { compileStyle } = await compiler();
      return prepareStyle(documents, request, compileStyle);
    }),
    restoreTemplatePage: key => run(() => ({ edit: restoreHiddenTemplatePage(host.list(), key) })),
    compileStyle: input => run(async () => (await compiler()).compileStyle(input)),
  };
}
