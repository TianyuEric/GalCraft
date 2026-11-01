import { prepareWorkspace, removeWorkspace, checkEvidenceBudget } from '../../tests/e2e/workspace.mjs';
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const run=promisify(execFile),repo=resolve(import.meta.dirname,'../..');
const root=await prepareWorkspace('motion-canvas-package'),resources=join(root,'resources'),runtime=join(root,'profile/runtimes/motion-canvas');
const evidence=join(repo,'test-results/latest/motion-canvas/packaged-layout');
await checkEvidenceBudget();
try {
await mkdir(join(resources,'motion-canvas'),{recursive:true});await mkdir(evidence,{recursive:true});
for(const name of ['prepare.mjs','render.mjs','browser'])await cp(join(import.meta.dirname,name),join(resources,'motion-canvas',name),{recursive:true});
await cp(join(repo,'tools/media/src/process.mjs'),join(resources,'media/src/process.mjs'),{recursive:true});
await cp(join(repo,'tools/media/runtime/bin'),join(resources,'media/bin'),{recursive:true});
await cp(join(import.meta.dirname,'runtime'),runtime,{recursive:true});
const browser=JSON.parse(await readFile(join(runtime,'manifest.json'),'utf8')).browser.executablePath;
const invoked=await run(process.execPath,[join(resources,'motion-canvas/prepare.mjs'),'--directory',runtime,'--browser',browser,'--media-tools',join(resources,'media/bin')],{cwd:root,windowsHide:true,maxBuffer:1024*1024});
const start=invoked.stdout.indexOf('{\n  "url"');assert(start>=0,invoked.stdout);
const prepared=JSON.parse(invoked.stdout.slice(start));
assert.equal(prepared.expected.encoding.toolDirectory,join(resources,'media/bin'));assert.equal(prepared.expected.runtimeDirectory,runtime);
const entry=await import(pathToFileURL(join(resources,'motion-canvas/render.mjs')).href);assert.equal(typeof entry.renderMotionProject,'function');
await writeFile(join(evidence,'acceptance.json'),JSON.stringify({caseId:'MC-T09/packaged-runtime-preparation',requirementIds:['MC-C02','MC-C03'],specification:'tools/motion-canvas/README.md',target:'packaged directory layout',environment:{platform:process.platform,node:process.version,...prepared.expected},dataset:'Actual copied resources/motion-canvas, resources/media/bin and isolated personal runtime directory',steps:'Run the shipped preparation CLI with explicit --media-tools, launch real Chrome, inspect actual FFmpeg, write and read its runtime manifest, import shipped render entry',expected:'Preparation resolves the shipped media/bin and the selected writable runtime; packaged render entry imports',actual:{url:prepared.url,encoding:prepared.expected.encoding,runtimeDirectory:runtime,renderExport:typeof entry.renderMotionProject},result:'passed',evidence:'test-results/latest/motion-canvas/packaged-layout',owner:'integration',executedAt:new Date().toISOString(),blockingIssue:null},null,2));
console.log(JSON.stringify({result:'passed',runtimeDirectory:runtime,mediaDirectory:prepared.expected.encoding.toolDirectory}));

} finally { await removeWorkspace(root); await checkEvidenceBudget(); }
