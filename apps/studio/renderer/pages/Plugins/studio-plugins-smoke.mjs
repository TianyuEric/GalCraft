import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, protocol, safeStorage, shell, utilityProcess } from 'electron';
import { FixtureCharacters, FixtureIds, FixtureLock, FixtureProject, FixtureScenes, fixtureId } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { createOfficialTemplate, createTemplateDocuments } from '@galcraft/templates';
import { registerResourceScheme, ResourceRegistry } from '@galcraft/media-tools/resources';
import { ProjectAccess } from '../../../main/project-access.mjs';
import { ProjectDocuments } from '../../../main/document-providers.mjs';
import { StudioAssets } from '../../../main/asset-providers.mjs';
import { StudioPluginPackages } from '../../../main/plugin-packages.mjs';
import { StudioHost, registerStudioIpc } from '../../../main/host.mjs';
import { UtilityTasks } from '../../../main/utility-tasks.mjs';
import { CompilerTasks } from '../../../main/compiler-tasks.mjs';

const studio = resolve('.'), repo = resolve('../..'), output = join(repo,'test-results/latest/studio-plugins');
const testingRoot = resolve(repo, 'tmp/testing');
const runRoot = resolve(testingRoot, 'studio-plugins/current'), projectRoot = join(runRoot,'AI后日谈作品'), userData = join(runRoot,'user');
assert(runRoot.startsWith(testingRoot + '/') || runRoot.startsWith(testingRoot + '\\'));
await rm(runRoot, { recursive: true, force: true });
process.env.TEMP = process.env.TMP = runRoot;
const pluginId = 'org.galcraft.ai-epilogue', configPath = `plugins/${pluginId}/documents/config.json`;
const value = result => { if (!result.ok) throw new Error(result.error.message); return result.value; };
const envelope = (id,data) => JSON.stringify({schemaVersion:1,documentId:id,revision:1,data},null,2)+'\n';
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
let window;
async function evaluate(source) { return window.webContents.executeJavaScript(source,true); }
async function wait(source) { const until = Date.now()+30000; while(Date.now()<until) { if(await evaluate(`(async()=>Boolean(await (${source})))()`)) return; await sleep(100); }
  throw new Error(`Studio did not reach ${source}; ${await evaluate('document.body.innerText.slice(-2500)')}`); }
async function click(label,selector='document') { await wait(`[...(${selector}).querySelectorAll('button')].some(item=>item.textContent.trim()===${JSON.stringify(label)}&&!item.disabled)`); await evaluate(`(() => { const button=[...(${selector}).querySelectorAll('button')].find(item=>item.textContent.trim()===${JSON.stringify(label)});
  if(!button)throw new Error('Missing button');button.click(); })()`); }
async function fill(label,text) { await evaluate(`(() => { const labelNode=[...document.querySelectorAll('.ai-epilogue-editor label')].find(item=>item.textContent===${JSON.stringify(label)});const input=document.getElementById(labelNode?.htmlFor);if(!input)throw new Error('Missing field');input.value=${JSON.stringify(text)};input.dispatchEvent(new Event('input',{bubbles:true})); })()`); }
async function snapshot(name) {
  // A hidden BrowserWindow needs a capture before Chromium refreshes its compositor surface.
  await window.webContents.capturePage();
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await sleep(250);
  await writeFile(join(output,name),(await window.webContents.capturePage()).toPNG());
}
async function fixture() {
  const template = createOfficialTemplate({kind:'standard'}), project = {...FixtureProject,templateDocumentId:template.instanceId};
  const lock = {...FixtureLock,plugins:[],template:template.dependencies.find(item=>item.kind==='template')};
  const characters = FixtureCharacters.map((character,index)=>index===0 ? {...character,narrativeRole:'main',description:'未许可的秘密',personalRoute:{sceneIds:[FixtureIds.street],endingIds:['an-ending']}} : character);
  const documents = [
    {documentId:FixtureIds.projectA,revision:1,format:'json',files:{'project.json':envelope(FixtureIds.projectA,project)}},
    {documentId:fixtureId(0xef1),revision:1,format:'json',files:{'dependencies.lock.json':envelope(fixtureId(0xef1),lock)}},
    {documentId:fixtureId(0xef2),revision:1,format:'json',files:{'assets/index.json':envelope(fixtureId(0xef2),{assets:[]})}},
    ...characters.map(character=>({documentId:character.id,revision:1,format:'json',files:{[`characters/${character.id}.json`]:envelope(character.id,character)}})),
    ...FixtureScenes.map((scene,index)=>({documentId:index?FixtureIds.bookshopDocument:FixtureIds.streetDocument,revision:1,format:'dsl',files:{
      [`scenes/${scene.id}/scene.json`]:envelope(index?FixtureIds.bookshopDocument:FixtureIds.streetDocument,scene),
      [`scenes/${scene.id}/script.gal`]: index ? '' : `say {speaker:{kind:"narrator"},text:"后日谈插件测试"} @${fixtureId(0xef3)};\nchangeScene {sceneId:"${FixtureIds.bookshop}"} @${fixtureId(0xef5)};\nend {endingId:"an-ending"} @${fixtureId(0xef4)};\n`}})),
    ...createTemplateDocuments(template)];
  const session=await ProjectSession.createProject(projectRoot,project.projectId,documents);value(await session.dispose('saved'));
}
await mkdir(userData,{recursive:true});await mkdir(output,{recursive:true});app.setPath('userData',userData);registerResourceScheme(protocol);
app.whenReady().then(async()=>{
  const report={target:'studioElectron',environment:{electron:process.versions.electron,node:process.versions.node,platform:process.platform,pid:process.pid},checks:[],errors:[],result:'failed',executedAt:new Date().toISOString()};
  try {
    await fixture();const resources=new ResourceRegistry();resources.install(protocol);
    window=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{backgroundThrottling:false,preload:join(studio,'main/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    window.webContents.on('console-message',(_event,level,message)=>{if(level>=3)report.errors.push(message);});
    const operations=new UtilityTasks({utilityProcess,MessageChannelMain}),language=new CompilerTasks(operations),access=new ProjectAccess(),documents=new ProjectDocuments(access);
    const assets=new StudioAssets(documents,join(repo,'tools/media/bin'),undefined,operations,resources,join(userData,'models'));
    const plugins=new StudioPluginPackages(join(userData,'plugins'),resources);
    const host=new StudioHost({userData,dialog:{...dialog,showOpenDialog:async()=>({canceled:false,filePaths:[projectRoot]})},shell,safeStorage,window,projectAccess:access,projects:documents,documents,assets,plugins,operations,language});
    registerStudioIpc(ipcMain,host);await window.loadFile(join(studio,'dist/index.html'));
    await wait(`document.querySelector('.project-workbench')`);await click('打开作品',`document.querySelector('.project-workbench')`);await wait(`document.querySelector('.authoring-editor')`);
    const sceneState = `window.studioBridge.documents.list().then(result=>result.ok&&result.value.find(item=>item.documentId==='${FixtureIds.streetDocument}'))`;
    const savedSource = value(documents.list()).find(item=>item.documentId===FixtureIds.streetDocument).files[`scenes/${FixtureIds.street}/script.gal`];
    await evaluate(`document.querySelector('[data-statement-id="${fixtureId(0xef3)}"]').click()`);
    await wait(`document.querySelector('[data-field="append"] input[type="checkbox"]')`);
    await evaluate(`(() => {const field=document.querySelector('[data-field="append"] input');window.__nativeCheckboxBefore=field;for(let node=field.parentElement;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;field.focus();field.click();})()`);
    await wait(`(${sceneState}).then(scene=>scene.dirty&&document.querySelector('[data-field="append"] input')!==window.__nativeCheckboxBefore&&document.querySelector('[data-field="append"] input')?.checked)`);
    await evaluate(`window.__nativeCheckboxBefore=document.querySelector('[data-field="append"] input');window.__nativeCheckboxBefore.click()`);
    await wait(`(${sceneState}).then(scene=>!scene.dirty&&document.querySelector('[data-field="append"] input')!==window.__nativeCheckboxBefore)`);
    assert.equal(value(documents.list()).find(item=>item.documentId===FixtureIds.streetDocument).files[`scenes/${FixtureIds.street}/script.gal`],savedSource);
    await evaluate(`document.querySelector('[data-field="append"] input').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))`);
    await wait(`(${sceneState}).then(scene=>scene.dirty&&document.querySelector('[data-field="append"] input')?.checked)`);
    assert.equal(await evaluate(`document.activeElement.matches('[data-field="append"] input')`),true);
    await wait(`document.querySelector('.studio-toast')`);
    assert.equal(await evaluate(`document.querySelector('.studio-toast').getAttribute('role')`),'dialog');
    await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}))`);
    await wait(`(${sceneState}).then(scene=>!scene.dirty)`);
    await click('场景关系图',`document.querySelector('.authoring-toolbar')`);await wait(`document.querySelectorAll('.react-flow__node').length===2&&document.querySelectorAll('.react-flow__edge').length===1`);
    await wait(`document.querySelector('.scene-relations-dialog[aria-modal="true"]')&&document.querySelector('.scene-relations-canvas').getBoundingClientRect().height>300`);
    await evaluate(`document.querySelector('#app').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}))`);
    assert.equal(await evaluate(`(${sceneState}).then(scene=>scene.dirty)`),false);
    assert((await evaluate(`document.querySelector('.scene-relations-canvas').getBoundingClientRect().height`))>300);
    await snapshot('authoring-scene-graph.png');
    await evaluate(`document.querySelector('.react-flow__node[data-id="${FixtureIds.bookshop}"]').click()`);await wait(`!document.querySelector('.scene-relations-dialog')&&document.querySelector('.scene-row.selected')?.dataset.sceneId==='${FixtureIds.bookshop}'`);
    await evaluate(`document.querySelector('.scene-row[data-scene-id="${FixtureIds.street}"]').click()`);await wait(`document.querySelector('[data-statement-id="${fixtureId(0xef3)}"]')`);
    report.checks.push('native authoring checkbox round-trip restores saved source and clean state; Ctrl+Z and Ctrl+Shift+Z work while notification is visible and preserve checkbox focus; modal isolates document undo; scene graph renders real working scripts and node navigation closes dialog');
    await click('插件',`document.querySelector('.studio-rail')`);await wait(`document.querySelector('.plugins-page .plugin-summary')`);
    await click('安装插件',`document.querySelector('.plugins-page')`);await wait(`document.querySelector('[role="dialog"] input')`);
    await evaluate(`(() => { const input=document.querySelector('[role="dialog"] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(join(repo,'plugins/ai-epilogue/package'))});input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await click('检查',`document.querySelector('[role="dialog"]')`);await wait(`document.querySelector('.plugin-inspection')`);await click('确认安装',`document.querySelector('[role="dialog"]')`);
    await wait(`!document.querySelector('[role="dialog"]')`);
    await wait(`[...document.querySelectorAll('.connection-card')].some(item=>item.innerText.includes('${pluginId}'))`);
    assert(!value(await plugins.list(documents.currentSession)).lock.plugins.some(item=>item.id===pluginId));
    const card=`[...document.querySelectorAll('.connection-card')].find(item=>item.innerText.includes('${pluginId}'))`;
    assert((await evaluate(`(${card}).innerText`)).includes('作品未启用'));await click('查看影响',card);await wait(`document.querySelector('.plugin-impact')`);
    assert((await evaluate(`document.querySelector('.plugin-impact').innerText`)).includes('将启用'));assert((await evaluate(`document.querySelector('.plugin-version-change').innerText`)).includes('当前 · 未启用'));
    await snapshot('enable-impact.png');
    await evaluate(`document.querySelector('[role="dialog"] header button').click()`);await wait(`!document.querySelector('[role="dialog"]')`);
    assert(!value(await plugins.list(documents.currentSession)).lock.plugins.some(item=>item.id===pluginId));
    await click('查看影响',card);await wait(`document.querySelector('.plugin-impact')`);await click('确认变更',`document.querySelector('[role="dialog"]')`);
    await wait(`document.querySelector('.studio-rail button[aria-label="AI 后日谈"]')`);report.checks.push('ordinary install preserves Lock; impact uses current and proposed states; cancel preserves disabled state; enable activates extension navigation');
    await click('AI 后日谈',`document.querySelector('.studio-rail')`);await wait(`document.querySelector('.ai-epilogue-editor select option')`);
    assert.equal(await evaluate(`document.querySelector('.ai-epilogue-editor select').options.length`),1);await click('新增入口',`document.querySelector('.ai-epilogue-editor')`);
    await fill('入口标题','杏的夏日');await fill('许可角色设定','喜欢雨天的杏');await fill('后日谈起点','路线完结后的暑假');await fill('可披露事实（每行一条）','已经共同旅行');await fill('允许互动范围','聊暑假计划');await fill('结束条件','约定明天见');
    await evaluate(`document.querySelector('.ai-epilogue-editor .epilogue-option input[type=checkbox]').click()`);
    await click('预览发送上下文',`document.querySelector('.ai-epilogue-editor')`);await wait(`document.querySelector('.epilogue-preview section')`);
    const preview=await evaluate(`document.querySelector('.epilogue-preview').innerText`);assert(preview.includes('喜欢雨天的杏'));assert(!preview.includes('未许可的秘密'));
    await snapshot('context-preview.png');await click('关闭',`document.querySelector('.studio-plugin-dialog').closest('[role="dialog"]')`);await wait(`!document.querySelector('.studio-plugin-dialog')`);
    await click('应用到作品',`document.querySelector('.ai-epilogue-editor')`);await wait(`[...document.querySelectorAll('.ai-epilogue-editor [role="status"]')].some(item=>item.textContent.includes('已应用到作品'))`);
    assert.equal(JSON.parse(value(documents.list()).find(item=>item.files[configPath]).files[configPath]).data.entries[0].title,'杏的夏日');
    await snapshot('workbench.png');
    await evaluate(`document.querySelector('#app').dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,shiftKey:true,bubbles:true}))`);await wait(`document.querySelector('[role="dialog"] .request-description')`);
    await wait(`[...document.querySelectorAll('[role="dialog"] button')].some(item=>item.textContent.trim().startsWith('保存 ')&&!item.disabled)`);
    await evaluate(`[...document.querySelectorAll('[role="dialog"] button')].find(item=>item.textContent.trim().startsWith('保存 ')).click()`);await wait(`window.studioBridge.documents.list().then(result=>result.ok&&result.value.every(item=>!item.dirty))`);
    assert.equal(JSON.parse(await readFile(join(projectRoot,configPath),'utf8')).data.entries[0].characterSetting,'喜欢雨天的杏');
    report.checks.push('only main character can be selected; author-only permitted context excludes canonical secret; host dialog opens and closes; config uses real M02 and Save all persists');
    value(await documents.close(documents.currentSessionId,'save'));window.reload();await wait(`document.querySelector('.project-workbench')`);await click('打开作品',`document.querySelector('.project-workbench')`);await wait(`document.querySelector('.studio-rail button[aria-label="AI 后日谈"]')`);
    await click('AI 后日谈',`document.querySelector('.studio-rail')`);await wait(`document.querySelector('.ai-epilogue-editor input[id$="-title"]')?.value==='杏的夏日'`);
    await click('插件',`document.querySelector('.studio-rail')`);await wait(`document.querySelector('.plugin-summary')`);await click('查看影响',card);await wait(`document.querySelector('.plugin-impact')`);
    assert((await evaluate(`document.querySelector('.plugin-impact').innerText`)).includes('将停用'));await click('确认变更',`document.querySelector('[role="dialog"]')`);
    await wait(`!document.querySelector('.studio-rail button[aria-label="AI 后日谈"]')`);assert(value(documents.list()).some(item=>item.files[configPath]));
    report.checks.push('reopen reconstructs Studio contribution and config; disable removes navigation and preserves config document');report.result='passed';
  } catch(error) {report.error=error.stack??String(error);report.authoringState=await evaluate(`window.studioBridge.documents.list().then(result=>result.ok&&result.value.find(item=>item.documentId==='${FixtureIds.streetDocument}'))`).catch(()=>null);report.graph=await evaluate(`[...document.querySelectorAll('.scene-relations-dialog,.scene-relations-dialog .gc-dialog-body,.scene-relations,.scene-relations-canvas,.react-flow')].map(node=>({class:node.className,modal:node.getAttribute('aria-modal'),height:node.getBoundingClientRect().height,display:getComputedStyle(node).display,flex:getComputedStyle(node).flex}))`).catch(()=>null);await snapshot('native-failure.png').catch(()=>{});} finally {await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));window?.destroy();console.log(JSON.stringify(report));app.exit(report.result==='passed'?0:1);}
});
