import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const require = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url);
const { chromium } = require('playwright');
const output = resolve('test-results/latest/workbench-polish/pages');
await mkdir(output, { recursive:true });
const browser = await chromium.launch({ channel:'chrome', headless:true });
const page = await browser.newPage({ viewport:{width:1440,height:900} });
const checks = [], errors = [];
page.on('pageerror', error => errors.push(String(error)));
async function story(id) { await page.goto(`http://127.0.0.1:6007/iframe.html?id=${id}&viewMode=story`); await page.locator('.gc-workbench').waitFor(); }
try {
  for (const theme of ['light','dark']) {
    await story(`product-studio-projects-project-center--workbench${theme === 'dark' ? '-dark' : ''}`);
    await page.locator('.project-library-item').first().waitFor();
    await page.getByRole('tree', {name:'登记作品'}).getByRole('treeitem', {name:'雨后的车站',exact:true}).click();
    await page.locator('.project-library-inspector').getByRole('heading', {name:'雨后的车站',exact:true}).waitFor();
    assert.equal(await page.locator('.gc-wb-status').innerText(), '');
    await page.getByRole('tree', {name:'作品范围'}).getByRole('treeitem', {name:/已固定/}).click();
    assert.equal(await page.locator('.project-library-item').count(), 2);
    assert.match(await page.locator('.project-library-inspector').innerText(), /雨后的车站/);
    await page.getByRole('tree', {name:'登记作品'}).getByRole('treeitem', {name:'漫长夏日与尚未寄出的信',exact:false}).click();
    assert.equal(await page.locator('.project-library-inspector').getByRole('button', {name:'打开作品',exact:true}).isEnabled(),false);
    assert.equal(await page.locator('.project-library-inspector').getByRole('button', {name:'重新定位',exact:true}).isVisible(),true);
    assert.equal(await page.locator('.gc-wb-bottom').count(),0);
    await page.screenshot({path:join(output,`projects-${theme}.png`)});
    await page.setViewportSize({width:900,height:700});
    await page.getByRole('button',{name:'显示或隐藏Inspector',exact:true}).click();
    await page.locator('.project-library-inspector').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
    await page.screenshot({path:join(output,`projects-${theme}-900.png`)});
    await page.setViewportSize({width:1440,height:900});
    checks.push(`projects ${theme}: object inspection, stable selection across filters, missing-folder actions, no blank panel, 900px inspector`);
  }
  await story('product-studio-projects-project-center--workbench-empty');
  await page.locator('.project-library-inspector').getByRole('heading',{name:'作品库概要'}).waitFor();
  checks.push('empty project library has actionable center and inspector overview');
  for (const theme of ['light','dark']) {
    await story(`product-studio-authoring-pages--assets${theme === 'dark' ? '-dark' : ''}`);
    await page.locator('.authoring-asset').first().waitFor();
    assert.equal(await page.locator('.gc-wb-bottom').count(),0);
    await page.locator('.authoring-asset').first().click();
    await page.locator('.asset-workbench-inspector').getByRole('button',{name:'打开素材编辑'}).waitFor();
    const name = await page.locator('.asset-workbench-inspector h2').innerText();
    await page.locator('.asset-workbench-inspector').getByRole('button',{name:'打开素材编辑'}).click();
    await page.locator('.authoring-asset-document h2').getByText(name,{exact:true}).waitFor();
    await page.getByRole('tree',{name:'素材类型',exact:true}).getByRole('treeitem',{name:'声音',exact:true}).click();
    await page.locator('.authoring-asset-list').waitFor();
    assert.equal(await page.locator('.authoring-asset-document').count(),0);
    await page.getByRole('tree',{name:'素材类型',exact:true}).getByRole('treeitem',{name:'全部素材',exact:true}).click();
    await page.locator('.authoring-asset').first().waitFor();
    const assetTree = page.getByRole('tree',{name:'本页素材',exact:true});
    const treeAsset = assetTree.getByRole('treeitem',{name,exact:true});
    await treeAsset.dblclick({delay:120});
    await page.locator('.authoring-asset-document h2').getByText(name,{exact:true}).waitFor();
    await page.getByRole('button',{name:'返回素材库',exact:true}).click();
    await page.locator('.authoring-asset').first().waitFor();
    await page.locator('.authoring-asset').first().focus();
    await page.locator('.authoring-asset').first().press('Enter');
    await page.locator('.authoring-asset-document h2').getByText(name,{exact:true}).waitFor();
    await page.getByRole('button',{name:'返回素材库',exact:true}).click();
    await page.locator('.authoring-asset').first().waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.authoring-asset-thumbnail img')].some(image => image.naturalWidth > 0));
    assert.equal(await page.locator('.authoring-asset-thumbnail img').evaluateAll(images => images.every(image => {
      const frame = image.parentElement.getBoundingClientRect(), box = image.getBoundingClientRect();
      return box.height <= frame.height + 1 && box.width <= frame.width + 1 && getComputedStyle(image).objectFit === 'contain';
    })), true, 'thumbnail images must fit inside their preview frame');
    await page.screenshot({path:join(output,`assets-${theme}.png`)});
    await page.setViewportSize({width:900,height:700});
    await page.locator('.authoring-asset').first().click();
    await page.waitForFunction(() => document.querySelector('.asset-inspector-preview')?.naturalWidth > 0);
    assert.equal(await page.locator('.asset-inspector-preview').evaluate(image => getComputedStyle(image).objectFit),'contain');
    await page.getByRole('button',{name:'显示或隐藏Inspector',exact:true}).click();
    await page.getByRole('button',{name:'显示或隐藏Inspector',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('.asset-inspector-preview')?.naturalWidth > 0);
    await page.screenshot({path:join(output,`assets-${theme}-900.png`)});
    await page.setViewportSize({width:1440,height:900});
    checks.push(`assets ${theme}: inspector follows selection, tree double-click opens document, type filtering, 900px inspector preview and manual reopen`);
  }
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'checks.json'),JSON.stringify({checks,errors},null,2));
  console.log(JSON.stringify({passed:checks.length,checks},null,2));
} finally { await browser.close(); }
