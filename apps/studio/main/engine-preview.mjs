import { createId } from '@galcraft/contracts';
import { dirname, join } from 'node:path';

import { fail, ok } from './result.mjs';
import { leaseLive2DRuntime } from './live2d-release.mjs';
import { installLive2DSDK } from './live2d-sdk.mjs';

export class EnginePreview {
  constructor(catalog, resources, options = {}) { this.catalog = catalog; this.resources = resources; this.handles = new Map(); this.options = options; }
  async listCreationVersions() {
    const listed = await this.catalog.listCreationVersions('web');
    return listed.ok ? { ...listed, value: listed.value.map(engine => engine.version) } : listed;
  }
  async importLive2D(withMotionSync) {
    const { projects, dialog, window } = this.options, session = projects?.currentSession;
    if (!session) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M11');
    const documents = [...session.documents.values()], document = documents.find(item => item.files['dependencies.lock.json']);
    const lock = JSON.parse(document.files['dependencies.lock.json']).data;
    const project = JSON.parse(documents.find(item => item.files['project.json']).files['project.json']).data;
    const engine = await this.catalog.resolveProjectEngine(project, lock, 'web'); if (!engine.ok) return engine;
    try {
      const selected = await dialog.showOpenDialog(window, { title: 'Cubism Web SDK 5-r.4', properties: ['openDirectory'] });
      if (selected.canceled) return ok(null);
      let motionSDK;
      if (withMotionSync) {
        const selectedMotion = await dialog.showOpenDialog(window, { title: 'MotionSync SDK 5-r.2', properties: ['openDirectory'] });
        if (selectedMotion.canceled) return ok(null); motionSDK = selectedMotion.filePaths[0];
      }
      const installed = await installLive2DSDK({ engine: engine.value, root: join(this.catalog.directory, '../runtimes/live2d'), sdk: selected.filePaths[0], motionSDK });
      if (projects.currentSession !== session) return fail('PROJECT_CHANGED', '作品已切换，请重新选择运行时', 'M11');
      const expected = [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }];
      const planned = session.planEdit({ label: '锁定 Live2D 运行时', origin: 'field', expected,
        patches: [{ kind: 'json', documentId: document.documentId, changes: [{ path: '/data', op: 'set', before: lock, after: { ...lock, live2dRuntime: installed } }] }], preparedAssets: [], requiredRefs: [] });
      if (!planned.ok) return planned; const applied = session.applyEdit(planned.value.planId, expected); if (!applied.ok) return applied;
      return ok(installed);
    } catch (error) { return fail('LIVE2D_SDK_IMPORT', String(error), 'M06', ['supplyDependency']); }
  }
  async resolvePreview(snapshot, target = 'web') {
    const resolved = await this.catalog.resolveProjectEngine(snapshot.project, snapshot.lock, target);
    if (!resolved.ok) return resolved;
    if (snapshot.engineVersion !== resolved.value.manifest.version)
      return fail('ENGINE_LOCK_MISMATCH', '预览快照与锁定引擎不一致', 'M11');
    const { manifest, directory } = resolved.value, entry = manifest.entries.preview;
    if (!entry) return fail('ENGINE_PREVIEW_MISSING', `引擎 ${manifest.version} 缺少预览运行入口`, 'M11', ['supplyDependency']);
    const handleId = createId(), leases = [], urls = new Map();
    let live2d;
    if (snapshot.assets.some(asset => asset.kind === 'live2d')) {
      try { const runtime = await leaseLive2DRuntime(this.resources, join(this.catalog.directory, '../runtimes/live2d'), snapshot.lock.live2dRuntime);
        leases.push(runtime); live2d = { url: runtime.url, expected: runtime.expected }; }
      catch (error) { return fail('LIVE2D_RUNTIME_MISSING', String(error), 'M06', ['supplyDependency']); }
    }
    const prefix = dirname(entry).replaceAll('\\', '/') + '/';
    for (const file of manifest.files.filter(file => file.path.startsWith(prefix))) {
      const lease = this.resources.register({ projectId: 'engines', assetId: manifest.version, variantId: handleId,
        relative: file.path, path: join(directory, file.path), mime: /\.m?js$/.test(file.path) ? 'text/javascript' : 'application/octet-stream' });
      leases.push(lease); urls.set(file.path, lease.uri);
    }
    this.handles.set(handleId, leases);
    return ok({ handleId, engineVersion: manifest.version, url: urls.get(entry), live2d });
  }
  releasePreview(handleId) {
    for (const lease of this.handles.get(handleId) ?? []) lease.release();
    this.handles.delete(handleId); return ok(undefined);
  }
}
