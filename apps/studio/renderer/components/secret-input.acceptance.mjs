import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const output = resolve('test-results/latest/player-website/w01/components');
await mkdir(output, { recursive:true });
const browser = await chromium.launch({ channel:'msedge', headless:true });
const page = await browser.newPage({ viewport:{ width:900, height:650 } });
const checks = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  for (const [story, show, hide] of [['light','显示密钥','隐藏密钥'],['dark','Show key','Hide key']]) {
    await page.goto(`http://127.0.0.1:6007/iframe.html?id=components-secret-input--${story}&viewMode=story`);
    const input = page.getByLabel('API Key', { exact:true });
    await input.waitFor();
    assert.equal(await input.getAttribute('type'), 'password');
    await input.fill('acceptance-placeholder');
    const toggle = page.getByRole('button', { name:show, exact:true });
    assert(await toggle.evaluate(node => { const rect = node.getBoundingClientRect(); return rect.width >= 28 && rect.height >= 28; }));
    await toggle.focus(); await page.keyboard.press('Enter');
    assert.equal(await input.getAttribute('type'), 'text');
    assert.equal(await input.inputValue(), 'acceptance-placeholder');
    await page.getByRole('button', { name:hide, exact:true }).press('Space');
    assert.equal(await input.getAttribute('type'), 'password');
    await input.fill('');
    await page.screenshot({ path:resolve(output, `${story}-900.png`) });
    checks.push(`${story}: masked default; keyboard reveal and conceal retain input; 28px target`);
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ environment:'Windows / Edge / formal Storybook / production SecretInput', executedAt:new Date().toISOString(), checks, errors }, null, 2));
  await browser.close();
}
