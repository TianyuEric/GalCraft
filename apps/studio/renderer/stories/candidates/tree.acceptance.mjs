import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium, _electron } from 'playwright';

const base = process.env.STORYBOOK_URL || 'http://127.0.0.1:6007';
const evidence = process.env.TREE_EVIDENCE || 'test-results/ui-candidates-batch2-20261018';
await mkdir(evidence, { recursive: true });
const native = process.env.TREE_ELECTRON ? await _electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [fileURLToPath(new URL('./tests/electron-host.cjs', import.meta.url))] }) : null;
const browser = native ? null : await chromium.launch({ channel: 'chrome', headless: true });
const page = native ? await native.firstWindow() : await browser.newPage({ viewport: { width: 1440, height: 900 } });
const runtimeVersion = native ? await native.evaluate(() => `Electron ${process.versions.electron} / Chromium ${process.versions.chrome}`) : await browser.version();
page.setDefaultTimeout(8000);
const results = [], errors = [], measurements = [];
page.on('pageerror', error => errors.push(String(error)));
const row = id => page.locator(`[data-node-id="${id}"]`);
const state = async () => JSON.parse(await page.getByTestId('tree-state').textContent());
const count = async () => Number((await page.getByTestId('history-count').textContent()).split(' ')[0]);
const shot = async name => { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: `${evidence}/${name}.png`, animations: 'disabled' }); };
const story = async (name = 'try-candidates') => {
  await page.goto(`${base}/iframe.html?id=product-studio-component-comparison-batch-2--${name}&viewMode=story`);
  await page.locator('.tree-document-body').waitFor({ timeout: 60000 });
  // Storybook play returns the experience to its unfiltered starting state.
  if (name === 'try-candidates') await page.waitForFunction(() => document.querySelector('[aria-label="筛选章节与场景"]')?.value === '' && document.querySelector('.tree-selection-info')?.textContent.includes('已选 1 项'));
};
const waitCount = n => page.waitForFunction(expected => Number(document.querySelector('[data-testid="history-count"]')?.textContent.split(' ')[0]) === expected, n);
const drag = async (fromId, toId, where = 'middle', cancel = false, expectTarget = true) => {
  const from = await row(fromId).boundingBox(), to = await row(toId).boundingBox();
  await page.mouse.move(from.x + 90, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(from.x + 96, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + 90, to.y + (where === 'top' ? 2 : where === 'bottom' ? to.height - 2 : to.height / 2), { steps: 12 });
  await page.mouse.move(to.x + 91, to.y + (where === 'top' ? 2 : where === 'bottom' ? to.height - 2 : to.height / 2));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.mouse.move(to.x + 92, to.y + (where === 'top' ? 2 : where === 'bottom' ? to.height - 2 : to.height / 2));
  // HTML5 hover is frame-coalesced. Release only when the user-visible destination is ready.
  try {
    if (expectTarget && where === 'middle' && fromId.startsWith('s') && toId.startsWith('ch')) await page.waitForFunction(id => document.querySelector(`[data-node-id="${id}"]`)?.classList.contains('is-drop-target'), toId);
  } finally { if (!expectTarget) await page.keyboard.press('Escape'); }
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
};
async function check(id, run) {
  if (process.env.TREE_CASES && !process.env.TREE_CASES.split(',').some(prefix => id.startsWith(prefix))) return;
  errors.length = 0;
  try { await run(); assert.deepEqual(errors, []); results.push({ id, result: 'PASS' }); }
  catch (error) { results.push({ id, result: 'FAIL', error: String(error), pageErrors: [...errors] }); await shot(`${id}-failure`); await page.keyboard.press('Escape'); await page.mouse.up(); }
  console.log(JSON.stringify(results.at(-1)));
}
try {
  await check('T01-focus-expand', async () => {
    await story(); await row('s2').click(); await page.keyboard.press('ArrowDown');
    assert.deepEqual((await state()).selected, ['s2']); assert.equal(await row('s3').evaluate(n => n.classList.contains('is-focused')), true);
    await page.keyboard.press('Enter'); assert.equal((await state()).active, 's3');
    assert.deepEqual((await state()).selected, ['s3']);
    assert.equal(await row('s3').evaluate(n => n.classList.contains('is-selected') && n.closest('[role="treeitem"]').getAttribute('aria-selected') === 'true'), true);
    assert.equal(await row('s2').evaluate(n => n.classList.contains('is-selected') || n.closest('[role="treeitem"]').getAttribute('aria-selected') === 'true'), false);
    assert.equal(await count(), 0); await shot('keyboard-enter-selection');
    await page.keyboard.press('ArrowUp'); assert.deepEqual((await state()).selected, ['s3']);
    await page.keyboard.press('Enter'); assert.equal((await state()).active, 's2'); assert.deepEqual((await state()).selected, ['s2']);
    await page.getByRole('button', { name: '折叠 第一章 · 雨站来信' }).click(); assert.equal(await row('s1').count(), 0);
    await page.getByRole('button', { name: '展开 第一章 · 雨站来信' }).click(); assert.equal(await row('s1').count(), 1);
  });
  await check('T02-rename-cancel-commit-undo', async () => {
    await story(); await row('s2').click(); await page.keyboard.press('F2');
    const input = page.getByRole('textbox', { name: '重命名 街角', exact: true }); await input.fill('新街角'); await input.press('Escape'); assert.equal(await count(), 0);
    await page.keyboard.press('F2'); await input.fill('新街角'); await input.press('Enter'); await waitCount(1); assert.ok((await row('s2').textContent()).includes('新街角'));
    await page.getByRole('button', { name: '撤销', exact: true }).click(); assert.ok((await row('s2').textContent()).includes('街角')); assert.equal(await count(), 0);
  });
  await check('T03-rename-validation-retry', async () => {
    await story('rename-failure'); await row('s2').click(); await page.keyboard.press('F2');
    const input = page.getByRole('textbox', { name: '重命名 街角', exact: true }); await input.fill('新街角'); await input.press('Enter');
    await page.getByRole('alert').waitFor(); assert.equal(await input.inputValue(), '新街角'); await shot('rename-failure'); await input.press('Enter'); await waitCount(1);
    await page.keyboard.press('F2'); const updated = page.getByRole('textbox', { name: '重命名 新街角', exact: true });
    await updated.fill('站台'); await updated.press('Enter'); await waitCount(2); assert.equal((await state()).active, 's2');
    await page.keyboard.press('F2'); const duplicate = page.getByRole('textbox', { name: '重命名 站台', exact: true });
    await duplicate.fill(' '); await duplicate.press('Enter'); await page.getByText('请输入名称。', { exact: true }).waitFor(); await duplicate.press('Escape');
  });
  await check('T04-multiselect-filter', async () => {
    await story(); await row('s1').click(); await row('s3').click({ modifiers: ['Shift'] }); assert.deepEqual((await state()).selected, ['s1', 's2', 's3']);
    await row('s2').click({ modifiers: ['Control'] }); assert.deepEqual((await state()).selected, ['s1', 's3']);
    await page.getByRole('textbox', { name: '筛选章节与场景' }).fill('站台'); assert.deepEqual((await state()).selected, ['s1', 's3']); await shot('hidden-selection');
    await row('s4').click({ modifiers: ['Control'] }); assert.deepEqual((await state()).selected, ['s1', 's3', 's4']);
    await page.getByRole('button', { name: '清除筛选', exact: true }).click(); assert.equal(await row('s3').evaluate(n => n.classList.contains('is-selected')), true);
    await page.getByRole('button', { name: '清空选区' }).click(); assert.deepEqual((await state()).selected, []);
  });
  await check('T05-context-scope', async () => {
    await story(); await row('s1').click(); await row('s2').click({ modifiers: ['Control'] }); await row('s1').click({ button: 'right' });
    await page.getByRole('menu').waitFor(); assert.deepEqual((await state()).selected, ['s1', 's2']); await page.keyboard.press('Escape');
    await row('s5').click({ button: 'right' }); await page.getByRole('menu').waitFor(); assert.deepEqual((await state()).selected, ['s5']); await page.keyboard.press('Escape');
    await row('s2').click(); await page.keyboard.press('Shift+F10'); await page.getByRole('menu').waitFor(); await shot('context-menu');
    await page.getByRole('menuitem', { name: '移动到 第三章 · 告别', exact: true }).click(); await waitCount(1); assert.deepEqual((await state()).order[2].children, ['s6', 's2']);
  });
  await check('T06-drag-same-parent', async () => {
    await story(); await drag('s1', 's3', 'bottom'); await waitCount(1); assert.deepEqual((await state()).order[0].children, ['s2', 's3', 's1']); await shot('same-parent-reordered');
    await page.getByRole('button', { name: '撤销', exact: true }).click(); assert.deepEqual((await state()).order[0].children, ['s1', 's2', 's3']);
  });
  await check('T07-drag-many-cross-parent', async () => {
    await story(); await row('s1').click(); await row('s2').click({ modifiers: ['Control'] }); await drag('s1', 'ch2'); await waitCount(1);
    assert.deepEqual((await state()).order[0].children, ['s3']); assert.equal((await state()).order[1].children.length, 4); await shot('cross-chapter-moved');
  });
  await check('T08-drag-invalid-cancel', async () => {
    await story(); const before = (await state()).order; await drag('ch1', 'ch2'); assert.equal(await count(), 0); assert.deepEqual((await state()).order, before);
    await drag('s1', 'ch2', 'middle', true); assert.equal(await count(), 0); assert.deepEqual((await state()).order, before);
  });
  await check('T09-chapter-reorder-keyboard', async () => {
    await story(); await row('ch1').click(); await page.getByRole('button', { name: '下移', exact: true }).click(); await waitCount(1); assert.deepEqual((await state()).order.map(n => n.id), ['ch2', 'ch1', 'ch3']);
  });
  await check('T10-readonly-empty-no-results', async () => {
    await story('readonly'); await row('s2').click(); await page.keyboard.press('F2'); assert.equal(await page.locator('.tree-rename').count(), 0); await drag('s1', 'ch2', 'middle', false, false); assert.equal(await count(), 0);
    await story('empty'); assert.deepEqual((await state()).selected, []); await page.getByRole('button', { name: '载入示例' }).click(); assert.equal(await row('s2').count(), 1);
    await page.getByRole('textbox', { name: '筛选章节与场景' }).fill('不存在的对象'); await page.getByText('没有匹配对象。', { exact: false }).waitFor(); await shot('no-results');
  });
  await check('T11-baseline-compare', async () => {
    await story('baseline'); await row('s2').click(); await page.keyboard.press('ArrowDown'); assert.deepEqual((await state()).selected, ['s3']);
    await row('s2').click(); await page.getByRole('textbox', { name: '筛选章节与场景' }).fill('站台'); assert.deepEqual((await state()).selected, ['s2']); await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    await drag('s1', 'ch2'); await waitCount(1); assert.deepEqual((await state()).order[1].children, ['s4', 's5', 's1']);
    await row('s2').click({ button: 'right' }); await page.getByRole('menuitem', { name: '移动到 第三章 · 告别', exact: true }).click(); await waitCount(2); assert.deepEqual((await state()).order[2].children, ['s6', 's2']);
  });
  await check('T12-large-tree', async () => {
    await story('large'); assert.equal(await page.locator('.arborist-node').count() < 50, true);
    const viewport = page.locator('.candidate-arborist');
    const start = performance.now(); await viewport.hover(); await page.mouse.wheel(0, 100000); await page.waitForFunction(() => document.querySelector('.arborist-node')?.getAttribute('data-node-id') !== 'chapter-0');
    measurements.push({ kind: 'arborist', nodes: 5100, depth: 2, renderedRows: await page.locator('.arborist-node').count(), wheelUntilChangedMs: Math.round(performance.now() - start) }); await shot('large-candidate');
    const baselineStart = performance.now(); await page.getByRole('button', { name: '现有 ObjectTree', exact: true }).click(); await page.waitForFunction(() => document.querySelectorAll('.gc-wb-tree-row').length === 5100);
    measurements.push({ kind: 'baseline', nodes: 5100, depth: 2, renderedRows: await page.locator('.gc-wb-tree-row').count(), switchUntilRowsMs: Math.round(performance.now() - baselineStart) }); await shot('large-baseline');
  });
  await check('V01-same-scene-themes-widths', async () => {
    for (const width of [1440, 900]) {
      await page.setViewportSize({ width, height: 900 });
      for (const variant of ['try-candidates', 'baseline']) {
        await story(variant); await shot(`${variant}-light-${width}`);
        await page.getByRole('button', { name: '切换明暗主题' }).click(); await shot(`${variant}-dark-${width}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (variant === 'try-candidates') assert.equal(await page.locator('.candidate-arborist').evaluate(n => n.scrollWidth <= n.clientWidth), true);
        if (variant === 'try-candidates') assert.equal(await page.locator('.arborist-more').first().evaluate(n => n.getBoundingClientRect().width >= 28 && n.getBoundingClientRect().height >= 28), true);
      }
    }
  });
  await check('N04-composite-focus-border', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/iframe.html?id=product-studio-component-comparison-batch-1--try-candidates&viewMode=story`);
    await page.getByRole('textbox', { name: '横向偏移', exact: true }).waitFor({ timeout: 60000 });
    for (const theme of ['light', 'dark']) {
      for (const label of ['横向偏移', '转场时长']) {
        await page.getByRole('textbox', { name: label, exact: true }).focus();
        const styles = await page.getByRole('textbox', { name: label, exact: true }).evaluate(input => ({ inner: getComputedStyle(input).outlineStyle, outer: getComputedStyle(input.closest('.candidate-number-group')).outlineWidth }));
        assert.deepEqual(styles, { inner: 'none', outer: '2px' }); await shot(`number-focus-${theme}-${label === '横向偏移' ? 'px' : 's'}`);
      }
      if (theme === 'light') await page.getByRole('button', { name: '切换明暗主题' }).click();
    }
  });
} finally {
  await writeFile(`${evidence}/results.json`, JSON.stringify({ environment: { browser: runtimeVersion, platform: os.platform(), os: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryGB: Math.round(os.totalmem() / 2 ** 30), viewport: '1440x900 / 900x900' }, results, measurements }, null, 2));
  if (native) await native.close(); else await browser.close();
}
if (results.some(result => result.result === 'FAIL')) process.exitCode = 1;
