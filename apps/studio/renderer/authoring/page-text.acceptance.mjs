import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright';
const evidence=resolve('test-results/latest/d28-page-player');await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto('http://127.0.0.1:6007/iframe.html?id=product-studio-authoring-pages--page-designer&viewMode=story');
  const button=page.locator('[data-gc-part="title.menu.characters"]');await button.waitFor();await button.click({force:true});
  const text=page.locator('[data-component-display-text]');await text.fill('After story');await text.press('Tab');await page.waitForFunction(()=>document.querySelector('[data-gc-part="title.menu.characters"]')?.textContent==='After story',null,{timeout:15000});
  assert.equal(await page.locator('[data-gc-part="title.menu.start"]').innerText(),'开始游戏');
  await page.getByRole('combobox',{name:'Player 菜单语言',exact:true}).selectOption('en');await page.waitForFunction(()=>document.querySelector('[data-gc-part="title.menu.characters"]')?.textContent==='Afterstories',null,{timeout:15000});assert.equal(await text.inputValue(),'Afterstories');
  await page.getByRole('combobox',{name:'Player 菜单语言',exact:true}).selectOption('zh-CN');await page.waitForFunction(()=>document.querySelector('[data-gc-part="title.menu.characters"]')?.textContent==='After story',null,{timeout:15000});
  await page.getByRole('button',{name:'撤销',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-gc-part="title.menu.characters"]')?.textContent==='后日谈',null,{timeout:15000});
  await page.getByRole('button',{name:'恢复',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-gc-part="title.menu.characters"]')?.textContent==='After story',null,{timeout:15000});
  await page.screenshot({path:join(evidence,'designer-display-text.png')});
  await page.getByRole('button',{name:'恢复此语言默认文字',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-gc-part="title.menu.characters"]')?.textContent==='后日谈',null,{timeout:15000});assert.deepEqual(errors,[]);
  await writeFile(join(evidence,'designer.json'),JSON.stringify({environment:'Windows Edge / formal Studio Storybook / real PageDesigner and shared PlayerView / fixture bridge',data:'Selected title.menu.characters; Player zh-CN/en',expected:'Only selected component and Player locale change; undo, redo and per-language restore work',actual:'After story in zh-CN; Afterstories in en; 开始游戏 unchanged; undo/redo/restore passed',result:'passed',errors},null,2));
}catch(error){console.log((await page.locator('body').innerText()).slice(-3000));throw error;}finally{await browser.close();}
console.log('PageDesigner display text acceptance passed');
