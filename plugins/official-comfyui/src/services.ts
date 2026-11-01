import { GenerationInputJsonSchema, GenerationOutputJsonSchema } from '@galcraft/contracts';
import { emptyContributions } from '@galcraft/plugins/contracts';
import type { GalCraftPlugin } from '@galcraft/plugins/contracts';
import { HttpGenerationAdapter } from '@galcraft/generation-services';
import { officialServices } from '@galcraft/generation-services/catalog';
export function createPlugin(): GalCraftPlugin { return {
  async activate(context) {
    const module = officialServices.find(value => value.id === 'org.galcraft.comfyui')!;
    return {...emptyContributions(), generationProviders: module.protocols.map(entry => ({
      key: `${module.id}/${entry.protocol}`, version:'0.1.0', purposes:entry.purposes,
      protocols:[entry.protocol], execution:'remote' as const, configFields:[],
      capabilities:{query:entry.protocol==='comfyUI',refetch:entry.protocol==='comfyUI',cancelPerTask:entry.protocol==='comfyUI',resume:entry.protocol==='comfyUI'},
      inputSchema:GenerationInputJsonSchema,
      outputSchema:GenerationOutputJsonSchema,
      create(config) {
        if(config.protocol!==entry.protocol) throw new Error('连接协议与服务能力不符');
        return new HttpGenerationAdapter({credential:id=>context.credentials?.read(id)??Promise.resolve(null),
          probe:async(path,mime)=>{if(!context.media)throw new Error('媒体探测提供方未连接');return context.media.probe(path,mime);}});
      }
    }))};
  }, async deactivate() {}
}; }
