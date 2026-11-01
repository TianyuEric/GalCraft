import { createId } from '@galcraft/contracts';

import { join } from 'node:path';
import { readTemplateDocuments } from '@galcraft/templates';
import { projectData, validateProject } from '@galcraft/documents/backup';
import { buildIssue } from '@galcraft/publishing/build';
import { ProjectAccess } from './project-access.mjs';
import { ProjectDocuments } from './document-providers.mjs';
import { StudioBackups } from './backup-providers.mjs';
import { StudioBuilds } from './build-providers.mjs';
import { CompilerTasks } from './compiler-tasks.mjs';

const value = result => { if (!result.ok) throw new Error(result.error.message); return result.value; };
export function upgradeValidator({ userData, engineCatalog, operations, officialPackages, launcher }) {
  return async ({ directory, projectId, targets, representativeSaves, signal }) => {
    const checks = [], projects = new ProjectDocuments(new ProjectAccess(), undefined, engineCatalog);
    const backups = new StudioBackups({ userData, projects, engineCatalog, officialPackages });
    const language = new CompilerTasks(operations, engineCatalog);
    try {
      value(await projects.open(directory));
      const documents = [...projects.currentSession.documents.values()], { project, lock, files } = projectData(documents);
      const dependencyIssues = await backups.service.providers.validateDependencies(project, lock, '', documents);
      const structuralIssues = await validateProject(directory, documents, backups.service.providers);
      const entities = prefix => Object.entries(files).filter(([path]) => path.startsWith(prefix) && path.endsWith('.json')).map(([, raw]) => JSON.parse(raw).data);
      const input = { projectId, engineVersion: project.engineVersion, project, lock,
        documents: documents.filter(document => document.format === 'dsl').map(document => ({ documentId: document.documentId, revision: document.revision,
          kind: 'scene', sceneId: JSON.parse(Object.entries(document.files).find(([path]) => path.endsWith('/scene.json'))[1]).data.id,
          text: Object.entries(document.files).find(([path]) => path.endsWith('/script.gal'))[1] })),
        entityVersions: documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })),
        scenes: entities('scenes/'), characters: entities('characters/'), variables: entities('variables/'), gallery: entities('gallery/'), flows: entities('flows/'),
        debugScenarios: Object.entries(files).filter(([path]) => path.startsWith('authoring/debug/') && path.endsWith('.json'))
          .map(([, raw]) => { const envelope = JSON.parse(raw); return { documentId: envelope.documentId, revision: envelope.revision, data: envelope.data }; }),
        assets: JSON.parse(files['assets/index.json']).data.assets, template: readTemplateDocuments(documents),
        pluginDocuments: Object.fromEntries(lock.plugins.flatMap(plugin => files[`plugins/${plugin.id}/documents/config.json`] ? [[plugin.id, JSON.parse(files[`plugins/${plugin.id}/documents/config.json`]).data]] : [])),
        pluginCommands: backups.contributions?.commands.map(item => item.spec) ?? [],
        pluginConditions: Object.fromEntries((backups.contributions?.conditions ?? []).map(item => [item.key, { args: item.fields.map(field => ['number', 'integer'].includes(field.type) ? 'number' : field.type === 'boolean' ? 'boolean' : 'string'), returns: 'boolean' }])),
        cancelOperationId: createId() };
      signal.throwIfAborted();
      const compiled = await language.compile(input), snapshot = compiled.ok ? compiled.value.snapshot : null;
      const compilerIssues = compiled.ok ? compiled.value.issues : compiled.issues;
      const scenarios = Object.entries(files).filter(([path]) => path.startsWith('authoring/debug/') && path.endsWith('.json')).map(([, raw]) => ({ ...JSON.parse(raw).data, externalPolicy: 'simulate' }));
      for (const target of targets) {
        signal.throwIfAborted();
        const templateIssue = issue => /TEMPLATE|STYLE|UI_ASSET/.test(issue.code);
        const relevant = kind => kind === 'dsl' ? compilerIssues : kind === 'plugin' ? dependencyIssues.filter(issue => !templateIssue(issue)) :
          kind === 'template' ? [...dependencyIssues, ...structuralIssues].filter(templateIssue) : structuralIssues.filter(issue => !templateIssue(issue));
        for (const kind of ['dsl', 'template', 'plugin', 'resource']) {
          const issues = relevant(kind); checks.push({ kind, target, result: issues.some(issue => issue.severity === 'error') || kind === 'dsl' && !snapshot ? 'fail' : 'pass', issues });
        }
        if (!snapshot || checks.some(check => check.target === target && check.result === 'fail')) {
          checks.push(...['save', 'playtest'].map(kind => ({ kind, target, result: 'notRun', issues: [] }))); continue;
        }
        let verified;
        const builds = new StudioBuilds({ projects, language, engineCatalog, pluginRoot: join(userData, 'plugins'), officialPackages,
          verify: async (...args) => { verified = await launcher.verify(...args, scenarios); return verified; } });
        const planned = await builds.planBuild({ projectId, target, outputDirectory: join(userData, 'upgrade-tests', createId(), target),
          releaseVersion: project.releaseVersion, snapshotId: snapshot.snapshotId, savedVersions: input.entityVersions,
          keepAssets: [], platformPolicy: {}, font: { mode: 'full', fallbackAssetId: null }, oldSaveFiles: representativeSaves, entryMappings: [] });
        if (!planned.ok || planned.value.issues.some(issue => issue.severity === 'error')) {
          const issues = planned.ok ? planned.value.issues : planned.issues;
          checks.push(...['save', 'playtest'].map(kind => ({ kind, target, result: 'fail', issues }))); continue;
        }
        const cancel = () => builds.cancel(planned.value.planId); signal.addEventListener('abort', cancel, { once: true });
        let built; try { built = await builds.build(planned.value.planId); } finally { signal.removeEventListener('abort', cancel); }
        const report = verified?.ok ? verified.value.compatibility : null;
        const saveIssues = [...report?.fileIssues.flatMap(item => item.issues) ?? [], ...report?.samples.flatMap(item => item.issues) ?? []];
        if (!representativeSaves.length || !report?.samples.length || report?.missingSamples.length)
          saveIssues.push(buildIssue('UPGRADE_SAMPLES_REQUIRED', '请提供代表旧档，完成旧档验证后再提交升级'));
        if (!built.ok) saveIssues.push(...built.issues);
        checks.push({ kind: 'save', target, result: saveIssues.some(issue => issue.severity === 'error') || report?.samples.some(item => item.result === 'incompatible') ? 'fail' : 'pass', issues: saveIssues });
        const routeReports = verified?.ok ? verified.value.scenarios ?? [] : [];
        const routeIssues = routeReports.flatMap(item => item.issues);
        if (!built.ok) routeIssues.push(...built.issues);
        if (!scenarios.length) routeIssues.push(buildIssue('UPGRADE_ROUTES_REQUIRED', '作品需要至少一条已保存的代表调试路线'));
        checks.push({ kind: 'playtest', target, result: built.ok && scenarios.length && routeReports.length === scenarios.length && routeReports.every(item => item.reached) ? 'pass' : 'fail', issues: routeIssues });
      }
      return { validatedAt: new Date().toISOString(), sourceVersions: [], checks };
    } finally { if (projects.currentSession) await projects.close(projects.currentSessionId, 'discard'); await backups.plugins.dispose(); }
  };
}
