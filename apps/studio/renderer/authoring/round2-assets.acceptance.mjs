import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true }), page = await browser.newPage(); page.setDefaultTimeout(45000);
const output = resolve('test-results/latest/studio-round2/components'); await mkdir(output, { recursive: true }); const checks = [];
try {
  await page.goto('http://127.0.0.1:6007/iframe.html?id=product-studio-assets-inspector--referenced&viewMode=story');
  const name = page.getByRole('textbox', { name: '素材名称' }); await name.waitFor();
  await name.press('F2'); await name.fill('取消改名'); await name.press('Escape'); assert.equal(await name.inputValue(), '雨站 · 原图与透明版本');
  await name.press('F2'); await name.fill('冲突'); await name.press('Enter'); await page.getByRole('alert').filter({ hasText: '名称已存在' }).waitFor(); assert.equal(await name.inputValue(), '冲突');
  await name.fill('新名字'); await name.press('Enter'); await page.getByTestId('action').filter({ hasText: '改名:新名字' }).waitFor();
  const referenced = await page.locator('[data-reference-preview] img').getAttribute('data-variant-id'); const current = await page.locator('.asset-details-version[data-active=true] img').getAttribute('data-variant-id'); assert.notEqual(referenced, current);
  await page.locator('[data-reference-preview]').getByRole('button', { name: '预览', exact: true }).click(); assert.equal(await page.getByTestId('action').textContent(), `预览:${referenced}`);
  await page.locator('.asset-details-version[data-active=true]').getByRole('button', { name: '查看版本' }).click(); assert.equal(await page.getByTestId('action').textContent(), `预览:${current}`);
  assert.equal(await page.locator('[data-reference-preview] img').getAttribute('data-variant-id'), referenced); checks.push('单项改名取消/失败/提交；引用 V1 与活动 V2 分开，查看 V2 不替换 V1');
  await page.locator('.authoring-shell').evaluate(node => node.scrollTop=0); await page.screenshot({ path: resolve(output, 'asset-inspector.png') });
  await page.goto('http://127.0.0.1:6007/iframe.html?id=product-studio-assets-inspector--missing&viewMode=story'); await page.locator('[data-reference-preview]').filter({ hasText: '此处引用版本缺失' }).waitFor(); assert.equal(await page.locator('[data-reference-preview] img').count(), 0); assert.equal(await page.locator('[data-reference-preview] button').count(), 0); checks.push('精确版缺失不回退到活动版预览');
  await page.goto('http://127.0.0.1:6007/iframe.html?id=product-studio-authoring-characters--global-roles&viewMode=story'); await page.getByRole('button', { name: '移除此角色', exact: true }).click(); const box = page.getByRole('alertdialog'); await box.waitFor(); assert.equal(await page.evaluate(() => document.activeElement?.textContent), '取消'); await page.keyboard.press('Escape'); await box.waitFor({ state: 'hidden' }); checks.push('角色删除使用 MessageBox，取消获得初始焦点并可 Esc 返回');
  await page.goto('http://127.0.0.1:6007/iframe.html?id=product-studio-project-settings--name-settings&viewMode=story');await page.getByLabel('姓名方式').selectOption('custom');await page.getByLabel('默认姓名').fill('春树测试');await page.getByRole('button',{name:'切换文档'}).click();await page.getByRole('button',{name:'切换文档'}).click();assert.equal(await page.getByLabel('默认姓名').inputValue(),'春树测试');await page.getByLabel('默认姓名').fill('错误');await page.getByRole('button',{name:'应用姓名设置'}).click();await page.getByRole('alert').filter({hasText:'保存失败'}).waitFor();assert.equal(await page.getByLabel('默认姓名').inputValue(),'错误');checks.push('中央姓名表单 A→B→A 保留输入，保存失败不关闭');
} finally { await writeFile(resolve(output, 'asset-inspector.json'), JSON.stringify({ environment: '正式 Storybook / Edge / 模拟素材接口', checks }, null, 2)); await browser.close(); }
