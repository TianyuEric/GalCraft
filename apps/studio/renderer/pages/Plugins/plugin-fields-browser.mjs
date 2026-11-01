import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const require = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url);
const { chromium } = require('playwright');
const output = resolve('test-results/latest/plugin-development');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
const report = { environment: 'Formal Studio Storybook · Microsoft Edge headless · 900×760', executedAt: new Date().toISOString(), records: [], errors: [], result: 'failed' };
page.on('pageerror', error => report.errors.push(String(error)));
await mkdir(output, { recursive: true });
const data = async () => JSON.parse(await page.locator('output[aria-label="业务字段值"]').textContent());
const first = () => page.getByRole('textbox', { name: 'JSON配置 1', exact: true });
const valid = async () => first().evaluate(node => node.validity.valid);
const record = (target, data, expected, actual, evidence) => report.records.push({ target, environment: report.environment, data, expected, actual, result: 'passed', evidence });
try {
  for (const theme of ['light', 'dark']) {
    const story = theme === 'dark' ? 'json-array-dark' : 'json-array';
    await page.goto(`http://127.0.0.1:6007/iframe.html?id=product-studio-plugins-plugin-fields--${story}&viewMode=story`);
    await first().waitFor();
    assert.equal(JSON.parse(await first().inputValue()).name, 'A');
    await page.getByRole('button', { name: '移除JSON配置 1', exact: true }).click();
    assert.deepEqual(JSON.parse(await first().inputValue()), { name: 'B', enabled: false });
    assert.deepEqual((await data()).items, [{ name: 'B', enabled: false }]);
    const formatted = '{  "name": "B edited", "enabled": false }';
    await first().fill(formatted);
    assert.equal(await first().inputValue(), formatted);
    assert.deepEqual((await data()).items, [{ name: 'B edited', enabled: false }]);
    await first().press('Home'); await first().press('ArrowRight'); await first().press('Space');
    assert.equal(await first().inputValue(), '{   "name": "B edited", "enabled": false }');
    assert.equal(await first().evaluate(node => node.selectionStart), 2);
    const deletionImage = `json-array-${theme}-900.png`;
    await page.screenshot({ path: join(output, deletionImage), fullPage: true });
    record('JSON array deletion and subsequent editing', `${theme}; public array item of type object without children; A/B`, 'Deleting A displays B; valid editing preserves formatting and caret and commits B data', 'B displayed; edited B retained in business value; whitespace and keyboard caret retained', [`test-results/latest/plugin-development/${deletionImage}`]);

    const draft = '{ "name":';
    await first().fill(draft);
    assert.equal(await valid(), false);
    assert.equal(await page.getByRole('alert').count(), 1);
    await page.getByRole('textbox', { name: '备注', exact: true }).fill('独立字段修改');
    assert.equal(await first().inputValue(), draft);
    assert.equal(await valid(), false);
    assert.deepEqual((await data()).items, [{ name: 'B edited', enabled: false }]);
    record('Invalid JSON draft survives unrelated edits', `${theme}; unfinished JSON; edit note field`, 'Invalid text stays editable while business value keeps the last valid JSON', 'Draft and field error retained; note changed; previous valid B data retained', []);

    await page.getByRole('button', { name: '载入外部配置', exact: true }).click();
    assert.deepEqual(JSON.parse(await first().inputValue()), { name: '外部配置', enabled: true });
    assert.equal(await valid(), true);
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.getByRole('button', { name: '恢复两项配置', exact: true }).click();
    await first().fill(draft);
    assert.equal(await valid(), false);
    await page.getByRole('button', { name: '移除JSON配置 1', exact: true }).click();
    assert.deepEqual(JSON.parse(await first().inputValue()), { name: 'B', enabled: false });
    assert.equal(await valid(), true);
    assert.equal(await page.getByRole('alert').count(), 0);
    const validityImage = `json-array-validity-${theme}-900.png`;
    await page.screenshot({ path: join(output, validityImage), fullPage: true });
    record('External replacement and reused row validity', `${theme}; invalid JSON followed by external replacement; invalid A followed by deletion`, 'New valid external value displays and clears both customValidity and field error', 'External configuration and retained B displayed; validity recovered; alerts cleared', [`test-results/latest/plugin-development/${validityImage}`]);

    await page.getByRole('button', { name: '移除JSON配置 1', exact: true }).click();
    assert.equal(await first().count(), 0);
    await page.getByRole('button', { name: '添加一项', exact: true }).click();
    assert.equal(await first().inputValue(), '{}');
    assert.deepEqual((await data()).items, [{}]);
    assert.equal(await valid(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    record('Empty JSON array and new object item', `${theme}; delete all rows and add one`, 'No stale text or validity remains in the newly added default object', 'Empty array accepted; new object displayed as {}; no horizontal overflow', []);

    const count = page.getByRole('spinbutton', { name: '可空数量', exact: true });
    assert.equal(await count.inputValue(), '10');
    await count.fill('');
    assert.equal(await count.inputValue(), '');
    assert.equal((await data()).count, null);
    const character = page.getByRole('combobox', { name: '可空角色', exact: true });
    assert.equal(await character.textContent(), '杏');
    await character.click();
    await page.getByRole('option', { name: '请选择', exact: true }).click();
    assert.equal((await character.textContent()).trim(), '请选择');
    assert.equal((await data()).character, null);
    record('Explicit nullable number and reference values', `${theme}; number default 10; reference default CharAA`, 'Clearing number and selecting Choose keeps the controls empty and commits null', 'Number stayed empty; reference showed Choose; both business values stayed null', []);
  }
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
} catch (error) {
  report.failure = String(error);
  throw error;
} finally {
  await writeFile(join(output, 'json-array-field.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
