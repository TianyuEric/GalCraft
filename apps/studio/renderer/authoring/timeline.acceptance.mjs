import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const output = resolve('test-results/latest/player-website/w08/storybook'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 800 } }), errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
try {
  for (const story of ['long-sparse-tracks', 'dark', 'apply-failure']) {
    await page.goto(`http://127.0.0.1:6007/iframe.html?id=product-studio-authoring-animationtimeline--${story}&viewMode=story`);
    const timeline = page.getByRole('region', { name: '原生动画时间轴' }); await page.getByLabel('播放头定位').waitFor();
    const frame = page.getByRole('button', { name: /X 10[01]0 ms/ }).first(); const count = Number(await page.getByLabel('提交次数').textContent());
    const rect = await frame.boundingBox(); await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down(); await page.mouse.move(rect.x + 100, rect.y + rect.height / 2, { steps: 8 }); await page.mouse.up();
    if (story !== 'apply-failure') { await page.waitForFunction(count => Number(document.querySelector('[aria-label="提交次数"]').textContent) === count + 1, count); }
    else await page.getByRole('alert').waitFor();
    await page.getByLabel('播放头定位').fill('500'); await page.getByLabel('播放头定位').press('ArrowRight');
    const outputBefore = await page.getByLabel('实际采样').textContent(); await page.getByLabel('关键帧时刻 · ms').fill('-20'); await page.getByLabel('关键帧时刻 · ms').blur();
    await page.getByRole('alert').waitFor(); assert.equal(await page.getByLabel('关键帧时刻 · ms').inputValue(), '-20'); assert.equal(await page.getByLabel('实际采样').textContent(), outputBefore);
    assert(await page.getByLabel('轨道滚动区').evaluate(node => node.scrollWidth > node.clientWidth));
    await page.screenshot({ path: resolve(output, `${story}-900.png`), fullPage: true }); checks.push(`${story}: one drag commit, shared sample, invalid draft, horizontal scroll`);
  }
  for (const story of ['long-sequence', 'long-sequence-dark']) {
    await page.goto(`http://127.0.0.1:6007/iframe.html?id=product-studio-authoring-startupandhome--${story}&viewMode=story`); await page.getByLabel('片段停留 · ms').waitFor();
    assert.equal(await page.getByLabel('片段停留 · ms').inputValue(), '60000'); await page.getByLabel('出现时刻 · ms').fill('500'); await page.getByLabel('出现时刻 · ms').blur();
    assert.equal(await page.getByLabel('出现时刻 · ms').inputValue(), '500'); assert(await page.getByLabel('开屏时序滚动区').evaluate(node => node.scrollWidth > node.clientWidth));
    await page.screenshot({ path: resolve(output, `${story}-900.png`), fullPage: true }); checks.push(`${story}: sixty-second timing and overlap editable at 900px`);
  }
  assert.deepEqual(errors, []);
} finally { await writeFile(resolve(output, 'report.json'), JSON.stringify({ executedAt: new Date().toISOString(), checks, errors }, null, 2)); await browser.close(); }
