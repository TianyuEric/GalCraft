// @ts-check
const { contextBridge, ipcRenderer, webUtils } = require('electron');

/** @template {keyof import('../desktop-bridge.js').StudioIpc} G
 * @template {keyof import('../desktop-bridge.js').StudioIpc[G] & string} M
 * @param {G} group @param {M} method
 * @param {import('@galcraft/contracts').IpcArgs<import('../desktop-bridge.js').StudioIpc[G][M]>} args
 * @returns {Promise<import('@galcraft/contracts').IpcValue<import('../desktop-bridge.js').StudioIpc[G][M]>>} */
const call = (group, method, ...args) => ipcRenderer.invoke(`studio:${group}:${method}`, ...args);

/** @type {Parameters<NonNullable<import('../desktop-bridge.js').DesktopBridge['onCloseRequested']>>[0] | null} */
let closeRequested = null;
window.addEventListener('studio:requestClose', () => ipcRenderer.send('studio:requestClose'));
contextBridge.executeInMainWorld({ func: () => {
  window.close = () => { window.dispatchEvent(new Event('studio:requestClose')); };
} });
ipcRenderer.on('studio:closeRequested', async (_event, requestId) => {
  try {
    const choice = closeRequested ? await closeRequested() : null;
    ipcRenderer.send('studio:closePrepared', requestId, { choice });
  } catch (error) {
    ipcRenderer.send('studio:closePrepared', requestId, { error: error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error) });
  }
});

/** @type {import('../desktop-bridge.js').DesktopBridge} */
const bridge = {
  collaboration: {handoffTarget: input=>call('collaboration','handoffTarget',input),reportAuthoringDrafts: input=>call('collaboration','reportAuthoringDrafts',input),overview: input => input ? call('collaboration', 'overview', input) : call('collaboration', 'overview'), readCall: input => call('collaboration', 'readCall', input), start: () => call('collaboration', 'start'), stop: () => call('collaboration', 'stop'), create: input => call('collaboration', 'create', input), update: input => call('collaboration', 'update', input), end: input => call('collaboration', 'end', input), deleteEnded: input => call('collaboration', 'deleteEnded', input), toolDefinition: input => call('collaboration', 'toolDefinition', input), chooseWorkspaceDirectory: input => call('collaboration', 'chooseWorkspaceDirectory', input), configuration: input => call('collaboration', 'configuration', input), writeConfiguration: input => call('collaboration', 'writeConfiguration', input), open: input => call('collaboration', 'open', input)},
  onCollaborationChanged: listener => {const callback=()=>listener();ipcRenderer.on('studio:collaborationChanged',callback);return ()=>ipcRenderer.removeListener('studio:collaborationChanged',callback);},
  onCollaborationNavigate: listener => {
    const callback = (/** @type {Electron.IpcRendererEvent} */ _event, /** @type {Parameters<Parameters<NonNullable<import('../desktop-bridge.js').DesktopBridge['onCollaborationNavigate']>>[0]>[0]} */ input) => listener(input);
    ipcRenderer.on('studio:collaborationNavigate',callback);return ()=>ipcRenderer.removeListener('studio:collaborationNavigate',callback);
  },
  soundbanks: { list: () => call('soundbanks', 'list'), install: input => call('soundbanks', 'install', input), resolve: input => call('soundbanks', 'resolve', input), chooseFile: () => call('soundbanks', 'chooseFile'), import: input => call('soundbanks', 'import', input) },
  onCloseRequested: callback => {
    closeRequested = callback;
    return () => { if (closeRequested === callback) closeRequested = null; };
  },
  engines: { listCreationVersions: () => call('engines', 'listCreationVersions'), resolvePreview: snapshot => call('engines', 'resolvePreview', snapshot), releasePreview: id => call('engines', 'releasePreview', id), importLive2D: withMotionSync => call('engines', 'importLive2D', withMotionSync) },
  production: {
    waitForTask: input => call('production', 'waitForTask', input),
    inspectTaskResources: input => call('production', 'inspectTaskResources', input),
    releaseTaskResources: input => call('production', 'releaseTaskResources', input),
    planOperation: input => call('production', 'planOperation', input),
    authorizeStage: input => call('production', 'authorizeStage', input),
    reprocess: input => call('production', 'reprocess', input),

    providers: () => call('production', 'providers'),
    planTask: input => call('production', 'planTask', input),
    tasks: () => call('production', 'tasks'),
    candidate: input => call('production', 'candidate', input),
    connections: () => call('production', 'connections'),
    connectionCapabilities: input => call('production', 'connectionCapabilities', input),
    queryRemote: input => call('production', 'queryRemote', input),
    refetch: input => call('production', 'refetch', input),
    saveDefaults: input => call('production', 'saveDefaults', input),
    removeConnection: input => call('production', 'removeConnection', input),
    deleteRecipe: input => call('production', 'deleteRecipe', input),
    planContinuation: input => call('production', 'planContinuation', input),
    submitContinuation: input => call('production', 'submitContinuation', input),
    overview: input => input ? call('production', 'overview', input) : call('production', 'overview'),
    context: input => call('production', 'context', input),
    readOutline: () => call('production', 'readOutline'),
    saveOutline: input => call('production', 'saveOutline', input),
    saveImageRoutes: input => call('production', 'saveImageRoutes', input),
    previewScript: input => call('production', 'previewScript', input),
    mediaInput: input => call('production', 'mediaInput', input),
    attachment: input => call('production', 'attachment', input),
    saveDraft: input => call('production', 'saveDraft', input),
    discardDraft: input => call('production', 'discardDraft', input),
    removeTaskRecord: input => call('production', 'removeTaskRecord', input),
    plan: input => call('production', 'plan', input),
    submit: input => call('production', 'submit', input),
    resume: input => call('production', 'resume', input),
    retry: input => call('production', 'retry', input),
    cancel: input => call('production', 'cancel', input),
    select: input => call('production', 'select', input),
    discardAdoption: input => call('production', 'discardAdoption', input),
    apply: input => call('production', 'apply', input),
    keepResults: input => call('production', 'keepResults', input),
    editCandidate: input => call('production', 'editCandidate', input),
    transferPrompt: input => call('production', 'transferPrompt', input),
    candidateContent: input => call('production', 'candidateContent', input),
    saveRecipe: input => call('production', 'saveRecipe', input),
    copyRecipe: input => call('production', 'copyRecipe', input),
    exportRecipes: input => call('production', 'exportRecipes', input),
    planRecipeImport: input => call('production', 'planRecipeImport', input),
    applyRecipeImport: input => call('production', 'applyRecipeImport', input),
    saveWorkflow: input => call('production', 'saveWorkflow', input),
    listWorkflowDrafts: () => call('production', 'listWorkflowDrafts'),
    discoverWorkflowOutputs: input => call('production', 'discoverWorkflowOutputs', input),
    saveWorkflowDraft: input => call('production', 'saveWorkflowDraft', input),
    prepareUIPlan: input => call('production', 'prepareUIPlan', input),
    confirmUIPlan: input => call('production', 'confirmUIPlan', input),
    saveComposition: input => call('production', 'saveComposition', input),
    prepareUIAdoption: input => call('production', 'prepareUIAdoption', input),
    previewComposition: input => call('production', 'previewComposition', input),
    assetReferences: input => call('production', 'assetReferences', input),
  },
  builds: {
    targets: () => call('builds', 'targets'),
    detectToolchain: input => call('builds', 'detectToolchain', input),
    prepareToolchain: input => call('builds', 'prepareToolchain', input),
    cancelToolchain: id => call('builds', 'cancelToolchain', id),
    subscribeToolchainProgress: listener => {
      /** @param {import('electron').IpcRendererEvent} _event @param {import('@galcraft/plugins/contracts').TargetBuilderProgress & {operationId:string}} value */
      const callback = (_event, value) => listener(value);
      ipcRenderer.on('studio:toolchainProgress', callback); return () => ipcRenderer.removeListener('studio:toolchainProgress', callback);
    },
    status: () => call('builds', 'status'),
    signingCertificates: () => call('builds', 'signingCertificates'),
    planBuild: input => call('builds', 'planBuild', input),
    build: input => call('builds', 'build', input),
    cancel: input => call('builds', 'cancel', input),
    receipt: input => call('builds', 'receipt', input),
    test: input => call('builds', 'test', input),
    instructions: input => call('builds', 'instructions', input),
    compatibility: input => call('builds', 'compatibility', input),
    chooseOldSaves: () => call('builds', 'chooseOldSaves'),
  },
  templates: { previewTemplateResources: input=>call('templates','previewTemplateResources',input),library: input => call('templates','library',input),prepareTemplateSwitch: input => call('templates','prepareTemplateSwitch',input),restoreTemplatePage: input => call('templates','restoreTemplatePage',input),preparePageEdit: input => call('templates','preparePageEdit',input),preparePageStyleEdit: input => call('templates','preparePageStyleEdit',input),compileStyle: input => call('templates', 'compileStyle', input),
    pluginCatalog: () => call('templates', 'pluginCatalog'), pluginPrepare: input => call('templates', 'pluginPrepare', input),
    pluginPreview: input => call('templates', 'pluginPreview', input) },
  upgrades: {
    list: () => call('upgrades', 'list'),
    history: () => call('upgrades', 'history'),
    plan: input => call('upgrades', 'plan', input),
    commit: input => call('upgrades', 'commit', input),
    restore: input => call('upgrades', 'restore', input),
    cancel: input => call('upgrades', 'cancel', input),
  },
  projects: {
    chooseDirectory: () => call('projects', 'chooseDirectory'),
    chooseBackupFile: () => call('projects', 'chooseBackupFile'),
    supplyRestoreDependency: input => call('projects', 'supplyRestoreDependency', input),
    listRecent: () => call('projects', 'listRecent'),
    inspect: directory => call('projects', 'inspect', directory),
    setPinned: input => call('projects', 'setPinned', input),
    forget: directory => call('projects', 'forget', directory),
    relocate: input => call('projects', 'relocate', input),
    revealDirectory: directory => call('projects', 'revealDirectory', directory),
    backup: () => call('projects', 'backup'),
    switch: input => call('projects', 'switch', input),
    create: input => call('projects', 'create', input),
    copy: () => call('projects', 'copy'),
    open: path => call('projects', 'open', path),
    close: (sessionId, choice) => call('projects', 'close', sessionId, choice),
  },
  documents: {
    pluginList: input => call('documents', 'pluginList', input),
    pluginCreate: input => call('documents', 'pluginCreate', input),
    pluginCopy: input => call('documents', 'pluginCopy', input),
    pluginDelete: input => call('documents', 'pluginDelete', input),
    pluginUpdate: input => call('documents', 'pluginUpdate', input),
    createBackup: input => call('documents', 'createBackup', input),
    prepareRestore: input => call('documents', 'prepareRestore', input),
    checkRestore: directory => call('documents', 'checkRestore', directory),
    commitRestore: directory => call('documents', 'commitRestore', directory),
    cancelRestore: directory => call('documents', 'cancelRestore', directory),
    list: () => call('documents', 'list'),
    planEdit: input => call('documents', 'planEdit', input),
    applyEdit: (planId, expected) => call('documents', 'applyEdit', planId, expected),
    planUndo: (documentId, operationId, paths) => call('documents', 'planUndo', documentId, operationId, paths),
    planRedo: (documentId, paths) => call('documents', 'planRedo', documentId, paths),
    planDiscard: scope => call('documents', 'planDiscard', scope),
    applyDiscard: planId => call('documents', 'applyDiscard', planId),
    undo: planId => call('documents', 'undo', planId),
    redo: planId => call('documents', 'redo', planId),
    planSave: scope => call('documents', 'planSave', scope),
    save: planId => call('documents', 'save', planId),
    getConflict: planId => call('documents', 'getConflict', planId),
    resolveConflict: (planId, choice, copyPath) => call('documents', 'resolveConflict', planId, choice, copyPath),
    listRecovery: () => call('documents', 'listRecovery'),
    recover: choice => call('documents', 'recover', choice),
    getRecoveryConflict: () => call('documents', 'getRecoveryConflict'),
    resolveRecoveryConflict: (choice, copyPath) => call('documents', 'resolveRecoveryConflict', choice, copyPath),
  },
  authoringPreferences: {
    readInputDraft: input => call('authoringPreferences', 'readInputDraft', input),
    writeInputDraft: draft => call('authoringPreferences', 'writeInputDraft', draft),
    readPreferences: () => call('authoringPreferences', 'readPreferences'),
    writePreferences: value => call('authoringPreferences', 'writePreferences', value),
    readWorkspace: projectId => call('authoringPreferences', 'readWorkspace', projectId),
    writeWorkspace: record => call('authoringPreferences', 'writeWorkspace', record),
    clearWorkspace: projectId => call('authoringPreferences', 'clearWorkspace', projectId),
    readStageGuides: projectId => call('authoringPreferences', 'readStageGuides', projectId),
    writeStageGuides: value => call('authoringPreferences', 'writeStageGuides', value),
  },
  files: {chooseImport: input=>call('files','chooseImport',input),readImport: input=>call('files','readImport',input),
    pathsForFiles: files => files.map(file => webUtils.getPathForFile(file)).filter(Boolean),
    pickAssets: () => call('files', 'pickAssets'),
    pickRecipes: () => call('files', 'pickRecipes'),
    revealEntity: ref => call('files', 'revealEntity', ref),
    openBuild: buildId => call('files', 'openBuild', buildId),
  },
  assets: {
    typeCatalog: () => call('assets', 'typeCatalog'),
    editTypeData: input => call('assets', 'editTypeData', input),
    saveAnimation: input => call('assets', 'saveAnimation', input),
    weatherTexture: key => call('assets', 'weatherTexture', key),
    iconPresets: () => call('assets', 'iconPresets'),
    importIconPreset: input => call('assets', 'importIconPreset', input),
    processorCatalog: () => call('assets', 'processorCatalog'),
    processResource: input => call('assets', 'processResource', input),
    cancelResource: operationId => call('assets', 'cancelResource', operationId),
    resourceCandidates: () => call('assets', 'resourceCandidates'),
    previewResource: preparationId => call('assets', 'previewResource', preparationId),
    confirmResource: input => call('assets', 'confirmResource', input),
    discardResource: preparationId => call('assets', 'discardResource', preparationId),
    references: assetId => call('assets', 'references', assetId),
    verifyTarget: (target, operationId) => call('assets', 'verifyTarget', target, operationId),
    subscribeTargetVerification: callback => {
      /** @param {import('electron').IpcRendererEvent} _event @param {import('@galcraft/contracts').AssetVerificationProgress} value */
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('studio:assetVerification', listener);
      return () => ipcRenderer.removeListener('studio:assetVerification', listener);
    },
    query: query => call('assets', 'query', query),
    picker: input => call('assets', 'picker', input),
    recordUse: input => call('assets', 'recordUse', input),
    removeRecent: input => call('assets', 'removeRecent', input),
    allIds: query => call('assets', 'allIds', query),
    get: assetId => call('assets', 'get', assetId),
    inspectModel: assetId => call('assets', 'inspectModel', assetId),
    describe: input => call('assets', 'describe', input),
    rename: changes => call('assets', 'rename', changes),
    planBatchRename: input => call('assets', 'planBatchRename', input),
    applyBatchRename: planId => call('assets', 'applyBatchRename', planId),
    remove: ids => call('assets', 'remove', ids),
    preview: (assetId, variantId) => call('assets', 'preview', assetId, variantId),
    thumbnails: requests => call('assets', 'thumbnails', requests),
    stopPreview: () => call('assets', 'stopPreview'),
    resolveRuntime: (assetId, variantId) => call('assets', 'resolveRuntime', assetId, variantId),
    releaseRuntime: leaseId => call('assets', 'releaseRuntime', leaseId),
    prepareMattingModel: () => call('assets', 'prepareMattingModel'),
    removeBackground: input => call('assets', 'removeBackground', input),
    confirmBackground: (preparationId, scope) => call('assets', 'confirmBackground', preparationId, scope),
    discardBackground: preparationId => call('assets', 'discardBackground', preparationId),
    import: paths => call('assets', 'import', paths),
  },
  operations: {
    cancel: id => call('operations', 'cancel', id),
    subscribe: callback => {
      /** @param {import('electron').IpcRendererEvent} _event @param {import('@galcraft/contracts').Operation<import('@galcraft/contracts').Json>} value */
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('studio:operationChanged', listener);
      return () => ipcRenderer.removeListener('studio:operationChanged', listener);
    },
  },
  language: {
    pluginQuery: input => call('language', 'pluginQuery', input),
    pluginPrepare: input => call('language', 'pluginPrepare', input),
    compile: input => call('language', 'compile', input),
    lastValid: projectId => call('language', 'lastValid', projectId),
    querySemantic: input => call('language', 'querySemantic', input),
    locate: (source, fieldPath) => call('language', 'locate', source, fieldPath),
  },
  plugins: { commandSpecs: ()=>call('plugins','commandSpecs'),
    list: () => call('plugins', 'list'),
    planChange: input => call('plugins', 'planChange', input),
    inspectPackage: source => call('plugins', 'inspectPackage', source),
    install: source => call('plugins', 'install', source),
    loadDevelopment: input => call('plugins', 'loadDevelopment', input),
    resolve: lock => call('plugins', 'resolve', lock),
    release: handleId => call('plugins', 'release', handleId),
  },
  connections: {
    list: () => call('connections', 'list'),
    save: (config, secret) => call('connections', 'save', config, secret),
    test: selection => call('connections', 'test', selection),
  },
};

contextBridge.exposeInMainWorld('studioBridge', bridge);
