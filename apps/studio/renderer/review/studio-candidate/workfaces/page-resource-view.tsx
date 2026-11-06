import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { components, readTemplateDocuments } from '@galcraft/templates';
import { useCandidate, useCandidateState } from '../application/context.js';
import { CandidateButton, CandidateState } from '../components/controls/index.js';
import type { PageStore } from './page-edit.js';
import { CandidateGalleryContent, galleryDraftKey } from './page-gallery-content.js';
import { CandidatePageStyle, styleDraftKey } from './page-style-editor.js';
import { CandidatePageTemplates } from './page-template-library.js';
import { CandidatePageUIAnimations, uiAnimationDraftKey, uiAnimationNumberKey, type UIAnimationTarget } from './page-ui-animation-editor.js';
import { workfaceError } from './workface-helpers.js';
import '../styles/page-resources.css';

const keys = [styleDraftKey, uiAnimationDraftKey, uiAnimationNumberKey, galleryDraftKey];
export const pageResourcePending = (store: PageStore, viewId: string) => keys.some(key => !!store.viewState(key(viewId)));
export const discardPageResourceDrafts = (store: PageStore, viewId: string) => {
  for (const key of keys) store.rememberViewState(key(viewId), undefined);
  store.setViewPending(viewId, false);
};
const events = new Set(['enter', 'exit', 'show', 'hide', 'hover', 'focus', 'pressed']);

export function CandidatePageResourceView({ pageKey, viewId, onNavigate, active: visible }: {
  pageKey: string; viewId: string; onNavigate?: (id: string) => void; active?: boolean;
}) {
  const store = useCandidate();
  const { activeView, ui } = useCandidateState();
  const active = visible ?? activeView === viewId;
  const locale = store.controller.preferences.locale;
  const { documents: graphDocuments } = useSyncExternalStore(store.host.subscribe, store.host.getSnapshot, store.host.getSnapshot);
  const documents = useMemo(() => store.host.list(), [store, graphDocuments]);
  const data = useMemo(() => {
    try { return { template: readTemplateDocuments(documents) }; } catch (reason) { return { error: workfaceError(reason) }; }
  }, [documents]);
  const { template } = data;
  const styleKey = pageKey.startsWith('@style:') ? pageKey.slice(7) : undefined;
  const newStyle = styleKey?.startsWith('new:') ? styleKey.split(':') : undefined;
  const style = template?.styles.find(item => item.id === styleKey);
  const page = template?.pages.find(item => item.id === (style?.scope.pageId ?? newStyle?.[1]));
  const componentId = style?.scope.componentId ?? newStyle?.[2] ?? null;
  const validScope = !!page && (!componentId || components(page.root).some(item => item.id === componentId));
  const isAnimation = pageKey === '@animations' || pageKey.startsWith('@animations:');
  const [, targetId, event] = pageKey.split(':');
  const target: UIAnimationTarget | undefined = isAnimation && targetId && event && events.has(event) ? { componentId: targetId, event: event as UIAnimationTarget['event'] } : undefined;
  const heading = isAnimation ? '界面动画' : pageKey === '@templates' ? '作品模板' : pageKey === 'gallery-content' ? '鉴赏内容' : style?.name ?? (newStyle ? '新建命名样式' : '命名样式');
  const onPending = () => store.setViewPending(viewId, pageResourcePending(store, viewId));
  useEffect(() => store.registerViewGuard(viewId, () => !pageResourcePending(store, viewId)), [store, viewId]);
  useEffect(() => {
    if (!active || pageKey === 'gallery-content') return;
    const owner = style && documents.find(item => style.sourcePath in item.files);
    const root = documents.find(item => 'ui/template.json' in item.files);
    if (owner ?? root) store.target((owner ?? root)!.documentId);
  }, [active, pageKey, documents, style, store]);
  return <section className="candidate-workface candidate-resource-workface" aria-label={heading}>
    <header className="candidate-page-bar"><h2 title={heading}>{heading}</h2>{page && <CandidateButton onClick={() => onNavigate?.('page:' + page.key)}>返回页面</CandidateButton>}</header>
    <div className="candidate-resource-scroll">
      {!template ? <CandidateState kind="error" title="页面资源读取失败" description={data.error}/>
        : styleKey ? page && validScope && (style || newStyle) ? <CandidatePageStyle key={pageKey} store={store} viewId={viewId} template={template} documents={documents}
          target={{ style, page, componentId }} theme={ui.theme} locale={locale} active={active} onNavigate={onNavigate} onPending={onPending}/>
          : <CandidateState kind="empty" title="命名样式或作用域已移除" description="可从作品历史恢复已删除的资源。"/>
        : pageKey === '@templates' ? <CandidatePageTemplates key={pageKey} store={store} template={template} documents={documents} viewId={viewId} locale={locale} active={active}/>
        : isAnimation ? <CandidatePageUIAnimations key={pageKey} store={store} template={template} viewId={viewId} locale={locale} active={active} target={target} onPending={onPending}/>
        : pageKey === 'gallery-content' ? <CandidateGalleryContent key={pageKey} store={store} template={template} documents={documents} viewId={viewId} locale={locale} active={active} onNavigate={onNavigate} onPending={onPending}/>
        : <CandidateState kind="empty" title="页面资源已移除"/>}
    </div>
  </section>;
}
