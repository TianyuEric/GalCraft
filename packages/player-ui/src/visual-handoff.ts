const visualImageLeases = new WeakMap<HTMLElement, Set<() => () => void>>();

/** Keep image URLs available while the browser presents or prepares a transition copy. */
export function registerVisualImageLease(element: HTMLElement, release: () => void): () => void {
  let users = 0;
  const retain = () => {
    users++;
    let active = true;
    return () => { if (!active) return; active = false; if (--users === 0) release(); };
  };
  const releaseOwner = retain();
  const leases = visualImageLeases.get(element) ?? new Set<() => () => void>();
  leases.add(retain); visualImageLeases.set(element, leases);
  return () => {
    leases.delete(retain);
    if (!leases.size && visualImageLeases.get(element) === leases) visualImageLeases.delete(element);
    releaseOwner();
  };
}

/** Freeze the currently presented pixels while the real destination mounts underneath. */
export function holdPlayerVisual(canvasRoot: HTMLElement, stage: HTMLCanvasElement): { element: HTMLElement; content: HTMLElement | null; release(): void } {
  const layer = document.createElement('div');
  layer.className = 'gc-visual-hold'; layer.setAttribute('aria-hidden', 'true'); layer.inert = true;
  Object.assign(layer.style, { position: 'absolute', inset: '0', zIndex: '980', overflow: 'hidden', pointerEvents: 'none' });
  const stageCopy = document.createElement('canvas'); stageCopy.width = stage.width; stageCopy.height = stage.height;
  stageCopy.getContext('2d')!.drawImage(stage, 0, 0);
  Object.assign(stageCopy.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  layer.append(stageCopy);
  const copy = canvasRoot.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.gc-visual-hold').forEach(element => element.remove());
  Object.assign(copy.style, { left: '0', top: '0', width: '100%', height: '100%', transform: 'none' });
  copy.removeAttribute('id'); copy.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  const sourceContent=[...canvasRoot.querySelectorAll<HTMLElement>('.gc-content')].filter(element=>!element.closest('.gc-visual-hold'));
  copy.querySelectorAll<HTMLElement>('.gc-content').forEach((element,index)=>{
    const source=sourceContent[index];if(!source)return;
    const style=getComputedStyle(source);
    element.style.setProperty('display',style.display,'important');
    element.style.setProperty('visibility',style.visibility,'important');
  });
  const originals = [...canvasRoot.querySelectorAll<HTMLImageElement | HTMLVideoElement | HTMLCanvasElement>('img,video,canvas')].filter(element => !element.closest('.gc-visual-hold'));
  const copies = [...copy.querySelectorAll<HTMLElement>('img,video,canvas')];
  const geometry = ['position','left','top','right','bottom','width','height','max-width','max-height','min-width','min-height','object-fit','object-position','border-radius','opacity','transform','translate','display','z-index','aspect-ratio','margin','box-sizing'];
  originals.forEach((element, index) => {
    const duplicate = copies[index]; if (!duplicate) return;
    const width = element instanceof HTMLImageElement ? element.naturalWidth : element instanceof HTMLVideoElement ? element.videoWidth : element.width;
    const height = element instanceof HTMLImageElement ? element.naturalHeight : element instanceof HTMLVideoElement ? element.videoHeight : element.height;
    if (!width || !height) { duplicate.remove(); return; }
    const style = getComputedStyle(element);
    if(element.hidden||style.display==='none'||style.visibility==='hidden'){duplicate.remove();return;}
    const scale=Math.min(1,Math.max((parseFloat(style.width)||width)/width,(parseFloat(style.height)||height)/height));
    const frozen = document.createElement('canvas'); frozen.width = Math.max(1,Math.ceil(width*scale)); frozen.height = Math.max(1,Math.ceil(height*scale));
    for (const attribute of duplicate.attributes) if (attribute.name !== 'src' && attribute.name !== 'id') frozen.setAttribute(attribute.name, attribute.value);
    for (const property of geometry) frozen.style.setProperty(property, style.getPropertyValue(property));
    frozen.getContext('2d')!.drawImage(element, 0, 0, frozen.width, frozen.height);
    duplicate.replaceWith(frozen);
  });
  const releases = [...canvasRoot.querySelectorAll<HTMLElement>('[data-gc-part],[data-gc-media-status]')]
    .filter(element => !element.closest('.gc-visual-hold'))
    .flatMap(element => [...visualImageLeases.get(element) ?? []].map(retain => retain()));
  layer.append(copy); canvasRoot.append(layer);
  return { element: layer, content: copy.querySelector<HTMLElement>('.gc-content'), release: () => { layer.remove(); releases.forEach(release => release()); } };
}

/** Observe actual destination elements; detached preload elements are deliberately absent. */
export function waitForPresentedMedia(roots: HTMLElement[], signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame = 0;
    const cleanup = () => { observer.disconnect(); cancelAnimationFrame(frame); signal.removeEventListener('abort', aborted); };
    const aborted = () => { cleanup(); reject(new DOMException('画面交接已取消', 'AbortError')); };
    const required = (element: HTMLElement) => !element.closest('.gc-visual-hold,.gc-gallery-cards,.gc-gallery-entry-strip,.gc-gallery-differences,.gc-settings-preview') && !element.closest('[hidden]');
    const inspect = () => roots.flatMap(root => [...(root.matches('[data-gc-media-status]') ? [root] : []), ...root.querySelectorAll<HTMLElement>('[data-gc-media-status]')]).filter(required);
    const check = () => {
      const elements = inspect();
      if (elements.some(element => element.dataset.gcMediaStatus === 'failed')) { cleanup(); reject(new Error('目标画面资源读取失败')); return; }
      if (elements.some(element => element.dataset.gcMediaStatus === 'pending')) return;
      if(frame)return;
      frame = requestAnimationFrame(() => {
        frame=0;
        const current=inspect();
        if(current.some(element=>element.dataset.gcMediaStatus==='failed')){cleanup();reject(new Error('目标画面资源读取失败'));return;}
        if (current.some(element => element.dataset.gcMediaStatus === 'pending')) return;
        cleanup(); resolve();
      });
    };
    const observer = new MutationObserver(check);
    for (const root of roots) observer.observe(root, { attributes: true, childList: true, subtree: true, attributeFilter: ['data-gc-media-status','hidden'] });
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted(); else check();
  });
}
