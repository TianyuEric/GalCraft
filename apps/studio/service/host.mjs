import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ResourceRegistry } from '@galcraft/media-tools/resources';
import { EngineCatalog } from '@galcraft/publishing/engine';
import { StudioHost } from '../main/host.mjs';
import { AuthoringPreferences } from '../main/preferences.mjs';
import { ProjectDocuments } from '../main/document-providers.mjs';
import { ProjectAccess } from '../main/project-access.mjs';
import { CompilerTasks } from '../main/compiler-tasks.mjs';
import { StudioAssets } from '../main/asset-providers.mjs';
import { StudioPluginPackages } from '../main/plugin-packages.mjs';
import { pluginServiceContext, pluginServicePorts, pluginDocumentReferences } from '../main/plugin-service-ports.mjs';
import { StudioBackups } from '../main/backup-providers.mjs';
import { StudioProduction } from '../main/production-providers.mjs';
import { StudioBuilds } from '../main/build-providers.mjs';
import { StudioUpgrades } from '../main/upgrade-providers.mjs';
import { upgradeValidator } from '../main/upgrade-validation.mjs';
import { EnginePreview } from '../main/engine-preview.mjs';
import { installBundledEngine } from '../main/bundled-engine.mjs';
import { readBundledPlugins, readBundledServicePackages, installBundledPlugins } from '../main/bundled-plugins.mjs';
import { SoundBanks } from '../main/soundbanks.mjs';
import { soundBankBrowserPort } from '../main/soundbank-host.mjs';
import { StudioCollaboration } from '../main/collaboration-providers.mjs';
import { authoringPreview } from '../main/collaboration-preview.mjs';
import { prepareStudioPageEdit } from '../main/page-editing.mjs';
import { productionRuntimeDependencies } from '../main/production-runtimes.mjs';
import { createNodeSafeStorage } from './credentials.mjs';
import { NodeUtilityTasks } from './workers.mjs';
import { createBrowserCapture } from './browser-capture.mjs';
import { nodeReleaseLauncher } from './release-launcher.mjs';

export class HttpResourceRegistry extends ResourceRegistry {
  constructor(origin) { super(); this.origin = origin; }
  register(input) { const lease = super.register(input); return { ...lease, uri: `${this.origin}/resources/${lease.uri.slice('galcraft-resource://'.length)}` }; }
}
function openSystem(target) {
  const file = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  return new Promise(resolve => {
    const child = spawn(file, [target], { windowsHide: false, detached: true, stdio: 'ignore' });
    child.once('error', error => resolve(error.message)); child.once('spawn', () => { child.unref(); resolve(''); });
  });
}

/** The single domain assembly used by CLI, desktop, browser and MCP. */
export async function createNodeStudioHost({ userData, origin, publish = () => {}, requestDialog, requestContext = () => undefined }) {
  const root = resolve(process.env.GALCRAFT_STUDIO_ROOT ?? join(import.meta.dirname, '..'));
  const packaged = !!process.env.GALCRAFT_BUNDLED_ROOT || existsSync(join(root, 'resources/engines'));
  const bundledRoot = process.env.GALCRAFT_BUNDLED_ROOT ?? (packaged ? join(root, 'resources') : join(root, '../../build/desktop'));
  const officialPackageRoot = packaged ? join(bundledRoot, 'plugins') : join(root, '../../plugins');
  const officialPackages = await readBundledPlugins(officialPackageRoot);
  const engineCatalog = new EngineCatalog(userData);
  await installBundledEngine(engineCatalog, bundledRoot, '0.1.0');
  const resources = new HttpResourceRegistry(origin), operations = new NodeUtilityTasks();
  const language = new CompilerTasks(operations, engineCatalog), projectAccess = new ProjectAccess();
  const projects = new ProjectDocuments(projectAccess, undefined, engineCatalog);
  const dialog = {
    showOpenDialog: (_window, options) => requestDialog({ ...options, kind: 'open' }),
    showSaveDialog: (_window, options) => requestDialog({ ...options, kind: 'save' }),
  };
  const shell = { openPath: path => openSystem(path), openExternal: url => openSystem(url) };
  const window = { isDestroyed: () => false, webContents: { send: (event, data) => publish(event, data) } };
  operations.on('changed', event => publish('studio:operationChanged', event));
  const soundbanks = new SoundBanks(join(userData, 'soundbanks'));
  const toolDirectory = process.env.GALCRAFT_MEDIA_TOOL_DIR ?? (packaged ? join(bundledRoot, 'media/bin') : join(root, '../../tools/media/runtime/bin'));
  const modelDirectory = process.env.GALCRAFT_MATTING_MODEL_DIR ?? join(userData, 'models');
  const mattingWorker = packaged ? join(root, 'resources/matting/src/worker.mjs') : join(root, '../../tools/matting/src/worker.mjs');
  const assets = new StudioAssets(projects, toolDirectory, undefined, operations, resources, modelDirectory, mattingWorker, join(userData, 'runtimes/live2d'));
  let host;
  const productionRuntimes = productionRuntimeDependencies({
    directory: process.env.GALCRAFT_MOTION_CANVAS_RUNTIME ?? (packaged ? join(userData, 'runtimes/motion-canvas') : join(root, '../../tools/motion-canvas/runtime')),
    entry: packaged ? join(bundledRoot, 'motion-canvas/render.mjs') : join(root, '../../tools/motion-canvas/render.mjs'),
  });
  const plugins = new StudioPluginPackages(join(userData, 'plugins'), resources,
    (pluginId, target, session) => pluginServiceContext({ projects, assets, soundbanks, credential: id => host.connections.credential(id), runtimeDirectory: join(userData, 'runtimes/live2d'), productionRuntimes }, pluginId, target, session));
  let backups, browser, launcher;
  let closing, preparingStop;
  const prepareStop = () => preparingStop ??= (async () => {
    launcher?.prepareStop(); host?.builds?.prepareStop();
    await Promise.all([operations.close(), host?.production?.prepareStop()]);
  })();
  const close = () => closing ??= (async () => {
    const errors = [];
    const cleanup = async work => { try { await work(); } catch (error) { errors.push(error); } };
    await cleanup(prepareStop);
    await cleanup(() => host?.collaboration?.close());
    if (host?.production) {
      for (const service of [...host.production.activeServices]) await cleanup(() => host.production.closeProject(service.store.projectId));
    }
    await cleanup(() => assets.stopPreview());
    assets.clearThumbnails();
    const session = projects.currentSession;
    if (session) await cleanup(async () => { const result = await session.dispose('keep'); if (!result.ok) throw new Error(result.error.message); projectAccess.release(projects.currentSessionId); });
    for (const id of host?.engines?.handles.keys() ?? []) host.engines.releasePreview(id);
    await cleanup(() => launcher?.close()); await cleanup(() => browser?.close()); await cleanup(() => plugins.dispose()); await cleanup(() => backups?.plugins?.dispose());
    if (errors.length) throw new AggregateError(errors, 'Studio host cleanup failed');
  })();
  try {
    await installBundledPlugins(plugins, officialPackages);
    plugins.setStudioServices(await readBundledServicePackages(officialPackageRoot));
    const ports = pluginServicePorts(plugins);
    assets.resourceProcessors = ports.resourceProcessors; assets.resourceProviders = ports.resourceProviders; assets.assetTypes = ports.assetTypes;
    assets.pluginReferences = (session, assetId, options) => pluginDocumentReferences(plugins, session, assetId, options);
    backups = new StudioBackups({ userData, projects, engineCatalog, officialPackages });
    host = new StudioHost({ userData, dialog, shell, safeStorage: createNodeSafeStorage(userData), window, operations, projectAccess, projects, documents: projects, assets, language, plugins, backups });
    const browserPreferences = new AuthoringPreferences(join(userData, 'entries/browser'));
    host.entryPreferences = () => requestContext()?.entry === 'browser' ? browserPreferences : host.preferences;
    host.engines = new EnginePreview(engineCatalog, resources, { projects, dialog:{...dialog,showOpenDialog:(_window,options)=>host.importSelection.choose('packages',options)}, window });
    host.soundbanks = soundBankBrowserPort(soundbanks, resources, async () => { const result = await host.importSelection.choose('packages', { title: '选择采样音色文件', properties: ['openFile'], filters: [{ name: 'SoundFont', extensions: ['sf2', 'sf3'] }] }); return { ok: true, value: result.canceled ? null : result.filePaths[0] ?? null, warnings: [] }; });
    assets.targetValidation = { plugins, engines: host.engines };
    host.production = new StudioProduction({ userData, projects, assets, connections: host.connections, resources, language, generationProviders: ports.generationProviders });
    browser = createBrowserCapture({ origin, host: () => host });
    host.captureReadiness=browser.readiness;
    assets.verifyAssetPlayback = browser.verifyAssetPlayback;
    host.collaboration = new StudioCollaboration({ userData, projects, assets, production: host.production, plugins, window, dialog, preview: input => authoringPreview(host.production, input, plugins), capture: browser.capture, host });
    host.pageEditing = request => prepareStudioPageEdit({ documents: [...projects.currentSession.documents.values()], request, capture: browser.capture });
    assets.comfyMatting = (request, choice, collaboration, signal) => host.production.prepareComfyMatting(request, choice, collaboration, signal);
    host.inspectConnection = (_entry, selection) => host.production.testConnection(selection);
    projects.beforeClose = session => host.production.closeProject(session.projectId);
    launcher = nodeReleaseLauncher({ userData, browser, shell });
    host.upgrades = new StudioUpgrades({ userData, projects, engineCatalog, backups, validate: upgradeValidator({ userData, engineCatalog, operations, officialPackages, launcher }) });
    host.builds = new StudioBuilds({ projects, language, engineCatalog, pluginRoot: plugins.root, pluginPackages: plugins, toolchainProgress: event => publish('studio:toolchainProgress', event), officialPackages, verify: launcher.verify, test: launcher.test,
      fontSubsetScript: packaged ? join(root, 'resources/fonts/subset.py') : join(root, '../../tools/fonts/subset.py'),
      instructions: async path => { const error = await shell.openPath(path); return error ? { ok: false, error: { message: error } } : { ok: true, value: undefined, warnings: [] }; } });
    await host.collaboration.ready;
    return { host, resources, prepareStop, close };
  } catch (error) { try { await close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Studio host startup failed'); } throw error; }
}
