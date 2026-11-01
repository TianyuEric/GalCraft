import { createId, type Snapshot, type Position, type DebugScenario, type PageKey } from '@galcraft/contracts';
import { resolvePreviewEntry } from '@galcraft/runtime';
import type { AuthoringServices } from './controller.js';
import { openPlayerPreview } from './player-preview.js';
import { pagePreviewSample } from './page-preview-sample.js';
import { resolvePreviewStyleMatches, type StyleMatchRequest } from '@galcraft/templates';
import type { DesktopBridge } from '../../desktop-bridge.js';

type CompositionPreview = Extract<Awaited<ReturnType<DesktopBridge['production']['previewComposition']>>, {ok:true}>['value'];
type CaptureInput = { entryId?: string; target?: Position; route?: DebugScenario['route']; playerInputs?: DebugScenario['playerInputs']; page?: PageKey; compositionPreview?:CompositionPreview; freezeLayout?:string[];observation?:import('@galcraft/player-ui').PlayerObservationRequest };
declare global {
  interface Window { __galcraftCollaborationCapture: { capture(payload: { snapshot: Snapshot; input: CaptureInput }): Promise<unknown>; dispose(): void } }
}

export function mountCollaborationCapture(root: HTMLElement, services: AuthoringServices) {
  let player: Awaited<ReturnType<typeof openPlayerPreview>> | undefined;
  root.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;overflow:hidden;background:#000';
  const dispose = () => { player?.dispose(); player = undefined; root.replaceChildren(); };
  window.__galcraftCollaborationCapture = {
    dispose,
    async capture({ snapshot, input }) {
      dispose();
      const composition=input.compositionPreview;
      if(composition){snapshot=pagePreviewSample(snapshot,composition.template,input.page??'title','normal');snapshot.assets.push(...composition.previewAssets);}
      root.dataset.capturePhase = 'mountPlayer';
      player = await openPlayerPreview(root, services, snapshot, composition?'candidate':'sample',composition?.styles,composition?.template.styles.map(style=>style.id),composition?.locations);
      root.dataset.capturePhase = 'mounted';
      player.setPreviewMuted(true);
      let observation: Record<string, unknown> = { reached: true, snapshotId: snapshot.snapshotId, page: input.page ?? 'title', issues: [] };
      if (input.target || input.entryId) {
        const entry = resolvePreviewEntry(snapshot, input.target ?? null, input.entryId, !!input.entryId);
        const target = input.target ?? entry.entry;
        const scenario: DebugScenario = { schemaVersion: 1, id: createId(), name: '外部协作画面读取', projectId: snapshot.projectId, engineVersion: snapshot.engineVersion,
          pluginVersions: [snapshot.lock.engine, ...snapshot.lock.plugins, snapshot.lock.template], entry: entry.entry, target,
          route: input.route ?? [], playerInputs: input.playerInputs ?? [], initialProgress: entry.initialProgress, pluginInitial: {}, externalPolicy: 'simulate' };
        const prepared = await player.session.prepareSession({ snapshot, domain: player.data.domain, source: { kind: 'entry', scenario }, target,
          evaluateTarget: true, routePolicy: 'unique', story: entry.story });
        if (!prepared.ok) return { snapshotId: snapshot.snapshotId, reached: false, issues: prepared.issues };
        observation = { snapshotId: snapshot.snapshotId, entry, target, reached: prepared.value.reached, blockedAt: prepared.value.blockedAt,
          routePreparation: prepared.value.routePreparation, state: prepared.value.state, issues: prepared.value.issues };
        if (!prepared.value.reached) { player.session.disposePrepared(prepared.value.id); return observation; }
        const activated = await player.activatePreview(prepared.value, 'inspection');
        if (!activated.ok) throw new Error(activated.error.message);
        if(input.page)player.view.navigation.replace(input.page);
        observation.state = player.session.inspect()?.state;
      } else if (input.page) player.view.navigation.replace(input.page);
      if(composition&&['story','choice','input','history','save','load'].includes(input.page??'')){await player.view.newGame();if(input.page)player.view.navigation.replace(input.page);}
      root.dataset.capturePhase = 'fonts';
      await document.fonts.ready;
      root.dataset.capturePhase = 'images';
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      await new Promise<void>(resolve=>{
        const settled=()=>!root.querySelector('[data-gc-media-status="pending"]');
        if(settled()){resolve();return;}
        const observer=new MutationObserver(()=>{if(settled()){observer.disconnect();resolve();}});observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-gc-media-status']});
      });
      await Promise.all([...root.querySelectorAll('img')].map(image => image.decode().catch(() => {})));
      const cssImages=new Set<string>();
      for(const element of root.querySelectorAll<HTMLElement>('[data-gc-part]')){const style=getComputedStyle(element);for(const value of [style.backgroundImage,style.maskImage,style.borderImageSource])for(const match of value.matchAll(/url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/g))cssImages.add(match[1]??match[2]??match[3]!);}
      await Promise.all([...cssImages].map(async uri=>{const image=new Image();image.src=uri;try{await image.decode();}catch{}}));
      root.dataset.capturePhase = 'paint';
      player.stage.captureFrame();
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      root.dataset.capturePhase = 'ready';
      const layoutFrames:Record<string,Record<string,{x:number;y:number;width:number;height:number}>>={};
      for(const id of input.freezeLayout??[]){
        const parent=root.querySelector<HTMLElement>(`[data-gc-component="${CSS.escape(id)}"]`);if(!parent)continue;
        const page=snapshot.template.pages.find(page=>page.key===input.page);
        const find=(value:typeof snapshot.template.pages[number]['root']):typeof value|undefined=>value.id===id?value:value.children.map(find).find(Boolean);
        const component=page&&find(page.root);if(!component)continue;
        const children=component.children.filter(child=>child.layout.position?child.layout.position==='flow':child.layout.mode!=='absolute').flatMap(child=>{
          const element=parent.querySelector<HTMLElement>(`[data-gc-component="${CSS.escape(child.id)}"]`);if(!element)return[];
          const style=getComputedStyle(element),rect=element.getBoundingClientRect();return[{id:child.id,element,rect,width:parseFloat(style.width),height:parseFloat(style.height)}];
        });
        const originalStyles=new Map([parent,...children.map(child=>child.element)].map(element=>[element,element.style.cssText]));
        const parentStyle=getComputedStyle(parent);
        layoutFrames[id]={[id]:{x:0,y:0,width:parseFloat(parentStyle.width),height:parseFloat(parentStyle.height)}};parent.style.display='block';
        for(const child of children)Object.assign(child.element.style,{position:'absolute',left:'0px',top:'0px',translate:'0px 0px',width:`${child.width}px`,height:`${child.height}px`});
        for(const child of children){
          const element=child.element,origin=element.getBoundingClientRect();element.style.left='1px';const horizontal=element.getBoundingClientRect();element.style.left='0px';element.style.top='1px';const vertical=element.getBoundingClientRect();element.style.top='0px';
          const a=horizontal.x-origin.x,b=horizontal.y-origin.y,c=vertical.x-origin.x,d=vertical.y-origin.y,det=a*d-b*c;
          if(!Number.isFinite(det)||Math.abs(det)<1e-8)continue;
          const dx=child.rect.x-origin.x,dy=child.rect.y-origin.y;
          layoutFrames[id]![child.id]={x:(dx*d-dy*c)/det,y:(dy*a-dx*b)/det,width:child.width,height:child.height};
        }
        for(const [element,style] of originalStyles)element.style.cssText=style;
      }
      return { ...observation,...(input.observation?{observed:player.view.observe(input.observation)}:{}),issues:[...(observation.issues as unknown[]??[]),...player.view.inspectDiagnostics()], mediaPlayback: 'mutedInspection', engineVersion: snapshot.engineVersion, pluginVersions: snapshot.lock.plugins,
        ...(input.freezeLayout?{layoutFrames}:{}),
        renderedText:root.innerText,...(composition?{styleMatches:composition.unresolvedStyleMatches.filter((request:StyleMatchRequest)=>request.pageId===composition.template.pages.find(page=>page.key===input.page)?.id).map((request:StyleMatchRequest)=>({...request,targets:resolvePreviewStyleMatches(root,request)}))}:{}) };
    },
  };
}
