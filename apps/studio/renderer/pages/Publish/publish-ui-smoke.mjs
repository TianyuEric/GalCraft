import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const { chromium } = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const evidence = resolve('test-results/latest/publish-plugins-ui');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(12000);
const report = { environment: 'Microsoft Edge / Storybook in-memory business fixtures', checks: [], errors: [], result: 'failed' };
page.on('pageerror', error => report.errors.push(error.message));
const record = (name, actual) => report.checks.push({ name, actual, result: 'pass' });
const open = async (name, root = '.publish-workflow') => {
  await page.goto(`http://127.0.0.1:6007/iframe.html?id=${name}&viewMode=story`);
  await page.locator(root).waitFor();
};
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const shot = name => page.screenshot({ path: `${evidence}/${name}.png` });
const primary = locator => locator.evaluate(element => element.classList.contains('bg-primary'));
const chooseOutput = () => button('选择目录').click();
const check = async () => { await button('检查已保存版本').click(); await page.locator('.publish-check-results').waitFor(); };
const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
try {
  await open('product-studio-publish-publish-workflow--saved-release');
  assert.equal(await page.locator('.publish-advanced').getAttribute('open'), null);
  assert.equal(await page.locator('.publish-configuration [data-field=version] input').inputValue(), '0.1.0');
  assert(await primary(button('检查已保存版本')));
  await shot('publish-light');
  await button('检查已保存版本').click();
  assert.equal(await page.locator('[data-field=output] input').evaluate(element => document.activeElement === element), true);
  await chooseOutput();
  await check();
  assert(await primary(button('确认构建')));
  assert.equal(await primary(button('检查已保存版本')), false);
  await page.locator('[data-field=output] input').fill('D:/发行/第二版');
  assert.equal(await page.locator('.publish-check-results').count(), 0);
  assert.equal(await button('确认构建').count(), 0);
  record('Configuration, required output focus, primary action and invalidation', 'Version grouped with target; changing output clears checked plan and requires a new check.');

  await page.locator('[data-field=version] input').fill('1.1.0');
  await button('应用版本修改').click();
  await page.getByText('有未保存修改', { exact: true }).waitFor();
  await button('检查已保存版本').click();
  await page.locator('.publish-checks [role=alert]').filter({ hasText: '尚未保存' }).waitFor();
  await button('选用上次保存版本').click();
  assert.equal(await page.locator('[data-field=version] input').inputValue(), '0.1.0');
  await check();
  await page.getByText('有未保存修改', { exact: true }).waitFor();
  await button('确认构建').click();
  await page.locator('.publish-receipt').waitFor();
  assert((await page.locator('.publish-receipt').innerText()).includes('未执行'));
  assert(await primary(button('打开输出目录')));
  await button('本机体验').click();
  await page.locator('.publish-receipt').getByText('本机体验 · 已通过', { exact: true }).waitFor();
  await shot('publish-result');
  record('Saved snapshot selection and result', 'Unsaved 1.1.0 is rejected; last saved 0.1.0 builds while working changes remain dirty; local test transitions from 未执行 to 已通过.');

  await open('product-studio-publish-publish-workflow--blocked-check');
  await chooseOutput(); await check();
  assert(await button('确认构建').isDisabled());
  await button('查看相关设置').click();
  assert.notEqual(await page.locator('.publish-advanced').getAttribute('open'), null);
  assert(await page.locator('[data-publish-settings=assets]').evaluate(element => element.contains(document.activeElement)));
  await page.getByRole('combobox', { name: '字体处理', exact: true }).click();
  await page.getByRole('option', { name: '静态文字子集＋完整回退', exact: true }).click();
  assert.equal(await page.locator('.publish-check-results').count(), 0);
  await check();
  assert.equal(await button('确认构建').isDisabled(), false);
  record('Blocking issue location and retry', 'Blocker remains visible; related-settings action expands and focuses fonts; changed option invalidates plan and recheck enables build.');

  await open('product-studio-publish-publish-workflow--failed-playtest');
  await chooseOutput(); await check(); await button('确认构建').click(); await page.locator('.publish-receipt').waitFor(); await button('本机体验').click();
  await page.locator('.publish-receipt').getByText('本机体验 · 未通过', { exact: true }).waitFor();
  record('Failed result label', 'A failed local playtest is persistently labeled 未通过.');

  for (const width of [1440, 900]) {
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: width === 900 ? 720 : 1000 });
      await open(`product-studio-publish-publish-workflow--long-results${theme === 'dark' ? '-dark' : ''}`);
      await page.getByText('诊断：1 项阻塞 · 61 项警告 · 31 项提示', { exact: true }).waitFor();
      const list = page.getByRole('region', { name: '检查诊断', exact: true });
      assert.equal(await list.locator('.publish-issue').count(), 93);
      assert((await list.locator('.publish-issue').first().innerText()).includes('请为动态文字选择完整回退字体'));
      assert.equal(await page.locator('.publish-capabilities').getAttribute('open'), null);
      assert(await list.evaluate(element => element.clientHeight <= 280 && element.scrollHeight > element.clientHeight));
      await page.locator('.publish-checks').evaluate(element => element.scrollIntoView({ block: 'start' }));
      const buildBefore = await button('确认构建').boundingBox();
      assert(buildBefore.y >= 0 && buildBefore.y + buildBefore.height <= (width === 900 ? 720 : 1000));
      await list.focus(); await page.keyboard.press('PageDown');
      await page.waitForFunction(() => document.querySelector('.publish-issue-list')?.scrollTop > 0);
      assert.equal((await button('确认构建').boundingBox()).y, buildBefore.y);
      const search = page.getByRole('textbox', { name: '搜索诊断', exact: true });
      await search.fill('第 92 幅');
      assert.equal(await list.locator('.publish-issue').count(), 1);
      await page.getByText('另有 1 项阻塞未在搜索结果中显示，仍需修复。', { exact: true }).waitFor();
      assert(await button('确认构建').isDisabled());
      await search.fill('没有这个素材');
      await list.getByText('没有匹配的诊断。', { exact: true }).waitFor();
      assert(await button('确认构建').isDisabled());
      await button('显示全部诊断').click();
      assert.equal(await list.locator('.publish-issue').count(), 93);
      await list.evaluate(element => element.scrollTop = 0);
      await page.locator('.publish-checks').evaluate(element => element.scrollIntoView({ block: 'start' }));
      await noOverflow(); await shot(`publish-long-results-${theme}-${width}`);
      await page.locator('.publish-capabilities > summary').click();
      const capabilities = page.getByRole('region', { name: '目标能力检查', exact: true });
      assert.equal(await capabilities.locator('.publish-capability').count(), 92);
      assert(await capabilities.evaluate(element => element.clientHeight <= 280 && element.scrollHeight > element.clientHeight));
      await capabilities.evaluate(element => element.scrollTop = element.scrollHeight);
      await capabilities.getByText('org.galcraft.assets / asset-92', { exact: true }).waitFor({ state: 'visible' });
      await noOverflow();
    }
  }
  record('Long diagnostics, filtering and capability details', 'At 900px and 1440px in light/dark themes, 93 diagnostics are locally scrollable with the blocker first. Search cannot enable build or hide the full blocker count. Keyboard scrolling keeps build actions in place; all 92 capability details remain available in a collapsed, bounded region.');
  await button('查看相关设置').click();
  assert(await page.locator('[data-publish-settings=assets]').evaluate(element => element.contains(document.activeElement)));
  await page.getByRole('combobox', { name: '字体处理', exact: true }).click();
  await page.getByRole('option', { name: '静态文字子集＋完整回退', exact: true }).click();
  await check();
  await page.getByText('诊断：0 项阻塞 · 61 项警告 · 31 项提示', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: '搜索诊断', exact: true }).inputValue(), '');
  assert.equal(await button('确认构建').isDisabled(), false);
  await button('确认构建').click(); await page.locator('.publish-receipt').waitFor();
  record('Long-result repair and build', 'The blocker still focuses the corresponding advanced setting. Rechecking after the edit preserves all 92 non-blocking diagnostics, resets search and enables a successful build.');

  await open('product-studio-publish-publish-workflow--long-check-failure');
  const longError = page.locator('.publish-check-error');
  await longError.waitFor();
  assert(await longError.evaluate(element => element.clientHeight <= 160 && element.scrollHeight > element.clientHeight));
  await page.locator('.publish-checks').evaluate(element => element.scrollIntoView({ block: 'start' }));
  await longError.focus(); await page.keyboard.press('End');
  await longError.evaluate(element => element.scrollTop = element.scrollHeight);
  assert((await longError.innerText()).includes('素材 70'));
  assert(await button('检查已保存版本').isEnabled());
  await noOverflow(); await shot('publish-long-error-900');
  record('Long check error', 'A 70-line check failure stays in a bounded, keyboard-focusable error region with the check action reachable for retry.');

  await page.setViewportSize({ width: 900, height: 720 });
  await open('product-studio-publish-publish-workflow--dark'); await noOverflow(); await shot('publish-dark-900');
  await open('product-studio-publish-publish-workflow--long-engine-history');
  const trigger = page.getByRole('button', { name: '引擎版本与历史 · 0.1.0', exact: true });
  await trigger.click(); const sheet = page.getByRole('dialog'); await sheet.waitFor();
  assert((await sheet.getAttribute('class')).includes('gc-sheet'));
  const footerBefore = await sheet.locator('.gc-dialog-footer').boundingBox();
  await sheet.locator('.gc-dialog-body').evaluate(element => element.scrollTop = element.scrollHeight);
  const footerAfter = await sheet.locator('.gc-dialog-footer').boundingBox();
  assert.equal(footerBefore.y, footerAfter.y); assert(footerAfter.y + footerAfter.height <= 720);
  await shot('engine-history-900'); await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'hidden' });
  assert(await trigger.evaluate(element => document.activeElement === element));
  record('Engine sheet and narrow theme', 'At 900px the long history scrolls independently, the action footer stays visible, and Escape returns focus to the engine trigger.');
  await open('product-studio-publish-publish-workflow--empty-assets'); await page.locator('.publish-advanced > summary').click(); await page.getByText('没有可额外保留的素材', { exact: true }).waitFor(); await noOverflow();
  record('Empty asset state', 'Advanced settings show a neutral empty asset list.');

  await open('product-studio-plugins-plugin-retry--retry', '.plugins-page');
  await button('安装插件').click(); let dialog = page.getByRole('dialog');
  await dialog.getByLabel('本机路径', { exact: true }).fill('D:/插件/角色关系.galplugin');
  await button('检查', dialog).click(); await dialog.getByRole('alert').filter({ hasText: '插件包暂时无法读取' }).waitFor();
  assert.equal(await dialog.getByLabel('本机路径', { exact: true }).inputValue(), 'D:/插件/角色关系.galplugin');
  await button('检查', dialog).click(); await dialog.locator('.plugin-inspection').waitFor();
  await button('确认安装', dialog).click(); await dialog.getByRole('alert').filter({ hasText: '安装目录暂时不可写' }).waitFor();
  await shot('plugin-install-error-900');
  await button('确认安装', dialog).click(); await dialog.waitFor({ state: 'hidden' });
  await button('开发目录').click(); dialog = page.getByRole('dialog');
  await button('检查', dialog).click(); await dialog.getByRole('alert').filter({ hasText: '开发入口暂时无法读取' }).waitFor();
  await button('检查', dialog).click(); await dialog.waitFor({ state: 'hidden' });
  record('Install and development retries', 'Inspect, install and load-development failures remain in their modal; path and inspection survive retry and each subsequent success closes the modal.');

  await open('product-studio-plugins-plugin-retry--dark', '.plugins-page');
  await button('查看影响').click(); dialog = page.getByRole('dialog');
  await dialog.locator('.plugin-impact').first().waitFor();
  const impactFooter = await dialog.locator('.gc-dialog-footer').boundingBox();
  await dialog.locator('.gc-dialog-body').evaluate(element => element.scrollTop = element.scrollHeight);
  assert.equal(impactFooter.y, (await dialog.locator('.gc-dialog-footer').boundingBox()).y);
  await button('确认变更', dialog).click(); await dialog.getByRole('alert').filter({ hasText: '关联修改' }).waitFor();
  const errorFooter = await dialog.locator('.gc-dialog-footer').boundingBox(); assert(errorFooter.y + errorFooter.height <= 720);
  await shot('plugin-impact-error-dark-900'); await noOverflow();
  await button('确认变更', dialog).click(); await dialog.waitFor({ state: 'hidden' });
  record('Long impact and apply retry', 'Twelve changes scroll under a fixed footer; failed apply remains visible with retry; dark 900px layout has no horizontal overflow.');
  assert.deepEqual(report.errors, []); report.result = 'passed';
} catch (error) {
  report.errors.push(error.stack ?? String(error)); await shot('failure'); throw error;
} finally {
  await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2)); await browser.close();
}
console.log(JSON.stringify(report, null, 2));
