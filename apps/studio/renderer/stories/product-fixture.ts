import type { Asset, Instruction, Snapshot } from '@galcraft/contracts';
import { FixtureAsset, FixtureIds, FixtureSnapshot, FixtureVoiceAssets, fixtureId } from '@galcraft/contracts/fixtures';
import { createOfficialTemplate, type OfficialTemplateKind } from '@galcraft/templates';

export const figureId=fixtureId(0xf10), figureVariantId=fixtureId(0xf11);
export const musicId=fixtureId(0xf16),musicVariantId=fixtureId(0xf17);
export const productMedia:Record<string,string>={
  [FixtureIds.background]:'/practice/backgrounds/spring-station.png',
  [figureId]:'/practice/figures/deepseek-neutral.png',
  [musicId]:'/practice/music/spring-01.opus',
};
export function productAssets():Asset[]{
  const background=structuredClone(FixtureAsset);background.name='雨站 · 背景';
  const figure=structuredClone(background);figure.id=figureId;figure.name='林舟 · 平静';figure.characterId=FixtureIds.an;
  figure.activeVariantId=figure.originalVariantId=figureVariantId;
  figure.variants[0]!.id=figureVariantId;figure.variants[0]!.metadata={width:1024,height:1536,hasAlpha:true};
  const music=structuredClone(FixtureVoiceAssets[0]!);music.id=musicId;music.name='春日 · 站台';music.locales=[];music.tags=['bgm'];music.sceneIds=[];
  music.activeVariantId=music.originalVariantId=musicVariantId;music.variants[0]!.id=musicVariantId;
  music.variants[0]!.files=[{path:'spring-01.opus',bytes:4733924,mime:'audio/ogg',role:'primary'}];music.variants[0]!.entry='spring-01.opus';music.variants[0]!.metadata={};
  return [background,figure,music];
}
export function productSnapshot(kind:OfficialTemplateKind='standard',appearance:'paper'|'night'='paper'):Snapshot {
  const snapshot=structuredClone(FixtureSnapshot);
  snapshot.project.name='雨站来信';snapshot.project.description='一封未署名的信，带你走进雨后的站台。';
  snapshot.template=createOfficialTemplate({kind,appearance,richRelation:'reading'});
  snapshot.lock.template=snapshot.template.dependencies.find(item=>item.kind==='template')!;
  snapshot.lock.plugins=[];snapshot.pluginDocuments={};
  snapshot.characters[0]!.name='林舟';
  snapshot.assets=snapshot.assets.filter(item=>item.kind!=='audio');
  for(const scene of snapshot.scenes)for(const instruction of scene.instructions)if(instruction.opcode==='say'){
    (instruction.args as Record<string,unknown>).voice=null;
  }
  const asset=snapshot.assets[0]!;
  snapshot.assets.push({...structuredClone(asset),assetId:figureId,variantId:figureVariantId,metadata:{width:1024,height:1536,hasAlpha:true}});
  const audio=structuredClone(FixtureSnapshot.assets.find(asset=>asset.kind==='audio')!);audio.assetId=musicId;audio.variantId=musicVariantId;
  audio.files=[{path:'spring-01.opus',bytes:4733924,mime:'audio/ogg'}];audio.entry='spring-01.opus';audio.metadata={};snapshot.assets.push(audio);
  const instruction=(id:number,opcode:string,args:Instruction['args']):Instruction=>({statementId:fixtureId(id),opcode,args,specVersion:'0.1.0',condition:null,continuation:'continue',skippable:false,source:{documentId:FixtureIds.streetDocument,statementId:fixtureId(id),revision:1}});
  snapshot.scenes[0]!.instructions.unshift(instruction(0xf12,'changeBg',{op:'show',assetId:FixtureIds.background}),
    instruction(0xf13,'changeFigure',{op:'show',assetId:figureId,objectId:fixtureId(0xf14),characterId:FixtureIds.an,station:'center',framing:{mode:'upper',scale:snapshot.project.canvas.height*.95/(1536*.6),offsetX:0,offsetY:snapshot.project.canvas.height*.6333333333,crop:null}}));
  snapshot.gallery=[{id:fixtureId(0xf15),kind:'cg',name:'雨中的约定',series:'雨站',order:0,cover:null,assets:[],differences:[{id:fixtureId(0xf16),assetId:FixtureIds.background,name:'雨中的约定',order:0}],coverDifferenceId:fixtureId(0xf16),lockedView:'placeholder'},
    {id:fixtureId(0xf18),kind:'music',name:'春日 · 站台',series:'雨站',order:0,cover:null,assets:[musicId],lockedView:'placeholder'}];
  return snapshot;
}
