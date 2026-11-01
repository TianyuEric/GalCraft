import { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, protocol, safeStorage, shell, utilityProcess } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FixtureAsset, FixtureIds, FixtureLock, FixtureProject, FixtureScenes, FixtureTemplate, fixtureId } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { createTemplateDocuments } from '@galcraft/templates';
import { registerResourceScheme, ResourceRegistry } from '@galcraft/media-tools/resources';
import { ProjectAccess } from '../../main/project-access.mjs';
import { ProjectDocuments } from '../../main/document-providers.mjs';
import { StudioAssets } from '../../main/asset-providers.mjs';
import { StudioHost, registerStudioIpc } from '../../main/host.mjs';
import { UtilityTasks } from '../../main/utility-tasks.mjs';
import { CompilerTasks } from '../../main/compiler-tasks.mjs';

const repo = resolve('..', '..');
const studio = resolve('.');
const testing = join(repo, 'tmp', 'testing', 'ig1-authoring');
const projectRoot = join(testing, 'INT-01 春日来信');
const userData = join(testing, 'user-data');
const evidencePath = join(testing, 'int-01-electron.json');
const envelope = (id, data, revision = 1) => JSON.stringify({ schemaVersion: 1, documentId: id, revision, data }, null, 2) + '\n';
const textPatch = (documentId, before, after) => ({ kind: 'text', documentId,
  edits: [{ start: 0, end: before.length, before, after }] });
const v = (documentId, revision) => ({ ref: { kind: 'document', id: documentId }, revision });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
const ids = { project: FixtureIds.projectA, s: FixtureIds.streetDocument, b: FixtureIds.bookshopDocument,
  index: fixtureId(0xb00), role: fixtureId(0xb01), roleDocument: fixtureId(0xb02), asset: fixtureId(0xb03),
  variant: fixtureId(0xb04), first: fixtureId(0xb05), second: fixtureId(0xb06), bStatement: fixtureId(0xb07) };
const sourceS0 = `say {speaker:{kind:"narrator"},text:"S0"} @${ids.first};\n`;
const sourceS1 = `say {speaker:{kind:"character",id:"${ids.role}"},text:"S1"} @${ids.first};\n` +
  `changeBg {op:"show",assetId:"${ids.asset}"} @${ids.second};\n`;
const sourceS2 = sourceS1 + `say {speaker:{kind:"narrator"},text:"S2"} @${fixtureId(0xb08)};\n`;
const sourceB1 = `say {speaker:{kind:"narrator"},text:"B1"} @${ids.bStatement};\n`;
const asset = { ...FixtureAsset, id: ids.asset, name: 'INT 关联背景', originalVariantId: ids.variant, activeVariantId: ids.variant,
  variants: [{ ...FixtureAsset.variants[0], id: ids.variant,
    files: [{ path: 'asset.png', bytes: png.length, mime: 'image/png', role: 'primary' }], entry: 'asset.png',
    metadata: { width: 1, height: 1 } }], sourceName: 'asset.png' };

async function fixture() {
  await rm(projectRoot, { recursive: true, force: true });
  const template = createTemplateDocuments(FixtureTemplate);
  const session = await ProjectSession.createProject(projectRoot, FixtureProject.projectId, [
    { documentId: ids.project, revision: 1, format: 'json', files: { 'project.json': envelope(ids.project, FixtureProject) } },
    { documentId: fixtureId(0xb09), revision: 1, format: 'json', files: { 'dependencies.lock.json': envelope(fixtureId(0xb09), FixtureLock) } },
    { documentId: ids.index, revision: 1, format: 'json', files: { 'assets/index.json': envelope(ids.index, { assets: [] }) } },
    { documentId: ids.s, revision: 10, format: 'dsl', files: {
      [`scenes/${FixtureIds.street}/scene.json`]: envelope(ids.s, FixtureScenes[0], 10),
      [`scenes/${FixtureIds.street}/script.gal`]: sourceS0 } },
    { documentId: ids.b, revision: 1, format: 'dsl', files: {
      [`scenes/${FixtureIds.bookshop}/scene.json`]: envelope(ids.b, FixtureScenes[1]),
      [`scenes/${FixtureIds.bookshop}/script.gal`]: '' } },
    ...template,
  ]);
  await session.dispose('saved');
  await mkdir(join(projectRoot, 'assets', 'files', ids.asset, ids.variant), { recursive: true });
  await writeFile(join(projectRoot, 'assets', 'files', ids.asset, ids.variant, 'asset.png'), png);
}

async function waitFor(window, expression, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await window.webContents.executeJavaScript(expression, true);
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`UI wait expired: ${expression}`);
}

await mkdir(userData, { recursive: true });
app.setPath('userData', userData);
registerResourceScheme(protocol);
app.whenReady().then(async () => {
  const evidence = { caseId: 'INT-01', projectRoot, ids, stages: [], renderer: null, error: null };
  let window;
  try {
    await fixture();
    const resources = new ResourceRegistry(); resources.install(protocol);
    window = new BrowserWindow({ show: false, width: 1440, height: 900,
      webPreferences: { preload: join(studio, 'main', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.webContents.on('render-process-gone', (_event, value) => { evidence.renderer = value; });
    const operations = new UtilityTasks({ utilityProcess, MessageChannelMain });
    const language = new CompilerTasks(operations);
    const projectAccess = new ProjectAccess();
    const documents = new ProjectDocuments(projectAccess);
    const assets = new StudioAssets(documents, join(repo, 'tools', 'media', 'bin'), undefined, operations, resources, join(userData, 'models'));
    const inputDialog = { ...dialog, showOpenDialog: async () => ({ canceled: false, filePaths: [projectRoot] }) };
    const host = new StudioHost({ userData, dialog: inputDialog, shell, safeStorage, window, operations,
      projectAccess, projects: documents, documents, assets, language });
    const hostCall = host.call.bind(host);
    host.call = async (...args) => { const tracked = args[0] === 'projects' || args[0] === 'authoringPreferences';
      const item = tracked ? { group: args[0], method: args[1], completed: false } : null;
      if (item) (evidence.projectCalls ??= []).push(item);
      const result = await hostCall(...args);
      if (item) Object.assign(item, { completed: true, ok: result.ok, value: result.value ?? null, error: result.error ?? null });
      return result; };
    registerStudioIpc(ipcMain, host);
    await window.loadFile(join(studio, 'dist', 'index.html'));
    await waitFor(window, `document.querySelector('.authoring-projects button')?.textContent`);
    await window.webContents.executeJavaScript(`document.querySelector('.authoring-projects button').click()`);
    await waitFor(window, `Boolean(document.querySelector('.authoring-editor'))`);
    evidence.stages.push({ name: 'openStudio', ui: await window.webContents.executeJavaScript(`({project:document.querySelector('.authoring-toolbar strong')?.textContent, bridge:typeof window.studioBridge})`) });
    const groups = await window.webContents.executeJavaScript(`(async () => {
      const b = window.studioBridge; const ids = ${JSON.stringify(ids)};
      const apply = async input => { const plan = await b.documents.planEdit(input); if (!plan.ok) return { plan };
        const applied = await b.documents.applyEdit(plan.value.planId, input.expected); return { plan, applied }; };
      const role = { id:ids.role,name:'新角色',narrativeRole:'character',description:'',avatar:null,
        canvas:{width:1920,height:1080,anchorX:0.5,anchorY:1},appearance:{referenceAssets:[],costume:'',notes:''},groups:[],
        defaultEffects:${JSON.stringify(FixtureTemplate ? { x:0,y:0,scaleX:1,scaleY:1,rotationDeg:0,opacity:1,blur:0,brightness:1,contrast:1,saturation:1,gamma:1,rgb:[255,255,255],bloom:{intensity:0,brightness:1,blur:0,threshold:0},bevel:{opacity:0,thickness:0,rotationDeg:0,softness:0,rgb:[255,255,255]},filters:{oldFilm:false,dot:false,reflection:false,glitch:false,rgbSplit:false,godray:false},blend:'normal',z:0 } : {})},
        voicePresets:{},defaultVoicing:'intentionalSilent'};
      const g1 = await apply({label:'g1 S/R/A',origin:'batch',expected:[${JSON.stringify(v(ids.s,10))},${JSON.stringify(v(ids.index,1))}],
        patches:[${JSON.stringify(textPatch(ids.s,sourceS0,sourceS1))},
          {kind:'document',documentId:ids.roleDocument,op:'create',before:null,
            after:{format:'json',files:{['characters/'+ids.role+'.json']:JSON.stringify({schemaVersion:1,documentId:ids.roleDocument,revision:1,data:role},null,2)+'\\n'}}},
          {kind:'json',documentId:ids.index,changes:[{path:'/data/assets',before:[],after:[${JSON.stringify(asset)}],op:'set'}]}],
        preparedAssets:[],requiredRefs:[]});
      if (!g1.applied?.ok) return {g1};
      const g2 = await apply({label:'g2 R',origin:'field',expected:[${JSON.stringify(v(ids.roleDocument,1))}],
        patches:[{kind:'json',documentId:ids.roleDocument,changes:[{path:'/data/description',before:'',after:'R2',op:'set'}]}],preparedAssets:[],requiredRefs:[]});
      const g3 = await apply({label:'g3 B',origin:'script',expected:[${JSON.stringify(v(ids.b,1))}],
        patches:[${JSON.stringify(textPatch(ids.b,'',sourceB1))}],preparedAssets:[],requiredRefs:[]});
      const g4 = await apply({label:'g4 S',origin:'script',expected:[${JSON.stringify(v(ids.s,11))}],
        patches:[${JSON.stringify(textPatch(ids.s,sourceS1,sourceS2))}],preparedAssets:[],requiredRefs:[]});
      const plan = await b.documents.planSave({kind:'current',documentId:ids.s});
      const query = await b.assets.query({kind:'image',folder:null,characterId:null,sceneId:null,locale:null,search:'INT 关联背景',tags:[],
        reference:'any',review:'any',sort:'name',direction:'asc',offset:0,limit:40,indexRevision:null});
      return {g1,g2,g3,g4,plan,query};
    })()`, true);
    evidence.stages.push({ name: 'groupsAndScope', value: groups });
    const saveClicked = await window.webContents.executeJavaScript(`window.__ig1Confirmations=[];
      window.confirm=message=>{window.__ig1Confirmations.push(message);return true};
      (()=>{const button=[...document.querySelectorAll('.authoring-toolbar button')].find(x=>x.textContent==='保存当前');button?.click();return Boolean(button)})()`);
    if (!saveClicked) throw new Error('Studio 当前保存按钮不存在');
    await waitFor(window, `(async()=>{const x=await window.studioBridge.documents.list();const d=x.value?.find(y=>y.documentId==='${ids.s}');return d&&!d.dirty})()`);
    const savePrompt = await window.webContents.executeJavaScript(`window.__ig1Confirmations[0]`);
    if (!savePrompt?.includes('街角') || !savePrompt.includes(ids.role) || !savePrompt.includes('assets/index.json') ||
      savePrompt.includes('书店') || !savePrompt.includes('另有未保存内容')) throw new Error('P02 保存范围提示未显示 S/R/A 与额外关联成员');
    evidence.stages.push({ name: 'saveCurrent', documents: await window.webContents.executeJavaScript(`window.studioBridge.documents.list()`, true),
      ui: await window.webContents.executeJavaScript(`document.querySelector('.authoring-status-detail')?.textContent`), prompt: savePrompt });
    const undo = await window.webContents.executeJavaScript(`(async()=>{const b=window.studioBridge;
      const plan=await b.documents.planUndo('${ids.s}','${groups.g1.applied.value.operationId}');
      const undone=plan.ok?await b.documents.undo(plan.value.planId):null;
      return {plan,undone,documents:await b.documents.list()};})()`, true);
    evidence.stages.push({ name: 'undoG1', value: undo });
    if (!undo.undone?.ok || undo.plan.value.reverseOrder.length !== 3) throw new Error('g1 dependency undo did not include g4/g2/g1');
    const afterUndo = new Map(undo.documents.value.map(item => [item.documentId, item]));
    if (afterUndo.get(ids.s)?.files[`scenes/${FixtureIds.street}/script.gal`] !== sourceS0 ||
      Object.keys(afterUndo.get(ids.roleDocument)?.files ?? {}).length !== 0 ||
      JSON.parse(afterUndo.get(ids.index).files['assets/index.json']).data.assets.length !== 0 ||
      !afterUndo.get(ids.b)?.dirty) throw new Error('g1 dependency undo changed an unrelated document or retained a dependent edit');
    const redo = await window.webContents.executeJavaScript(`(async()=>{const b=window.studioBridge;
      const redone=await b.documents.redo('${undo.plan.value.planId}');
      return {redone,documents:await b.documents.list()};})()`, true);
    evidence.stages.push({ name: 'redoGroup', value: redo });
    if (!redo.redone?.ok) throw new Error('g1 dependency redo failed');
    const afterRedo = new Map(redo.documents.value.map(item => [item.documentId, item]));
    if (afterRedo.get(ids.s)?.files[`scenes/${FixtureIds.street}/script.gal`] !== sourceS2 ||
      !afterRedo.get(ids.roleDocument)?.files[`characters/${ids.role}.json`] || !afterRedo.get(ids.b)?.dirty)
      throw new Error('g1 dependency redo did not restore the complete group');
    await window.webContents.executeJavaScript(`window.confirm=()=>true; [...document.querySelectorAll('.authoring-toolbar button')].find(x=>x.textContent==='保存全部')?.click()`);
    await waitFor(window, `(async()=>{const x=await window.studioBridge.documents.list();return x.value?.every(y=>!y.dirty)})()`);
    await waitFor(window, `document.querySelector('.authoring-editor > .authoring-toolbar span')?.textContent==='已保存'`);
    const beforeClose = await window.webContents.executeJavaScript(`window.studioBridge.documents.list()`, true);
    const beforeSessionId = documents.currentSessionId;
    await window.webContents.executeJavaScript(`[...document.querySelectorAll('.authoring-header button')].find(x=>x.textContent==='作品')?.click()`);
    await waitFor(window, `Boolean(document.querySelector('.authoring-projects'))`);
    const p01Clicked = await window.webContents.executeJavaScript(`(()=>{const button=[...document.querySelectorAll('.authoring-projects button')].find(x=>x.textContent==='选择目录');button?.click();return Boolean(button)})()`);
    if (!p01Clicked) throw new Error('P01 选择目录入口不存在');
    await waitFor(window, `Boolean(document.querySelector('dialog.authoring-command-dialog[open]'))`);
    const closePrompt = await window.webContents.executeJavaScript(`document.querySelector('dialog.authoring-command-dialog')?.textContent`);
    await window.webContents.executeJavaScript(`[...document.querySelectorAll('dialog.authoring-command-dialog button')].find(x=>x.textContent==='保存全部')?.click()`);
    await waitFor(window, `Boolean(document.querySelector('.authoring-editor'))`);
    const afterSessionId = documents.currentSessionId;
    if (!beforeSessionId || !afterSessionId || beforeSessionId === afterSessionId) throw new Error('P01 未关闭并重开 M02 会话');
    evidence.stages.push({ name: 'saveAllReopen', beforeClose, p01: { clicked: p01Clicked, closePrompt, beforeSessionId, afterSessionId,
      project: await window.webContents.executeJavaScript(`document.querySelector('.authoring-toolbar strong')?.textContent`) }, afterReopen: documents.list(),
      disk: { scene: await readFile(join(projectRoot,'scenes',FixtureIds.street,'script.gal'),'utf8'),
        role: await readFile(join(projectRoot,'characters',ids.role+'.json'),'utf8'),
        assetIndex: await readFile(join(projectRoot,'assets','index.json'),'utf8'),
        other: await readFile(join(projectRoot,'scenes',FixtureIds.bookshop,'script.gal'),'utf8') } });
    await documents.close(afterSessionId, 'save');
  } catch (error) { evidence.error = String(error);
    if (window && !window.isDestroyed()) {
      evidence.failureState = await window.webContents.executeJavaScript(`(async()=>({
        notice:document.querySelector('.authoring-notice')?.textContent,
        page:document.querySelector('.authoring-shell')?.textContent?.slice(0,1000),
        dialogs:[...document.querySelectorAll('dialog')].map(x=>({open:x.open,text:x.textContent})),
        toolbar:[...document.querySelectorAll('.authoring-toolbar button')].map(x=>x.textContent),
        documents:await window.studioBridge.documents.list()
      }))()`, true).catch(value => ({ error: String(value) }));
    }
  }
  finally {
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
    window?.destroy(); app.exit(evidence.error ? 1 : 0);
  }
});
