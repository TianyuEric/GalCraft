import type { TaskItem } from './types.js';
import { comfyServiceUrl } from '@galcraft/generation-services';
export function resourceEndpoint(item: TaskItem): string | null {
  if (item.configSnapshot?.protocol !== 'comfyUI') return null;
  return comfyServiceUrl(item.configSnapshot.baseUrl);
}
export function resourceFamily(item: TaskItem): string {
  return item.workflowSnapshot?.modelFamily?.trim() || JSON.stringify([item.purpose, item.configSnapshot?.model, item.workflowSnapshot?.id, item.workflowSnapshot?.revision]);
}
export function resourcePolicy(item: TaskItem) { return item.configSnapshot?.comfyResources ?? { ownership: 'shared' as const, release: 'manual' as const }; }
