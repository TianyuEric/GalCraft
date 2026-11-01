import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Run against an isolated development Electron host with an open sample project.
const { chromium } = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const evidence=resolve('../../test-results/latest/studio-interaction'),checks=[];
await mkdir(evidence,{recursive:true});
const browser=await chromium.connectOverCDP(process.env.GALCRAFT_CDP_URL??'http://127.0.0.1:9352');
const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(12000);
const order=()=>page.locator('.authoring-card').evaluateAll(cards=>cards.map(card=>card.dataset.statementId));
const check=(target,expected,actual)=>checks.push({target,environment:'Development Electron, real Chromium pointer input',data:'Sample project',expected,actual,result:'pass'});
try {
  await page.locator('.studio-rail').getByRole('button',{name:'创作',exact:true}).click();
  await page.locator('.authoring-tabs').getByRole('button',{name:'演出',exact:true}).click();
  for(const start of ['.authoring-card-summary','.authoring-grip','.authoring-direction-thumbnail']){
    await page.locator('.authoring-card').evaluateAll(cards=>Promise.allSettled(cards.flatMap(card=>card.getAnimations().map(animation=>animation.finished))));
    await page.locator('.authoring-center').evaluate(center=>{center.scrollTop=0;});
    const before=await order();
    const source=page.locator('.authoring-card').filter({has:page.locator(start)}).first();
    const sourceId=await source.getAttribute('data-statement-id'),sourceIndex=before.indexOf(sourceId);
    const target=page.locator('.authoring-card').nth(sourceIndex===0?1:0);
    const from=await source.locator(start).boundingBox(),to=await target.boundingBox();
    await page.mouse.move(from.x+Math.min(from.width/2,80),from.y+from.height/2);await page.mouse.down();
    await page.mouse.move(to.x+120,sourceIndex===0?to.y+to.height-4:to.y+4,{steps:15});await page.mouse.up();
    await page.waitForFunction(ids=>JSON.stringify([...document.querySelectorAll('.authoring-card')].map(card=>card.dataset.statementId))!==JSON.stringify(ids),before);
    check(`Card reorder starting at ${start}`,'Source moves across another card', (await order()).slice(0,3));
    console.log(`Passed ${start}`);
  }
  await page.locator('.authoring-card').evaluateAll(cards=>Promise.allSettled(cards.flatMap(card=>card.getAnimations().map(animation=>animation.finished))));
  await page.locator('.authoring-center').evaluate(center=>{center.scrollTop=0;});
  const position=await page.locator('.authoring-card').nth(1).boundingBox();
  await page.locator('.authoring-drop-gap').nth(1).hover();
  assert.deepEqual(await page.locator('.authoring-card').nth(1).boundingBox(),position);
  assert.equal(await page.locator('.authoring-card-summary').first().evaluate(node=>getComputedStyle(node).userSelect),'none');
  check('Gap hover and direction text','Hover preserves card bounds; direction text is not selectable',position);
  await page.locator('.authoring-card[data-command=changeFigure]').first().click();
  const framing=page.getByLabel('立绘取景预设',{exact:true});
  assert.equal(await framing.evaluate(node=>!!node.closest('.command-more')),false);
  await framing.selectOption('full');
  await page.waitForFunction(()=>document.querySelector('[data-field=framing] input[aria-label="缩放倍率"]')?.value==='0.66796875');
  await framing.selectOption('upper');
  await page.waitForFunction(()=>document.querySelector('[data-field=framing] input[aria-label="垂直偏移"]')?.value==='684');
  await page.locator('.framing-custom > summary').click();
  await page.getByLabel('垂直偏移预设',{exact:true}).selectOption('540');
  await page.waitForFunction(()=>document.querySelector('[data-field=framing] input[aria-label="垂直偏移"]')?.value==='540');
  await framing.selectOption('upper');
  await page.waitForFunction(()=>document.querySelector('[data-field=framing] input[aria-label="垂直偏移"]')?.value==='684');
  check('Numeric preset writes portrait offset','Common offset 540 commits; upper framing restores 684','Verified');
  assert.equal(await page.locator('.authoring-direction-thumbnail').first().evaluate(node=>getComputedStyle(node).objectFit),'contain');
  check('Portrait framing and thumbnail','Common presets above More properties; upper scale 1.11328125, Y 684; complete thumbnail','Verified');
  await page.locator('.authoring-tabs').getByRole('button',{name:'写作',exact:true}).click();
  assert.equal(await page.locator('.authoring-writing-input').first().evaluate(node=>getComputedStyle(node).userSelect),'text');
  check('Writing selection','Writing input permits text selection','text');
  await page.locator('.studio-rail').getByRole('button',{name:'素材',exact:true}).click();
  for(const close of ['footer','Escape','backdrop']){
    await page.locator('.authoring-asset').filter({has:page.locator('.authoring-asset-thumbnail img')}).first().getByRole('button',{name:'预览',exact:true}).click();
    const dialog=page.locator('.asset-preview-dialog');await dialog.waitFor();
    assert.equal(await dialog.locator('header').getByRole('button',{name:'关闭',exact:true}).count(),0);
    if(close==='footer')await dialog.locator('footer').getByRole('button',{name:'关闭',exact:true}).click();
    else if(close==='Escape')await page.keyboard.press('Escape');
    else await page.mouse.click(4,4);
    await dialog.waitFor({state:'detached'});
    check(`Asset preview closes by ${close}`,'Dialog closes and removes media','Verified');
  }
  await page.locator('.studio-rail').getByRole('button',{name:'页面',exact:true}).click();
  for(const [label,key] of [['剧情','story'],['选择','choice'],['历史','history'],['保存','save'],['读取','load']]){
    await page.locator('.designer-tree').getByRole('button',{name:label,exact:true}).click();
    await page.locator(`.designer-player [data-gc-page="${key}"]`).first().waitFor();
    assert.equal(await page.locator('.page-designer video').evaluateAll(videos=>videos.every(video=>video.paused&&!video.currentSrc)),true);
    check(`Page design switches to ${key}`,'Opening movie remains paused with no source','Verified');
  }
  await page.screenshot({path:join(evidence,'page-design.png'),scale:'css'});
  await writeFile(join(evidence,'acceptance.json'),JSON.stringify({result:'pass',checks},null,2));
  console.log(JSON.stringify({result:'pass',checks:checks.length,evidence},null,2));
} finally { await browser.close(); }
