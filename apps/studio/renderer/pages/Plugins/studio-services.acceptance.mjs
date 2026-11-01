import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const evidence = resolve('test-results/latest/plugin-studio-services');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const report = { environment: 'Windows Edge, formal Storybook using the production Plugins page with fixture IPC data', records: [], errors: [], result: 'failed' };
const cases = [
  ['default-services', 'zh-CN', 1440, 'light'],
  ['default-services-dark', 'zh-CN', 900, 'dark'],
  ['default-services-english', 'en', 900, 'light'],
  ['default-services-japanese', 'ja', 900, 'light'],
  ['localization', 'zh-CN', 1440, 'light'],
  ['missing-dependency', 'zh-CN', 900, 'light'],
  ['empty', 'zh-CN', 900, 'light'],
];
try {
  for (const [story, locale, width, theme] of cases) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(`http://127.0.0.1:6007/iframe.html?id=product-studio-plugins-plugin-retry--${story}&viewMode=story`);
    await page.locator('.plugins-page').waitFor({ timeout: 60000 });
    if (story === 'localization') {
      await page.locator('.plugins-page[data-side="inspector"]').waitFor();
      assert(await page.getByRole('heading', { name: '角色关系与剧情资料扩展', level: 2 }).isVisible());
      assert.equal(await page.getByRole('treeitem', { name: /角色关系与剧情资料扩展/ }).getAttribute('aria-selected'), 'true');
    } else if (story.startsWith('default-services')) {
      if (locale === 'zh-CN') await page.getByRole('heading', { name: '角色关系与剧情资料扩展', level: 2 }).waitFor();
      const services = page.locator('[data-node-id="studio-services"]');
      await services.waitFor();
      assert.equal(await services.getAttribute('aria-level'), '1');
      assert.equal(await page.locator('[data-node-id="installed"]').getAttribute('aria-level'), '1');
      for (const id of ['org.galcraft.generation-services', 'org.galcraft.comfyui', 'org.galcraft.novelai']) {
        const row = page.locator(`[data-node-id^="${id}/"]`);
        await row.click();
        assert.equal(await page.getByRole('button', { name: /启用到作品|停用此版本|切换到此版本|Enable in project|Disable this version|Switch to this version|作品で有効化|このバージョンを無効化|このバージョンに切替/ }).count(), 0);
        assert.equal(await page.locator('.plugin-overview').getByText(/作品未启用|作品已启用|Not enabled in project|Enabled in project|作品で無効/).count(), 0);
      }
      const row = page.locator('[data-node-id^="org.galcraft.comfyui/"]');
      await row.focus();
      await page.keyboard.press('Enter');
      assert.equal(await row.getAttribute('aria-selected'), 'true');
      if (width === 900) {
        await page.getByRole('button', { name: /插件属性|Plugin properties|プラグインのプロパティ/ }).click();
        assert(await page.locator('.plugin-inspector-facts').isVisible());
        assert.equal(await page.locator('.plugin-inspector-facts').getByText(/作品未启用|Not enabled|作品で無効/).count(), 0);
        await page.getByRole('button', { name: /插件列表|Plugins|プラグイン一覧/, exact: true }).click();
      }
    } else if (story === 'missing-dependency') await page.getByText('缺失的作品依赖', { exact: true }).waitFor();
    else await page.getByText('本机尚未安装插件', { exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(evidence, `${story}.png`), scale: 'css' });
    report.records.push({ target: story, data: { locale, width, theme }, expected: 'Accurate grouping/status/actions, accessible keyboard selection, no viewport overflow', actual: 'Assertions passed', result: 'passed' });
    await page.close();
  }
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
} catch (error) { report.error = error.stack; process.exitCode = 1; }
finally {
  await browser.close();
  await writeFile(join(evidence, 'browser.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
