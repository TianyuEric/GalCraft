import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const { chromium } = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const output = resolve('test-results/latest/studio-round2/components'); await mkdir(output,{recursive:true});
const browser = await chromium.launch({channel:'msedge',headless:true}); const page=await browser.newPage({viewport:{width:1440,height:900}});
page.setDefaultTimeout(15000); const checks=[], errors=[]; page.on('pageerror',error=>errors.push(error.message));
const name=()=>page.getByRole('textbox',{name:'工作流名称',exact:true}); const row=id=>page.locator(`[data-node-id="${id}"]`);
try {
 await page.goto('http://127.0.0.1:6007/iframe.html?id=product-studio-production-production-workflow--round-2-workflows&viewMode=story');
 await page.getByRole('tab',{name:'连接与工具',exact:true}).click({timeout:45000}); await row('FlowAA').click();
 assert.equal(await name().inputValue(),'黄昏背景 · 可复用图像流程'); await row('FlowBB').click(); assert.equal(await name().inputValue(),'角色立绘 · 图像流程');
 assert.equal(await row('FlowBB').getAttribute('aria-selected'),'true'); checks.push('清洁 A→B 同步树/编辑器');
 await row('FlowAA').click(); await name().fill('A 保留编辑'); await name().evaluate(node=>{node.setSelectionRange(2,5);window.workflowInput=node});
 await row('FlowBB').click(); await row('FlowAA').click(); assert.equal(await name().inputValue(),'A 保留编辑');
 assert.equal(await name().evaluate(node=>node===window.workflowInput),true); assert.equal(await name().evaluate(node=>node.selectionStart),2); checks.push('dirty A→B→A 保留同一输入与选区');
 await page.getByRole('button',{name:'关闭A 保留编辑',exact:true}).click(); const box=page.getByRole('alertdialog'); await box.waitFor();
 assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'继续编辑'); await page.getByRole('button',{name:'继续编辑',exact:true}).click();
 await name().fill('保存失败'); await page.getByRole('button',{name:'关闭保存失败',exact:true}).click(); await page.getByRole('button',{name:'保存并关闭',exact:true}).click(); await box.getByRole('alert').waitFor();
 await page.getByRole('button',{name:'继续编辑',exact:true}).click(); assert.equal(await name().inputValue(),'保存失败'); checks.push('关闭默认安全焦点、失败保留输入');
 await name().fill('已保存 A'); await page.getByRole('button',{name:'校验并保存',exact:true}).click(); await page.locator('.workflow-document-content:visible').getByText('尚无新修改',{exact:true}).waitFor();
 await name().fill('第二次保存 A'); await page.getByRole('button',{name:'校验并保存',exact:true}).click(); await page.locator('.workflow-document-content:visible').getByText('尚无新修改',{exact:true}).waitFor(); checks.push('连续保存更新 expectedRevision 与基线');
 await page.screenshot({path:resolve(output,'workflows.png')}); assert.deepEqual(errors,[]);
} finally {await writeFile(resolve(output,'workflows.json'),JSON.stringify({environment:'正式 Storybook / Edge / 内存工作流服务',checks,errors},null,2)); await browser.close();}
