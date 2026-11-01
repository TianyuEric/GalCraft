// @ts-check
import { createStudioHandlers } from './ipc-handlers.mjs';

import { AuthoringPreferences, ConnectionVault } from './preferences.mjs';
import { AssetPickerRecent } from './asset-picker-recent.mjs';
import { StudioProjectLibrary } from './project-library.mjs';
import { PluginDocuments } from './plugin-documents.mjs';
import { PluginPlayerUi } from './plugin-authoring.mjs';
import { fail, fromError } from './result.mjs';
import { StudioTemplates } from './templates-providers.mjs';
import { ImportSelection } from './import-selection.mjs';

export class StudioHost {
  /** @param {import('./ipc-context.js').StudioHostOptions} options */
  constructor({ userData, dialog, shell, safeStorage, window, documents, projects, projectAccess, assets, builds, operations, language, plugins, backups, inspectConnection, production }) {
    this.dialog = dialog;
    this.importSelection=new ImportSelection(userData,dialog,window);
    this.shell = shell;
    this.window = window;
    this.documents = documents;
    this.projects = projects;
    this.projectAccess = projectAccess;
    this.assets = assets;
    this.templateLibrary = projects ? new StudioTemplates({userData,projects,assets,plugins}) : undefined;
    this.builds = builds;
    this.operations = operations;
    this.language = language;
    this.plugins = plugins;
    this.pluginDocuments = projects && plugins ? new PluginDocuments(projects, plugins) : null;
    this.pluginPlayerUi = projects && plugins ? new PluginPlayerUi(projects, plugins) : null;
    this.backups = backups;
    this.projectLibrary = backups?.projectLibrary ?? new StudioProjectLibrary({ userData });
    this.production = production;
    /** @type {import('./ipc-context.js').StudioHandlerContext['pageEditing']} */
    this.pageEditing = undefined;
    /** @type {import('./ipc-context.js').StudioHandlerContext['collaboration']} */
    this.collaboration = undefined;
    /** @type {import('./ipc-context.js').StudioHandlerContext['engines']} */
    this.engines = undefined;
    /** @type {import('./ipc-context.js').StudioHandlerContext['soundbanks']} */
    this.soundbanks = undefined;
    /** @type {import('./ipc-context.js').StudioHandlerContext['upgrades']} */
    this.upgrades = undefined;
    this.inspectConnection = inspectConnection;
    this.preferences = new AuthoringPreferences(userData);
    this.assetPickerRecent = new AssetPickerRecent(userData);
    this.connections = new ConnectionVault(userData, safeStorage);
    this.handlers = createStudioHandlers(this);
  }

  /** @param {string} group @param {string} method @param {unknown[]} args */
  async call(group, method, ...args) {
    try {
      const methods = Reflect.get(this.handlers, group);
      const handler = methods && Reflect.get(methods, method);
      if (!handler) return fail('UNKNOWN_HOST_OPERATION', `未知宿主操作 ${group}.${method}`);
      return await Reflect.apply(handler, undefined, args);
    } catch (error) {
      return fromError(error, group === 'documents' || group === 'projects' ? 'M02' :
        group === 'collaboration' ? 'M12' : group === 'connections' || group === 'production' ? 'M10' : group === 'plugins' ? 'M09' :
        group === 'assets' ? 'M04' : group === 'language' ? 'M03' : group === 'templates' ? 'M08' :
        ['engines', 'builds', 'upgrades'].includes(group) ? 'M11' : 'M01');
    }
  }
}

/** @param {Pick<import('electron').IpcMain, 'handle'>} ipcMain @param {StudioHost} host */
export function registerStudioIpc(ipcMain, host) {
  for (const [group, methods] of Object.entries(host.handlers)) {
    for (const method of Object.keys(methods)) {
      ipcMain.handle(`studio:${group}:${method}`, (_event, ...args) => host.call(group, method, ...args));
    }
  }
}
