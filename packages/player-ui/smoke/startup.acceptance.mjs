import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const { chromium } = createRequire(process.env.GALCRAFT_PLAYWRIGHT_PACKAGE ?? import.meta.url)('playwright');
const output = resolve('test-results/latest/workbench-reconstruction/player');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=document-user-activation-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(15000);
const report = { environment: 'Chrome / real AudioContext and HTML video / actual PlayerView and Stage; fixture Snapshot and in-memory PlayerHost; no disk or release claim', checks: [], errors: [], result: 'failed' };
page.on('pageerror', error => report.errors.push(error.message));
const load = async query => { await page.goto(`${process.env.GALCRAFT_PLAYER_STARTUP_URL ?? 'http://127.0.0.1:5192/startup.html'}${query}`); await page.waitForFunction(() => document.documentElement.dataset.ready === 'true'); };
const ready = async (expectedPage = null) => page.waitForFunction(expected => {
  const root = document.getElementById('app'), content = root?.querySelector('.gc-content');
  return root?.getAttribute('aria-busy') !== 'true' && content && (!expected || content.dataset.page === expected) &&
    (!content.inert || !expected && root.querySelector('.gc-startup'));
}, expectedPage);
const click = async (name, expectedPage) => {
  await ready(); await page.getByRole('button', { name, exact: true }).click(); await ready(expectedPage);
};
const back = async (from, to) => {
  await ready(from); await page.locator(`.gc-content[data-page="${from}"]`).getByRole('button', { name: '返回', exact: true }).click(); await ready(to);
};
const selectAudition = async () => {
  await ready('music'); await page.locator('[data-gc-part="music.list.item"]').filter({ hasText: '试听 D · 440Hz' }).click();
};
const current = () => page.evaluate(() => {
  const active = new Map();
  for (const event of window.acceptance.events) { if (event.kind === 'start') active.set(event.nodeId, event); else active.delete(event.nodeId); }
  const audition = window.acceptance.mounted.view.pageAudio.auditionInspection();
  return { page: window.acceptance.mounted.view.navigation.page, active: [...active.values()], events: [...window.acceptance.events], text: document.body.innerText,
    audition: audition?.ok ? audition.value : null };
});
const active = async expected => { await page.waitForFunction(expected => {
  const nodes = new Map(); for (const event of window.acceptance.events) { if (event.kind === 'start') nodes.set(event.nodeId, event.duration); else nodes.delete(event.nodeId); }
  return [...nodes.values()].sort((a,b)=>a-b).join() === expected.join();
}, [...expected].sort((a,b)=>a-b)); return current(); };
const check = (id, target, actual) => report.checks.push({ id, target, result: 'pass', actual });
const sound = async () => { await page.waitForFunction(() => window.acceptance.events.some(event=>event.kind==='start') || [...document.querySelectorAll('button')].some(button=>!button.hidden && button.textContent==='启用声音')); const enable = page.getByRole('button', { name: '启用声音', exact: true }); if (await enable.isVisible()) await enable.click(); };
const shot = name => page.screenshot({ path: join(output, `${name}.png`), animations: 'disabled' });
const open = async key => { await ready(); await page.evaluate(key => window.acceptance.mounted.view.open(key), key); await ready(key); };
try {
  await load(''); await page.locator('.gc-startup').waitFor(); await shot('static-splash');
  await page.keyboard.press('Escape'); await page.locator('.gc-startup').waitFor({ state: 'detached' });
  await sound(); await active([30]);
  await click('设置', 'settings'); const homeSettings = await active([30]); await back('settings', 'title');
  assert.equal(await page.locator('.gc-startup').count(), 0);
  check('PA-T01', '静图开屏可跳过，设置返回不重播', homeSettings);
  await click('开始游戏', 'story'); const stage = await active([31,32]);
  await click('设置', 'settings'); const stageSettings = await active([31,32]); await back('settings', 'story');
  assert.deepEqual((await current()).events, stageSettings.events);
  await open('cg'); const cg = await active([31,32]); await back('cg', 'story');
  assert.deepEqual((await current()).events, cg.events);
  check('PA-T02', '主页设置持续A，舞台设置与CG持续B+C且不重启实例；CG使用真实view入口', { stage, stageSettings, cg });
  await open('music'); await active([30]); await selectAudition();
  await active([30]); await click('播放'); const playing = await active([6]);
  await page.waitForFunction(() => Number(document.querySelector('[data-gc-part="music.player.progress"]')?.value) > .2);
  await click('暂停'); const paused = await active([30]);
  await click('继续'); const resumed = await active([6]); assert(resumed.active[0].offset > .1);
  await click('设置', 'settings'); const auditionSettings = await active([30]); await back('settings', 'music');
  assert((await current()).text.includes('已暂停')); await active([30]);
  check('PA-T03/04', '选曲不播放，暂停与嵌套设置恢复A，继续保留D游标', { playing, paused, resumed, auditionSettings });
  await click('继续'); await active([6]);
  await page.evaluate(()=>window.acceptance.lifecycle('blur')); const blurred = await active([]);
  assert.equal(blurred.audition.status, 'paused'); assert(blurred.audition.pauses.includes('focus')); assert.equal(blurred.audition.userPaused, false);
  await page.evaluate(()=>window.acceptance.lifecycle('focus')); const focused = await active([6]);
  await open('emergency'); await active([]); await page.evaluate(()=>window.acceptance.lifecycle('blur'));
  await page.getByRole('button').filter({ hasText: /恢复/ }).click(); await ready('music'); await active([]);
  await page.evaluate(()=>window.acceptance.lifecycle('focus')); await active([6]);
  check('PA-T05', '失焦与紧急暂停叠加，全部解除才恢复D，没有错误A', { blurred, focused });
  await click('停止'); await active([30]); await back('music', 'story');
  const restored = await active([31,32]); assert(restored.active.every(event=>event.offset > .1));
  check('PA-T03-return', '离开鉴赏恢复B+C原游标', restored);
  await open('music'); await active([30]); await selectAudition(); await click('播放'); await active([6]);
  await active([30]); assert((await current()).text.includes('已结束'));
  check('PA-T03-ended', 'D自然结束恢复A', await current());
  await shot('music-ended'); await page.evaluate(()=>window.acceptance.dispose()); await active([]);
  check('PA-T06-dispose', '销毁释放实际音源', await current());

  await load('?splash=none'); assert.equal(await page.locator('.gc-startup').count(),0);
  const blocked = await current(); assert.equal(blocked.active.length,0);
  await page.getByRole('button',{name:'启用声音',exact:true}).waitFor(); await click('启用声音'); const enabled=await active([30]);
  check('PA-T07', '强制浏览器自动播放限制后真实启用声音动作恢复A', { blocked, enabled });
  await load('?splash=broken'); await page.locator('.gc-startup').waitFor({state:'detached'}); assert((await current()).text.includes('开屏测试故障'));
  await shot('splash-failure'); check('PA-T06-resource', '资源失败进入可操作主页并显示自身诊断', await current());
  await load('?splash=video&titleVideo'); await page.locator('.gc-startup video').waitFor();
  const videoEnable=page.locator('.gc-startup').getByRole('button').filter({hasText:/播放|启用/}); if(await videoEnable.count())await videoEnable.first().click();
  await shot('video-splash'); await page.locator('.gc-startup').waitFor({state:'detached',timeout:15000});
  await page.locator('.gc-title-media video').waitFor();
  assert.equal(await page.locator('.gc-title-media video').evaluate(video=>video.volume),0);
  check('PA-T01-video/T09', '实际WebM视频结束进入主页，标题视频默认静音', await current());
  await load('?noSkip'); await page.locator('.gc-startup').waitFor(); assert.equal(await page.getByRole('button',{name:'跳过',exact:true}).count(),0);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.gc-startup').count(),1);
  await page.locator('.gc-startup').waitFor({state:'detached'}); check('PA-T01-noSkip', '禁用跳过保留时长，Esc不跳过', await current());
  assert.deepEqual(report.errors,[]); report.result='passed';
} catch(error) { report.failure = error.stack; report.failedState = await current().catch(()=>null); throw error; }
finally { report.executedAt=new Date().toISOString(); await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify({result:report.result,checks:report.checks.length,output,failure:report.failure})); await browser.close(); }
