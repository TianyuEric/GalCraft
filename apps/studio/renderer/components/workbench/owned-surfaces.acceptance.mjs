import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const output='test-results/latest/ui-registry/components';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage();const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:6007/iframe.html?id=components-registry-components--owned-surfaces&viewMode=story');
 for(let i=0;i<3;i++){
 await page.getByRole('button',{name:'打开编辑内容'}).click();const popup=page.locator('[data-slot=dialog-content]');await popup.waitFor();await page.getByRole('button',{name:'选择颜色',exact:true}).click();await page.locator('[data-slot=popover-content]').waitFor();await page.keyboard.press('Escape');await page.locator('[data-slot=popover-content]').waitFor({state:'hidden'});assert.equal(await popup.isVisible(),true);await page.getByRole('textbox',{name:'保留的字段'}).fill(`保留输入 ${i}`);await page.getByRole('button',{name:'完成',exact:true}).click();await popup.waitFor({state:'hidden'});await page.locator('output').filter({hasText:`保留输入 ${i}`}).waitFor();
 await page.getByRole('button',{name:'打开指令选择'}).click();const input=page.getByRole('combobox');await input.fill('背景音乐');await input.press('Enter');await page.locator('[data-slot=popover-content]').waitFor({state:'hidden'});await page.locator('output').filter({hasText:'bgm'}).waitFor();
 }checks.push('三次 DOM Dialog 输入/关闭回执及 Command Popover 选择/卸载');
 await page.getByRole('button',{name:'打开编辑内容'}).click();await page.getByRole('textbox',{name:'保留的字段'}).waitFor();await page.keyboard.press('Escape');await page.locator('[data-slot=dialog-content]').waitFor({state:'hidden'});checks.push('Base UI Esc 通过原 close 生命周期清理');
 assert.deepEqual(errors,[]);await page.screenshot({path:`${output}/owned-surfaces.png`});
}finally{await writeFile(`${output}/owned-surfaces.json`,JSON.stringify({checks,errors},null,2));await browser.close();}
console.log(checks);
