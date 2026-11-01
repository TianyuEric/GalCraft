import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const evidence=resolve('test-results/latest/harness-workspace');await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage();
const report={environment:'Formal Studio Storybook / real Edge / in-memory configuration and directory chooser',checks:[],errors:[],result:'failed'};
page.on('pageerror',error=>report.errors.push(error.message));
try{
  for(const [story,width]of [['configuration-workspace',1440],['configuration-workspace-dark',900],['configuration-workspace-cancelled',900]]){
    await page.setViewportSize({width,height:1000});await page.goto(`http://127.0.0.1:6007/iframe.html?id=product-studio-collaboration-collaboration--${story}&viewMode=story`);
    if(story.endsWith('cancelled')){
      await page.getByText('配置文件：D:/Stories/SpringLights/.codex/config.toml',{exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'使用当前作品目录',exact:true}).count(),0);
    }else{
      await page.getByRole('button',{name:'MCP 配置已写入',exact:true}).waitFor();
      assert(await page.getByRole('button',{name:'MCP 配置已写入',exact:true}).isDisabled());
      assert(await page.getByText('配置文件：D:/Stories/.codex/config.toml',{exact:true}).isVisible());
      assert(await page.getByText('当前接入作品目录：D:/Stories/SpringLights',{exact:true}).isVisible());
    }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:resolve(evidence,`${story}-${width}.png`)});
    report.checks.push({id:story,target:'Codex workspace selection and installation feedback',data:{width},expected:'Selected parent path, independent project identity, file-only status, cancellation preserves directory; no overflow',actual:'Visible state and assertions passed',result:'passed',evidence:`${story}-${width}.png`});
    if(!story.endsWith('cancelled')){
      await page.getByRole('button',{name:'本机服务',exact:true}).click();await page.getByRole('button',{name:'Harness 配置',exact:true}).click();
      await page.getByText('配置文件：D:/Stories/.codex/config.toml',{exact:true}).waitFor();
      assert(await page.getByRole('button',{name:'MCP 配置已写入',exact:true}).isDisabled());
      await page.getByRole('button',{name:'使用当前作品目录',exact:true}).click();
      await page.getByText('配置文件：D:/Stories/SpringLights/.codex/config.toml',{exact:true}).waitFor();
      assert(await page.getByRole('button',{name:'安装 / 更新 MCP 配置',exact:true}).isEnabled());
      await page.getByRole('button',{name:'选择工作区目录',exact:true}).focus();assert(await page.getByRole('button',{name:'选择工作区目录',exact:true}).evaluate(element=>element===document.activeElement));
    }
  }
  assert.deepEqual(report.errors,[]);report.result='passed';console.log('PASS: workspace selection, installation, default reset, cancellation, themes and 900px layout');
}catch(error){report.error=String(error.stack??error);throw error;}
finally{await writeFile(resolve(evidence,'storybook-report.json'),JSON.stringify(report,null,2));await browser.close();}
