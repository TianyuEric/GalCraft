import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { chromium } = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const output = 'test-results/latest/studio-round2/components';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(45000);
const report = { environment: '正式 Storybook / Edge / 同源组件与内存业务夹具', result: 'failed', checks: [], errors: [] };
page.on('pageerror', error => report.errors.push(error.message));
const cases = [
  ['product-studio-authoring-pages--editor', 900, 'dark', 'normal', '.gc-workbench'],
  ['product-studio-authoring-pages--assets', 900, 'light', 'normal', '.authoring-asset-list'],
  ['product-studio-production-production-workflow--round-2-reviews', 1440, 'dark', 'normal', '.production-page'],
  ['product-studio-authoring-pages--projects', 900, 'light', 'empty', '.project-workbench'],
];
try {
  for (const locale of ['zh-CN', 'en', 'ja']) {
    for (const [story, width, theme, state, selector] of cases) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`http://127.0.0.1:6007/iframe.html?id=${story}&viewMode=story&args=locale:${locale};theme:${theme};state:${state}`);
      await page.locator(selector).first().waitFor();
      const applied = await page.locator('#app').evaluate(node => ({ theme: node.dataset.theme, locale: node.dataset.locale ?? node.parentElement.lang }));
      assert.deepEqual(applied, { theme, locale });
      if (story.endsWith('--round-2-reviews')) {
        await page.locator('.candidate-select').first().click();
        await page.getByRole('button', { name: { 'zh-CN': '审阅采用', en: 'Review adoption', ja: '採用を確認' }[locale], exact: true }).click();
        await page.locator('.production-review-document:not([hidden])').waitFor();
      }
      await page.evaluate(() => document.fonts.ready);
      const size = await page.evaluate(() => ({
        viewport: innerWidth, body: document.body.scrollWidth, root: document.documentElement.scrollWidth,
        inspector: document.querySelector('.gc-wb-inspector')?.getBoundingClientRect().width ?? null,
        center: document.querySelector('.gc-wb-document-content')?.getBoundingClientRect().width ?? null,
      }));
      assert(size.root <= width + 1 && size.body <= width + 1, JSON.stringify({ story, locale, size }));
      report.checks.push({ story, locale, width, theme, state, size });
      await page.screenshot({ path: `${output}/layout-${story.split('--')[1]}-${locale}.png` });
    }
  }
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
  console.log('T21: 12 layout states passed');
} catch (error) {
  report.errors.push(String(error));
  throw error;
} finally {
  await writeFile(`${output}/layout.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
