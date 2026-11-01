import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const output='test-results/latest/ui-registry/components';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage();
const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
try{for(const [theme,width] of [['light',1440],['dusk',900]]){
 await page.setViewportSize({width,height:900});await page.goto(`http://127.0.0.1:6007/iframe.html?id=components-registry-components--${theme}&viewMode=story`);
 const input=page.getByRole('combobox',{name:'组件命令'});await input.waitFor();await input.fill('场景');await input.press('ArrowDown');await input.press('Enter');await page.locator('output').filter({hasText:'打开'}).waitFor();
 await input.fill('不存在');await page.getByText('没有匹配项',{exact:true}).waitFor();await input.fill('');
 await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('menuitem',{name:'只读操作'}).waitFor();assert.equal(await page.getByRole('menuitem',{name:'只读操作'}).getAttribute('aria-disabled'),'true');await page.keyboard.press('Escape');
 await page.getByText('右键对象',{exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'右键预览'}).click();await page.locator('output').filter({hasText:'右键预览'}).waitFor();
 await page.getByRole('button',{name:'参数',exact:true}).click();await page.getByRole('textbox',{name:'参数名称'}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'删除确认',exact:true}).click();await page.getByRole('alertdialog').waitFor();assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'取消');await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('alertdialog').waitFor({state:'hidden'});await page.getByRole('tab',{name:'场景二'}).click();await page.getByRole('tabpanel').filter({hasText:'场景二内容'}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${output}/${theme}.png`,fullPage:true});checks.push(`${theme}/${width}: command, dropdown, context, popover, alert focus, tabs, toolbar`);
}assert.deepEqual(errors,[]);}finally{await writeFile(`${output}/registry.json`,JSON.stringify({stage:'Storybook before production wiring',checks,errors},null,2));await browser.close();}
console.log(checks);
