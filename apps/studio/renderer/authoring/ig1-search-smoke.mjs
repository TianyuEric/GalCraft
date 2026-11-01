import { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, protocol, safeStorage, shell, utilityProcess } from 'electron';
import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FixtureAsset, FixtureCharacters, FixtureIds, FixtureLock, FixtureProject, FixtureScenes, FixtureTemplate, FixtureVariables, fixtureId } from '@galcraft/contracts/fixtures';
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
const projectRoot = join(testing, `INT-13 F-SEARCH ${Date.now()}`);
const userData = join(testing, 'int-13-user-data');
const evidencePath = join(testing, 'int-13-electron.json');
const ids = { project: FixtureIds.projectB, firstScene: FixtureIds.street, secondScene: FixtureIds.bookshop,
  firstDoc: FixtureIds.streetDocument, secondDoc: FixtureIds.bookshopDocument, index: fixtureId(0xc00),
  charA: fixtureId(0xc01), charB: fixtureId(0xc02), localA: fixtureId(0xc03), localB: fixtureId(0xc04),
  progress: fixtureId(0xc05), progressDoc: fixtureId(0xc06), assetA: fixtureId(0xc07), assetB: fixtureId(0xc08),
  oldVariant: fixtureId(0xc09), newVariant: fixtureId(0xc0a), otherVariant: fixtureId(0xc0b),
  sayA: fixtureId(0xc0c), sayB: fixtureId(0xc0d), background: fixtureId(0xc0e), writeA: fixtureId(0xc0f),
  writeB: fixtureId(0xc10), bgmStop: fixtureId(0xc11), moved: fixtureId(0xc12), bad: fixtureId(0xc13),
  call: fixtureId(0xc17), returned: fixtureId(0xc18), bgmPlay: fixtureId(0xc19), style: fixtureId(0xc1a), music: fixtureId(0xc1b), musicVariant: fixtureId(0xc1c) };
const envelope = (id, data, revision = 1) => JSON.stringify({ schemaVersion: 1, documentId: id, revision, data }, null, 2) + '\n';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
const sceneA = { ...FixtureScenes[0], locals: [{ id: ids.localA, name: 'x', type: 'number', scope: 'local', initial: 0 }] };
const sceneB = { ...FixtureScenes[1], locals: [{ id: ids.localB, name: 'x', type: 'number', scope: 'local', initial: 0 }],
  parameters: [{ variableId: ids.localB, required: true, defaultValue: null }], returns: 'number' };
const project = { ...FixtureProject, projectId: ids.project, name: 'F-SEARCH 语义身份' };
const charA = { ...FixtureCharacters[0], id: ids.charA, name: '杏', defaultVoicing: 'intentionalSilent' };
const charB = { ...FixtureCharacters[0], id: ids.charB, name: '杏', defaultVoicing: 'intentionalSilent' };
const variable = { ...FixtureVariables[0], id: ids.progress, name: 'x' };
const makeVariant = (id, role, parentId) => ({ ...FixtureAsset.variants[0], id, role, parentId,
  files: [{ path: 'asset.png', bytes: png.length, mime: 'image/png', role: 'primary' }], entry: 'asset.png', metadata: { width: 1, height: 1 } });
const assetA = { ...FixtureAsset, id: ids.assetA, name: '同名背景', originalVariantId: ids.oldVariant, activeVariantId: ids.newVariant,
  variants: [makeVariant(ids.oldVariant, 'original', null), makeVariant(ids.newVariant, 'compatible', ids.oldVariant)], sourceName: 'asset.png' };
const assetB = { ...FixtureAsset, id: ids.assetB, name: '同名背景', originalVariantId: ids.otherVariant, activeVariantId: ids.otherVariant,
  variants: [makeVariant(ids.otherVariant, 'original', null)], sourceName: 'asset.png' };
const say = (speaker, text, id) => `say {speaker:{kind:"character",id:"${speaker}"},text:${JSON.stringify(text)},voice:null} @${id};\n`;
const sourceA = say(ids.charA, `杏 A {{progress["${ids.progress}"]}}`, ids.sayA) +
  `setVar {variableId:"${ids.localA}",op:"add",value:1} @${ids.writeA};\n` +
  `changeBg {op:"show",assetId:"${ids.assetA}"} @${ids.background};\n` +
  `callScene {sceneId:"${ids.secondScene}",parameters:{"${ids.localB}":expr("progress[\\"${ids.progress}\\"] + 1")},receiver:{scope:"progress",variableId:"${ids.progress}"}} @${ids.call};\n` +
  `bgm {op:"play",assetId:"${ids.music}"} @${ids.bgmPlay};\n`;
const sourceB = say(ids.charB, '杏 B', ids.sayB) +
  `setVar {variableId:"${ids.localB}",op:"assign",value:2} @${ids.writeB};\n` +
  `bgm {op:"stop"} @${ids.bgmStop};\n` +
  `return {value:expr("local[\\"${ids.localB}\\"]")} @${ids.returned};\n`;
const template = structuredClone(FixtureTemplate);
template.pages[0].root.normal.images = { background: { assetId: ids.assetA, variantId: ids.oldVariant,
  mode: 'cover', positionX: 0.5, positionY: 0.5, colorMode: 'original', tint: null, opacity: 1, slices: null, borders: null, fillCenter: true } };
template.styles.push({ id: ids.style, name: 'F-SEARCH CSS resource', scope: { pageId: template.pages[0].id, componentId: null },
  language: 'css', sourcePath: `ui/styles/${ids.style}.css`, sourceRevision: 1, compiledPath: null, compiledSourceRevision: null,
  assets: [ids.assetB], issues: [] });
const assert = (value, message) => { if (!value) throw new Error(message); };
const conciseDocuments = result => result.ok ? result.value.filter(d => [ids.firstDoc, ids.secondDoc, ids.index].includes(d.documentId))
  .map(d => ({ id: d.documentId, revision: d.revision, savedRevision: d.savedRevision, dirty: d.dirty })) : result;
async function fixture() {
  const musicPath = join(repo,'apps/studio/resources/practice/music/spring-01.opus');
  const music = { ...FixtureAsset, id: ids.music, name: '搜索背景音乐', kind: 'audio', sourceName: 'spring-01.opus',
    originalVariantId: ids.musicVariant, activeVariantId: ids.musicVariant, variants: [{ ...FixtureAsset.variants[0], id: ids.musicVariant,
      entry: 'spring-01.opus', metadata: {}, files: [{ path: 'spring-01.opus', bytes: (await stat(musicPath)).size, mime: 'audio/ogg', role: 'primary' }] }] };
  const session = await ProjectSession.createProject(projectRoot, ids.project, [
    { documentId: ids.project, revision: 1, format: 'json', files: { 'project.json': envelope(ids.project, project) } },
    { documentId: fixtureId(0xc14), revision: 1, format: 'json', files: { 'dependencies.lock.json': envelope(fixtureId(0xc14), FixtureLock) } },
    { documentId: ids.index, revision: 1, format: 'json', files: { 'assets/index.json': envelope(ids.index, { assets: [assetA, assetB, music] }) } },
    { documentId: ids.firstDoc, revision: 1, format: 'dsl', files: { [`scenes/${ids.firstScene}/scene.json`]: envelope(ids.firstDoc, sceneA), [`scenes/${ids.firstScene}/script.gal`]: sourceA } },
    { documentId: ids.secondDoc, revision: 1, format: 'dsl', files: { [`scenes/${ids.secondScene}/scene.json`]: envelope(ids.secondDoc, sceneB), [`scenes/${ids.secondScene}/script.gal`]: sourceB } },
    { documentId: fixtureId(0xc15), revision: 1, format: 'json', files: { [`characters/${ids.charA}.json`]: envelope(fixtureId(0xc15), charA) } },
    { documentId: fixtureId(0xc16), revision: 1, format: 'json', files: { [`characters/${ids.charB}.json`]: envelope(fixtureId(0xc16), charB) } },
    { documentId: ids.progressDoc, revision: 1, format: 'json', files: { [`variables/${ids.progress}.json`]: envelope(ids.progressDoc, variable) } },
    ...createTemplateDocuments(template),
    { documentId: ids.style, revision: 1, format: 'json', files: { [`ui/styles/${ids.style}.json`]: envelope(ids.style, { id: ids.style }),
      [`ui/styles/${ids.style}.css`]: `[data-gc-part="page-root"] { background-image: url("asset:${ids.assetB}"); }` } },
  ]);
  await session.dispose('saved');
  const musicDirectory = join(projectRoot, 'assets/files', ids.music, ids.musicVariant);
  await mkdir(musicDirectory,{recursive:true}); await copyFile(musicPath,join(musicDirectory,'spring-01.opus'));
  for (const [assetId, variantIds] of [[ids.assetA, [ids.oldVariant, ids.newVariant]], [ids.assetB, [ids.otherVariant]]])
    for (const variantId of variantIds) { const path = join(projectRoot, 'assets', 'files', assetId, variantId);
      await mkdir(path, { recursive: true }); await writeFile(join(path, 'asset.png'), png); }
}
async function waitFor(window, expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { const value = await window.webContents.executeJavaScript(expression, true);
    if (value) return value; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(`UI wait expired: ${expression}`);
}
await mkdir(userData, { recursive: true });
app.setPath('userData', userData);
registerResourceScheme(protocol);
app.whenReady().then(async () => {
  const evidence = { caseId: 'INT-13', projectRoot, ids, stages: [], renderer: null, error: null };
  let window, documents;
  try {
    await fixture();
    const resources = new ResourceRegistry(); resources.install(protocol);
    window = new BrowserWindow({ show: false, width: 1440, height: 900,
      webPreferences: { preload: join(studio, 'main', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.webContents.on('render-process-gone', (_event, value) => { evidence.renderer = value; });
    const operations = new UtilityTasks({ utilityProcess, MessageChannelMain });
    const language = new CompilerTasks(operations);
    const projectAccess = new ProjectAccess(); documents = new ProjectDocuments(projectAccess);
    const assets = new StudioAssets(documents, join(repo, 'tools', 'media', 'bin'), undefined, operations, resources, join(userData, 'models'));
    const inputDialog = { ...dialog, showOpenDialog: async () => ({ canceled: false, filePaths: [projectRoot] }) };
    registerStudioIpc(ipcMain, new StudioHost({ userData, dialog: inputDialog, shell, safeStorage, window, operations,
      projectAccess, projects: documents, documents, assets, language }));
    await window.loadFile(join(studio, 'dist', 'index.html'));
    await waitFor(window, `document.querySelector('.authoring-projects button')?.textContent`);
    await window.webContents.executeJavaScript(`document.querySelector('.authoring-projects button').click()`);
    await waitFor(window, `Boolean(document.querySelector('.authoring-editor'))`);
    evidence.stages.push({ name: 'open', ui: await window.webContents.executeJavaScript(`({project:document.querySelector('.authoring-toolbar strong')?.textContent,
      sceneButtons:[...document.querySelectorAll('.authoring-nav button')].map(x=>x.textContent)})`), documents: conciseDocuments(documents.list()) });
    const searched = await window.webContents.executeJavaScript(`(async()=>{
      const panel=document.querySelector('.authoring-nav details');panel.open=true;
      const mode=panel.querySelector('select');mode.value='dialogue';mode.dispatchEvent(new Event('change',{bubbles:true}));
      const p=document.querySelector('.authoring-nav details');p.open=true;
      const selects=p.querySelectorAll('select');const target=selects[1];target.value='${ids.charA}';target.dispatchEvent(new Event('change',{bubbles:true}));
      [...p.querySelectorAll('button')].find(x=>x.textContent==='搜索')?.click();return [...target.options].map(x=>({text:x.textContent,id:x.value}));})()`, true);
    await waitFor(window, `document.querySelector('.authoring-nav details')?.textContent?.includes('1 results')`);
    const searchUi = await window.webContents.executeJavaScript(`({text:document.querySelector('.authoring-nav details')?.textContent,
      status:document.querySelector('.authoring-status-detail')?.textContent})`);
    assert(searched.filter(x=>x.text==='杏').length===2, 'same-name character choices not distinct');
    assert(searchUi.text.includes('1 results') && searchUi.text.includes('杏 A'), 'character A search mismatch');
    evidence.stages.push({ name: 'identitySearch', choices: searched, ui: searchUi, documents: conciseDocuments(documents.list()) });
    const filters = [
      { kind: 'variable', id: ids.localA, scope: 'local', declaringSceneId: ids.firstScene, access: 'both' },
      { kind: 'variable', id: ids.localB, scope: 'local', declaringSceneId: ids.secondScene, access: 'both' },
      { kind: 'variable', id: ids.progress, scope: 'progress', declaringSceneId: null, access: 'both' },
      { kind: 'bgm', assetId: ids.music, includeChannelStops: true },
      { kind: 'asset', id: ids.assetA }, { kind: 'asset', id: ids.assetB },
    ];
    const queries = await window.webContents.executeJavaScript(`(async()=>{const b=window.studioBridge;
      const docs=(await b.documents.list()).value;const results=[];
      for(const filter of ${JSON.stringify(filters)})results.push(await b.language.querySemantic({projectId:'${ids.project}',requestId:crypto.randomUUID(),
        expected:docs.map(d=>({ref:{kind:'document',id:d.documentId},revision:d.revision})),expectedLock:${JSON.stringify(FixtureLock)},sceneIds:[],offset:0,limit:100,filter}));return results;})()`, true);
    evidence.stages.push({ name: 'referenceSets', queries });
    assert(queries.every(q=>q.ok), 'semantic reference query failed');
    assert(queries[0].value.coverage.every(item=>item.state==='complete'), 'valid fixture does not have complete coverage');
    const keys = q => q.value.items.map(hit=>`${hit.source.statementId}:${hit.source.field}:${[...hit.uses].sort().join(',')}`).sort();
    const exact = (q, expected) => assert(JSON.stringify(keys(q)) === JSON.stringify(expected.sort()), `reference set mismatch: ${JSON.stringify(keys(q))}`);
    exact(queries[0], [`${ids.writeA}:variableId:read,write`]);
    exact(queries[1], [`${ids.call}:parameters.${ids.localB}:write`, `${ids.writeB}:variableId:write`, `${ids.returned}:value:read`]);
    exact(queries[2], [`${ids.sayA}:text:read`, `${ids.call}:parameters.${ids.localB}:read`, `${ids.call}:receiver.variableId:write`]);
    exact(queries[3], [`${ids.bgmPlay}:assetId:assetUse,bgmPlay`, `${ids.bgmStop}:op:bgmStop`]);
    assert(queries[3].value.items.find(h=>h.binding==='channel')?.subject===null, 'BGM stop incorrectly bound to an asset');
    assert(queries[4].value.items.some(h=>h.sceneId===null && h.source.documentId===template.pages[0].id), 'page reference missing');
    assert(queries[5].value.items.some(h=>h.sceneId===null && h.source.field.includes('/styles/0/assets/0')), 'CSS declared resource missing');
    const pageDisk=JSON.parse(await readFile(join(projectRoot,`ui/pages/${template.pages[0].id}.json`),'utf8'));
    assert(pageDisk.data.root.normal.images.background.variantId===ids.oldVariant, 'page did not preserve exact old variant');
    const assetQuery = await window.webContents.executeJavaScript(`(async()=>{const b=window.studioBridge;
      const q=await b.assets.query({kind:'image',folder:null,characterId:null,sceneId:null,locale:null,search:'同名背景',tags:[],reference:'any',review:'any',sort:'name',direction:'asc',offset:0,limit:40,indexRevision:null});
      const old=await b.assets.describe({assetIds:['${ids.assetA}','${ids.assetB}'],indexRevision:q.value.indexRevision,currentAssetId:'${ids.assetA}',currentVariantId:'${ids.oldVariant}'});
      const preview=await b.assets.preview('${ids.assetA}','${ids.oldVariant}');await b.assets.stopPreview();
      return {query:q,old,preview:{ok:preview.ok,mime:preview.value?.mime,uri:preview.value?.uri}};})()`, true);
    assert(assetQuery.query.ok && assetQuery.query.value.total===2, 'same-name assets not distinct');
    assert(assetQuery.old.ok && assetQuery.old.value.items[0].shownVariant.id===ids.oldVariant && !assetQuery.old.value.items[0].shownVariant.active, 'old variant not distinguishable');
    assert(assetQuery.preview.ok, 'old variant preview failed');
    evidence.stages.push({ name: 'oldVariant', value: assetQuery });
    await window.webContents.executeJavaScript(`[...document.querySelectorAll('.authoring-header button')].find(x=>x.textContent==='素材')?.click()`);
    await waitFor(window, `Boolean(document.querySelector('.authoring-asset-list .authoring-asset'))`);
    await window.webContents.executeJavaScript(`document.querySelector('.authoring-asset-list img[data-asset-id="${ids.assetA}"]')?.closest('.authoring-asset')?.querySelector('button')?.click()`);
    await waitFor(window, `Boolean([...document.querySelectorAll('.authoring-assets .authoring-panel')].find(x=>x.textContent?.includes('${ids.oldVariant}')))`);
    await window.webContents.executeJavaScript(`(()=>{const detail=[...document.querySelectorAll('.authoring-assets .authoring-panel')].find(x=>x.textContent?.includes('${ids.oldVariant}'));
      [...detail.querySelectorAll('.authoring-field')].find(x=>x.textContent?.includes('${ids.oldVariant}'))?.querySelector('button')?.click()})()`);
    await waitFor(window, `Boolean(document.querySelector('.authoring-assets img[src*="${ids.oldVariant}"]'))`);
    evidence.stages.push({ name: 'oldVariantUi', ui: await window.webContents.executeJavaScript(`({detail:[...document.querySelectorAll('.authoring-assets .authoring-panel')].find(x=>x.textContent?.includes('${ids.oldVariant}'))?.textContent,
      preview:document.querySelector('.authoring-assets img[src*="${ids.oldVariant}"]')?.getAttribute('src')})`) });
    await window.webContents.executeJavaScript(`[...document.querySelectorAll('.authoring-header button')].find(x=>x.textContent==='创作')?.click()`);
    await waitFor(window, `Boolean(document.querySelector('.authoring-editor'))`);
    await window.webContents.executeJavaScript(`[...document.querySelectorAll('.authoring-nav button')].find(x=>x.textContent==='书店')?.click()`);
    await waitFor(window, `Boolean(document.querySelector('[data-statement-id="${ids.sayB}"]'))`);
    await window.webContents.executeJavaScript(`document.querySelector('[data-statement-id="${ids.sayB}"]')?.click()`);
    await waitFor(window, `document.querySelector('.authoring-card.selected')?.dataset.statementId==='${ids.sayB}'`);
    const hitNavigation = await window.webContents.executeJavaScript(`(async()=>{const p=document.querySelector('.authoring-nav details');
      const hit=[...p.querySelectorAll('button')].find(x=>x.textContent?.includes('杏 A'));hit?.click();
      await new Promise(resolve=>setTimeout(resolve,300));
      const located=document.querySelector('.authoring-card.selected')?.dataset.statementId;
      [...document.querySelectorAll('.authoring-nav details button')].find(x=>x.textContent==='返回原位置')?.click();
      return {located,returnButton:Boolean([...document.querySelectorAll('.authoring-nav details button')].find(x=>x.textContent==='返回原位置')),
        scene:[...document.querySelectorAll('.authoring-nav button.selected')].map(x=>x.textContent),
        selected:document.querySelector('.authoring-card.selected')?.dataset.statementId??null};})()`, true);
    evidence.stages.push({ name: 'navigateAndReturn', value: hitNavigation });
    assert(hitNavigation.located===ids.sayA, 'search result did not locate stable ID');
    assert(hitNavigation.returnButton===false && hitNavigation.scene.includes('书店') && hitNavigation.selected===ids.sayB,
      'search return did not restore origin scene and selection');
    assert(documents.list().value.every(d=>!d.dirty), 'read-only search modified documents');
    await window.webContents.executeJavaScript(`[...document.querySelectorAll('.authoring-nav details button')].find(x=>x.textContent?.includes('杏 A'))?.click()`);
    await waitFor(window, `document.querySelector('.authoring-card.selected')?.dataset.statementId==='${ids.sayA}'`);
    const moveClicked = await window.webContents.executeJavaScript(`(()=>{const select=document.querySelector('.authoring-center .authoring-toolbar select[aria-label="Move selected to scene"]');
      if(!select)return false;select.value='${ids.secondScene}';
      const button=[...document.querySelectorAll('.authoring-center .authoring-toolbar button')].find(x=>x.textContent==='移至场景');button?.click();return Boolean(button)})()`);
    assert(moveClicked, 'cross-scene move button unavailable');
    await waitFor(window, `(async()=>{const x=await window.studioBridge.documents.list();return x.ok&&x.value.find(d=>d.documentId==='${ids.secondDoc}')?.files['scenes/${ids.secondScene}/script.gal']?.includes('${ids.sayA}')})()`);
    await waitFor(window, `(async()=>{const x=await window.studioBridge.authoringPreferences.readWorkspace('${ids.project}');return x.ok&&x.value?.caret.statementId==='${ids.sayA}'&&x.value.sceneId==='${ids.secondScene}'})()`, 5000);
    evidence.stages.push({ name: 'moveStableId', workspace: await window.webContents.executeJavaScript(`window.studioBridge.authoringPreferences.readWorkspace('${ids.project}')`, true),
      documents: conciseDocuments(documents.list()) });
    await window.webContents.executeJavaScript(`window.confirm=()=>true;[...document.querySelectorAll('.authoring-toolbar button')].find(x=>x.textContent==='保存全部')?.click()`);
    await waitFor(window, `(async()=>{const x=await window.studioBridge.documents.list();return x.ok&&x.value.every(d=>!d.dirty)})()`);
    await documents.close(documents.currentSessionId,'save');
    await window.loadFile(join(studio, 'dist', 'index.html'));
    await waitFor(window, `Boolean(document.querySelector('.authoring-projects button'))`);
    await window.webContents.executeJavaScript(`document.querySelector('.authoring-projects button').click()`);
    await waitFor(window, `Boolean(document.querySelector('.authoring-editor'))`);
    const reopened = await window.webContents.executeJavaScript(`(async()=>({scene:[...document.querySelectorAll('.authoring-nav button.selected')].map(x=>x.textContent),
      selected:document.querySelector('.authoring-card.selected')?.dataset.statementId??null,
      source:(await window.studioBridge.documents.list()).value?.find(d=>d.documentId==='${ids.secondDoc}')?.files['scenes/${ids.secondScene}/script.gal']}))()`, true);
    assert(reopened.selected===ids.sayA && reopened.source.includes(ids.sayA), 'reopen did not follow moved stable ID');
    evidence.stages.push({ name: 'reopenMoved', value: reopened, documents: conciseDocuments(documents.list()) });
    const beforeBad = reopened.source;
    const afterBad = beforeBad + `say {text: @${ids.bad};\n`;
    const badEdit = await window.webContents.executeJavaScript(`(async()=>{const b=window.studioBridge;
      const before=${JSON.stringify(beforeBad)},after=${JSON.stringify(afterBad)};
      const input={label:'F-SEARCH invalid DSL',origin:'script',expected:[{ref:{kind:'document',id:'${ids.secondDoc}'},revision:2}],
        patches:[{kind:'text',documentId:'${ids.secondDoc}',edits:[{start:0,end:before.length,before,after}]}],preparedAssets:[],requiredRefs:[]};
      const plan=await b.documents.planEdit(input);const applied=plan.ok?await b.documents.applyEdit(plan.value.planId,input.expected):null;
      const save=await b.documents.planSave({kind:'all'});const saved=save.ok?await b.documents.save(save.value.planId):null;
      return {plan:{ok:plan.ok},applied,saved};})()`, true);
    assert(badEdit.applied?.ok && badEdit.saved?.ok, 'invalid source not saved by M02');
    await documents.close(documents.currentSessionId,'save');
    await window.loadFile(join(studio, 'dist', 'index.html'));
    await waitFor(window, `Boolean(document.querySelector('.authoring-projects button'))`);
    await window.webContents.executeJavaScript(`document.querySelector('.authoring-projects button').click()`);
    await waitFor(window, `Boolean(document.querySelector('.authoring-editor'))`);
    await waitFor(window, `Boolean(document.querySelector('.authoring-script-editor .monaco-editor'))`);
    const badReopen = await window.webContents.executeJavaScript(`(async()=>({selectedTab:document.querySelector('.authoring-tabs button.selected')?.textContent,
      rawEditor:Boolean(document.querySelector('.authoring-script-editor .monaco-editor')),
      status:document.querySelector('.authoring-status-detail')?.textContent,
      source:(await window.studioBridge.documents.list()).value?.find(d=>d.documentId==='${ids.secondDoc}')?.files['scenes/${ids.secondScene}/script.gal']}))()`, true);
    assert(badReopen.selectedTab==='脚本' && badReopen.rawEditor && badReopen.source.includes(ids.bad), 'invalid source did not reopen raw script');
    evidence.stages.push({ name: 'invalidReopen', edit: badEdit, value: badReopen, documents: conciseDocuments(documents.list()) });
    const coverage = await window.webContents.executeJavaScript(`(async()=>{const p=document.querySelector('.authoring-nav details');p.open=true;
      const mode=p.querySelector('select');mode.value='dialogue';mode.dispatchEvent(new Event('change',{bubbles:true}));
      const next=document.querySelector('.authoring-nav details');next.open=true;const target=next.querySelectorAll('select')[1];target.value='${ids.charA}';
      target.dispatchEvent(new Event('change',{bubbles:true}));[...next.querySelectorAll('button')].find(x=>x.textContent==='搜索')?.click();return true})()`, true);
    if (coverage) await waitFor(window, `document.querySelector('.authoring-nav details')?.textContent?.includes('partial')`);
    evidence.stages.push({ name: 'invalidCoverage', ui: await window.webContents.executeJavaScript(`document.querySelector('.authoring-nav details')?.textContent`),
      documents: conciseDocuments(documents.list()), disk: await readFile(join(projectRoot, 'scenes', ids.secondScene, 'script.gal'), 'utf8') });
    await documents.close(documents.currentSessionId,'save');
  } catch (error) { evidence.error = String(error); }
  finally { await writeFile(evidencePath, JSON.stringify(evidence, null, 2)); window?.destroy(); app.exit(evidence.error ? 1 : 0); }
});
