import type { PageEditOperation } from '@galcraft/contracts';
import { components, readTemplateDocuments } from '@galcraft/templates';
import { useCandidate } from '../application/context.js';
import { resultValue } from './workface-helpers.js';

export type PageStore = ReturnType<typeof useCandidate>;
export type PageTemplate = ReturnType<typeof readTemplateDocuments>;

export async function editPage(store: PageStore, label: string, operations: PageEditOperation[]) {
  const prepare = store.services.bridge.templates?.preparePageEdit;
  if (!prepare) throw new Error('页面编辑服务不可用。请重新打开作品。');
  const plan = resultValue(await prepare({ label, operations }));
  if (plan.edit.patches.length) {
    store.target(plan.edit.patches[0]!.documentId);
    resultValue(await store.applyEdit(plan.edit));
  }
  return plan;
}

export function currentPageComponent(store: PageStore, pageId: string, componentId: string) {
  const page = readTemplateDocuments(store.host.list()).pages.find(item => item.id === pageId);
  return page && components(page.root).find(item => item.id === componentId);
}
