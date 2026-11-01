import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Modal } from '../../components/controls.js';
import { exitDialog } from '../../components/motion.js';

type MountedView = { root: HTMLElement; dispose(): void };
export function mountStudioDialog(options: {
  title: string; locale: string; mount(close: () => void): MountedView; disposed(): void;
}) {
  const origin = document.activeElement as HTMLElement | null;
  const node = document.createElement('div');
  (document.getElementById('studio-portals') ?? document.body).append(node);
  const root = createRoot(node);
  let view: MountedView | undefined, disposed = false, closing = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true; root.unmount(); node.remove(); options.disposed();
    if (origin?.isConnected) origin.focus({ preventScroll: true });
  };
  const close = async () => {
    if (closing || disposed) return;
    closing = true;
    await exitDialog(view?.root.closest<HTMLElement>('[data-slot="dialog-content"]') ?? null);
    dispose();
  };
  function Contents() {
    const content = useRef<HTMLDivElement>(null);
    useEffect(() => {
      view = options.mount(() => { void close(); });
      content.current?.append(view.root);
      return () => { view?.dispose(); view = undefined; };
    }, []);
    return <div className="studio-plugin-dialog" ref={content} />;
  }
  function ContributionDialog() {
    return <Modal title={options.title} close={() => { void close(); }} wide>
      <Contents />
      <footer><Button onClick={() => { void close(); }}>{options.locale === 'en' ? 'Close' : options.locale === 'ja' ? '閉じる' : '关闭'}</Button></footer>
    </Modal>;
  }
  root.render(<ContributionDialog />);
  return { dispose };
}
