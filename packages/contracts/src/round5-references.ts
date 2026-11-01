import type { Character, Project, Scene, SceneEntryPresentation } from './project.js';
import type { Id } from './common.js';

export type Round5AssetBinding = { assetId:Id; variantId:Id|null; field:string; kind:'image'|'audio'|'animation' };
/** Author document owners use this catalog for M02 references, M04 checks and M11 closure. */
export function round5AssetBindings(input: {project?:Project;scene?:Scene;character?:Character}):Round5AssetBinding[] {
  const result:Round5AssetBinding[]=[];
  const boundary=(presentation:SceneEntryPresentation|undefined,path:string)=>{
    for(const key of ['enter','exit']as const){const transition=presentation?.title?.[key];if(transition?.preset==='custom'&&transition.resourceId)result.push({assetId:transition.resourceId,variantId:null,field:`${path}/title/${key}/resourceId`,kind:'animation'});}
    const interlude=presentation?.interlude;if(!interlude)return;
    result.push({...interlude.image,field:`${path}/interlude/image/assetId`,kind:'image'});
    if(interlude.voice)result.push({...interlude.voice,field:`${path}/interlude/voice/assetId`,kind:'audio'});
    for(const key of ['oldStageExit','enter','exit','newStageEnter']as const){const transition=interlude[key];if(transition.preset==='custom'&&transition.resourceId)result.push({assetId:transition.resourceId,variantId:null,field:`${path}/interlude/${key}/resourceId`,kind:'animation'});}
  };
  input.project?.chapters.forEach((chapter,index)=>boundary(chapter.presentation,`/data/chapters/${index}/presentation`));
  if(input.scene)boundary(input.scene.presentation,'/data/presentation');
  if(input.character){for(const[index,difference]of(input.character.differences??[]).entries()){
    result.push({...difference.figure,field:`/data/differences/${index}/figure/assetId`,kind:'image'});
    if(difference.avatar?.kind==='image')result.push({assetId:difference.avatar.assetId,variantId:difference.avatar.variantId,field:`/data/differences/${index}/avatar/assetId`,kind:'image'});
  }
  if(input.character.afterstory?.presentation)result.push({...input.character.afterstory.presentation.figure,field:'/data/afterstory/presentation/figure/assetId',kind:'image'});}
  return result;
}
