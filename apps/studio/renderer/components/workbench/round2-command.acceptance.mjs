import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:900,height:800}});page.setDefaultTimeout(45000);
try {
await page.goto('http://127.0.0.1:6007/iframe.html?id=product-studio-workbench-command-center--search-and-commands&viewMode=story');
await page.locator('output').filter({hasText:'检查剧情引用'}).waitFor();
await page.getByRole('button',{name:'打开命令中心'}).click();
await page.getByRole('button',{name:/应用命令/}).click();
const search=page.getByRole('combobox',{name:'搜索作品与命令'});await search.fill('>删除');
const option=page.getByRole('option',{name:/删除所选素材/});await option.waitFor();assert.equal(await option.getAttribute('aria-disabled'),'true');
await search.press('Enter');assert.equal(await page.getByRole('dialog').count(),1);
await search.fill('>检查');await page.getByRole('option',{name:/检查剧情引用/}).waitFor();
await search.dispatchEvent('keydown',{key:'Enter',isComposing:true});assert.equal(await page.getByRole('dialog').count(),1);
await search.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
await page.getByRole('button',{name:'打开命令中心'}).click();await page.getByRole('button',{name:/应用命令/}).click();await page.getByRole('combobox').fill('>检查');await page.getByRole('option',{name:/检查剧情引用/}).click();
assert.equal(await page.locator('output').textContent(),'检查剧情引用');console.log('Command Center Storybook passed: object/command mode, disabled reason, IME, Esc, plugin selection, 900px');
} finally {await browser.close();}
