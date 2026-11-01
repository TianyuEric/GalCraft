import type { Json, PlayerIpc, Result } from '@galcraft/contracts';
export interface PlayerHostOptions {
  window: import('electron').BrowserWindow;
  dialog: Pick<typeof import('electron').dialog, 'showOpenDialog' | 'showSaveDialog'>;
  resourceRegistry: { register(item: { path: string; mime: string }): { uri: string; release(): void } };
  assetProvider?: { resolve(assetId: string, variantId: string): Promise<{ path: string; mime: string } | null> };
  storageProvider?: PlayerIpc['storage'];
  platformProvider?: (name: string, args: Json) => Promise<Result<Json>>;
  requestClose?: PlayerIpc['host']['close'];
}
