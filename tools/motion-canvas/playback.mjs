import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile, writeFile, stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve, join} from 'node:path';
import {parseByteRange} from '../media/src/resources.mjs';
const repo = resolve(import.meta.dirname, '../..'), evidence = join(repo,'test-results/latest/motion-canvas/MC-T00');
const expected = JSON.parse(await readFile(join(import.meta.dirname,'runtime/manifest.json'),'utf8'));
const require = createRequire(join(expected.runtimeDirectory,'package.json')), {chromium} = require('playwright-core');
const file = join(evidence,'product.mp4'), size = (await stat(file)).size;
const server = createServer((request,response) => {
  const range = parseByteRange(request.headers.range,size), start = range?.start ?? 0, end = range?.end ?? size-1;
  response.writeHead(range ? 206 : 200, {'content-type':'video/mp4','access-control-allow-origin':'*','accept-ranges':'bytes','content-length':end-start+1,...(range ? {'content-range':`bytes ${start}-${end}/${size}`} : {})});
  createReadStream(file,{start,end}).pipe(response);
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser = await chromium.launch({executablePath:expected.browser.executablePath,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const report = {caseId:'MC-T00/media/playback',environment:{browser:browser.version()},result:'running'};
try {
  const page = await browser.newPage({viewport:{width:960,height:540}});
  await page.setContent(`<style>html,body{margin:0;background:#000}video{width:960px;height:540px}</style><video preload="auto" src="http://127.0.0.1:${server.address().port}/video"></video>`);
  await page.waitForFunction(()=>document.querySelector('video').readyState>=3);
  await page.screenshot({path:join(evidence,'playback-0.png')});
  await page.evaluate(async()=>{const video=document.querySelector('video'); await new Promise(done=>{video.addEventListener('seeked',done,{once:true});video.currentTime=7.5;});});
  await page.screenshot({path:join(evidence,'playback-7.5.png')});
  await page.evaluate(async()=>{const video=document.querySelector('video');video.currentTime=0;video.volume=1;video.muted=false;await video.play();});
  await page.waitForFunction(()=>document.querySelector('video').ended,null,{timeout:30000});
  report.actual = await page.evaluate(()=>{const video=document.querySelector('video'),quality=video.getVideoPlaybackQuality();return {ended:video.ended,currentTime:video.currentTime,duration:video.duration,width:video.videoWidth,height:video.videoHeight,muted:video.muted,volume:video.volume,quality:{totalVideoFrames:quality.totalVideoFrames,droppedVideoFrames:quality.droppedVideoFrames,corruptedVideoFrames:quality.corruptedVideoFrames}};});
  assert(report.actual.ended); assert.equal(report.actual.duration,15); assert(report.actual.quality.totalVideoFrames>=360);
  report.result='passed';
} catch(error) {report.result='failed';report.error=String(error.stack??error);process.exitCode=1;}
finally {await browser.close();await new Promise(done=>server.close(done));await writeFile(join(evidence,'playback.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
