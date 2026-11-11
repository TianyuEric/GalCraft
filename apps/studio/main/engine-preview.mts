import { createId, LockSchema, ProjectSchema, normalizeProjectAuthoringData, type Snapshot, type Target, type VersionRef } from '@galcraft/contracts';
import { dirname, join } from 'node:path';
import type { EngineCatalog } from '@galcraft/publishing/engine';
import type { ProjectSession } from '@galcraft/documents';
import type { OpenDialogOptions, OpenDialogReturnValue } from 'electron';

import { fail, ok } from './result.mjs';
import { leaseLive2DRuntime } from './live2d-release.mjs';
import { installLive2DSDK } from './live2d-sdk.mjs';
import { checkProjectEngine, installRestoreEngine, savedProjectEngine } from './restore-dependency.mts';

type Lease = { release(): void };
type Resources = { register(input: { projectId: string; assetId: string; variantId: string; relative: string; path: string; mime: string }): Lease & { uri: string } };
type Options = { projects: { readonly currentSession: ProjectSession | null }; window: unknown;
  dialog: { showOpenDialog(window: unknown, options: OpenDialogOptions): Promise<OpenDialogReturnValue> } };

export class EnginePreview {
  readonly handles = new Map<string, Lease[]>();
  private readonly catalog: EngineCatalog;
  private readonly resources: Resources;
  private readonly options?: Options;
  constructor(catalog: EngineCatalog, resources: Resources, options?: Options) {
    this.catalog = catalog;
    this.resources = resources;
    this.options = options;
  }
  async listCreationVersions() {
    const listed = await this.catalog.listCreationVersions('web');
    return listed.ok ? { ...listed, value: listed.value.map(engine => engine.version) } : listed;
  }
  async health() {
    const session = this.options?.projects.currentSession;
    if (!session) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M11');
    try { return ok(await checkProjectEngine(this.catalog, session)); }
    catch (error) { return fail('ENGINE_HEALTH', String(error), 'M11'); }
  }
  async repair() {
    if (!this.options) return fail('ENGINE_IMPORT_UNAVAILABLE', '引擎导入服务尚未就绪', 'M11');
    const { projects, dialog, window } = this.options;
    const session = projects.currentSession;
    if (!session) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M11');
    try {
      const { lock } = savedProjectEngine(session);
      const current = await checkProjectEngine(this.catalog, session);
      if (!current.issues.some(issue => issue.code === 'ENGINE_MISSING' || issue.code === 'ENGINE_INVALID')) return ok(current);
      const choice = await dialog.showOpenDialog(window, { title: `选择 ${lock.engine.id}@${lock.engine.version} 引擎目录`, properties: ['openDirectory'] });
      if (choice.canceled || !choice.filePaths[0]) return ok(null);
      if (projects.currentSession !== session) return fail('PROJECT_CHANGED', '作品已切换，请重新检查引擎', 'M11');
      await installRestoreEngine(this.catalog, lock.engine, choice.filePaths[0], true);
      return ok(await checkProjectEngine(this.catalog, session));
    } catch (error) { return fail('ENGINE_REPAIR', String(error), 'M11'); }
  }
  async importLive2D(withMotionSync: boolean) {
    if (!this.options) return fail('ENGINE_IMPORT_UNAVAILABLE', '引擎导入服务尚未就绪', 'M11');
    const { projects, dialog, window } = this.options, session = projects.currentSession;
    if (!session) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M11');
    const documents = [...session.documents.values()], document = documents.find(item => item.files['dependencies.lock.json']);
    try {
      const projectFile = documents.find(item => item.files['project.json'])?.files['project.json'];
      if (!document || !projectFile) return fail('PROJECT_DEPENDENCIES_MISSING', '找不到作品或依赖配置', 'M11');
      const lock = LockSchema.parse(JSON.parse(document.files['dependencies.lock.json']).data);
      const project = ProjectSchema.parse(normalizeProjectAuthoringData(JSON.parse(projectFile).data));
      const engine = await this.catalog.resolveProjectEngine(project, lock, 'web'); if (!engine.ok) return engine;
      const selected = await dialog.showOpenDialog(window, { title: 'Cubism Web SDK 5-r.4', properties: ['openDirectory'] });
      if (selected.canceled || !selected.filePaths[0]) return ok(null);
      let motionSDK;
      if (withMotionSync) {
        const selectedMotion = await dialog.showOpenDialog(window, { title: 'MotionSync SDK 5-r.2', properties: ['openDirectory'] });
        if (selectedMotion.canceled || !selectedMotion.filePaths[0]) return ok(null); motionSDK = selectedMotion.filePaths[0];
      }
      const installed = await installLive2DSDK({ engine: engine.value, root: join(this.catalog.directory, '../runtimes/live2d'), sdk: selected.filePaths[0], motionSDK });
      if (projects.currentSession !== session) return fail('PROJECT_CHANGED', '作品已切换，请重新选择运行时', 'M11');
      const nextLock = LockSchema.parse({ ...lock, live2dRuntime: installed });
      const expected: VersionRef[] = [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }];
      const planned = session.planEdit({ label: '锁定 Live2D 运行时', origin: 'field', expected,
        patches: [{ kind: 'json', documentId: document.documentId, changes: [{ path: '/data', op: 'set', before: JSON.parse(document.files['dependencies.lock.json']).data, after: nextLock }] }], preparedAssets: [], requiredRefs: [] });
      if (!planned.ok) return planned; const applied = session.applyEdit(planned.value.planId, expected); if (!applied.ok) return applied;
      return ok(nextLock.live2dRuntime ?? null);
    } catch (error) { return fail('LIVE2D_SDK_IMPORT', String(error), 'M06', ['supplyDependency']); }
  }
  async resolvePreview(snapshot: Pick<Snapshot, 'project' | 'lock' | 'engineVersion' | 'assets'>, target: Target = 'web') {
    const resolved = await this.catalog.resolveProjectEngine(snapshot.project, snapshot.lock, target);
    if (!resolved.ok) return resolved;
    if (snapshot.engineVersion !== resolved.value.manifest.version)
      return fail('ENGINE_LOCK_MISMATCH', '预览快照与锁定引擎不一致', 'M11');
    const { manifest, directory } = resolved.value, entry = manifest.entries.preview;
    if (!entry) return fail('ENGINE_PREVIEW_MISSING', `引擎 ${manifest.version} 缺少预览运行入口`, 'M11', ['supplyDependency']);
    const handleId = createId(), leases: Lease[] = [];
    let live2d: { url: string; expected: NonNullable<Snapshot['lock']['live2dRuntime']> } | undefined;
    if (snapshot.assets.some(asset => asset.kind === 'live2d')) {
      try {
        const expected = snapshot.lock.live2dRuntime;
        if (!expected) throw new Error('作品未锁定 Cubism Web R4 运行时');
        const runtime = await leaseLive2DRuntime(this.resources, join(this.catalog.directory, '../runtimes/live2d'), expected);
        leases.push(runtime);
        if (!runtime.url) throw new Error('Cubism 运行入口无法解析');
        live2d = { url: runtime.url, expected };
      }
      catch (error) {
        for (const lease of leases) lease.release();
        return fail('LIVE2D_RUNTIME_MISSING', String(error), 'M06', ['supplyDependency']);
      }
    }
    const prefix = dirname(entry).replaceAll('\\', '/') + '/';
    try {
      let url: string | undefined;
      for (const file of manifest.files.filter(file => file.path === entry || file.path.startsWith(prefix))) {
        const lease = this.resources.register({ projectId: 'engines', assetId: manifest.version, variantId: handleId,
          relative: file.path, path: join(directory, file.path), mime: /\.m?js$/.test(file.path) ? 'text/javascript' : 'application/octet-stream' });
        leases.push(lease);
        if (file.path === entry) url = lease.uri;
      }
      if (!url) throw new Error(`无法解析引擎 ${manifest.version} 的预览入口`);
      this.handles.set(handleId, leases);
      return ok({ handleId, engineVersion: manifest.version, url, live2d });
    } catch (error) {
      for (const lease of leases) lease.release();
      return fail('ENGINE_PREVIEW_MISSING', String(error), 'M11', ['supplyDependency']);
    }
  }
  releasePreview(handleId: string) {
    for (const lease of this.handles.get(handleId) ?? []) lease.release();
    this.handles.delete(handleId); return ok(undefined);
  }
}
