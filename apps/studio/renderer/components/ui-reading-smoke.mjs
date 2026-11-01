import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const { chromium } = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const evidence = resolve(import.meta.dirname, '../../../../test-results/latest/ui-reading-workflow/components');
const origin = process.env.GALCRAFT_STORYBOOK_URL ?? 'http://127.0.0.1:6007';
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 902 }, permissions: ['clipboard-read', 'clipboard-write'] });
page.setDefaultTimeout(12000);
const report = { environment: 'Chromium / formal Storybook components', checks: [], errors: [], result: 'failed' };
page.on('pageerror', error => report.errors.push(error.message));
const open = async id => { await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`); };
const shot = name => page.screenshot({ path: join(evidence, `${name}.png`), scale: 'css' });
try {
  await open('product-studio-production-creation-preset--official');
  await page.getByRole('tab', { name: '提示词与规则' }).click();
  const prompt = page.locator('.gc-text-preview:visible').nth(1);
  assert.equal(await page.locator('.gc-code-block:visible').count(), 0);
  assert.equal(await prompt.getByRole('button').count(), 1);
  const original = await prompt.locator('.gc-text-preview-body').innerText();
  await prompt.getByRole('button', { name: '复制文本' }).click();
  assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n','\n'), original);
  assert.equal(await prompt.locator('.gc-template-variable').count(), 2);
  await shot('preset-light');
  await page.locator('#studio-portals').evaluate(el => el.dataset.theme = 'dark');
  await page.setViewportSize({ width: 900, height: 650 });
  await shot('preset-dark-900');
  report.checks.push('Preset prose has one copy action, preserves placeholders and exact clipboard text; light/dark and 900px captured.');

  await open('components-interactive-table--light');
  const table = page.locator('.gc-table');
  const originalRow = () => table.locator('tbody tr').filter({ hasText: '01 ·' });
  await originalRow().getByRole('textbox').fill('排序后保留');
  await page.getByRole('button', { name: '资料', exact: true }).click();
  await page.getByRole('button', { name: '资料', exact: true }).click();
  assert.match(await table.locator('tbody tr').first().innerText(), /18 ·/);
  await page.getByRole('textbox', { name: '搜索资料', exact: true }).fill('01 ·');
  await originalRow().getByRole('checkbox').uncheck();
  await originalRow().getByRole('combobox').click();
  await page.getByRole('option', { name: '完整内容' }).click();
  assert.equal(await originalRow().getByRole('textbox').inputValue(), '排序后保留');
  assert.equal(await originalRow().getByRole('checkbox').isChecked(), false);
  assert.equal(await originalRow().getByRole('combobox').innerText(), '完整内容');
  await originalRow().getByRole('button', { name: '查看' }).click();
  await page.getByRole('status').filter({ hasText: '当前查看 item-0' }).waitFor();
  await shot('table-interactions-900');
  await page.getByRole('textbox', { name: '搜索资料', exact: true }).fill('没有这样的资料');
  await table.getByText('没有匹配资料').waitFor();
  report.checks.push('Sorting and filtering preserve edited row identity; checkbox, select, input and action cells work; empty result is explicit.');

  for (const theme of ['light', 'dark']) {
    await open(`components-reading-and-feedback--${theme}`);
    await page.getByRole('button', { name: '短通知', exact: true }).click();
    const toast = page.locator('.studio-toast').last();
    await toast.waitFor();
    const dimensions = await toast.evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, font: getComputedStyle(el.querySelector('.studio-toast-title')).fontSize }));
    assert.equal(dimensions.font, '14px');
    assert(dimensions.width <= 191 && dimensions.height <= 38);
    await toast.locator('button[aria-label="关闭通知"]').click();
    await page.getByRole('button', { name: '长通知', exact: true }).click();
    await shot(`toast-${theme}`);
    report.checks.push({ target: `Toast ${theme}`, actual: dimensions });
  }
  await open('product-studio-workbench-save-changes--scene-net-changes');
  await page.locator('.save-fields-table').first().waitFor();
  assert(await page.getByRole('columnheader', { name: '保存前', exact: true }).count());
  assert(await page.getByRole('cell', { name: '关闭', exact: true }).count() || await page.getByRole('cell', { name: '未设置', exact: true }).count());
  await shot('save-comparison');
  report.checks.push('Save review retains before/after field values and groups.');
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
} finally {
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report));
