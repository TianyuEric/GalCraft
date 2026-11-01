import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
const evidence = resolve('test-results/sh6-mobile/ui'); await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true }), records = [];
try {
  for (const [story, width, name] of [['product-studio-publish-mobile-targets--android', 1440, 'android-ready'], ['product-studio-publish-mobile-targets--android-dark', 390, 'android-dark-narrow'], ['product-studio-publish-mobile-targets--ios', 1440, 'ios-project'], ['product-studio-publish-mobile-targets--missing-builder', 390, 'missing-builder']]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }); const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://localhost:6007/iframe.html?id=${story}&viewMode=story`);
    await page.getByRole('region', { name: '移动目标设置' }).waitFor();
    if (name === 'android-ready') await page.getByText('环境可用', { exact: true }).waitFor();
    if (name === 'android-dark-narrow') { await page.getByLabel('应用 ID', { exact: true }).waitFor(); await page.getByRole('button', { name: '选择工具目录' }).click(); await page.getByRole('button', { name: '检测环境', exact: true }).click(); await page.getByText('环境可用', { exact: true }).waitFor(); }
    if (name === 'ios-project') await page.getByLabel('Bundle ID', { exact: true }).waitFor();
    if (name === 'missing-builder') await page.getByText('此目标没有可用构建器，请在插件页安装目标包。').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth); assert.equal(overflow, false, name);
    assert.deepEqual(errors, [], name); const screenshot = join(evidence, `${name}.png`); await page.screenshot({ path: screenshot, fullPage: true }); records.push({ story, width, overflow, errors, screenshot }); await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://localhost:6007/iframe.html?id=product-studio-publish-publish-workflow--saved-release&viewMode=story');
  await page.getByRole('button', { name: 'Android APK / AAB' }).click(); await page.getByRole('region', { name: '移动目标设置' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Android APK / AAB' }).getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: join(evidence, 'publish-android.png'), fullPage: true }); await page.close();
  await writeFile(join(evidence, 'interactions.json'), JSON.stringify({ result: 'passed', records, publishTargetSelection: true }, null, 2));
} finally { await browser.close(); }
