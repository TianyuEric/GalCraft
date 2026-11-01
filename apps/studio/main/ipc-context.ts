import type { Asset, ConnectionConfig, ConnectionSelection, IpcArgs, IpcReturn, Result, StudioBridge, Target } from '@galcraft/contracts';
import type { DesktopBridge, StudioIpc } from '../desktop-bridge.js';
import type { ProjectSession } from '@galcraft/documents';

type RawPreferences = { [M in keyof StudioBridge['authoringPreferences']]-?:
  (...args: IpcArgs<StudioBridge['authoringPreferences'][M]>) => Promise<
    Awaited<IpcReturn<StudioBridge['authoringPreferences'][M]>> extends Result<infer T> ? T : never> };
type Port<F> = (...args: IpcArgs<F>) => IpcReturn<F> | Awaited<IpcReturn<F>>;
type ProductionPort = { call<M extends keyof StudioIpc['production']>(method: M,
  ...args: IpcArgs<StudioIpc['production'][M]>): IpcReturn<StudioIpc['production'][M]> };

/** Ports consumed by the actual IPC adapters. Application assembly supplies platform implementations. */
export interface StudioHandlerContext {
  window: import('electron').BrowserWindow;
  dialog: Pick<typeof import('electron').dialog, 'showOpenDialog' | 'showSaveDialog'>;
  importSelection?: {choose(purpose:'assets'|'production'|'packages'|'documents',options:import('electron').OpenDialogOptions):Promise<import('electron').OpenDialogReturnValue>};
  shell: Pick<typeof import('electron').shell, 'openPath'>;
  engines?: StudioIpc['engines'];
  soundbanks?: import('@galcraft/contracts').SoundBankPort;
  production?: ProductionPort;
  pageEditing?: (request: import('@galcraft/contracts').PageEditInput) => Promise<import('@galcraft/templates').PageEditPlan>;
  templateLibrary?: {manage: NonNullable<StudioIpc['templates']['library']>;prepareSwitch: NonNullable<StudioIpc['templates']['prepareTemplateSwitch']>;restorePage: NonNullable<StudioIpc['templates']['restoreTemplatePage']>;previewResources:NonNullable<StudioIpc['templates']['previewTemplateResources']>};
  collaboration?: {call<M extends keyof StudioIpc['collaboration']>(method:M,...args:IpcArgs<StudioIpc['collaboration'][M]>):IpcReturn<StudioIpc['collaboration'][M]>};
  builds?: Omit<StudioIpc['builds'], 'status' | 'chooseOldSaves'> & { resolveDirectory(id: string): Promise<string | null> };
  upgrades?: StudioIpc['upgrades'];
  projectLibrary: Pick<StudioIpc['projects'], 'listRecent' | 'inspect' | 'setPinned' | 'forget' | 'relocate'> & {
    register(input: { projectId: string; directory: string }): Promise<void>;
  };
  projects?: Omit<StudioIpc['projects'], 'create'> & {
    currentSession: ProjectSession | null;
    currentRoot: string;
    create(input: IpcArgs<StudioIpc['projects']['create']>[0], prepare?: (candidate: unknown) => Promise<void>): IpcReturn<StudioIpc['projects']['create']>;
  };
  projectAccess?: { approveDirectory(path: string): Promise<string>; release(id: string): void;
    resolveEntityDirectory(ref: IpcArgs<StudioIpc['files']['revealEntity']>[0]): Promise<string | null> };
  backups?: Pick<StudioIpc['documents'], 'createBackup' | 'prepareRestore' | 'checkRestore' | 'commitRestore' | 'cancelRestore'> & {
    copyCurrentProject: StudioIpc['projects']['copy'];
    supplyRestoreDependency(input: Parameters<StudioIpc['projects']['supplyRestoreDependency']>[0], directory: string): ReturnType<StudioIpc['documents']['checkRestore']>;
  };
  documents?: StudioIpc['documents'];
  pluginDocuments?: {
    list: Port<StudioIpc['documents']['pluginList']>; create: Port<StudioIpc['documents']['pluginCreate']>;
    copy: Port<StudioIpc['documents']['pluginCopy']>; update: Port<StudioIpc['documents']['pluginUpdate']>;
    remove: Port<StudioIpc['documents']['pluginDelete']>;
  } | null;
  pluginPlayerUi?: { catalog: StudioIpc['templates']['pluginCatalog']; prepare: StudioIpc['templates']['pluginPrepare']; preview: StudioIpc['templates']['pluginPreview'] } | null;
  preferences: RawPreferences;
  entryPreferences?: () => RawPreferences;
  assets?: Omit<StudioIpc['assets'], 'picker' | 'verifyTarget' | 'iconPresets' | 'importIconPreset'> & {
    verifyTarget(target: Target, operationId?: string, progress?: (value: import('@galcraft/contracts').AssetVerificationProgress) => void): ReturnType<StudioIpc['assets']['verifyTarget']>;
    picker(input: IpcArgs<StudioIpc['assets']['picker']>[0], recent: string[]): IpcReturn<StudioIpc['assets']['picker']>;
    current(): { session: ProjectSession; index: { data: { assets: Asset[] } } } | null;
    clearThumbnails(): void;
    toolDirectory: string; svgDecoder: unknown; operations: unknown; resources: unknown;
    modelDirectory: string; mattingWorker: string; live2dRuntimeDirectory: string;
  };
  assetPickerRecent: { read(projectId: string): Promise<Partial<Record<Asset['kind'], string[]>>>;
    record(projectId: string, assets: Asset[]): Promise<void>; remove(projectId: string, assetId: string): Promise<void> };
  operations?: Pick<StudioIpc['operations'], 'cancel'> & { start(input: { operationId: string; script: string;
    input: IpcArgs<StudioIpc['templates']['compileStyle']>[0]; outputDirectory: null; owner: 'M08' }): IpcReturn<StudioIpc['templates']['compileStyle']> };
  language?: Omit<StudioIpc['language'], 'pluginQuery' | 'pluginPrepare'> & {
    pluginQuery(projectId: string, input: IpcArgs<StudioIpc['language']['pluginQuery']>[0]): IpcReturn<StudioIpc['language']['pluginQuery']>;
    pluginPrepare(projectId: string, input: IpcArgs<StudioIpc['language']['pluginPrepare']>[0]): IpcReturn<StudioIpc['language']['pluginPrepare']>;
  };
  plugins?: Omit<StudioIpc['plugins'], 'list' | 'planChange'> & {
    acquireDefinitions?(session:ProjectSession|null,options:{allowMissing:boolean}):Promise<Result<{commands:import('@galcraft/contracts').CommandSpec[];release():Promise<void>}>>;
    list(session: ProjectSession | null): IpcReturn<StudioIpc['plugins']['list']>;
    planChange(input: IpcArgs<StudioIpc['plugins']['planChange']>[0], session: ProjectSession | null): IpcReturn<StudioIpc['plugins']['planChange']>;
  };
  connections: { list(): Promise<ConnectionConfig[]>; save(config: ConnectionConfig, secret?: string): Promise<string>;
    read(id: string): Promise<{ config: ConnectionConfig; secret?: string } | null> };
  inspectConnection?: (entry: { config: ConnectionConfig; secret?: string }, selection: ConnectionSelection) => ReturnType<DesktopBridge['connections']['test']>;
}

export type StudioHostOptions = Omit<StudioHandlerContext, 'projectLibrary' | 'pluginDocuments' | 'pluginPlayerUi' | 'preferences' | 'assetPickerRecent' | 'connections' | 'engines' | 'upgrades'> & {
  userData: string;
  safeStorage: Pick<typeof import('electron').safeStorage, 'isEncryptionAvailable' | 'encryptString' | 'decryptString'>;
  backups?: StudioHandlerContext['backups'] & { projectLibrary: StudioHandlerContext['projectLibrary'] };
};
