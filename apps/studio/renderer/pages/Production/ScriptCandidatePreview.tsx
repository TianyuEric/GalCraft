import { useEffect, useState } from 'react';
import { Modal } from '../../components/controls.js';
import { openPlayerPreview } from '../../authoring/player-preview.js';
import type { AuthoringServices } from '../../authoring/controller.js';
import type { ProductionSession } from './session.js';
import { unwrap } from './bridge.js';

export function ScriptCandidatePreview({ session: s, candidateId, services, locale, close }: { session: ProductionSession; candidateId: string; services: AuthoringServices; locale: string; close(): void }) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null), [error, setError] = useState('');
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  useEffect(() => {
    if (!root) return;
    let active = true, player: Awaited<ReturnType<typeof openPlayerPreview>> | null = null;
    const surface = document.createElement('div');
    Object.assign(surface.style, { position: 'absolute', inset: '0' });
    root.replaceChildren(surface);
    void (async () => {
      const snapshot = unwrap(await s.bridge.production.previewScript(candidateId));
      const documents = unwrap(await s.bridge.documents.list());
      if (!active) return;
      const styles = Object.assign({}, ...documents.map(document => document.files));
      root.style.aspectRatio = `${snapshot.project.canvas.width}/${snapshot.project.canvas.height}`;
      const mounted = await openPlayerPreview(surface, services, snapshot, 'candidate', styles);
      if (!active) { mounted.dispose(); return; }
      player = mounted; await player.view.newGame();
    })().catch(error => { if (active) setError(String(error)); });
    return () => { active = false; player?.dispose(); surface.remove(); };
  }, [s, candidateId, services, root]);
  return <Modal wide title={t('候选试玩', 'Play candidate', '候補を試す')} close={close}>
    <p>{t('试玩运行在独立候选会话中，采用后才写入作品。', 'Play this draft in its own candidate session. Adoption writes it to the project.', '独立した候補セッションで試します。採用すると作品に反映します。')}</p>
    {error && <p role="alert">{error.replace(/^Error: /, '')}</p>}
    <div className="script-candidate-preview" ref={setRoot}/>
  </Modal>;
}
