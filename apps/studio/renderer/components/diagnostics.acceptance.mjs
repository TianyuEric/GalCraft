import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const output = resolve('test-results/latest/d28/diagnostics');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
page.setDefaultTimeout(25000);
const report = { target: 'D28-E02/E03', environment: 'Formal Storybook / actual plugin editor DOM / Edge / fixture service failures; no generation requests', data: 'Invalid reference JSON, schema-invalid strength, unavailable VoiceStudio, warning/info', expected: 'Three-language explanation, fields and recovery; complete technical details; invalid input retained without overwriting saved fields', actual: [], result: 'failed', evidence: output, owner: 'M01/M09', at: new Date().toISOString() };
const story = async (id, args = '') => { await page.goto(`http://127.0.0.1:6007/iframe.html?id=${encodeURIComponent(id)}&viewMode=story${args ? `&args=${args}` : ''}`); };
try {
  for (const [locale, variant, detail] of [['zh-CN', 'character-blocks', '诊断详情'], ['en', 'english', 'Diagnostic details'], ['ja', 'japanese', '診断の詳細']]) {
    await story(`product-studio-production-novelai-prompt--${variant}`);
    const reference = page.locator('[data-novelai-field="novelaiReference"]'); await reference.waitFor();
    const saved = await page.locator('[data-novelai-saved]').getAttribute('data-novelai-saved');
    await reference.fill('{ "mode":'); await reference.press('Tab');
    await page.getByRole('alert').filter({ hasText: /JSON/ }).waitFor();
    assert.equal(await reference.getAttribute('aria-invalid'), 'true');
    assert.equal(await reference.inputValue(), '{ "mode":');
    assert.equal(await page.locator('[data-novelai-saved]').getAttribute('data-novelai-saved'), saved);
    await page.getByText(detail, { exact: true }).click();
    assert.match(await page.locator('.novelai-prompt-editor pre').innerText(), /NOVELAI_REFERENCE_JSON/);
    await page.screenshot({ path: resolve(output, `novelai-json-${locale}.png`) });
    await reference.fill('{"mode":"img2img","strength":2}'); await reference.press('Tab');
    await page.waitForFunction(() => document.querySelector('.novelai-prompt-editor pre')?.textContent.includes('NOVELAI_REFERENCE_SCHEMA'));
    assert.match(await page.locator('.novelai-prompt-editor pre').innerText(), /novelaiReference.strength/);
    assert.equal(await page.locator('[data-novelai-saved]').getAttribute('data-novelai-saved'), saved);
    await page.locator('.novelai-prompt-editor > button').nth(1).click();
    assert.equal(await reference.inputValue(), '{"mode":"img2img","strength":2}');
    await reference.fill('{"mode":"img2img","strength":0.5,"informationExtracted":1}'); await reference.press('Tab');
    await page.waitForFunction(() => JSON.parse(document.querySelector('[data-novelai-saved]').dataset.novelaiSaved).novelaiReference?.strength === 0.5);
    report.actual.push({ locale, check: 'NovelAI JSON/schema invalid value retained and blocked; correction commits through actual callback', result: 'passed' });
  }
  for (const [locale, variant, detail] of [['zh-CN', 'failed-service', '诊断详情'], ['en', 'failed-service-english', 'Diagnostic details'], ['ja', 'failed-service-japanese', '診断の詳細']]) {
    await story(`product-studio-production-voicestudio--${variant}`);
    const input = page.locator('[data-voice-field="text"]'); await input.waitFor();
    await input.fill(`Retained input ${locale}`); await input.press('Tab');
    const refresh = page.locator('.voice-discovery-actions button'); await refresh.click();
    await page.waitForFunction(() => !document.querySelector('.voice-discovery-actions button').disabled);
    assert.equal(await input.inputValue(), `Retained input ${locale}`);
    await page.getByText(detail, { exact: true }).first().click();
    assert.match(await page.locator('.voice-discovery pre').innerText(), /SERVICE_UNAVAILABLE/);
    assert.match(await page.locator('.voice-discovery pre').innerText(), /ECONNREFUSED/);
    assert.match(await page.getByRole('alert').innerText(), /VoiceStudio/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve(output, `voice-${locale}.png`) });
    report.actual.push({ locale, check: 'VoiceStudio localized service recovery, exact provider detail and refresh preserve editing input', result: 'passed' });
  }
  await story('components-诊断--provider-warning'); await page.locator('.gc-issue-notice').waitFor();
  assert.equal(await page.locator('.gc-issue-notice').getAttribute('data-severity'), 'warning');
  assert.match(await page.locator('.gc-issue-heading').innerText(), /结局标识/);
  await story('components-诊断--provider-info'); await page.locator('.gc-issue-notice').waitFor();
  assert.equal(await page.locator('.gc-issue-notice').getAttribute('data-severity'), 'info');
  assert.match(await page.locator('.gc-issue-heading').innerText(), /uncompressed audio/);
  report.actual.push({ check: 'Mapped gallery warning and unknown provider info preserve severity and concrete explanation', result: 'passed' });
  await story('product-studio-publish-publish-workflow--provider-diagnostics');
  await page.getByRole('button', { name: 'Choose directory', exact: true }).click();
  await page.getByRole('button', { name: 'Check saved version', exact: true }).click();
  await page.getByText(/Gallery pages need at least one end instruction/).waitFor();
  assert.match(await page.locator('.publish-page').innerText(), /valid Steam AppID/);
  assert.match(await page.locator('.publish-page').innerText(), /uncompressed audio/);
  await page.screenshot({ path: resolve(output, 'publish-provider-reasons.png') });
  report.actual.push({ check: 'Actual Publish component keeps gallery and Steam reason plus unknown provider info in its main list', result: 'passed' });
  report.result = 'passed';
} catch (error) { report.error = error.stack; await page.screenshot({ path: resolve(output, 'failure.png') }); process.exitCode = 1; }
finally { await writeFile(resolve(output, 'browser.json'), JSON.stringify(report, null, 2)); await browser.close(); console.log(JSON.stringify(report)); }
