import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fail, ok } from './result.mjs';
import { ImportCoordinator } from '@galcraft/assets';
import { componentDefinition, findComponent, readTemplateDocuments, templateEdit } from '@galcraft/templates';

const directory = join(import.meta.dirname, '../resources/practice/ui');
const presets = [
  ['start','开始','Start','開始'], ['save','保存','Save','保存'], ['load','读取','Load','読込'],
  ['history','历史','History','履歴'], ['settings','设置','Settings','設定'], ['pin','固定','Pin','固定'],
  ['auto','自动','Auto','オート'], ['skip','快进','Skip','スキップ'], ['title','标题页','Title','タイトル'],
  ['back','返回','Back','戻る'], ['music','音乐','Music','音楽'], ['cg','图片鉴赏','Gallery','画像鑑賞'],
  ['exit','退出','Exit','終了'], ['flow','剧情流程','Story flow','フロー'], ['characters','角色','Characters','キャラクター'],
];
export const ActionIconPresets = presets.map(([key, zh, en, ja]) => ({key,names:{'zh-CN':zh,en,ja}}));

/** These previews and imports read the same shipped SVG files. Decoration is outside the action catalog. */
export async function listActionIconPresets(resourceDirectory = directory) {
  return ok(await Promise.all(presets.map(async ([key, zh, en, ja]) => ({ key, names: { 'zh-CN': zh, en, ja },
    previewUri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await readFile(join(resourceDirectory, `spring-${key}.svg`), 'utf8'))}`,
  }))));
}

/** One M02 operation owns both M04's prepared asset and the public icon binding. */
export async function importActionIconPreset(assets, input, resourceDirectory = directory) {
  const {key, componentId, state} = input;
  if (!presets.some(preset => preset[0] === key)) return fail('ICON_PRESET_UNKNOWN', '请选择目录中的常用图标', 'M04');
  if (!['normal','hover','pressed','focus','disabled','selected','locked','empty'].includes(state)) return fail('ICON_STATE_UNKNOWN', '请选择有效图标状态', 'M08');
  const current=assets.current(), root=assets.projectDocuments.currentRoot;
  if (!current || !root) return fail('ASSET_INDEX_MISSING', '请先打开作品', 'M04');
  const documents=[...current.session.documents.keys()].map(id=>current.session.readDocument(id));
  const template=readTemplateDocuments(documents),component=findComponent(template,componentId);
  if (!component || !componentDefinition(component.part)?.imageSlots.includes('icon')) return fail('ICON_SLOT_MISSING','当前部件没有公开图标槽','M08');
  const tag = `galcraft:action-icon:${key}`;
  let asset=current.index.data.assets.find(asset=>asset.tags.includes(tag)), coordinator, typeLease, prepared=[], confirmed=false, indexEdit;
  try {
    if (!asset) {
      typeLease=await assets.acquireTypes(current.session);
      coordinator=new ImportCoordinator(root,assets.toolDirectory,()=>assets.current()?.index??current.index,undefined,assets.svgDecoder,undefined,typeLease.types);
      const items=await coordinator.importBatch({projectId:current.session.projectId,files:[join(resourceDirectory,`spring-${key}.svg`)],folder:[],conflict:'keepBoth',usage:null,targetBinding:null});
      const imported=items[0]?.result;if(!imported?.ok)return imported??fail('ICON_PRESET_IMPORT','图标导入失败，请重试','M04');
      prepared=[imported.value.preparationId];
      const edit=coordinator.prepareIndexEdit(prepared);if(!edit.ok)return edit;indexEdit=edit.value;
      for (const patch of indexEdit.indexPatches) if (patch.kind==='json') for (const change of patch.changes) if(change.path==='/data/assets') {
        asset=change.after.find(value=>value.id===imported.value.assetId);asset.tags.push(tag);
      }
    }
    const visual=state==='normal'?component.normal:component.states[state]??={};
    (visual.images??={}).icon={assetId:asset.id,variantId:asset.activeVariantId,mode:'contain',positionX:.5,positionY:.5,colorMode:'mask',tint:null,opacity:1,slices:null,borders:null,fillCenter:false};
    const edit=templateEdit(documents,template,'选用常用图标');edit.origin='preset';
    if(indexEdit){edit.patches.push(...indexEdit.indexPatches);edit.preparedAssets.push(...indexEdit.preparedAssets);for(const ref of indexEdit.expected)if(!edit.expected.some(value=>value.ref.id===ref.ref.id))edit.expected.push(ref);}
    if(assets.projectDocuments.currentSession!==current.session)return fail('PROJECT_STALE','作品已切换，请重新选择图标','M04');
    if(!edit.patches.length)return ok(null);
    const planned=current.session.planEdit(edit);if(!planned.ok)return planned;
    const applied=current.session.applyEdit(planned.value.planId,edit.expected);if(!applied.ok)return applied;
    coordinator?.confirm(prepared);confirmed=true;return applied;
  } finally {try{if(!confirmed)for(const id of prepared)await coordinator?.discard(id);}finally{await typeLease?.release();}}
}
