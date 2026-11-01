import { completeAfterstoryPage, completePluginPages } from '@galcraft/templates';
import type { Domain, EntryMapping, ExecutionToken, Id, PlayerHost, Result, Snapshot, VoicePlaybackBinding } from '@galcraft/contracts';
import { SnapshotSchema, issueFromError } from '@galcraft/contracts';
import { SessionController, type PreparedSession } from '@galcraft/runtime';
import { AudioMixer, StageCommandService, StageController, VideoController, inspectionPresentation, type StageResourcePort } from '@galcraft/stage';
import { PlayerDataService } from './data.js';
import { effectivePlayerLanguages } from './preferences.js';
import { PlayerLongTermService } from './long-term.js';
import { RestoreCoordinator, type EngineRestorePort } from './restore.js';
import { PlayerView } from './view.js';
import { SceneEntryPresentation } from './scene-entry.js';
import { DataImportService } from './import.js';
import { fail, ok } from './common.js';
import { PlayerAudioRouter } from './audio-routing.js';
import { isIntroWait } from './intro-wait.js';
import { isStageAnimationWait } from './animation-wait.js';
import { animationResourceReader } from './animation-resources.js';
import { savePreparedRecord } from './save-request.js';
import { installPluginRuntimes } from './plugin-runtimes.js';
import { emptyContributions, PluginStateAdapter, type Contributions, type PluginManifest } from '@galcraft/plugins/contracts';
import { waitForTitleFrame } from './title-media.js';
import { createVideoBufferLoader, upcomingPlaybackAssets } from './playback-resources.js';

/** One mounted Player reuses exact audio variants within a bounded decoded-buffer budget. */
export function createAudioBufferLoader(context: AudioContext, resources: PlayerHost['resources'], maximumBytes = 64 * 1024 * 1024, maximumEntries = 32) {
  const entries = new Map<string, { promise: Promise<AudioBuffer>; bytes: number; ready: boolean }>();
  const trim = () => {
    let bytes = [...entries.values()].reduce((total, entry) => total + entry.bytes, 0);
    while (entries.size > maximumEntries || bytes > maximumBytes) {
      const oldest = entries.keys().next().value; if (oldest === undefined) break;
      bytes -= entries.get(oldest)!.bytes; entries.delete(oldest);
    }
  };
  const load = (assetId: Id, variantId: Id): Promise<AudioBuffer> => {
    const key = JSON.stringify([assetId, variantId]), cached = entries.get(key);
    if (cached) { entries.delete(key); entries.set(key, cached); return cached.promise; }
    const entry = { promise: null as unknown as Promise<AudioBuffer>, bytes: 0, ready: false };
    entry.promise = (async () => {
      const location = await resources.resolve(assetId, variantId);
      if (!location.ok) throw new Error(location.error.message);
      try {
        const response = await fetch(location.value.uri); if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (entries.get(key) === entry) { entry.bytes = buffer.length * buffer.numberOfChannels * 4; entry.ready = true; trim(); }
        return buffer;
      } finally { location.value.release(); }
    })().catch(error => { if (entries.get(key) === entry) entries.delete(key); throw error; });
    entries.set(key, entry); trim(); return entry.promise;
  };
  return { load, ready: (assetId: Id, variantId: Id) => !!entries.get(JSON.stringify([assetId, variantId]))?.ready,
    clear: () => entries.clear() };
}

export type PlayerMount = { view: PlayerView; data: PlayerDataService; session: SessionController;
  stage: StageController; restore: RestoreCoordinator; longTerm: PlayerLongTermService;
  updatePreview(snapshot: Snapshot, styles?: Record<string, string>, previewStyleIds?: Id[]): Result<void>;
  setPreviewMuted(muted: boolean): void;
  activatePreview(prepared: PreparedSession, mode?: 'inspection' | 'current' | 'playtest'): Promise<Result<void>> };

export async function mountPlayer(root: HTMLElement, host: PlayerHost, rawSnapshot: Snapshot,
  domain: Domain = { projectId: rawSnapshot.projectId, kind: 'player', instance: 'default' },
  entryMappings: EntryMapping[] = [], stageProviders: NonNullable<Parameters<typeof StageController.create>[3]> = [],
  plugins: { contributions: Contributions; manifests: PluginManifest[] } = { contributions: emptyContributions(), manifests: [] },
  styles: Record<string, string> = {}, previewStyleIds: Id[] = [], engineRestore: EngineRestorePort | null = null): Promise<Result<PlayerMount>> {
  const checked = SnapshotSchema.safeParse(rawSnapshot);
  installPluginRuntimes();
  if (!checked.success) return fail('SNAPSHOT_INVALID', checked.error.message);
  const snapshot = checked.data;
  // Establish the clipping boundary before asynchronous stage, profile or opening media work.
  root.classList.add('galcraft-player');
  root.style.overflow = 'hidden';
  completePluginPages(snapshot.template, plugins.contributions.pages);
  if(snapshot.characters.some(character=>character.afterstory))completeAfterstoryPage(snapshot.template);
  const stageElement = document.createElement('div'); stageElement.className = 'gc-stage';
  root.append(stageElement);
  const locations = new Map<string, { uri: string; release(): void }>();
  const resolve: StageResourcePort['resolve'] = async (assetId: Id, variantId: Id) => {
    const asset = snapshot.assets.find(item => item.assetId === assetId && item.variantId === variantId);
    if (!asset) return fail('ASSET_MISSING', `素材 ${assetId} 不在当前快照`);
    const key = `${assetId}/${variantId}`;
    let location = locations.get(key);
    if (!location) { const resolved = await host.resources.resolve(assetId, variantId);
      if (!resolved.ok) return resolved;
      location = { uri: resolved.value.uri, release: resolved.value.release }; locations.set(key, location); }
    return ok({ asset, url: location.uri, anchor: { x: .5, y: 1 }, providerVersion: snapshot.lock.plugins.find(item => item.id === asset.provider?.split('/')[0])?.version });
  };
  const resources: StageResourcePort = { resolve, resolveAsset: async assetId => {
    const asset = snapshot.assets.find(item => item.assetId === assetId);
    return asset ? resolve(assetId, asset.variantId) : fail('ASSET_MISSING', `素材 ${assetId} 不在当前快照`);
  } };
  const stage = await StageController.create(stageElement, { width: snapshot.project.canvas.width,
    height: snapshot.project.canvas.height, color: snapshot.project.canvas.stageColor }, resources, stageProviders);
  const videoElement = document.createElement('video'); videoElement.className = 'gc-video'; videoElement.playsInline = true;
  let previewMuted = false;
  const mutePreviewMedia = () => { if (domain.kind !== 'player') for (const media of root.querySelectorAll<HTMLMediaElement>('video,audio')) media.muted = previewMuted; };
  const previewMediaObserver = domain.kind === 'player' ? null : new MutationObserver(mutePreviewMedia);
  videoElement.hidden = true;
  stageElement.append(videoElement);
  const data = new PlayerDataService(host, domain, snapshot.project.languages.menuDefault,
    snapshot.project.languages.voiceDefault, matchMedia('(prefers-reduced-motion: reduce)').matches, effectivePlayerLanguages(snapshot.project.languages));
  const opened = await data.open(); if (!opened.ok) { stage.dispose(); return opened; }
  previewMediaObserver?.observe(root, { childList: true, subtree: true });
  const audioContext = new AudioContext();
  const audioBuffers = createAudioBufferLoader(audioContext, host.resources);
  const videoBuffers = createVideoBufferLoader(host.resources);
  const imagePreparations = new Map<Id, Promise<void>>();
  let preparationDisposed = false, prefetchActive = 0;
  let prefetchQueue: Id[] = [];
  const prepareAsset = async (assetId: Id, required = false): Promise<void> => {
    const asset = snapshot.assets.find(item => item.assetId === assetId); if (!asset || preparationDisposed) return;
    if (asset.kind === 'audio') {
      const levels = data.current()!.preferences.volumes;
      if (levels.master <= 0) return;
      // Voice failures retain the existing audible-media degradation policy.
      await audioBuffers.load(asset.assetId, asset.variantId).catch(() => {}); return;
    }
    if (asset.kind === 'video') {
      const bytes = asset.files.find(file => file.path === asset.entry)?.bytes ?? 0;
      if (bytes <= videoBuffers.maximumBytes) await videoBuffers.warm(asset.assetId, asset.variantId);
      return;
    }
    if (asset.kind !== 'image') return;
    let pending = imagePreparations.get(assetId);
    if (!pending) {
      pending = (async () => {
        const resolved = await host.resources.resolve(asset.assetId, asset.variantId);
        if (!resolved.ok) throw new Error(resolved.error.message);
        try { const image = new Image(); image.src = resolved.value.uri; await image.decode(); }
        finally { resolved.value.release(); }
      })().catch(error => { imagePreparations.delete(assetId); throw error; });
      imagePreparations.set(assetId, pending);
      if (imagePreparations.size > 32) imagePreparations.delete(imagePreparations.keys().next().value!);
    }
    if (required) await pending; else await pending.catch(() => {});
  };
  const pumpPrefetch = () => {
    while (!preparationDisposed && prefetchActive < 2 && prefetchQueue.length) {
      const id = prefetchQueue.shift()!; prefetchActive++;
      void prepareAsset(id).catch(() => {}).finally(() => { prefetchActive--; pumpPrefetch(); });
    }
  };
  const prefetchAfter = (statementId: Id) => {
    const preferences = data.current()!.preferences;
    prefetchQueue = upcomingPlaybackAssets(snapshot, statementId, preferences.voiceLocale, false, 3,
      preferences.volumes.master > 0 && preferences.volumes.voice > 0);
    pumpPrefetch();
  };
  const audio = new AudioMixer(audioContext, audioBuffers.load);
  const volumes = opened.value.preferences.volumes;
  audio.setLevels(volumes.master / 100, Object.fromEntries(Object.entries(volumes).filter(([key]) => key !== 'master')
    .map(([key, level]) => [key, level / 100])));
  audio.setDuck(opened.value.preferences.duckBgm ? .35 : 1, opened.value.preferences.interruptOnSilent);
  let session: SessionController;
  const voiceBindings = new Map<Id, VoicePlaybackBinding>();
  const audioRouter = new PlayerAudioRouter(audio, () => session.inspect()?.sessionId ?? null);
  const entryPresentation = new SceneEntryPresentation(root, host, snapshot, stage, audio);
  const longTerm = new PlayerLongTermService(data);
  const stageCommands = new StageCommandService({ character: id => snapshot.characters.find(character => character.id === id), asset: (assetId, variantId) => {
    const asset = snapshot.assets.find(item => item.assetId === assetId && (!variantId || item.variantId === variantId));
    return asset ? ok({ variantId: asset.variantId, kind: asset.kind, provider: asset.provider, providerVersion: null, imageAnimation: asset.metadata.imageAnimation, loop: asset.metadata.loop }) :
      fail('ASSET_MISSING', `素材 ${assetId} 不在当前快照`);
  }, animation: animationResourceReader(snapshot, host.resources) });
  let renderGeneration = 0;
  let stagePending: Promise<void> = Promise.resolve();
  let videoLocation: { release(): void } | null = null;
  let videoGeneration = 0;
  let videoFrameLifetime: AbortController | null = null;
  let enteredVideo: ExecutionToken | null = null;
  let activeStageSessionId: Id | null = null;
  let stageCurrent = false;
  const syncStage = async (): Promise<Result<void>> => {
    await stagePending;
    const inspection = session.inspect();
    if (!inspection || !stageCurrent || activeStageSessionId !== inspection.sessionId)
      return fail('STAGE_SESSION_MISSING', '舞台尚未准备');
    const captured = stage.capture(); if (!captured.ok) { view.setStageError(captured.error); return captured; }
    const synced = session.syncPresentation(inspection.sessionId, captured.value);
    if (!synced.ok) view.setStageError(synced.error);
    return synced;
  };
  const video = new VideoController(videoElement, completion => {
    const generation = videoGeneration, location = videoLocation;
    const releasePresentation=view.holdVideoPresentation();
    void syncStage().then(synced => synced.ok ? session.dispatch({ kind: 'animation', token: completion.token }) : synced).then(async result => {
      if (result.ok) {
        view.render(); await view.completeVideoPresentation();
        if (videoGeneration !== generation || videoLocation !== location) return;
        videoElement.hidden = true; root.classList.remove('gc-video-active');
        location?.release(); videoLocation = null; audio.setPause('video', false);
      }
      else {root.classList.remove('gc-video-active');view.showError(result.error);view.render();}
    }).catch(error=>{root.classList.remove('gc-video-active');view.showError(issueFromError(error,'M07'));view.render();}).finally(releasePresentation);
  });
  let storyVideoVolume=1;
  const startStoryVideo = async (token:ExecutionToken):Promise<Result<Id>> => {
    const releasePresentation=view.holdVideoPresentation();
    try {
    const generation = ++videoGeneration;
    enteredVideo = null;
    const inspection=session.inspect(token.sessionId);
    const instruction=snapshot.scenes.flatMap(scene=>scene.instructions).find(item=>item.statementId===token.statementId);
    const args=instruction?.args as {assetId?:Id;skipFadeMs?:number;volume?:number}|undefined;
    const asset=snapshot.assets.find(item=>item.assetId===args?.assetId);
    if(!inspection||instruction?.opcode!=='video'||!asset)return fail('VIDEO_STALE','影片已失效');
    let resolved: Awaited<ReturnType<typeof host.resources.resolve>>;
    try {
      const bytes=asset.files.find(file=>file.path===asset.entry)?.bytes??0;
      resolved=bytes<=videoBuffers.maximumBytes?ok(await videoBuffers.load(asset.assetId,asset.variantId)):
        await host.resources.resolve(asset.assetId,asset.variantId);
    } catch(error) { return fail('VIDEO_PLAY_FAILED',String(error)); }
    if(!resolved.ok)return resolved;
    if(generation!==videoGeneration||session.inspect()?.sessionId!==token.sessionId){resolved.value.release();return fail('VIDEO_STALE','影片已失效');}
    storyVideoVolume=args?.volume??1;videoLocation?.release();videoLocation=resolved.value;
    audio.setPause('video',true);videoElement.hidden=false;videoElement.style.opacity='1';root.classList.add('gc-video-active');
    videoElement.style.visibility='hidden';videoElement.dataset.gcMediaStatus='pending';
    videoFrameLifetime?.abort();const lifetime=new AbortController();videoFrameLifetime=lifetime;
    const firstFrame=waitForTitleFrame(videoElement,0,lifetime.signal);
    // Attach the rejection handler before play can reject or trigger an element error.
    const frameReady=firstFrame.then(()=>true,()=>false);
    await video.setPause(false);
    const result=await video.start({token,url:resolved.value.uri,skipFadeMs:args?.skipFadeMs??300});
    const painted=result.ok?await frameReady:false;
    if(generation!==videoGeneration)return fail('VIDEO_STALE','影片已失效');
    if(result.ok&&painted){videoElement.style.visibility='visible';videoElement.dataset.gcMediaStatus='ready';enteredVideo={...token};}
    else {lifetime.abort();videoElement.dataset.gcMediaStatus='failed';videoElement.hidden=true;root.classList.remove('gc-video-active');audio.setPause('video',false);view.navigation.replace('videoError');if(result.ok)return fail('VIDEO_PLAY_FAILED','影片首帧读取失败');}
    return result;
    } finally {releasePresentation();}
  };
  session = new SessionController({ longTerm, stage: stageCommands,
    contributions: plugins.contributions,
    beforeDialogue: async ({sessionId,token,state}) => {
      await stagePending;
      entryPresentation.begin(sessionId,state);
      if (state.wait?.kind === 'animation') {
        const prepared = await stage.prepareStage(sessionId,state.presentation,null,voiceBindings.get(sessionId) ?? null);
        if (!prepared.ok) return prepared;
        const committed = stage.commitStage(prepared.value.id,token);
        if (!committed.ok) { stage.discardPrepared(prepared.value.id); return committed; }
      }
      return entryPresentation.enterBody(sessionId,state);
    },
    prepareProviderCommands: async input => {
      await stagePending;
      const prepared = await stage.prepareStage(input.sessionId, input.state, null, voiceBindings.get(input.sessionId) ?? null, input.commands);
      if (!prepared.ok) { if (session.inspect()?.sessionId === input.sessionId) view.setStageError(prepared.error); return prepared; }
      return ok({ state: prepared.value.state,
        commit: () => { const result = stage.commitStage(prepared.value.id, input.token);
          if (result.ok) { activeStageSessionId = input.sessionId; stageCurrent = true; }
          else if (session.inspect()?.sessionId === input.sessionId) view.setStageError(result.error);
          return result; },
        dispose: () => stage.discardPrepared(prepared.value.id) });
    },
    onCommitted: async ({ sessionId, token, state, delta, presentationPrepared }) => {
      const releaseResources = view.holdResourcePreparation();
      try {
      const generation = ++renderGeneration;
      stageCurrent = false;
      const voice = delta?.voiceBinding && state.presentation.voice;
      if (voice && data.current()!.preferences.volumes.master > 0 && data.current()!.preferences.volumes.voice > 0 &&
        !audioBuffers.ready(voice.assetId, voice.variantId)) {
        await audioBuffers.load(voice.assetId, voice.variantId).catch(() => {});
        if (generation !== renderGeneration || session.inspect()?.sessionId !== sessionId)
          return { presentationEntered: false, mediaStarted: false };
      }
      prefetchAfter(token.statementId);
      entryPresentation.begin(sessionId,state);
      if (delta?.voiceBinding) voiceBindings.set(sessionId, delta.voiceBinding);
      const audioStarts: Promise<boolean>[] = [];
      let movieStart: Promise<boolean> | null = null;
      for (const item of delta?.audio ?? []) {
        if (item.bus === 'video') continue;
        if (item.bus === 'bgm' || item.bus === 'sfx' || item.bus === 'ui')
          audioStarts.push(audioRouter.applyStage(sessionId, { bus: item.bus, id: item.id, state: item.state }).then(id => { if(id&&item.bus==='bgm'&&item.state.assetId)entryPresentation.bgmStarted(sessionId,id,item.state.assetId);const inspected=id?audio.inspect({sessionId,source:{kind:'instance',id}}):null; return !!inspected?.ok && inspected.value.status==='playing'; }));
      }
      const movie = delta?.audio.find(item => item.bus === 'video' && item.state.assetId && item.state.variantId);
      if (movie?.state.assetId && movie.state.variantId) {
        movieStart=startStoryVideo(token).then(started=>{if(!started.ok&&started.error.code!=='VIDEO_STALE'&&session.inspect()?.sessionId===sessionId){view.showError(started.error);view.navigation.replace('videoError');}return started.ok&&videoElement.readyState>=2&&!videoElement.paused;});
      } else if (video.state !== 'idle' && video.state !== 'finished' && state.wait?.kind !== 'animation') {
        video.returnTitle(); videoElement.hidden = true; root.classList.remove('gc-video-active');
        videoLocation?.release(); videoLocation = null;
        audio.setPause('video', false);
      }
      const binding = state.presentation.voice ? voiceBindings.get(sessionId) ?? null : null;
      const preparation = presentationPrepared ? Promise.resolve(ok({ id: null })) : stage.prepareStage(sessionId, state.presentation, null, binding);
      stagePending = preparation.then(prepared => {
        if (generation !== renderGeneration || session.inspect()?.sessionId !== sessionId) {
          if (prepared.ok && prepared.value.id) stage.discardPrepared(prepared.value.id); return;
        }
        if (!prepared.ok) { view.setStageError(prepared.error); return; }
        if (prepared.value.id) { const committed = stage.commitStage(prepared.value.id, token);
          if (!committed.ok) { view.setStageError(committed.error); return; } }
        activeStageSessionId = sessionId;
        stageCurrent = true;
        view.setStageError(null);
        if (!snapshot.project.player.autosave) return;
        const scene = snapshot.scenes.find(item => item.scene.id === state.position.sceneId);
        const atEntrance = state.position.statementId === scene?.instructions[0]?.statementId;
        if (!atEntrance && state.wait?.kind !== 'choice') return;
        const inspection = session.inspect(sessionId); if (!inspection) return;
        const record = data.makeRecord({ snapshot, inspection, kind: 'auto' });
        void savePreparedRecord(data, { kind: 'auto', record,
          occurrenceKey: `${sessionId}/${state.occurrence}/${atEntrance ? 'entrance' : 'choice'}` }, null)
          .then(async result => { if (!result.ok) view.showError(result.error); else await view.syncCurrentMainStory(); });
      });
      await stagePending;
      if (generation !== renderGeneration || session.inspect()?.sessionId !== sessionId || !stageCurrent)
        return { presentationEntered: false, mediaStarted: false };
      audioRouter.applyDialogue({ sessionId, token, state, delta });
      if (movieStart) { const started = await movieStart; return { presentationEntered: started, mediaStarted: started }; }
      const waitingForMovie = state.wait?.kind === 'animation' && snapshot.scenes.flatMap(scene => scene.instructions).some(instruction => instruction.statementId === token.statementId && instruction.opcode === 'video');
      if (waitingForMovie) return { presentationEntered: video.state !== 'error' && enteredVideo?.sessionId === token.sessionId && enteredVideo.occurrence === token.occurrence && enteredVideo.statementId === token.statementId, mediaStarted: false };
      const started = await Promise.all(audioStarts);
      return { presentationEntered: true, mediaStarted: started.length ? started.every(Boolean) : true };
      } finally { releaseResources(); }
    } });
  const restore = new RestoreCoordinator(snapshot, data, session, stage, new PluginStateAdapter(plugins.contributions, plugins.manifests), entryMappings, engineRestore);
  const importer = new DataImportService(data, restore, snapshot);
  let prior=performance.now();
  const resetPlayClock=()=>{prior=performance.now();};
  const releaseClock=host.subscribeLifecycle(event=>{if(event.type==='blur'||event.type==='focus')resetPlayClock();});
  document.addEventListener('visibilitychange',resetPlayClock);
  const publishSessionStage = (sessionId: Id, previousSessionId: Id | null) => {
    videoGeneration++; videoFrameLifetime?.abort();
    enteredVideo = null;
    renderGeneration++; video.returnTitle(); videoElement.hidden = true;
    root.classList.remove('gc-video-active');
    activeStageSessionId = sessionId; stageCurrent = true;
    view.setStageError(null);
    videoLocation?.release(); videoLocation = null;
    if (previousSessionId && previousSessionId !== sessionId) { audio.disposeSession(previousSessionId);
      voiceBindings.delete(previousSessionId); audioRouter.clearSession(previousSessionId); entryPresentation.stop(); }
    audio.setPause('video', false);
    audio.setPause('systemPage', false); stage.pause(false);
    longTerm.setActiveSession(sessionId);
    const restored = session.inspect(sessionId);
    if (restored) {
      if (restored.token && isIntroWait(snapshot, restored.state, restored.token)) stage.bindIntroToken(restored.token);
      const presentation = restored.state.presentation;
      if (!presentation.bgm.stopped) audioRouter.apply(sessionId, 'bgm', presentation.bgm.assetId, presentation.bgm);
      for (const [id, sound] of Object.entries(presentation.ambience)) if (!sound.stopped) audioRouter.apply(sessionId, 'ambience', id, sound);
      if (restored.state.wait?.kind === 'say') session.replayVoice();
      if (restored.token && restored.state.pendingReadStatementId && ['say', 'choice', 'input'].includes(restored.state.wait?.kind ?? ''))
        void session.confirmPresentationEntered(restored.token).then(result => { if (!result.ok) view.showError(result.error); view.render(); });
    }
    view.render();
  };
  const view = new PlayerView({ root, host, snapshot, session, stage, stageElement, videoElement, data, restore, longTerm, importer, video, audio, entryPresentation,
    pluginPages: plugins.contributions.pages, pluginComponents: plugins.contributions.components, pluginPlatforms: plugins.contributions.platform,
    styles, previewStyleIds,
    waitForStage: () => stagePending, syncStage,
    prepareOpeningAssets: async position => {
      const preferences = data.current()!.preferences;
      const assets = upcomingPlaybackAssets(snapshot, position.statementId!, preferences.voiceLocale, true, 1,
        preferences.volumes.master > 0 && preferences.volumes.voice > 0);
      // The actual stage/video entry owns errors and retry. A failed warm-up leaves that path available.
      await Promise.all(assets.map(id => prepareAsset(id, true).catch(() => {})));
    },
    prepareChoiceAssets: async assetIds => {
      // The selected branch supplies only its first screen. This never runs script or starts media.
      prefetchQueue = [...new Set(assetIds)].slice(0, 12); pumpPrefetch();
    },
    commitSessionStage: (preparedStageId, owner, previousSessionId) => {
      const committed = stage.commitStage(preparedStageId, owner);
      if (committed.ok) publishSessionStage(owner.sessionId, previousSessionId);
      return committed;
    },
    retryVideo: async()=>{const token=session.inspect()?.token;if(!token)return fail('VIDEO_STALE','影片已失效');const started=await startStoryVideo(token);return started.ok?session.confirmMediaStarted(token):started;},
    onSoundEnabled: async()=>{const inspection=session.inspect();if(!inspection)return ok(undefined);
      const id=audioRouter.bgmInstance(inspection.sessionId),playing=id?audio.inspect({sessionId:inspection.sessionId,source:{kind:'instance',id}}):null;
      if(!playing?.ok||playing.value.status!=='playing')return ok(undefined);
      const trace=[...inspection.trace].reverse().find(trace=>snapshot.scenes.flatMap(scene=>scene.instructions).some(instruction=>instruction.statementId===trace.token.statementId&&instruction.opcode==='bgm'));
      return trace?session.confirmMediaStarted(trace.token):ok(undefined);},
    onSessionEnd: sessionId => { audioRouter.clearSession(sessionId); voiceBindings.delete(sessionId);
      entryPresentation.stop();
      if (activeStageSessionId === sessionId) { activeStageSessionId = null; stageCurrent = false; }
      view.setStageError(null); },
    onDispose: () => {previewMediaObserver?.disconnect();releaseClock();document.removeEventListener('visibilitychange',resetPlayClock);videoFrameLifetime?.abort();videoLocation?.release(); for (const location of locations.values()) location.release(); locations.clear();
      audioRouter.clear();
      preparationDisposed = true; prefetchQueue = []; imagePreparations.clear(); videoBuffers.clear(); audioBuffers.clear();
      void audioContext.close(); resizeObserver.disconnect(); } });
  let stageAnimationCompleting=false;
  let pendingAnimationCompletion: {token:ExecutionToken}|null=null;
  const completeStageWait=(completion:{token:ExecutionToken}) => {
    if(!view.storyActive){pendingAnimationCompletion=completion;return;}
    if(stageAnimationCompleting)return;
    const inspection = session.inspect();
    if (!inspection || !isStageAnimationWait(snapshot, inspection.state, inspection.token, completion.token)) return;
    const captured = stage.capture();
    if (!captured.ok || [...captured.value.objects.flatMap(object => object.processes), ...(captured.value.camera?.processes ?? [])].some(process =>
      process.owner.sessionId === completion.token.sessionId && process.owner.occurrence === completion.token.occurrence)) return;
    if (captured.value.objects.some(object => !object.imagePlayback?.completed && object.imagePlayback?.owner?.sessionId === completion.token.sessionId &&
      object.imagePlayback.owner.occurrence === completion.token.occurrence)) return;
    stageAnimationCompleting=true;
    void syncStage().then(async (synced): Promise<Result<unknown>> => {
      if (!synced.ok) return synced;
      const current = session.inspect();
      if(!view.storyActive&&current&&isStageAnimationWait(snapshot,current.state,current.token,completion.token))pendingAnimationCompletion=completion;
      return view.storyActive && current && isStageAnimationWait(snapshot, current.state, current.token, completion.token)
        ? session.dispatch({ kind: 'animation', token: completion.token }) : ok(undefined);
    }).then(result => {
      if (result.ok) view.render();
      else view.showError(result.error);
    }).finally(()=>{stageAnimationCompleting=false;});
  };
  stage.onCompletion(completeStageWait);
  let timerCompleting = false;
  const frame = (now: number) => { if (!root.isConnected || view.isDisposed) return;
    const prefs=data.current()!.preferences;
    videoElement.volume=Math.min(1,Math.max(0,storyVideoVolume*prefs.volumes.master*prefs.volumes.video/10000));stage.setVisualPreferences(prefs.effects,prefs.reducedMotion);
    const elapsedMs = Math.max(0, now - prior); const deltaMs = Math.min(100, elapsedMs); prior = now;
    if(view.playTimeActive)session.elapsePlayTime(elapsedMs);
    if(!view.preparingResources)stage.tick(deltaMs, audio.voiceLevel(), audio.voicePCM(deltaMs));
    video.tick(deltaMs); audio.tick(deltaMs); view.updateMediaFrame(deltaMs);
    if (video.state === 'error' && !videoElement.hidden) {
      videoElement.hidden = true; root.classList.remove('gc-video-active'); audio.setPause('video', false);
      view.showError({code:'VIDEO_PLAY_FAILED',owner:'M06',severity:'error',message:videoElement.error?.message||'影片读取失败，请重试或返回标题。',related:[],actions:['retry','returnTitle'],...(videoElement.error?{details:{mediaCode:videoElement.error.code}}:{})});
      view.navigation.replace('videoError');
    }
    if (stageCurrent && activeStageSessionId) {
      const captured = stage.capture();
      if (!captured.ok) { stageCurrent = false; view.setStageError(captured.error); }
      else { const synced = session.syncPresentation(activeStageSessionId, captured.value);
        if (!synced.ok) { stageCurrent = false; view.setStageError(synced.error); }
        else { view.updateIntroFrame(captured.value.intro); view.updateStageFrame(captured.value); } }
    }
    if(view.storyActive&&pendingAnimationCompletion&&!stageAnimationCompleting){const pending=pendingAnimationCompletion;pendingAnimationCompletion=null;completeStageWait(pending);}
    if (stageCurrent && view.storyActive && !timerCompleting) {
      const waiting = session.inspect();
      if (waiting?.token && waiting.state.wait?.kind === 'timer') {
        const elapsed = session.elapseTimer({ token: waiting.token, deltaMs });
        if (elapsed.ok && elapsed.value) {
          timerCompleting = true;
          void syncStage().then(async (synced): Promise<Result<unknown>> => {
            if (!synced.ok) return synced;
            const current = session.inspect()?.token;
            if (!view.storyActive || !current || current.sessionId !== waiting.token!.sessionId ||
              current.occurrence !== waiting.token!.occurrence || current.statementId !== waiting.token!.statementId) return ok(undefined);
            return session.dispatch({ kind: 'timer', token: waiting.token! });
          })
            .then(result => { if (result.ok) view.render(); else view.showError(result.error); })
            .finally(() => { timerCompleting = false; });
        }
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // Stage and DOM layout share local CSS dimensions. Ancestor transforms scale both once.
  const resize = () => { stage.setViewport({ x: 0, y: 0, width: root.clientWidth, height: root.clientHeight }); };
  const resizeObserver = new ResizeObserver(() => { resize(); view.render(); }); resizeObserver.observe(root); resize();
  await view.start();
  restore.subscribe((receipt, previousSessionId) => publishSessionStage(receipt.sessionId, previousSessionId));
  return ok({ view, data, session, stage, restore, longTerm,
    updatePreview: (next, nextStyles = styles, nextStyleIds = previewStyleIds) => {
      if (domain.kind === 'player') return fail('PREVIEW_DOMAIN', '页面更新只适用于预览资料域');
      const checked = SnapshotSchema.safeParse(next);
      if (!checked.success) return fail('SNAPSHOT_INVALID', checked.error.message);
      if (next.projectId !== snapshot.projectId || next.engineVersion !== snapshot.engineVersion ||
        JSON.stringify(next.lock) !== JSON.stringify(snapshot.lock) || JSON.stringify(next.assets) !== JSON.stringify(snapshot.assets) ||
        JSON.stringify(next.pluginDocuments) !== JSON.stringify(snapshot.pluginDocuments) || JSON.stringify(next.project.canvas) !== JSON.stringify(snapshot.project.canvas))
        return fail('PREVIEW_REBUILD_REQUIRED', '引擎、插件、资源或画布已变化，请重建预览');
      Object.assign(snapshot, checked.data);
      Object.assign(data.languages!, effectivePlayerLanguages(snapshot.project.languages));
      completePluginPages(snapshot.template, plugins.contributions.pages);
      if (snapshot.characters.some(character => character.afterstory)) completeAfterstoryPage(snapshot.template);
      view.options.styles = nextStyles; view.options.previewStyleIds = nextStyleIds;
      view.render(); return ok(undefined);
    },
    setPreviewMuted: muted => {
      if (domain.kind === 'player') return;
      previewMuted = muted; audio.setOutputMuted(muted); mutePreviewMedia();
    }, activatePreview: async (prepared, mode = 'playtest') => {
    if (domain.kind === 'player') return fail('PREVIEW_DOMAIN', '调试入口只适用于预览资料域');
    const previewPresentation = mode === 'inspection' ? inspectionPresentation(prepared.state.presentation) : prepared.state.presentation;
    const visual = await stage.prepareStage(prepared.sessionId, previewPresentation, null, prepared.voiceBinding);
    if (!visual.ok) return visual;
    const previous = session.inspect()?.sessionId;
    const activated = session.activate(prepared.id); if (!activated.ok) { stage.discardPrepared(visual.value.id); return activated; }
    const token = activated.value.token ?? { sessionId: activated.value.sessionId, occurrence: activated.value.state.occurrence,
      statementId: activated.value.state.position.statementId! };
    const displayed = stage.commitStage(visual.value.id, token); if (!displayed.ok) return displayed;
    if(prepared.voiceBinding)voiceBindings.set(activated.value.sessionId,prepared.voiceBinding);
    else voiceBindings.delete(activated.value.sessionId);
    if (mode === 'inspection') session.syncPresentation(activated.value.sessionId, previewPresentation);
    view.setStageError(null);
    if (previous) { audio.disposeSession(previous); audioRouter.clearSession(previous); }
    activeStageSessionId = activated.value.sessionId; stageCurrent = true; longTerm.setActiveSession(activeStageSessionId);
    const presentation = activated.value.state.presentation;
    if (!presentation.bgm.stopped) audioRouter.apply(activeStageSessionId, 'bgm', presentation.bgm.assetId, presentation.bgm);
    for (const [id, sound] of Object.entries(presentation.ambience)) if (!sound.stopped) audioRouter.apply(activeStageSessionId, 'ambience', id, sound);
    if (mode === 'inspection' && session.inspect()?.pendingLongTerm) {
      const reconciled = await session.retryLongTerm(); if (!reconciled.ok) return reconciled;
    }
    if (mode !== 'inspection') view.navigation.replace('story');
    const started = mode === 'inspection' ? ok(undefined) : mode === 'current' ? await session.startPreviewInstruction() : await session.start(); if (!started.ok) return started;
    if (mode !== 'inspection' && session.inspect()?.state.wait?.kind === 'say') session.replayVoice();
    if (mode === 'inspection') {
      const inspected = session.inspect();
      if (inspected?.token && inspected.state.wait?.kind === 'animation' && snapshot.scenes.flatMap(scene => scene.instructions).find(instruction => instruction.statementId === inspected.token!.statementId)?.opcode === 'video') {
        const movie = await startStoryVideo(inspected.token); if (!movie.ok) return movie;
        const paused = await video.setPause(true); if (!paused.ok) return paused;
      }
      if (inspected?.token && inspected.state.wait?.kind === 'say') {
        const revealed = await session.updateTextProgress({ token: inspected.token, textShown: Number.MAX_SAFE_INTEGER });
        if (!revealed.ok) return revealed;
      }
      session.setPreviewPaused(true);
    }
    view.navigation.replace('story'); return ok(undefined);
  } });
}
