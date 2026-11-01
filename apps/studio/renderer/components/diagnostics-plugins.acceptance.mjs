import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const root = resolve(import.meta.dirname, '../../../..').replaceAll('\\', '/'), output = `${root}/test-results/latest/d28/diagnostics`;
const browser = await chromium.launch({ channel: 'msedge', headless: true }), page = await browser.newPage();
try {
  await page.goto('http://127.0.0.1:6007/iframe.html?id=product-studio-production-novelai-prompt--character-blocks&viewMode=story');
  await page.locator('.novelai-prompt-editor').waitFor();
  await page.evaluate(async root => {
    const { createPlugin } = await import(`/@fs/${root}/plugins/official-live2d/src/editor.ts`), { mountMusicWritingEditor } = await import(`/@fs/${root}/plugins/music-composition/src/writing-editor.ts`);
    const live = document.createElement('section'), music = document.createElement('section'); live.id = 'live-diagnostic'; music.id = 'music-diagnostic'; document.body.append(live, music);
    const contributions = await createPlugin().activate({});
    contributions.assetEditors[0].mount(live, { value: { capabilities: { motions: [], expressions: [], capabilities: [], parameters: [] } }, target: { kind: 'command', readonly: false }, studio: {}, locale: 'en', signal: new AbortController().signal, commit: async () => { throw new Error('Actual rejected Live2D commit'); } });
    const issue = { code: 'SOUNDBANK_IO', message: 'Bank file cannot be read', severity: 'error', owner: 'M09', related: [], actions: ['retry'] };
    mountMusicWritingEditor(music, { value: {}, target: { fields: { description: 'Retained composition description' }, revision: 1, references: [], readonly: false, commit: async () => ({ ok: false, error: issue, issues: [issue] }) }, studio: { soundbanks: { list: async () => ({ ok: false, error: issue, issues: [issue] }) } }, locale: 'en', signal: new AbortController().signal });
  }, root);
  await page.locator('#live-diagnostic').getByLabel('Auto blink').uncheck();
  await page.locator('#live-diagnostic [role=alert]').waitFor();
  await page.locator('#live-diagnostic summary').first().click();
  assert.match(await page.locator('#live-diagnostic pre').first().innerText(), /Actual rejected Live2D commit/);
  await page.locator('#music-diagnostic [role=alert]').waitFor();
  assert.equal(await page.locator('#music-diagnostic textarea[data-writing=description]').inputValue(), 'Retained composition description');
  await page.locator('#music-diagnostic').getByText('Diagnostic details', { exact: true }).click();
  assert.match(await page.locator('#music-diagnostic details').last().innerText(), /SOUNDBANK_IO/);
  await writeFile(`${output}/other-plugin-errors.json`, JSON.stringify({ target: 'D28 UI-05/06', environment: 'Actual public Live2D asset editor and music writing editor / Edge / rejected commit and unavailable soundbank fixtures', data: 'Rejected Promise, Result<Issue> catalog failure', expected: 'Localized explanation, complete Issue, retained inputs and no unhandled rejection', actual: 'Live2D rejection displayed in details; soundbank IO retained with full Issue and author description', result: 'passed', owner: 'M09', at: new Date().toISOString() }, null, 2));
  console.log('Live2D and music editor diagnostic paths passed');
} finally { await browser.close(); }
