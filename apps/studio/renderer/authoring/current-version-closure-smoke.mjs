import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, protocol, safeStorage, shell, utilityProcess } from 'electron';
import { FixtureIds, FixtureLock, FixtureProject, FixtureSaveRecord, FixtureScenes, fixtureId } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { PlayerDataService } from '@galcraft/player-ui';
import { createOfficialTemplate, createTemplateDocuments } from '@galcraft/templates';
import { registerResourceScheme, ResourceRegistry } from '@galcraft/media-tools/resources';
import { WindowsPlayerStorage } from '../../../player-windows/main/storage.mjs';
import { ProjectAccess } from '../../main/project-access.mjs';
import { ProjectDocuments } from '../../main/document-providers.mjs';
import { StudioAssets } from '../../main/asset-providers.mjs';
import { StudioBackups } from '../../main/backup-providers.mjs';
import { StudioPluginPackages } from '../../main/plugin-packages.mjs';
import { StudioHost, registerStudioIpc } from '../../main/host.mjs';
import { UtilityTasks } from '../../main/utility-tasks.mjs';
import { CompilerTasks } from '../../main/compiler-tasks.mjs';

const repo = resolve('../..'), studio = resolve('.');
const output = join(repo, 'test-results/latest/current-version-closure');
const runRoot = join(output, `studio-${randomUUID()}`);
const projectRoot = join(runRoot, '春日来信'), userData = join(runRoot, 'studio-data');
const labelId = fixtureId(0xd01), labelStatement = fixtureId(0xd02);
const jumpStatement = fixtureId(0xd03), sayStatement = fixtureId(0xd04);
const scriptPath = `scenes/${FixtureIds.street}/script.gal`;
const initialScript = `label {labelId:"${labelId}",name:"目标"} @${labelStatement};\n` +
  `jumpLabel {labelId:"${labelId}"} @${jumpStatement};\n` +
  `say {speaker:{kind:"narrator"},text:"原作品正文"} @${sayStatement};\n`;
const envelope = (id, data) => JSON.stringify({ schemaVersion: 1, documentId: id, revision: 1, data }, null, 2) + '\n';
const value = result => { if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`); return result.value; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(window, expression, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await window.webContents.executeJavaScript(`(async () => Boolean(await (${expression})))()`, true)) return;
    await sleep(100);
  }
  throw new Error(`Studio window did not reach: ${expression}`);
}
async function click(window, label, selector = 'document') {
  return window.webContents.executeJavaScript(`(() => {
    const root = ${selector}, button = [...root.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(label)});
    if (!button) throw new Error('Button missing: ${label}'); button.click(); return true;
  })()`, true);
}
async function fixture() {
  const template = createOfficialTemplate({ kind: 'standard' });
  const project = { ...FixtureProject, templateDocumentId: template.instanceId };
  const lock = { ...FixtureLock, plugins: [], template: template.dependencies.find(item => item.kind === 'template') };
  const documents = [
    { documentId: FixtureIds.projectA, revision: 1, format: 'json', files: { 'project.json': envelope(FixtureIds.projectA, project) } },
    { documentId: fixtureId(0xd05), revision: 1, format: 'json', files: { 'dependencies.lock.json': envelope(fixtureId(0xd05), lock) } },
    { documentId: fixtureId(0xd06), revision: 1, format: 'json', files: { 'assets/index.json': envelope(fixtureId(0xd06), { assets: [] }) } },
    { documentId: FixtureIds.streetDocument, revision: 1, format: 'dsl', files: {
      [`scenes/${FixtureIds.street}/scene.json`]: envelope(FixtureIds.streetDocument, FixtureScenes[0]), [scriptPath]: initialScript } },
    { documentId: FixtureIds.bookshopDocument, revision: 1, format: 'dsl', files: {
      [`scenes/${FixtureIds.bookshop}/scene.json`]: envelope(FixtureIds.bookshopDocument, FixtureScenes[1]),
      [`scenes/${FixtureIds.bookshop}/script.gal`]: '' } },
    ...createTemplateDocuments(template),
  ];
  const session = await ProjectSession.createProject(projectRoot, project.projectId, documents);
  value(await session.dispose('saved'));
}

await mkdir(userData, { recursive: true });
app.setPath('userData', userData);
registerResourceScheme(protocol);
app.whenReady().then(async () => {
  const report = { version: process.env.GALCRAFT_ACCEPTANCE_VERSION ?? null, projectRoot, stages: [], result: 'failed', error: null };
  let window, backups;
  try {
    await fixture();
    const resources = new ResourceRegistry(); resources.install(protocol);
    window = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: {
      backgroundThrottling: false, preload: join(studio, 'main/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true,
    } });
    const operations = new UtilityTasks({ utilityProcess, MessageChannelMain }), language = new CompilerTasks(operations);
    const access = new ProjectAccess(), documents = new ProjectDocuments(access);
    const assets = new StudioAssets(documents, join(repo, 'tools/media/bin'), undefined, operations, resources, join(userData, 'models'));
    const plugins = new StudioPluginPackages(join(userData, 'plugins'), resources);
    const engineCatalog = { resolveProjectEngine: async () => ({ ok: true, value: {}, warnings: [] }) };
    backups = new StudioBackups({ userData, projects: documents, engineCatalog });
    let chosenRoot = projectRoot, copyReceipt = null;
    const host = new StudioHost({ userData, dialog: { ...dialog, showOpenDialog: async () => ({ canceled: false, filePaths: [chosenRoot] }) },
      shell, safeStorage, window, projectAccess: access, projects: documents, documents, assets, plugins, operations, language, backups });
    const call = host.call.bind(host);
    host.call = async (...args) => { const result = await call(...args); if (args[0] === 'projects' && args[1] === 'copy') copyReceipt = result; return result; };
    registerStudioIpc(ipcMain, host);
    await window.loadFile(join(studio, 'dist/index.html'));
    await window.webContents.executeJavaScript('window.confirm = () => true; void 0');
    await wait(window, `document.querySelector('.project-workbench')`);
    await click(window, '打开作品', `document.querySelector('.project-workbench')`);
    await wait(window, `document.querySelector('[data-statement-id="${labelStatement}"]')`);
    const originalId = JSON.parse(await readFile(join(projectRoot, 'project.json'), 'utf8')).data.projectId;

    await window.webContents.executeJavaScript(`(() => {
      const card = document.querySelector('[data-statement-id="${labelStatement}"]');
      card.focus(); card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    })()`, true);
    await wait(window, `(async () => !(await window.studioBridge.documents.list()).value.find(item => item.files['${scriptPath}'])?.files['${scriptPath}'].includes('label {labelId:'))()`);
    try { await wait(window, `[...document.querySelectorAll('.authoring-diagnostic-content button')].some(item => item.textContent.includes('LABEL_MISSING'))`, 10000); }
    catch { throw new Error(`Diagnostic was not locatable: ${await window.webContents.executeJavaScript(`document.querySelector('.authoring-diagnostic-content')?.textContent`)}`); }
    report.stages.push({ name: 'deletedReferencedLabel', issue: await window.webContents.executeJavaScript(`document.querySelector('.authoring-diagnostic-content button')?.textContent`),
      sourceContainsLabel: value(documents.list()).find(item => item.documentId === FixtureIds.streetDocument).files[scriptPath].includes(`label {labelId:`) });
    assert.equal(report.stages.at(-1).sourceContainsLabel, false);
    await window.webContents.executeJavaScript(`document.querySelector('.authoring-diagnostic-content button').click()`, true);
    try { await wait(window, `document.querySelector('.authoring-tabs button.selected')?.textContent.trim() === '脚本' && document.querySelector('.authoring-script-editor .monaco-editor')`, 5000); }
    catch { throw new Error(`Issue click state: ${JSON.stringify(await window.webContents.executeJavaScript(`({
      tabs: [...document.querySelectorAll('.authoring-tabs button')].map(item => ({ text: item.textContent, selected: item.classList.contains('selected') })),
      script: Boolean(document.querySelector('.authoring-script-editor')),
      monaco: Boolean(document.querySelector('.authoring-script-editor .monaco-editor')),
      message: document.querySelector('.authoring-notice')?.textContent,
      rail: [...document.querySelectorAll('.studio-rail button')].find(item => item.getAttribute('aria-current') === 'page')?.getAttribute('aria-label')
    })`))}`); }
    await wait(window, `(async () => { const result = await window.studioBridge.authoringPreferences.readWorkspace('${originalId}');
      return result.ok && result.value?.view === 'script' && result.value.caret.statementId === '${jumpStatement}'; })()`);
    report.stages.push({ name: 'diagnosticLocated', view: 'script', referencedStatement: jumpStatement });
    await click(window, '撤销', `document.querySelector('.authoring-editor .authoring-toolbar')`);
    await wait(window, `document.querySelector('.authoring-diagnostic-content strong')?.textContent.includes('· 0')`);
    assert.equal(value(documents.list()).find(item => item.documentId === FixtureIds.streetDocument).files[scriptPath], initialScript);
    report.stages.push({ name: 'diagnosticRepaired', issueCount: 0 });
    await click(window, '保存全部', `document.querySelector('.authoring-editor .authoring-toolbar')`);
    await wait(window, `(async () => (await window.studioBridge.documents.list()).value?.every(item => !item.dirty))()`);
    assert.equal(await readFile(join(projectRoot, scriptPath), 'utf8'), initialScript);

    await window.webContents.executeJavaScript(`document.querySelector('.studio-rail button[aria-label="作品"]').click()`, true);
    await wait(window, `document.querySelector('.project-current')`);
    await click(window, '复制作品', `document.querySelector('.project-current')`);
    await wait(window, `window.studioBridge.documents.list().then(result => result.ok && JSON.parse(result.value.find(item => item.files['project.json']).files['project.json']).data.projectId !== '${originalId}')`, 90000);
    const receipt = value(copyReceipt), copiedId = receipt.projectId;
    chosenRoot = receipt.directory;
    assert.notEqual(copiedId, originalId);
    assert.equal(JSON.parse(await readFile(join(receipt.directory, 'project.json'), 'utf8')).data.projectId, copiedId);
    const copiedDocument = value(documents.list()).find(item => Object.values(item.files).some(content => content.includes('原作品正文')));
    assert(copiedDocument);
    const copiedScriptPath = Object.keys(copiedDocument.files).find(path => path.endsWith('/script.gal') && copiedDocument.files[path].includes('原作品正文'));
    assert(copiedScriptPath);
    report.stages.push({ name: 'copiedFromStudio', directory: receipt.directory, originalId, copiedId });

    await wait(window, `document.querySelector('.authoring-tabs')`);
    await click(window, FixtureScenes[0].name, `document.querySelector('.authoring-nav')`);
    await click(window, '写作', `document.querySelector('.authoring-tabs')`);
    await wait(window, `[...document.querySelectorAll('textarea.authoring-writing-input')].some(item => item.value === '原作品正文')`);
    await window.webContents.executeJavaScript(`(() => {
      const field = [...document.querySelectorAll('textarea.authoring-writing-input')].find(item => item.value === '原作品正文');
      field.value = '副本独立修改'; field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));
    })()`, true);
    await wait(window, `(async () => (await window.studioBridge.documents.list()).value?.find(item => item.files['${copiedScriptPath}'])?.files['${copiedScriptPath}'].includes('副本独立修改'))()`);
    await click(window, '保存全部', `document.querySelector('.authoring-editor .authoring-toolbar')`);
    await wait(window, `(async () => (await window.studioBridge.documents.list()).value?.every(item => !item.dirty))()`);
    const copiedScript = await readFile(join(receipt.directory, copiedScriptPath), 'utf8');
    assert(copiedScript.includes('副本独立修改'));
    assert.equal(await readFile(join(projectRoot, scriptPath), 'utf8'), initialScript);
    const beforeReopenSession = documents.currentSessionId;
    await window.webContents.executeJavaScript(`document.querySelector('.studio-rail button[aria-label="作品"]').click()`, true);
    await wait(window, `document.querySelector('.project-current')`);
    await wait(window, `[...document.querySelectorAll('.project-workbench button')].some(item => item.textContent.trim() === '打开作品' && !item.disabled)`);
    await click(window, '打开作品', `document.querySelector('.project-workbench')`);
    const until = Date.now() + 30000;
    while (documents.currentSessionId === beforeReopenSession && Date.now() < until) {
      if (await window.webContents.executeJavaScript(`Boolean(document.querySelector('dialog[open]'))`, true))
        await click(window, '保存全部', `document.querySelector('dialog[open]')`);
      await sleep(100);
    }
    if (documents.currentSessionId === beforeReopenSession) throw new Error(`Reopen state: ${JSON.stringify({ currentRoot: documents.currentRoot,
      chosenRoot, ui: await window.webContents.executeJavaScript(`({ dialog: document.querySelector('dialog[open]')?.textContent,
      notice: document.querySelector('.authoring-notice')?.textContent, buttonDisabled: [...document.querySelectorAll('.project-workbench button')].find(item => item.textContent.trim() === '打开作品')?.disabled,
      currentProject: document.querySelector('.project-current h2')?.textContent, editor: Boolean(document.querySelector('.authoring-editor')) })`) })}`);
    await wait(window, `document.querySelector('.authoring-editor')`);
    assert.equal(await readFile(join(receipt.directory, copiedScriptPath), 'utf8'), copiedScript);
    report.stages.push({ name: 'copyEditedSavedReopened', originalUnchanged: true, copiedScriptContainsEdit: true });

    const playerStorage = new WindowsPlayerStorage(join(runRoot, 'player-data'));
    const originalData = new PlayerDataService({ target: 'windows', storage: playerStorage },
      { projectId: originalId, kind: 'player', instance: 'local' }, 'zh-CN', 'zh-CN');
    value(await originalData.open());
    value(await originalData.save({ kind: 'manual', record: FixtureSaveRecord, expectedIndexRevision: 0 }));
    const copiedData = new PlayerDataService({ target: 'windows', storage: playerStorage },
      { projectId: copiedId, kind: 'player', instance: 'local' }, 'zh-CN', 'zh-CN');
    const copyProfile = value(await copiedData.open());
    assert.equal(copyProfile.index.manual.length, 0);
    assert.equal(value(await copiedData.record(FixtureSaveRecord.recordId)), null);
    assert.equal((await copiedData.save({ kind: 'manual', record: FixtureSaveRecord, expectedIndexRevision: 0 })).ok, false);
    assert.equal(value(await originalData.record(FixtureSaveRecord.recordId)).recordId, FixtureSaveRecord.recordId);
    report.stages.push({ name: 'playerProfileIsolation', originalSave: FixtureSaveRecord.recordId, copiedManualSaves: 0 });
    report.result = 'passed';
  } catch (error) { report.error = error?.stack ?? String(error); }
  finally {
    await mkdir(output, { recursive: true });
    await writeFile(join(output, 'studio-window.json'), JSON.stringify(report, null, 2));
    await backups?.plugins.dispose();
    window?.destroy();
    console.log(JSON.stringify({ result: report.result, stages: report.stages.map(stage => stage.name), error: report.error }));
    app.exit(report.result === 'passed' ? 0 : 1);
  }
});
