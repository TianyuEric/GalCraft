import type * as PixiNamespace from 'pixi.js';

const shared = (globalThis as typeof globalThis & { __GalCraftPixi__?: typeof PixiNamespace }).__GalCraftPixi__;
if (!shared) throw new Error('GalCraft host must inject its shared Pixi namespace before loading @galcraft/plugins/pixi');
export const Pixi: typeof PixiNamespace = shared;
export { Pixi as PIXI };
