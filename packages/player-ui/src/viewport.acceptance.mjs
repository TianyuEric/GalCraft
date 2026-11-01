import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const output = resolve('test-results/latest/player-website/w05/browser');
await mkdir(output, { recursive:true });
const browser = await chromium.launch({ channel:'msedge', headless:true });
const page = await browser.newPage(); page.setDefaultTimeout(30000);
const checks = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
const close = (actual, expected) => assert(Math.abs(actual - expected) < 1.1, `${actual} != ${expected}`);
try {
  for (const fit of ['cover','contain']) {
    await page.goto(`http://127.0.0.1:6007/iframe.html?id=product-player-pages--viewport-${fit}&viewMode=story`);
    await page.locator('.gc-page-background-picture img').waitFor();
    for (const [width,height] of [[1280,720],[1600,1000],[1920,800],[900,800]]) {
      await page.setViewportSize({ width,height });
      await page.waitForFunction(() => { const root=document.querySelector('.galcraft-player'),content=root?.querySelector('.gc-content'); return root && content && Math.abs(content.clientWidth / content.clientHeight - 16 / 9) < .01; });
      const geometry = await page.locator('.galcraft-player').evaluate(root => {
        const content=root.querySelector('.gc-content'),background=root.querySelector('.gc-page-background'),image=background.querySelector('img');
        const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
        return { root:rect(root),content:rect(content),background:rect(background),fit:getComputedStyle(image).objectFit,backgroundAboveStage:getComputedStyle(background).zIndex,contentAboveBackground:getComputedStyle(content).zIndex };
      });
      close(geometry.background.width, geometry.root.width); close(geometry.background.height, geometry.root.height);
      close(geometry.content.width / geometry.content.height, 16 / 9);
      assert.equal(geometry.fit, fit); assert(Number(geometry.contentAboveBackground) > Number(geometry.backgroundAboveStage));
      await page.screenshot({ path:resolve(output, `${fit}-${width}x${height}.png`) });
      checks.push({ fit,width,height,geometry });
    }
  }
  await page.locator('[data-gc-part="title.menu.settings"]').click();
  await page.locator('[data-gc-part="settings.categories"]').waitFor();
  await page.locator('[data-focus-key="settings.controls"]').click();
  const origin=page.locator('[data-gc-part="settings.dataImport"]');
  await origin.click();
  await page.locator('.gc-portal[data-page="dataImport"][data-modal="true"]').waitFor();
  assert.equal(await page.locator('.gc-page-background').getAttribute('data-gc-background-page'), 'settings');
  assert.equal(await page.locator('.gc-content:not(.gc-portal)').getAttribute('data-page'), 'settings');
  await page.screenshot({ path:resolve(output,'settings-import-source.png') });
  await page.keyboard.press('Escape');
  await page.locator('.gc-content[data-page="settings"] [data-gc-part="settings.dataImport"]').waitFor();
  checks.push('Import modal retains settings background and returns to settings');
  for (const story of ['choice','input']) {
    await page.goto(`http://127.0.0.1:6007/iframe.html?id=product-player-pages--${story}&viewMode=story`);
    if(story==='choice')await page.locator('.gc-choice-list').waitFor();
    else await page.locator('.gc-content:not(.gc-portal)[data-page="input"]').waitFor();
    const sizes=await page.locator('.galcraft-player').evaluate(root=>{const c=root.querySelector('.gc-content'),b=root.querySelector('.gc-page-background');return {cw:c.clientWidth,ch:c.clientHeight,bw:b.clientWidth,bh:b.clientHeight};});
    close(sizes.cw,sizes.bw); close(sizes.ch,sizes.bh); close(sizes.cw/sizes.ch,16/9);
    await page.screenshot({ path:resolve(output,`${story}-900.png`) }); checks.push({story,sizes});
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(resolve(output,'report.json'),JSON.stringify({environment:'Windows / Edge / formal Storybook / actual Player with sample storage',executedAt:new Date().toISOString(),checks,errors},null,2));
  await browser.close();
}
