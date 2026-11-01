// @ts-check
import { createId } from '@galcraft/contracts';
import { ConnectionConfigSchema, ConnectionSelectionSchema } from '@galcraft/contracts';
import { join } from 'node:path';
import {readFile} from 'node:fs/promises';

import { listActionIconPresets, importActionIconPreset } from './action-icon-presets.mjs';
import { fail, ok } from './result.mjs';

/** @param {import('./ipc-context.js').StudioHandlerContext} host */
export function createStudioHandlers(host) {
  const preferences = () => host.entryPreferences?.() ?? host.preferences;
  /** @param {'assets'|'production'|'packages'|'documents'} purpose @param {import('electron').OpenDialogOptions} options */
  const chooseImport=(purpose,options)=>host.importSelection?host.importSelection.choose(purpose,options):host.dialog.showOpenDialog(host.window,options);
  /** @type {import('../desktop-bridge.js').StudioIpc} */
  const handlers = {
    collaboration: {
      handoffTarget: async (...args)=>host.collaboration?host.collaboration.call('handoffTarget',...args):fail('COLLABORATION_UNAVAILABLE','Connect to collaboration before handing off a target.','M12'),
      reportAuthoringDrafts: async (...args) => host.collaboration ? host.collaboration.call('reportAuthoringDrafts',...args) : fail('COLLABORATION_UNAVAILABLE','协作服务尚未就绪','M12'),
      overview: async (...args) => host.collaboration ? host.collaboration.call('overview', ...args) : fail('COLLABORATION_UNAVAILABLE', '协作服务尚未就绪', 'M12'),
      readCall: async (...args) => host.collaboration ? host.collaboration.call('readCall', ...args) : fail('COLLABORATION_UNAVAILABLE', '协作服务尚未就绪', 'M12'),
      start: async (...args) => host.collaboration ? host.collaboration.call('start', ...args) : fail('COLLABORATION_UNAVAILABLE', '协作服务尚未就绪', 'M12'),
      stop: async (...args) => host.collaboration ? host.collaboration.call('stop', ...args) : fail('COLLABORATION_UNAVAILABLE', '协作服务尚未就绪', 'M12'),
      create: async (...args) => host.collaboration ? host.collaboration.call('create', ...args) : fail('COLLABORATION_UNAVAILABLE', '协作服务尚未就绪', 'M12'),
      update: async (...args) => host.collaboration ? host.collaboration.call('update', ...args) : fail('COLLABORATION_UNAVAILABLE', '协作服务尚未就绪', 'M12'),
      end: async (...args) => host.collaboration ? host.collaboration.call('end', ...args) : fail('COLLABORATION_UNAVAILABLE', '协作服务尚未就绪', 'M12'),
      deleteEnded: async (...args) => host.collaboration ? host.collaboration.call('deleteEnded', ...args) : fail('COLLABORATION_UNAVAILABLE', '协作服务尚未就绪', 'M12'),
      toolDefinition: async (...args) => host.collaboration ? host.collaboration.call('toolDefinition', ...args) : fail('COLLABORATION_UNAVAILABLE', '协作服务尚未就绪', 'M12'),
      chooseWorkspaceDirectory: async (...args) => host.collaboration ? host.collaboration.call('chooseWorkspaceDirectory', ...args) : fail('COLLABORATION_UNAVAILABLE', '协作服务尚未就绪', 'M12'),
      configuration: async (...args) => host.collaboration ? host.collaboration.call('configuration', ...args) : fail('COLLABORATION_UNAVAILABLE', '协作服务尚未就绪', 'M12'),
      writeConfiguration: async (...args) => host.collaboration ? host.collaboration.call('writeConfiguration', ...args) : fail('COLLABORATION_UNAVAILABLE', '协作服务尚未就绪', 'M12'),
      open: async (...args) => host.collaboration ? host.collaboration.call('open', ...args) : fail('COLLABORATION_UNAVAILABLE', '协作服务尚未就绪', 'M12'),
    },
    soundbanks: {
      list: async () => host.soundbanks ? host.soundbanks.list() : fail('SOUNDBANK_HOST_UNAVAILABLE', '本机音色包服务尚未就绪', 'M09'),
      install: async input => host.soundbanks ? host.soundbanks.install(input) : fail('SOUNDBANK_HOST_UNAVAILABLE', '本机音色包服务尚未就绪', 'M09'),
      resolve: async input => host.soundbanks ? host.soundbanks.resolve(input) : fail('SOUNDBANK_HOST_UNAVAILABLE', '本机音色包服务尚未就绪', 'M09'),
      chooseFile: async () => host.soundbanks ? host.soundbanks.chooseFile() : fail('SOUNDBANK_HOST_UNAVAILABLE', '本机音色包服务尚未就绪', 'M09'),
      import: async input => host.soundbanks ? host.soundbanks.import(input) : fail('SOUNDBANK_HOST_UNAVAILABLE', '本机音色包服务尚未就绪', 'M09'),
    },
    engines: {
      listCreationVersions: async (...args) => {
        return host.engines ? await host.engines.listCreationVersions(...args) : fail('ENGINE_PREVIEW_UNAVAILABLE', '预览引擎目录尚未就绪', 'M11');
      },
      resolvePreview: async (...args) => {
        return host.engines ? await host.engines.resolvePreview(...args) : fail('ENGINE_PREVIEW_UNAVAILABLE', '预览引擎目录尚未就绪', 'M11');
      },
      releasePreview: async (...args) => {
        return host.engines ? await host.engines.releasePreview(...args) : fail('ENGINE_PREVIEW_UNAVAILABLE', '预览引擎目录尚未就绪', 'M11');
      },
      importLive2D: async (...args) => {
        return host.engines ? await host.engines.importLive2D(...args) : fail('ENGINE_PREVIEW_UNAVAILABLE', '预览引擎目录尚未就绪', 'M11');
      },
    },
    production: {
      waitForTask: async (...args) => host.production ? host.production.call('waitForTask', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10'),
      inspectTaskResources: async (...args) => host.production ? host.production.call('inspectTaskResources', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10'),
      releaseTaskResources: async (...args) => host.production ? host.production.call('releaseTaskResources', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10'),
      planOperation: async (...args) => host.production ? host.production.call('planOperation', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10'),
      authorizeStage: async (...args) => host.production ? host.production.call('authorizeStage', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10'),
      reprocess: async (...args) => host.production ? host.production.call('reprocess', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10'),

      providers: async (...args) => {
        return host.production ? await host.production.call('providers', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      planTask: async (...args) => {
        return host.production ? await host.production.call('planTask', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      tasks: async (...args) => {
        return host.production ? await host.production.call('tasks', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      candidate: async (...args) => {
        return host.production ? await host.production.call('candidate', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      connections: async (...args) => {
        return host.production ? await host.production.call('connections', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      connectionCapabilities: async (...args) => {
        return host.production ? await host.production.call('connectionCapabilities', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      queryRemote: async (...args) => {
        return host.production ? await host.production.call('queryRemote', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      refetch: async (...args) => {
        return host.production ? await host.production.call('refetch', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      saveDefaults: async (...args) => {
        return host.production ? await host.production.call('saveDefaults', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      removeConnection: async (...args) => {
        return host.production ? await host.production.call('removeConnection', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      deleteRecipe: async (...args) => {
        return host.production ? await host.production.call('deleteRecipe', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      planContinuation: async (...args) => {
        return host.production ? await host.production.call('planContinuation', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      submitContinuation: async (...args) => {
        return host.production ? await host.production.call('submitContinuation', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      overview: async (...args) => {
        return host.production ? await host.production.call('overview', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      context: async (...args) => {
        return host.production ? await host.production.call('context', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      readOutline: async (...args) => {
        return host.production ? await host.production.call('readOutline', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      saveOutline: async (...args) => {
        return host.production ? await host.production.call('saveOutline', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      saveImageRoutes: async (...args) => {
        return host.production ? await host.production.call('saveImageRoutes', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      previewScript: async (...args) => {
        return host.production ? await host.production.call('previewScript', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      mediaInput: async (...args) => {
        return host.production ? await host.production.call('mediaInput', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      attachment: async (...args) => {
        return host.production ? await host.production.call('attachment', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      saveDraft: async (...args) => {
        return host.production ? await host.production.call('saveDraft', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      discardDraft: async (...args) => {
        return host.production ? await host.production.call('discardDraft', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      removeTaskRecord: async (...args) => {
        return host.production ? await host.production.call('removeTaskRecord', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      plan: async (...args) => {
        return host.production ? await host.production.call('plan', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      submit: async (...args) => {
        return host.production ? await host.production.call('submit', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      resume: async (...args) => {
        return host.production ? await host.production.call('resume', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      retry: async (...args) => {
        return host.production ? await host.production.call('retry', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      cancel: async (...args) => {
        return host.production ? await host.production.call('cancel', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      select: async (...args) => {
        return host.production ? await host.production.call('select', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      discardAdoption: async (...args) => {
        return host.production ? await host.production.call('discardAdoption', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      apply: async (...args) => {
        return host.production ? await host.production.call('apply', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      keepResults: async (...args) => {
        return host.production ? await host.production.call('keepResults', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      editCandidate: async (...args) => {
        return host.production ? await host.production.call('editCandidate', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      transferPrompt: async (...args) => {
        return host.production ? await host.production.call('transferPrompt', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      candidateContent: async (...args) => {
        return host.production ? await host.production.call('candidateContent', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      saveRecipe: async (...args) => {
        return host.production ? await host.production.call('saveRecipe', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      copyRecipe: async (...args) => {
        return host.production ? await host.production.call('copyRecipe', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      exportRecipes: async (...args) => {
        return host.production ? await host.production.call('exportRecipes', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      planRecipeImport: async (...args) => {
        return host.production ? await host.production.call('planRecipeImport', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      applyRecipeImport: async (...args) => {
        return host.production ? await host.production.call('applyRecipeImport', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      saveWorkflow: async (...args) => {
        return host.production ? await host.production.call('saveWorkflow', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      listWorkflowDrafts: async (...args) => host.production ? await host.production.call('listWorkflowDrafts', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10'),
      discoverWorkflowOutputs: async (...args) => host.production ? await host.production.call('discoverWorkflowOutputs', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10'),
      saveWorkflowDraft: async (...args) => host.production ? await host.production.call('saveWorkflowDraft', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10'),
      prepareUIPlan: async (...args) => {
        return host.production ? await host.production.call('prepareUIPlan', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      confirmUIPlan: async (...args) => {
        return host.production ? await host.production.call('confirmUIPlan', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      saveComposition: async (...args) => {
        return host.production ? await host.production.call('saveComposition', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      prepareUIAdoption: async (...args) => {
        return host.production ? await host.production.call('prepareUIAdoption', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      previewComposition: async (...args) => {
        return host.production ? await host.production.call('previewComposition', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
      assetReferences: async (...args) => {
        return host.production ? await host.production.call('assetReferences', ...args) : fail('PRODUCTION_PROVIDER_UNAVAILABLE', '制作服务尚未就绪', 'M10');
      },
    },
    builds: {
      targets: async () => host.builds ? host.builds.targets() : fail('BUILD_PROVIDER_UNAVAILABLE', '真实构建服务尚未就绪', 'M11'),
      detectToolchain: async input => host.builds ? host.builds.detectToolchain(input) : fail('BUILD_PROVIDER_UNAVAILABLE', '真实构建服务尚未就绪', 'M11'),
      prepareToolchain: async input => host.builds ? host.builds.prepareToolchain(input) : fail('BUILD_PROVIDER_UNAVAILABLE', '真实构建服务尚未就绪', 'M11'),
      cancelToolchain: async id => host.builds ? host.builds.cancelToolchain(id) : fail('BUILD_PROVIDER_UNAVAILABLE', '真实构建服务尚未就绪', 'M11'),
      signingCertificates: async (...args) => {
        return host.builds ? await host.builds.signingCertificates(...args) : fail('BUILD_PROVIDER_UNAVAILABLE', '真实构建服务尚未就绪', 'M11');
      },
      status: async (...args) => {
        return ok({ ready: !!host.builds });
      },
      planBuild: async (...args) => {
        return host.builds ? await host.builds.planBuild(...args) : fail('BUILD_PROVIDER_UNAVAILABLE', '真实构建服务尚未就绪', 'M11');
      },
      build: async (...args) => {
        return host.builds ? await host.builds.build(...args) : fail('BUILD_PROVIDER_UNAVAILABLE', '真实构建服务尚未就绪', 'M11');
      },
      cancel: async (...args) => {
        return host.builds ? await host.builds.cancel(...args) : fail('BUILD_PROVIDER_UNAVAILABLE', '真实构建服务尚未就绪', 'M11');
      },
      receipt: async (...args) => {
        return host.builds ? await host.builds.receipt(...args) : fail('BUILD_PROVIDER_UNAVAILABLE', '真实构建服务尚未就绪', 'M11');
      },
      test: async (...args) => {
        return host.builds ? await host.builds.test(...args) : fail('BUILD_PROVIDER_UNAVAILABLE', '真实构建服务尚未就绪', 'M11');
      },
      instructions: async (...args) => {
        return host.builds ? await host.builds.instructions(...args) : fail('BUILD_PROVIDER_UNAVAILABLE', '真实构建服务尚未就绪', 'M11');
      },
      compatibility: async (...args) => {
        return host.builds ? await host.builds.compatibility(...args) : fail('BUILD_PROVIDER_UNAVAILABLE', '真实构建服务尚未就绪', 'M11');
      },
      chooseOldSaves: async (...args) => {
        const choice = await chooseImport('documents', { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Player data', extensions: ['json', 'zip'] }] }); return ok(choice.canceled ? [] : choice.filePaths);
      },
    },
    upgrades: {
      list: async (...args) => {
        return host.upgrades ? await host.upgrades.list(...args) : fail('UPGRADE_PROVIDER_UNAVAILABLE', '升级服务尚未就绪', 'M11');
      },
      history: async (...args) => {
        return host.upgrades ? await host.upgrades.history(...args) : fail('UPGRADE_PROVIDER_UNAVAILABLE', '升级服务尚未就绪', 'M11');
      },
      plan: async (...args) => {
        return host.upgrades ? await host.upgrades.plan(...args) : fail('UPGRADE_PROVIDER_UNAVAILABLE', '升级服务尚未就绪', 'M11');
      },
      commit: async (...args) => {
        return host.upgrades ? await host.upgrades.commit(...args) : fail('UPGRADE_PROVIDER_UNAVAILABLE', '升级服务尚未就绪', 'M11');
      },
      restore: async (...args) => {
        return host.upgrades ? await host.upgrades.restore(...args) : fail('UPGRADE_PROVIDER_UNAVAILABLE', '升级服务尚未就绪', 'M11');
      },
      cancel: async (...args) => {
        return host.upgrades ? await host.upgrades.cancel(...args) : fail('UPGRADE_PROVIDER_UNAVAILABLE', '升级服务尚未就绪', 'M11');
      },
    },
    templates: {
      library: async (...args) => host.templateLibrary ? host.templateLibrary.manage(args[0]) : fail('TEMPLATE_PROVIDER_UNAVAILABLE','Template library is unavailable.','M08'),
      prepareTemplateSwitch: async (...args) => host.templateLibrary ? host.templateLibrary.prepareSwitch(args[0]) : fail('TEMPLATE_PROVIDER_UNAVAILABLE','Template switching is unavailable.','M08'),
      restoreTemplatePage: async (...args) => host.templateLibrary ? host.templateLibrary.restorePage(args[0]) : fail('TEMPLATE_PROVIDER_UNAVAILABLE','Template switching is unavailable.','M08'),
      previewTemplateResources:async (...args)=>host.templateLibrary?host.templateLibrary.previewResources(args[0]):fail('TEMPLATE_PROVIDER_UNAVAILABLE','Template resources are unavailable.','M08'),
      preparePageEdit: async (...args) => {
        const project=host.projects?.currentSession;if(!project)return fail('PROJECT_SESSION_MISSING','请先打开作品','M08');
        if(host.pageEditing)return ok(await host.pageEditing(args[0]));
        const {preparePageEdit}=await import('@galcraft/templates/editor');return ok(preparePageEdit({documents:[...project.documents.values()],request:args[0]}));
      },
      preparePageStyleEdit: async (...args) => {
        const project=host.projects?.currentSession;if(!project)return fail('PROJECT_SESSION_MISSING','请先打开作品','M08');
        const {preparePageStyleEdit}=await import('@galcraft/templates/style-editing');return ok(preparePageStyleEdit({documents:[...project.documents.values()],request:args[0]}));
      },
      compileStyle: async (...args) => {
        if (!host.operations) return fail('TEMPLATE_PROVIDER_UNAVAILABLE', '页面服务尚未就绪', 'M08');
        return host.operations.start({ operationId: createId(),
        script: join(import.meta.dirname, 'style-utility.mjs'), input: args[0], outputDirectory: null, owner: 'M08' });
      },
      pluginCatalog: async (...args) => {
        return host.pluginPlayerUi ? host.pluginPlayerUi.catalog() : fail('TEMPLATE_PROVIDER_UNAVAILABLE', '页面服务尚未就绪', 'M08');
      },
      pluginPrepare: async (...args) => {
        return host.pluginPlayerUi ? host.pluginPlayerUi.prepare(args[0]) : fail('TEMPLATE_PROVIDER_UNAVAILABLE', '页面服务尚未就绪', 'M08');
      },
      pluginPreview: async (...args) => {
        return host.pluginPlayerUi ? host.pluginPlayerUi.preview(args[0]) : fail('TEMPLATE_PROVIDER_UNAVAILABLE', '页面服务尚未就绪', 'M08');
      },
    },
    projects: {
      chooseBackupFile: async () => {
        const choice = await chooseImport('documents', { properties: ['openFile'], filters: [{ name: 'GalCraft project backup', extensions: ['galproject'] }] });
        return ok(choice.canceled ? null : choice.filePaths[0] ?? null);
      },
      supplyRestoreDependency: async input => {
        if (!host.backups) return fail('BACKUP_PROVIDER_UNAVAILABLE', '备份服务尚未就绪', 'M02');
        const choice = await chooseImport('packages', { title: `${input.id}@${input.version}`, properties: ['openDirectory'] });
        return choice.canceled || !choice.filePaths[0] ? ok(null) : host.backups.supplyRestoreDependency(input, choice.filePaths[0]);
      },
      chooseDirectory: async (...args) => {
        const choice = await host.dialog.showOpenDialog(host.window, { properties: ['openDirectory', 'createDirectory'] });
        const path = choice.canceled ? null : choice.filePaths[0] ?? null;
        return ok(path && host.projectAccess ? await host.projectAccess.approveDirectory(path) : path);
      },
      create: async (...args) => {
        if (!host.projects) return fail('PROJECT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
        if (!['empty', 'light', 'standard', 'rich'].includes(args[0].template)) return fail('TEMPLATE_EXTERNAL', '完整教学样例请下载独立 .galproject，并从备份恢复为作品副本。', 'M01');
        const result = await host.projects.create(args[0]);
        if (result.ok) await host.projectLibrary.register({ projectId: result.value.projectId, directory: host.projects.currentRoot });
        return result;
      },
      copy: async (...args) => {
        return host.backups ? host.backups.copyCurrentProject() : fail('BACKUP_PROVIDER_UNAVAILABLE', '备份服务尚未就绪', 'M02');
      },
      open: async (...args) => {
        if (!host.projects) return fail('PROJECT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
        const result = await host.projects.open(args[0]);
        if (result.ok) {
        host.assets?.clearThumbnails();
        await host.projectLibrary.register({ projectId: result.value.projectId, directory: host.projects.currentRoot });
        }
        return result;
      },
      close: async (...args) => {
        if (!host.projects) return fail('PROJECT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
        const result = await host.projects.close(args[0], args[1]);
        if (result.ok && args[1] !== 'cancel') {
        host.assets?.clearThumbnails();
        host.projectAccess?.release(args[0]);
        }
        return result;
      },
      listRecent: async (...args) => {
        return host.projectLibrary.listRecent();
      },
      inspect: async (...args) => {
        return host.projectLibrary.inspect(args[0]);
      },
      setPinned: async (...args) => {
        return host.projectLibrary.setPinned(args[0]);
      },
      forget: async (...args) => {
        return host.projectLibrary.forget(args[0]);
      },
      relocate: async (...args) => {
        return host.projectLibrary.relocate(args[0]);
      },
      revealDirectory: async (...args) => {
        const inspected = await host.projectLibrary.inspect(args[0]);
        if (!inspected.ok) return inspected;
        const error = await host.shell.openPath(inspected.value.directory);
        return error ? fail('PROJECT_REVEAL_FAILED', error, 'M01') : ok(undefined);
      },
      backup: async (...args) => {
        if (!host.backups || !host.projects?.currentSession) return fail('PROJECT_NOT_OPEN', '请先打开作品', 'M02');
        const choice = await host.dialog.showSaveDialog(host.window, { defaultPath: '作品备份.galproject', filters: [{ name: 'GalCraft project backup', extensions: ['galproject'] }] });
        if (choice.canceled || !choice.filePath) return ok(null);
        const result = await host.backups.createBackup({ source: 'saved', destination: choice.filePath });
        return result.ok ? ok({ directory: choice.filePath }) : result;
      },
      switch: async (...args) => {
        if (!host.projects) return fail('PROJECT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
        const result = await host.projects.switch(args[0]);
        if (result.ok) {
        host.assets?.clearThumbnails();
        await host.projectLibrary.register({ projectId: result.value.projectId, directory: host.projects.currentRoot });
        }
        return result;
      },
    },
    documents: {
      pluginList: async (...args) => {
        return host.pluginDocuments ? host.pluginDocuments.list(args[0]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '插件文档服务尚未就绪', 'M02');
      },
      pluginCreate: async (...args) => {
        return host.pluginDocuments ? host.pluginDocuments.create(args[0]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '插件文档服务尚未就绪', 'M02');
      },
      pluginCopy: async (...args) => {
        return host.pluginDocuments ? host.pluginDocuments.copy(args[0]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '插件文档服务尚未就绪', 'M02');
      },
      pluginUpdate: async (...args) => {
        return host.pluginDocuments ? host.pluginDocuments.update(args[0]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '插件文档服务尚未就绪', 'M02');
      },
      pluginDelete: async (...args) => {
        return host.pluginDocuments ? host.pluginDocuments.remove(args[0]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '插件文档服务尚未就绪', 'M02');
      },
      createBackup: async (...args) => {
        return host.backups ? host.backups.createBackup(args[0]) : fail('BACKUP_PROVIDER_UNAVAILABLE', '备份服务尚未就绪', 'M02');
      },
      prepareRestore: async (...args) => {
        return host.backups ? host.backups.prepareRestore(args[0]) : fail('BACKUP_PROVIDER_UNAVAILABLE', '备份服务尚未就绪', 'M02');
      },
      checkRestore: async (...args) => {
        return host.backups ? host.backups.checkRestore(args[0]) : fail('BACKUP_PROVIDER_UNAVAILABLE', '备份服务尚未就绪', 'M02');
      },
      commitRestore: async (...args) => {
        return host.backups ? host.backups.commitRestore(args[0]) : fail('BACKUP_PROVIDER_UNAVAILABLE', '备份服务尚未就绪', 'M02');
      },
      cancelRestore: async (...args) => {
        return host.backups ? host.backups.cancelRestore(args[0]) : fail('BACKUP_PROVIDER_UNAVAILABLE', '备份服务尚未就绪', 'M02');
      },
      list: async (...args) => {
        return host.documents ? host.documents.list() : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
      },
      planEdit: async (...args) => {
        return host.documents ? host.documents.planEdit(args[0]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
      },
      applyEdit: async (...args) => {
        return host.documents ? host.documents.applyEdit(args[0], args[1]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
      },
      planUndo: async (...args) => {
        return host.documents ? host.documents.planUndo(args[0], args[1], args[2]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
      },
      planRedo: async (...args) => host.documents?.planRedo ? host.documents.planRedo(args[0], args[1]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档重做计划尚未就绪', 'M02'),
      planDiscard: async (...args) => host.documents?.planDiscard ? host.documents.planDiscard(args[0]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档放弃计划尚未就绪', 'M02'),
      applyDiscard: async (...args) => host.documents?.applyDiscard ? host.documents.applyDiscard(args[0]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档放弃计划尚未就绪', 'M02'),
      undo: async (...args) => {
        return host.documents ? host.documents.undo(args[0]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
      },
      redo: async (...args) => {
        return host.documents ? host.documents.redo(args[0]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
      },
      planSave: async (...args) => {
        return host.documents ? host.documents.planSave(args[0]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
      },
      save: async (...args) => {
        return host.documents ? host.documents.save(args[0]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
      },
      getConflict: async (...args) => {
        return host.documents ? host.documents.getConflict(args[0]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
      },
      resolveConflict: async (...args) => {
        return host.documents ? host.documents.resolveConflict(args[0], args[1], args[2]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
      },
      listRecovery: async (...args) => {
        return host.documents ? host.documents.listRecovery() : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
      },
      recover: async (...args) => {
        return host.documents ? host.documents.recover(args[0]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
      },
      getRecoveryConflict: async (...args) => {
        return host.documents ? host.documents.getRecoveryConflict() : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
      },
      resolveRecoveryConflict: async (...args) => {
        return host.documents ? host.documents.resolveRecoveryConflict(args[0], args[1]) : fail('DOCUMENT_PROVIDER_UNAVAILABLE', '文档服务尚未就绪', 'M02');
      },
    },
    authoringPreferences: {
      readInputDraft: async input => ok(await host.preferences.readInputDraft(input)),
      writeInputDraft: async draft => { await host.preferences.writeInputDraft(draft); return ok(undefined); },
      readPreferences: async (...args) => {
        return ok(await preferences().readPreferences());
      },
      writePreferences: async (...args) => {
        await preferences().writePreferences(args[0]); return ok(undefined);
      },
      readWorkspace: async (...args) => {
        return ok(await preferences().readWorkspace(args[0]));
      },
      writeWorkspace: async (...args) => {
        await preferences().writeWorkspace(args[0]); return ok(undefined);
      },
      clearWorkspace: async (...args) => {
        await preferences().clearWorkspace(args[0]); return ok(undefined);
      },
      readStageGuides: async (...args) => {
        return ok(await preferences().readStageGuides(args[0]));
      },
      writeStageGuides: async (...args) => {
        await preferences().writeStageGuides(args[0]); return ok(undefined);
      },
    },
    files: {
      chooseImport:async input=>{const choice=await chooseImport(input.purpose,{title:input.title,properties:input.directory?['openDirectory']:input.multiple?['openFile','multiSelections']:['openFile'],...(input.extensions?{filters:[{name:'Import',extensions:input.extensions}]}:{})});return ok(choice.canceled?[]:choice.filePaths);},
      readImport:async input=>{const choice=await chooseImport(input.purpose,{title:input.title,properties:['openFile'],filters:[{name:'Import',extensions:input.extensions}]});return ok(choice.canceled||!choice.filePaths[0]?null:{path:choice.filePaths[0],text:await readFile(choice.filePaths[0],'utf8')});},
      pickAssets: async (...args) => {
        const choice = await chooseImport('assets', { properties: ['openFile', 'multiSelections'], filters: [
        { name: '支持的素材', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'gca', 'mp3', 'wav', 'ogg', 'opus', 'mp4', 'webm', 'mkv', 'ttf', 'otf', 'woff', 'woff2', 'model3.json'] },
        { name: '图像', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] },
        { name: 'GalCraft 动画', extensions: ['gca'] },
        { name: '声音', extensions: ['mp3', 'wav', 'ogg', 'opus'] },
        { name: '视频', extensions: ['mp4', 'webm', 'mkv'] },
        { name: '字体', extensions: ['ttf', 'otf', 'woff', 'woff2'] },
        { name: 'Live2D 模型入口', extensions: ['model3.json'] },
        ] });
        return ok(choice.canceled ? [] : choice.filePaths);
      },
      pickRecipes: async (...args) => {
        const choice = await chooseImport('production', { title: '导入 GalCraft 创作方案（recipes.galrecipe.json）',
        properties: ['openFile'], filters: [{ name: 'GalCraft 创作方案 JSON', extensions: ['json'] }] });
        return ok(choice.canceled ? [] : choice.filePaths);
      },
      revealEntity: async (...args) => {
        const path = await host.projectAccess?.resolveEntityDirectory(args[0]);
        if (!path) return fail('ENTITY_PATH_UNAVAILABLE', '当前会话中找不到实体所在目录', 'M02', ['locate']);
        const error = await host.shell.openPath(path);
        return error ? fail('OPEN_DIRECTORY_FAILED', error, 'M01') : ok(undefined);
      },
      openBuild: async (...args) => {
        const path = await host.builds?.resolveDirectory(args[0]);
        if (!path) return fail('BUILD_PATH_UNAVAILABLE', '找不到发行目录', 'M11', ['locate']);
        const error = await host.shell.openPath(path);
        return error ? fail('OPEN_DIRECTORY_FAILED', error, 'M11') : ok(undefined);
      },
    },
    assets: {
      typeCatalog: async () => host.assets ? host.assets.typeCatalog() : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04'),
      editTypeData: async input => host.assets ? host.assets.editTypeData(input) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04'),
      saveAnimation: async input => host.assets ? host.assets.saveAnimation(input) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04'),
      weatherTexture: async key => host.assets ? host.assets.weatherTexture(key) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04'),
      iconPresets: async () => listActionIconPresets(),
      importIconPreset: async input => host.assets ? importActionIconPreset(host.assets, input) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04'),
      processorCatalog: async (...args) => {
        return host.assets ? host.assets.processorCatalog() : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      processResource: async (...args) => {
        return host.assets ? host.assets.processResource(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      cancelResource: async (...args) => {
        return host.assets ? host.assets.cancelResource(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      resourceCandidates: async (...args) => {
        return host.assets ? host.assets.resourceCandidates() : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      previewResource: async (...args) => {
        return host.assets ? host.assets.previewResource(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      confirmResource: async (...args) => {
        return host.assets ? host.assets.confirmResource(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      discardResource: async (...args) => {
        return host.assets ? host.assets.discardResource(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      references: async (...args) => {
        return host.assets ? host.assets.references(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      verifyTarget: async (...args) => {
        return host.assets ? host.assets.verifyTarget(args[0], args[1], progress => { if (host.window && !host.window.isDestroyed()) host.window.webContents.send('studio:assetVerification', progress); }) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      query: async (...args) => {
        return host.assets ? host.assets.query(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      picker: async (...args) => {
        if (!host.assets) return fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
        const recent = await host.assetPickerRecent.read(args[0].context.projectId);
        return host.assets.picker(args[0], args[0].context.allowedKinds.flatMap(kind => recent[kind] ?? []));
      },
      recordUse: async (...args) => {
        const current = host.assets?.current();
        if (!current || current.session.projectId !== args[0].projectId) return fail('PROJECT_STALE', '当前作品已变化', 'M04');
        const assets = args[0].assetIds.map(id => current.index.data.assets.find(asset => asset.id === id));
        if (assets.some(asset => !asset)) return fail('ASSET_MISSING', '已绑定素材不在当前作品中', 'M04');
        await host.assetPickerRecent.record(args[0].projectId, assets.filter(asset => asset !== undefined)); return ok(undefined);
      },
      removeRecent: async (...args) => {
        await host.assetPickerRecent.remove(args[0].projectId, args[0].assetId); return ok(undefined);
      },
      allIds: async (...args) => {
        return host.assets ? host.assets.allIds(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      get: async (...args) => {
        return host.assets ? host.assets.get(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      inspectModel: async (...args) => {
        return host.assets ? host.assets.inspectModel(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      describe: async (...args) => {
        return host.assets ? host.assets.describe(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      rename: async (...args) => {
        return host.assets ? host.assets.rename(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      planBatchRename: async (...args) => {
        return host.assets ? host.assets.planBatchRename(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      applyBatchRename: async (...args) => {
        return host.assets ? host.assets.applyBatchRename(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      remove: async (...args) => {
        return host.assets ? host.assets.remove(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      preview: async (...args) => {
        return host.assets ? host.assets.preview(args[0], args[1]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      thumbnails: async (...args) => {
        return host.assets ? host.assets.thumbnails(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      stopPreview: async (...args) => {
        return host.assets ? host.assets.stopPreview() : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      resolveRuntime: async (...args) => {
        return host.assets ? host.assets.resolveRuntime(args[0], args[1]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      releaseRuntime: async (...args) => {
        return host.assets ? host.assets.releaseRuntime(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      prepareMattingModel: async (...args) => {
        return host.assets ? host.assets.prepareMattingModel() : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      removeBackground: async (...args) => {
        return host.assets ? host.assets.removeBackground(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      confirmBackground: async (...args) => {
        return host.assets ? host.assets.confirmBackground(args[0], args[1]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      discardBackground: async (...args) => {
        return host.assets ? host.assets.discardBackground(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
      import: async (...args) => {
        return host.assets ? host.assets.import(args[0]) : fail('ASSET_PROVIDER_UNAVAILABLE', '素材服务尚未就绪', 'M04');
      },
    },
    operations: {
      cancel: async (...args) => {
        return host.operations ? host.operations.cancel(args[0]) : { local: 'alreadyFinished', remote: 'notApplicable' };
      },
    },
    language: {
      compile: async (...args) => {
        return host.language ? host.language.compile(args[0]) : fail('LANGUAGE_PROVIDER_UNAVAILABLE', '编译服务尚未就绪', 'M03');
      },
      lastValid: async (...args) => {
        return host.language ? host.language.lastValid(args[0]) : fail('LANGUAGE_PROVIDER_UNAVAILABLE', '编译服务尚未就绪', 'M03');
      },
      querySemantic: async (...args) => {
        return host.language ? host.language.querySemantic(args[0]) : fail('LANGUAGE_PROVIDER_UNAVAILABLE', '编译服务尚未就绪', 'M03');
      },
      locate: async (...args) => {
        return host.language ? host.language.locate(args[0], args[1]) : fail('LANGUAGE_PROVIDER_UNAVAILABLE', '编译服务尚未就绪', 'M03');
      },
      pluginQuery: async (...args) => {
        if (host.language && !host.projects?.currentSession) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02');
        return host.language && host.projects?.currentSession ? host.language.pluginQuery(host.projects.currentSession.projectId, args[0]) : fail('LANGUAGE_PROVIDER_UNAVAILABLE', '编译服务尚未就绪', 'M03');
      },
      pluginPrepare: async (...args) => {
        if (host.language && !host.projects?.currentSession) return fail('PROJECT_SESSION_MISSING', '请先打开作品', 'M02');
        return host.language && host.projects?.currentSession ? host.language.pluginPrepare(host.projects.currentSession.projectId, args[0]) : fail('LANGUAGE_PROVIDER_UNAVAILABLE', '编译服务尚未就绪', 'M03');
      },
    },
    plugins: {
      commandSpecs:async()=>{const acquired=await host.plugins?.acquireDefinitions?.(host.projects?.currentSession??null,{allowMissing:true});if(!acquired)return ok([]);if(!acquired.ok)return acquired;try{return ok(acquired.value.commands);}finally{await acquired.value.release();}},
      list: async (...args) => {
        return host.plugins ? host.plugins.list(host.projects?.currentSession ?? null) : fail('PLUGIN_PROVIDER_UNAVAILABLE', '插件服务尚未就绪', 'M09');
      },
      planChange: async (...args) => {
        return host.plugins ? host.plugins.planChange(args[0], host.projects?.currentSession ?? null) : fail('PLUGIN_PROVIDER_UNAVAILABLE', '插件服务尚未就绪', 'M09');
      },
      inspectPackage: async (...args) => {
        return host.plugins ? host.plugins.inspectPackage(args[0]) : fail('PLUGIN_PROVIDER_UNAVAILABLE', '插件服务尚未就绪', 'M09');
      },
      install: async (...args) => {
        return host.plugins ? host.plugins.install(args[0]) : fail('PLUGIN_PROVIDER_UNAVAILABLE', '插件服务尚未就绪', 'M09');
      },
      loadDevelopment: async (...args) => {
        return host.plugins ? host.plugins.loadDevelopment(args[0]) : fail('PLUGIN_PROVIDER_UNAVAILABLE', '插件服务尚未就绪', 'M09');
      },
      resolve: async (...args) => {
        return host.plugins ? host.plugins.resolve(args[0]) : fail('PLUGIN_PROVIDER_UNAVAILABLE', '插件服务尚未就绪', 'M09');
      },
      release: async (...args) => {
        return host.plugins ? host.plugins.release(args[0]) : fail('PLUGIN_PROVIDER_UNAVAILABLE', '插件服务尚未就绪', 'M09');
      },
    },
    connections: {
      list: async (...args) => {
        return ok(await host.connections.list());
      },
      save: async (...args) => {
        const config = ConnectionConfigSchema.parse(args[0]);
        return ok(await host.connections.save(config, args[1]));
      },
      test: async (...args) => {
        const selection = ConnectionSelectionSchema.parse(args[0]);
        const entry = await host.connections.read(selection.connectionId);
        if (!entry) return fail('CONNECTION_MISSING', '连接不存在', 'M10', ['edit']);
        if (!entry.config.purposes.includes(selection.purpose)) return fail('PURPOSE_UNSUPPORTED', '连接未声明该用途', 'M10', ['edit']);
        return host.inspectConnection ? await host.inspectConnection(entry, selection) : fail('CONNECTION_PROVIDER_UNAVAILABLE', '连接检查服务尚未就绪', 'M10');
      },
    },
  };
  return handlers;
}
