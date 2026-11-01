import { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, protocol, safeStorage, shell, utilityProcess } from 'electron';
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { createRequire } from 'node:module';
import { FixtureIds as F, FixtureLock, FixtureProject, FixtureScenes, FixtureVariables, FixtureAsset, FixtureCharacters, fixtureId as id } from '@galcraft/contracts/fixtures';
import { ProjectSession } from '@galcraft/documents';
import { createOfficialTemplate, createTemplateDocuments } from '@galcraft/templates';
import { registerResourceScheme, ResourceRegistry } from '@galcraft/media-tools/resources';
import { ProjectAccess } from '../../main/project-access.mjs';
import { ProjectDocuments } from '../../main/document-providers.mjs';
import { StudioAssets } from '../../main/asset-providers.mjs';
import { StudioHost, registerStudioIpc } from '../../main/host.mjs';
import { UtilityTasks } from '../../main/utility-tasks.mjs';
import { CompilerTasks } from '../../main/compiler-tasks.mjs';

const repo = resolve('../..'), studio = resolve('.');
const output = join(repo, 'test-results', 'w2', new Date().toISOString().replaceAll(':','-'));
const projectRoot = join(output, 'F-BASE 春日来信'), userData = join(output, 'user-data');
const envelope = (documentId, data) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data });
const reunion = id(0xe01), target = id(0xe02), opening = id(0xe03);
const referenceRoot = join(repo, 'apps/studio/resources/practice');
const media = [
  ['backgrounds/spring-street.png','image'], ['backgrounds/spring-shop.png','image'],
  ['figures/deepseek-neutral.png','image'],['figures/chatgpt-shy.png','image'],
  ['music/spring-01.opus','audio'],['voice/deepseek-ja-01.mp3','audio'],
];
const assetId = index => id(0xea0+index), variantId = index => id(0xeb0+index);
const say = (text, statementId) => `say {speaker:{kind:"narrator"},text:${JSON.stringify(text)}} @${statementId};`;
const scene = (sceneId, name) => ({ ...FixtureScenes[0], id: sceneId, name });
const scenes = [scene(opening,'开场'), scene(F.street,'春日街角'), scene(F.bookshop,'书店午后'), scene(reunion,'共同场景')];
const scripts = [
  `changeBg {op:"show",assetId:"${assetId(0)}"} @${id(0xe40)};\nbgm {op:"play",assetId:"${assetId(4)}",loop:true} @${id(0xe41)};\n${say('收到一封春天的来信。',id(0xe10))}\nchoose {options:[{id:"${F.chooseStreet}",text:"春日街角",target:{sceneId:"${F.street}",labelId:null},lockedReason:""},{id:"${F.chooseBookshop}",text:"书店午后",target:{sceneId:"${F.bookshop}",labelId:null},lockedReason:""}],previewDefault:null} @${F.choice};`,
  `setVar {variableId:"${F.relation}",op:"assign",value:20} @${id(0xe11)};\n${say('春日街角，杏挥了挥手。',id(0xe12))}\nchangeScene {sceneId:"${reunion}"} @${id(0xe13)};`,
  `setVar {variableId:"${F.relation}",op:"assign",value:40} @${id(0xe14)};\n${say('书店午后，我们翻开第一页。',id(0xe15))}\nchangeScene {sceneId:"${reunion}"} @${id(0xe16)};`,
  `say {speaker:{kind:"character",id:"${F.an}"},text:"终于在这里相遇。",voice:"${assetId(5)}"} @${target};\n${say('明天再见。',id(0xe17))}`,
];
scripts[1] = `changeFigure {op:"show",objectId:"${id(0xef0)}",characterId:"${F.an}",assetId:"${assetId(2)}",station:"center",framing:{mode:"full",scale:0.65,offsetX:0,offsetY:0,crop:null}} @${id(0xe42)};\n` + scripts[1];
scripts[2] = `changeBg {op:"show",assetId:"${assetId(1)}"} @${id(0xe43)};\nchangeFigure {op:"show",objectId:"${id(0xef1)}",characterId:"${F.friend}",assetId:"${assetId(3)}",station:"center",framing:{mode:"full",scale:0.65,offsetX:0,offsetY:0,crop:null}} @${id(0xe44)};\n` + scripts[2];
async function fixture() {
  const template = createOfficialTemplate();
  const project = { ...FixtureProject, entry: { sceneId: opening, labelId: null }, templateDocumentId: template.instanceId,
    canvas: { width: 1280, height: 720, stageColor: '#222' }, chapters: [{ id: F.chapter, name:'第一章',sceneIds:scenes.map(s=>s.id) }] };
  const json = (documentId, path, data) => ({ documentId, revision: 1, format:'json', files:{ [path]:envelope(documentId,data) } });
  const sharp = createRequire(join(repo,'packages/assets/package.json'))('sharp');
  const assets = await Promise.all(media.map(async ([relative,kind],index) => {
    const path = join(referenceRoot,relative), bytes = await readFile(path), metadata = kind === 'image' ? await sharp(bytes).metadata() : {};
    return { ...FixtureAsset, id:assetId(index),name:basename(path),kind,sourceName:basename(path),activeVariantId:variantId(index),originalVariantId:variantId(index),
      source:{kind:'import',description:relative,usage:'localReview'},variants:[{...FixtureAsset.variants[0],id:variantId(index),entry:basename(path),
        files:[{path:basename(path),bytes:bytes.length,mime:kind==='image'?'image/png':relative.endsWith('.mp3')?'audio/mpeg':'audio/ogg',role:'primary'}],
        metadata:kind==='image'?{width:metadata.width,height:metadata.height,hasAlpha:metadata.hasAlpha}:{},targets:{web:'direct',windows:'direct'}}] };
  }));
  const documents = [json(F.projectA,'project.json',project), json(id(0xe20),'dependencies.lock.json',{ ...FixtureLock, plugins:[], template:template.dependencies[0] }),
    json(id(0xe21),'assets/index.json',{ assets }),json(id(0xe22),`variables/${F.relation}.json`,FixtureVariables[0]),
    ...[FixtureCharacters[0],FixtureCharacters[1]].map((character,index)=>json(id(0xe60+index),`characters/${character.id}.json`,{...character,defaultVoicing:'intentionalSilent'})),
    ...scenes.map((item,i)=>({ documentId:id(0xe30+i),revision:1,format:'dsl',files:{ [`scenes/${item.id}/scene.json`]:envelope(id(0xe30+i),item), [`scenes/${item.id}/script.gal`]:scripts[i] } })),
    ...createTemplateDocuments(template)];
  const session = await ProjectSession.createProject(projectRoot,F.projectA,documents); await session.dispose('saved');
  for (const [index,[relative]] of media.entries()) { const directory=join(projectRoot,'assets/files',assetId(index),variantId(index));await mkdir(directory,{recursive:true});await copyFile(join(referenceRoot,relative),join(directory,basename(relative))); }
}
async function wait(window, expression, timeout = 20000) {
  const until = Date.now()+timeout;
  while (Date.now()<until) { const result = await window.webContents.executeJavaScript(`(async()=>Boolean(await (${expression})))()`,true); if(result)return result; await new Promise(r=>setTimeout(r,100)); }
  throw new Error(`等待界面超时：${expression}`);
}
const click = (window,label,scope='document') => window.webContents.executeJavaScript(`(()=>{const button=[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!button)throw new Error('按钮不存在：'+${JSON.stringify(label)});button.click();})()`,true);
await mkdir(userData,{recursive:true}); app.setPath('userData',userData); registerResourceScheme(protocol);
app.whenReady().then(async () => {
const evidence={caseIds:['M01-T05','M01-T06','M01-T12','M08-T05','INT-04','INT-15','F-BASE'],projectRoot,stages:[],error:null};
let window;
try {
  await fixture(); const resources=new ResourceRegistry();resources.install(protocol);
  window=new BrowserWindow({show:false,width:1600,height:1000,webPreferences:{backgroundThrottling:false,preload:join(studio,'main','preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.webContents.on('console-message',(_event,level,message)=>{if(level>=2)(evidence.console??=[]).push(message);});
  const operations=new UtilityTasks({utilityProcess,MessageChannelMain}), language=new CompilerTasks(operations);
  const access=new ProjectAccess(),documents=new ProjectDocuments(access);
  const assets=new StudioAssets(documents,join(repo,'tools/media/bin'),undefined,operations,resources,join(userData,'models'));
  const host=new StudioHost({userData,dialog:{...dialog,showOpenDialog:async()=>({canceled:false,filePaths:[projectRoot]})},shell,safeStorage,window,
    projectAccess:access,projects:documents,documents,assets,operations,language});registerStudioIpc(ipcMain,host);
  await window.loadFile(join(studio,'dist/index.html'));
  await window.webContents.executeJavaScript('window.confirm = () => true; void 0');
  await wait(window,`document.querySelector('.authoring-projects button')`);
  await window.webContents.executeJavaScript(`document.querySelector('.authoring-projects button').click()`);
  await wait(window,`document.querySelector('.authoring-editor')`);
  const saved=documents.list();if(!saved.ok||saved.value.some(doc=>doc.dirty))throw new Error('初始磁盘文档未保存');
  evidence.stages.push({name:'savedDocuments',versions:saved.value.map(doc=>({id:doc.documentId,working:doc.revision,saved:doc.savedRevision}))});
  await click(window,'共同场景',`document.querySelector('.authoring-nav')`);
  await wait(window,`document.querySelector('[data-statement-id="${target}"]')`);
  await window.webContents.executeJavaScript(`document.querySelector('[data-statement-id="${target}"]').click()`);
  for(const [route,value] of [['春日街角',20],['书店午后',40]]) {
    await click(window,'从此句试玩');await wait(window,`document.querySelector('.studio-playtest dialog[open]')`);
    await click(window,'准备路线',`document.querySelector('.studio-playtest dialog')`);
    await wait(window,`[...document.querySelectorAll('.studio-playtest dialog button')].some(b=>b.textContent==='${route}')`);
    await click(window,route,`document.querySelector('.studio-playtest dialog')`);
    await wait(window,`[...document.querySelectorAll('.studio-playtest dialog button')].some(b=>b.textContent==='启动试玩')`);
    await click(window,'启动试玩',`document.querySelector('.studio-playtest dialog')`);
    await wait(window,`!document.querySelector('.studio-playtest dialog') && document.querySelector('.studio-playtest .gc-body')`);
    await wait(window,`document.querySelector('.studio-playtest > pre').textContent.includes('"${F.relation}": ${value}')`);
    const reading=await window.webContents.executeJavaScript(`({status:JSON.parse(document.querySelector('.studio-playtest > pre').textContent),text:document.querySelector('.gc-body').textContent})`);
    if (value === 20) {
      const previous = language.lastValid(F.projectA).value;
      const operationId = id(0xf00);
      const input = { projectId:F.projectA,engineVersion:'0.1.0',project:previous.project,lock:previous.lock,
        scenes:previous.scenes.map(item=>item.scene),characters:previous.characters,variables:previous.variables,
        assets:JSON.parse(documents.list().value.find(doc=>doc.files['assets/index.json']).files['assets/index.json']).data.assets,gallery:[],flows:[],template:previous.template,
        documents:scenes.map((item,index)=>({documentId:id(0xe30+index),revision:2,kind:'scene',sceneId:item.id,
          text:index===0?Array.from({length:4096},(_,i)=>`wait {} @${id(0x20000+i)};`).join('\n'):scripts[index]})),cancelOperationId:operationId };
      const pending = language.compile(input);
      const sourceDocument = documents.currentSession.readDocument(id(0xe33)), before = scripts[3], after = before.replace('明天再见。','编辑期间的新文本。');
      const edit = { label:'取消期间继续编辑',origin:'script',expected:[{ref:{kind:'document',id:id(0xe33)},revision:sourceDocument.revision}],
        patches:[{kind:'text',documentId:id(0xe33),edits:[{start:0,end:before.length,before,after}]}],preparedAssets:[],requiredRefs:[] };
      const plan=documents.currentSession.planEdit(edit);if(!plan.ok)throw new Error(plan.error.message);
      const applied=documents.currentSession.applyEdit(plan.value.planId,edit.expected);if(!applied.ok)throw new Error(applied.error.message);
      const cancellation=await operations.cancel(operationId), result=await pending;
      const stillPlaying=await window.webContents.executeJavaScript(`({text:document.querySelector('.studio-playtest .gc-body')?.textContent,status:JSON.parse(document.querySelector('.studio-playtest > pre').textContent)})`);
      if(result.ok||language.lastValid(F.projectA).value.snapshotId!==previous.snapshotId||!stillPlaying.text.includes('终于'))throw new Error('编译取消替换了活动快照');
      const undo=documents.currentSession.planUndo(id(0xe33));if(!undo.ok)throw new Error(undo.error.message);
      const undone=documents.currentSession.undo(undo.value.planId);if(!undone.ok)throw new Error(undone.error.message);
      const save=documents.currentSession.planSave({kind:'all'});if(!save.ok)throw new Error(save.error.message);
      const savedAgain=await documents.currentSession.save(save.value.planId);if(!savedAgain.ok)throw new Error(savedAgain.error.message);
      evidence.stages.push({name:'HOST-02-active-player',cancellation,result,edited:applied.value,stillPlaying,savedAgain});
    }
    await window.webContents.executeJavaScript(`document.querySelector('.studio-playtest [data-focus-key="nav.save"]').click()`);
    await wait(window,`document.querySelector('.studio-playtest .gc-save-slot')`);
    await window.webContents.executeJavaScript(`document.querySelector('.studio-playtest [data-focus-key="slot.1"]').click()`);
    await wait(window,`document.querySelector('.studio-playtest [data-focus-key="slot.1"] small')?.textContent.includes('终于')`);
    await click(window,'返回',`document.querySelector('.studio-playtest .gc-content')`);
    await wait(window,`document.querySelector('.studio-playtest .gc-body')`);
    await window.webContents.executeJavaScript(`document.querySelector('.studio-playtest [data-focus-key="nav.history"]').click()`);
    await wait(window,`document.querySelector('.studio-playtest [data-page="history"]')`);
    const history=await window.webContents.executeJavaScript(`document.querySelector('.studio-playtest [data-page="history"]').textContent`);
    await click(window,'返回',`document.querySelector('.studio-playtest .gc-content')`);
    await window.webContents.executeJavaScript(`document.querySelector('.studio-playtest [data-focus-key="nav.load"]').click()`);
    await wait(window,`document.querySelector('.studio-playtest [data-focus-key="slot.1"]:not(:disabled)')`);
    await window.webContents.executeJavaScript(`document.querySelector('.studio-playtest [data-focus-key="slot.1"]').click()`);
    await wait(window,`document.querySelector('.studio-playtest .gc-body')`);
    const after=await window.webContents.executeJavaScript(`JSON.parse(document.querySelector('.studio-playtest > pre').textContent)`);
    await wait(window,`document.querySelector('.studio-playtest .gc-body')?.textContent.includes('终于在这里相遇。')`);
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    await writeFile(join(output,`route-${value}.png`),(await window.webContents.capturePage()).toPNG());
    evidence.stages.push({name:'route',route,value,reading,history,after});
    await click(window,'调试检查');
    await wait(window,`document.querySelector('.studio-playtest dialog[open]')`);
    await window.webContents.executeJavaScript(`document.querySelector('.studio-playtest dialog input[aria-label="调试表达式"]').value='progress["${F.relation}"]'`);
    await click(window,'求值',`document.querySelector('.studio-playtest dialog')`);
    await wait(window,`document.querySelector('.studio-playtest dialog pre')?.textContent==='${value}'`);
    await window.webContents.executeJavaScript(`document.querySelector('.studio-playtest dialog input[aria-label^="调试变量"]').value='${value+1}'`);
    await click(window,'修改试玩值',`document.querySelector('.studio-playtest dialog')`);
    await wait(window,`document.querySelector('.studio-playtest > pre').textContent.includes('"${F.relation}": ${value+1}')`);
    evidence.stages.push({name:'debug',route,expected:value+1,actual:await window.webContents.executeJavaScript(`JSON.parse(document.querySelector('.studio-playtest > pre').textContent).variables`)});
    await click(window,'关闭',`document.querySelector('.studio-playtest dialog')`);
    await click(window,'返回编辑位置');await wait(window,`!document.querySelector('.studio-playtest') && document.querySelector('[data-statement-id="${target}"]')`);
  }
  await click(window,'页面',`document.querySelector('.authoring-header')`);
  await wait(window,`document.querySelector('.designer-player [data-gc-part="title.menu.start"]')`);
  await window.webContents.executeJavaScript(`document.querySelector('.designer-player [data-gc-part="title.menu.start"]').click()`);
  await wait(window,`document.querySelector('.designer-properties h2')?.textContent==='title.menu.start'`);
  await click(window,'CSS / SCSS',`document.querySelector('.designer-properties')`);
  await wait(window,`document.querySelector('.designer-dialog textarea')`);
  await window.webContents.executeJavaScript(`document.querySelector('.designer-dialog textarea').value='[data-gc-part="title.menu.start"] { color: #123456; }'`);
  await click(window,'编译并应用',`document.querySelector('.designer-dialog')`);
  await wait(window,`document.querySelector('.designer-dialog pre')?.textContent.includes('编译成功')`);
  const css=await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.designer-player [data-gc-part="title.menu.start"]')).color`);
  if(css!=='rgb(18, 52, 86)')throw new Error(`作用域样式未应用：${css}`);
  await window.webContents.executeJavaScript(`document.querySelector('.designer-dialog textarea').value='{'`);
  await click(window,'编译并应用',`document.querySelector('.designer-dialog')`);
  await wait(window,`document.querySelector('.designer-dialog pre')?.textContent.includes('.scss:')`);
  const retained=await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.designer-player [data-gc-part="title.menu.start"]')).color`);
  if(retained!==css)throw new Error('编译失败没有保留最后有效 CSS');
  await click(window,'关闭',`document.querySelector('.designer-dialog')`);
  await click(window,'导航预览',`document.querySelector('.designer-heading')`);
  await window.webContents.executeJavaScript(`document.querySelector('.designer-player [data-gc-part="title.menu.start"]').click()`);
  await wait(window,`document.querySelector('.designer-player .gc-body')`);
  await click(window,'返回设计',`document.querySelector('.designer-heading')`);
  await wait(window,`document.querySelector('.designer-player [data-page="title"]')`);
  const selection=await window.webContents.executeJavaScript(`document.querySelector('.designer-properties h2').textContent`);
  if(selection!=='title.menu.start')throw new Error('返回设计丢失选区');
  await click(window,'设置图片槽',`document.querySelector('.designer-properties')`);
  await wait(window,`[...document.querySelectorAll('.designer-dialog button')].some(b=>b.textContent===${JSON.stringify(basename(media[0][0]))})`);
  await click(window,basename(media[0][0]),`document.querySelector('.designer-dialog[open]')`);
  await wait(window,`document.querySelector('.designer-properties select[aria-label="background image mode"]')`);
  await window.webContents.executeJavaScript(`(()=>{const s=document.querySelector('.designer-properties select');s.value='nineSlice';s.dispatchEvent(new Event('change'));})()`);
  await wait(window,`document.querySelector('.designer-properties input[aria-label="background top"]')?.value==='8'`);
  await click(window,'保存页面',`document.querySelector('.designer-heading')`);
  await wait(window,`document.querySelector('.designer-notice').textContent.includes('已保存')`);
  const imageSlot=documents.list().value.flatMap(doc=>Object.entries(doc.files)).filter(([path])=>path.startsWith('ui/pages/'))
    .map(([,raw])=>JSON.parse(raw).data).find(page=>page.key==='title').root.children.flatMap(function walk(c){return [c,...c.children.flatMap(walk)]})
    .find(c=>c.part==='title.menu.start').normal.images.background;
  if(imageSlot.mode!=='nineSlice'||imageSlot.assetId!==assetId(0))throw new Error('图片槽保存不一致');
  evidence.stages.push({name:'imageSlot',value:imageSlot});
  await click(window,'清除图片槽',`document.querySelector('.designer-properties')`);
  await wait(window,`!document.querySelector('.designer-properties select[aria-label="background image mode"]')`);
  evidence.stages.push({name:'pageDesigner',css,retained,selection});
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
  await writeFile(join(output,'designer.png'),(await window.webContents.capturePage()).toPNG());
  for(const [locale,heading] of [['en','Page designer'],['ja','ページデザイン']]) {
    await window.webContents.executeJavaScript(`(()=>{const s=document.querySelector('[aria-label="Studio language"]');s.value='${locale}';s.dispatchEvent(new Event('change'));})()`);
    await wait(window,`document.querySelector('.designer-heading h1')?.textContent==='${heading}' && document.querySelector('.designer-player canvas')`);
    evidence.stages.push({name:'designerLocale',locale,heading:await window.webContents.executeJavaScript(`document.querySelector('.designer-heading').textContent`)});
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    await writeFile(join(output,`designer-${locale}.png`),(await window.webContents.capturePage()).toPNG());
  }
  await documents.close(documents.currentSessionId,'discard');
} catch(error) {evidence.error=String(error);if(window)evidence.ui=await window.webContents.executeJavaScript(`document.body.innerText`).catch(String);}
finally {await writeFile(join(output,'acceptance.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({output,error:evidence.error}));window?.destroy();app.exit(evidence.error?1:0);}
});
