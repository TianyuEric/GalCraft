import { useEffect, useRef, useState } from 'react';
import type { PageKey, RuntimeTemplate, TemplateSwitchResult } from '@galcraft/contracts';
import { gallerySampleLongTerm, prepareGallerySample, prepareSaveSample } from '@galcraft/player-ui';
import { pagePreviewSample } from '../../../authoring/page-preview-sample.js';
import { openPlayerPreview, type StudioPlayer } from '../../../authoring/player-preview.js';
import { CandidateState } from '../components/controls/index.js';
import type { PageStore } from './page-edit.js';
import { resultValue, workfaceError } from './workface-helpers.js';

export type PageResourcePreviewInput = { template: RuntimeTemplate; files?: Record<string, string>; page: PageKey; sample?: string; plan?: TemplateSwitchResult; animation?: 'enter' | 'exit' | 'roundtrip' };

export function CandidateResourcePreview({ store, input, active = true }: { store: PageStore; input: PageResourcePreviewInput; active?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const element = host.current;
    if (!element || !active) return;
    let live = true;
    let player: StudioPlayer | undefined;
    let resize: ResizeObserver | undefined;
    let leases: string[] = [];
    const release = () => {
      resize?.disconnect();
      player?.dispose();
      player = undefined;
      for (const id of leases.splice(0)) void store.services.runtimeAssets?.releaseRuntime(id);
    };
    const surface = document.createElement('div');
    surface.className = 'candidate-resource-player';
    surface.inert = true;
    element.append(surface);
    setStatus('');
    setLoading(true);
    void (async () => {
      const docs = store.host.list();
      const compiled = store.services.compilePreview && resultValue(await store.services.compilePreview(false, docs));
      const original = compiled && (compiled.snapshot ?? compiled.lastValid);
      if (!original) throw new Error('需要有效剧情快照才能预览。');
      const sample = input.sample ?? 'normal';
      const snapshot = pagePreviewSample(original, input.template, input.page, sample);
      if (['cg', 'music'].includes(input.page)) prepareGallerySample(snapshot, sample === 'missing' ? 'unbound' : sample);
      snapshot.project.display.titleMusic = null;
      snapshot.project.display.titleVideo = null;
      const bridge = store.services.bridge.templates;
      const resources = input.plan && bridge?.previewTemplateResources
        ? resultValue(await bridge.previewTemplateResources(input.plan.planId)) : undefined;
      leases = resources?.leaseIds ?? [];
      if (!live) { release(); return; }
      if (resources) snapshot.assets.push(...resources.assets);
      const files = Object.assign({}, ...docs.map(doc => doc.files), input.files ?? {});
      const { width, height } = snapshot.project.canvas;
      Object.assign(surface.style, { width: width + 'px', height: height + 'px' });
      element.style.aspectRatio = width + '/' + height;
      const fit = () => { surface.style.transform = 'scale(' + element.clientWidth / width + ')'; };
      resize = new ResizeObserver(fit);
      resize.observe(element);
      fit();
      player = await openPlayerPreview(surface, store.services, snapshot, 'sample', files, input.template.styles.map(style => style.id), resources?.locations);
      if (!live) { release(); return; }
      player.setPreviewMuted(true);
      if (['story', 'choice', 'input', 'history', 'save', 'load'].includes(input.page)) {
        await player.view.newGame();
        if (!live) return;
      }
      const current = player.session.inspect();
      if (current?.token && current.state.wait?.kind === 'say') {
        resultValue(await player.session.updateTextProgress({ token: current.token, textShown: Number.MAX_SAFE_INTEGER }));
        if (!live) return;
      }
      if (current && ['save', 'load'].includes(input.page) && ['full', 'partial', 'missing', 'longText'].includes(sample)) {
        await prepareSaveSample(player.data, snapshot, current, player.stage.captureFrame(), sample);
        if (!live) return;
      }
      if (['cg', 'music'].includes(input.page)) {
        const profile = player.data.current()!;
        resultValue(await player.data.saveLongTerm(gallerySampleLongTerm(snapshot, profile.longTerm, sample), profile.longTerm.revision));
        if (!live) return;
        player.longTerm.syncFromDisk();
        player.view.configureGallerySample(sample);
      }
      player.view.navigation.replace(input.page);
      if (input.animation) player.view.previewPageAnimation(input.animation);
      setLoading(false);
    })().catch(reason => {
      release();
      if (live) { setStatus(workfaceError(reason)); setLoading(false); }
    });
    return () => { live = false; release(); surface.remove(); };
  }, [store, input, active]);
  return <div className="candidate-resource-preview">
    <div ref={host} aria-label="Player 样例" aria-busy={active && loading} className="candidate-resource-player-host"/>
    {active && (status ? <CandidateState kind="error" title="预览失败" description={status}/>
      : loading && <p role="status" className="candidate-resource-hint">正在打开 Player 预览…</p>)}
  </div>;
}
