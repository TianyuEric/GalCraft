import type { ConnectionConfig } from '@galcraft/contracts';
import type { CreationRecipe, RecipeUsage } from '../recipes/schema.js';
import { resolveProductionFields, variantOperation } from './draft.js';
import { compactContextParts } from './context-identities.js';
import { confirmInput, inputCapability } from './capabilities.js';
import { baseTextInput, discussionSystem, prepareRecipe } from './recipe-preparer.js';
import type { FormVariant, GenerationInput, WorkflowBinding } from './types.js';
export { inputTextSummary, textCharacters, type InputTextSummary } from './input-summary.js';
export { compactContextParts } from './context-identities.js';
export { speechPreparationInstruction } from './recipe-preparer.js';

/** Uses the same recipe assembler as execution. It never saves a plan or contacts a provider. */
export function previewTextInput(variant: FormVariant, usage: RecipeUsage, recipes: CreationRecipe[], connections: ConnectionConfig[], workflows: WorkflowBinding[]): { input: Extract<GenerationInput,{purpose:'text'}>; estimated: boolean } | null {
  const config=connections.find(item=>item.id===variant.connectionId);
  if(!config) return null;
  const scheme=recipes.find(item=>item.id===variant.productionRecipeId)??null, preset=recipes.find(item=>item.id===variant.parameterPresetId)??null;
  const fields=resolveProductionFields(variant,scheme,preset), operation=variantOperation(variant,usage);
  const context=compactContextParts(variant.context).context.filter(part=>part.included);
  let input=baseTextInput(operation,usage,context,String(fields.instruction??''),Number(fields.maxOutputTokens??4096));
  if(variant.recipe){const recipe=recipes.find(item=>item.id===variant.recipe!.recipeId);if(!recipe)return null;
    const prepared=prepareRecipe({recipe,selection:variant.recipe,context:variant.context,instruction:String(fields.instruction??''),settings:{maxOutputTokens:input.maxOutputTokens,temperature:null,seed:null},capability:inputCapability(config,input,workflows.find(item=>item.id===variant.workflowBindingId)??null),sourceVersions:[]});
    if(!prepared.ok)return null;input=prepared.value.assembledInput;
  } else if(Array.isArray(fields.omittedPorts)&&fields.omittedPorts.length){
    try{input=confirmInput(config,input,workflows.find(item=>item.id===variant.workflowBindingId)??null,fields.omittedPorts as string[]) as typeof input;}catch{return null;}
  }
  const rule=recipes.find(item=>item.id===variant.recipe?.recipeId);
  if(usage==='script'&&(fields.creationMode??rule?.scriptMode)==='discuss')input={...input,system:discussionSystem};
  return {input,estimated:Boolean(config.providerKey)};
}
