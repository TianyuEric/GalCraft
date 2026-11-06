import { createElement, useEffect, useMemo, useReducer, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { Json } from '@galcraft/contracts';
import type { StudioScope } from '@galcraft/plugins/contracts';
import type { AuthorContributionServices, AuthorDocument, AuthorDocumentEntry, AuthorToolEntry } from '../../../pages/Plugins/author-contributions.js';
import type { DocumentWorkspace } from '../../../components/workbench/document-workspace.js';
import type { CandidateSession } from '../application/session.js';
import { CandidatePluginDocumentEditor } from '../components/plugins/CandidatePluginDocumentEditor.js';
import { CandidatePluginTool } from '../components/plugins/CandidatePluginTool.js';

export const pluginDocumentTab = (documentId: string) => `plugin-document:${documentId}`;
export const pluginDocumentId = (viewId: string) => viewId.startsWith('plugin-document:') ? viewId.slice('plugin-document:'.length) : undefined;
export const pluginToolView = (viewId: string) => viewId.startsWith('plugin-tool-workspace:');
type Editor = ReturnType<Parameters<DocumentWorkspace['open']>[2]>;
type Entry = Editor & { id: string; title: string; release(): void };

export function usePluginDocumentWorkspace(store: CandidateSession, openView: (id: string) => void, closeView?: (id: string) => void) {
  const [revision, render] = useReducer(value => value + 1, 0);
  const navigate = useRef(openView);
  navigate.current = openView;
  const closeNavigation = useRef(closeView);
  closeNavigation.current = closeView;
  const workspace = useMemo(() => {
    const entries = new Map<string, Entry>();
    let pendingOpen: string | undefined;
    let confirmation: { id: string; promise: Promise<boolean>; resolve(accepted: boolean): void } | undefined;
    const synchronize = () => {
      const { projectActive, activeView } = store.getSnapshot();
      for (const entry of entries.values()) entry.activate?.(projectActive && entry.id === activeView);
    };
    const select = (id: string) => { pendingOpen = id; render(); };
    const flushNavigation = () => {
      const id = pendingOpen;
      pendingOpen = undefined;
      if (id && entries.has(id)) navigate.current(id);
    };
    const confirmClose = (accepted: boolean) => {
      const request = confirmation;
      confirmation = undefined;
      if (accepted && request) entries.get(request.id)?.release();
      request?.resolve(accepted);
      render();
    };
    const port: DocumentWorkspace = {
      open(id, title, mount) {
        const previous = entries.get(id);
        if (previous) { select(id); return previous.release; }
        const release = () => {
          const entry = entries.get(id);
          if (!entry) return;
          entries.delete(id);
          entry.activate?.(false);
          entry.node.remove();
          queueMicrotask(() => entry.dispose());
          store.setViewPending(id, false);
          if (confirmation?.id === id) confirmClose(true);
          render();
        };
        const editor = mount(() => {
          if (!entries.has(id)) return;
          release();
          closeNavigation.current?.(id);
        }, () => {
          const entry = entries.get(id);
          if (!entry) return;
          store.setViewPending(id, entry.dirty());
          render();
        });
        entries.set(id, { ...editor, id, title, release });
        synchronize();
        select(id);
        return release;
      },
    };
    const close = async (id: string) => {
      const entry = entries.get(id);
      if (!entry?.dirty()) { entry?.release(); return true; }
      if (confirmation) return confirmation.id === id ? confirmation.promise : false;
      let resolve!: (accepted: boolean) => void;
      const promise = new Promise<boolean>(done => { resolve = done; });
      confirmation = { id, promise, resolve };
      render();
      return promise;
    };
    const openDocument = (document: AuthorDocument, type: AuthorDocumentEntry, services: AuthorContributionServices, locale: string) => {
      services.workspace?.open(pluginDocumentTab(document.documentId), document.name, (release, changed) => {
        const node = window.document.createElement('section'), react = createRoot(node);
        const snapshot = structuredClone(document);
        let dirty = false, active = true;
        const draw = () => react.render(createElement(CandidatePluginDocumentEditor, {
          document: snapshot, entry: type, services, locale, active, done: release,
          onDirty: value => { dirty = value; changed(); },
        }));
        draw();
        return { node, dirty: () => dirty, activate: value => {
          if (active === value) return;
          active = value;
          draw();
        }, dispose: () => react.unmount() };
      });
    };
    const openTool = (entry: AuthorToolEntry, scope: StudioScope, initialInput: Record<string, Json>, services: AuthorContributionServices, locale: string) => {
      services.workspace?.open(`plugin-tool-workspace:${crypto.randomUUID()}`, entry.title, (release, changed) => {
        const node = document.createElement('section'), react = createRoot(node);
        let dirty = false, active = true;
        const draw = () => react.render(createElement(CandidatePluginTool, {
          entry, scope, initialInput, services, locale, active, inline: true, onClose: release,
          onDirty: value => { dirty = value; changed(); },
        }));
        draw();
        return { node, dirty: () => dirty, activate: value => {
          if (active === value) return;
          active = value;
          draw();
        }, dispose: () => react.unmount() };
      });
    };
    return { entries, select, synchronize, flushNavigation, port, openDocument, openTool, close, confirmClose,
      get closing() { return confirmation && entries.get(confirmation.id); },
      cancelClose() { confirmation?.resolve(false); confirmation = undefined; },
    };
  }, [store]);

  useEffect(() => store.subscribe(workspace.synchronize), [store, workspace]);
  useEffect(() => { workspace.flushNavigation(); }, [workspace, revision]);
  useEffect(() => () => workspace.cancelClose(), [workspace]);
  return workspace;
}
