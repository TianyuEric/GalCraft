import { observeVariables, observeProperties, type PlayerObservationRequest, type PlayerObservationResult } from './observation.js';
import { EmergencyCover, emergencyActionAllowed } from './emergency.js';
import { FilmBars, ReadingStatus } from './reading-decorations.js';
import { playerVariableValues } from './variables.js';
import { ToolbarIcon } from './toolbar-icon.js';
import { SettingsPage } from './settings-page.js';
import { GalleryPage, galleryState, formatTime } from './gallery.js';
import { PageTransition } from './page-animation.js';
import { holdPlayerVisual, waitForPresentedMedia } from './visual-handoff.js';
import { choiceFirstAssets } from './choice-resources.js';
import { countNameCharacters, createId } from '@galcraft/contracts';
import { currentMainStory, initialNameProgress, mainStoryName, shouldConfirmPlayerName } from './player-name.js';
import { PluginSurface } from './plugin-surface.js';
import { ResourceImage } from './resource-image.js';
import { AfterstoryPortrait } from './afterstory-portrait.js';
import { afterstoryCharacters, afterstoryDirectoryUnlocked, afterstoryUnlocked } from './afterstory.js';
import { SavePage } from './save-page.js';
import { flushSync, createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { FlowPage } from './flow-page.js';
import { flowLocalContext, flowPositionLabel } from './flow-entries.js';
import { installTransientScrollbars } from './scrollbars.js';
import type { ComponentConfig, EntryMapping, ExecutionToken, Id, Json, PlayerHost, PresentationState, Project, Result, SaveRecord, Snapshot } from '@galcraft/contracts';
import { dialogueRuns, nvlRuns, sliceDialogueRuns, formatDialogue, graphemes, chooseVoice, type PreparedSession, type SessionController } from '@galcraft/runtime';
import { measureNvlPage } from './nvl-layout.js';
import { readingPortrait } from '@galcraft/stage';
import { DialogueText, IndependentPortrait } from './dialogue-text.js';
import type { AudioMixer, StageController, VideoController } from '@galcraft/stage';
import { InputRouter, PageNavigator, type InputAction } from './navigation.js';
import type { PlayerDataService } from './data.js';
import type { RestoreCoordinator } from './restore.js';
import { defaultPreferences, effectivePlayerLanguages, type PlayerPreferences } from './preferences.js';
import type { PlayerLongTermService } from './long-term.js';
import { dataReleaseVersions, importDestinationKey, type DataImportPlan, type DataImportSelection, type DataImportService, type ImportDestination,
  type PlayerDataPackage } from './import.js';
import { archiveText, readArchive, writeArchive } from './archive.js';
import { isIntroWait } from './intro-wait.js';
import type { ComponentContribution, PageContribution, PlatformContribution } from '@galcraft/plugins/contracts';
import { renderPluginComponent } from './plugin-components.js';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { componentTextOverride, officialLocaleResources, resolveLayout } from '@galcraft/templates';
import { PlayerSelect } from './select.js';
const defaultLocales = officialLocaleResources();
import { TemplateImages } from './template-images.js';
import { autoReadClock, dialogueVoiceEnded, readingViewport } from './auto-reading.js';
import { savePreparedRecord } from './save-request.js';
import { PageAudioController } from './page-audio.js';
import { StartupPresentation } from './startup.js';
import { TitleMedia } from './title-media.js';
import { PageBackground } from './page-background.js';
import type { SceneEntryPresentation } from './scene-entry.js';
import { SharedPortrait } from './shared-portrait.js';
import { ReadingSurface, readingBackground, textProgress } from './reading-surface.js';
import { readingRuns } from './reading-style.js';
import { ComponentInstances, componentInstanceStyle, type ComponentInstanceProps, type BusinessPageAdapter } from './instance-renderer.js';
import { componentDefinition } from '@galcraft/templates';
import { readUIPath, readUIValue, resolveUIOfficialAction, type UIValueContext } from '@galcraft/templates/editor';
import { issueDetails, localizeIssue, issueFromError } from '@galcraft/contracts';
import type { Issue, OfficialAction, UIAction } from '@galcraft/contracts';
import { validatePreferences } from './preferences.js';
import { businessParts } from './business-parts.js';

export type PlayerViewOptions = { root: HTMLElement; host: PlayerHost; snapshot: Snapshot; session: SessionController;
  entryPresentation?: SceneEntryPresentation;
  stage: StageController; stageElement: HTMLElement; videoElement:HTMLVideoElement; data: PlayerDataService; restore: RestoreCoordinator;
  longTerm: PlayerLongTermService; importer: DataImportService; video: VideoController; audio: AudioMixer;
  pluginPages?: PageContribution[];
  pluginComponents?: ComponentContribution[];
  pluginPlatforms?: PlatformContribution[];
  pageActions?: { key: string; run(arguments_: Record<string, unknown>): Promise<Result<unknown>> }[];
  styles?: Record<string, string>;
  previewStyleIds?: Id[];
  retryVideo?: () => Promise<Result<unknown>>;
  prepareChoiceAssets?: (assetIds: Id[]) => Promise<void>;
  onSoundEnabled?: () => Promise<Result<unknown>>;
  waitForStage: () => Promise<void>; syncStage: () => Promise<Result<void>>;
  commitSessionStage: (preparedStageId: Id, owner: ExecutionToken, previousSessionId: Id | null) => Result<void>;
  onSessionEnd: (sessionId: Id) => void; onDispose: () => void };
const button = (label: string, action: () => void, disabled = false) => {
  const element = document.createElement('button'); element.textContent = label; element.disabled = disabled;
  element.addEventListener('click', action); return element;
};
const text = (tag: keyof HTMLElementTagNameMap, value: string) => {
  const element = document.createElement(tag); element.textContent = value; return element;
};
const clear = (element: HTMLElement) => element.replaceChildren();
const sameToken = (a: { sessionId: Id; occurrence: number; statementId: Id } | null,
  b: { sessionId: Id; occurrence: number; statementId: Id } | null) =>
  !!a && !!b && a.sessionId === b.sessionId && a.occurrence === b.occurrence && a.statementId === b.statementId;


export class PlayerView {
  readonly navigation = new PageNavigator();
  readonly inputs = new InputRouter();
  private readonly stageRoot: HTMLElement;
  private readonly emergencyCover: EmergencyCover;
  private emergencyRoot: Root | null = null;
  private emergencyComponents: { root: Root; element: HTMLElement }[] = [];
  private emergencyReleases: (() => void)[] = [];
  private emergencyLifetime = new AbortController();
  private inputRelease: () => void = () => {};
  private readonly visualLifetime = new AbortController();
  private readonly canvasRoot = document.createElement('div');
  private readonly content = document.createElement('div');
  private readonly pageBackground = document.createElement('div');
  private readonly message = document.createElement('div');
  private operationMessage = '';
  private operationIssue: Issue | null = null;
  private templateImageIssues: Issue[] = [];
  private stageError: string | null = null;
  private stageIssue:Issue|null=null;
  private readonly portal = document.createElement('div');
  private disposed = false;
  private blurred = false;
  private hidden = false;
  private auto = false;
  private skip = false;
  private toolbarVisible = true;
  private category: 'manual'|'quick'|'auto' = 'manual';
  private ctrlDown = false;
  private ctrlFast = false;
  private skipTimer: ReturnType<typeof setTimeout> | null = null;
  private skipAttempting = false;
  private pluginIdentity = '';
  private pluginEpoch = 0;
  private pluginPageNode: ReactNode = null;
  private settingsVisit: Id | undefined;
  private settingsBackground: string | null = null;
  private saveReceipt = '';
  private pageNumber = 0;
  private selectedSave: Id | null = null;
  private historyNavigationId: Id | null | undefined;
  private historyScrollTop = 0;
  private saving = false;
  private savingTask:Promise<boolean>|null=null;
  private readonly thumbnailUrls = new Set<string>();
  private inputDraft = '';
  private readonly pageLocals = new Map<string, Record<string, Json>>();
  private inputToken = '';
  private retainedPage: { node: ReactNode; page: string; pageId: string; style: string } | null = null;
  private modalLayers: { id: string; page: string; node: ReactNode; element: HTMLElement }[] = [];
  private clearScopes = new Set<'saves'|'longTerm'|'preferences'>();
  private get modalRoot() { return this.modalLayers.at(-1)?.element ?? this.portal; }
  private composing = false;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  private autoReadyKey: string | null = null;
  private autoReadyAt: number | null = null;
  private autoAttempting = false;
  private readonly galleryView = galleryState();
  private gallerySample: string | undefined;
  private readonly transition = new PageTransition();
  private readonly contentTransition = new PageTransition();
  private visualHold: ReturnType<typeof holdPlayerVisual> | null = null;
  private visualHoldUsers = 0;
  private endingTask: Promise<void> | null = null;
  private starting = false;
  private selecting: Id | null = null;
  private startingAfterstory: Id | null = null;
  private warmedChoice: string | null = null;
  private readonly partVisibility=new WeakMap<HTMLElement,boolean>();
  private readonly partAnimations=new WeakMap<HTMLElement,PageTransition>();
  private endingHandled = new Set<string>();
  private endingInFlight = false;
  private introRelease: (() => void) | null = null;
  private introGeneration = 0;
  private auditionId: Id | null = null;
  private importPlan: DataImportPlan | null = null;
  private pluginRoot: Root | null = null;
  private pluginOpenToken: string | null = null;
  private componentRoots: { root: Root; element: HTMLElement }[] = [];
  private pluginRenderController = new AbortController();
  private pluginRenderReleases: (() => void)[] = [];
  private pageRoot: Root | null = null;
  private styleElement = document.createElement('style');
  private renderSequence = 0;
  private visualReset: (()=>void)[] = [];
  private visualEvents = new AbortController();
  private imageReleases: (() => void)[] = [];
  private scrollCleanup: () => void;
  private pendingConfirm: {id:Id;message:string; action?:string; originFocus?:string; confirmation?:keyof PlayerPreferences['confirmations'];remember?:boolean;retry?():void;resolve(value:boolean):void} | null = null;
  private lifecycleRelease: () => void;
  readonly pageAudio: PageAudioController;
  private readonly startup: StartupPresentation;
  private previewDisplay: Project['display'] | null = null;
  private startupMode: 'splash' | 'home' | 'startup' = 'startup';
  private startupStarted = false;
  private startupRevealing = false;
  private startupError: string | null = null;
  private mediaStyle = document.createElement('style');
  private soundButton = document.createElement('button');
  private previewGeneration = 0;
  private fullscreenElapsed=0;
  private fullscreenPending=false;
  constructor(readonly options: PlayerViewOptions) {
    this.pageAudio = new PageAudioController(options.audio, options.snapshot, () => this.render());
    options.entryPresentation?.setSurface(this.canvasRoot);
    options.entryPresentation?.styleParts((part,element)=>this.stylePart('story',part,element));
    options.entryPresentation?.onVisualReady(amount=>{if(!this.visualHold)return;if(amount>=1)this.clearVisualHold();else this.visualHold.element.style.opacity=String(1-amount);});
    this.startup = new StartupPresentation(this.canvasRoot, options.host, options.snapshot, () => {
      if (this.disposed) return;
      if (this.startupMode !== 'splash' && !this.startupRevealing) this.pageAudio.start(this.previewDisplay ?? options.snapshot.project.display);
      else { this.previewDisplay = null; this.startupMode = 'startup'; }
      this.render(); this.content.querySelector<HTMLElement>('[data-focus-key="title.start"]')?.focus();
    }, message => { this.startupError = message; }, () => {
      if (this.disposed || this.startupMode === 'splash' || this.startupRevealing) return;
      this.startupRevealing = true; this.pageAudio.start(this.previewDisplay ?? options.snapshot.project.display); this.render();
    }, () => this.prepareStartupTitle());
    this.stageRoot = options.stageElement;
    this.scrollCleanup = installTransientScrollbars(options.root);
    options.root.classList.add('galcraft-player');
    options.root.dataset.gcPlayer = options.snapshot.template.instanceId;
    options.root.append(this.styleElement);
    this.mediaStyle.textContent = `.galcraft-player .gc-startup{position:absolute;inset:0;z-index:1000;display:grid;place-items:center;overflow:hidden}.galcraft-player .gc-startup-clip{font-family:inherit;font-size:72px;font-weight:600;line-height:1.4;padding:72px;box-sizing:border-box}.galcraft-player .gc-startup img,.galcraft-player .gc-startup video{width:100%;height:100%;position:absolute;inset:0}.galcraft-player .gc-startup button{position:relative;z-index:1}.galcraft-player .gc-startup-skip{position:absolute;right:24px;bottom:24px}.galcraft-player .gc-title-media{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden}.galcraft-player .gc-title-media img,.galcraft-player .gc-title-media video{width:100%;height:100%;position:absolute;inset:0;object-fit:cover}.galcraft-player [data-page="title"]{isolation:isolate}.galcraft-player .gc-music-progress{display:flex;align-items:center;gap:12px}.galcraft-player .gc-music-progress progress{flex:1}`;
    options.root.append(this.mediaStyle);
    this.soundButton.className = 'gc-enable-sound'; this.soundButton.hidden = true;
    Object.assign(this.soundButton.style, { position: 'absolute', top: '16px', right: '16px', zIndex: '100' });
    this.soundButton.addEventListener('click', () => {void this.pageAudio.enableSound().then(async()=>{if(options.onSoundEnabled)this.report(await options.onSoundEnabled());});}); this.canvasRoot.append(this.soundButton);
    this.stageRoot.className = 'gc-stage'; this.content.className = 'gc-content'; this.message.className = 'gc-message';
    this.pageBackground.className = 'gc-page-background';
    this.portal.className = 'gc-content gc-portal';
    this.canvasRoot.className = 'gc-canvas';
    this.canvasRoot.append(this.pageBackground, this.content, this.portal, this.message,options.videoElement);
    options.root.append(this.stageRoot, this.canvasRoot);
    this.navigation.subscribe(() => this.render());
    this.lifecycleRelease = options.host.subscribeLifecycle(event => {
      if (event.type === 'closeRequested') void this.exit();
      if (event.type === 'blur') { this.blurred = true; this.loseInputFocus();
        this.options.stage.pause(!this.storyActive); this.options.audio.setPause('focus', this.preferences().pauseOnBlur); this.render(); }
      if (event.type === 'focus') { this.blurred = false; this.options.stage.pause(!this.storyActive);
        this.options.audio.setPause('focus', false); this.render(); }
    });
    this.emergencyCover = new EmergencyCover(options.root);
    window.addEventListener('keydown', event => {
      if (!this.options.data.current() || !document.hasFocus() || !(options.root.contains(document.activeElement) || this.options.data.domain.kind === 'player')) return;
      const shortcut = this.preferences().emergencyKey ?? this.options.snapshot.project.player.emergencyKey ?? 'F8';
      if (event.code === shortcut && !event.altKey && !event.ctrlKey && !event.metaKey || this.emergencyCover?.active && event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!event.repeat) this.setEmergency(!this.emergencyCover?.active);
        return;
      }
      if (this.emergencyCover?.active && event.key === 'Tab') {
        const controls = [...this.emergencyCover.canvas.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(element => !element.hidden && element.getClientRects().length);
        const index = controls.indexOf(document.activeElement as HTMLElement);
        if (!controls.length || index < 0 || event.shiftKey && index === 0 || !event.shiftKey && index === controls.length - 1) { event.preventDefault(); (controls[event.shiftKey ? controls.length - 1 : 0] ?? this.emergencyCover.element).focus(); }
      }
    }, { capture: true, signal: this.visualLifetime.signal });
    this.inputRelease = options.host.subscribeInput(input => {
      if (input.phase !== 'down' || !document.hasFocus() || !(options.root.contains(document.activeElement) || this.options.data.domain.kind === 'player')) return;
      if (input.action === 'emergency') this.setEmergency(!this.emergencyCover?.active);
      else if (this.emergencyCover?.active && input.action === 'back') this.setEmergency(false);
    });
    options.root.addEventListener('keydown', event => this.keydown(event), {signal:this.visualLifetime.signal});
    window.addEventListener('keyup', event => { if(event.key === 'Control') { this.ctrlDown=false; this.ctrlFast=false; this.render(); } }, {signal:this.visualLifetime.signal});
    window.addEventListener('blur', () => { this.loseInputFocus(); this.render(); }, {signal:this.visualLifetime.signal});
    options.root.addEventListener('dragstart', event => { if(!(event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))) event.preventDefault(); }, {signal:this.visualLifetime.signal});
    options.root.addEventListener('wheel', event => this.wheel(event), { passive: false });
    document.fonts.addEventListener('loadingdone', () => {
      if (this.navigation.page === 'story' && this.options.session.inspect()?.state.presentation.text.reading?.mode === 'nvl') this.render();
    }, { signal: this.visualEvents.signal });
    options.root.tabIndex = 0;
    options.root.addEventListener('pointerup', event => {
      if(this.emergencyCover?.active||event.button!==0||this.visualHold||this.navigation.page!=='story'||this.startup.active||this.options.entryPresentation?.active||this.options.video.state==='playing')return;
      if(event.target instanceof Element&&event.target.closest('.gc-toolbar,button,a,input,textarea,select,summary,video,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="slider"],[data-gc-plugin-component]'))return;
      const bounds=this.canvasRoot.getBoundingClientRect();
      if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)return;
      if(event.pointerType==='touch'&&!this.preferences().toolbarLocked&&!this.toolbarVisible){this.toolbarVisible=true;this.render();return;}
      void this.advance();
    }, {signal:this.visualLifetime.signal});
    options.root.addEventListener('contextmenu', event => {
      if (this.emergencyCover?.active) { event.preventDefault(); return; }
      const bounds=this.canvasRoot.getBoundingClientRect();
      if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom){event.preventDefault();return;}
      if(this.options.entryPresentation?.active){event.preventDefault();this.options.entryPresentation.skip();return;}
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
      event.preventDefault();
      if (this.preferences().rightButton !== 'escape') return;
      if (['confirm','error','dataImport','dataClear'].includes(this.navigation.page)) { this.back(); return; }
      if (['playing', 'loading', 'error'].includes(this.options.video.state)) {
        if (this.preferences().movieSkip) this.options.video.input('mouseRight'); return;
      }
      if (this.navigation.page === 'story') this.hidden = !this.hidden;
      else this.back(); this.render();
    });
  }
  previewPageAnimation(direction:'enter'|'exit'|'roundtrip') { const play=async()=>{if(direction!=='enter')await this.transition.play(this.content,this.pageAnimation('exit'),this.preferences().reducedMotion);if(direction!=='exit')await this.transition.play(this.content,this.pageAnimation('enter'),this.preferences().reducedMotion);};return play(); }
  configureGallerySample(sample:string) { if(this.options.data.domain.kind!=='sample')return;
    this.gallerySample=sample;
    if(sample==='viewer'){const entry=this.options.snapshot.gallery.find(entry=>entry.kind==='cg');this.galleryView.viewer=entry?.id??null;}
    this.render();
  }
  get playTimeActive(): boolean { return !this.emergencyCover?.active && !this.disposed && !this.startup.active && !this.transition.busy && ['story','choice','input'].includes(this.navigation.page) && !this.blurred && document.visibilityState==='visible' && this.options.session.inspect()?.status!=='paused'; }
  private pageAnimation(direction:'enter'|'exit') {const root=this.options.snapshot.template.pages.find(page=>page.key===this.navigation.page)?.root;return this.options.snapshot.template.animations.find(animation=>animation.id===root?.animations[direction]);}
  private canOpen(page:string) {
    if (page === 'characters') return this.options.data.domain.kind === 'sample' || afterstoryDirectoryUnlocked(this.options.snapshot, this.options.data.current()!.longTerm.endings);
    return !['cg','music'].includes(page)||this.options.snapshot.template.pages.some(item=>item.key===page)&&this.options.data.current()!.longTerm.endings.some(ending=>ending.trim());
  }
  private holdVisual() {
    if (!this.canvasRoot?.isConnected) return () => {};
    if (!this.visualHold) this.visualHold = holdPlayerVisual(this.canvasRoot, this.options.stage.captureFrame());
    const held=this.visualHold;
    this.visualHoldUsers++; this.content.inert = true; this.portal.inert = true;
    let released = false;
    return () => {
      if (released) return; released = true;
      if(this.visualHold!==held)return;
      if (--this.visualHoldUsers > 0) return;
      this.visualHold?.release(); this.visualHold = null; this.visualHoldUsers = 0;
      this.content.inert = this.startup.active || this.transition.busy || ['confirm','error','dataImport','dataClear'].includes(this.navigation.page);
      this.portal.inert = this.startup.active || this.transition.busy;
    };
  }
  private clearVisualHold() {this.visualHold?.release();this.visualHold=null;this.visualHoldUsers=0;this.content.inert=this.startup.active||this.transition.busy||['confirm','error','dataImport','dataClear'].includes(this.navigation.page);this.portal.inert=this.startup.active||this.transition.busy;}
  holdVideoPresentation() {return this.holdVisual();}
  private async waitForTargetPresentation() {
    if (!this.canvasRoot?.isConnected) return;
    await this.options.waitForStage();
    await document.fonts.ready;
    await waitForPresentedMedia([this.pageBackground, this.content, ...(!this.options.videoElement.hidden ? [this.options.videoElement] : [])], this.visualLifetime.signal);
  }
  async completeVideoPresentation() {
    if (this.endingTask) await this.endingTask;
    else await this.waitForTargetPresentation();
  }
  private async presentGalleryChange(change:()=>void) {
    if(this.visualHold||this.transition.busy)return;
    const release=this.holdVisual();
    try {change();await this.waitForTargetPresentation();}
    catch(error){if(!this.disposed)this.showError(issueFromError(error,'M07'));}
    finally {release();if(!this.disposed){this.render();
      const viewer=this.content.querySelector<HTMLElement>('.gc-gallery-viewer[role="dialog"]:not([hidden])');
      if(viewer&&!viewer.contains(document.activeElement))viewer.querySelector<HTMLElement>('button:not(:disabled),[tabindex="0"]')?.focus({preventScroll:true});
    }}
  }
  private async animateNavigation(change:()=>void,duration?:number) {
    if(this.transition.busy)return false;
    this.stopModes(); this.options.stage.pause(true); this.transition.busy=true;
    const release=this.holdVisual();
    const fallback=(opacity:number)=>({id:'',name:'',version:1 as const,reduced:'finish' as const,segments:[{durationMs:0,opacity:1-opacity,easing:{family:'linear' as const,direction:'in' as const}},{durationMs:duration??120,opacity,easing:{family:'linear' as const,direction:'in' as const}}]});
    const exit=duration===undefined?this.pageAnimation('exit'):fallback(0);
    try {
      change(); await this.waitForTargetPresentation();
      if(this.disposed)return false;
      const enter=duration===undefined?this.pageAnimation('enter'):fallback(1),reduced=this.preferences().reducedMotion,ms=duration===undefined?undefined:duration/2;
      await Promise.all([
        ...(this.visualHold?[this.transition.play(this.visualHold.element,exit,reduced,ms,1,true)]:[]),
        this.transition.play(this.pageBackground,enter,reduced,ms,1,true),
        this.transition.play(this.content,enter,reduced,ms,1,true),
      ]);
      return !this.disposed;
    } catch(error) { if(!this.disposed)this.showError(issueFromError(error,'M07'));return false; }
    finally {
      release();this.transition.cancel();
      if(!this.disposed){this.render();this.content.inert=this.startup.active||['confirm','error','dataImport','dataClear'].includes(this.navigation.page);
        if(['input','choice'].includes(this.navigation.page)&&!this.content.contains(document.activeElement))this.content.querySelector<HTMLElement>('input:not(:disabled),button:not(:disabled)')?.focus({preventScroll:true});
        else if(!this.options.root.contains(document.activeElement))this.options.root.focus({preventScroll:true});}
    }
  }
  private handleEnding(): boolean {
    if(this.starting)return false;
    if(this.endingInFlight)return true;
    const inspection=this.options.session.inspect();if(!inspection||inspection.pendingLongTerm)return false;
    const ending=[...inspection.trace].reverse().find(trace=>this.options.snapshot.scenes.flatMap(scene=>scene.instructions).some(instruction=>instruction.statementId===trace.token.statementId&&instruction.opcode==='end'));
    if(!ending){if(inspection.status==='ended'){void this.returnTitle(false);return true;}return false;}const key=JSON.stringify(ending.token);if(this.endingHandled.has(key))return false;
    if(this.transition.busy)return true;
    this.endingHandled.add(key);this.endingInFlight=true;
    const instruction=this.options.snapshot.scenes.flatMap(scene=>scene.instructions).find(item=>item.statementId===ending.token.statementId)!;
    const args=instruction.args as {durationMs?:number;target?:{kind:string;pageId?:string}};
    if(args.target?.kind==='scene'){
      void this.animateNavigation(()=>{this.endingInFlight=false;this.render();},args.durationMs??300).finally(()=>{this.endingInFlight=false;});return true;
    }
    const cover=document.createElement('div');cover.className='gc-ending-cover';
    const duration=this.preferences().reducedMotion?Math.min(args.durationMs??300,80):args.durationMs??300;
    const fade=async(from:number,to:number)=>{cover.style.opacity=String(to);if(!duration||!cover.animate)return;const animation=cover.animate([{opacity:from},{opacity:to}],{duration:duration/2,fill:'both'});try{await animation.finished;}finally{animation.cancel();}};
    this.endingTask=(async()=>{
      this.stopModes();this.options.stage.pause(true);this.options.root.inert=true;
      try{
        if(this.disposed)return;
        this.options.root.append(cover);await fade(0,1);this.clearVisualHold();
        const afterstory=inspection.state.story?.kind==='afterstory'||this.flowSources.length>0;
        this.endingInFlight=false;
        await this.returnTitle(false);
        if(!afterstory){const target=args.target?.kind==='page'?this.options.snapshot.template.pages.find(page=>page.id===args.target!.pageId):null;
          if(target&&this.canOpen(target.key)&&!['story','choice','input','save','videoError'].includes(target.key))this.navigation.open(target.key);
          else if(args.target?.kind==='page')this.showError(this.t('结束目标不可用，已返回标题','Ending destination unavailable; returned to title','終了先を利用できないためタイトルに戻りました'));}
        this.endingInFlight=false;this.render();
        await this.waitForTargetPresentation();await fade(1,0);
      }catch(error){this.endingInFlight=false;this.showError(issueFromError(error,'M07'));await this.returnTitle(false);this.render();}
      finally{cover.remove();this.emergencyCover.setRootInert(false);this.endingInFlight=false;this.endingTask=null;}
    })();return true;
  }
  get stageElement(): HTMLElement { return this.stageRoot; }
  get isDisposed(): boolean { return this.disposed; }
  get storyActive(): boolean { return !this.emergencyCover?.active && !this.disposed && !this.startup.active && !this.transition.busy && this.navigation.page === 'story' &&
    !this.options.entryPresentation?.active &&
    this.options.session.inspect()?.status !== 'paused' && (!this.blurred || !this.preferences().pauseOnBlur); }
  private get uiScale() { return Math.min(this.options.root.clientWidth / this.options.snapshot.project.canvas.width, this.options.root.clientHeight / this.options.snapshot.project.canvas.height); }
  private mountPage(node: ReactNode, authored = false) {
    authored = authored || React.isValidElement<{compose?:unknown}>(node) && (!!node.props.compose || node.type === ComponentInstances);
    this.content.style.padding=authored?'0px':'';
    this.pageRoot ??= createRoot(this.content);
    const page=this.navigation.page, config=this.options.snapshot.template.pages.find(p=>p.key===page);
    const content=<React.Fragment key={page}>{!authored&&!(React.isValidElement(node)&&node.type===ComponentInstances)&&!['title','flow','story','choice','input','cg','music'].includes(page) && this.visible(page, `${page}.header`) && <h1 ref={this.partRef(page,`${page}.header`)}>{this.locale(`page.${page}`)}</h1>}{node}</React.Fragment>;
    const body=!authored&&['dataImport','dataClear'].includes(page)?<section className="gc-confirm-panel gc-data-panel" role="dialog" aria-modal="true" aria-label={this.locale(`page.${page}`)}>{content}</section>:content;
    const modal=['confirm','error','dataImport','dataClear'].includes(page), retained=this.retainedPage;
    if(modal){
      const id=this.navigation.source()?.id??page;
      let layer=this.modalLayers.find(item=>item.id===id);
      if(!layer){
        const element=this.modalLayers.length?document.createElement('div'):this.portal;
        element.className='gc-content gc-portal gc-modal-layer';
        if(element!==this.portal)this.canvasRoot.append(element);
        layer={id,page,node:body,element};this.modalLayers.push(layer);
      }
      layer.node=body;
      const element=layer.element;
      element.id=config?.portalRootId??'';element.dataset.gcPortal=config?.portalRootId??'';
      element.dataset.page=page;element.dataset.gcPage=page;element.dataset.gcPageId=config?.id??'';
      element.dataset.modal='true';element.style.cssText=this.content.style.cssText;
    }else{
      for(const layer of this.modalLayers)if(layer.element!==this.portal)layer.element.remove();
      this.modalLayers=[];this.portal.className='gc-content gc-portal';this.portal.dataset.page=page;this.portal.dataset.modal='false';this.portal.style.background='transparent';
    }
    const backgroundPage = modal && retained ? retained.page : page;
    const backgroundConfig = this.options.snapshot.template.pages.find(item => item.key === backgroundPage);
    this.content.inert=modal||this.transition.busy||!!this.visualHold;
    for(const node of [this.stageRoot,this.soundButton,this.message])node.inert=modal;
    for(const layer of this.modalLayers)layer.element.inert=layer.element!==this.modalRoot||this.transition.busy;
    if(modal)queueMicrotask(()=>{const root=this.modalRoot;if(!root.contains(document.activeElement))root.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex]')?.focus();});
    if(modal&&retained){
      const {left,top,width,height}=this.content.style;
      this.content.style.cssText=retained.style; Object.assign(this.content.style,{left,top,width,height});
      this.content.dataset.page=retained.page;this.content.dataset.gcPage=retained.page;this.content.dataset.gcPageId=retained.pageId;
    }else if(!modal)this.retainedPage={node:body,page,pageId:config?.id??'',style:this.content.style.cssText};
    flushSync(()=>this.pageRoot!.render(<>
      {createPortal(<PageBackground host={this.options.host} snapshot={this.options.snapshot} page={backgroundConfig} opacity={backgroundPage === 'history' ? this.preferences().historyOpacity : undefined}/>, this.pageBackground)}
      {modal ? retained?.node : body}
      {this.modalLayers.map(layer=>createPortal(<><PageBackground host={this.options.host} snapshot={this.options.snapshot} page={this.options.snapshot.template.pages.find(item=>item.key===layer.page)}/>{layer.node}</>,layer.element,layer.id))}
      <TemplateImages root={this.options.root} host={this.options.host} part={(key,element)=>{const owner=element.closest<HTMLElement>('[data-gc-page]')?.dataset.gcPage??page;return element.dataset.gcComponent?this.componentById(owner,element.dataset.gcComponent):this.part(owner,key);}} onIssues={issues=>this.setTemplateImageIssues(issues)} scale={1} sequence={this.renderSequence}/></>));
  }
  private partRef(page: string, key: string, position = false) { return Object.assign((node: HTMLElement | null) => { if (node) {this.stylePart(page, key, node, position);if(node.matches("button,input,select,textarea,summary,[tabindex]")&&!node.dataset.focusKey)node.dataset.focusKey=`${page}:${key}`;} },{gcPart:key}); }
  private preferences(): PlayerPreferences { return this.options.data.current()!.preferences; }
  private t(zh:string,en:string,ja:string) { return this.preferences().menuLocale==='en'?en:this.preferences().menuLocale==='ja'?ja:zh; }
  private locale(key: string): string { const template = this.options.snapshot.template;
    const locale = this.preferences().menuLocale;
    return template.locales[locale]?.[key] ?? defaultLocales[locale as keyof typeof defaultLocales]?.strings[key] ?? template.locales['zh-CN']?.[key] ?? key; }
  private report(result: Result<unknown>) { this.showError(result.ok?'':result.error); }
  private setTemplateImageIssues(issues:Issue[]) { this.templateImageIssues=issues;this.renderMessage(); }
  observe(request: PlayerObservationRequest): PlayerObservationResult {
    if (this.options.data.domain.kind === 'player') return { status: 'privateDomain' as const, variables: [], properties: [] };
    const profile = this.options.data.current();
    if (!profile) return { status: 'notReady' as const, variables: [], properties: [] };
    const matches = (element: HTMLElement, property: string) => {
      let found = false;
      const visit = (rules: CSSRuleList) => { for (const rule of rules) {
        if (rule instanceof CSSStyleRule) { try { if (rule.style.getPropertyValue(property) && element.matches(rule.selectorText)) found = true; } catch {} }
        else if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
      } };
      if (this.styleElement.sheet) visit(this.styleElement.sheet.cssRules);
      return found;
    };
    return { status: 'available' as const, variables: observeVariables(this.options.snapshot, this.options.session.inspect()?.state, profile.longTerm, request.variables ?? []), properties: observeProperties(this.options.root, this.options.snapshot, request.properties ?? [], matches) };
  }
  inspectDiagnostics(): Issue[] { return [this.operationIssue,this.stageIssue,...this.templateImageIssues].filter((issue):issue is Issue=>!!issue); }
  private portraitError:string|null=null;
  private retryingRecords=false;
  private renderMessage() {
    const operation=this.navigation.page==='input'&&!this.operationIssue?'':this.operationMessage;
    const message=[...new Set([operation,this.stageError,this.portraitError,...this.templateImageIssues.map(issue=>localizeIssue(issue,this.preferences().menuLocale))].filter(Boolean))].join('\n');
    if(!this.options.session.inspect()?.pendingLongTerm){
      const issues=this.inspectDiagnostics();
      if(issues.length){const detail=issues.map(issue=>issueDetails(issue)).join('\n\n');if(typeof this.message.replaceChildren==='function'){
        let details=this.message.querySelector<HTMLDetailsElement>('details[data-gc-diagnostic]');
        if(!details){details=document.createElement('details');details.dataset.gcDiagnostic='';details.append(text('summary',''),text('pre',''));this.message.replaceChildren(text('span',''),details);}
        this.message.firstElementChild!.textContent=message;details.querySelector('summary')!.textContent=this.t('诊断详情','Diagnostic details','診断の詳細');details.querySelector('pre')!.textContent=detail;
      }else this.message.textContent=`${message}\n${detail}`;}
      else this.message.textContent=message;return;
    }
    const retry=button(this.locale('action.retry'),()=>{if(this.retryingRecords)return;this.retryingRecords=true;retry.disabled=true;void this.options.session.retryLongTerm().then(async result=>{this.report(result);if(result.ok&&result.value.state.phase==='entry')this.report(await this.options.session.start());}).finally(()=>{this.retryingRecords=false;this.render();});},this.retryingRecords);
    const detail=document.createElement('details');detail.append(text('summary',this.t('详情','Details','詳細')),text('p',message));
    this.message.replaceChildren(text('span',this.t('阅读记录未保存。修复存储位置后重试。','Reading records could not be saved. Repair storage, then retry.','読書記録を保存できません。保存先を修復して再試行してください。')),retry,detail);
  }
  showError(message: string|Issue) { this.operationIssue=typeof message==='string'?null:message;this.operationMessage = typeof message==='string'?message:localizeIssue(message,this.preferences().menuLocale);this.renderMessage(); }
  /** Only a replacement stage or the end of its session resolves a visual failure. */
  setStageError(message: string | Issue | null) { this.stageIssue=typeof message==='object'?message:null;this.stageError = typeof message==='string'||message===null?message:localizeIssue(message,this.preferences().menuLocale);this.renderMessage(); }
  async start() { const opened = await this.options.data.open(); this.report(opened); if (!opened.ok) return;
    this.render();
    if (!this.startupStarted && this.options.data.domain.kind === 'player') {
      this.startupStarted = true; const pending = this.startup.play(this.options.snapshot.project.display, this.preferences().reducedMotion, this.preferences().menuLocale); this.render(); await pending; this.render();
    }
  }
  private async prepareStartupTitle() {
    // Allow the title underneath the opening layer to request its authored fonts and images first.
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const display=this.previewDisplay??this.options.snapshot.project.display;
    const page=this.options.snapshot.template.pages.find(page=>page.key==='title');
    const images=new Set<Id>();
    if(display.titleBackground)images.add(display.titleBackground);
    if(page?.background.imageId)images.add(page.background.imageId);
    const visit=(component:ComponentConfig)=>{if(!component.visible)return;for(const binding of Object.values(component.normal.images??{}))if(binding)images.add(binding.assetId);component.children.forEach(visit);};
    if(page)visit(page.root);
    const videoReady=async()=>{if(!display.titleVideo)return;const asset=this.options.snapshot.assets.find(asset=>asset.assetId===display.titleVideo);if(!asset)throw new Error('主页视频素材不可用');
      const result=await this.options.host.resources.resolve(asset.assetId,asset.variantId);if(!result.ok)throw new Error(result.error.message);
      const video=document.createElement('video');try{video.preload='auto';await new Promise<void>((resolve,reject)=>{video.onloadeddata=()=>resolve();video.onerror=()=>reject(new Error('主页视频读取失败'));video.src=result.value.uri;video.load();});}finally{video.removeAttribute('src');video.load();result.value.release();}};
    await Promise.all([document.fonts.ready,videoReady(),...[...images].map(async id=>{
      const asset=this.options.snapshot.assets.find(asset=>asset.assetId===id);if(!asset)throw new Error(this.t('标题页图片不可用','Title image unavailable','タイトル画像を利用できません'));
      const result=await this.options.host.resources.resolve(asset.assetId,asset.variantId);if(!result.ok)throw new Error(result.error.message);
      try{const image=new Image();image.src=result.value.uri;await image.decode();}finally{result.value.release();}
    })]);
  }
  /** Explicit editor preview. It uses the shell only and never creates or advances a story session. */
  async previewStartup(kind: 'splash' | 'home' | 'startup', display: Project['display'] = this.options.snapshot.project.display): Promise<void> {
    if (this.options.session.inspect()) {
      if (this.options.data.domain.kind === 'player') { this.showError('请在独立页面预览中播放启动媒体'); return; }
      if (!await this.returnTitle(false)) return;
    }
    this.stopStartupPreview(); this.previewDisplay = structuredClone(display); this.startupMode = kind;
    this.startupError = null; this.startupRevealing = false;
    const generation = ++this.previewGeneration;
    this.navigation.replace('title');
    const enabled = this.options.audio.enableSound();
    if (kind === 'home') { this.pageAudio.start(this.previewDisplay); this.render(); await enabled; }
    else { const pending = this.startup.play(this.previewDisplay, this.preferences().reducedMotion, this.preferences().menuLocale); this.render(); await Promise.all([enabled,pending]); }
    if (!this.disposed && generation === this.previewGeneration) this.render();
  }
  stopStartupPreview() { this.previewGeneration++; this.startup.stop(); this.pageAudio.stop(); this.previewDisplay = null; this.startupMode = 'startup'; this.render(); }
  updateMediaFrame(deltaMs: number) {
    if (this.disposed) return;
    const globalPaused = this.emergencyCover?.active || this.options.session.inspect()?.status === 'paused' || this.blurred && this.preferences().pauseOnBlur;
    this.startup.setPaused(globalPaused); this.startup.setVideoVolume(this.preferences().volumes.master * this.preferences().volumes.video / 10000);
    this.options.entryPresentation?.setPreferences(globalPaused,this.preferences().reducedMotion,this.preferences().chapterNotice);
    this.options.entryPresentation?.tick(deltaMs);
    this.startup.tick(deltaMs); this.pageAudio.tick();
    this.fullscreenElapsed+=deltaMs;
    if(this.fullscreenElapsed>=500&&!this.fullscreenPending&&this.options.data.domain.kind==='player'){
      this.fullscreenElapsed=0;this.fullscreenPending=true;
      void this.options.host.platform('window.fullscreen',{}).then(async result=>{if(!result.ok||this.disposed)return;const enabled=!!(result.value as {enabled?:boolean}).enabled;const current=this.preferences();if(current.fullscreen!==enabled){const saved=await this.options.data.savePreferences({...current,fullscreen:enabled},current.revision);if(saved.ok)this.render();}}).finally(()=>{this.fullscreenPending=false;});
    }
    const current = this.pageAudio.auditionInspection();
    if (current?.ok) {
      const progress = this.content.querySelector<HTMLInputElement>('.gc-music-seek');
      if (progress) { progress.max = String(current.value.durationSec); progress.value = String(current.value.positionSec); }
      const position = this.content.querySelector<HTMLElement>('.gc-music-position');
      if (position) position.textContent = `${formatTime(current.value.positionSec)} / ${formatTime(current.value.durationSec)}`;
    }
  }
  private keydown(event: KeyboardEvent) {
    if (this.emergencyCover?.active) return;
    if(!!this.selecting||this.visualHold&&!this.options.entryPresentation?.active&&!['playing','loading','error'].includes(this.options.video.state)){event.preventDefault();return;}
    if (event.isComposing || this.composing || event.target instanceof HTMLElement && (event.target.isContentEditable || !!event.target.closest('input,textarea,select,[contenteditable=true],[contenteditable=""],[role=textbox]'))) return;
    if (event.key === 'Control' && !event.repeat && !this.ctrlDown && this.storyActive) { this.ctrlDown=true; this.ctrlFast=true; this.auto=false; event.preventDefault(); this.render(); return; }
    if(this.options.entryPresentation?.keydown(event))return;
    if (this.startup.keydown(event)) return;
    if(event.key==='Tab'&&['confirm','error','dataImport','dataClear','input'].includes(this.navigation.page)){
      const boundary=this.navigation.page==='input'?this.content:this.modalRoot;
      const controls=[...boundary.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(element=>!element.hidden&&element.getClientRects().length);
      const index=controls.indexOf(document.activeElement as HTMLElement);
      if(controls.length&&(index<0||event.shiftKey&&index===0||!event.shiftKey&&index===controls.length-1)){event.preventDefault();controls[event.shiftKey?controls.length-1:0]?.focus();return;}
    }
    if (this.navigation.page === 'choice' && !event.isComposing && !this.composing &&
      (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      const choices = [...this.content.querySelectorAll<HTMLButtonElement>('.gc-choice-list button:not(:disabled)')];
      if (choices.length) { const current = choices.indexOf(document.activeElement as HTMLButtonElement);
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const next = current < 0 ? direction === 1 ? 0 : choices.length - 1 :
          (current + direction + choices.length) % choices.length;
        choices[next]!.focus();
        event.preventDefault(); event.stopPropagation(); }
      return;
    }
    if (event.key === 'Escape' && !event.isComposing && !this.composing &&
      this.navigation.page !== 'story' && !['playing', 'loading', 'fading'].includes(this.options.video.state)) {
      event.preventDefault(); event.stopPropagation(); this.back(); return;
    }
    if (event.isComposing || this.composing || event.target instanceof HTMLElement &&
      event.target.closest('button,a,[role="button"]') || event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    const action = this.inputs.route({ kind: 'keyboard', key: event.key, button: null, deltaY: 0,
      composing: event.isComposing, repeat: event.repeat, target: 'stage', origin: 'physical', eventId: createId() },
      this.inputState());
    if (!action) return;
    event.preventDefault(); event.stopPropagation(); this.applyInputAction(action);
  }
  private inputState() { return { page: this.navigation.page, modal: ['confirm','error','input','dataImport','dataClear'].includes(this.navigation.page),
      video: ['playing', 'loading', 'error'].includes(this.options.video.state),
      fading: this.options.video.state === 'fading',
      hiddenUI: this.hidden, emergency: this.emergencyCover?.active,
      movieSkip: this.preferences().movieSkip, rightButton: this.preferences().rightButton,
      wheelUp: this.preferences().wheelUp, wheelDown: this.preferences().wheelDown }; }
  private wheel(event: WheelEvent) {
    if (this.emergencyCover?.active) { event.preventDefault(); return; }
    if(this.visualHold||!!this.selecting){event.preventDefault();return;}
    const bounds=this.canvasRoot.getBoundingClientRect();
    if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)return;
    if(this.options.entryPresentation?.active){event.preventDefault();return;}
    if (this.navigation.page === 'history') {
      const list=this.content.querySelector<HTMLElement>('.gc-history-list');
      if (list && event.deltaY>0 && list.scrollTop+list.clientHeight>=list.scrollHeight-2) { event.preventDefault(); event.stopPropagation(); this.back(); }
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest('.gc-body') && !event.target.closest('.gc-nvl')) return;
    const target = event.target instanceof HTMLElement && event.target.closest('button,input,select,textarea,nav') ? 'control' : 'stage';
    const action = this.inputs.route({ kind: 'wheel', key: null, button: null, deltaY: event.deltaY,
      composing: false, repeat: false, target, origin: 'physical', eventId: createId() }, this.inputState());
    if (!action) return;
    event.preventDefault(); event.stopPropagation(); this.applyInputAction(action);
  }
  private applyInputAction(action: InputAction) {
    if (action === 'videoSkip') this.options.video.input('physicalEsc');
    if (action === 'advance') void this.advance();
    if (action === 'back') this.back();
    if (action === 'toggleUI' || action === 'restoreUI') { this.hidden = !this.hidden; this.render(); }
    if (action === 'history') this.open('history');
    if (action === 'emergencyRestore') this.back();
  }
  private back() {
    if (this.emergencyCover?.active) { this.setEmergency(false); return; }
    if(this.transition.busy||this.visualHold||!!this.selecting)return;
    if(['confirm','error','dataImport','dataClear'].includes(this.navigation.page)){void this.transition.navigate(this.modalRoot,this.pageAnimation('exit'),()=>this.backImmediate(),()=>undefined,this.preferences().reducedMotion).then(()=>this.render());return;}
    if(document.fullscreenElement?.tagName==='VIDEO'){void document.exitFullscreen();return;}
    if(['cg','music'].includes(this.navigation.page)&&this.galleryView.viewer){this.galleryView.viewer=null;this.render();const id=this.galleryView.selected[this.galleryView.type];this.options.root.querySelector<HTMLElement>(`[data-gallery-id="${id}"]`)?.focus();return;}
    void this.animateNavigation(()=>this.backImmediate());
  }
  private backImmediate() {
    const inspection = this.options.session.inspect(), waiting = inspection?.state.wait;
    if (waiting?.kind === 'plugin' && waiting.page === this.navigation.page && inspection?.token && this.options.pluginPages?.find(item => item.key === waiting.page)?.wait?.cancel === 'continue') {
      void this.options.syncStage().then(synced => synced.ok ? this.options.session.dispatch({kind:'cancel',token:inspection.token!}) : synced).then(result => { this.report(result); if (result.ok) this.showStory(); }); return;
    }
    if(this.navigation.page==='dataImport'&&this.importPlan){this.options.importer.discardDataImport(this.importPlan.id);this.importPlan=null;} if(this.navigation.page==='input'){void this.cancelInput();return;} const pending = this.pendingConfirm; this.pendingConfirm = null; pending?.resolve(false);
    const layer=this.modalLayers?.pop();
    const frame = this.navigation.back();
    if(layer&&layer.element!==this.portal)layer.element.remove();
    if (this.navigation.page === 'story') {
    this.options.stage.pause(!this.storyActive); this.options.audio.setPause('systemPage', false); }
    if (this.auditionId) { this.options.audio.stop(this.auditionId); this.auditionId = null; }
    if (frame) requestAnimationFrame(() => {
      if (this.navigation.page !== frame.originPage) return;
      this.content.scrollTop = frame.originScroll;
      const target = frame.originFocus ? this.options.root.querySelector<HTMLElement>(
        `[data-focus-key="${CSS.escape(frame.originFocus)}"]`) : null;
      (target ?? this.options.root).focus({ preventScroll: true });
    }); }
  private open(page: string) { if(page==='emergency'){this.setEmergency(true);return;}if(this.emergencyCover?.active)return;if(this.transition.busy||this.visualHold||!!this.selecting)return;if(!this.canOpen(page)){this.showError(this.t('完成任意一条路线后开放','Complete any route to unlock','いずれかのルートを完了すると解放されます'));return;} if(['confirm','error','dataImport','dataClear'].includes(page)){this.openImmediate(page);void this.transition.play(this.modalRoot,this.pageAnimation('enter'),this.preferences().reducedMotion);return;} void this.animateNavigation(()=>this.openImmediate(page)); }
  private openImmediate(page:string) { this.stopModes();
    if(page==='dataClear')this.clearScopes.clear();
    if (page !== 'story') { this.options.stage.pause(true); this.options.audio.setPause('systemPage', true); }
    this.navigation.open(page, { focusKey: this.pendingConfirm?.originFocus ?? (document.activeElement as HTMLElement | null)?.dataset.focusKey ?? '',
      scroll: this.content.scrollTop, sessionId: this.options.session.inspect()?.sessionId ?? null }); }
  private showStory() {
    if (this.options.video.state === 'error') { this.navigation.replace('videoError'); return; }
    this.options.stage.pause(false); this.options.audio.setPause('systemPage', false);
    this.navigation.replace('story', this.options.session.inspect()?.sessionId ?? null); this.options.stage.pause(!this.storyActive); this.render(); if(this.navigation.page==='story')this.options.root.focus({preventScroll:true}); }
  private action(label: string, run: () => void, disabled = false, focusKey = label) {
    const control = button(label, run, disabled); control.dataset.focusKey = focusKey; return control;
  }
  private part(page: string, key: string): ComponentConfig | null {
    const config = this.options.snapshot.template.pages.find(item => item.key === page);
    if (!config) return null;
    const visit = (component: ComponentConfig): ComponentConfig | null => component.part === key ? component :
      component.children.map(visit).find(item => item !== null) ?? null;
    return visit(config.root);
  }
  private componentById(page: string, id: string): ComponentConfig | null {
    const root = this.options.snapshot.template.pages.find(item => item.key === page)?.root;
    const visit = (component: ComponentConfig): ComponentConfig | null => component.id === id ? component : component.children.map(visit).find(Boolean) ?? null;
    return root ? visit(root) : null;
  }
  private instanceContext(page: string): UIValueContext {
    const config = this.options.snapshot.template.pages.find(item => item.key === page), key = `${this.navigation.visitId}/${page}`;
    let local = this.pageLocals.get(key); if (!local) { local = structuredClone(config?.localState ?? {}); this.pageLocals.set(key, local); }
    const inspection = this.options.session.inspect(), snapshot = this.options.snapshot, profile = this.options.data.current()!;
    const choices = inspection?.state.wait?.kind === 'choice' ? (() => { const wait = inspection.state.wait; if (wait?.kind !== 'choice') return []; const instruction = snapshot.scenes.flatMap(scene => scene.instructions).find(item => item.statementId === inspection.token?.statementId); const options = (instruction?.args as { options?: { id: Id; text?: string; label?: string; lockedReason?: string }[] })?.options ?? []; return options.filter(option => (wait.visibleOptionIds ?? wait.optionIds).includes(option.id)).map(option => ({ id: option.id, text: option.text ?? option.label ?? option.id, lockedReason: option.lockedReason ?? '', disabled: !wait.optionIds.includes(option.id) })); })() : [];
    return { local, variables: playerVariableValues(snapshot, inspection?.state, profile.longTerm), instance: key, data: { project: { name: snapshot.project.name, description: snapshot.project.description, canvas: snapshot.project.canvas }, preferences: profile.preferences,confirmation:this.pendingConfirm?{requestId:this.pendingConfirm.id,message:this.pendingConfirm.message,remember:this.pendingConfirm.remember??false}:null,
      characters: snapshot.characters.map(character => ({ id: character.id, name: character.name, description: character.description ?? '' })),
      gallery: snapshot.gallery.map(entry => ({ id: entry.id, name: entry.name, kind: entry.kind, series: entry.series, locked: entry.kind === 'cg' ? !(profile.longTerm.cg[entry.id]?.length) : !profile.longTerm[entry.kind].includes(entry.id) })),
      history: (inspection?.history ?? []).map(entry => ({ id: entry.id, speaker: entry.speaker, text: entry.text, voiceAssetId: entry.voiceAssetId, restorable: !!entry.entryState, location: `${entry.position.sceneId}/${entry.position.statementId}` })), choices,
      saves: profile.index.manual.slice(this.pageNumber * 12, this.pageNumber * 12 + 12).map((slot, index) => ({ id: slot.slotId, slotId: slot.slotId, recordId: slot.recordId, number: this.pageNumber * 12 + index + 1, empty: !slot.recordId, summary: '', time: '' })) } };
  }
  private async instanceAction(action: UIAction, context: UIValueContext): Promise<void> {
    try {
      if (this.emergencyCover?.active && !emergencyActionAllowed(action)) return;
      if (action.kind === 'setLocal' || action.kind === 'toggleLocal') {
        if (!(action.key in context.local)) throw new Error(`UI_LOCAL_MISSING: ${action.key}`);
        context.local[action.key] = action.kind === 'toggleLocal' ? !context.local[action.key] : readUIValue(action.value, context) as Json; this.render(); return;
      }
      if (action.kind === 'open') { this.open(action.page); return; }
      if (action.kind === 'plugin') { const args=Object.fromEntries(Object.entries(action.arguments).map(([key,binding])=>[key,readUIValue(binding,context)])),provider=this.options.pageActions?.find(item=>item.key===action.key);if(provider){this.report(await provider.run(args));return;}const separator=action.key.lastIndexOf(':'),key=action.key.slice(0,separator),name=action.key.slice(separator+1),platform=this.options.pluginPlatforms?.find(item=>item.key===key&&item.targets.includes(this.options.host.target)&&item.actions.some(action=>action.name===name));if(!platform)throw new Error(`UI_ACTION_UNAVAILABLE: ${action.key}`);this.report(await platform.invoke(name,args as Json,this.options.data.domain));return; }
      await this.dispatchPageAction(resolveUIOfficialAction(action, context));
    } catch (error) { this.report({ok:false,error:{code:'UI_ACTION_FAILURE',message:String(error),severity:'error',owner:'M07',related:[],actions:['retry']},issues:[]}); }
  }
  private async dispatchPageAction(action: OfficialAction): Promise<void> {
    if (this.emergencyCover?.active && !emergencyActionAllowed(action)) return;
    switch (action.kind) {
      case 'open': this.open(action.page); return;
      case 'back': this.back(); return;
      case 'start': await this.newGame(); return;
      case 'continue': { const id = this.options.data.current()!.index.continueRecordId; if (id) await this.load(id); return; }
      case 'advance': await this.advance(); return;
      case 'toggleUI': this.hidden = !this.hidden; this.render(); return;
      case 'toggleAuto': this.auto = !this.auto; this.skip = false; this.render(); return;
      case 'toggleSkip': this.skip = !this.skip; this.auto = false; this.render(); return;
      case 'replayVoice': await this.replayVoice(); return;
      case 'quickSave': await this.save('quick'); return;
      case 'quickLoad': { const id = this.options.data.current()!.index.quick[0]; if (id) await this.load(id); return; }
      case 'saveSlot': await this.save('manual', action.slotId); return;
      case 'loadSlot': { const id = this.options.data.current()!.index.manual.find(slot => slot.slotId === action.slotId)?.recordId; if (id) await this.load(id); return; }
      case 'returnTitle': await this.returnTitle(); return;
      case 'exit': await this.exit(); return;
      case 'cancelInput': await this.cancelInput(); return;
      case 'submitInput': { if (this.askingName) { await this.newGame(action.text); return; } const inspection = this.options.session.inspect(); if (!inspection?.token) return; const synced = await this.options.syncStage(); this.report(synced); if (!synced.ok) return; const result = await this.options.session.dispatch({ kind: 'input', token: inspection.token, text: action.text }); this.report(result); if (result.ok) this.showStory(); return; }
      case 'selectOption': {
        const inspection=this.options.session.inspect();
        if(this.selecting||!inspection?.token||inspection.state.wait?.kind!=='choice'||!inspection.state.wait.optionIds.includes(action.optionId))return;
        this.selecting=action.optionId;this.render();let release=()=>{};
        try {
          // Paint acceptance before the synchronous stage readback and branch preparation.
          if(this.canvasRoot?.isConnected)await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
          if(this.disposed||!sameToken(this.options.session.inspect()?.token??null,inspection.token))return;
          release=this.holdVisual();
          const synced=await this.options.syncStage();this.report(synced);if(!synced.ok)return;
          const result=await this.options.session.dispatch({kind:'choose',token:inspection.token,optionId:action.optionId});this.report(result);
          if(result.ok){this.showStory();await this.waitForTargetPresentation();}
        } finally {this.selecting=null;release();if(!this.disposed)this.render();}
        return;
      }
      case 'toolbarReveal': this.toolbarVisible = true; this.render(); return;
      case 'toolbarLock': { const preferences = this.preferences(); this.report(await this.options.data.savePreferences({ ...preferences, toolbarLocked: action.locked }, preferences.revision)); this.render(); return; }
      case 'preference': { const current = this.preferences(), next = structuredClone(current), keys = action.path.split('.'); let target = next as unknown as Record<string, Json>; for (const key of keys.slice(0, -1)) { if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) throw new Error(`UI_PREFERENCE_PATH: ${action.path}`); target = target[key] as Record<string, Json>; } const key = keys.at(-1)!; if (!(key in target) || ['schemaVersion', 'revision'].includes(key)) throw new Error(`UI_PREFERENCE_PATH: ${action.path}`); target[key] = action.value; const checked = validatePreferences(next); this.report(checked); if (!checked.ok) return;
        if (next.fullscreen !== current.fullscreen) { const result = await this.options.host.platform('window.fullscreen', { enabled: next.fullscreen }); this.report(result); if (!result.ok) return; next.fullscreen = !!(result.value as { enabled?: boolean }).enabled; }
        const result = await this.options.data.savePreferences(next, current.revision); this.report(result); if (result.ok) { this.options.session.setVoiceLocale(result.value.voiceLocale); this.options.audio.setLevels(result.value.volumes.master / 100, Object.fromEntries(Object.entries(result.value.volumes).filter(([key]) => key !== 'master').map(([key, value]) => [key, value / 100]))); this.options.audio.setDuck(result.value.duckBgm ? .35 : 1, result.value.interruptOnSilent); } this.render(); return; }
      case 'openCg': await this.presentGalleryChange(()=>{this.galleryView.viewer = action.entryId;this.galleryView.difference=null;this.render();}); return;
      case 'nextDifference': { const entry = this.options.snapshot.gallery.find(item => item.id === this.galleryView.viewer), available = entry?.differences?.filter(item => this.options.data.current()!.longTerm.cg[entry.id]?.includes(item.id)) ?? []; const index = available.findIndex(item => item.id === this.galleryView.difference); await this.presentGalleryChange(()=>{this.galleryView.difference = available[(index + action.delta + available.length) % available.length]?.id ?? null;this.render();}); return; }
      case 'enterFlow': await this.enterFlow(action.nodeId); return;
      case 'music': { const entry = this.options.snapshot.gallery.find(item => item.id === action.entryId), asset = this.options.snapshot.assets.find(item => item.assetId === entry?.assets[0]); if (action.op === 'pause') this.pageAudio.pauseAudition(); else if (action.op === 'stop') this.pageAudio.stopAudition(); else if (action.op === 'seek') this.pageAudio.seekAudition(action.seconds ?? 0); else if (asset && this.options.data.current()!.longTerm.music.includes(action.entryId)) await this.pageAudio.playAudition(asset); this.render(); return; }
      case 'exportData': await this.exportData(); return;
      case 'importData': if (this.importPlan?.id === action.planId) await this.applyImport(); return;
      case 'clearData': if (await this.ask(this.locale('action.clear'))) { this.report(await this.options.data.clear(action.scopes)); this.options.longTerm.syncFromDisk(); this.render(); } return;
      case 'resetPreferences': if (action.paths.length&&await this.ask(this.locale('action.reset'))) { const current=this.preferences(),defaults=defaultPreferences(this.options.snapshot.project.languages.menuDefault,this.options.snapshot.project.languages.voiceDefault),next=structuredClone(current);for(const path of action.paths){const keys=path.split('.');let target=next as unknown as Record<string,Json>;for(const key of keys.slice(0,-1)){if(!target[key]||typeof target[key]!=='object'||Array.isArray(target[key]))throw new Error(`UI_PREFERENCE_PATH: ${path}`);target=target[key] as Record<string,Json>;}const key=keys.at(-1)!,value=readUIPath(defaults,path);if(!(key in target)||value===undefined||['schemaVersion','revision'].includes(key))throw new Error(`UI_PREFERENCE_PATH: ${path}`);target[key]=structuredClone(value) as Json;}if(next.fullscreen!==current.fullscreen){const result=await this.options.host.platform('window.fullscreen',{enabled:next.fullscreen});this.report(result);if(!result.ok)return;}this.report(await this.options.data.savePreferences(next,current.revision));this.render(); } return;
      case 'videoRetry': this.report(await (this.options.retryVideo?.() ?? this.options.video.retry())); this.render(); return;
      case 'confirm': if (this.pendingConfirm?.id===action.requestId) await this.finishConfirmation(action.accepted,action.remember); return;
      case 'emergency': this.setEmergency(action.enabled); return;
      case 'jumpHistory': await this.jumpHistory(action.historyId); return;
      case 'playHistoryVoice': await this.playHistoryVoice(action.historyId); return;
    }
  }
  private instances(page: string, overrides: Partial<ComponentInstanceProps> = {}): ReactNode {
    const config = this.options.snapshot.template.pages.find(item => item.key === page); if (!config) return null;
    const context = this.instanceContext(page);
    return <ComponentInstances externalVisualStates root={config.root} page={{id:config.id,key:config.key}} context={context} label={key => this.locale(key)} textOverride={component => componentTextOverride(component, this.options.snapshot.template.locales, this.preferences().menuLocale)} action={(action, value) => this.instanceAction(action, value)}
      register={(component, element, instance) => { if (!element) return; element.dataset.gcComponent = component.id; element.dataset.gcPart = component.part; element.dataset.gcInstance = instance;
        if(element.matches('button,input,select,textarea,[tabindex]')&&!element.dataset.focusKey)element.dataset.focusKey=instance;
        if (component.part.startsWith('title.menu.')) element.dataset.focusKey = component.part.replace('menu.', ''); }}
      activate={async (component, value) => { if (this.emergencyCover?.active) { if (component.part === 'emergency.restore') this.setEmergency(false); return; } const action = componentDefinition(component.part)?.action; if (!action) return; if(action==='startAfterstory'){const id=(value.item as {id?:Id}|undefined)?.id;if(id)await this.newGame(undefined,id);return;} if(component.part==='settings.titleAction'){await this.returnTitle(true,true);return;} if (action.startsWith('open:')) { this.open(action.slice(5)); return; } if (action === 'selectOption') { const id = (value.item as { id?: Id } | undefined)?.id; if (id) await this.dispatchPageAction({ kind: 'selectOption', optionId: id }); return; } if (action === 'playHistoryVoice' || action === 'jumpHistory') { const id = (value.item as { id?: Id } | undefined)?.id; if (id) await this.dispatchPageAction(action === 'jumpHistory' ? { kind: 'jumpHistory', historyId: id } : { kind: 'playHistoryVoice', historyId: id }); return; } if (['start', 'continue', 'back', 'exit', 'toggleAuto', 'toggleSkip', 'advance', 'quickSave', 'quickLoad', 'replayVoice', 'returnTitle', 'toolbarReveal', 'cancelInput'].includes(action)) await this.dispatchPageAction({ kind: action } as OfficialAction); }}
      state={(component, value) => { const item = value.item as Record<string, unknown> | undefined, profile = this.options.data.current()!;
        if (component.part === 'title.workTitle') return { text: this.options.snapshot.project.name };
        if (component.part === 'title.description') return { text: this.options.snapshot.project.description };
        if (component.part === 'title.menu.continue') return { disabled: !profile.index.continueRecordId };
        if (component.part === 'title.menu.exit') return { visible: this.options.host.target === 'windows' };
        if (/^title\.menu\.(cg|music|flow|characters)$/.test(component.part)) return { disabled: !this.canOpen(component.part.split('.').at(-1)!) };
        if (component.part === 'choice.list.item') return { disabled: item?.disabled === true || !!this.selecting, selected:item?.id===this.selecting };
        if (component.part === 'characters.card') return {locked:item?.locked===true,selected:item?.id===this.startingAfterstory,disabled:this.starting&&item?.id!==this.startingAfterstory};
        if (component.part === 'choice.list.item.text') return { text: String(item?.text ?? '') };
        if (component.part === 'choice.list.item.lockReason') return { visible: item?.disabled === true, text: String(item?.lockedReason ?? '') };
        if (component.part === 'history.list.row.speaker') return { text: String(item?.speaker ?? '') };
        if (component.part === 'history.list.row.text') return { text: String(item?.text ?? '') };
        if (component.part === 'history.list.row.location') return { text: String(item?.location ?? '') };
        if (component.part === 'history.list.row.voice') return { disabled: !item?.voiceAssetId, text: this.locale('action.play') };
        if (component.part === 'history.list.row.jump') return { disabled: !item?.restorable, text: this.locale('history.jump') };
        return {}; }} {...overrides}/>;
  }
  private composeBusiness(page:string, adapter:BusinessPageAdapter, rootPart?:string):ReactNode {
    const {data,...overrides}=adapter, context=this.instanceContext(page), root=rootPart?this.part(page,rootPart):undefined;
    return this.instances(page,{...overrides,context:{...context,data:{...context.data,...data}},...(root?{root,contentsOnly:true}:{})});
  }
  private mountBusiness(page:string,source:ReactNode,data:Record<string,unknown>={},state?:BusinessPageAdapter['state']) {
    const projection=businessParts(source);
    this.mountPage(this.composeBusiness(page,{data,state:(component,context)=>{
      const value=state?.(component,context)??{visible:projection.has(component.part,context)||component.part===`${page}.root`||component.part.startsWith('basic.')};
      if(page==='characters'&&component.part==='characters.card'){const item=context.item as {id?:Id;locked?:boolean}|undefined;return {...value,locked:item?.locked===true,selected:item?.id===this.startingAfterstory,disabled:this.starting&&item?.id!==this.startingAfterstory};}
      return value;
    },business:projection.render}),true);
  }
  private visible(page: string, key: string): boolean { return this.part(page, key)?.visible ?? false; }
  private stylePart(page: string, key: string, element: HTMLElement, position = false, configuration?: ComponentConfig) {
    const component = configuration ?? this.part(page, key); if (!component) return;
    if(element.dataset.gcInstanceRendered==='true')return;
    for(const property of ['position','left','top','width','height','transform','z-index','padding','margin','gap','overflow','min-width','min-height','max-width','max-height','scale','transform-origin'])element.style.removeProperty(property);
    element.dataset.part = key;
    element.dataset.gcPart = key; element.dataset.gcComponent = component.id;
    element.classList.add(`gc-${key.replaceAll('.', '-')}`); element.hidden = !component.visible;
    const visual = component.normal;
    if (visual.fontId) element.style.fontFamily = `var(--gc-font-${visual.fontId}, inherit)`;
    if (visual.color) element.style.color = visual.color;
    if (visual.fontSize) element.style.fontSize = `${visual.fontSize * (/^(story\.bodyText|history\.list\.row\.text)$/.test(key) ? this.preferences().fontScale : 1)}px`;
    if (visual.lineHeight) element.style.lineHeight = String(visual.lineHeight);
    if (visual.background) element.style.backgroundColor = `color-mix(in srgb, ${visual.background.color} ${visual.background.colorOpacity * 100}%, transparent)`;
    if (visual.borderColor) element.style.borderColor = visual.borderColor;
    if (visual.borderWidth !== undefined) element.style.borderWidth = `${visual.borderWidth}px`;
    if (visual.radius !== undefined) element.style.borderRadius = `${visual.radius}px`;
    if (visual.opacity !== undefined) element.style.opacity = String(visual.opacity);
    if (visual.textAlign) element.style.textAlign = visual.textAlign;
    for (const [state, prefix] of [['hover', '--gc-hover'], ['pressed', '--gc-pressed'], ['focus', '--gc-focus'], ['disabled', '--gc-disabled'], ['selected', '--gc-selected']] as const) {
      const override = component.states[state];
      if (override?.background) element.style.setProperty(`${prefix}-bg`,
        `color-mix(in srgb, ${override.background.color} ${override.background.colorOpacity * 100}%, transparent)`);
      if (override?.color) element.style.setProperty(`${prefix}-ink`, override.color);
      if (override?.opacity !== undefined) element.style.setProperty(`${prefix}-opacity`, String(override.opacity));
    }
    const layout = component.layout;
    const positioned=layout.position?layout.position==='free':position||layout.mode==='absolute';
    element.dataset.gcPositioned=String(positioned);
    if(component.visualScale!==undefined){element.style.scale=String(component.visualScale);element.style.transformOrigin='top left';}
    element.style.minWidth=layout.minWidth?`${layout.minWidth}px`:'';element.style.minHeight=layout.minHeight?`${layout.minHeight}px`:'';
    element.style.maxWidth=layout.maxWidth===null?'':`${layout.maxWidth}px`;element.style.maxHeight=layout.maxHeight===null?'':`${layout.maxHeight}px`;
    const scale = 1;
    element.style.gap = `${layout.gap * scale}px`;
    if (Object.values(layout.padding).some(value => value > 0))
      element.style.padding = `${layout.padding.top * scale}px ${layout.padding.right * scale}px ${layout.padding.bottom * scale}px ${layout.padding.left * scale}px`;
    if (Object.values(layout.margin).some(value => value > 0))
      element.style.margin = `${layout.margin.top * scale}px ${layout.margin.right * scale}px ${layout.margin.bottom * scale}px ${layout.margin.left * scale}px`;
    if (element.tagName === 'DIV' || element.tagName === 'NAV') {
      element.style.display = layout.mode === 'grid' ? 'grid' : 'flex';
      if (layout.mode !== 'grid') element.style.flexDirection = layout.mode === 'row' ? 'row' : 'column';
      element.style.alignItems = layout.align === 'start' ? 'flex-start' : layout.align === 'end' ? 'flex-end' : layout.align === 'center' ? 'center' : 'stretch';
      element.style.justifyContent = layout.justify === 'spaceBetween' ? 'space-between' : layout.justify === 'start' ? 'flex-start' : layout.justify === 'end' ? 'flex-end' : 'center';
    }
    if (layout.mode === 'grid') element.style.gridTemplateColumns = `repeat(${layout.columns}, minmax(0, 1fr))`;
    if (layout.overflow !== 'visible') element.style.overflow = layout.overflow === 'scroll' ? 'auto' : 'hidden';
    if (!positioned) {
      const dimension=(v:typeof layout.width)=>v.unit==='px'?`${v.value}px`:v.unit==='percent'?`${v.value}%`:'auto';
      if(layout.width.unit!=='auto')element.style.width=dimension(layout.width);
      if(layout.height.unit!=='auto')element.style.height=dimension(layout.height);
      if(layout.minWidth)element.style.minWidth=`${layout.minWidth}px`;
      if(layout.maxWidth!==null)element.style.maxWidth=`${layout.maxWidth}px`;
      if(layout.minHeight)element.style.minHeight=`${layout.minHeight}px`;
      if(layout.maxHeight!==null)element.style.maxHeight=`${layout.maxHeight}px`;
      return;
    }
    const canvas = this.options.snapshot.project.canvas;
    const length = (value: { unit: 'px'|'percent'|'auto'; value?: number }, axis: number) =>
      value.unit === 'percent' ? `${value.value}%` : value.unit === 'px' ? `${value.value ?? 0}px` : 'auto';
    element.style.position = 'absolute';
    element.style.left = `calc(${layout.anchorX * 100}% + ${length(layout.x, canvas.width)})`;
    element.style.top = `calc(${layout.anchorY * 100}% + ${length(layout.y, canvas.height)})`;
    element.style.width = length(layout.width, canvas.width);
    element.style.height = length(layout.height, canvas.height);
    if(element.dataset.gcInstanceRendered==='true'){element.style.translate=`-${layout.anchorX*100}% -${layout.anchorY*100}%`;element.style.transform='none';}
    else element.style.transform = `translate(-${layout.anchorX * 100}%, -${layout.anchorY * 100}%)`;
    element.style.zIndex = String(layout.z);
  }
  render() {
    if (this.emergencyCover?.active) { this.renderEmergency(); return; }
    if (this.disposed || !this.options.data.current() || this.handleEnding()) return;
    const pending=this.options.session.inspect();
    if(pending?.pendingLongTerm||pending?.state.wait&&['choice','input','plugin'].includes(pending.state.wait.kind))this.stopModes();
    this.renderMessage();
    const renderSequence = ++this.renderSequence;
    const sessionId = this.options.session.inspect()?.sessionId ?? null;
    const source = this.navigation.audioSource;
    this.pageAudio.setContext(this.navigation.page, source.kind === 'stage' && sessionId && (!source.sessionId || source.sessionId === sessionId)
      ? { kind: 'stage', sessionId } : { kind: 'home' }, (this.navigation.contains('music')||this.navigation.contains('cg')), {
        systemPage: this.navigation.page !== 'story', focus: this.blurred && this.preferences().pauseOnBlur,
        emergency: this.emergencyCover?.active, debug: this.options.session.inspect()?.status === 'paused',
      });
    this.soundButton.hidden = !this.pageAudio.soundBlocked || this.startup.active;
    this.soundButton.textContent = this.t('启用声音','Enable sound','音声を有効にする');
    this.options.stage.pause(!this.storyActive);
    void this.options.video.setPause(!this.storyActive).then(result => { if (!result.ok && result.error.code !== 'VIDEO_STALE') this.report(result); });
    const pluginPage=['confirm','error','dataImport','dataClear'].includes(this.navigation.page)?this.retainedPage?.page:this.navigation.page;
    const identity=`${pluginPage}/${sessionId}/${pending?.state.wait?.kind==='plugin'?pending.token?.occurrence:''}`;
    if(identity!==this.pluginIdentity){this.pluginIdentity=identity;this.pluginEpoch++;this.pluginPageNode=null;
      this.pluginRoot?.unmount();this.pluginRoot=null;this.releasePluginRender();this.pluginRenderController=new AbortController();this.clearPluginComponents();}

    for(const reset of this.visualReset)reset();this.visualReset=[];
    for (const release of this.imageReleases) release(); this.imageReleases = [];
    if (this.typingTimer) clearTimeout(this.typingTimer);
    if (this.autoTimer) clearTimeout(this.autoTimer);
    for (const url of this.thumbnailUrls) URL.revokeObjectURL(url);
    this.thumbnailUrls.clear();
    if (!this.pageRoot) clear(this.content);
    const page = this.navigation.page;
    const canvas = this.options.snapshot.project.canvas, scale = this.uiScale;
    Object.assign(this.canvasRoot.style, {width:`${canvas.width}px`, height:`${canvas.height}px`,
      left:`${(this.options.root.clientWidth-canvas.width*scale)/2}px`,top:`${(this.options.root.clientHeight-canvas.height*scale)/2}px`,transform:`scale(${scale})`});
    Object.assign(this.content.style, {left:'0px',top:'0px',width:'100%',height:'100%'});
    const backgroundPage = ['confirm','error','dataImport','dataClear'].includes(page) ? this.retainedPage?.page ?? page : page;
    this.pageBackground.dataset.gcBackgroundPage = backgroundPage;
    Object.assign(this.pageBackground.style,{left:'0px',top:'0px',width:'100%',height:'100%'});
    this.options.root.style.setProperty('--gc-canvas-width',`${canvas.width}px`);
    this.options.root.style.setProperty('--gc-canvas-height',`${canvas.height}px`);
    this.options.root.style.setProperty('--gc-canvas-ratio',`${canvas.width}/${canvas.height}`);
    this.options.root.style.setProperty('--gc-scale', '1');
    this.options.root.style.setProperty('--gc-viewport-scale', String(scale));
    this.options.root.dataset.gcReducedMotion=String(this.preferences().reducedMotion);
    this.options.root.dataset.gcAppearance = this.isDark(this.options.snapshot.template.defaultVisual.background.color) ? 'night' : 'paper';
    this.content.dataset.page = page;
    const pageConfig = this.options.snapshot.template.pages.find(item => item.key === page);
    this.content.dataset.gcPage = page; this.content.dataset.gcPageId = pageConfig?.id ?? '';
    const defaults = this.options.snapshot.template.defaultVisual;
    this.options.root.style.setProperty('--gc-bg', defaults.background.color);
    this.options.root.style.setProperty('--gc-ink', defaults.color);
    this.options.root.style.setProperty('--gc-line', defaults.borderColor);
    this.options.root.style.colorScheme = this.isDark(defaults.background.color) ? 'dark' : 'light';
    this.options.root.style.containerType='inline-size';
    this.options.root.dataset.gcEffects=String(this.preferences().effects);
    this.content.style.color = defaults.color;
    this.content.style.fontFamily = defaults.fontId ? `var(--gc-font-${defaults.fontId}, inherit)` :
      this.preferences().menuLocale === 'ja' ? 'var(--gc-font-japanese, inherit)' : 'var(--gc-font-default, inherit)';
    this.content.style.fontSize = `${defaults.fontSize}px`;
    this.canvasRoot.style.fontFamily=this.content.style.fontFamily;
    this.content.style.background = 'transparent';
    this.introRelease?.(); this.introRelease = null; this.introGeneration++;
    switch (page) {
      case 'title': this.title(); break;
      case 'confirm': this.confirmPage(); break;
      case 'error': this.errorPage(); break;
      case 'story': this.story(); break;
      case 'choice': this.choiceInstances(); break;
      case 'input': this.inputInstances(); break;
      case 'save': case 'load': this.saves(page); break;
      case 'history': this.historyInstances(); break;
      case 'settings': this.settings(); break;
      case 'cg': case 'music': this.gallery(page); break;
      case 'flow': this.flow(); break;
      case 'characters': this.characters(); break;
      case 'dataClear': this.clearPage(); break;
      case 'dataImport': this.importPage(); break;
      case 'emergency': this.mountBusiness('emergency',<button ref={this.partRef('emergency','emergency.restore')} onClick={()=>this.back()}>{this.locale('emergency.restore')}</button>); break;
      case 'videoError': this.mountBusiness('videoError',<><p ref={this.partRef('videoError','videoError.message')}>{this.operationMessage||this.stageError||this.t('影片暂时无法播放。请重试，或返回标题。','The movie could not play. Retry, or return to title.','動画を再生できません。再試行するか、タイトルに戻ってください。')}</p><nav className="gc-nav"><button ref={this.partRef('videoError','videoError.retry')} onClick={()=>{void (this.options.retryVideo?.()??this.options.video.retry()).then(result=>{this.report(result);if(result.ok)this.showStory();});}}>{this.locale('action.retry')}</button><button ref={this.partRef('videoError','videoError.titleAction')} onClick={()=>void this.returnTitle()}>{this.locale('nav.title')}</button></nav></>);break;
      default: this.pluginPage(page);
    }
    if (renderSequence === this.renderSequence) { this.mountPluginComponents(page); this.applyPublicVisuals(renderSequence); }
    if(['story','choice'].includes(this.content.dataset.page??page))this.content.style.setProperty('overflow','hidden','important');
    else this.content.style.removeProperty('overflow');
    if (this.startup.active||this.visualHold||!!this.selecting)this.content.inert = true;
    this.portal.inert=this.startup.active||this.transition.busy||!!this.visualHold||!!this.selecting;
    for(const layer of this.modalLayers)layer.element.inert=this.startup.active||this.transition.busy||layer.element!==this.modalRoot;
  }
  get emergencyActive() { return !!this.emergencyCover?.active; }
  setEmergency(enabled: boolean) {
    if (this.disposed || !this.options.data.current() || enabled === this.emergencyCover?.active) return;
    this.stopModes(); this.ctrlDown = false;
    if (this.typingTimer) { clearTimeout(this.typingTimer); this.typingTimer = null; }
    if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null; }
    void this.options.session.setPauseReason('emergency', enabled).then(result => { if (!result.ok) this.report(result); });
    if (!enabled) this.options.audio.setPause('debug', this.options.session.inspect()?.status === 'paused');
    this.options.audio.setPause('emergency', enabled);
    if (enabled) {
      this.emergencyLifetime = new AbortController();
      this.emergencyCover.open(this.locale('page.emergency'));
      this.options.stage.pause(true); void this.options.video.setPause(true);
      this.startup.setPaused(true);
      this.options.entryPresentation?.setPreferences(true, this.preferences().reducedMotion, this.preferences().chapterNotice);
      this.renderEmergency();
    } else {
      this.clearEmergencyComponents();
      this.emergencyRoot?.unmount(); this.emergencyRoot = null;
      this.emergencyCover.close(!(this.blurred && this.preferences().pauseOnBlur) && this.options.session.inspect()?.status !== 'paused');
      this.render();
    }
  }
  private clearEmergencyComponents() {
    this.emergencyLifetime.abort();
    for (const { root, element } of this.emergencyComponents.splice(0)) { root.unmount(); element.remove(); }
    for (const release of this.emergencyReleases.splice(0)) release();
  }
  private renderEmergency() {
    const page = this.options.snapshot.template.pages.find(page => page.key === 'emergency');
    const canvas = this.options.snapshot.project.canvas, scale = this.uiScale, element = this.emergencyCover.canvas;
    const defaults = this.options.snapshot.template.defaultVisual;
    Object.assign(element.style, { color: defaults.color, fontSize: `${defaults.fontSize}px`, background: 'transparent', fontFamily: defaults.fontId ? `var(--gc-font-${defaults.fontId}, inherit)` : this.preferences().menuLocale === 'ja' ? 'var(--gc-font-japanese, inherit)' : 'var(--gc-font-default, inherit)' });
    Object.assign(element.style, { width: `${canvas.width}px`, height: `${canvas.height}px`, left: `${(this.options.root.clientWidth - canvas.width * scale) / 2}px`, top: `${(this.options.root.clientHeight - canvas.height * scale) / 2}px`, transform: `scale(${scale})` });
    element.dataset.gcPageId = page?.id ?? '';
    this.emergencyRoot ??= createRoot(element);
    flushSync(() => this.emergencyRoot!.render(<><PageBackground host={this.options.host} snapshot={this.options.snapshot} page={page}/>{this.instances('emergency', { externalVisualStates: false })}<TemplateImages root={element} host={this.options.host} part={(key, node) => node.dataset.gcComponent ? this.componentById('emergency', node.dataset.gcComponent) : this.part('emergency', key)} onIssues={issues => this.setTemplateImageIssues(issues)} scale={1} sequence={this.renderSequence}/></>));
    this.mountPluginComponents('emergency', element, this.emergencyComponents, this.emergencyReleases, this.emergencyLifetime.signal);
  }
  private clearPluginComponents() { for (const item of this.componentRoots.splice(0)) { item.root.unmount(); item.element.remove(); } for (const element of this.content.querySelectorAll('[data-gc-plugin-component]')) element.remove(); }
  private releasePluginRender() { this.pluginRenderController.abort(); for (const release of this.pluginRenderReleases.splice(0)) { try { release(); } catch (error) { this.showError(issueFromError(error,'M07')); } } }
  private mountPluginComponents(pageKey: string, container = this.content, roots = this.componentRoots, releases = this.pluginRenderReleases, signal = this.pluginRenderController.signal) {
    const page = this.options.snapshot.template.pages.find(item => item.key === pageKey);
    if (!page) return;
    const inspection = this.options.session.inspect(), generation = this.pluginEpoch;
    const walk = (component: ComponentConfig, parent: ComponentConfig | null) => {
      if (!component.visible) return;
      if (component.plugin && component.visible) {
        if(roots.some(item=>item.element.isConnected&&item.element.dataset.gcComponent===component.id))return;
        const contribution = this.options.pluginComponents?.find(item => item.key === component.plugin!.key);
        const element = document.createElement('div'); element.dataset.gcPluginComponent = component.plugin.key;
        const parentElement = parent && container.querySelector<HTMLElement>(`[data-gc-component="${parent.id}"]`);
        (parentElement ?? container).append(element);
        this.stylePart(pageKey, component.part, element, true, component);
        if (!contribution) { element.setAttribute('role', 'alert'); element.textContent = this.t('组件提供者不可用', 'Component provider unavailable', 'コンポーネントが利用できません'); }
        else {
          const pluginId = contribution.key.split('/')[0]!;
          const rendered = renderPluginComponent(contribution, { props: component.plugin.props, input: inspection?.state.wait?.kind === 'plugin' ? inspection.state.wait.input ?? {} : {},
            signal, onDispose: release => releases.push(release),
            progress: inspection?.state.plugins[pluginId]?.progress ?? {}, longTerm: this.options.data.current()?.longTerm.plugins[pluginId]?.data ?? {},
            actions: { invoke: async (action: string, args: Json) => {
              if (this.emergencyCover?.active) return { ok: false, error: { code: 'EMERGENCY_ACTION_BLOCKED', severity: 'error', owner: 'M07', message: 'Story and external actions are paused by the emergency cover', related: [], actions: [] }, issues: [] };
              if (generation !== this.pluginEpoch) return { ok: false, error: { code: 'TOKEN_STALE', severity: 'error', owner: 'M07', message: '组件属于已结束的视图', related: [], actions: [] }, issues: [] };
              const separator = action.indexOf(':');
              if (separator > 0) { const key = action.slice(0, separator), name = action.slice(separator + 1), platform = this.options.pluginPlatforms?.find(item => item.key === key && item.actions.some(action => action.name === name));
                if (platform) return platform.invoke(name, args, this.options.data.domain); }
              if (!inspection?.token && this.options.data.domain.kind === 'sample') return { ok: true, value: { status: 'simulated', action, args }, warnings: [] };
              if (!sameToken(inspection?.token ?? null, this.options.session.inspect()?.token ?? null)) return { ok: false, error: { code: 'TOKEN_STALE', severity: 'error', owner: 'M07', message: '组件属于已结束的会话', related: [], actions: [] }, issues: [] };
              if (action !== 'finish' || inspection?.state.wait?.kind !== 'plugin' || inspection.state.wait.contribution.split('/')[0] !== pluginId || !inspection.token) return { ok: false, error: { code: 'PLUGIN_COMPONENT_ACTION', severity: 'error', owner: 'M07', message: '当前组件没有此活动交互动作', related: [], actions: [] }, issues: [] };
              const outcome = await this.options.session.dispatch({ kind: 'plugin', token: inspection.token, result: args }); this.report(outcome); if (outcome.ok) this.showStory();
              return outcome.ok ? { ok: true, value: null, warnings: outcome.warnings } : outcome;
            } } });
          if (!rendered.ok) { element.setAttribute('role', 'alert'); element.textContent = rendered.error.message; }
          else { const root = createRoot(element); flushSync(() => root.render(<PluginSurface rendered={rendered.value} publicParts={contribution.publicParts} part={part => node => { const child = component.children.find(item => item.part === part); if (node && child) this.stylePart(pageKey, part, node, false, child); }}/>)); roots.push({ root, element }); }
        }
      }
      for (const child of component.children) walk(child, component);
    };
    walk(page.root, null);
  }
  private applyPublicVisuals(sequence: number) {
    this.visualEvents.abort(); this.visualEvents=new AbortController();
    const listen = (element:HTMLElement,type:string,callback:()=>void)=>element.addEventListener(type,callback,{signal:this.visualEvents.signal});
    const active = new Set([...Object.values(this.options.session.inspect()?.state.presentation.styles ?? {}), ...(this.options.previewStyleIds ?? [])]);
    this.styleElement.textContent = this.options.snapshot.template.styles.filter(style => style.enabled !== false && (style.activation === 'page' || active.has(style.id)))
      .map(style => this.options.styles?.[style.compiledPath ?? ''] ?? '').join('\n');
    // Named styles outrank template visuals; keep dynamic selectors in the stylesheet.
    const promote=(rules:CSSRuleList)=>{for(const rule of rules){if(rule instanceof CSSStyleRule){for(const property of [...rule.style])rule.style.setProperty(property,rule.style.getPropertyValue(property),'important');}else if('cssRules' in rule)promote((rule as CSSGroupingRule).cssRules);}};
    if(this.styleElement.sheet)promote(this.styleElement.sheet.cssRules);
    for (const element of this.options.root.querySelectorAll<HTMLElement>('[data-gc-part]')) {
      if(element.closest('.gc-visual-hold'))continue;
      const ownerPage=element.closest<HTMLElement>('[data-gc-page]')?.dataset.gcPage ?? this.navigation.page;
      const component = element.dataset.gcComponent?this.componentById(ownerPage,element.dataset.gcComponent):this.part(ownerPage,element.dataset.gcPart!); if (!component) continue;
      if(element.dataset.gcInstanceRendered!=='true'&&element.dataset.gcPositioned==='true'&&element.offsetParent instanceof HTMLElement){
        const parent=element.offsetParent,style=getComputedStyle(parent),root=parent===this.content||parent.classList.contains('gc-modal-layer')||parent===this.canvasRoot;
        const padding={left:root?0:parseFloat(style.paddingLeft)||0,right:root?0:parseFloat(style.paddingRight)||0,top:root?0:parseFloat(style.paddingTop)||0,bottom:root?0:parseFloat(style.paddingBottom)||0};
        const bounds=resolveLayout(component.layout,{x:padding.left,y:padding.top,width:parent.clientWidth-padding.left-padding.right,height:parent.clientHeight-padding.top-padding.bottom},{width:element.offsetWidth,height:element.offsetHeight});
        Object.assign(element.style,{left:`${bounds.x-component.layout.margin.left}px`,top:`${bounds.y-component.layout.margin.top}px`,width:`${bounds.width}px`,height:component.layout.height.unit==='auto'?'auto':`${bounds.height}px`,transform:'none'});
      }
      if(getComputedStyle(element).position==='static')element.style.position='relative';element.style.isolation='isolate';
      const visible=!element.hidden,prior=this.partVisibility.get(element);this.partVisibility.set(element,visible);
      const animatePart=(binding:'show'|'hide'|'hover'|'focus'|'pressed')=>{const definition=this.options.snapshot.template.animations.find(item=>item.id===component.animations[binding]);
        let player=this.partAnimations.get(element);if(!player){player=new PageTransition();this.partAnimations.set(element,player);}player.interrupt(element);
        return player.play(element,definition,this.preferences().reducedMotion,undefined,1);};
      if(prior!==visible){if(!visible&&prior){element.hidden=false;void animatePart('hide').then(()=>{if(this.partVisibility.get(element)===false)element.hidden=true;});}else if(visible&&!this.transition.busy)void animatePart('show');}
      const overridden = new Map<string, { value: string; priority: string }>();
      const restoreVisuals = () => { for (const [property, original] of overridden) {
        if (original.value) element.style.setProperty(property, original.value, original.priority);
        else element.style.removeProperty(property);
      } overridden.clear(); };
      this.visualReset.push(restoreVisuals);
      const apply = (state: keyof ComponentConfig['states'] | 'normal') => {
        restoreVisuals();
        const base: keyof ComponentConfig['states'] | 'normal'=element.closest('[data-empty=true]')?'empty':element.closest('[data-locked=true]')?'locked':element.getAttribute('aria-pressed')==='true'?'selected':element.matches(':disabled')?'disabled':'normal';
        const selectedCard=base==='selected'&&(/^(save|load)\.grid\.slot$/.test(component.part)||component.part==='characters.card');
        const effective=base==='locked'?'locked':selectedCard?'selected':state;
        element.dataset.gcState=effective==='normal'?base:effective;
        const override = {...(base==='normal'?{}:component.states[base]),...(effective==='normal'?{}:component.states[effective])};
        const visual=componentInstanceStyle(component,undefined,false,override);
        for(const property of ['color','fontSize','fontFamily','lineHeight','textAlign','whiteSpace','backgroundColor','borderColor','borderWidth','borderStyle','borderRadius','opacity','boxShadow'] as const){const value=visual[property];if(value===undefined)continue;const numeric=typeof value==='number',scaled=property==='fontSize'&&/^(story\.bodyText|history\.list\.row\.text)$/.test(component.part)?Number(value)*this.preferences().fontScale:value;const css=numeric&&['fontSize','borderWidth','borderRadius'].includes(property)?`${scaled}px`:String(scaled),name=property.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`);overridden.set(name,{value:element.style.getPropertyValue(name),priority:element.style.getPropertyPriority(name)});element.style.setProperty(name,css,'important');}

      };
      apply(element.matches(':disabled') ? 'disabled' : 'normal');
      if(element.closest('[data-locked=true]'))continue;
      listen(element, 'pointerenter', () => { if (!element.matches(':disabled')) {apply('hover');void animatePart('hover');} });
      listen(element, 'pointerleave', () => {this.partAnimations.get(element)?.cancel();apply(element.matches(':disabled') ? 'disabled' : 'normal');});
      listen(element, 'pointerdown', () => { if (!element.matches(':disabled')) {apply('pressed');void animatePart('pressed');} });
      listen(element, 'pointerup', () => {this.partAnimations.get(element)?.cancel();if (!element.matches(':disabled')) apply('hover');});
      listen(element, 'pointercancel',()=>{this.partAnimations.get(element)?.cancel();apply('normal');});
      listen(element, 'focus', () => {apply('focus');void animatePart('focus');}); listen(element, 'blur', () => {this.partAnimations.get(element)?.cancel();apply('normal');});
    }
  }
  private pluginPage(key: string): void {
    const page = this.options.pluginPages?.find(item => item.key === key); if (!page) { this.mountPage(this.options.snapshot.template.pages.some(page=>page.key===key)?this.instances(key):<button onClick={()=>this.back()}>{this.locale('nav.back')}</button>); return; }
    if(this.pluginPageNode){this.mountPage(this.pluginPageNode);return;}
    const inspection = this.options.session.inspect(), id = key.split('/')[0]!;
    const waiting = inspection?.state.wait;
    const generation = this.pluginEpoch;
    let completing = false;
    const rendered = page.render({ input: waiting?.kind === 'plugin' && waiting.page === key ? waiting.input ?? page.sampleInput : page.sampleInput,
      signal: this.pluginRenderController.signal, onDispose: release => this.pluginRenderReleases.push(release),
      progress: inspection?.state.plugins[id]?.progress ?? {}, longTerm: this.options.data.current()?.longTerm.plugins[id]?.data ?? {},
      finish: result => {
        if (this.emergencyCover?.active || completing || generation !== this.pluginEpoch || this.navigation.page !== key) return;
        if (waiting?.kind !== 'plugin' || waiting.page !== key || !inspection?.token) { this.back(); return; }
        if (!sameToken(inspection.token, this.options.session.inspect()?.token ?? null)) return;
        completing = true;
        void this.options.syncStage().then(synced => synced.ok ? this.options.session.dispatch({ kind: 'plugin', token: inspection.token!, result }) : synced).then(outcome => {
          completing = false;
          this.report(outcome); if (outcome.ok) this.showStory();
        });
      } });
    this.pluginPageNode=<><PluginSurface rendered={rendered} publicParts={page.publicParts} part={part=>this.partRef(key,part)}/><nav className="gc-nav"><button onClick={()=>this.back()}>{this.locale('nav.back')}</button><button onClick={()=>this.open('save')}>{this.locale('page.save')}</button><button onClick={()=>this.open('load')}>{this.locale('page.load')}</button></nav></>;this.mountPage(this.pluginPageNode);
  }

  private isDark(color: string): boolean {
    const match = /^#([\da-f]{6})$/i.exec(color);
    if (!match) return false;
    const value = Number.parseInt(match[1]!, 16);
    return ((value >> 16) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114) / 1000 < 128;
  }
  private ask(message: string, action?:string, originFocus?:string,confirmation?:keyof PlayerPreferences['confirmations']): Promise<boolean> {
    return new Promise(resolve => { this.pendingConfirm = {id:createId(),message,action,originFocus,confirmation,remember:false,resolve}; this.open('confirm'); });
  }
  private async finishConfirmation(accepted: boolean,remember=this.pendingConfirm?.remember??false) {
    if(this.transition.busy)return;
    const pending = this.pendingConfirm;
    if(accepted&&remember&&pending?.confirmation){const current=this.preferences(),saved=await this.options.data.savePreferences({...current,confirmations:{...current.confirmations,[pending.confirmation]:false}},current.revision);this.report(saved);if(!saved.ok)return;}
    this.pendingConfirm = null;
    void this.transition.navigate(this.modalRoot,this.pageAnimation('exit'),()=>this.backImmediate(),()=>undefined,this.preferences().reducedMotion).then(completed=>{this.render();pending?.resolve(completed&&accepted);});
  }
  private confirmPage() {
    const id = `confirm-${this.options.snapshot.template.instanceId}`;
    const content=<section className={`gc-confirm-panel${this.pendingConfirm?.retry?' gc-leave-failure':''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={this.partRef('confirm', 'confirm.panel', true)} onKeyDown={event => {
      if (event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')].filter(element=>!element.hidden);const index=controls.indexOf(document.activeElement as HTMLElement);controls[(index+(event.shiftKey?-1:1)+controls.length)%controls.length]?.focus(); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.finishConfirmation(false); }
    }}><h2 id={id} ref={this.partRef('confirm', 'confirm.title')}>{this.locale('action.confirm')}</h2><p ref={this.partRef('confirm', 'confirm.message')}>{this.pendingConfirm?.message ?? this.locale('confirm.title')}</p>{this.pendingConfirm?.confirmation&&<label ref={this.partRef('confirm','confirm.remember')}><input type="checkbox" checked={this.pendingConfirm.remember??false} onChange={event=>{if(this.pendingConfirm)this.pendingConfirm.remember=event.currentTarget.checked;this.render();}}/>{this.t('记住此确认偏好','Remember this preference','この確認設定を記憶する')}</label>}<div className="gc-nav">
      <button autoFocus ref={this.partRef('confirm','confirm.cancel')} onClick={() => this.finishConfirmation(false)}>{this.locale('action.cancel')}</button>
      {this.pendingConfirm?.retry&&<button onClick={()=>this.pendingConfirm?.retry?.()}>{this.t('重试保存','Retry save','保存を再試行')}</button>}
      <button ref={this.partRef('confirm','confirm.confirm')} onClick={() => this.finishConfirmation(true)}>{this.pendingConfirm?.action ?? this.locale('action.confirm')}</button>
    </div></section>;
    if(this.pendingConfirm?.retry)this.mountPage(content,true);else this.mountBusiness('confirm',content);
  }
  private errorPage() {
    this.mountBusiness('error',<section className="gc-confirm-panel" ref={this.partRef('error','error.panel',true)}><h2 ref={this.partRef('error','error.title')}>{this.locale('error.title')}</h2><p ref={this.partRef('error','error.message')}>{this.message.textContent || this.locale('error.body')}</p><div className="gc-nav"><button ref={this.partRef('error','error.cancel')} onClick={() => this.back()}>{this.locale('action.cancel')}</button><button ref={this.partRef('error','error.titleAction')} onClick={() => void this.returnTitle()}>{this.locale('nav.title')}</button></div></section>);
  }
  private title() {
    const profile = this.options.data.current()!;
    this.mountPage(<>
      <TitleMedia backgroundRoot={this.pageBackground} host={this.options.host} snapshot={this.options.snapshot} display={this.options.data.domain.kind === 'player' || this.previewDisplay
        ? this.previewDisplay ?? this.options.snapshot.project.display : { ...this.options.snapshot.project.display, titleVideo: null }}
        paused={this.startup.active && !this.startupRevealing || !this.startupStarted && this.options.data.domain.kind === 'player' || this.blurred && this.preferences().pauseOnBlur} videoVolume={this.preferences().volumes.master * this.preferences().volumes.video / 10000}/>
      {this.pageAudio.homeError && <p role="status">{this.pageAudio.homeIssue?localizeIssue(this.pageAudio.homeIssue,this.preferences().menuLocale):this.pageAudio.homeError}</p>}{this.pageAudio.homeIssue&&<details><summary>{this.t('诊断详情','Diagnostic details','診断の詳細')}</summary><pre>{issueDetails(this.pageAudio.homeIssue)}</pre></details>}
      {this.startupError && <p role="status">{this.startupError}</p>}
      {this.instances('title',{business:(component,children)=>component.part==='title.logo'?<div className="gc-title-emblem" aria-hidden="true">{children}</div>:component.part==='title.menu'?<nav className="gc-title-menu">{children}</nav>:component.part==='title.workTitle'?<h1>{this.options.snapshot.project.name}{children}</h1>:component.part==='title.description'?<p>{this.options.snapshot.project.description}{children}</p>:undefined})}
    </>,true);
  }
  private askingName = false;
  private mainStorySessionReady = true;
  async syncCurrentMainStory(allowStarting=false): Promise<boolean> {
    const inspection=this.options.session.inspect();
    if(this.mainStorySessionReady===false||this.starting&&!allowStarting||!inspection||inspection.state.story?.kind==='afterstory'||this.flowSources?.length)return true;
    const saved=await this.options.data.saveCurrentMainStory(currentMainStory(this.options.snapshot.project.player.name,inspection.state));
    this.report(saved);return saved.ok;
  }
  async newGame(playerName?: string, afterstoryCharacterId?: Id) {
    if(this.starting)return;
    const character=afterstoryCharacterId?this.options.snapshot.characters.find(character=>character.id===afterstoryCharacterId&&character.narrativeRole==='main'):null;
    const afterstory=character?.afterstory;
    if(afterstoryCharacterId&&(!character||!afterstoryUnlocked(character,this.options.data.current()!.longTerm.endings))){this.showError('后日谈尚未解锁');return;}
    const name = this.options.snapshot.project.player.name;
    if (!afterstory && name?.allowCustom && playerName === undefined && shouldConfirmPlayerName(name,this.options.data.current()!.currentMainStory)) {
      this.askingName = true; this.composing = false; this.inputDraft = name.defaultName; this.showError('');
      await this.animateNavigation(()=>this.navigation.replace('input')); return;
    }
    if (!afterstory && name?.allowCustom && playerName !== undefined && (!playerName.trim() || countNameCharacters(playerName) > name.maxLength)) {
      this.showError(!playerName.trim()?this.t('请填写姓名。','Enter a name.','名前を入力してください。'):this.t(`姓名最多 ${name.maxLength} 个可见字符，请缩短后确认。`,`Use at most ${name.maxLength} visible characters, then confirm.`,`名前は${name.maxLength}文字以内で入力してください。`));this.render();return;
    }
    this.starting=true;this.startingAfterstory=afterstoryCharacterId??null;this.render();
    const release=this.holdVisual();
    try {
    if(afterstory&&!await this.syncCurrentMainStory(true))return;
    if(afterstory&&this.options.session.inspect()?.status!=='ended'&&this.options.session.inspect()&&!await this.save('continue'))return;
    const snapshot = this.options.snapshot, entry = afterstory?.entry??snapshot.project.entry;
    const scene = snapshot.scenes.find(item => item.scene.id === entry.sceneId);
    const position = { sceneId: entry.sceneId, statementId: entry.labelId ? scene?.labels[entry.labelId] ?? null : scene?.instructions[0]?.statementId ?? null };
    if (!position.statementId) { this.showError('起始剧情不可用'); return; }
    const scenario = { schemaVersion: 1 as const, id: createId(), name: 'New game', projectId: snapshot.projectId,
      entry: position, target: position, initialProgress: afterstory
        ? {...afterstory.initialProgress,...initialNameProgress(name,this.options.data.current()!.currentMainStory)}
        : name?.allowCustom&&name.variableId?{[name.variableId]:playerName?.trim()??mainStoryName(name,this.options.data.current()!.currentMainStory)!}:{}, pluginInitial: {}, route: [], playerInputs: [],
      externalPolicy: 'simulate' as const, engineVersion: snapshot.engineVersion,
      pluginVersions: [snapshot.lock.engine, ...snapshot.lock.plugins, snapshot.lock.template] };
    const prepared = await this.options.session.prepareSession({ snapshot, domain: this.options.data.domain,
      source: { kind: 'entry', scenario }, target: null,
      story: afterstory?{kind:'afterstory',entryId:afterstory.id,characterId:character!.id,title:afterstory.title}:{kind:'main'} }); this.report(prepared); if (!prepared.ok) return;
    const stage = await this.options.stage.prepareStage(prepared.value.sessionId, prepared.value.state.presentation, null,
      prepared.value.voiceBinding); if (!stage.ok) { this.setStageError(stage.error); this.options.session.disposePrepared(prepared.value.id); return; }
    const previousSessionId = this.options.session.inspect()?.sessionId ?? null;
    const activated = this.options.session.activate(prepared.value.id); this.report(activated); if (!activated.ok) return;
    if(!afterstory)this.mainStorySessionReady=false;
    this.askingName = false;
    if (previousSessionId) { this.options.audio.disposeSession(previousSessionId);
      this.options.onSessionEnd(previousSessionId); }
    this.options.longTerm.setActiveSession(activated.value.sessionId);
    const owner = activated.value.token ?? { sessionId: activated.value.sessionId,
      occurrence: activated.value.state.occurrence, statementId: activated.value.state.position.statementId! };
    const displayed = this.options.stage.commitStage(stage.value.id, owner);
    if (!displayed.ok) { this.setStageError(displayed.error); return; }
    this.setStageError(null);
    this.showStory();
    const started = await this.options.session.start(); this.report(started); if (!started.ok) return;
    if(!afterstory)this.flowSources=[];
    if(!afterstory){this.mainStorySessionReady=true;if(!await this.syncCurrentMainStory(true))return;}
    this.showStory();
    await this.waitForTargetPresentation();
    } catch(error) { if(!this.disposed)this.showError(issueFromError(error,'M07')); }
    finally {release();this.starting=false;this.startingAfterstory=null;if(!this.disposed)this.render();}
  }
  private story(choices?: ReactNode) {
    const inspection = this.options.session.inspect(); if (!inspection) { this.mountPage(<p>{this.t('没有活动剧情','No active story','進行中の物語はありません')}</p>); return; }
    const state = inspection.state;
    if (state.wait?.kind === 'plugin' && state.wait.page && inspection.token) {
      const key = JSON.stringify(inspection.token);
      if (this.pluginOpenToken !== key) { this.pluginOpenToken = key; this.open(state.wait.page); return; }
    }
    if (state.wait?.kind === 'input' || state.wait?.kind === 'choice' && !choices) {if(this.visualHold)this.openImmediate(state.wait.kind);else this.open(state.wait.kind);return;}
    const choosing = state.wait?.kind === 'choice';
    const activeIntro = !!state.presentation.intro && isIntroWait(this.options.snapshot, state, inspection.token);
    const reading = state.presentation.text.reading, nvl = reading?.mode === 'nvl';
    const readingPanel = this.part('story', 'story.readingPanel');
    const displayed = state.presentation.text.text, clusters = graphemes(displayed);
    const runs = readingRuns(state.presentation.text.parts, this.options.snapshot.template.readingStyles,
      this.options.longTerm.current(this.options.data.domain).readStatements, nvl,
      {color:String(readingPanel?.content.nvlNameColor??'#ffffff'),bold:readingPanel?.content.nvlNameBold!==false}, state.presentation.text.fontSize);
    const pageStart = nvl ? reading.start : 0, pageEnd = nvl ? reading.end ?? clusters.length : clusters.length;
    const portraitSource = readingPortrait(state.presentation.objects, state.presentation.text, this.options.snapshot.characters, state.presentation.characterDifferences);
    const shown = state.wait?.kind === 'say' ? state.wait.textShown : clusters.length;
    const progress = textProgress(Math.min(shown,pageEnd));
    let panel: HTMLElement | null = null, portrait: HTMLCanvasElement | null = null;
    let body!: HTMLDivElement, toolbar: HTMLDivElement | null = null, edge: HTMLButtonElement | null = null, introHost: HTMLDivElement | null = null;
    const vertical=this.part('story','story.toolbar')?.layout.mode==='column';
    const toolbarVisibility=(visible:boolean)=>{
      if(!toolbar||this.toolbarVisible===visible)return;this.toolbarVisible=visible;
      const element=toolbar,component=this.part('story','story.toolbar'),binding=visible?'show':'hide';
      const source=this.options.snapshot.template.animations.find(item=>item.id===component?.animations[binding]);
      let animation=source&&structuredClone(source);
      if(animation){const config=this.options.snapshot.template.pages.find(page=>page.key==='story')?.toolbar;
        const rect=element.getBoundingClientRect(),canvas=this.canvasRoot.getBoundingClientRect(),scale=this.uiScale;
        const direction=visible?config?.enterFrom:config?.exitTo;
        const dx=direction==='left'?(canvas.left-rect.right)/scale:direction==='right'?(canvas.right-rect.left)/scale:0;
        const dy=direction==='up'?(canvas.top-rect.bottom)/scale:direction==='down'?(canvas.bottom-rect.top)/scale:0;
        const moving=animation.segments.some(segment=>segment.translateX||segment.translateY);
        if(moving)for(const segment of animation.segments){if(segment.translateX)segment.translateX=dx;if(segment.translateY)segment.translateY=dy;}
      }
      let player=this.partAnimations.get(element);if(!player){player=new PageTransition();this.partAnimations.set(element,player);}
      player.interrupt(element);element.classList.remove('gc-toolbar-hidden');element.inert=!visible;
      void player.play(element,animation,this.preferences().reducedMotion).then(()=>{if(this.toolbarVisible===visible&&!visible)element.classList.add('gc-toolbar-hidden');});
    };
    const reveal=()=>toolbarVisibility(true);
    const conceal=()=>{if(!choosing&&!this.preferences().toolbarLocked&&!toolbar?.contains(document.activeElement)&&!toolbar?.matches(':hover')&&!edge?.matches(':hover'))toolbarVisibility(false);};
    const quickId=this.options.data.current()!.index.quick[0];
    const voiceInstruction = this.options.snapshot.scenes.find(scene => scene.scene.id === state.position.sceneId)?.instructions.find(item => item.statementId === state.position.statementId);
    const replayable = state.wait?.kind === 'say' && inspection.token && voiceInstruction &&
      chooseVoice(this.options.snapshot, voiceInstruction, this.preferences().voiceLocale, inspection.token).binding !== null;
    this.mountPage(<>
      {state.presentation.intro && <div className="gc-intro-host" ref={node=>{introHost=node;}}/>}
      {state.wait?.kind==='plugin'&&state.wait.page&&<button onClick={()=>this.open(state.wait!.kind==='plugin'?state.wait!.page!:'story')}>{this.locale('action.open')}</button>}
      {choices}
      {this.preferences().filmMode&&state.presentation.film.enabled&&<FilmBars top={state.presentation.film.top} bottom={state.presentation.film.bottom}/>}
      {this.preferences().statusIcons&&(this.auto||this.skip||this.ctrlFast)&&<ReadingStatus mode={this.auto?'auto':'skip'} part={this.partRef('story','story.statusIcons')}/>}
      {!activeIntro && <ReadingSurface key={nvl?'nvl':'adv'} legacy={!readingPanel} nvl={nvl} runs={runs} start={pageStart} shown={Math.min(shown,pageEnd)} progress={progress} scale={this.preferences().fontScale} paragraphGap={nvl?Number(readingPanel?.content.nvlParagraphGap??16):undefined}
        compose={parts=>{const actions=businessParts(parts.children());return this.instances('story',{business:(component,children,context)=>{switch(component.part){case 'story.readingPanel':return parts.panel(<>{children}{actions.residual}</>);case 'story.nameBox':return parts.name(children);case 'story.nameText':return parts.nameText(children);case 'story.textBox':return parts.body(children);case 'story.bodyText':return parts.text(children);case 'story.avatar':return !nvl&&readingPanel?.content.portrait===true&&this.preferences().avatar?parts.portrait(children):null;case 'story.statusIcons':return null;case 'story.toolbar.more':return <details className="gc-toolbar-more"><summary title={this.t('更多','More','その他')} aria-label={this.t('更多','More','その他')}><ToolbarIcon kind="more"/></summary><nav>{children}{(this.options.pluginPages??[]).map(page=><button key={page.key} onClick={()=>this.open(page.key)}>{this.locale(page.titleKey)}</button>)}</nav></details>;default:return actions.render(component,children,context);}}});}}
        speaker={state.presentation.text.speakerName}
        panel={{onPointerMove:event=>{if(!toolbar)return;const rect=toolbar.getBoundingClientRect(),band=80*this.uiScale;if(event.clientY>=rect.top-band&&event.clientY<=rect.bottom+band&&event.clientX>=rect.left-band&&event.clientX<=rect.right+band)reveal();},onPointerLeave:()=>queueMicrotask(conceal),ref:node=>{panel=node;if(node&&readingPanel){this.stylePart('story','story.readingPanel',node,true);node.hidden=!choosing&&(this.hidden||!state.presentation.text.textboxVisible)||!readingPanel.visible;node.dataset.nameAbove=String(!nvl&&readingPanel.content.nameAbove===true);node.dataset.portrait=String(!nvl&&readingPanel.content.portrait===true&&this.preferences().avatar&&this.visible('story','story.avatar'));}}}}
        name={{hidden:this.hidden||nvl,ref:node=>{this.partRef('story','story.nameBox',!readingPanel)(node);if(node){node.hidden=nvl||this.hidden||!state.presentation.text.textboxVisible||!this.visible('story','story.nameBox')||!readingPanel&&!state.presentation.text.speakerName;node.style.visibility=state.presentation.text.speakerName?'':'hidden';}}}}
        nameText={{ref:this.partRef('story','story.nameText')}} body={{hidden:this.hidden,lang:this.options.snapshot.project.languages.textDefault,ref:node=>{if(node)body=node;}}} text={{ref:this.partRef('story','story.bodyText')}}
        portrait={readingPanel?.content.portrait===true&&this.preferences().avatar&&this.visible('story','story.avatar')&&(portraitSource?.kind==='image'
          ? <IndependentPortrait host={this.options.host} assetId={portraitSource.assetId} snapshot={this.options.snapshot} name={state.presentation.text.speakerName} unavailable={()=>this.showError(this.t('头像图片不可用','Portrait image unavailable','顔画像を利用できません'))}/>
          : portraitSource?.kind==='shared' ? <SharedPortrait host={this.options.host} snapshot={this.options.snapshot} characterId={portraitSource.characterId} current={()=>{const value=this.options.stage.capture();return value.ok?value.value:null;}} unavailable={message=>{this.portraitError=message;this.renderMessage();}}/>
          : <canvas className="gc-dialogue-portrait" width={440} height={440} aria-label={state.presentation.text.speakerName} ref={node=>{portrait=node;this.partRef('story','story.avatar')(node);}}/>)}>
        {<><button hidden={this.hidden&&!choosing} className="gc-toolbar-sentinel" onFocus={reveal} onClick={()=>{reveal();toolbar?.querySelector('button')?.focus();}}>{this.locale('toolbar.reveal')}</button>
          <div data-gc-part="story.toolbar" className={`gc-toolbar ${vertical?'gc-toolbar-vertical':''} ${!choosing&&!this.preferences().toolbarLocked&&!this.toolbarVisible?'gc-toolbar-hidden':''}`} ref={node=>{toolbar=node;this.partRef('story','story.toolbar',!readingPanel)(node);if(node)node.hidden=this.hidden&&!choosing;}} onPointerEnter={reveal} onPointerLeave={()=>queueMicrotask(conceal)} onFocus={reveal} onBlur={()=>queueMicrotask(conceal)}>
            <div className="gc-toolbar-group" ref={this.partRef('story','story.toolbar.progress')} role="group" aria-label={this.t('进度','Progress','進行状況')}>
              {['save','load'].map(page=><button key={page} data-focus-key={`nav.${page}`} ref={this.partRef('story',`story.toolbar.${page}`)} disabled={this.saving} onClick={()=>this.open(page)}>{this.locale(`page.${page}`)}</button>)}
              {this.visible('story','story.toolbar.quickSave')&&<button ref={this.partRef('story','story.toolbar.quickSave')} disabled={this.saving} onClick={()=>void this.save('quick')}>{this.locale('toolbar.quickSave')}</button>}
              {this.visible('story','story.toolbar.quickLoad')&&<button ref={this.partRef('story','story.toolbar.quickLoad')} disabled={!quickId||this.saving} onClick={()=>void this.load(quickId!)}>{this.locale('toolbar.quickLoad')}</button>}
            </div>
            <div className="gc-toolbar-group" ref={this.partRef('story','story.toolbar.tools')} role="group" aria-label={this.t('阅读工具','Reading tools','読書ツール')}>{['history','settings'].map(page=><button key={page} data-focus-key={`nav.${page}`} ref={this.partRef('story',`story.toolbar.${page}`)} onClick={()=>this.open(page)}>{this.locale(`page.${page}`)}</button>)}</div>
            <div className="gc-toolbar-group" ref={this.partRef('story','story.toolbar.pace')} role="group" aria-label={this.t('阅读节奏','Reading pace','読書速度')}>
              <button ref={this.partRef('story','story.toolbar.auto')} disabled={choosing} aria-pressed={this.auto} onClick={()=>{this.auto=!this.auto;this.skip=false;this.ctrlFast=false;this.autoReadyKey=null;this.autoReadyAt=null;this.render();}}>{this.locale('toolbar.auto')}</button>
              <button ref={this.partRef('story','story.toolbar.skip')} disabled={choosing} aria-pressed={this.skip||this.ctrlFast} onClick={()=>{this.skip=!this.skip;this.auto=false;this.ctrlFast=false;this.render();}}>{this.locale('toolbar.skip')}</button>
            </div>
            <button className="gc-toolbar-icon" title={this.locale('toolbar.lock')} aria-label={this.locale('toolbar.lock')} ref={this.partRef('story','story.toolbar.lock')} aria-pressed={this.preferences().toolbarLocked} onClick={()=>{const current=this.preferences();void this.options.data.savePreferences({...current,toolbarLocked:!current.toolbarLocked},current.revision).then(result=>{this.report(result);if(result.ok){this.toolbarVisible=true;this.render();}});}}>{<ToolbarIcon kind="lock"/>}</button>
            {this.visible('story','story.toolbar.replayVoice')&&<button className="gc-toolbar-icon" title={replayable?this.locale('toolbar.replayVoice'):this.t('当前句没有配音','No voice for this line','この台詞にボイスはありません')} aria-label={this.locale('toolbar.replayVoice')} ref={this.partRef('story','story.toolbar.replayVoice')} disabled={!replayable} onClick={()=>void this.replayVoice()}>{<ToolbarIcon kind="voice"/>}</button>}
            <details data-gc-part="story.toolbar.more" className="gc-toolbar-more"><summary title={this.t('更多','More','その他')} aria-label={this.t('更多','More','その他')}><ToolbarIcon kind="more"/></summary><nav>
              {['cg','music','flow','characters'].filter(page=>this.options.snapshot.template.pages.some(p=>p.key===page)&&this.visible('story',`story.toolbar.${page}`)).map(page=><button key={page} ref={this.partRef('story',`story.toolbar.${page}`)} disabled={!this.canOpen(page)} onClick={()=>this.open(page)}>{this.locale(`page.${page}`)}</button>)}
              {(this.options.pluginPages??[]).map(page=><button key={page.key} onClick={()=>this.open(page.key)}>{this.locale(page.titleKey)}</button>)}
              <button ref={this.partRef('story','story.toolbar.hideUI')} onClick={()=>{this.hidden=true;this.render();}}>{this.locale('toolbar.hideUI')}</button>
              <button ref={this.partRef('story','story.toolbar.title')} onClick={()=>void this.returnTitle()} disabled={this.saving}>{this.flowSources.at(-1)?this.t('返回原剧情','Return to story','元の物語へ戻る'):this.locale('nav.title')}</button>
            </nav></details>
          </div><button data-gc-part="story.toolbar.trigger" className={`gc-toolbar-edge ${vertical?'gc-toolbar-edge-right':''}`} aria-label={this.locale('toolbar.reveal')} ref={node=>{edge=node;}} onPointerEnter={reveal} onPointerLeave={()=>queueMicrotask(conceal)} onClick={reveal}/></>
          }
      </ReadingSurface>}
    </>,true);
    // This empty React-owned boundary delegates its children to the frame-driven intro presenter.
    if(state.presentation.intro&&introHost)this.intro(state.presentation.intro,activeIntro,introHost);
    if(activeIntro)return;
    if(!body){this.showError(this.t('阅读页缺少正文容器，请在页面设计中恢复正文部件。','The reading page needs its text container. Restore the reading text part in the page designer.','読書ページの本文領域をページデザイナーで復元してください。'));return;}
    const textBox = this.part('story', 'story.textBox');
    this.stylePart('story', 'story.textBox', body, !readingPanel); body.hidden=this.hidden||!state.presentation.text.textboxVisible||!this.visible('story','story.textBox');
    body.style.display='grid';body.style.alignItems='start';body.style.justifyContent='stretch';body.style.gridTemplateColumns='minmax(0,1fr)';
    if (textBox) { body.style.minHeight = `${textBox.layout.minHeight * 1}px`;
      if (textBox.layout.maxHeight) body.style.maxHeight = `${textBox.layout.maxHeight * 1}px`; }
    body.style.fontSize = `${this.options.snapshot.template.defaultVisual.fontSize * this.preferences().fontScale}px`;
    const bodyText=body.querySelector<HTMLElement>('[data-gc-part="story.bodyText"]');
    if(bodyText)bodyText.style.fontSize=`${(this.part('story','story.bodyText')?.normal.fontSize??this.options.snapshot.template.defaultVisual.fontSize)*this.preferences().fontScale*1}px`;
    const measure=body.querySelector<HTMLElement>('.gc-dialogue-measure');
    if(measure&&bodyText){measure.style.fontSize=bodyText.style.fontSize;measure.style.lineHeight=bodyText.style.lineHeight;measure.style.fontFamily=bodyText.style.fontFamily;}
    const background = (readingPanel ?? textBox)?.normal.background ?? this.options.snapshot.template.defaultVisual.background;
    const backgroundHost = readingPanel && panel ? panel : body;
    Object.assign(backgroundHost.style, readingBackground(background, this.preferences().textboxOpacity, readingPanel?.content.gradient === true));
    const readingHost=panel as HTMLElement|null, portraitCanvas=portrait as HTMLCanvasElement|null;
    if (nvl && readingHost) {
      readingHost.style.setProperty('--gc-nvl-padding',`${Number(readingPanel?.content.nvlPadding??72)*1}px`);
      readingHost.style.setProperty('--gc-nvl-gap',`${20*1}px`);
      readingHost.style.setProperty('--gc-nvl-line-height',String(readingPanel?.content.nvlLineHeight??1.8));
      readingHost.style.setProperty('--gc-nvl-scrim',`color-mix(in srgb, ${String(readingPanel?.content.nvlScrimColor??'#000000')} ${Number(readingPanel?.content.nvlScrimOpacity??.65)*100}%, transparent)`);
      Object.assign(readingHost.style, { position:'absolute', inset:'0', width:'100%', height:'100%', maxHeight:'none', boxSizing:'border-box', translate:'none', transform:'none',
        padding:`${Number(readingPanel?.content.nvlPadding??72)*1}px`, gridTemplateRows:'minmax(0,1fr) auto', gridTemplateColumns:'minmax(0,1fr)', gap:`${20*1}px` });
      readingHost.style.backgroundImage='none'; readingHost.style.backgroundColor=`color-mix(in srgb, ${String(readingPanel?.content.nvlScrimColor??'#000000')} ${Number(readingPanel?.content.nvlScrimOpacity??.65)*100}%, transparent)`;
      Object.assign(body.style, { display:'block', minHeight:'0', maxHeight:'none', height:'100%', overflow:'hidden', lineHeight:String(readingPanel?.content.nvlLineHeight??1.8), whiteSpace:'pre-wrap', overflowWrap:'anywhere' });
      if (bodyText) bodyText.style.lineHeight = 'inherit';
      const generation=this.renderSequence;
      requestAnimationFrame(()=>{
        if(this.disposed||generation!==this.renderSequence||!inspection.token||!body.isConnected)return;
        try {
          const previousParts=state.presentation.text.parts.slice(0,-1), newParagraph=graphemes(nvlRuns(previousParts).map(run=>run.text).join('')).length+(previousParts.length?2:0);
          const measured=measureNvlPage(body,runs,{start:reading!.start,shown,newParagraph,scale:this.preferences().fontScale*1,paragraphGap:Number(readingPanel?.content.nvlParagraphGap??16)*1});
          if(reading!.end!==measured.end||reading!.start!==measured.start){const result=this.options.session.updateNvlLayout({token:inspection.token,...measured});this.report(result);if(result.ok)this.render();}
        } catch(error) { this.showError(this.t('阅读分页失败，请调整窗口或字号后重试。','Reading layout failed. Resize the window or adjust the font size to retry.','改ページに失敗しました。ウィンドウまたは文字サイズを調整してください。')); }
      });
    }
    if(readingPanel && readingHost) {
      if(readingPanel.layout.mode==='grid'&&readingPanel.layout.columns<=2){readingHost.style.display='grid';readingHost.style.gridTemplateColumns=!nvl&&readingPanel.content.portrait===true&&this.preferences().avatar?`${Number(readingPanel.content.portraitWidth??220)}px minmax(0,1fr)`:'minmax(0,1fr)';}
      readingHost.style.setProperty('--gc-reading-ink', readingPanel.normal.color ?? '#FFFFFF');
      // The panel owns the shared reading surface, including when an older theme styles its children.
      for(const child of readingHost.querySelectorAll<HTMLElement>('.gc-speaker,.gc-body,.gc-toolbar'))
        for(const [property,value] of Object.entries({background:'transparent',border:'0','box-shadow':'none','backdrop-filter':'none'}))child.style.setProperty(property,value,'important');
      readingHost.style.setProperty('--gc-portrait-width',`${Number(readingPanel.content.portraitWidth??220)*1}px`);
      if(portraitCanvas) {
        const canvas=portraitCanvas, host=readingHost, sequence=this.renderSequence;
        const draw=()=>{if(this.disposed||sequence!==this.renderSequence||!host.isConnected)return;
          const shown=this.options.stage.drawPortrait(canvas,this.options.session.inspect()?.state.presentation.text??state.presentation.text);
          canvas.setAttribute('aria-hidden',String(!shown));host.dataset.portraitPresent=String(shown);requestAnimationFrame(draw);
        };requestAnimationFrame(draw);
      }
    }
    const reportViewport = () => {
      if(nvl)return;
      const viewport = readingViewport(body, Array.from(displayed).length);
      if (!viewport.atEnd) this.autoReadyAt = null;
      if (inspection.token && this.navigation.page === 'story' &&
        sameToken(this.options.session.inspect()?.token ?? null, inspection.token))
        this.options.session.updateReadingViewport({ token: inspection.token,
        ...viewport });
    };
    body.onscroll = reportViewport;
    requestAnimationFrame(() => {
      if (state.wait?.kind === 'say' && state.wait.textAnchor > 0)
        body.scrollTop = state.wait.textAnchor / Math.max(1, clusters.length) * body.scrollHeight;
      reportViewport();
    });
    if (this.storyActive && (this.skip || this.ctrlFast) && inspection.token) {
      this.scheduleSkip();
    } else if (this.storyActive && state.wait?.kind === 'say' && shown < pageEnd && inspection.token && (!nvl||reading!.end!==null)) {
      this.autoReadyAt = null;
      const sequence=this.renderSequence;
      const tick = (count:number) => { this.typingTimer = setTimeout(() => {
        if (this.disposed||sequence!==this.renderSequence||!this.storyActive||this.navigation.page !== 'story' || !sameToken(this.options.session.inspect()?.token ?? null, inspection.token)) return;
        void this.options.session.updateTextProgress({ token: inspection.token!, textShown: count }).then(result => {
          if (!sameToken(this.options.session.inspect()?.token ?? null, inspection.token)) return;
          if(!result.ok){this.report(result);return;}
          progress.reveal(count);
          if(count<pageEnd)tick(count+1);else this.render(); });
      }, 1000 / this.preferences().textSpeed); };
      tick(shown+1);
    } else if (this.storyActive && this.auto && state.wait?.kind === 'say' && inspection.token) {
      const token = inspection.token, key = `${token.sessionId}/${token.occurrence}/${token.statementId}`;
      if (this.autoReadyKey !== key) { this.autoReadyKey = key; this.autoReadyAt = null; }
      const poll = () => {
        if (!this.auto || !body.isConnected || this.navigation.page !== 'story' ||
          !sameToken(this.options.session.inspect()?.token ?? null, token)) return;
        if (this.autoAttempting) { this.autoTimer = setTimeout(poll, 100); return; }
        this.autoAttempting = true;
        void (async () => {
          try {
            const synced = await this.options.syncStage(); if (!synced.ok) { this.report(synced); return; }
            const latest = this.options.session.inspect(); if (!this.storyActive || !this.auto || !latest || !sameToken(latest.token, token)) return;
            const clock = autoReadClock(this.autoReadyAt, performance.now(), {
              textComplete: latest.state.wait?.kind === 'say' && latest.state.wait.textComplete,
              textAtEnd: readingViewport(body, Array.from(displayed).length).atEnd,
              voiceEnded: dialogueVoiceEnded(this.options.audio, latest.sessionId, token, latest.state.presentation.voice),
              animationComplete: latest.state.presentation.transitions.length === 0,
            });
            this.autoReadyAt = clock.readyAt;
            if (clock.readyAt === null || clock.elapsedMs < this.preferences().autoWaitMs) return;
            const result = await this.options.session.tryAutoAdvance({ voiceEnded: true,
              animationComplete: true, readyDurationMs: clock.elapsedMs, autoWaitMs: this.preferences().autoWaitMs });
            if (!result.ok) {this.report(result);this.stopModes();this.render();}
            else if (result.value.advanced) this.render();
          } finally { this.autoAttempting = false;
            if (this.auto && body.isConnected && this.navigation.page === 'story' &&
              sameToken(this.options.session.inspect()?.token ?? null, token)) this.autoTimer = setTimeout(poll, 100); }
        })();
      };
      this.autoTimer = setTimeout(poll, Math.min(this.preferences().autoWaitMs, 100));
    }
  }

  private stopModes() {
    this.auto=false;this.skip=false;this.ctrlFast=false;this.autoReadyAt=null;
    if(this.skipTimer){clearTimeout(this.skipTimer);this.skipTimer=null;}
  }
  private loseInputFocus() { this.ctrlDown=false;this.stopModes(); }
  private scheduleSkip() {
    if(this.skipTimer || this.skipAttempting)return;
    this.skipTimer=setTimeout(()=>{this.skipTimer=null;
      if(!this.storyActive||!(this.skip||this.ctrlFast))return;
      this.skipAttempting=true;
      void this.options.session.skipStep(this.ctrlFast?'all':this.preferences().skipScope).then(result=>{
        if(!result.ok){this.report(result);this.stopModes();}
        else if(!result.value.continued)this.stopModes();
      }).finally(()=>{this.skipAttempting=false;if(!this.disposed)this.render();});
    },50);
  }
  private async advance() {
    if(this.transition.busy||!this.storyActive)return;
    if(this.auto||this.skip||this.ctrlFast){this.stopModes();this.render();return;}
    if (this.hidden) { this.hidden = false; this.render(); return; }
    const inspection = this.options.session.inspect(); if (!inspection?.token) return;
    if (isIntroWait(this.options.snapshot, inspection.state, inspection.token)) {
      const synced = await this.options.syncStage(); this.report(synced); if (!synced.ok) return;
      if (this.options.stage.advanceIntro()) { const updated = await this.options.syncStage();
        this.report(updated); if (updated.ok) this.render(); }
      return;
    }
    const body = this.content.querySelector<HTMLElement>('.gc-body');
    if (inspection.state.presentation.text.reading?.mode !== 'nvl' && body && inspection.state.wait?.kind === 'say' && inspection.state.wait.textComplete &&
      body.scrollTop + body.clientHeight < body.scrollHeight - 2) {
      body.scrollBy({ top: body.clientHeight - 24, behavior: this.preferences().reducedMotion ? 'instant' : 'smooth' });
      return;
    }
    const synced = await this.options.syncStage(); this.report(synced); if (!synced.ok) return;
    if(!this.storyActive||!sameToken(this.options.session.inspect()?.token??null,inspection.token))return;
    const result = await this.options.session.dispatch({ kind: 'advance', token: inspection.token });
    this.report(result); this.render();
  }
  private intro(state: NonNullable<PresentationState['intro']>, active: boolean, host: HTMLElement) {
    const panel = document.createElement('div'); panel.className = active ? 'gc-intro' : 'gc-intro gc-intro-retained';
    panel.style.backgroundColor = state.backgroundColor; panel.style.color = state.textColor;
    if (state.fontSize !== null) panel.style.fontSize = `${state.fontSize}px`;
    const paragraph = text('p', ''); panel.append(paragraph);
    if (active) panel.addEventListener('pointerup', event => { event.stopPropagation(); void this.advance(); });
    host.replaceChildren(panel); this.updateIntroFrame(state);
    if (state.backgroundImage) {
      const asset = this.options.snapshot.assets.find(item => item.assetId === state.backgroundImage);
      if (asset) { const generation = this.introGeneration;
        void this.options.host.resources.resolve(asset.assetId, asset.variantId).then(result => {
          if (!result.ok) { this.report(result); return; }
          if (generation !== this.introGeneration) { result.value.release(); return; }
          this.introRelease = result.value.release; panel.style.backgroundImage = `url("${result.value.uri}")`;
        }); }
    }
  }
  updateStageFrame(state: PresentationState) {
    const opacity = state.text.textboxOpacity ?? (state.text.textboxVisible ? 1 : 0);
    const panel = this.content.querySelector<HTMLElement>('.gc-reading-panel');
    const text = panel ? [panel] : [...this.content.querySelectorAll<HTMLElement>('.gc-reading-legacy .gc-speaker, .gc-reading-legacy .gc-body')];
    for (const element of text) { element.style.opacity = String(opacity); element.style.pointerEvents = opacity === 0 ? 'none' : ''; }
    const bars = this.content.querySelectorAll<HTMLElement>('.gc-film-bars > div');
    if (bars[0]) bars[0].style.height = `${(state.film.enabled ? state.film.top : 0) * 100}%`;
    if (bars[1]) bars[1].style.height = `${(state.film.enabled ? state.film.bottom : 0) * 100}%`;
  }
  updateIntroFrame(state: PresentationState['intro']) {
    const panel = this.content.querySelector<HTMLElement>('.gc-intro'); if (!panel) return;
    if (!state) { panel.hidden = true; return; }
    panel.hidden = false;
    panel.querySelector('p')!.textContent = Array.from(state.paragraphs[state.index] ?? '').slice(0, state.shown).join('');
  }
  private choiceInstances() {
    const inspection=this.options.session.inspect();if(!inspection?.token||inspection.state.wait?.kind!=='choice'){this.mountPage(<p className="gc-page-empty">{this.t('当前没有选项','No choices are active','現在の選択肢はありません')}</p>);return;}
    const available=inspection.state.wait.optionIds;
    const key=JSON.stringify(inspection.token);
    if(this.options.prepareChoiceAssets&&this.warmedChoice!==key){this.warmedChoice=key;void this.options.prepareChoiceAssets(choiceFirstAssets(this.options.snapshot,inspection.token,available)).catch(()=>{});}
    this.story(this.instances('choice',{business:(component,children)=>component.part===this.options.snapshot.template.pages.find(page=>page.key==='choice')?.root.part?<div style={{position:'absolute',inset:0}}>{children}</div>:component.part==='choice.list'?<div className="gc-choice-list" role="group" aria-label={this.locale('page.choice')}>{children}{!available.length&&<button autoFocus onClick={()=>this.open('load')}>{this.locale('title.load')}</button>}</div>:undefined}));
  }
  private inputInstances() {
    const inspection=this.options.session.inspect();
    if(!this.askingName&&(!inspection?.token||inspection.state.wait?.kind!=='input')){this.mountPage(<p className="gc-page-empty">{this.t('当前没有输入请求','No input is requested','現在の入力要求はありません')}</p>);return;}
    const instruction=this.options.snapshot.scenes.flatMap(scene=>scene.instructions).find(item=>item.statementId===inspection?.token?.statementId);
    const args=instruction?.args as {prompt?:string;defaultText?:string;maxLength?:number}|undefined;
    const name=this.options.snapshot.project.player.name;
    if(!this.askingName&&this.inputToken!==JSON.stringify(inspection?.token)){this.inputToken=JSON.stringify(inspection?.token);this.inputDraft=args?.defaultText??'';}
    const prompt=this.askingName?this.t('主角姓名','Protagonist name','主人公の名前'):args?.prompt??this.locale('page.input');
    const validationId=`input-validation-${this.options.snapshot.template.instanceId}`;
    const submit=async()=>{if(!this.composing)await this.dispatchPageAction({kind:'submitInput',text:this.inputDraft});};
    this.mountPage(this.instances('input',{state:(component)=>component.part==='input.prompt'?{text:prompt}:component.part==='input.counter'?{text:`${this.askingName?countNameCharacters(this.inputDraft):graphemes(this.inputDraft).length} / ${this.askingName?name?.maxLength??'':args?.maxLength??''}`}:component.part==='input.validation'?{text:this.operationMessage,visible:!!this.operationMessage}:{},
      activate:async(component)=>{if(component.part==='input.confirm')await submit();if(component.part==='input.cancel')await this.cancelInput();},
      business:(component,children)=>component.part==='input.field'?<input autoFocus aria-label={prompt} aria-invalid={!!this.operationMessage} aria-describedby={this.operationMessage?validationId:undefined} value={this.inputDraft} placeholder={this.askingName?name?.defaultName:prompt} onChange={event=>{this.inputDraft=event.currentTarget.value;this.showError('');this.render();}} onCompositionStart={()=>{this.composing=true;}} onCompositionEnd={()=>{this.composing=false;}} onKeyDown={event=>{if(event.nativeEvent.isComposing||this.composing)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();void this.cancelInput();}if(event.key==='Enter'){event.preventDefault();event.stopPropagation();void submit();}}}/>:component.part==='input.validation'?<p id={validationId} role="alert">{this.operationMessage}</p>:undefined}));
  }
  private async cancelInput() {
    if (this.askingName) { this.askingName=false;this.composing=false;this.inputDraft='';this.showError('');this.navigation.replace('title');return; }
    const inspection=this.options.session.inspect(); if(!inspection?.token)return;
    const synced=await this.options.syncStage();this.report(synced);if(!synced.ok)return;
    const result=await this.options.session.dispatch({kind:'cancel',token:inspection.token});this.report(result);
    if(result.ok){this.inputDraft='';this.showStory();}
  }
  private saves(mode: 'save'|'load') {
    this.mountPage(<SavePage compose={adapter=>{const {data,...overrides}=adapter;const context=this.instanceContext(mode);return this.instances(mode,{...overrides,context:{...context,data:{...context.data,...data}}});}} data={this.options.data} mode={mode} category={this.category} pageNumber={this.pageNumber} saving={this.saving} locale={this.preferences().menuLocale} label={key=>this.locale(key)} part={key=>this.partRef(mode,key,[`${mode}.detail`,`${mode}.grid`,`${mode}.categoryTabs`,`${mode}.pagination`,`${mode}.primary`,`${mode}.back`].includes(key))} setCategory={value=>{this.category=value;this.pageNumber=0;this.render();}} setPage={value=>{this.pageNumber=value;this.render();}} addPage={()=>{const index=this.options.data.current()!.index;void this.options.data.addManualPage(index.revision).then(result=>{this.report(result);if(result.ok){this.pageNumber=Math.max(0,Math.ceil(result.value.manual.length/12)-1);this.render();}});}} notice={this.saveReceipt} save={slot=>this.save('manual',slot)} load={id=>this.load(id)} back={()=>this.back()}/>);
  }
  private save(kind: SaveRecord['kind'], slotId?: Id): Promise<boolean> {
    if(this.saving)return Promise.resolve(false);
    const operation=this.saveOwned(kind,slotId);this.savingTask=operation;
    void operation.then(()=>{if(this.savingTask===operation)this.savingTask=null;},()=>{if(this.savingTask===operation)this.savingTask=null;});
    return operation;
  }
  private async saveOwned(kind: SaveRecord['kind'], slotId?: Id): Promise<boolean> {
    const originFocus=(document.activeElement as HTMLElement|null)?.dataset.focusKey,originPage=this.navigation.page;
    this.saving = true;
    this.options.root.setAttribute('aria-busy', 'true');
    this.render();
    try { return await this.writeSave(kind, slotId); }
    finally {
      this.saving = false;
      this.options.root.setAttribute('aria-busy', 'false');
      if (!this.disposed) this.render();
      requestAnimationFrame(()=>{if(!this.disposed&&this.navigation.page===originPage){const target=originFocus?this.options.root.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(originFocus)}"]`):null;(target??this.options.root).focus({preventScroll:true});}});
    }
  }
  private async writeSave(kind: SaveRecord['kind'], slotId?: Id): Promise<boolean> {
    const inspection = this.options.session.inspect(); if (!inspection) return false;
    if(kind==='continue'&&(this.flowSources?.length||this.mainStorySessionReady===false))return true;
    const priorRecordId = this.options.data.current()!.index.manual.find(item => item.slotId === slotId)?.recordId ?? null;
    if (kind === 'manual' && priorRecordId && this.preferences().confirmations.overwrite) {
      const number=this.options.data.current()!.index.manual.findIndex(item=>item.slotId===slotId)+1;
      const record=await this.options.data.record(priorRecordId);
      const description=record.ok&&record.value?`\n${record.value.summary.sceneName}\n${record.value.summary.text}`:'';
      if(!await this.ask(this.t(`覆盖手动存档 ${String(number).padStart(2,'0')} 的已有进度？`,`Overwrite the existing progress in manual slot ${String(number).padStart(2,'0')}?`,`手動セーブ ${String(number).padStart(2,'0')} の進行状況を上書きしますか？`)+description,this.t('覆盖存档','Overwrite save','上書きする'),'save:save.primary','overwrite'))return false;
    }
    const waitPolicy = this.options.session.pluginWaitPolicy();
    const unstable = !!this.options.entryPresentation?.active || ['loading', 'playing', 'fading', 'error'].includes(this.options.video.state) || !waitPolicy.restorable;
    if (unstable && kind !== 'continue') { this.showError(waitPolicy.reason ?? '当前演出尚不能捕获，请稍后保存'); return false; }
    const checkpoint = unstable ? this.options.session.checkpointsFor(inspection.sessionId).filter(checkpoint=>checkpoint.state.entryPresentation?.completed!==false).at(-1) : null;
    if (unstable && !checkpoint) { this.showError('当前没有可用的退出检查点'); return false; }
    if (!checkpoint) { await this.options.waitForStage();
      if (this.options.session.inspect()?.sequence !== inspection.sequence) {
        this.showError('剧情已推进，请重新保存'); return false;
      }
      const synced = await this.options.syncStage(); this.report(synced); if (!synced.ok) return false;
    }
    const state = structuredClone(checkpoint?.state ?? inspection.state);
    let thumbnail: Uint8Array | undefined;
    if (!checkpoint) {
      const captured = this.options.stage.capture(); this.report(captured); if (!captured.ok) return false;
      const reading = state.presentation.text.reading;
      state.presentation = captured.value;
      if (reading) state.presentation.text.reading = reading;
      thumbnail = await new Promise<Uint8Array | undefined>(resolve => this.options.stage.captureFrame().toBlob(blob => {
        if (!blob) { resolve(undefined); return; }
        void blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)));
      }, 'image/png'));
    }
    const recordId = createId();
    const record = this.options.data.makeRecord({ snapshot: this.options.snapshot,
      inspection: { state, history: checkpoint ? inspection.history.filter(entry => entry.occurrence <= state.occurrence) : inspection.history }, kind,
      thumbnail: thumbnail ? `thumbnails/${recordId}.png` : null, recordId });
    const result = await savePreparedRecord(this.options.data, { kind, slotId, record,
      overwriteConfirmed: true,
      thumbnail }, priorRecordId);
    this.report(result); if (result.ok) { if(!await this.syncCurrentMainStory())return false;this.selectedSave = recordId; this.saveReceipt=this.t('进度已保存','Progress saved','進行状況を保存しました'); this.render(); }
    return result.ok;
  }
  private async load(recordId: Id) {
    if (this.preferences().confirmations.load && !await this.ask(this.locale('title.load'),undefined,undefined,'load')) return;
    const context = this.options.restore.context(); this.report(context); if (!context.ok) return;
    const requestId = createId();
    const prepared = await this.options.restore.prepareLoad({ requestId, recordId, context: context.value });
    this.report(prepared); if (!prepared.ok) return;
    const accepted = prepared.value.mappings.length ? await this.confirmMappings(prepared.value.mappings) : true;
    if (!accepted) { this.options.restore.disposePreparedRestore(requestId); return; }
    const release=this.holdVisual();
    try {
    const committed = this.options.restore.commitLoad({ requestId, acceptMappings: accepted });
    this.report(committed); if (committed.ok) { this.options.longTerm.setActiveSession(committed.value.sessionId);
      this.mainStorySessionReady=false;
      this.showStory();
      if (this.options.session.inspect()?.state.phase === 'entry') {
        const started=await this.options.session.start();this.report(started);if(!started.ok)return;this.render();
      }
      this.mainStorySessionReady=true;if(!await this.syncCurrentMainStory())return;
      await this.waitForTargetPresentation();
    }
    } finally {release();}
  }
  private async replayVoice() {
    const synced = await this.options.syncStage(); this.report(synced);
    if (synced.ok) this.report(this.options.session.replayVoice());
  }
  private confirmMappings(mappings: EntryMapping[]) {
    const unique = mappings.filter((item, index) => mappings.findIndex(other => other.oldRelease === item.oldRelease &&
      other.oldSceneId === item.oldSceneId && other.oldStatementId === item.oldStatementId &&
      other.newSceneId === item.newSceneId && other.newStatementId === item.newStatementId) === index);
    return this.ask(`${this.locale('restore.mapping')}\n${unique.map(item =>
      `${item.oldSceneId}/${item.oldStatementId} → ${item.newSceneId}/${item.newStatementId} (${item.reason})`).join('\n')}\n${this.locale('restore.mappingConfirm')}`);
  }
  private async playHistoryVoice(id: Id): Promise<void> {
    const entry = this.options.session.inspect()?.history.find(item => item.id === id), sessionId = this.options.session.inspect()?.sessionId;
    const asset = this.options.snapshot.assets.find(item => item.assetId === entry?.voiceAssetId); if (!entry || !asset || !sessionId) return;
    if (this.auditionId) this.options.audio.stop(this.auditionId);
    const result = await this.options.audio.play({ sessionId, bus: 'ui', preview: true, state: { assetId: asset.assetId, variantId: asset.variantId, stopped: false, volume: 1, startSec: 0, loop: false, loopStartSec: 0, loopEndSec: null, fadeInMs: 0, fadeOutMs: 0 } });
    this.report(result); if (result.ok) this.auditionId = result.value;
  }
  private async jumpHistory(id: Id): Promise<void> {
    const entries = this.options.session.inspect()?.history ?? [], entry = entries.find(item => item.id === id);
    if (!entry?.entryState || !await this.ask(this.t('回到这条历史？此后的阅读历史将被截断。', 'Return to this entry? Later history will be removed.', 'この履歴に戻りますか？以降の履歴は削除されます。'))) return;
    const state = structuredClone(entry.entryState);
    state.presentation.voice = null;
    delete state.pendingReadStatementId;
    const record = this.options.data.makeRecord({ snapshot: this.options.snapshot, inspection: { state, history: entries.slice(0, entries.indexOf(entry)) }, kind: 'manual' });
    const context = this.options.restore.context(); if (!context.ok) { this.report(context); return; }
    const requestId = createId(), prepared = await this.options.restore.prepareRestore({ requestId, purpose: 'activate', source: { kind: 'save', record }, context: context.value }); this.report(prepared); if (!prepared.ok) return;
    const acceptMappings = !prepared.value.mappings.length || await this.confirmMappings(prepared.value.mappings);
    if (!acceptMappings) { this.options.restore.disposePreparedRestore(requestId); return; }
    const committed = this.options.restore.commitLoad({ requestId, acceptMappings }); this.report(committed); if (!committed.ok) return;
    this.showStory(); if (this.options.session.inspect()?.state.phase === 'entry') { this.report(await this.options.session.start()); this.render(); }
  }
  private historyInstances() {
    const visit = this.navigation.source()?.id ?? null, newVisit = visit !== this.historyNavigationId; this.historyNavigationId = visit;
    this.mountPage(this.instances('history', { business: (component, children, context) => {
      if (component.part === 'history.list') return <div className="gc-list gc-history-list" onScroll={event => { this.historyScrollTop = event.currentTarget.scrollTop; }}>{children}</div>;
      if (component.part === 'history.list.row') return <article>{children}</article>;
      if (component.part === 'history.list.row.voice') { const entry=this.options.session.inspect()?.history.find(item=>item.id===(context.item as {id?:Id})?.id);return <button aria-label={this.locale('toolbar.replayVoice')} title={this.locale('toolbar.replayVoice')} disabled={!entry?.voiceAssetId} onClick={()=>{if(entry)void this.playHistoryVoice(entry.id);}}>{component.normal.images?.icon?null:<ToolbarIcon kind="voice"/>}</button>; }
      if (component.part === 'history.list.row.location') return <details className="gc-history-location"><summary>{this.t('记录详情','Record details','記録の詳細')}</summary>{String((context.item as {location?:string})?.location??'')}</details>;
      if (component.part === 'history.list.row.text') { const entry = this.options.session.inspect()?.history.find(item => item.id === (context.item as { id?: Id })?.id); return <p>{entry?.segments ? <DialogueText runs={entry.segments} scale={this.preferences().fontScale}/> : entry?.text}{children}</p>; }
      return undefined;
    } }));
    const list = this.content.querySelector<HTMLElement>('[data-gc-part="history.list"]'); if (list) { list.scrollTop = newVisit ? list.scrollHeight : this.historyScrollTop; this.historyScrollTop = list.scrollTop; }
  }
  private settings() {
    const current=this.preferences(), project=this.options.snapshot.project;
    if(this.settingsVisit!==this.navigation.source()?.id){
      this.settingsVisit=this.navigation.source()?.id;
      this.settingsBackground=this.navigation.audioSource.kind==='stage'?this.options.stage.captureFrame().toDataURL('image/png'):null;
    }
    const source=this.options.session.inspect()?.state.presentation;
    const portraitSource=source&&readingPortrait(source.objects,source.text,this.options.snapshot.characters,source.characterDifferences);
    const fallbackCharacter=this.options.snapshot.characters.find(character=>character.avatar);
    const portrait=portraitSource?.kind==='shared'?<SharedPortrait host={this.options.host} snapshot={this.options.snapshot} characterId={portraitSource.characterId} current={()=>{const value=this.options.stage.capture();return value.ok?value.value:null;}} unavailable={()=>{}}/>:portraitSource?.kind==='image'?<IndependentPortrait host={this.options.host} assetId={portraitSource.assetId} snapshot={this.options.snapshot} name={source?.text.speakerName??''} unavailable={()=>{}}/>:fallbackCharacter?.avatar?<IndependentPortrait host={this.options.host} assetId={fallbackCharacter.avatar} snapshot={this.options.snapshot} name={fallbackCharacter.name} unavailable={()=>{}}/>:null;
    const levels=(value:PlayerPreferences)=>{
      this.options.audio.setLevels(value.volumes.master/100,Object.fromEntries(Object.entries(value.volumes).filter(([key])=>key!=='master').map(([key,level])=>[key,level/100])));
      this.options.audio.setDuck(value.duckBgm?.35:1,value.interruptOnSilent);
    };
    this.mountPage(<SettingsPage emergencyDefault={project.player.emergencyKey??'F8'} compose={adapter=>{const {data,...overrides}=adapter;const context=this.instanceContext('settings');return this.instances('settings',{...overrides,context:{...context,data:{...context.data,...data}}});}} initial={current} defaults={defaultPreferences(project.languages.menuDefault,project.languages.voiceDefault,matchMedia('(prefers-reduced-motion: reduce)').matches)} languageOptions={effectivePlayerLanguages(project.languages)}
      label={key=>this.locale(key)} t={(zh,en,ja)=>this.t(zh,en,ja)} part={key=>this.partRef('settings',key,['settings.categories','settings.content'].includes(key))} fontSize={this.part('story','story.bodyText')?.normal.fontSize??this.options.snapshot.template.defaultVisual.fontSize}
      backdrop={this.settingsBackground?<img src={this.settingsBackground} alt="" draggable={false}/>:project.display.titleBackground?<ResourceImage host={this.options.host} asset={this.options.snapshot.assets.find(asset=>asset.assetId===project.display.titleBackground)} alt=""/>:<PageBackground host={this.options.host} snapshot={this.options.snapshot} page={this.options.snapshot.template.pages.find(page=>page.key==='title')}/>}
      reading={{styles:this.options.snapshot.template.readingStyles,canvas:project.canvas,pageId:this.options.snapshot.template.pages.find(page=>page.key==='story')?.id??'',panel:this.part('story','story.readingPanel'),textBox:this.part('story','story.textBox'),speaker:source?.text.speakerName||fallbackCharacter?.name||this.t('阅读样例','Reading sample','読書サンプル'),nvl:source?.text.reading?.mode==='nvl',compose:parts=>this.instances('story',{state:component=>({visible:!component.part.startsWith('story.toolbar')&&!['story.chapterNotice','story.entryTitle','story.bgmNotice','story.statusIcons'].includes(component.part)}),business:(component,children)=>component.part==='story.readingPanel'?parts.panel(children):component.part==='story.nameBox'?parts.name(children):component.part==='story.nameText'?parts.nameText(children):component.part==='story.textBox'?parts.body(children):component.part==='story.bodyText'?parts.text(children):component.part==='story.avatar'?parts.portrait(children):undefined}),part:key=>this.partRef('story',key,key==='story.readingPanel')}} portrait={portrait} windows={this.options.host.target==='windows'} preview={levels}
      save={async value=>{
        const persisted=this.preferences();let actual=value;
        if(value.fullscreen!==persisted.fullscreen){
          const result=await this.options.host.platform('window.fullscreen',{enabled:value.fullscreen});
          if(!result.ok){levels(persisted);return {...result,error:{...result.error,code:'SETTINGS_FULLSCREEN'}};}
          actual={...value,fullscreen:!!(result.value as {enabled?:boolean}).enabled};
        }
        const result=await this.options.data.savePreferences({...actual,revision:persisted.revision},persisted.revision);
        if(result.ok){this.options.session.setVoiceLocale(result.value.voiceLocale);levels(result.value);this.render();}
        return result;
      }} confirm={message=>this.ask(message)} audition={bus=>this.pageAudio.playSettingsAudition(bus)} stopAudio={notify=>this.pageAudio.stopSettingsAudition(notify)}
      back={()=>this.back()} title={()=>void this.returnTitle(true,true)} exit={()=>void this.exit()} exportData={()=>void this.exportData()} importData={()=>this.open('dataImport')} clearData={()=>this.open('dataClear')}/>);
  }
  private gallery(kind:'cg'|'music') {
    if(!this.canOpen(kind)){this.mountPage(<><p>{this.t('完成任意一条路线后开放','Complete any route to unlock','いずれかのルートを完了すると解放されます')}</p><button onClick={()=>this.back()}>{this.locale('nav.back')}</button></>);return;}
    this.mountPage(<GalleryPage present={change=>this.presentGalleryChange(change)} compose={(adapter,rootPart)=>this.composeBusiness(kind,adapter,rootPart)} sample={this.gallerySample} snapshot={this.options.snapshot} data={this.options.data.current()!.longTerm} host={this.options.host} state={this.galleryView} page={kind} audio={this.pageAudio} mixer={this.options.audio} part={key=>this.partRef(kind,key)} language={this.preferences().menuLocale} volume={this.preferences().volumes.master*this.preferences().volumes.video/10000} paused={this.blurred&&this.preferences().pauseOnBlur||this.emergencyCover?.active} redraw={()=>this.render()} back={()=>this.back()} settings={()=>this.open('settings')} animate={change=>{const element=this.content.querySelector<HTMLElement>('[data-gc-part="cg.root"]')??this.content;if(this.contentTransition.busy)return;const root=this.part('cg','cg.types');const animation=this.options.snapshot.template.animations.find(item=>item.id===root?.animations.show),exit=this.options.snapshot.template.animations.find(item=>item.id===root?.animations.hide);void this.contentTransition.navigate(element,exit,change,()=>animation,this.preferences().reducedMotion,undefined,1);}}/>);
  }
  private flow() {
    const snapshot = this.options.snapshot, records = this.options.data.current()!.longTerm.flowEntries;
    const unlocked = new Set<Id>(), descriptions = new Map<Id, string>();
    for (const flow of snapshot.flows) for (const node of flow.nodes) {
      if (node.entry.kind === 'firstUnlock') {
        const record = records[node.id]; if (!record) continue;
        unlocked.add(node.id); descriptions.set(node.id, `${this.t('首次解锁回访位置','First unlock position','初回解放時の位置')}：${flowPositionLabel(snapshot, record.state.position)}`);
      } else if (flowLocalContext(snapshot, node, this.options.session.inspect()?.state ?? null)) {
        const available = this.options.session.evaluateCondition(node.unlock, snapshot, this.options.data.domain);
        const scenarioId = node.entry.debugScenarioId, scenario = snapshot.flowInitials?.find(scenario => scenario.id === scenarioId);
        if (available.ok && available.value && scenario) {
          unlocked.add(node.id); descriptions.set(node.id, `${this.t('独立初值','Independent initial state','独立した初期値')}：${scenario.name} · ${flowPositionLabel(snapshot, scenario.entry)}`);
        }
      }
    }
    this.mountPage(<FlowPage compose={adapter=>this.composeBusiness('flow',adapter)} flows={snapshot.flows} unlocked={unlocked} busy={this.flowEntering} entryDescription={id=>descriptions.get(id)??''}
      label={key => this.locale(key)} part={key => this.partRef('flow',key)} back={() => this.back()} enter={id => void this.enterFlow(id)}/>);
  }
  private flowEntering = false;
  private flowSources: (SaveRecord | null)[] = [];
  private async activateFlowSession(prepared: PreparedSession, beforeStart: () => void): Promise<boolean> {
    const previousSessionId = this.options.session.inspect()?.sessionId ?? null;
    const page = this.navigation.page;
    const stage = await this.options.stage.prepareStage(prepared.sessionId, prepared.state.presentation, null, prepared.voiceBinding);
    if (!stage.ok) { this.setStageError(stage.error); this.options.session.disposePrepared(prepared.id); return false; }
    if (this.disposed || this.navigation.page !== page || (this.options.session.inspect()?.sessionId ?? null) !== previousSessionId) {
      this.options.stage.discardPrepared(stage.value.id); this.options.session.disposePrepared(prepared.id); return false;
    }
    const activated = this.options.session.activate(prepared.id); this.report(activated);
    if (!activated.ok) { this.options.stage.discardPrepared(stage.value.id); this.options.session.disposePrepared(prepared.id); return false; }
    const owner = activated.value.token ?? { sessionId: activated.value.sessionId, occurrence: activated.value.state.occurrence,
      statementId: activated.value.state.position.statementId! };
    const release=this.holdVisual();
    try {const displayed = this.options.commitSessionStage(stage.value.id, owner, previousSessionId); this.report(displayed);
    if (!displayed.ok) { this.setStageError(displayed.error); return false; }
    beforeStart(); this.setStageError(null); this.showStory();
    if (activated.value.state.phase === 'entry') this.report(await this.options.session.start());
    this.showStory();await this.waitForTargetPresentation();return true;
    } finally {release();}
  }
  private async enterFlow(id: Id) {
    if (this.flowEntering) return;
    const snapshot = this.options.snapshot, node = snapshot.flows.flatMap(flow => flow.nodes).find(node => node.id === id);
    if (!node) return;
    this.flowEntering = true; this.render();
    try {
      if (!await this.ensureLongTerm()) return;
      if (node.entry.kind === 'firstUnlock') {
        const record = this.options.data.current()!.longTerm.flowEntries[id]; if (!record) return;
        const context = this.options.restore.context(); this.report(context); if (!context.ok) return;
        const requestId = createId(), prepared = await this.options.restore.prepareRestore({ requestId, purpose: 'activate',
          source: { kind: 'flowEntry', record }, context: context.value });
        this.report(prepared); if (!prepared.ok) return;
        const accepted = !prepared.value.mappings.length || await this.confirmMappings(prepared.value.mappings);
        if (!accepted || this.navigation.page !== 'flow') { this.options.restore.disposePreparedRestore(requestId); return; }
        const committed = this.options.restore.commitLoad({ requestId, acceptMappings: accepted }); this.report(committed);
        if (committed.ok) { this.options.longTerm.setActiveSession(committed.value.sessionId); this.mainStorySessionReady=false;this.showStory();
          if (this.options.session.inspect()?.state.phase === 'entry') { const started=await this.options.session.start();this.report(started);if(!started.ok)return;this.showStory(); }
          this.mainStorySessionReady=true;await this.syncCurrentMainStory(); }
        return;
      }
      if (!flowLocalContext(snapshot, node, this.options.session.inspect()?.state ?? null)) return;
      const available = this.options.session.evaluateCondition(node.unlock, snapshot, this.options.data.domain); this.report(available);
      if (!available.ok || !available.value) return;
      const scenarioId = node.entry.debugScenarioId, scenario = snapshot.flowInitials?.find(scenario => scenario.id === scenarioId);
      if (!scenario) { this.showError(this.t('独立初值不可用，请重新检查作品','Initial state unavailable; check the work','初期値を利用できません。作品を確認してください')); return; }
      const previousSessionId = this.options.session.inspect()?.sessionId ?? null;
      let source: SaveRecord | null = null;
      if (previousSessionId && this.options.session.inspect()?.status !== 'ended') {
        if (this.preferences().confirmations.newGame && !await this.ask(this.t('进入独立回想？当前剧情会保存，返回时继续。','Enter this recollection? Your current story will be saved for your return.','独立した回想を開始しますか？現在の物語は保存され、戻ると続きから再開します。'))) return;
        if(this.flowSources.length){
          const synced=await this.options.syncStage();this.report(synced);if(!synced.ok)return;
          const current=this.options.session.inspect()!;source=this.options.data.makeRecord({snapshot,inspection:{state:structuredClone(current.state),history:structuredClone(current.history)},kind:'continue',thumbnail:null,recordId:createId()});
        }else{
          if (!await this.save('continue') || !this.selectedSave) return;
          const saved = await this.options.data.record(this.selectedSave); this.report(saved); if (!saved.ok || !saved.value) return;
          source = saved.value;
        }
      }
      if (this.navigation.page !== 'flow' || (this.options.session.inspect()?.sessionId ?? null) !== previousSessionId) return;
      const prepared = await this.options.session.prepareSession({ snapshot, domain: this.options.data.domain,
        source: { kind: 'entry', scenario:{...scenario,initialProgress:{...scenario.initialProgress,...initialNameProgress(snapshot.project.player.name,this.options.data.current()!.currentMainStory)}} }, target: scenario.target }); this.report(prepared); if (!prepared.ok) return;
      if (!prepared.value.reached) { this.options.session.disposePrepared(prepared.value.id); this.showError(this.t('回想路线未到达配置目标','The recollection route did not reach its target','回想ルートが指定した位置に到達しませんでした')); return; }
      if (this.navigation.page !== 'flow') { this.options.session.disposePrepared(prepared.value.id); return; }
      await this.activateFlowSession(prepared.value, () => this.flowSources.push(source));
    } finally { this.flowEntering = false; if (!this.disposed) this.render(); }
  }
  private async returnFlowSource(confirmation: boolean): Promise<boolean> {
    if (confirmation && this.preferences().confirmations.title && !await this.ask(this.t('返回原剧情？','Return to the original story?','元の物語へ戻りますか？'))) return false;
    if (!await this.ensureLongTerm()) return false;
    const source = this.flowSources.at(-1);
    if (source) {
      const prepared = await this.options.session.prepareSession({ snapshot: this.options.snapshot, domain: this.options.data.domain,
        source: { kind: 'restored', state: source.state, history: source.history, voiceLocale: this.preferences().voiceLocale }, target: null });
      this.report(prepared); if (!prepared.ok) return false;
      return this.activateFlowSession(prepared.value, () => { this.flowSources.pop(); });
    }
    const inspection = this.options.session.inspect();
    if (inspection) { this.options.audio.disposeSession(inspection.sessionId); this.options.onSessionEnd(inspection.sessionId); this.options.session.dispose(); }
    this.options.longTerm.setActiveSession(null); this.flowSources.pop(); this.options.video.returnTitle();
    this.options.stage.pause(true); this.options.audio.setPause('systemPage', true); this.setStageError(null); this.navigation.replace('title'); return true;
  }
  private characters() {
    if (!this.canOpen('characters')) { this.navigation.replace('title'); this.title(); return; }
    const profile=this.options.data.current()!;
    const characters=afterstoryCharacters(this.options.snapshot).filter(character=>afterstoryUnlocked(character,profile.longTerm.endings)||character.afterstory?.lockedView!=='hidden');
    this.mountBusiness('characters',<><h1 ref={this.partRef('characters','characters.header')}>{this.locale('page.characters')}</h1><div className="gc-character-list" tabIndex={0} aria-label={this.locale('page.characters')} ref={this.partRef('characters','characters.list',true)}>{characters.map(character=>{
      const entry=character.afterstory!,unlocked=afterstoryUnlocked(character,profile.longTerm.endings);
      if(entry&&!unlocked&&entry.lockedView==='hidden')return null;
      const progress=profile.index.afterstoryRecords?.[entry.id],completed=profile.longTerm.afterstoryCompleted?.includes(entry.id);
      return <article key={character.id} data-afterstory-character={character.id} data-locked={!unlocked} className="gc-afterstory-card" ref={this.partRef('characters','characters.card')}>
        <div ref={this.partRef('characters','characters.card.portrait')}><AfterstoryPortrait character={character} snapshot={this.options.snapshot} host={this.options.host} locked={!unlocked} label={unlocked?character.name:this.t('未解锁后日谈','Locked afterstory','未解放の後日談')}/></div>
        {unlocked&&<div className="gc-afterstory-caption"><h2 ref={this.partRef('characters','characters.card.name')}>{character.name}</h2><p ref={this.partRef('characters','characters.card.description')}>{character.description}</p><h3 ref={this.partRef('characters','characters.afterstory.title')}>{entry.title}</h3>
        <nav className="gc-nav" ref={this.partRef('characters','characters.afterstory')}>
          {progress&&<button ref={this.partRef('characters','characters.afterstory.continue')} onClick={()=>void this.load(progress)}>{this.t('继续','Continue','続きから')}</button>}
          <button ref={this.partRef('characters',progress||completed?'characters.afterstory.replay':'characters.afterstory.start')} onClick={()=>void this.newGame(undefined,character.id)}>{progress||completed?this.t('从头重玩','Replay','最初から'):this.t('开始','Start','始める')}</button>
        </nav></div>}
      </article>;})}</div><button className="gc-page-back" ref={this.partRef('characters','characters.back')} onClick={()=>this.back()}>{this.locale('nav.back')}</button></>,{afterstoryCharacters:characters.map(character=>({id:character.id,name:character.name,description:character.description,locked:!afterstoryUnlocked(character,profile.longTerm.endings)}))});
  }
  private clearPage() {
    const scopes=['saves','longTerm','preferences'] as const,selected=this.clearScopes;
    this.mountBusiness('dataClear',<section ref={this.partRef('dataClear','dataClear.panel')} className="gc-confirm-panel gc-data-panel" role="dialog" aria-modal="true" aria-label={this.locale('page.dataClear')}><h2>{this.locale('page.dataClear')}</h2><div ref={this.partRef('dataClear','dataClear.scope')} className="gc-settings-content">{scopes.map(scope=><label key={scope} ref={this.partRef('dataClear',`dataClear.scope.${scope}`)}>{scope==='saves'?this.locale('page.save'):scope==='preferences'?this.locale('page.settings'):this.t('长期解锁与进度','Unlocks and progress','解放・進行状況')}<input type="checkbox" checked={selected.has(scope)} onChange={e=>{if(e.target.checked)selected.add(scope);else selected.delete(scope);this.render();}}/></label>)}</div><nav className="gc-nav"><button ref={this.partRef('dataClear','dataClear.confirm')} onClick={async()=>{if(!selected.size||!await this.ask(this.locale('action.clear')))return;void this.ensureLongTerm().then(ready=>{if(!ready)return;void this.options.data.clear([...selected]).then(result=>{this.report(result);if(result.ok){this.options.longTerm.syncFromDisk();if(selected.has('longTerm')&&(this.navigation.contains('cg')||this.navigation.contains('music')||this.navigation.contains('characters')||this.options.session.inspect()?.state.story?.kind==='afterstory')){this.galleryView.viewer=null;void this.returnTitle(false);}else this.back();}});});}}>{this.locale('action.clear')}</button><button ref={this.partRef('dataClear','dataClear.cancel')} onClick={()=>this.back()}>{this.locale('nav.back')}</button></nav></section>);
  }
  private importPage() {
    const plan=this.importPlan;
    const choiceLabel=(choice:string)=>choice==='keepLocal'?this.t('保留本机','Keep local','本機を保持'):choice==='overwrite'?this.t('覆盖本机','Overwrite local','本機を上書き'):choice==='emptySlot'?this.t('导入空槽','Use empty slot','空きスロット'):this.t('采用导入值','Import value','読み込み値を使用');
    this.mountBusiness('dataImport',<section ref={this.partRef('dataImport','dataImport.panel')} className="gc-confirm-panel gc-data-panel" role="dialog" aria-modal="true" aria-label={this.locale('page.dataImport')}><p ref={this.partRef('dataImport','dataImport.workInfo')}>{this.t('选择玩家资料包（.zip），核对内容后再应用。','Select a player data archive (.zip), then review before applying.','プレイヤーデータ (.zip) を選び、内容を確認して適用します。')}</p><button onClick={()=>void this.importData()}>{this.locale('action.import')}</button>
      {plan&&<><p ref={this.partRef('dataImport','dataImport.versionInfo')}>{plan.sourceLabel} · {plan.sourceReleaseVersions.join(', ')} → {plan.targetReleaseVersion}</p>
        <section ref={this.partRef('dataImport','dataImport.records')}>{plan.records.map(record=><section key={record.sourceId} ref={this.partRef('dataImport','dataImport.records.record')} className="gc-import-row"><p ref={this.partRef('dataImport','dataImport.records.record.source')}>{record.sourceSummary.sceneName}：{record.sourceSummary.text} · {record.releaseVersion} · {record.compatibility}</p>{record.localSummary&&<p ref={this.partRef('dataImport','dataImport.records.record.local')}>{this.t('本机','Local','本機')}: {record.localSummary.sceneName}：{record.localSummary.text}</p>}
          {record.mappings.map((mapping,index)=><small key={index}>{mapping.oldSceneId}/{mapping.oldStatementId} → {mapping.newSceneId}/{mapping.newStatementId} ({mapping.reason})</small>)}{record.issue&&<p role="alert">{record.issue}</p>}
          <PlayerSelect ref={this.partRef('dataImport','dataImport.records.record.action')} aria-label={this.t('导入方式','Import action','読み込み方法')} value={record.action} options={['keepLocal','overwrite','emptySlot'].map(value=>({value,label:choiceLabel(value)}))} onValueChange={value=>void this.chooseImport(record.sourceId,value as 'keepLocal'|'overwrite'|'emptySlot')}/>
          {record.action!=='keepLocal'&&<PlayerSelect aria-label={this.t('目标存档槽','Destination slot','保存先スロット')} value={record.destination?JSON.stringify(record.destination):''} options={this.importTargets(record.kind,record.action,record.destination,record.story).map((destination,index)=>({value:JSON.stringify(destination),label:destination.kind==='manual'?`${this.locale('save.manual')} ${this.options.data.current()!.index.manual.findIndex(s=>s.slotId===destination.slotId)+1||'+'}`:destination.kind==='continue'?this.locale('title.continue'):`${this.locale(`save.${destination.kind}`)} ${index+1}`}))} onValueChange={value=>void this.chooseImport(record.sourceId,record.action,JSON.parse(value) as ImportDestination)}/>}
        </section>)}</section>
        <section ref={this.partRef('dataImport','dataImport.longTerm')}><h2>{this.t('长期资料','Progress records','進行データ')}</h2>{plan.flowEntries.map(entry=><section key={entry.nodeId}><p>{this.options.snapshot.flows.flatMap(f=>f.nodes).find(n=>n.id===entry.nodeId)?.name??entry.nodeId} · {entry.releaseVersion} · {entry.action==='import'?entry.compatibility:choiceLabel('keepLocal')} {entry.issue}</p>{entry.mappings.map((m,index)=><small key={index}>{m.oldSceneId}/{m.oldStatementId} → {m.newSceneId}/{m.newStatementId} ({m.reason})</small>)}</section>)}
        {plan.variableIds.map(id=><label key={id}>{this.options.snapshot.variables.find(v=>v.id===id)?.name??id}<PlayerSelect aria-label={this.options.snapshot.variables.find(v=>v.id===id)?.name??id} value={plan.localVariableIds.includes(id)?plan.variableChoices[id]??'keepLocal':'import'} disabled={!plan.localVariableIds.includes(id)} options={['keepLocal','import'].map(value=>({value,label:choiceLabel(value)}))} onValueChange={value=>void this.reviseImport({variableChoices:{...plan.variableChoices,[id]:value as 'keepLocal'|'import'}})}/></label>)}
        </section><label ref={this.partRef('dataImport','dataImport.preferences')}>{this.locale('page.settings')}<PlayerSelect aria-label={this.locale('page.settings')} value={plan.preferences} disabled={!plan.sourcePreferences} options={['keepLocal','import'].map(value=>({value,label:choiceLabel(value)}))} onValueChange={value=>void this.reviseImport({preferences:value as 'keepLocal'|'import'})}/></label>
        {!!plan.removedLocalRecords.length&&<p>{this.t('将替换本机记录','Local records to replace','置き換える本機の記録')}: {plan.removedLocalRecords.map(item=>item.summary?`${item.summary.sceneName}：${item.summary.text}`:item.recordId).join(' · ')}</p>}
        <button ref={this.partRef('dataImport','dataImport.apply')} disabled={!plan.canApply} onClick={()=>void this.applyImport()}>{this.locale('action.apply')}</button>
      </>}
      <button className="gc-page-back" ref={this.partRef('dataImport','dataImport.cancel')} onClick={()=>{if(this.importPlan)this.options.importer.discardDataImport(this.importPlan.id);this.importPlan=null;this.back();}}>{this.locale('nav.back')}</button></section>,{importRecords:plan?.records.map(record=>({...record,id:record.sourceId}))??[]});
  }
  private async exportData() {
    const profile = this.options.data.current()!;
    const ids = [...profile.index.manual.map(slot => slot.recordId), ...profile.index.quick, ...profile.index.auto,
      profile.index.continueRecordId,...Object.values(profile.index.afterstoryRecords??{})].filter((id): id is Id => id !== null);
    const records: SaveRecord[] = [];
    for (const id of ids) { const record = await this.options.data.record(id); if (record.ok && record.value) records.push(record.value); }
    const payload = { format: 'galcraft-player-data', schemaVersion: 1, projectId: this.options.snapshot.projectId,
      createdAt: new Date().toISOString(), releaseVersions: dataReleaseVersions(records, profile.longTerm),
      records: records.map(record => record.recordId), index: profile.index,
      longTerm: profile.longTerm, preferences: profile.preferences };
    const files: Record<string, Uint8Array> = { 'manifest.json': archiveText(payload) };
    for (const record of records) { files[`records/${record.recordId}.json`] = archiveText(record);
      const thumbnail = await this.options.data.thumbnail(record.recordId);
      if (thumbnail.ok && thumbnail.value) files[`thumbnails/${record.recordId}.png`] = thumbnail.value;
    }
    this.report(await this.options.host.transfer.exportFile(`${this.options.snapshot.project.name}.zip`,
      'application/zip', writeArchive(files)));
  }
  private async importData() {
    const file = await this.options.host.transfer.importFile(['.zip', 'application/zip']); this.report(file);
    if (!file.ok || !file.value) return;
    try { const files = readArchive(file.value), manifest = files['manifest.json'];
      if (!manifest) throw new Error('资料包缺少 manifest.json');
      const descriptor = JSON.parse(new TextDecoder().decode(manifest)) as Omit<PlayerDataPackage, 'records'> & { records: Id[] };
      const records = descriptor.records.map(id => {
        const data = files[`records/${id}.json`]; if (!data) throw new Error(`资料包缺少存档 ${id}`);
        return JSON.parse(new TextDecoder().decode(data)) as SaveRecord;
      });
      const plan = await this.options.importer.planDataImport({ source: { label: '玩家资料包',
        package: { ...descriptor, records }, thumbnails: Object.fromEntries(descriptor.records.flatMap(id =>
          files[`thumbnails/${id}.png`] ? [[id, files[`thumbnails/${id}.png`]!]] : [])) } });
      this.report(plan); if (plan.ok) { this.importPlan = plan.value; this.render(); }
    } catch (error) { this.showError(issueFromError(error,'M07')); }
  }
  private importTargets(kind: SaveRecord['kind'], action: 'keepLocal'|'overwrite'|'emptySlot',
    current: ImportDestination | null = null, story?: SaveRecord['state']['story']): ImportDestination[] {
    const index = this.options.data.current()!.index;
    if (action === 'keepLocal') return [];
    if (kind === 'manual') {
      const slots = index.manual.filter(slot => action === 'overwrite' ? !!slot.recordId : !slot.recordId)
        .map(slot => ({ kind: 'manual' as const, slotId: slot.slotId }));
      if (action === 'emptySlot') slots.push({ kind: 'manual', slotId:
        current?.kind === 'manual' && !index.manual.some(slot => slot.slotId === current.slotId) ? current.slotId : createId() });
      return slots;
    }
    if (kind === 'continue') {
      const existing = story?.kind === 'afterstory' ? index.afterstoryRecords?.[story.entryId] : index.continueRecordId;
      return (action === 'overwrite') === !!existing ? [{ kind: 'continue' }] : [];
    }
    return action === 'emptySlot' ? [{ kind, recordId: null }] :
      index[kind].map(recordId => ({ kind, recordId }));
  }
  private async chooseImport(sourceId: Id, action: 'keepLocal'|'overwrite'|'emptySlot', target?: ImportDestination) {
    const plan = this.importPlan; if (!plan) return;
    const selected = plan.records.find(record => record.sourceId === sourceId); if (!selected) return;
    const reserved = plan.records.filter(record => record.sourceId !== sourceId && record.action !== 'keepLocal')
      .flatMap(record => record.destination ? [importDestinationKey(record.destination,record.story)] : []);
    let destination: ImportDestination | null = target ?? null;
    if (action !== 'keepLocal') {
      destination ??= this.importTargets(selected.kind, action, selected.destination,selected.story).find(item => {
        const key=importDestinationKey(item,selected.story);return !key||!reserved.includes(key);
      }) ?? null;
      if (!destination) { this.showError('没有可用的导入目标槽'); return; }
    } else destination = null;
    const selection = { records: plan.records.map(record => {
      if (record.sourceId !== sourceId) return { sourceId: record.sourceId, destination: record.destination, action: record.action };
      return { sourceId, destination, action };
    }), variableChoices: plan.variableChoices, preferences: plan.preferences };
    await this.reviseImport(selection);
  }
  private async reviseImport(changes: Partial<DataImportSelection>) {
    const plan = this.importPlan; if (!plan) return;
    this.content.querySelectorAll('select').forEach(control => { control.disabled = true; });
    const selection: DataImportSelection = { records: plan.records.map(record => ({ sourceId: record.sourceId,
      destination: record.destination, action: record.action })), variableChoices: plan.variableChoices,
      preferences: plan.preferences, ...changes };
    const revised = await this.options.importer.planDataImport({ previousPlanId: plan.id, selection });
    this.report(revised); if (revised.ok) this.importPlan = revised.value;
    this.render();
  }
  private async applyImport() { if (!this.importPlan) return;
    if (!await this.ensureLongTerm()) return;
    const applied = await this.options.importer.applyDataImport(this.importPlan.id); this.report(applied);
    if (applied.ok) { this.importPlan = null; this.options.longTerm.syncFromDisk(); this.back(); }
  }
  private async ensureLongTerm(): Promise<boolean> {
    if (!this.options.session.inspect()?.pendingLongTerm) return true;
    const retried = await this.options.session.retryLongTerm(); this.report(retried); return retried.ok;
  }
  private async waitForWrites():Promise<void>{
    await this.savingTask;
    await this.options.session.waitForIdle();
    await this.options.data.waitForIdle();
  }
  private async saveBeforeLeaving(target:'title'|'exit'):Promise<boolean> {
    for(;;){
      await this.waitForWrites();
      const inspection=this.options.session.inspect();
      if(!inspection)return true;
      const ready=await this.ensureLongTerm();
      if(ready&&await this.syncCurrentMainStory()&&(target==='title'&&(inspection.status==='ended'||!!this.flowSources?.length)||await this.save('continue')))return true;
      let retry=false;
      const reason=this.operationIssue?.message??this.operationMessage;
      const action=target==='exit'?this.t('直接退出','Exit without saving','保存せず終了'):this.t('直接返回标题','Return to title without saving','保存せずタイトルへ');
      const decision=await new Promise<'retry'|'direct'|'cancel'>(resolve=>{
        this.pendingConfirm={id:createId(),message:this.t('本次进度尚未保存。','This progress has not been saved.','今回の進行状況は保存されていません。')+'\n'+reason+'\n\n'+this.t('可以重试保存，或放弃本次尚未保存的进度直接离开。已有存档和已保存的阅读记录会保留。','Retry saving, or leave and discard this unsaved progress. Existing saves and saved reading records are kept.','保存を再試行するか、未保存の進行状況を破棄して移動できます。既存のセーブと保存済みの読書記録は保持されます。'),action,
          retry:()=>{retry=true;void this.finishConfirmation(false);},resolve:accepted=>resolve(accepted?'direct':retry?'retry':'cancel')};
        this.open('confirm');
      });
      if(decision==='cancel')return false;
      if(decision==='direct'){await this.waitForWrites();return true;}
    }
  }
  private leaving=false;
  private async returnTitle(confirmation = true, forceTitle = false): Promise<boolean> {
    if (this.flowSources?.length&&!forceTitle) return this.returnFlowSource(confirmation);
    if(this.leaving)return false;this.leaving=true;
    try{
    const inspection = this.options.session.inspect(); if (inspection && inspection.status !== 'ended') {
      if (confirmation && this.preferences().confirmations.title && !await this.ask(this.locale('nav.title'),undefined,undefined,'title')) return false;
    }
    if(!await this.saveBeforeLeaving('title'))return false;
    const release=this.holdVisual();
    try {
    if(forceTitle)this.flowSources=[];
    if (inspection) { this.options.audio.disposeSession(inspection.sessionId);
      this.options.onSessionEnd(inspection.sessionId);
      this.options.session.dispose(); this.options.longTerm.setActiveSession(null); }
    this.options.video.returnTitle();
    this.options.stage.pause(true); this.options.audio.setPause('systemPage', true);
    this.setStageError(null);
    this.navigation.replace('title');
    await this.waitForTargetPresentation();
    return true;
    } finally {release();}
    }finally{this.leaving=false;}
  }
  private exiting=false;
  private async exit() {
    if(this.exiting)return;this.exiting=true;this.stopModes();
    try {
      if(this.options.host.target==='web'){await this.returnTitle();return;}
      if(this.leaving)return;this.leaving=true;
      try{
      if(this.preferences().confirmations.exit&&!await this.ask(this.locale('nav.exit'),undefined,undefined,'exit'))return;
      if(!await this.saveBeforeLeaving('exit'))return;
      const closed=await this.options.host.close();this.report(closed);
      if(closed.ok){const current=this.options.session.inspect();if(current){this.options.audio.disposeSession(current.sessionId);this.options.onSessionEnd(current.sessionId);this.options.session.dispose();this.options.longTerm.setActiveSession(null);}this.setStageError(null);}else this.render();
      }finally{this.leaving=false;}
    } finally {this.exiting=false;}
  }
  dispose() {
    this.clearEmergencyComponents(); this.emergencyRoot?.unmount(); this.emergencyRoot = null; this.emergencyCover.close(false); this.inputRelease();
    this.visualHold?.release();this.visualHold=null;this.visualHoldUsers=0;
    this.visualLifetime.abort();this.stopModes(); this.disposed = true; this.renderSequence++; this.lifecycleRelease(); this.visualEvents.abort(); this.scrollCleanup(); this.pendingConfirm?.resolve(false); this.pendingConfirm=null; if (this.typingTimer) clearTimeout(this.typingTimer);
    this.releasePluginRender();
    this.clearPluginComponents();
    this.pageRoot?.unmount(); this.pageRoot = null;
    this.pluginRoot?.unmount(); this.pluginRoot = null;
    for (const release of this.imageReleases) release(); this.imageReleases = [];
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.options.entryPresentation?.stop();this.transition.cancel();this.contentTransition.cancel();for(const element of this.options.root.querySelectorAll<HTMLElement>('[data-gc-part]'))this.partAnimations.get(element)?.cancel();this.startup.stop(); this.pageAudio.dispose();
    this.options.video.dispose(); this.options.audio.dispose(); this.options.stage.dispose(); this.options.session.dispose();
    this.options.onDispose(); clear(this.options.root); }
}
