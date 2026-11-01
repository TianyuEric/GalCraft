import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const evidence = resolve('test-results/latest/round5/components'); await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }), page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], rows = [];
page.on('pageerror', error => errors.push(String(error)));
const story = async id => { await page.goto(`http://127.0.0.1:6007/iframe.html?id=${id}&viewMode=story`); await page.locator('#storybook-root').waitFor(); };
try {
  for (const theme of ['light', 'dark']) {
    await story(`product-studio-authoring-startupandhome--long-sequence${theme === 'dark' ? '-dark' : ''}`);
    const start = page.getByRole('spinbutton', { name: '出现时刻 · ms', exact: true }); await start.waitFor();
    const bar = page.locator('.startup-sequence-row').nth(1).locator('div > button'); await bar.click();
    const initial = Number(await start.inputValue()), rect = await bar.boundingBox(), commits = Number(await page.locator('#app').getAttribute('data-startup-commits'));
    await page.mouse.move(rect.x + 15, rect.y + rect.height / 2); await page.mouse.down(); await page.mouse.move(rect.x + 95, rect.y + rect.height / 2, { steps: 8 }); await page.mouse.up();
    await page.waitForFunction(value => Number(document.querySelector('#app').dataset.startupCommits) === value + 1, commits);
    const moved = Number(await start.inputValue()); assert(moved > initial);
    await page.getByRole('button', { name: '撤销', exact: true }).click(); await page.waitForFunction(value => document.querySelector('input[aria-label="出现时刻 · ms"]').value === String(value), initial);
    await page.getByRole('button', { name: '重做', exact: true }).click(); await page.waitForFunction(value => document.querySelector('input[aria-label="出现时刻 · ms"]').value === String(value), moved);
    const opacity = page.getByRole('spinbutton', { name: '序列背景 · 不透明度 %', exact: true }); await opacity.fill('42'); await opacity.press('Tab');
    assert.equal(await opacity.inputValue(), '42');
    const beforeCancel = Number(await page.locator('#app').getAttribute('data-startup-commits')), cancelRect = await bar.boundingBox();
    await page.mouse.move(cancelRect.x + 12, cancelRect.y + 12); await page.mouse.down(); await page.mouse.move(cancelRect.x + 45, cancelRect.y + 12); await page.keyboard.press('Escape'); await page.mouse.up();
    assert.equal(Number(await page.locator('#app').getAttribute('data-startup-commits')), beforeCancel);
    await page.screenshot({ path: resolve(evidence, `startup-${theme}.png`) });
    await page.setViewportSize({ width: 900, height: 700 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(evidence, `startup-${theme}-900.png`) });
    rows.push({ caseId: 'R5-A01', target: 'formal Storybook', theme, dragCommits: 1, undoRedo: true, cancelCommits: 0, alpha: 42, result: 'passed' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await story(`product-studio-workbench-save-changes--full-review${theme === 'dark' ? '-dark' : ''}`); await page.getByRole('button', { name: '打开完整保存审阅' }).click();
    const dialog = page.getByRole('dialog'), body = dialog.locator('.gc-dialog-body'); await body.waitFor();
    assert((await dialog.boundingBox()).width > 1000); assert(await body.evaluate(node => node.scrollHeight > node.clientHeight));
    await body.evaluate(node => { node.scrollTop = node.scrollHeight; });
    assert(await dialog.getByText('第 48 组 · 长篇创作内容与关联素材', { exact: true }).isVisible());
    assert((await dialog.getByRole('button', { name: '保存 48 项修改', exact: true }).boundingBox()).y < 900);
    await page.screenshot({ path: resolve(evidence, `save-${theme}.png`) });
    await page.setViewportSize({ width: 900, height: 700 }); assert((await dialog.boundingBox()).width <= 852);
    await body.evaluate(node => { node.scrollTop = node.scrollHeight; }); await page.screenshot({ path: resolve(evidence, `save-${theme}-900.png`) });
    await dialog.getByRole('button', { name: '取消', exact: true }).click(); rows.push({ caseId: 'R5-A06', target: 'formal Storybook', theme, groups: 48, result: 'passed' });
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  for (const state of ['preparing', 'checking', 'applying', 'failed', 'empty']) {
    await story(`product-studio-publish-asset-verification-progress--${state}`); await page.getByRole('progressbar').waitFor();
    const value = await page.getByRole('progressbar').getAttribute('aria-valuenow');
    if (state === 'preparing') assert.equal(value, null); else if (state === 'checking') assert.equal(Number(value), 40);
    await page.screenshot({ path: resolve(evidence, `verification-${state}.png`) });
    rows.push({ caseId: 'R5-A10', target: 'formal Storybook component only', state, result: 'passed' });
  }
  for (const theme of ['light','dark']) {
    await story(`product-studio-assets-type-catalog--${theme}`);
    await page.getByRole('listbox',{name:'舞台对象'}).waitFor();
    assert.equal(await page.getByRole('option').count(),3);
    const search=page.getByRole('textbox',{name:'搜索动画目标'}); await search.fill('教室');
    assert.equal(await page.getByRole('option').count(),1);
    await search.press('ArrowDown');await page.keyboard.press('Enter');
    await page.getByRole('status').filter({hasText:'Fig003'}).waitFor();
    await page.getByRole('button',{name:/定位岚汐.*来源/}).click();
    await page.getByRole('status').filter({hasText:'Stmt03'}).waitFor();
    const icon=label=>page.getByText(label,{exact:true}).locator('..').locator('svg').innerHTML();
    assert.equal(await icon('unknown-future-icon'),await icon('file'));
    assert.equal(new Set(await Promise.all(['texture','animation','effect','person-standing'].map(icon))).size,4);
    await page.setViewportSize({width:900,height:700});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:resolve(evidence,`catalog-targets-${theme}-900.png`)});
    rows.push({caseId:'R5-A02/R5-A11',target:'formal shared catalog and target picker',theme,search:true,keyboard:true,sourceLocation:true,distinctTypeIcons:4,unknownFallback:'file',result:'passed'});
    await page.setViewportSize({width:1440,height:900});
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(evidence, 'report.json'), JSON.stringify({ result: 'passed', browser: await browser.version(), rows, errors, executedAt: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ result: 'passed', rows: rows.length, evidence }));
} finally { await browser.close(); }
