import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.GALCRAFT_STORYBOOK_URL ?? 'http://127.0.0.1:6007';
const evidence = resolve('test-results/latest/music/ui-closure');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
const errors = [], rows = [];
page.on('pageerror', error => errors.push(String(error)));
const open = async (story = 'workstation', args = '') => {
  await page.goto(`${base}/iframe.html?id=product-studio-music-composition--${story}&viewMode=story&args=${args}`);
  await page.locator('.gc-music').waitFor();
};
const commits = () => page.locator('[data-commits]').getAttribute('data-commits').then(Number);
const noteState = () => page.locator('[data-note]').first().evaluate(element => ({
  name: element.getAttribute('aria-label'), rect: ['x', 'y', 'width'].map(key => element.querySelector('[data-body]').getAttribute(key)),
}));
const drag = async (resize = false) => {
  const rect = await page.locator(resize ? '[data-note] [data-resize]' : '[data-note] [data-body]').first().boundingBox();
  const x = resize ? rect.x + rect.width / 2 : rect.x + Math.min(12, rect.width / 2), y = rect.y + rect.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 42, y - (resize ? 0 : 12), { steps: 6 });
};
try {
  for (const [locale, play, title] of [['zh-CN', '试听', '可编辑编曲'], ['en', 'Play', 'Editable composition'], ['ja', '試聴', '編集可能な作曲']]) {
    for (const theme of ['light', 'dark']) {
      await open('workstation', `locale:${locale};theme:${theme}`);
      await page.getByRole('button', { name: play, exact: true }).waitFor();
      assert.equal(await page.locator('.music-heading strong').textContent(), title);
      assert.equal(await page.locator('[data-field="title"]').inputValue(), '新的配乐');
      assert.equal(await page.locator('[data-track] strong').first().textContent(), '钢琴 · 午后书房里逐渐展开的很长主题名称');
      const metrics = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth, theme: document.querySelector('.gc-music').closest('[data-theme]').getAttribute('data-theme') }));
      assert.ok(metrics.content <= metrics.width, JSON.stringify(metrics)); assert.equal(metrics.theme, theme);
      if (locale === 'en') {
        const chrome = await page.locator('[data-action],summary,label,.music-heading,.music-roll-toolbar').allTextContents();
        assert.equal(chrome.some(text => /[\u3400-\u9fff]/.test(text)), false, chrome.join('\n'));
      }
      await page.screenshot({ path: `${evidence}/story-${locale}-${theme}-900.png`, fullPage: true });
      rows.push({ locale, theme, metrics, authoredContentPreserved: true });
    }
  }
  await open('english');
  const original = await noteState();
  for (const resize of [false, true]) {
    await drag(resize); assert.notDeepEqual(await noteState(), original);
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual(await noteState(), original); assert.equal(await commits(), 0);
    assert.equal(await page.locator('[data-status]').textContent(), 'Drag cancelled; the note is unchanged');
    await page.keyboard.press('Escape'); assert.equal(await commits(), 0);
  }
  await drag(); await page.mouse.up(); await page.waitForFunction(() => document.querySelector('[data-commits]').dataset.commits === '1');
  const edited = await noteState(); assert.notDeepEqual(edited, original);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.waitForFunction(() => document.querySelector('[data-commits]').dataset.commits === '2'); assert.deepEqual(await noteState(), original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await page.waitForFunction(() => document.querySelector('[data-commits]').dataset.commits === '3'); assert.deepEqual(await noteState(), edited);
  await page.locator('[data-note]').first().focus(); await page.keyboard.press('ArrowUp'); await page.waitForFunction(() => document.querySelector('[data-commits]').dataset.commits === '4');
  rows.push({ gesture: 'move/resize Escape: zero commits; pointerup: one commit; undo/redo; keyboard edit', commits: await commits() });
  for (const [locale, button, fragment] of [['en', 'Validate and apply JSON', 'The composition result is not complete JSON.'], ['ja', '検証して JSON を適用', '完全な JSON']]) {
    await open('workstation', `locale:${locale}`);
    await page.locator('[data-score-json]').evaluate(element => { element.closest('details').open = true; });
    await page.locator('[data-score-json]').fill('作者の不正な JSON');
    await page.getByRole('button', { name: button, exact: true }).click();
    assert.ok((await page.getByRole('alert').textContent()).includes(fragment));
    assert.equal(await page.locator('[data-score-json]').inputValue(), '作者の不正な JSON'); assert.equal(await commits(), 0);
    await page.screenshot({ path: `${evidence}/story-${locale}-error-900.png`, fullPage: true });
    rows.push({ locale, invalidJsonLocalized: true, originalTextPreserved: true });
  }
  await open('empty', 'locale:en;theme:dark'); assert.equal(await page.locator('[data-note]').count(), 0);
  await page.getByText('Select a note to edit pitch, timing and velocity.', { exact: false }).waitFor();
  await page.screenshot({ path: `${evidence}/story-en-empty-dark-900.png`, fullPage: true });
  await open('source-document', 'locale:ja;theme:light');
  await page.getByRole('combobox', { name: 'ローカルレンダリング接続', exact: true }).selectOption('storybook-local');
  await page.getByRole('button', { name: 'ローカルレンダリング入力を確認', exact: true }).click();
  await page.getByRole('button', { name: 'ローカルレンダリングを実行', exact: true }).waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('button', { name: 'ローカルレンダリングを実行', exact: true }).isEnabled(), true);
  await page.screenshot({ path: `${evidence}/story-ja-source-light-900.png`, fullPage: true });
  await open('keyboard-and-localized-error'); await page.getByRole('alert').waitFor();
  assert.ok((await page.getByRole('alert').textContent()).includes('The composition result is not complete JSON.'));
  assert.deepEqual(errors, []);
  await writeFile(`${evidence}/storybook-report.json`, JSON.stringify({ environment: 'Formal Storybook, Microsoft Edge, real pointer/keyboard events, deterministic ports', rows, errors }, null, 2));
  console.log(JSON.stringify({ rows: rows.length, errors, evidence }));
} finally { await browser.close(); }
