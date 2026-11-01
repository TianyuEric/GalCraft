import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { ProjectAccess } from '../../../main/project-access.mjs';
import { ProjectDocuments } from '../../../main/document-providers.mjs';
import { StudioAssets } from '../../../main/asset-providers.mjs';
import { StudioHost, registerStudioIpc } from '../../../main/host.mjs';

const studio = resolve(import.meta.dirname, '../../..'), repo = resolve(studio, '../..');
const output = join(repo, 'test-results/latest/round6/project-center-native');
const data = join(repo, 'tmp/testing/round6-project-center-native', randomUUID());
await mkdir(data, { recursive: true }); await mkdir(output, { recursive: true });
app.setPath('userData', join(data, 'profile'));
const report = { target: 'Electron Studio / actual filesystem project switching', limitations: ['Exact engine listing uses an installed-engine resolver fixture; this case does not accept preview rendering. Native directory picker is supplied a selected path.'],
  executedAt: new Date().toISOString(), environment: { electron: process.versions.electron }, checks: [], result: 'failed' };
const value = result => { if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`); return result.value; };
let window;
const invoke = expression => window.webContents.executeJavaScript(expression, true);
const capture = async name => {
  const style = await window.webContents.insertCSS('*,*::before,*::after { animation:none!important; transition:none!important; } .gc-dialog,dialog[open] { opacity:1!important; scale:1!important; }');
  await invoke(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await window.webContents.capturePage();
  await new Promise(resolve => setTimeout(resolve, 250));
  await writeFile(join(output, name), (await window.webContents.capturePage()).toPNG());
  await window.webContents.removeInsertedCSS(style);
};
const wait = async expression => {
  const until = Date.now() + 20000;
  while (Date.now() < until) { if (await invoke(`Boolean(${expression})`)) return; await new Promise(resolve => setTimeout(resolve, 80)); }
  throw new Error(`UI did not reach ${expression}`);
};
const click = async label => { await invoke(`(() => {const button=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error('Missing button');button.click()})()`); };
const home = async () => { await invoke(`document.querySelector('.studio-rail button[aria-label="作品"]').click()`); await wait(`document.querySelector('.project-library-item')`); };
const open = async name => { await invoke(`([...document.querySelectorAll('.project-library-main')].find(item=>item.textContent.includes(${JSON.stringify(name)}))).click()`); };
app.whenReady().then(async () => {
try {
  const access = new ProjectAccess();
  const documents = new ProjectDocuments(access, undefined, { resolveEngine: async () => ({ ok: true, value: { version: '0.1.0' }, warnings: [] }) });
  const projects = [];
  for (const name of ['第一部作品', '第二部作品']) {
    const receipt = value(await documents.create({ path: data, name, template: 'standard', width: 1280, height: 720, engineVersion: '0.1.0' }));
    projects.push({ projectId: receipt.projectId, directory: documents.currentRoot });
    value(await documents.close(receipt.sessionId, 'save')); access.release(receipt.sessionId);
  }
  const missing = { projectId: randomUUID(), directory: join(data, '移动后的作品') };
  const bad = join(data, '不是作品'); await mkdir(bad);
  window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { preload: join(studio, 'main/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  const assets = new StudioAssets(documents);
  const host = new StudioHost({ userData: app.getPath('userData'), projects: documents, documents, projectAccess: access, assets, safeStorage, window,
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [bad] }) }, shell: { openPath: async () => '' } });
  await host.projectLibrary.register(projects[0]); await host.projectLibrary.register(projects[1]); await host.projectLibrary.register(missing);
  registerStudioIpc(ipcMain, host);
  await window.loadFile(join(studio, 'dist/index.html'));
  await wait(`document.querySelectorAll('.project-library-item').length===3`);
  await capture('projects-home.png');
  await open('第一部作品');
  await wait(`document.querySelector('.authoring-editor')`);
  assert.equal(documents.currentSession.projectId, projects[0].projectId);
  await home();
  assert.equal(await invoke(`document.querySelectorAll('dialog[open]').length`), 0);
  const original = documents.currentSession, projectDocument = [...original.documents.values()].find(item => item.files['project.json']);
  const expected = [{ ref: { kind: 'document', id: projectDocument.documentId }, revision: projectDocument.revision }];
  const edit = value(documents.planEdit({ label: 'Update description', origin: 'field', expected, preparedAssets: [], requiredRefs: [], patches: [{ kind: 'json', documentId: projectDocument.documentId,
    changes: [{ path: '/data/description', before: '', after: '保存后切换的文字', op: 'set' }] }] }));
  value(await documents.applyEdit(edit.planId, expected));
  await window.loadFile(join(studio, 'dist/index.html')); await wait(`document.querySelector('.authoring-editor')`); await home();
  await click('打开作品');
  await wait(`document.querySelector('.authoring-notice')?.textContent.includes('找不到作品目录')`);
  assert.equal(documents.currentSession, original); assert(original.dirtyIds().length > 0);
  assert.equal(await invoke(`document.querySelectorAll('dialog[open]').length`), 0);
  report.checks.push('invalid target fails before close prompt and preserves current dirty session');
  await open('第二部作品'); await wait(`document.querySelector('dialog[open]')`);
  await capture('save-before-switch.png');
  await click('取消'); await wait(`!document.querySelector('dialog[open]')`); assert.equal(documents.currentSession, original);
  await open('第二部作品'); await wait(`document.querySelector('dialog[open]')`); await click('保存并切换');
  await wait(`document.querySelector('.authoring-editor')`);
  assert.equal(documents.currentSession.projectId, projects[1].projectId);
  assert.equal(JSON.parse(await readFile(join(projects[0].directory, 'project.json'), 'utf8')).data.description, '保存后切换的文字');
  report.checks.push('cancel keeps active project; save-and-switch persists previous project and opens the target');
  await home(); await open('第一部作品'); await wait(`document.querySelector('.authoring-editor')`);
  assert.equal(documents.currentSession.projectId, projects[0].projectId);
  assert.equal(await invoke(`document.querySelectorAll('dialog[open]').length`), 0);
  report.checks.push('clean project switches directly; returning to home preserves its session');
  await home(); await capture('projects-current.png');
  await click('继续创作'); await wait(`document.querySelector('.character-manager-trigger')`);
  await invoke(`document.querySelector('.character-manager-trigger').click()`); await wait(`document.querySelector('.character-manager')`);
  await invoke(`document.querySelector('.character-list-heading button').click()`);
  await wait(`document.querySelector('.character-role-options input[value="main"]')`);
  await invoke(`document.querySelector('.character-role-options input[value="main"]').click()`);
  await invoke(`document.querySelector('.character-manager-detail input[aria-label="角色名称"]').focus()`);
  await capture('global-characters.png');
  await invoke(`[...document.querySelectorAll('.character-manager-footer button')].find(item=>item.textContent.includes('应用修改')).click()`);
  await wait(`document.querySelector('.character-saved')`);
  const characterFiles = () => [...documents.currentSession.documents.values()].flatMap(document => Object.entries(document.files).filter(([path]) => path.startsWith('characters/')));
  assert.equal(JSON.parse(characterFiles()[0][1]).data.narrativeRole, 'main');
  assert.deepEqual(JSON.parse(characterFiles()[0][1]).data.personalRoute, { sceneIds: [], endingIds: [] });
  await invoke(`[...document.querySelectorAll('.character-history button')].find(item=>item.textContent.trim()==='撤销').click()`);
  await wait(`!document.querySelector('.character-manager-list nav button')`); assert.equal(characterFiles().length, 0);
  await invoke(`[...document.querySelectorAll('.character-history button')].find(item=>item.textContent.trim()==='重做').click()`);
  await wait(`document.querySelector('.character-manager-list nav button')`); assert.equal(characterFiles().length, 1);
  report.checks.push('global character draft classification, apply, undo and redo through the real M02 session');
  report.result = 'passed';
} catch (error) { report.error = String(error.stack ?? error); if (window && !window.isDestroyed()) {
  await writeFile(join(output, 'failed.png'), (await window.webContents.capturePage()).toPNG());
  report.ui = await invoke(`document.body.innerText`);
} }
finally {
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report)); window?.destroy(); app.exit(report.result === 'passed' ? 0 : 1);
}
});
