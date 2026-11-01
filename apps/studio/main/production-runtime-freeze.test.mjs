import { expect, it } from 'vitest';
import { StudioProduction } from './production-providers.mjs';

it('freezes a local provider environment at review and supplies the same identity at execution', async () => {
  const production=Object.create(StudioProduction.prototype), config={providerKey:'test.motion/render'}, runtime={id:'toolchain',browser:'155',encoder:'9.0.2'}, seen=[];
  const capability={status:'verified',issues:[]}; let releases=0;
  const provider={key:config.providerKey,purposes:['test.motion/render'],inputSchema:true,outputSchema:true,
    create:(_config,frozen)=>{seen.push(frozen);return {inspect:async()=>capability,freeze:async()=>structuredClone(runtime),async *submit(){yield {kind:'output',artifacts:[],usage:null};}};}};
  production.generationProviders={describe:async()=>({providerKey:config.providerKey,packageVersion:'0.1.0'}),acquire:async()=>({provider,packageVersion:'0.1.0',release(){releases++;}})};
  const snapshot=await production.freezeProvider(config,{purpose:'test.motion/render'},null);
  expect(snapshot.runtime).toEqual(runtime); runtime.browser='156';
  const lease=await production.acquireAdapter(config,JSON.parse(JSON.stringify(snapshot)),null);
  expect(seen[1]).toEqual({id:'toolchain',browser:'155',encoder:'9.0.2'});
  await lease.release(); expect(releases).toBe(2);
});

it('releases the provider when the reviewed environment cannot be frozen', async () => {
  const production=Object.create(StudioProduction.prototype); let released=0;
  production.generationProviders={describe:async()=>({providerKey:'test.motion/render',packageVersion:'0.1.0'})};
  production.acquireAdapter=async()=>({adapter:{inspect:async()=>({status:'verified'}),freeze:async()=>{throw Error('toolchain removed');}},release(){released++;}});
  await expect(production.freezeProvider({}, {purpose:'test.motion/render'},null)).rejects.toThrow('toolchain removed');
  expect(released).toBe(1);
});
