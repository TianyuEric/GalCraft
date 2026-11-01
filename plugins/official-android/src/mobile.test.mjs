import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile,rm,stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detect, prepare } from './toolchain.mjs';
import { builder } from './services.mjs';
test('SDK preparation requires explicit license acceptance before touching the selected directory', async () => {
  const result = await prepare({ directory: join(tmpdir(), 'not-created-by-unaccepted-sdk'), acceptLicenses: false }, { signal: new AbortController().signal, progress() {} });
  assert.equal(result.error.code, 'ANDROID_LICENSE_REQUIRED');
});
test('cancelled preparation preserves unrelated files and has no generation request', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'galcraft-tools-')); await writeFile(join(directory, 'author.txt'), 'keep');
  const controller = new AbortController(); controller.abort();
  const result = await prepare({ directory, acceptLicenses: true }, { signal: controller.signal, progress() {} });
  assert.equal(result.error.code, 'BUILD_CANCELLED'); assert.equal(await readFile(join(directory, 'author.txt'), 'utf8'), 'keep');
});
test('explicit invalid tools are diagnosed instead of replaced by a system JDK', async () => {
  const result = await detect({ directory: tmpdir(), javaHome: join(tmpdir(), 'missing-jdk'), sdkRoot: join(tmpdir(), 'missing-sdk') });
  assert.equal(result.error.code, 'ANDROID_TOOLS_MISSING'); assert.match(result.error.message, /JDK/);
});
test('Android exposes the real package entry, fixed compatible tools and signing input', async () => {
  const description = await builder.describe(); assert.equal(description.target, 'android'); assert.ok(description.tools.some(tool => tool.id === 'gradle' && tool.version === '8.9'));
  const issues = await builder.validate({ applicationId: 'invalid', versionCode: 0, output: 'apk', toolchain: { directory: tmpdir() } }); assert.equal(issues[0].code, 'ANDROID_OPTIONS');
});
test('exports the complete Android project without SDK/JDK or Gradle and omits personal signing and tool paths',async()=>{
  const root=await mkdtemp(join(tmpdir(),'galcraft-project-export-'));
  try{
    await writeFile(join(root,'index.html'),'<!doctype html><html><head></head><body>Player export fixture</body></html>');
    await writeFile(join(root,'release.manifest.json'),JSON.stringify({files:[{path:'index.html',size:0}]}));
    const options={applicationId:'org.author.story',versionCode:1,output:'androidProject',toolchain:{directory:'X:/author-private-tools'},signing:{storeFile:'X:/private/author.jks',keyAlias:'private-alias',storePasswordEnvironment:'PRIVATE_STORE',keyPasswordEnvironment:'PRIVATE_KEY'}};
    assert.deepEqual(await builder.validate(options),[]);
    const result=await builder.build({stagingDirectory:root,webEntry:'index.html',project:{projectId:'Work01',name:'Short story',display:{}},plan:{input:{releaseVersion:'0.1.0'}},options},{signal:new AbortController().signal,progress(){}});
    assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.value.handoff.kind,'directory');assert.equal(result.value.artifacts[0].kind,'androidProject');assert.equal(result.value.signing.mode,'notApplied');
    assert.ok((await stat(join(root,'android-project/gradle/wrapper/gradle-wrapper.jar'))).size>0);
    const gradle=await readFile(join(root,'android-project/app/build.gradle'),'utf8'),tools=await readFile(join(root,'android-project/GALCRAFT-TOOLS.json'),'utf8');
    assert.match(gradle,/org\.author\.story/);assert.doesNotMatch(gradle+tools,/private-alias|author\.jks|author-private-tools|PRIVATE_STORE|PRIVATE_KEY/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('requires author signing for default AAB while keeping explicit local test as an exception',async()=>{
  const options={applicationId:'org.author.story',versionCode:1,output:'aab',toolchain:{directory:tmpdir()}};
  const denied=await builder.validate(options);assert.equal(denied[0].code,'ANDROID_OPTIONS');assert.match(denied[0].message,/AAB requires author/);
  const test=await builder.validate({...options,signingMode:'test'});assert.notEqual(test[0]?.code,'ANDROID_OPTIONS');
});
