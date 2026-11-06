import { ArrowLeft, Link2 } from 'lucide-react';
import { parse } from '@galcraft/dsl';
import { components, readTemplateDocuments } from '@galcraft/templates';
import { designerComponentName, designerPageName } from '../../../authoring/designer-labels.js';
import { CandidateButton, CandidateToolbar } from '../components/controls/index.js';
import type { CandidateSession } from '../application/session.js';
import type { CandidateProductionSession } from '../adapters/production-session.js';

export function CandidateProductionInspector({ session, production, onOpen, onNavigate }: {
  session: CandidateSession;
  production: CandidateProductionSession;
  onOpen?(id: string): void;
  onNavigate?(documentId: string, statementId?: string): void;
}) {
  const origin = production.originFor();
  if (!origin) return null;
  const asset = production.data.assets.find(value => value.id === origin.assetId);
  const character = production.data.characters.find(value => value.id === origin.characterId);
  const scene = origin.sceneId ? session.sceneSource(origin.sceneId) : undefined;
  const page = production.data.pages.find(value => origin.pageIds.includes(value.id) || origin.pageIds.includes(value.documentId ?? ''));
  const statementId = origin.statementId ?? undefined;
  const sceneAnchor = scene && (!statementId || parse(scene).cst.some(node => node.id === statementId));
  const documentId = page?.documentId ?? (sceneAnchor ? scene?.documentId : undefined);
  let pageLabel = page?.labels?.[production.displayLocale()] ?? page?.key;
  if (page) {
    const template = readTemplateDocuments(session.host.list());
    const source = template.pages.find(value => value.id === page.id || value.key === page.key);
    if (source) {
      const locale = production.displayLocale();
      pageLabel = template.locales[locale]?.[source.titleKey] ?? designerPageName(source.key, locale, template.locales);
      const targets = origin.componentIds.map(id => components(source.root).find(value => value.id === id));
      if (targets.length) pageLabel += ' / ' + targets.map(value => value ? value.name || designerComponentName(value, locale, template.locales) : '原组件已移除').join('、');
    }
  }
  const name = asset?.name ?? character?.name ?? scene?.name ?? pageLabel;
  const knownOrigin = Boolean(origin.assetId || origin.characterId || origin.documentId || origin.sceneId || origin.pageIds.length);
  const canReturn = origin.assetId ? Boolean(asset) : origin.characterId && !scene ? Boolean(character) : Boolean(documentId);
  const navigate = () => {
    if (origin.viewId) onOpen?.(origin.viewId);
    else if (asset) onOpen?.(`assets:${asset.id}`);
    else if (documentId) onNavigate?.(documentId, statementId);
    else if (character) {
      onOpen?.(`character:${character.id}`);
    }
  };
  return <section className="candidate-production-origin" aria-label="入口来源">
    <CandidateToolbar label="入口来源与定位">
      <span><Link2 size={14} aria-hidden="true"/>入口来源</span>
      <strong>{name ?? (knownOrigin ? '原对象已移除' : '独立制作')}</strong>
      {origin.version && <small>版本 {origin.version.revision}</small>}
      {canReturn && <CandidateButton variant="ghost" density="compact" onClick={navigate}><ArrowLeft size={14}/>返回入口</CandidateButton>}
    </CandidateToolbar>
    {knownOrigin && !canReturn && <p role="status">原位置已移除，制作记录和结果仍可查看。</p>}
  </section>;
}
