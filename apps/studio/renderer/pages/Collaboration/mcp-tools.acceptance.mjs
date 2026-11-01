import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const out='test-results/latest/studio-mcp-tools/components';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage(),report={environment:'Formal Storybook / Edge',checks:[],errors:[],result:'failed'};
page.on('pageerror',error=>report.errors.push(error.message));
try{
  for(const theme of ['light','dark'])for(const width of [1440,900]){
    await page.setViewportSize({width,height:900});
    await page.goto('http://127.0.0.1:6007/iframe.html?id=product-studio-collaboration-collaboration--end-session&viewMode=story');
    await page.getByRole('button',{name:'结束协作',exact:true}).waitFor();
    // Storybook's play function exercises the same public bridge action.
    await page.getByText('协作已结束，审阅缓存已清理；作品与历史调用保留。',{exact:true}).waitFor();
    await page.locator('#app').evaluate((element,theme)=>element.dataset.theme=theme,theme);
    assert(await page.getByRole('button',{name:'结束协作',exact:true}).isDisabled());
    assert(await page.getByRole('button',{name:'恢复协作',exact:true}).isDisabled());
    await page.getByText('查看与调整执行范围',{exact:true}).click();
    assert(await page.getByRole('button',{name:'保存范围',exact:true}).isDisabled());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`${out}/ended-${theme}-${width}.png`});
    report.checks.push({theme,width,result:'passed',actual:'Ended status, retained call history, disabled resume/scope save, no page overflow'});
  }
  assert.deepEqual(report.errors,[]);report.result='passed';
}finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
