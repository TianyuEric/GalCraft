import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(15000);
const out='test-results/latest/studio-review/components';await mkdir(out,{recursive:true});
const report={environment:'正式 Storybook / Edge / 组件夹具；组合输入事件为合成事件',checks:[],errors:[],result:'failed'};
page.on('pageerror',e=>report.errors.push(e.message));
const story=async id=>page.goto(`http://127.0.0.1:6007/iframe.html?id=${id}&viewMode=story`);
const check=(target,actual)=>report.checks.push({target,expected:'保持可读、可操作及既有业务语义',actual,result:'passed'});
try{
  await story('components-code-details--long-index');await page.locator('.gc-code-pages').waitFor();
  const before=await page.locator('.gc-code-block code').innerText();await page.getByRole('button',{name:'下一页',exact:true}).click();assert.notEqual(await page.locator('.gc-code-block code').innerText(),before);
  await page.getByRole('button',{name:'上一页',exact:true}).click();assert.equal(await page.locator('.gc-code-block code').innerText(),before);
  await page.screenshot({path:`${out}/code-light.png`});
  await story('components-code-details--dusk');await page.locator('.gc-code-pages').waitFor();await page.screenshot({path:`${out}/code-dusk.png`});
  await page.setViewportSize({width:900,height:750});await page.screenshot({path:`${out}/code-dusk-900.png`});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));check('完整代码分页及暮色窄窗','前后页可逆，无整页横向溢出');

  await story('product-studio-production-production-workflow--adopted-refresh-failure');
  await page.locator('.candidate-select').first().click();await page.getByRole('button',{name:'审阅采用',exact:true}).click();
  await page.getByRole('button',{name:'采用到工作内容',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'采用已经完成'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'采用到工作内容',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'审阅采用',exact:true}).isDisabled(),true);
  await page.screenshot({path:`${out}/adopted-refresh-failure.png`});
  await page.getByRole('button',{name:'重试刷新',exact:true}).click();await page.locator('.production-adoption-refresh').waitFor({state:'detached'});
  assert.match(await page.locator('.candidate-select').first().innerText(),/已采用/);check('采用后刷新失败与重试','成功回执关闭审阅，失败单独提示，重试后已采用');

  await story('product-studio-workbench-command-center--search-and-commands');
  await page.locator('output').filter({hasText:'检查剧情引用'}).waitFor();
  await page.getByRole('button',{name:'打开命令中心',exact:true}).click();
  const query=page.getByRole('combobox',{name:'搜索作品与命令'});await query.fill('林夏');
  await query.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,bubbles:true});
  assert.equal(await page.locator('.command-center-popup').count(),1);
  assert.equal(await page.locator('[aria-modal=true]:visible').count(),0);
  const bounds=await page.locator('.command-center-popup').boundingBox();assert(bounds.y<80&&bounds.x>=0&&bounds.x+bounds.width<=900);
  await page.screenshot({path:`${out}/command-900.png`});
  await page.keyboard.press('Escape');assert.equal(await page.locator('.command-center-popup').count(),0);
  await page.getByRole('button',{name:'打开命令中心',exact:true}).click();await page.getByRole('textbox',{name:'原编辑位置',exact:true}).click();
  assert.equal(await page.locator('.command-center-popup').count(),0);
  assert.equal(await page.getByRole('textbox',{name:'原编辑位置',exact:true}).evaluate(e=>document.activeElement===e),true);
  check('非模态搜索、焦点、组合输入与900px','合成 IME Enter 不执行；Esc 和背景点击关闭且背景获焦点');
  assert.deepEqual(report.errors,[]);report.result='passed';console.log(JSON.stringify(report,null,2));
}catch(error){report.errors.push(String(error));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}
finally{await writeFile(`${out}/acceptance.json`,JSON.stringify(report,null,2));await browser.close();}
