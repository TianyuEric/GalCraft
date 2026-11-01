import * as reactDomClient from 'react-dom/client';
import * as reactDom from 'react-dom';
import { installPluginRuntimes } from '@galcraft/player-ui';
import type { PluginDefinition } from '@galcraft/plugins/contracts';

/** External editor entries use the same React, ReactDOM and Pixi instances as Studio. */
export function installStudioPluginRuntimes() {
  installPluginRuntimes();
  Object.assign(globalThis, { __GalCraftReactDomClient__: reactDomClient, __GalCraftReactDom__: reactDom });
}
export async function readPluginDefinition(url: string): Promise<PluginDefinition> {
  const module = await import(/* @vite-ignore */ url) as { createDefinition?(): PluginDefinition | Promise<PluginDefinition>; definition?: PluginDefinition; default?: PluginDefinition };
  const definition = module.createDefinition ? await module.createDefinition() : module.definition ?? module.default;
  if (!definition || typeof definition !== 'object') throw new Error('插件定义入口须导出 createDefinition 或 definition');
  return definition;
}
