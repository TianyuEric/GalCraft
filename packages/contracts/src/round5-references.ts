import type { Character, Project, Scene, SceneEntryPresentation } from './project.js';
import { IdSchema, type Id } from './common.js';

export type Round5AssetBinding = { assetId:Id; variantId:Id|null; field:string; kind:'image'|'audio'|'animation' };
export function sceneDecorAssetBindings(scene: Pick<Scene, 'decorLayers'>): Round5AssetBinding[] {
  return (scene.decorLayers ?? []).map(({ assetId, variantId }, index) =>
    ({ assetId, variantId: variantId ?? null, field: `/data/decorLayers/${index}/assetId`, kind: 'image' }));
}

type StageCommandAssetBinding = { assetId: Id; variantId: Id | null; path: string[]; eventId?: Id };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
/** Preserve asset-use navigation for retired raw keys until the author repairs them. */
export const retiredImageModelFields = {
  imageMouth: ['closed', 'half', 'open'],
  imageBlink: ['open', 'closed'],
  imageFaceCombinations: ['closedOpen', 'halfOpen', 'openOpen', 'closedClosed', 'halfClosed', 'openClosed'],
} as const;
/** Read the authored or compiled fixed/floating binding once, together with its source path. */
export function stageCommandAssetBindings(command: string, args: unknown): StageCommandAssetBinding[] {
  if (!record(args)) return [];
  const binding = (value: Record<string, unknown>, path: string[], eventId?: Id): StageCommandAssetBinding[] => {
    const assetId = IdSchema.safeParse(value.assetId);
    if (!assetId.success) return [];
    return [{ assetId: assetId.data, variantId: IdSchema.safeParse(value.variantId).data ?? null, path, ...(eventId ? { eventId } : {}) }];
  };
  if (command === 'changeFigure' && record(args.model)) {
    const model = args.model;
    return Object.entries(retiredImageModelFields).flatMap(([field, keys]) => {
      const group = model[field];
      return record(group) ? keys.flatMap(key => binding({ assetId: group[key] }, ['model', field, key])) : [];
    });
  }
  if (['changeBg', 'changeScene'].includes(command) && record(args.ruleImage)) return binding(args.ruleImage, ['ruleImage', 'assetId']);
  if (command !== 'say' || !Array.isArray(args.events)) return [];
  return args.events.flatMap((event, index) =>
    record(event) && ['sound', 'expression', 'live2dExpression'].includes(String(event.kind))
      ? binding(event, ['events', String(index), 'assetId'], IdSchema.safeParse(event.id).data) : []);
}

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
  if(input.scene) {
    boundary(input.scene.presentation,'/data/presentation');
    result.push(...sceneDecorAssetBindings(input.scene));
  }
  if(input.character){for(const[index,difference]of(input.character.differences??[]).entries()){
    result.push({...difference.figure,field:`/data/differences/${index}/figure/assetId`,kind:'image'});
    if(difference.avatar?.kind==='image')result.push({assetId:difference.avatar.assetId,variantId:difference.avatar.variantId,field:`/data/differences/${index}/avatar/assetId`,kind:'image'});
  }
  if(input.character.afterstory?.presentation)result.push({...input.character.afterstory.presentation.figure,field:'/data/afterstory/presentation/figure/assetId',kind:'image'});}
  return result;
}
