import { test } from 'node:test';
import assert from 'node:assert/strict';
import {createOfficialTemplate,createTemplateDocuments,components} from '../packages/templates/dist/index.js';
import { planGalleryUpgrade,upgradeGalleryLongTerm } from './upgrade-player-gallery.mjs';
const gallery={documentId:'gal001',revision:4,format:'json',files:{'gallery/gal001.json':JSON.stringify({schemaVersion:1,documentId:'gal001',revision:4,data:{id:'gal001',kind:'cg',name:'Old CG',series:'A',order:0,cover:null,assets:['asset1','asset2'],lockedView:'placeholder'}})}};
const scene={documentId:'scene1',revision:8,format:'dsl',files:{'scenes/scene1/script.gal':'// keep this comment\nunlockCg {entryId:"gal001"} @stmt01;\nchangeBg {assetId:"asset2",galleryId:"gal001"} @stmt02;'}};
test('one-time conversion preserves identity, comments and explicit old selections',()=>{
  const plan=planGalleryUpgrade([gallery,scene]);assert.equal(plan.issues.length,0);assert.equal(plan.map.gal001.length,2);assert.equal(new Set(plan.map.gal001.map(diff=>diff.id)).size,2);
  const entry=plan.edit.patches[0].changes[0].after;assert.equal(entry.id,'gal001');assert.deepEqual(entry.assets,[]);
  const converted=upgradeGalleryLongTerm({schemaVersion:1,revision:3,cg:['gal001'],music:['music1'],endings:['end1'],variables:{}},plan.map);
  assert.deepEqual(converted.cg.gal001,plan.map.gal001.map(diff=>diff.id));assert.deepEqual(converted.music,['music1']);assert.deepEqual(converted.endings,['end1']);
  entry.differences.push({id:'added1',assetId:'asset3',name:'Added',order:2});assert.equal(converted.cg.gal001.includes('added1'),false);
  assert.throws(()=>upgradeGalleryLongTerm({schemaVersion:1,cg:['absent']},plan.map),/缺少旧作品/);
  const upgraded={...gallery,files:{'gallery/gal001.json':JSON.stringify({data:entry})}};assert.equal(planGalleryUpgrade([upgraded]).edit.patches.length,0);
});
test('ambiguous background associations are reported without choosing a difference',()=>{
  const duplicate=structuredClone(gallery),data=JSON.parse(duplicate.files['gallery/gal001.json']);data.data.assets=['asset2','asset2'];duplicate.files['gallery/gal001.json']=JSON.stringify(data);
  const plan=planGalleryUpgrade([duplicate,scene]);assert.equal(plan.issues.length,1);assert.equal(plan.issues[0].statementId,'stmt02');
});

test('upgrades page parts without importing unresolved animation references',()=>{
  const template=createOfficialTemplate();template.animations=[];for(const page of template.pages)for(const component of components(page.root))component.animations={};
  const cg=template.pages.find(page=>page.key==='cg');cg.root.children=cg.root.children.filter(component=>component.part!=='cg.types');
  const plan=planGalleryUpgrade(createTemplateDocuments(template));const updated=plan.edit.patches.flatMap(patch=>patch.changes??[]).map(change=>change.after).find(page=>page?.key==='cg');assert(updated);const types=components(updated.root).find(component=>component.part==='cg.types');assert(types);assert.deepEqual(types.animations,{});
});
