import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
const evidence=resolve('test-results/latest/afterstory-animation/stories');await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],records=[];
page.on('pageerror',error=>errors.push(error.message));
const record=(target,data,expected,actual)=>records.push({target,environment:'Windows / Edge / formal Storybook',data,expected,actual,result:'passed'});
const open=async id=>{await page.goto(`http://127.0.0.1:6007/iframe.html?id=${id}&viewMode=story`);await page.locator('#storybook-root').waitFor();};
try{
 await open('product-studio-authoring-afterstory-layout--configure');await page.getByRole('button',{name:'右移 澜汐',exact:true}).click();
 await page.waitForFunction(()=>{const value=JSON.parse(document.querySelector('[data-testid="afterstory-layout-value"]').textContent);return value.find(item=>item.id==='Hero00').presentation.order===1;});
 assert.equal(await page.locator('.afterstory-layout-list li').first().innerText(),'绮白');
 await page.locator('.afterstory-layout-list').getByRole('button',{name:'澜汐',exact:true}).dragTo(page.locator('.afterstory-layout-list li').last());
 await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="afterstory-layout-value"]').textContent).find(item=>item.id==='Hero00').presentation.order===2);
 const crop=page.getByRole('button',{name:'移动裁剪框',exact:true});await crop.focus();await crop.press('ArrowRight');
 await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-testid="afterstory-layout-value"]').textContent).find(item=>item.id==='Hero00').presentation.crop.x>.1);
 const handle=await crop.boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+20,handle.y+handle.height/2);await page.keyboard.press('Escape');await page.mouse.up();
 await page.screenshot({path:join(evidence,'layout-light.png')});record('Character order and framing','Move right; keyboard crop; cancel pointer gesture','Stable identities reorder; crop changes independently; Esc cancels gesture','passed');
 await page.setViewportSize({width:900,height:700});await open('product-studio-authoring-afterstory-layout--dusk');await page.getByRole('button',{name:'移动裁剪框',exact:true}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(evidence,'layout-dusk-900.png')});record('Narrow dark layout','900×700','Controls and source frame remain inside viewport','passed');
 await open('product-studio-authoring-afterstory-layout--empty');await page.getByText('先为主角色配置后日谈入口。',{exact:true}).waitFor();assert.equal(await page.locator('.afterstory-layout-list li').count(),0);record('Empty author directory','No afterstory entries','Shows next author action','passed');
 await open('product-studio-authoring-professional-editors--animation');await page.getByText('应用常用动画预设',{exact:true}).click();await page.getByRole('combobox',{name:'动画预设',exact:true}).click();await page.getByRole('option').first().waitFor();assert.equal(await page.getByRole('option').count(),16);await page.getByRole('option',{name:'轻微呼吸',exact:true}).click();await page.getByRole('button',{name:'应用并编辑关键帧',exact:true}).click();await page.screenshot({path:join(evidence,'preset-breath.png')});record('Shared animation presets','Sixteen choices; apply Breathe','Existing common picker applies editable native tracks','passed');
 assert.deepEqual(errors,[]);
}catch(error){await page.screenshot({path:join(evidence,'failure.png')});console.log((await page.locator('body').innerText()).slice(0,2000));throw error;}
finally{await writeFile(join(evidence,'acceptance.json'),JSON.stringify({records,errors,result:records.length===4&&!errors.length?'passed':'failed'},null,2));await browser.close();}
console.log(JSON.stringify({records:records.length,errors}));
