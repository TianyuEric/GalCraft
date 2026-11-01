import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const { chromium } = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const output = resolve('test-results/latest/publish-plugins-workbench/registrations');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(12000);
const report = { environment: 'Formal Studio Storybook / Edge headless / in-memory registry fixture', executedAt: new Date().toISOString(), records: [], errors: [], result: 'failed' };
page.on('pageerror', error => report.errors.push(error.message));
try {
  for (const width of [1440, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:6007/iframe.html?id=product-studio-plugins-plugin-retry--duplicate-registrations&viewMode=story');
    const rows = page.getByRole('treeitem', { name: /角色关系与剧情资料扩展/ });
    await rows.first().waitFor(); assert.equal(await rows.count(), 2);
    const firstKey = await rows.nth(0).getAttribute('data-node-id'), secondKey = await rows.nth(1).getAttribute('data-node-id');
    assert.notEqual(firstKey, secondKey);
    await rows.nth(0).click();
    assert.equal(await rows.nth(0).getAttribute('aria-selected'), 'true');
    assert.equal(await rows.nth(1).getAttribute('aria-selected'), 'false');
    await page.getByText('bundledCommand', { exact: true }).waitFor();
    await rows.nth(1).click();
    assert.equal(await rows.nth(0).getAttribute('aria-selected'), 'false');
    assert.equal(await rows.nth(1).getAttribute('aria-selected'), 'true');
    await page.getByText('installedCommand', { exact: true }).waitFor();
    assert.equal(await page.getByText('bundledCommand', { exact: true }).count(), 0);
    await page.getByRole('button', { name: '查看影响', exact: true }).click();
    await page.getByRole('region', { name: '插件变更影响', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('[role="treeitem"]')[1]?.textContent?.includes('另一插件'));
    assert.equal(await rows.nth(0).getAttribute('data-node-id'), firstKey);
    assert.equal(await rows.nth(1).getAttribute('data-node-id'), secondKey);
    assert.equal(await rows.nth(1).getAttribute('aria-selected'), 'true');
    await page.getByRole('button', { name: '插件属性', exact: true }).click();
    await page.getByText('本机安装的包清单', { exact: true }).waitFor();
    await page.getByRole('button', { name: '贡献与诊断', exact: true }).click();
    await page.getByText('installedCommand', { exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const screenshot = `${output}/duplicate-registrations-${width}.png`;
    await page.screenshot({ path: screenshot });
    report.records.push({ target: 'Unique plugin registration selection and details', environment: report.environment, data: `${width}px; bundled and installed manifests share ID/version/development; unrelated entry changes list position after refresh`, expected: 'One row selected; chosen manifest supplies diagnostics and Inspector; refresh retains the chosen registration', actual: 'Unique row keys; first and second registration select independently; second manifest remains selected after unrelated row movement and impact review', result: 'passed', evidence: [screenshot] });
  }
  assert.deepEqual(report.errors, []); report.result = 'passed';
} catch (error) { report.errors.push(error.stack ?? String(error)); await page.screenshot({ path: `${output}/failure.png` }); throw error; }
finally { await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report, null, 2));
