import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const { chromium } = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const output = resolve('test-results/latest/theme-controls');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = { environment: 'Windows Edge / formal Storybook shared components / illustrative data and portrait', checks: [], errors: [], result: 'failed' };
page.on('pageerror', error => report.errors.push(error.message));
const check = (target, expected, actual) => report.checks.push({ target, expected, actual, result: 'pass' });
const story = name => page.goto(`http://127.0.0.1:6007/iframe.html?id=product-studio-workbench-workbench-theme-and-controls--${name}&viewMode=story`);
try {
  for (const theme of ['light', 'dusk']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await story(theme); await page.locator('.gc-workbench').waitFor();
    const surfaces = await page.locator('.gc-workbench').evaluate(root => Object.fromEntries(['activity', 'explorer', 'central', 'inspector'].map(part => [part, getComputedStyle(root.querySelector(`.gc-wb-${part}`)).backgroundColor])));
    assert.equal(new Set(Object.values(surfaces)).size, 4);
    if (theme === 'light') assert.deepEqual(surfaces, { activity: 'rgb(242, 242, 249)', explorer: 'rgb(250, 251, 253)', central: 'rgb(255, 255, 255)', inspector: 'rgb(246, 248, 252)' });
    const portrait = await page.locator('.authoring-direction-thumbnail').evaluate(image => ({ fit: getComputedStyle(image).objectFit, complete: image.complete, ratio: image.naturalHeight / image.naturalWidth }));
    assert.equal(portrait.fit, 'contain'); assert.equal(portrait.complete, true); assert(portrait.ratio > 2);
    const selected = await page.locator('.authoring-card.selected').evaluate(card => getComputedStyle(card).backgroundColor);
    assert.notEqual(selected, surfaces.central);
    const treeToggle = await page.locator('.gc-wb-tree-toggle').evaluate(button => ({ background: getComputedStyle(button).backgroundColor, border: getComputedStyle(button).borderWidth }));
    assert.equal(treeToggle.background, 'rgba(0, 0, 0, 0)'); assert.equal(treeToggle.border, '0px');
    check(`${theme}四区与卡片`, '四区底色分明，纵向缩略图完整等比；树展开按钮没有输入框边界', { surfaces, portrait, selected, treeToggle });

    const strip = page.locator('.gc-wb-documents'); await strip.hover(); await page.mouse.wheel(0, 600);
    await page.waitForFunction(() => document.querySelector('.gc-wb-documents').scrollLeft > 0);
    const wheelPosition = await strip.evaluate(element => element.scrollLeft);
    await page.locator('[data-slot="workbench-document-tab"]').first().focus(); await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelector('.gc-wb-document[data-active="true"]')?.dataset.documentId === 'document-11');
    const lastVisible = await strip.evaluate(element => { const active = element.querySelector('[data-active="true"]').getBoundingClientRect(), bounds = element.getBoundingClientRect(); return active.right <= bounds.right + 1 && active.left >= bounds.left - 1; });
    assert(lastVisible); await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelector('.gc-wb-documents').scrollLeft === 0);
    check(`${theme}文档标签`, '竖向鼠标滚轮横向移动，End/Home选择并滚入当前标签', { wheelPosition, lastVisible });

    const trigger = page.getByRole('combobox', { name: '取景', exact: true }); await trigger.click();
    await page.getByRole('listbox').waitFor(); assert.equal(await page.locator('[data-slot="select-item-indicator"]').count(), 1);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-slot="select-value"]')?.textContent === '完整立绘');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '取景');
    await page.locator('.gc-choice-trigger').click(); await page.locator('.gc-choice-search').fill('14');
    await page.getByRole('option', { name: '配音连接 14 · 多语言长名称', exact: true }).click();
    assert.match(await page.locator('.gc-choice-trigger').textContent(), /配音连接 14/);
    const hiddenInputs = await page.locator('input[aria-hidden="true"]').evaluateAll(inputs => inputs.map(input => ({ height: input.getBoundingClientRect().height, clip: getComputedStyle(input).clipPath })));
    assert(hiddenInputs.length >= 2); assert(hiddenInputs.every(input => input.height === 1 && input.clip === 'inset(50%)'));
    check(`${theme}选择控件`, '单一勾选、键盘选择后恢复焦点；长列表可搜索；隐藏输入保留1px裁剪', { hiddenInputs });
    await page.screenshot({ path: join(output, `${theme}-1440.png`), scale: 'css' });

    await page.setViewportSize({ width: 900, height: 760 });
    await page.getByRole('button', { name: '显示或隐藏Inspector', exact: true }).click();
    await page.locator('.gc-wb-inspector').waitFor();
    const narrow = await page.locator('.gc-workbench').evaluate(root => ({ width: root.getBoundingClientRect().width, scroll: root.scrollWidth, inspector: root.querySelector('.gc-wb-inspector').getBoundingClientRect().width, editor: root.querySelector('.gc-wb-central').getBoundingClientRect().width }));
    assert(narrow.scroll <= 900); assert(narrow.inspector >= 248); assert(narrow.editor > 400);
    await trigger.click(); await page.getByRole('listbox').waitFor(); await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '取景');
    check(`${theme}900px`, 'Inspector获得真实列宽，中央不溢出；Esc返回选择控件', narrow);
    await page.screenshot({ path: join(output, `${theme}-900.png`), scale: 'css' });
  }
  await story('no-auxiliary-panel'); await page.locator('.gc-workbench').waitFor();
  assert.equal(await page.locator('.gc-wb-bottom').count(), 0); assert.equal(await page.locator('.gc-wb-editor').isVisible(), true);
  check('无辅助底栏', '没有可用面板时中央编辑区释放底部高度', { panelCount: 0, editorVisible: true });
  assert.deepEqual(report.errors, []); report.result = 'pass';
} finally {
  await writeFile(join(output, 'acceptance.json'), JSON.stringify(report, null, 2));
  await browser.close(); console.log(JSON.stringify(report, null, 2));
}
