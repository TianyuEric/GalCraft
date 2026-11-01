import type { StudioBridge } from '@galcraft/contracts';
import type { StudioDesktopBridge } from '../desktop-shell.js';
import './styles/ui.css';
import { createAuthoringServices } from './authoring/bridge.js';
import { mountAuthoring } from './authoring/view.js';
import { mountCollaborationCapture } from './authoring/collaboration-capture.js';
import { createBrowserBridge } from './browser-bridge.js';
import { LocalServicePanel } from './components/LocalServicePanel.js';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
  interface Window { studioBridge: StudioBridge; studioDesktop?: StudioDesktopBridge }
}

const root = document.getElementById('app');
if (!root) throw new Error('Studio root element is missing');
if (new URLSearchParams(location.search).has('collaborationCapture')) {
  void (async()=>{window.studioBridge ??= await createBrowserBridge();mountCollaborationCapture(root, createAuthoringServices(window.studioBridge));})();
} else {
  void (async () => {
    const bridge = await createBrowserBridge(); window.studioBridge = bridge;
    // Keep a dialog listener connected before any provider can request a file.
    const desktopDialog = window.studioDesktop ? bridge.service.onDialog(dialog => { void window.studioDesktop!.chooseFiles(dialog).then(value => bridge.service.answerDialog(dialog.id,value)); }) : null;
    const workspace = await mountAuthoring(root, createAuthoringServices(bridge));
    window.studioDesktop?.onDetach(() => workspace.flushInputDrafts());
    const serviceNode = document.createElement('div'); serviceNode.className = 'studio-local-service-mount';
    const serviceRoot = createRoot(serviceNode);
    let appliedTheme = '';
    const renderService = () => { const theme = root.dataset.theme === 'dark' ? 'dark' : 'light'; if (appliedTheme !== theme) { appliedTheme = theme; void window.studioDesktop?.setAppearance(theme).catch(console.error); } serviceNode.dataset.theme = root.dataset.theme; serviceRoot.render(createElement(LocalServicePanel,{service:bridge.service,flush:()=>workspace.flushInputDrafts(),locale:root.lang,dialogs:!window.studioDesktop})); };
    const attachService = () => { const slot=root.querySelector('#studio-local-service-slot'); if(slot&&serviceNode.parentElement!==slot){slot.append(serviceNode);renderService();} };
    attachService(); new MutationObserver(records=>{attachService();if(records.some(record=>record.type==='attributes'&&record.target===root))renderService();}).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-theme','lang']});
    window.addEventListener('unload', () => { desktopDialog?.(); bridge.service.dispose(); }, {once:true});
  })().catch(reason => { root.textContent = `Studio: ${String(reason instanceof Error ? reason.message : reason)}`; root.setAttribute('role','alert'); });
}
