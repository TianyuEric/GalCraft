import type { GalCraftPlugin } from '@galcraft/plugins/contracts';
import { emptyContributions } from '@galcraft/plugins/contracts';
import { projectInfoTool } from './tools.js';
export function createPlugin(): GalCraftPlugin {return {async activate(context) {const contributions=emptyContributions();contributions.tools=[projectInfoTool(context)];return contributions;}, async deactivate() {}};}
