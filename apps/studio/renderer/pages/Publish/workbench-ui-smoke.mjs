import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const { chromium } = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const evidence = resolve('test-results/latest/publish-plugins-workbench');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(12000);
const report = { environment: 'Microsoft Edge / formal Storybook / in-memory business fixtures', executedAt: new Date().toISOString(), records: [], errors: [], result: 'failed' };
page.on('pageerror', error => report.errors.push(error.message));
const record = (target, data, expected, actual, files = []) => report.records.push({ target, environment: report.environment, data, expected, actual, result: 'passed', evidence: files });
const open = async (id, root = '.publish-desktop-workbench') => { await page.goto(`http://127.0.0.1:6007/iframe.html?id=${id}&viewMode=story`); await page.locator(root).waitFor(); };
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const shot = async name => { const path = `${evidence}/${name}.png`; await page.screenshot({ path }); return path; };
const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
const check = async () => { await button('检查已保存版本').click(); await page.locator('.publish-check-results').waitFor(); };
const releaseObject = async name => { const toggle = button('发行导航'); if (await toggle.isVisible()) await toggle.click(); await page.getByRole('treeitem', { name: new RegExp(`^${name}`) }).click(); };
const backToBuild = () => button('返回检查与构建').click();
const packageObject = () => page.getByRole('treeitem', { name: /角色关系与剧情资料扩展/ }).click();
try {
  await open('product-studio-publish-publish-workflow--saved-release');
  assert.equal(await page.locator('[data-field=version] input').inputValue(), '0.1.0');
  await button('检查已保存版本').click();
  assert(await page.locator('[data-field=output] input').evaluate(element => document.activeElement === element));
  await button('选择目录').click(); await check();
  assert(await button('确认构建').isEnabled());
  await page.locator('[data-field=output] input').fill('D:/发行/第二版');
  assert.equal(await page.locator('.publish-check-results').count(), 0);
  await page.locator('[data-field=version] input').fill('1.1.0'); await button('应用版本修改').click();
  await page.getByText('有未保存修改', { exact: true }).waitFor();
  await button('检查已保存版本').click(); await page.locator('.publish-check-error').filter({ hasText: '尚未保存' }).waitFor();
  await button('选用上次保存版本').click(); await check(); await button('确认构建').click(); await page.locator('.publish-receipt').waitFor();
  await button('本机体验').click(); await page.locator('.publish-receipt').getByText('本机体验 · 已通过', { exact: true }).waitFor();
  record('Saved release and invalidation', 'Saved 0.1.0; unsaved 1.1.0; selected output', 'Configuration changes require a new plan; last saved snapshot can build while working edits remain', 'Required field receives focus; unsaved release rejected; saved release builds and local test reports passed', [await shot('publish-result-light')]);

  await open('product-studio-publish-publish-workflow--blocked-check'); await button('选择目录').click(); await check(); assert(await button('确认构建').isDisabled());
  await button('查看相关设置').click(); assert(await page.locator('[data-publish-settings=assets]').evaluate(element => element.contains(document.activeElement)));
  await page.getByRole('combobox', { name: '字体处理', exact: true }).click(); await page.getByRole('option', { name: '静态文字子集＋完整回退', exact: true }).click();
  await backToBuild(); await check(); assert(await button('确认构建').isEnabled());
  record('Diagnostic navigation', 'Font blocker', 'Related settings open as a persistent document and receive focus', 'Font setting focused; edit invalidates plan; returning and checking enables build');

  for (const width of [1440, 900]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 900 });
    await open(`product-studio-publish-publish-workflow--long-results${theme === 'dark' ? '-dark' : ''}`);
    await page.getByText('诊断：1 项阻塞 · 61 项警告 · 31 项提示', { exact: true }).waitFor();
    const list = page.getByRole('region', { name: '检查诊断', exact: true });
    assert.equal(await list.locator('.publish-issue').count(), 93);
    assert(await list.evaluate(element => element.clientHeight <= 280 && element.scrollHeight > element.clientHeight));
    const search = page.getByRole('textbox', { name: '搜索诊断', exact: true });
    await search.fill('第 92 幅'); assert.equal(await list.locator('.publish-issue').count(), 1);
    await page.getByText('另有 1 项阻塞未在搜索结果中显示，仍需修复。', { exact: true }).waitFor(); assert(await button('确认构建').isDisabled());
    await button('显示全部诊断').click(); await list.focus(); await page.keyboard.press('PageDown');
    await page.waitForFunction(() => document.querySelector('.publish-issue-list')?.scrollTop > 0);
    await noOverflow();
    record('Release layout and long results', `${theme} / ${width}px / 93 diagnostics`, 'Independent central scrolling, readable theme, blockers remain effective under search', 'No horizontal overflow; bounded results scroll by keyboard; filtered blocker continues disabling build', [await shot(`publish-${theme}-${width}`)]);
  }
  await open('product-studio-publish-publish-workflow--long-engine-history');
  await releaseObject('引擎版本与历史'); await page.locator('.publish-engine-document').waitFor();
  assert.equal(await page.locator('.publish-engine-document').getByRole('button', { name: '备份当前作品并恢复切换前副本', exact: true }).count(), 16);
  await page.locator('.publish-document-scroll').evaluate(element => element.scrollTop = element.scrollHeight);
  const engineAction = await button('准备升级副本并验证').boundingBox(); assert(engineAction && engineAction.y + engineAction.height <= 900);
  await noOverflow(); record('Engine history document', '16 recorded upgrades / 900px', 'History and actions are reachable in the center', 'Persistent engine document scrolls to its actions within viewport', [await shot('engine-history-900')]);
  await open('product-studio-publish-publish-workflow--empty-assets'); await releaseObject('素材与字体'); await page.getByText('没有可额外保留的素材', { exact: true }).waitFor();
  await open('product-studio-publish-publish-workflow--long-check-failure'); await page.locator('.publish-check-error').waitFor(); assert((await page.locator('.publish-check-error').innerText()).includes('素材 70')); assert(await button('检查已保存版本').isEnabled());
  record('Empty and failure states', 'No assets / 70-line check failure', 'Empty explanation and persistent retryable error', 'Both states reachable; failure leaves check action enabled');

  await open('product-studio-plugins-plugin-retry--retry', '.plugin-desktop-workbench');
  await button('安装插件').click(); let document = page.getByRole('region', { name: '安装插件包', exact: true });
  await document.getByLabel('本机路径', { exact: true }).fill('D:/插件/角色关系.galplugin');
  await button('检查', document).click(); await document.getByRole('alert').filter({ hasText: '插件包暂时无法读取' }).waitFor();
  assert.equal(await document.getByLabel('本机路径', { exact: true }).inputValue(), 'D:/插件/角色关系.galplugin');
  await button('检查', document).click(); await document.locator('.plugin-inspection').waitFor();
  await button('确认安装', document).click(); await document.getByRole('alert').filter({ hasText: '安装目录暂时不可写' }).waitFor();
  await button('确认安装', document).click(); await document.waitFor({ state: 'hidden' });
  await button('开发目录').click(); document = page.getByRole('region', { name: '加载开发目录', exact: true });
  await button('检查', document).click(); await document.getByRole('alert').filter({ hasText: '开发入口暂时无法读取' }).waitFor();
  await button('检查', document).click(); await document.waitFor({ state: 'hidden' });
  record('Plugin install and development retries', 'Package path; first inspect/install/development attempt fails', 'Preserve inputs and retry through existing services', 'Path and inspection remain; subsequent success closes the persistent editor');

  for (const width of [1440, 900]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 900 });
    await open(`product-studio-plugins-plugin-retry--${theme === 'dark' ? 'dark' : 'long-impact'}`, '.plugin-desktop-workbench');
    await packageObject(); await button('插件属性').click(); await noOverflow();
    const inspector = page.locator('.plugin-local-inspector'); assert(await inspector.isVisible());
    await button('查看影响').click(); document = page.getByRole('region', { name: '插件变更影响', exact: true });
    assert.equal(await document.locator('.plugin-impact').count(), 12);
    await button('确认变更', document).click(); await document.getByRole('alert').filter({ hasText: '关联修改' }).waitFor();
    await noOverflow();
    record('Plugin impact and Inspector layout', `${theme} / ${width}px / 12 changes`, 'Inspector takes real width; impact confirmation and error remain reachable', 'Selected package properties visible; apply error remains with retry; no horizontal overflow', [await shot(`plugins-${theme}-${width}`)]);
    await button('确认变更', document).click(); await document.waitFor({ state: 'hidden' });
  }
  await open('product-studio-plugins-plugin-retry--empty', '.plugin-desktop-workbench'); await page.getByText('安装插件后，在作品中启用需要的版本。', { exact: true }).waitFor();
  await open('product-studio-plugins-plugin-retry--workbench', '.plugin-desktop-workbench'); await page.getByRole('heading', { name: '角色关系与剧情资料扩展 · 贡献与诊断', exact: true }).waitFor();
  await page.getByRole('treeitem', { name: /角色关系与剧情资料扩展/ }).focus(); await page.keyboard.press('Enter'); assert(await button('查看影响').isVisible());
  record('Plugin object navigation', 'Empty packages; keyboard opening selected package', 'Empty state and package diagnostics stay accessible', 'Tree Enter opens diagnostics and keeps impact action reachable');
  assert.deepEqual(report.errors, []); report.result = 'passed';
} catch (error) { report.errors.push(error.stack ?? String(error)); await shot('failure'); throw error; }
finally { await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report, null, 2));
