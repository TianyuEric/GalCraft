import { checkEvidenceBudget, removeWorkspace } from '../../tests/e2e/workspace.mjs';
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile, copyFile, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {renderMotionProject} from './render.mjs';
import {runProcess} from '../media/src/process.mjs';
await checkEvidenceBudget();
const repo=resolve(import.meta.dirname,'../..'), directory=join(repo,'tmp/testing/motion-canvas-freeze'), evidence=join(repo,'test-results/latest/motion-canvas/MC-T00');
const expected=JSON.parse(await readFile(join(import.meta.dirname,'runtime/manifest.json'),'utf8'));
await mkdir(directory,{recursive:true});
const project={schemaVersion:1,id:'freeze-project',revision:1,title:'春日序章',entry:'project.ts',files:[],bindings:[{alias:'image',assetId:'image',variantId:'v1',port:'images',purpose:'image'},{alias:'font',assetId:'font',variantId:'v1',port:'fonts',purpose:'font'},{alias:'audio',assetId:'audio',variantId:'v1',port:'audio',purpose:'audio'}],render:{width:960,height:540,fps:24,frames:360,audio:{alias:'audio',startSec:0,trimSec:0,gainDb:0}},toolchain:{motionCanvas:'3.17.2',vite:'5.4.21',renderer:'0.1.0'}};
for(const path of ['project.ts','scene.tsx'])project.files.push({path,content:(await readFile(join(import.meta.dirname,'fixture',path),'utf8')).replaceAll('GalCraftMotion','GalCraftMotion_font').replaceAll('/media/audio.opus','/media/audio.ogg')});
const resources=await Promise.all([{alias:'image',mime:'image/png',path:join(repo,'apps/studio/resources/practice/backgrounds/spring-shop.png')},{alias:'font',mime:'font/otf',path:join(repo,'tools/fonts/cache/NotoSansCJKsc-Regular.otf')},{alias:'audio',mime:'audio/ogg',path:join(repo,'apps/studio/resources/practice/music/spring-01.opus')}].map(async item=>({alias:item.alias,mime:item.mime,bytes:new Uint8Array(await readFile(item.path))})));
const nextImage=await readFile(join(repo,'apps/studio/resources/practice/backgrounds/spring-street.png'));
const frozenProject=structuredClone(project),frozenResources=structuredClone(resources),report={caseId:'MC-T00/freeze-repeat/new-revision',result:'running'};
let changed=false;
try {
  const first=await renderMotionProject({project:frozenProject,resources:frozenResources,directory:join(directory,'v1'),requestId:'v1',expected,signal:new AbortController().signal,onProgress(event){if(event.phase==='rendering'&&event.completed===24){project.revision=2;project.files[1].content=project.files[1].content.replace('春日序章','春日新章');project.bindings[0].variantId='v2';resources[0].bytes=new Uint8Array(nextImage);changed=true;}}});
  assert(changed);assert(frozenProject.files[1].content.includes('春日序章'));assert.equal(frozenProject.bindings[0].variantId,'v1');
  const original=await readFile(first.localPath);await copyFile(first.localPath,join(evidence,'freeze-v1.mp4'));
  const second=await renderMotionProject({project,resources,directory:join(directory,'v2'),requestId:'v2',expected,signal:new AbortController().signal});
  await copyFile(second.localPath,join(evidence,'freeze-v2.mp4'));assert((await readFile(first.localPath)).equals(original));
  for(const [name,path]of [['freeze-v1',first.localPath],['freeze-v2',second.localPath]])await runProcess(join(expected.encoding.toolDirectory,'ffmpeg.exe'),['-v','error','-y','-ss','7.5','-i',path,'-frames:v','1',join(evidence,`${name}.png`)]);
  assert(!(await readFile(join(evidence,'freeze-v1.png'))).equals(await readFile(join(evidence,'freeze-v2.png'))));
  report.result='passed';report.actual={frozenRevision:1,frozenImageVersion:'v1',nextRevision:2,nextImageVersion:'v2',changedDuringFrame:24,bothFrames:360,oldCandidatePreserved:true};
  await writeFile(join(evidence,'freeze-project-v1.json'),JSON.stringify(frozenProject,null,2));await writeFile(join(evidence,'freeze-project-v2.json'),JSON.stringify(project,null,2));
}catch(error){report.result='failed';report.error=String(error.stack??error);process.exitCode=1;}
finally{await removeWorkspace(directory);await checkEvidenceBudget();await writeFile(join(evidence,'freeze-repeat.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
