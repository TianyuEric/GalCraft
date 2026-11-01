export const InterfaceOperations = {
  I01: ['planEdit', 'applyEdit', 'planUndo', 'planRedo', 'undo', 'redo'],
  I02: ['planSave', 'save', 'listRecovery', 'recover', 'createBackup', 'prepareRestore', 'commitRestore'],
  I03: ['parse', 'compile', 'patchFields', 'locate', 'explainField', 'querySemantic'],
  I04: ['importBatch', 'queryAssets', 'queryAssetIds', 'describeAssetRows', 'prepareVariant', 'prepareUIAssetAdoption', 'resolveAsset', 'collectAssets'],
  I05: ['prepareSession', 'activate', 'dispatchDebug', 'classifyUpdate', 'inspect', 'updateReadingViewport', 'inspectVoice'],
  I06: ['prepareStage', 'commitStage', 'applyPresentation', 'pause', 'capture', 'dispose', 'inspectAudio'],
  I07: ['captureSave', 'writeSave', 'prepareLoad', 'prepareRestore', 'commitLoad', 'disposePreparedRestore', 'prepareFlowUnlocks', 'commitRuntimeLongTerm', 'planDataImport', 'applyDataImport', 'discardDataImport'],
  I08: ['navigate', 'closePage', 'dispatchInput', 'setPreference', 'readAuthoringGeometry'],
  I09: ['inspectPackage', 'install', 'prepareContributions', 'preparePluginRestore', 'releasePluginRestore', 'planChange', 'loadDevelopment', 'reload', 'packPlugin'],
  I10: ['inspectConnection', 'saveFormDraft', 'loadFormDraft', 'discardFormDraft', 'planTask', 'submit', 'resume', 'cancel', 'selectCandidates'],
  I11: ['listEngines', 'resolveEngine', 'prepareUpgrade', 'validateUpgrade', 'planBuild', 'build'],
} as const;
export type InterfaceId = keyof typeof InterfaceOperations;
export type InterfaceOperation<I extends InterfaceId> = (typeof InterfaceOperations)[I][number];

export const StateOwners = {
  project: 'M02',
  associatedEdits: 'M02',
  assetFiles: 'M04',
  assetIndexCommit: 'M02',
  personalTasks: 'M10',
  personalRecipes: 'M10',
  playerData: 'M07',
  engineCatalog: 'M11',
  releases: 'M11',
  workspacePreferences: 'M01',
} as const;
