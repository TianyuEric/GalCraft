import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.STORYBOOK_URL ?? 'http://127.0.0.1:6007';
const evidence = process.env.CANDIDATE_EVIDENCE ?? 'test-results/ui-candidates-batch1-20261018';
await mkdir(evidence, {recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const results=[], errors=[]; page.on('pageerror',error=>errors.push(error.message));
const story=async(name='try-candidates')=>{await page.goto(`${base}/iframe.html?id=product-studio-component-comparison-batch-1--${name}&viewMode=story`);await page.locator('.candidate-fields').waitFor({timeout:60000});};
const count=async()=>Number((await page.getByTestId('history-count').innerText()).split(' ')[0]);
const value=id=>page.getByTestId(id).textContent();
const color=()=>page.getByRole('button',{name:'编辑颜色',exact:true});
const colorInput=()=>page.getByRole('textbox',{name:'颜色值',exact:true});
const shot=async name=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${evidence}/${name}.png`,animations:'disabled'});};
async function check(id, run) {
  if (process.env.CANDIDATE_CASES && !process.env.CANDIDATE_CASES.split(',').some(prefix=>id.startsWith(prefix))) return;
  errors.length=0;
  try {await run();assert.deepEqual(errors,[]);results.push({id,result:'PASS'});}
  catch(error){results.push({id,result:'FAIL',error:String(error),pageErrors:[...errors]});await shot(`${id}-failure`);}
  console.log(JSON.stringify(results.at(-1)));
}
try {
  for(const [name,marker] of [['assets','素材库概要'],['empty-assets','素材库概要'],['production','制作与候选'],['plugins','插件概要'],['publish','构建服务已就绪'],['asset-failure','素材库概要'],['production-failure','本次制作参数'],['plugin-failure','插件概要'],['publish-failure','构建服务尚未就绪']]) {
    await check(`E01-${name}`,async()=>{
      await page.goto(`${base}/iframe.html?id=product-studio-authoring-pages--${name}&viewMode=story`);
      await page.getByText(marker,{exact:true}).first().waitFor({timeout:60000});
      if(name.endsWith('failure')) await page.getByText('服务暂时不可用，请重试',{exact:false}).filter({visible:true}).first().waitFor();
      assert.equal(await page.locator('.product-story-error').count(),0);await shot(`e01-final-${name}`);
    });
  }
  await check('C01-zero-change',async()=>{
    await story();await color().click();assert.equal(await colorInput().inputValue(),'#b5c9e7');
    await page.keyboard.press('Escape');assert.equal(await count(),0);assert.equal(await value('preview-color'),'#b5c9e7');assert.ok(await color().evaluate(node=>node===document.activeElement));
    await color().click();await page.getByRole('button',{name:'确认颜色',exact:true}).click();assert.equal(await count(),0);
  });
  await check('C02-preview-cancel',async()=>{
    await story();await color().click();const rect=await page.locator('.cn-color-picker-area').boundingBox();
    await page.mouse.move(rect.x+20,rect.y+20);await page.mouse.down();await page.mouse.move(rect.x+90,rect.y+60,{steps:5});await page.mouse.up();
    assert.notEqual(await value('preview-color'),'#b5c9e7');assert.equal(await count(),0);await shot('color-preview');
    await page.keyboard.press('Escape');assert.equal(await value('preview-color'),'#b5c9e7');assert.equal(await count(),0);
  });
  await check('C03-enter-undo',async()=>{
    await story();await color().click();await colorInput().fill('#789abc');await colorInput().press('Enter');
    assert.equal(await value('committed-color'),'#789abc');assert.equal(await count(),1);await page.getByRole('button',{name:'撤销',exact:true}).click();assert.equal(await value('committed-color'),'#b5c9e7');assert.equal(await count(),0);
  });
  await check('C04-outside-focus',async()=>{
    await story();await color().click();await colorInput().fill('#123456');
    // The field can be covered by a collision-flipped popup: click the document region instead.
    await page.locator('.candidate-document').click();assert.equal(await count(),1);assert.equal(await value('committed-color'),'#123456');assert.equal(await page.locator('.candidate-color-popup').count(),0);
    assert.equal(await color().evaluate(node=>node===document.activeElement),false);
  });
  await check('C05-format-nested',async()=>{
    await story();await color().click();await page.getByRole('combobox',{name:'颜色格式'}).click();
    await page.getByRole('option',{name:'RGB',exact:true}).click();assert.equal(await page.locator('.candidate-color-popup').count(),1);assert.match(await colorInput().inputValue(),/^rgb/);
    await page.getByRole('combobox',{name:'颜色格式'}).click();await page.keyboard.press('Escape');assert.equal(await page.locator('.candidate-color-popup').count(),1);await page.keyboard.press('Escape');assert.equal(await count(),0);
  });
  await check('C06-invalid-and-ime',async()=>{
    await story();await color().click();await colorInput().fill('rgb(999,0,0)');await colorInput().press('Enter');assert.equal(await count(),0);assert.equal(await colorInput().getAttribute('aria-invalid'),'true');await shot('color-invalid');
    await colorInput().fill('#456789');await colorInput().dispatchEvent('compositionstart');await colorInput().press('Enter');assert.equal(await page.locator('.candidate-color-popup').count(),1);assert.equal(await count(),0);await colorInput().dispatchEvent('compositionend');await colorInput().press('Enter');assert.equal(await count(),1);
  });
  await check('C07-alpha-contract',async()=>{
    await story();await page.getByRole('combobox',{name:'颜色字段'}).click();await page.getByRole('option',{name:'对话框底色 · RGBA',exact:true}).click();
    await color().click();assert.equal(await colorInput().inputValue(),'#24364bb3');await colorInput().fill('#abcdef80');assert.equal(await value('preview-color'),'#abcdef80');
    await page.getByRole('slider',{name:'不透明度',exact:true}).press('ArrowLeft');assert.equal(await count(),0);await shot('color-alpha');await page.keyboard.press('Escape');assert.equal(await value('preview-color'),'#24364bb3');
    await color().click();await colorInput().fill('#abcdef80');await colorInput().press('Enter');assert.equal(await value('committed-color'),'#abcdef80');assert.equal(await count(),1);
  });
  await check('N01-type-step-cancel',async()=>{
    await story();const input=page.getByRole('textbox',{name:'横向偏移',exact:true});await input.fill('36');await input.press('Enter');assert.equal(await value('committed-offset'),'36');assert.equal(await count(),1);
    await input.press('ArrowUp');assert.equal(await value('committed-offset'),'37');await input.fill('80');await input.press('Escape');assert.equal(await value('committed-offset'),'37');assert.equal(await input.inputValue(),'37');assert.equal(await count(),2);
  });
  await check('N02-empty-range-recovery',async()=>{
    await story();const input=page.getByRole('textbox',{name:'横向偏移',exact:true});await input.fill('');await input.press('Enter');assert.equal(await input.getAttribute('aria-invalid'),'true');assert.equal(await count(),0);
    await input.fill('9999');await input.press('Enter');assert.equal(await input.getAttribute('aria-invalid'),'true');assert.equal(await count(),0);await shot('number-invalid');await input.press('Escape');assert.equal(await input.inputValue(),'24');
    await input.fill('-12');await page.getByRole('textbox',{name:'转场时长',exact:true}).click();assert.equal(await value('committed-offset'),'-12');assert.equal(await count(),1);
  });
  await check('N03-scrub-commit-cancel',async()=>{
    await story();let area=await page.locator('.candidate-scrub').first().boundingBox();await page.mouse.move(area.x+55,area.y+14);await page.mouse.down();await page.mouse.move(area.x+95,area.y+14,{steps:8});await page.mouse.up();
    assert.equal(await count(),1);const committed=await value('committed-offset');assert.notEqual(committed,'24');
    area=await page.locator('.candidate-scrub').first().boundingBox();await page.mouse.move(area.x+55,area.y+14);await page.mouse.down();await page.mouse.move(area.x+105,area.y+14,{steps:8});await page.keyboard.press('Escape');await page.mouse.up();
    assert.equal(await value('committed-offset'),committed);assert.equal(await count(),1);
  });
  await check('O01-search-identity-cancel',async()=>{
    await story();await page.getByRole('combobox',{name:'选择背景素材',exact:true}).click();const search=page.getByRole('combobox',{name:'搜索背景素材',exact:true});await search.fill('第二章');await search.press('ArrowDown');await search.press('Enter');
    assert.match(await value('object-path'),/第二章/);assert.equal(await count(),1);
    await page.getByRole('combobox',{name:'选择背景素材',exact:true}).click();await search.fill('不存在');await page.getByText('没有匹配项。试试名称的一部分，或').waitFor();await shot('object-empty');await search.press('Escape');assert.match(await value('object-path'),/第二章/);assert.equal(await count(),1);
  });
  await check('O02-disabled-long-thumbnail',async()=>{
    await story();await page.getByRole('combobox',{name:'选择背景素材',exact:true}).click();await page.getByRole('option').filter({hasText:'缺少精确版本'}).waitFor();assert.equal(await page.getByRole('option').filter({hasText:'缺少精确版本'}).getAttribute('aria-disabled'),'true');
    await page.getByRole('img',{name:'缩略图不可用'}).first().waitFor();await shot('object-results');
    await page.getByRole('option').filter({hasText:'最终修订'}).click();assert.equal(await count(),1);await shot('object-long-selected');
  });
  await check('O03-loading-error-disabled-empty',async()=>{
    for(const name of ['loading','error','empty']) {
      await story(name);await page.getByRole('combobox',{name:'选择背景素材',exact:true}).click();
      await page.getByText(name==='loading'?'正在读取项目对象，当前选择保留。':name==='error'?'项目对象读取失败，当前选择保留。':'项目中暂无可选背景素材。').waitFor();await shot(`object-${name}`);
      if(name==='empty') assert.equal(await page.getByRole('button',{name:'清除搜索',exact:true}).count(),0);
      if(name==='error'){await page.getByRole('button',{name:'重试读取',exact:true}).click();await page.getByRole('option').first().waitFor();}
    }
    await story('disabled');assert.ok(await page.getByRole('combobox',{name:'选择背景素材',exact:true}).isDisabled());assert.ok(await color().isDisabled());assert.ok(await page.getByRole('textbox',{name:'横向偏移',exact:true}).isDisabled());await shot('disabled');
  });
  await check('V01-same-scene-themes-width-scroll',async()=>{
    for(const width of [1440,900]) for(const theme of ['light','dark']) for(const kind of ['candidate','baseline']) {
      await page.setViewportSize({width,height:width===900?620:900});await story(kind==='baseline'?'baseline':'try-candidates');
      if(theme==='dark')await page.getByRole('button',{name:'切换明暗主题',exact:true}).click();await shot(`${kind}-${theme}-${width}`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(kind==='candidate'){
        await color().click();const box=await page.locator('.candidate-color-popup').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=(width===900?620:900)+1);await shot(`color-${theme}-${width}`);await page.keyboard.press('Escape');
      }
    }
    await page.setViewportSize({width:900,height:620});await story('long-list');await page.getByRole('combobox',{name:'选择背景素材',exact:true}).click();const search=page.getByRole('combobox',{name:'搜索背景素材',exact:true});await search.press('End');await page.locator('.candidate-object-list').evaluate(node=>node.scrollTop=node.scrollHeight);await shot('object-scroll-900');
    assert.ok(await page.locator('.candidate-object-list').evaluate(node=>node.scrollTop>0));
  });
} finally {
  await writeFile(`${evidence}/acceptance.json`,JSON.stringify({environment:{browser:await browser.version(),platform:process.platform,viewport:'1440×900 / 900×620',history:'Storybook in-memory; no M02/disk/Player acceptance'},results},null,2));
  await browser.close();
}
if(results.some(result=>result.result==='FAIL'))process.exitCode=1;
