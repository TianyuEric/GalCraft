import { expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { components, readTemplateDocuments } from '@galcraft/templates';
import { ProjectAccess } from './project-access.mjs';
import { ProjectDocuments } from './document-providers.mjs';
import { StudioAssets } from './asset-providers.mjs';
import { listActionIconPresets, importActionIconPreset } from './action-icon-presets.mjs';

const unwrap=result=>{if(!result.ok)throw new Error(JSON.stringify(result));return result.value;};
it('exposes the fifteen shipped action SVGs without the lantern decoration',async()=>{
  const presets=unwrap(await listActionIconPresets());expect(presets).toHaveLength(15);expect(presets.some(preset=>preset.key==='lantern')).toBe(false);
  for(const preset of presets){expect(preset.names['zh-CN']).toBeTruthy();expect(decodeURIComponent(preset.previewUri.split(',')[1])).toContain('<svg');}
});
it('imports and binds a real SVG in one M02 operation, undoes both, redoes and saves the resource closure',async()=>{
  const parent=resolve(import.meta.dirname,'../../../tmp/testing');await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'action-icons-'));
  const documents=new ProjectDocuments(new ProjectAccess(),undefined,{resolveEngine:async()=>({ok:true,value:{version:'0.1.0',manifest:{targets:['web','windows']}},warnings:[]})});
  unwrap(await documents.create({path:directory,name:'图标事务',template:'standard',width:1920,height:1080,engineVersion:'0.1.0'}));
  try{
    const assets=new StudioAssets(documents,resolve(import.meta.dirname,'../../../tools/media/runtime/bin'));
    const template=()=>readTemplateDocuments(unwrap(documents.list())),button=components(template().pages.find(page=>page.key==='title').root).find(component=>component.part==='title.menu.start');
    const receipt=unwrap(await importActionIconPreset(assets,{key:'start',componentId:button.id,state:'normal'}));
    const imported=assets.current().index.data.assets[0];expect(imported.tags).toContain('galcraft:action-icon:start');expect(assets.current().index.data.assets).toHaveLength(1);
    const binding=()=>components(template().pages.find(page=>page.key==='title').root).find(component=>component.id===button.id).normal.images?.icon;
    expect(binding()).toMatchObject({assetId:imported.id,colorMode:'mask',tint:null});expect(receipt.documents).toHaveLength(2);
    const repeatedBefore=unwrap(documents.list());
    expect(unwrap(await importActionIconPreset(assets,{key:'start',componentId:button.id,state:'normal'}))).toBeNull();
    expect(unwrap(documents.list())).toEqual(repeatedBefore);
    const pageDocument=receipt.documents.find(value=>value.ref.id!==assets.current().index.documentId).ref.id;
    const undo=unwrap(documents.planUndo(pageDocument));expect(undo.reverseOrder).toHaveLength(1);unwrap(documents.undo(undo.planId));expect(binding()).toBeUndefined();expect(assets.current().index.data.assets).toHaveLength(0);
    unwrap(documents.redo(undo.planId));expect(binding().assetId).toBe(imported.id);expect(assets.current().index.data.assets).toHaveLength(1);
    const hover=unwrap(await importActionIconPreset(assets,{key:'start',componentId:button.id,state:'hover'}));expect(hover.documents).toHaveLength(1);expect(assets.current().index.data.assets).toHaveLength(1);
    const hoverUndo=unwrap(documents.planUndo(pageDocument));unwrap(documents.undo(hoverUndo.planId));expect(assets.current().index.data.assets).toHaveLength(1);expect(binding().assetId).toBe(imported.id);unwrap(documents.redo(hoverUndo.planId));
    unwrap(await importActionIconPreset(assets,{key:'save',componentId:button.id,state:'normal'}));expect(assets.current().index.data.assets).toHaveLength(2);expect(binding().assetId).not.toBe(imported.id);
    const replaceUndo=unwrap(documents.planUndo(pageDocument));unwrap(documents.undo(replaceUndo.planId));expect(binding().assetId).toBe(imported.id);expect(assets.current().index.data.assets).toHaveLength(1);unwrap(documents.redo(replaceUndo.planId));
    const save=unwrap(documents.planSave({kind:'current',documentId:pageDocument}));unwrap(await documents.save(save.planId));
    const bytes=await readFile(join(documents.currentRoot,'assets/files',imported.id,imported.activeVariantId,imported.variants[0].entry),'utf8');expect(bytes).toContain('<svg');
    const index=JSON.parse(await readFile(join(documents.currentRoot,'assets/index.json'),'utf8'));expect(index.data.assets.some(asset=>asset.id===imported.id)).toBe(true);
  }finally{await documents.currentSession?.dispose('discard');}
},30000);
