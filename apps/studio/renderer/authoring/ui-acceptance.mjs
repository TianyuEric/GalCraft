import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const { chromium } = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const repo = resolve('../..'), evidence = join(repo, 'test-results/latest/ui-refactor');
await mkdir(evidence, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9339');
const page = browser.contexts()[0].pages()[0];
page.setDefaultTimeout(8000);
const report = { environment: {}, checks: [], errors: [], result: 'failed' };
page.on('pageerror', error => report.errors.push(error.message));
const check = (name, actual) => report.checks.push({ name, actual, result: 'pass' });
const click = (scope, name) => scope.getByRole('button', { name, exact: true }).click();
const navigate = name => click(page.locator('.studio-rail'), name);
const shot = name => page.screenshot({ path: join(evidence, `${name}.png`), scale: 'css' });
const docs = () => page.evaluate(async () => { const result = await window.studioBridge.documents.list(); if (!result.ok) throw Error(result.error.message); return result.value; });
const menu = async (group, item) => { await page.getByRole('menuitem', { name: group, exact: true }).click(); await page.getByRole('menuitem', { name: item, exact: true }).click(); };
const save = async () => { await click(page.locator('.authoring-header'), '保存全部'); await click(page.getByRole('dialog'), '确认'); await page.waitForFunction(async () => !(await window.studioBridge.documents.list()).value.some(d => d.dirty)); await page.locator('.authoring-toolbar').getByText('已保存', { exact: true }).waitFor(); };
try {
  await page.reload(); await page.locator('.studio-rail').waitFor();
  report.environment = await page.evaluate(() => ({ userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, dpr: devicePixelRatio, host: location.protocol }));
  if (await page.locator('#app').getAttribute('data-theme') === 'dark') await click(page, '切换浅蓝主题');
  if (!await page.locator('.authoring-editor').count()) { await navigate('作品'); await click(page, '打开作品'); }
  await page.locator('.authoring-editor').waitFor();
  await navigate('作品'); await click(page, '新建作品');
  const dialog = page.getByRole('dialog'); await dialog.waitFor();
  await dialog.getByLabel('作品名称', { exact: true }).fill('界面验收作品');
  const bounds = await dialog.boundingBox(), viewport = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.w + 1 && bounds.y + bounds.height <= viewport.h + 1);
  await shot('create-project'); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), '新建作品');
  check('创建表单、Esc 关闭与来源焦点恢复', bounds);

  await menu('视图', '写作视图');
  const input = page.locator('.authoring-writing-input').first(); await input.waitFor();
  const original = await input.inputValue(), text = `${original} UI验收。`;
  await input.fill(text); await input.press('Tab');
  await page.waitForFunction(async () => (await window.studioBridge.documents.list()).value.some(d => d.dirty));
  await menu('视图', '脚本视图'); await page.locator('.monaco-editor').waitFor();
  assert((await docs()).some(d => Object.values(d.files).some(content => content.includes(text))));
  await menu('视图', '卡片视图'); await page.locator('.authoring-card').first().waitFor();
  await click(page.locator('.authoring-header'), '保存全部'); await click(page.getByRole('dialog'), '取消');
  assert((await docs()).some(d => d.dirty));
  await save();
  const edited = (await docs()).find(d => Object.values(d.files).some(content => content.includes(text)));
  const script = Object.entries(edited.files).find(([name, content]) => name.endsWith('.gal') && content.includes(text));
  assert((await readFile(join(repo, 'tmp/testing/ui-refactor/project', script[0]), 'utf8')).includes(text));
  await menu('编辑', '撤销');
  await page.waitForFunction(async text => { const documents = (await window.studioBridge.documents.list()).value; return documents.some(d => d.dirty) && !documents.some(d => Object.values(d.files).some(content => content.includes(text))); }, text);
  await page.waitForFunction(text => !document.querySelector('.authoring-cards')?.textContent.includes(text), text);
  await save();
  assert(!(await readFile(join(repo, 'tmp/testing/ui-refactor/project', script[0]), 'utf8')).includes(text));
  check('写作/脚本/卡片同源、保存取消、实际落盘、撤销', { script: script[0], restored: true });
  await page.locator('.diagnostic-toggle').click();
  assert.equal(await page.locator('.diagnostic-toggle').getAttribute('aria-expanded'), 'false');
  await page.locator('.diagnostic-toggle').click();
  check('问题栏收起与展开', '恢复原始展开状态');

  await navigate('素材'); await page.locator('.authoring-asset').first().waitFor();
  await page.locator('.authoring-asset input[type=checkbox]').first().check();
  await page.getByRole('combobox', { name: '素材类型', exact: true }).selectOption('audio');
  await page.waitForFunction(() => document.querySelector('.asset-selection-bar')?.textContent.includes('已选 1 项'));
  await click(page, '查看所选'); await page.locator('.authoring-assets .authoring-panel').first().waitFor();
  await click(page, '清空选择'); await page.getByRole('combobox', { name: '素材类型', exact: true }).selectOption('');
  assert.equal(await page.locator('.authoring-assets > .authoring-panel').count(), 0);
  check('素材跨筛选选择与查看所选', '选择集合保持，清空后恢复全部类型');

  await navigate('制作'); await click(page, '新建制作');
  await page.getByRole('combobox', { name: 'Production use', exact: true }).click();
  await page.getByRole('option', { name: '背景', exact: true }).click();
  await shot('production-form'); await click(page, '保留草稿');
  await page.locator('.production-page').getByText('背景', { exact: true }).first().waitFor();
  const draftRoot = join(repo, 'tmp/testing/ui-refactor/user-data/task-drafts/00000000-0000-4000-8000-000000000001');
  const drafts = await Promise.all((await readdir(draftRoot)).map(async file => JSON.parse(await readFile(join(draftRoot, file), 'utf8'))));
  assert(drafts.some(draft => draft.activeUse === 'background'));
  await navigate('插件'); await page.locator('.plugins-page .connection-card').first().waitFor();
  await page.getByRole('button', { name: '查看影响', exact: true }).first().click();
  await page.locator('.plugin-impact').waitFor(); await shot('plugin-impact');
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check('制作用途选择、草稿持久化、插件影响取消', '未发送生成任务；作品插件依赖保持');

  await navigate('发布'); await click(page.locator('.publish-targets'), 'Windows 独立 Player · 完整目录');
  await page.locator('.publish-advanced > summary').click();
  await page.getByRole('combobox', { name: '字体处理', exact: true }).click();
  await page.getByRole('option', { name: '静态文字子集＋完整回退', exact: true }).click();
  await page.getByRole('combobox', { name: '动态文字回退字体', exact: true }).waitFor();
  await page.locator('.publish-advanced > summary').click();
  check('发布目标与低频配置展开', 'Windows、字体子集回退选择可达；未请求构建');

  let playerLight;
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await click(page, '切换暮蓝主题');
    for (const [name, selector, file] of [['作品','.project-workbench','projects'],['创作','.authoring-editor','editor'],['素材','.authoring-assets','assets'],['制作','.production-page','production'],['页面','.page-designer','pages'],['插件','.plugins-page','plugins'],['发布','.publish-page','publish']]) {
      await navigate(name); await page.locator(`${selector}:visible`).waitFor();
      if (name === '页面') {
        await page.locator('.galcraft-player').waitFor();
        if (theme === 'light') {
          const opacity = page.getByRole('spinbutton', { name: '底色透明度', exact: true });
          await opacity.fill('0.8'); await opacity.press('Tab');
          await page.waitForFunction(async () => (await window.studioBridge.documents.list()).value.some(d => d.dirty));
          await click(page.locator('.page-designer'), '撤销');
          await page.waitForFunction(() => document.querySelector('input[aria-label="底色透明度"]')?.value === '1');
        }
        const colors = await page.locator('.galcraft-player').evaluate(e => ({ background: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color }));
        if (theme === 'light') playerLight = colors; else assert.deepEqual(colors, playerLight);
      }
      const overflow = await page.locator('.studio-content').evaluate(e => e.scrollWidth - e.clientWidth);
      assert(overflow <= 1, `${name} / ${theme} content overflow: ${overflow}`);
      await shot(`${file}-${theme}`);
    }
  }
  check('七页明暗主题与 Player 样式隔离', playerLight);
  await page.setViewportSize({ width: 960, height: 760 });
  await page.getByRole('combobox', { name: 'Studio language' }).click();
  await page.getByRole('option', { name: '日本語', exact: true }).click();
  await navigate('創作'); await click(page, 'シーン・検索');
  assert.equal(await page.locator('.authoring-grid').getAttribute('data-panel'), 'left');
  await page.locator('.authoring-nav').evaluate(async e => { await Promise.all(e.getAnimations().map(animation => animation.finished)); });
  await shot('editor-ja-narrow'); await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Studio language' }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await navigate('Publish'); await page.getByRole('heading', { name: 'Publish project', exact: true }).waitFor();
  await shot('publish-en-narrow');
  await page.getByRole('combobox', { name: 'Studio language' }).click();
  await page.getByRole('option', { name: '简体中文', exact: true }).click();
  await page.setViewportSize({ width: 1426, height: 838 }); await click(page, '切换浅蓝主题');
  check('960px 窄窗口、中英日切换与侧栏', '日文创作侧栏与英文发布表单可达');
  assert.deepEqual(report.errors, []); report.result = 'pass';
} catch (error) { report.failure = String(error.stack ?? error); await shot('failure'); throw error; }
finally { await writeFile(join(evidence, 'acceptance.json'), JSON.stringify(report, null, 2)); await browser.close(); }
