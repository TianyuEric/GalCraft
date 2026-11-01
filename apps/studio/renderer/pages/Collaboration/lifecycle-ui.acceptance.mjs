import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const evidence = resolve('test-results/latest/save-collaboration');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const open = async story => {
    await page.goto(`http://127.0.0.1:6007/iframe.html?id=product-studio-collaboration-collaboration--${story}&viewMode=story`);
    await page.locator('.collaboration-session-header').waitFor();
  };
  for (const [story, label] of [['ended-history', '开始新一轮协作'], ['ended-history-dark', '开始新一轮协作'], ['ended-history-english', 'Start a new round'], ['ended-history-japanese', '新しい連携を開始']]) {
    await page.setViewportSize({ width: story.endsWith('dark') ? 900 : 1440, height: 900 });
    await open(story);
    assert.equal(await page.getByRole('button', { name: label, exact: true }).isEnabled(), true);
    assert.equal(await page.getByRole('button', { name: /^(恢复协作|Resume|再開)$/ }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve(evidence, `${story}.png`) });
  }
  await open('ended-other-project');
  assert.equal(await page.getByRole('button', { name: '开始新一轮协作', exact: true }).isDisabled(), true);
  await page.getByText(/本轮已结束。先打开所属作品/).waitFor();
  await open('ended-history');
  await page.getByRole('button', { name: '开始新一轮协作', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: '创作目标', exact: true }).inputValue(), '补写雨夜车站重逢场景');
  await page.getByRole('button', { name: '确认范围并建立协作', exact: true }).click();
  await page.getByRole('button', { name: '暂停协作', exact: true }).waitFor();
  assert.match(await page.locator('.collaboration-counter').innerText(), /0 \/ 3/);
  await open('paused');
  await page.getByRole('button', { name: '恢复协作', exact: true }).click();
  await page.getByRole('button', { name: '暂停协作', exact: true }).waitFor();
  await open('expired');
  await page.getByRole('button', { name: '重新接入本轮', exact: true }).click();
  await page.getByRole('button', { name: '暂停协作', exact: true }).waitFor();
  assert.match(await page.locator('.collaboration-counter').innerText(), /1 \/ 3/);
  assert.deepEqual(errors, []);
  await writeFile(resolve(evidence, 'collaboration-ui.json'), JSON.stringify({ environment: 'Formal Storybook, memory providers, Edge', result: 'passed', checks: ['Ended round offers new-round review with retained goal', 'New round starts unpaused with zero sends', 'Other project explains how to start', 'Paused round resumes; expired round reconnects with its send count', 'Chinese, English, Japanese and dark 900px layout'], errors }, null, 2));
  console.log('PASS: ended, paused and expired collaboration UI');
} finally { await browser.close(); }
