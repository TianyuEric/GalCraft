import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EngineCatalog } from '@galcraft/publishing/engine';
import { ProjectAccess } from '../../../main/project-access.mjs';
import { ProjectDocuments } from '../../../main/document-providers.mjs';
import { StudioAssets } from '../../../main/asset-providers.mjs';
import { StudioBackups } from '../../../main/backup-providers.mjs';
import { StudioHost, registerStudioIpc } from '../../../main/host.mjs';

// Run with Node after building Studio, contracts and documents. The parent cleans up after Electron exits.
const studio = resolve(import.meta.dirname, '../../..'), repo = resolve(studio, '../..');
const testingRoot = resolve(repo, 'tmp/testing'), root = resolve(testingRoot, 'creator-restore'), output = join(repo, 'test-results/latest/creator-restore');
const clean = async () => { assert(root.startsWith(testingRoot + sep) && root === join(testingRoot, 'creator-restore')); await rm(root, { recursive: true, force: true }); };
if (!process.versions.electron) {
  await clean(); await mkdir(join(root, 'temp'), { recursive: true });
  let exitCode = 1;
  try {
    const child = spawn(join(studio, 'node_modules/electron/dist/electron.exe'), [fileURLToPath(import.meta.url)], { cwd: repo, windowsHide: true, stdio: 'inherit', env: { ...process.env, TEMP: join(root, 'temp'), TMP: join(root, 'temp') } });
    exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  } finally { await clean(); }
  process.exit(exitCode);
}
const { app, BrowserWindow, ipcMain, safeStorage } = await import('electron');
await mkdir(root, { recursive: true }); await mkdir(output, { recursive: true });
app.setPath('userData', join(root, 'profile'));
const report = { target: 'CPV-T05', executedAt: new Date().toISOString(), environment: { electron: process.versions.electron, platform: process.platform }, root,
  limitations: ['Native file/directory pickers receive selected local paths. Screenshots and all restore/edit/save operations use the real Electron window, preload, IPC, documents and filesystem.', 'Playtest, publishing and generation are outside this restore acceptance.'], checks: [], result: 'failed' };
const value = result => { if (!result.ok) throw Error(`${result.error.code}: ${result.error.message}`); return result.value; };
let window, documents;
const invoke = expression => window.webContents.executeJavaScript(expression, true);
const wait = async expression => {
  const until = Date.now() + 20000;
  while (Date.now() < until) { if (await invoke(`Boolean(${expression})`)) return; await new Promise(resolve => setTimeout(resolve, 80)); }
  throw Error(`UI did not reach ${expression}`);
};
const click = label => invoke(`(() => {const target=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===${JSON.stringify(label)});if(!target)throw Error('Missing button: '+${JSON.stringify(label)});target.click();})()`);
const capture = async name => { await invoke('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'); await window.webContents.capturePage(); await new Promise(resolve => setTimeout(resolve, 120)); await writeFile(join(output, name), (await window.webContents.capturePage()).toPNG()); };
app.whenReady().then(async () => {
  try {
    const access = new ProjectAccess(), sourceCatalog = new EngineCatalog(join(repo, 'build/desktop'));
    value(await sourceCatalog.resolveEngine('0.1.0', 'windows'));
    documents = new ProjectDocuments(access, undefined, sourceCatalog);
    const source = value(await documents.create({ path: root, name: '备份恢复实际作品', template: 'standard', width: 1280, height: 720, engineVersion: '0.1.0' }));
    const sourceDirectory = documents.currentRoot, originalProject = await readFile(join(sourceDirectory, 'project.json'), 'utf8');
    const backups = new StudioBackups({ userData: app.getPath('userData'), projects: documents, engineCatalog: new EngineCatalog(app.getPath('userData')) });
    const packagePath = join(root, '备份恢复实际作品.galproject');
    const manifest = value(await backups.createBackup({ source: 'saved', destination: packagePath }));
    value(await documents.close(source.sessionId, 'save'));
    window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { preload: join(studio, 'main/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    const host = new StudioHost({ userData: app.getPath('userData'), window, projects: documents, documents, projectAccess: access, assets: new StudioAssets(documents), backups, safeStorage,
      shell: { openPath: async () => '' }, dialog: { showOpenDialog: async (_window, options) => ({ canceled: false, filePaths: options.filters ? [packagePath] : options.title ? [join(repo, 'build/desktop/engines/0.1.0')] : [root] }) } });
    registerStudioIpc(ipcMain, host);
    await window.loadFile(join(studio, 'dist/index.html'));
    await wait(`document.querySelector('.project-welcome')`);
    const begin = async (identity, expectReport = true) => {
      await click('从备份恢复'); await wait(`document.querySelector('.project-restore')`);
      await click('选择备份包'); await wait(`document.querySelector('.restore-file-choice')?.textContent.includes('.galproject')`);
      await click('选择目标位置'); await wait(`document.querySelectorAll('.restore-file-choice')[1]?.textContent.includes(${JSON.stringify(root)})`);
      await invoke(`document.querySelectorAll('input[name="restore-identity"]')[${identity === 'copyNew' ? 1 : 0}].click()`);
      await click('准备恢复并检查依赖'); if (expectReport) await wait(`document.querySelector('.restore-report')`);
    };
    await begin('restoreOriginal');
    assert(await invoke(`[...document.querySelectorAll('button')].find(item=>item.textContent.trim()==='确认恢复并打开').disabled`));
    assert(await invoke(`document.querySelector('.restore-report').textContent.includes('ENGINE_MISSING') || document.querySelector('.restore-report').textContent.includes('Engine 0.1.0')`));
    assert.equal((await host.projectLibrary.listRecent()).value.length, 0);
    await capture('missing-engine.png');
    await click('导入本地目录'); await wait(`document.querySelector('.restore-report').textContent.includes('检查已通过')`);
    await capture('ready-original.png');
    await click('确认恢复并打开'); await wait(`document.querySelector('.authoring-toolbar-host') && !document.querySelector('.project-restore')`);
    assert.equal(documents.currentSession.projectId, source.projectId);
    const originalDirectory = documents.currentRoot;
    const editable = async description => {
      const result = await invoke(`(async()=>{const bridge=window.studioBridge;const listed=await bridge.documents.list();if(!listed.ok)throw Error(listed.error.message);const doc=listed.value.find(item=>item.files['project.json']);const before=JSON.parse(doc.files['project.json']).data.description;const expected=[{ref:{kind:'document',id:doc.documentId},revision:doc.revision}];const plan=await bridge.documents.planEdit({label:'恢复后编辑',origin:'field',expected,preparedAssets:[],requiredRefs:[],patches:[{kind:'json',documentId:doc.documentId,changes:[{op:'set',path:'/data/description',before,after:${JSON.stringify(description)}}]}]});if(!plan.ok)return plan;const applied=await bridge.documents.applyEdit(plan.value.planId,expected);if(!applied.ok)return applied;const save=await bridge.documents.planSave({kind:'all'});return save.ok?bridge.documents.save(save.value.planId):save;})()`);
      value(result); assert.equal(JSON.parse(await readFile(join(documents.currentRoot, 'project.json'), 'utf8')).data.description, description);
    };
    await editable('保留身份恢复后可编辑并保存');
    report.checks.push('missing exact engine blocks commit and recent registration; local real engine import rechecks the original plan; original identity opens through normal project switching and saves an edit');
    await invoke(`document.querySelector('.studio-rail button[aria-label="作品"]').click()`); await wait(`document.querySelector('.project-welcome,.project-restore')`);
    // A completed receipt remains available when returning to the library; start a separate restore.
    if (await invoke(`!!document.querySelector('.project-restore')`)) await click('返回作品库');
    await begin('copyNew', false);
    // The first destination exists; preparation must preserve it and report the collision.
    await wait(`document.querySelector('.project-library-error')`);
    assert.equal(JSON.parse(await readFile(join(originalDirectory, 'project.json'), 'utf8')).data.description, '保留身份恢复后可编辑并保存');
    await invoke(`(() => {const field=document.querySelector('.project-restore input:not([type="radio"])');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(field,'独立恢复作品');field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await click('准备恢复并检查依赖'); await wait(`document.querySelector('.restore-report')?.textContent.includes('检查已通过')`);
    await capture('ready-copy.png');
    await click('确认恢复并打开'); await wait(`document.querySelector('.authoring-toolbar-host') && !document.querySelector('.project-restore')`);
    assert.notEqual(documents.currentSession.projectId, source.projectId);
    await editable('独立副本恢复后可编辑并保存');
    assert.equal(await readFile(join(sourceDirectory, 'project.json'), 'utf8'), originalProject);
    assert.equal(JSON.parse(await readFile(join(originalDirectory, 'project.json'), 'utf8')).data.description, '保留身份恢复后可编辑并保存');
    report.checks.push('existing destination refuses preparation and preserves restored content; independent copy gets a new project identity, opens and saves; source project remains unchanged');
    report.receipts = { packageId: manifest.packageId, sourceProjectId: source.projectId, originalDirectory, copyProjectId: documents.currentSession.projectId, copyDirectory: documents.currentRoot };
    report.result = 'passed'; console.log(JSON.stringify({ result: report.result, checks: report.checks }));
  } catch (error) { report.error = String(error.stack ?? error); if (window && !window.isDestroyed()) { report.visibleText = await invoke('document.body.innerText').catch(() => ''); await capture('failure.png').catch(() => {}); } console.error(report.error); process.exitCode = 1; }
  finally { if (documents?.currentSession) await documents.close(documents.currentSession.sessionId, 'discard').catch(() => {}); await writeFile(join(output, 'acceptance.json'), JSON.stringify(report, null, 2)); if (window && !window.isDestroyed()) window.destroy(); app.exit(report.result === 'passed' ? 0 : 1); }
});
