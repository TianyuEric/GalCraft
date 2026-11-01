import type { ExecutionToken, Id, Snapshot } from '@galcraft/contracts';

/** Only read the authored straight-line prefix; no condition, branch or side effect executes. */
export function choiceFirstAssets(snapshot: Snapshot, token: ExecutionToken, available: Id[]): Id[] {
  const instruction=snapshot.scenes.flatMap(scene=>scene.instructions).find(item=>item.statementId===token.statementId);
  const options=(instruction?.args as {options?:{id:Id;target:{sceneId:Id;labelId?:Id|null}}[]}|undefined)?.options??[];
  const assets=new Set<Id>();
  const add=(id:unknown)=>{if(typeof id==='string'&&snapshot.assets.some(asset=>asset.assetId===id))assets.add(id);};
  for(const option of options.filter(item=>available.includes(item.id))){
    const scene=snapshot.scenes.find(item=>item.scene.id===option.target.sceneId);if(!scene)continue;
    const start=option.target.labelId?scene.instructions.findIndex(item=>item.statementId===scene.labels[option.target.labelId!]):0;
    for(const item of scene.instructions.slice(Math.max(0,start))){
      const args=item.args as Record<string,unknown>;add(args.assetId);
      if(item.opcode==='characterDifference'){
        const character=snapshot.characters.find(character=>character.id===args.characterId),difference=character?.differences?.find(difference=>difference.id===args.differenceId);
        add(difference?.figure.assetId);if(difference?.avatar?.kind==='image')add(difference.avatar.assetId);
      }
      if(['say','choose','getUserInput','wait','video','call','jump','if','end'].includes(item.opcode)||assets.size>=12)break;
    }
    if(assets.size>=12)break;
  }
  return [...assets].slice(0,12);
}
