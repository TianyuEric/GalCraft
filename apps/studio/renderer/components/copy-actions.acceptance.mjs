import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const output=resolve('test-results/latest/player-website/w01/copy');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({permissions:['clipboard-read','clipboard-write'],viewport:{width:900,height:700}}),page=await context.newPage();
const checks=[],errors=[];let previous='';page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto('http://127.0.0.1:6007/iframe.html?id=components-code-details--long-index&viewMode=story');await page.locator('.gc-code-block').waitFor();previous=await page.evaluate(()=>navigator.clipboard.readText());
  const codeCopy=page.getByRole('button',{name:'复制',exact:true});assert(await codeCopy.evaluate(node=>getComputedStyle(node).borderTopWidth==='0px'&&node.getBoundingClientRect().height>=28));
  await codeCopy.focus();await codeCopy.press('Enter');const copied=await page.evaluate(()=>navigator.clipboard.readText());const data=JSON.parse(copied);assert.equal(data[0].changes[0].before.length,95);assert.equal(data[0].changes[0].after.length,96);assert.equal(data[0].changes[0].after.at(-1).id,'NewOne');checks.push('Borderless code copy includes the complete paginated document through keyboard input');await page.screenshot({path:resolve(output,'code-900.png')});
  await page.goto('http://127.0.0.1:6007/iframe.html?id=components-technical-identity--labelled&viewMode=story');const identity=page.locator('.gc-identity');await identity.waitFor();const expected=await identity.locator('code').innerText();const idCopy=identity.getByRole('button');assert(await idCopy.evaluate(node=>getComputedStyle(node).borderTopWidth==='0px'));await idCopy.click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),expected);checks.push('Identifier copy retains the exact identifier and has no visible border');
  assert.deepEqual(errors,[]);
}finally{await page.evaluate(value=>navigator.clipboard.writeText(value),previous).catch(()=>{});await writeFile(resolve(output,'report.json'),JSON.stringify({environment:'Windows / Edge / formal Storybook / actual clipboard APIs; original clipboard restored',executedAt:new Date().toISOString(),checks,errors},null,2));await browser.close();}
