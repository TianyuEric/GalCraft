import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const {chromium}=createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const evidence=resolve('../../test-results/latest/studio-usability');await mkdir(evidence,{recursive:true});
const browser=await chromium.connectOverCDP('http://127.0.0.1:9345'),page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(15000);
const report={result:'failed',checks:[],errors:[]};page.on('pageerror',error=>report.errors.push(error.stack ?? error.message));
const check=(name)=>{report.checks.push(name);console.log('PASS',name);};
const click=name=>page.getByRole('button',{name,exact:true}).click();
const nav=name=>page.locator('.studio-rail').getByRole('button',{name,exact:true}).click();
const shot=async name=>{await page.waitForTimeout(250);return page.screenshot({path:join(evidence,name+'.png'),scale:'css'});};
try{
 await page.reload();await page.locator('.studio-rail').waitFor();
 if(await page.locator('.studio-rail').getByRole('button',{name:'创作',exact:true}).isDisabled()){
  await click('新建作品');const create=page.getByRole('dialog');await create.getByLabel('作品名称',{exact:true}).fill('雨站验收-'+Date.now());await create.locator('.project-template').filter({hasText:'示例作品'}).click();await create.getByRole('button',{name:'选择目录并创建',exact:true}).click();await create.waitFor({state:'detached',timeout:30000});
 }
 await nav('创作'); if(await page.getByRole('button',{name:'卡片',exact:true}).count()) await click('卡片'); if(await page.getByRole('button',{name:'切换浅蓝主题',exact:true}).count()) await click('切换浅蓝主题');
 await page.getByRole('menuitem',{name:'视图',exact:true}).click();await page.getByRole('menuitem',{name:'恢复默认布局',exact:true}).click();
 await page.locator('.authoring-nav').getByRole('button',{name:'雨站 · 来信',exact:true}).click();
 await page.locator('.authoring-card').first().click();await page.waitForFunction(()=>document.querySelector('.studio-mini-stage > p')?.textContent?.includes('静音定格'));
 assert.equal(await page.locator('.studio-mini-player canvas').count(),1);check('entry command is evaluated by the real engine');
 await page.locator('.authoring-card').nth(3).click();await page.waitForFunction(()=>document.querySelector('.mini-dialogue')?.textContent?.includes('雨还没有停'));
 await shot('editor-stage');check('selected dialogue renders background, figure and text');
 const selectedStage=await page.locator('.studio-mini-stage').getAttribute('data-statement-id');
 await click('脚本');await page.locator('.monaco-editor .view-line').filter({hasText:'"character"'}).first().click();await page.keyboard.press('Home');
 await page.waitForFunction(id=>{const stage=document.querySelector('.studio-mini-stage');return stage?.dataset.statementId&&stage.dataset.statementId!==id;},selectedStage);
 await page.keyboard.type(' ');await page.getByText('脚本正在编辑，移出编辑区后更新预览。',{exact:true}).waitFor();await page.keyboard.press('Control+z');await page.waitForFunction(()=>document.querySelector('.studio-mini-stage > p')?.textContent?.includes('静音定格'));
 check('script caret updates the stage and drafts wait for commit');await click('卡片');

 await page.locator('.authoring-nav').getByRole('button',{name:'候车室 · 读信',exact:true}).click();await page.locator('.authoring-card').filter({hasText:'信上写着：'}).click();
 await page.getByText('选择通往当前指令的路线',{exact:true}).waitFor();await page.locator('.studio-mini-stage').getByRole('button',{name:'去候车室读信',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.mini-dialogue')?.textContent?.includes('每一个故事'));await shot('branch-preview');check('branch route prepares the selected target without playback');
 await page.getByRole('button',{name:'添加指令',exact:true}).last().click();let dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'应用',exact:true}).click();await dialog.locator('.field-error').first().waitFor();assert.match(await dialog.innerText(),/请填写正文/);
 assert.equal(await dialog.getByLabel('正文',{exact:true}).getAttribute('aria-invalid'),'true');await shot('required-feedback');
 await dialog.getByLabel('正文',{exact:true}).fill('测试对白');await dialog.getByRole('button',{name:'应用',exact:true}).click();await dialog.waitFor({state:'detached'});
 const count=await page.locator('.authoring-card').count();await page.locator('.authoring-card').last().focus();await page.keyboard.press('Control+z');await page.waitForFunction(n=>document.querySelectorAll('.authoring-card').length===n,count-1);
 await page.locator('.authoring-card').last().focus();await page.keyboard.press('Control+y');await page.waitForFunction(n=>document.querySelectorAll('.authoring-card').length===n,count);check('required field feedback and command undo/redo shortcuts');
 const dock=page.locator('.authoring-diagnostic-dock'),beforeDock=await dock.boundingBox(),split=dock.locator('[role="separator"]'),splitBox=await split.boundingBox();
 await page.mouse.move(splitBox.x+splitBox.width/2,splitBox.y+splitBox.height/2);await page.mouse.down();await page.mouse.move(splitBox.x+splitBox.width/2,splitBox.y+(beforeDock.height>300?60:-60),{steps:6});await page.mouse.up();
 await dock.waitFor({state:'visible'}); assert(Math.abs((await dock.boundingBox()).height-beforeDock.height)>40);check('empty problem panel resizes vertically');
 assert.equal(await page.locator('.studio-rail').evaluate(el=>getComputedStyle(el).userSelect),'none');assert.equal(await page.locator('.authoring-inspector textarea').first().evaluate(el=>getComputedStyle(el).userSelect),'text');
 await nav('页面');const item=page.locator('[data-gc-part="title.workTitle"]');await item.waitFor();await page.waitForTimeout(300);
 await page.getByRole('button',{name:'title.workTitle',exact:true}).click();
 await page.getByLabel('水平位置 (px)',{exact:true}).fill('48');await page.getByLabel('水平位置 (px)',{exact:true}).press('Tab');await page.waitForTimeout(700);
 await page.getByLabel('垂直位置 (px)',{exact:true}).fill('260');await page.getByLabel('垂直位置 (px)',{exact:true}).press('Tab');await page.waitForTimeout(700);

 const before=await item.boundingBox();await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();await page.mouse.move(before.x+before.width/2+24,before.y+before.height/2+16,{steps:8});
 const during=await item.boundingBox();assert(Math.abs(during.x-before.x-24)<2);assert(Math.abs(during.y-before.y-16)<2);await page.mouse.up();
 await page.waitForTimeout(1000);const after=await item.boundingBox();assert(Math.abs(after.x-before.x-24)<2);assert(Math.abs(after.y-before.y-16)<2);await shot('designer-drag');
 await page.locator('.designer-canvas').focus();await page.keyboard.press('Control+z');await page.waitForTimeout(800);assert(Math.abs((await item.boundingBox()).x-before.x)<2);
 await page.locator('.designer-canvas').focus();await page.keyboard.press('Control+y');await page.waitForTimeout(800);assert(Math.abs((await item.boundingBox()).x-after.x)<2);check('page drag live feedback, commit, undo and redo');
 await page.locator('.designer-canvas').focus();await page.keyboard.press('Control+z');await page.waitForTimeout(700);
 await nav('素材');await nav('页面');await item.waitFor();await page.waitForTimeout(700);await page.locator('.designer-canvas').focus();await page.keyboard.press('Control+y');await page.waitForTimeout(700);
 const restored=await item.boundingBox();assert(Math.abs(restored.x-after.x)<2);
 await page.mouse.move(restored.x+restored.width/2,restored.y+restored.height/2);await page.mouse.down();await page.mouse.move(restored.x+restored.width/2+30,restored.y+restored.height/2+20);await page.keyboard.press('Escape');await page.mouse.up();
 assert(Math.abs((await item.boundingBox()).x-restored.x)<2);check('page history survives navigation and Escape cancels dragging');

 await click('保存页面');await nav('素材');assert.match(await page.locator('.asset-count').innerText(),/5/);await shot('assets');check('practice includes 5 real named assets');
 for(const [name,file] of [['制作','production'],['插件','plugins'],['发布','publish'],['作品','projects']]){await nav(name);await page.waitForTimeout(200);await shot(file);}
 await nav('发布');await click('检查已保存版本');await page.locator('[data-field="output"] .field-error').waitFor();check('publish required directory explains missing value inline');
 await page.getByRole('menuitem',{name:'帮助',exact:true}).click();await page.getByRole('menuitem',{name:'操作教学',exact:true}).click();
 await page.frameLocator('iframe[title="GalCraft 操作教学"]').getByRole('heading',{name:'GalCraft Studio 操作教学',exact:true}).waitFor();assert.equal(await page.frameLocator('iframe[title="GalCraft 操作教学"]').locator('img').count(),5);assert(await page.frameLocator('iframe[title="GalCraft 操作教学"]').locator('img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0)));await shot('guide');await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();check('offline guide is reachable from Help');
 await click('切换暮蓝主题');await nav('制作');await shot('dark-production');
 await page.setViewportSize({width:960,height:700});await nav('页面');await page.waitForTimeout(600);await shot('narrow-designer');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));check('dark theme and narrow layout fit the viewport');
 await page.emulateMedia({reducedMotion:'reduce'});await nav('素材');assert.equal(await page.locator('.authoring-assets').evaluate(el=>getComputedStyle(el).animationName),'none');check('reduced-motion disables page animation');

 await page.setViewportSize({width:1440,height:900});
 for(let cycle=0;cycle<3;cycle++){
  await nav('页面');await page.locator('.designer-tree').getByRole('button',{name:'title.workTitle',exact:true}).click();
  await page.getByLabel('水平位置 (px)',{exact:true}).fill(String(100+cycle));await page.getByLabel('水平位置 (px)',{exact:true}).press('Tab');
  await nav('素材');await page.setViewportSize({width:1400-cycle*20,height:900});
 }
 await page.waitForTimeout(1000);check('leaving a pending page preview releases its canvas safely');
 assert.deepEqual(report.errors,[]);report.result='passed';
}catch(error){report.failure=String(error);await shot('failure');throw error;}
finally{await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2));await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'no-preference'});await browser.close();}
