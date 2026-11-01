import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage(); const checks=[];
const output=resolve(process.env.GALCRAFT_UI_EVIDENCE_DIR ?? 'test-results/latest/studio-round2/components');await mkdir(output,{recursive:true});
const open=async(id,method)=>{const row=page.locator(`[data-node-id="${id}"]`);if(method==='right')await row.click({button:'right'});else if(method==='more')await row.getByRole('button').click();else{await row.focus();await row.press('Shift+F10');}await page.getByRole('menu').waitFor();};
try{for(const method of ['right','more','keyboard']){
 await page.goto('http://127.0.0.1:6007/iframe.html?id=product-studio-workbench-object-menus--selection&viewMode=story');await page.locator('[data-node-id=A]').waitFor();
 await open('A',method);assert.equal(await page.getByTestId('selection').textContent(),'A,B');assert.equal(await page.getByTestId('primary').textContent(),'A');assert.equal(await page.getByTestId('action').textContent(),'');
 assert.equal(await page.getByRole('menuitem',{name:/删除所选 2/}).getAttribute('aria-disabled'),'true');await page.getByText('所选 2 项 · 隐藏 1 项',{exact:true}).waitFor();await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>document.activeElement?.closest('[data-node-id]')?.getAttribute('data-node-id')),'A');
 await open('C',method);assert.equal(await page.getByTestId('selection').textContent(),'C');assert.equal(await page.getByTestId('primary').textContent(),'C');assert.equal(await page.getByTestId('action').textContent(),'');await page.keyboard.press('Escape');assert.equal(await page.getByTestId('selection').textContent(),'C');checks.push(`${method}: 保留隐藏选区、混合能力禁用、未选对象替换、取消恢复焦点且不打开对象`);
}await page.screenshot({path:resolve(output,'menus.png')});}finally{await writeFile(resolve(output,'menus.json'),JSON.stringify({environment:'正式 Storybook / Edge / 示例对象',checks},null,2));await browser.close();}
