// @ts-check
import { createId } from '@galcraft/contracts';

import { readFile, stat, writeFile } from 'node:fs/promises';
import { StorageBatchSchema } from '@galcraft/contracts';

/** @template T @param {T} value @returns {import('@galcraft/contracts').Result<T>} */
function ok(value) { return { ok: true, value, warnings: [] }; }
/** @param {string} code @param {string} message @param {import('@galcraft/contracts').Issue['owner']} owner @returns {Extract<import('@galcraft/contracts').Result<never>, {ok:false}>} */
function fail(code, message, owner = 'M07') {
  /** @type {import('@galcraft/contracts').Issue} */
  const error = { code, severity: 'error', message, owner, related: [], actions: ['retry'] };
  return { ok: false, error, issues: [error] };
}

export class WindowsPlayerHost {
  /** @type {Map<string, () => void>} */
  #locations = new Map();

  /** @param {import('./ipc-context.js').PlayerHostOptions} options */
  constructor(options) {
    const { window, dialog, resourceRegistry, assetProvider, storageProvider, platformProvider, requestClose } = options;
    this.window = window; this.dialog = dialog; this.resourceRegistry = resourceRegistry;
    this.assetProvider = assetProvider; this.storageProvider = storageProvider;
    this.platformProvider = platformProvider; this.requestClose = requestClose;
    /** @type {import('@galcraft/contracts').PlayerIpc} */
    this.handlers = {
      resources: {
        resolve: async (...args) => {
          const item = await this.assetProvider?.resolve(args[0], args[1]);
          if (!item) return fail('ASSET_MISSING', '资源不存在', 'M04');
          const bytes = (await stat(item.path)).size;
          const location = this.resourceRegistry.register(item);
          const token = createId();
          this.#locations.set(token, location.release);
          return ok({ uri: location.uri, mime: item.mime, bytes, rangeSupported: true, token });
        },
        release: async (...args) => {
          this.#locations.get(args[0])?.();
          this.#locations.delete(args[0]);
          return ok(undefined);
        },
      },
      storage: {
        read: async (...args) => {
          return this.storageProvider ? this.storageProvider.read(args[0]) : fail('STORAGE_PROVIDER_UNAVAILABLE', '资料服务尚未就绪');
        },
        commit: async (...args) => {
          return this.storageProvider ? this.storageProvider.commit(StorageBatchSchema.parse(args[0])) : fail('STORAGE_PROVIDER_UNAVAILABLE', '资料服务尚未就绪');
        },
      },
      transfer: {
        importFile: async (...args) => {
          const filters = Array.isArray(args[0]) && args[0].length ? [{ name: 'GalCraft', extensions: args[0].map(value => value.replace(/^\./, '')) }] : [];
          const choice = await this.dialog.showOpenDialog(this.window, { properties: ['openFile'], filters });
          return ok(choice.canceled || !choice.filePaths[0] ? null : new Uint8Array(await readFile(choice.filePaths[0])));
        },
        exportFile: async (...args) => {
          const name = String(args[0]);
          const choice = await this.dialog.showSaveDialog(this.window, { defaultPath: name });
          if (choice.canceled || !choice.filePath) return ok(undefined);
          await writeFile(choice.filePath, args[2]);
          return ok(undefined);
        },
      },
      host: {
        close: async (...args) => {
          return this.requestClose ? this.requestClose() : ok(undefined);
        },
        platform: async (...args) => {
          if (args[0] === 'window.fullscreen') { if (args[1] && typeof args[1] === 'object' && !Array.isArray(args[1]) && typeof args[1].enabled === 'boolean') this.window.setFullScreen(args[1].enabled); return ok({ enabled: this.window.isFullScreen() }); }
          return this.platformProvider ? this.platformProvider(args[0], args[1]) : fail('PLATFORM_CAPABILITY_UNAVAILABLE', '平台能力不可用', 'M09');
        },
      },
    };
  }

  /** @param {string} group @param {string} method @param {unknown[]} args */
  async call(group, method, ...args) {
    try {
      const methods = Reflect.get(this.handlers, group);
      const handler = methods && Reflect.get(methods, method);
      if (!handler) return fail('UNKNOWN_HOST_OPERATION', `未知宿主操作 ${group}.${method}`);
      return await Reflect.apply(handler, undefined, args);
    } catch (error) {
      return fail(error && typeof error === 'object' && 'code' in error ? String(error.code) : 'HOST_IO', error instanceof Error ? error.message : String(error));
    }
  }

  releaseAll() {
    for (const release of this.#locations.values()) release();
    this.#locations.clear();
  }
}

/** @param {Pick<import('electron').IpcMain, 'handle'>} ipcMain @param {WindowsPlayerHost} host */
export function registerPlayerIpc(ipcMain, host) {
  for (const [group, methods] of Object.entries(host.handlers)) {
    for (const method of Object.keys(methods)) ipcMain.handle(`player:${group}:${method}`, (_event, ...args) => host.call(group, method, ...args));
  }
}
