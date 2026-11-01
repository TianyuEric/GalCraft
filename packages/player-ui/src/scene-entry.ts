import type { Id, Interlude, PlayerHost, Result, RuntimeState, Snapshot, Transition } from '@galcraft/contracts';
import type { AudioMixer, StageController } from '@galcraft/stage';
import { ease, paintGridTransition, type ExecutableAnimation } from '@galcraft/stage';
import { fail, ok } from './common.js';
import { animationResourceReader } from './animation-resources.js';
import { createEntryTitle, paintEntryTitle, releaseEntryTitle } from './entry-title.js';
import { assetNameParts } from '@galcraft/assets/naming';

function bgmDisplayName(name:string) {
  const {stem,extension}=assetNameParts(name);
  return /^\.(?:mp3|wav|ogg|opus|flac|aac|m4a|aif|aiff|wma|weba)$/i.test(extension)?stem:name;
}

type Phase = 'preparing'|'oldStageExit'|'interludeEnter'|'holding'|'interludeExit'|'awaitingStage'|'newStageEnter'|'entered'|'failed';
type Loaded = { spec: Interlude; image: HTMLCanvasElement; voice: {assetId:Id;variantId:Id}|null };
const cut: Transition = {preset:'cut',durationMs:0,resourceId:null,easing:{family:'linear',direction:'in'},direction:'left'};

/** One entry instance owns resources, media, logical time and the single body handoff. */
export class SceneEntryPresentation {
  private instance: Id|null = null;
  private sessionId: Id|null = null;
  private phase: Phase = 'entered';
  private elapsed = 0;
  private index = 0;
  private loaded: Loaded[] = [];
  private specs: Interlude[] = [];
  private releases: (()=>void)[] = [];
  private animations = new Map<Transition, ExecutableAnimation>();
  private surfaces = new Map<HTMLCanvasElement, ReturnType<StageController['createSurfaceAnimation']>>();
  private element: HTMLElement|null = null;
  private canvas: HTMLCanvasElement|null = null;
  private controls: HTMLElement|null = null;
  private oldStage: HTMLCanvasElement|null = null;
  private newStage: HTMLCanvasElement|null = null;
  private voiceId: Id|null = null;
  private voiceLoading = false;
  private generation = 0;
  private paused = false;
  private reduced = false;
  private showTitles = true;
  private skipped = false;
  private ready: Promise<Result<void>> = Promise.resolve(ok(undefined));
  private readyResolve: ((result:Result<void>)=>void)|null = null;
  private done: Promise<Result<void>> = Promise.resolve(ok(undefined));
  private doneResolve: ((result:Result<void>)=>void)|null = null;
  private title: { lines:string[];holdMs:number;enter:Transition;exit:Transition }|null = null;
  private titleElement: HTMLElement|null = null;
  private titleElapsed = 0;
  private titleAnimations = new Map<Transition,ExecutableAnimation>();
  private titleReady=false;
  private titleError:string|null=null;
  private bgmElement: HTMLElement|null = null;
  private bgmElapsed = 0;
  private bgmPending: {id:Id;name:string}|null = null;
  private bgmShown: Id|null = null;
  private bgmCandidate: {sessionId:Id;id:Id;assetId:Id}|null = null;
  private stylePart: ((part:string,element:HTMLElement)=>void)|null = null;
  styleParts(style:(part:string,element:HTMLElement)=>void){this.stylePart=style;}
  private visualReady: ((amount:number)=>void)|null=null;
  onVisualReady(listener:(amount:number)=>void){this.visualReady=listener;}
  private surface:HTMLElement;
  setSurface(surface:HTMLElement){this.surface=surface;}
  constructor(private root:HTMLElement, private host:PlayerHost, private snapshot:Snapshot,
    private stage:StageController, private audio:AudioMixer) {this.surface=root;}
  get active() { return this.phase!=='entered'; }
  get currentPhase() { return this.phase; }
  private shot() { const canvas=document.createElement('canvas');canvas.width=this.snapshot.project.canvas.width;canvas.height=this.snapshot.project.canvas.height;
    canvas.getContext('2d')!.drawImage(this.stage.captureFrame(),0,0,canvas.width,canvas.height);return canvas; }
  begin(sessionId:Id,state:RuntimeState) {
    const entry=state.entryPresentation;if(!entry||entry.completed||entry.instanceId===this.instance)return;
    this.stop();this.instance=entry.instanceId;this.sessionId=sessionId;this.skipped=false;
    const scene=this.snapshot.scenes.find(item=>item.scene.id===entry.sceneId)?.scene;
    const chapter=this.snapshot.project.chapters.find(item=>item.id===scene?.chapterId);
    const first=chapter?.sceneIds[0]===entry.sceneId;
    const configs=[...(first&&chapter?.presentation?[{presentation:chapter.presentation,name:chapter.name}]:[]),...(scene?.presentation?[{presentation:scene.presentation,name:scene.name}]:[])];
    const titles=configs.flatMap(({presentation,name})=>presentation.title?.enabled?[presentation.title.text||name]:[]).filter(Boolean);
    const titleConfig=configs.map(({presentation})=>presentation.title).find(config=>config?.enabled);
    this.title=titles.length?{lines:titles,holdMs:titleConfig!.holdMs,enter:titleConfig!.enter,exit:titleConfig!.exit}:null;
    this.phase='preparing';void this.prepareTitle();
    this.specs=configs.flatMap(({presentation})=>presentation.interlude?[presentation.interlude]:[]);
    if(!this.specs.length){this.phase='awaitingStage';return;}
    this.oldStage=this.shot();this.phase='preparing';this.index=0;this.elapsed=0;
    this.ready=new Promise(resolve=>{this.readyResolve=resolve;});this.done=new Promise(resolve=>{this.doneResolve=resolve;});
    this.element=document.createElement('section');this.element.className='gc-scene-entry';this.element.tabIndex=0;this.element.setAttribute('aria-label','章节与场景间幕');
    this.canvas=document.createElement('canvas');this.canvas.width=this.snapshot.project.canvas.width;this.canvas.height=this.snapshot.project.canvas.height;
    this.controls=document.createElement('div');this.controls.className='gc-entry-controls';this.element.append(this.canvas,this.controls);
    this.surface.append(this.element);this.root.classList.add('gc-entry-active');
    this.element.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();this.skip();});
    this.element.addEventListener('pointerup',event=>event.stopPropagation());this.element.focus();
    this.paint();void this.prepare();
  }
  private async prepare() {
    const generation=++this.generation;this.phase='preparing';this.controls?.replaceChildren();this.loaded=[];
    for(const release of this.releases)release();this.releases=[];
    this.releaseSurfaces();this.animations.clear();
    try {
      const readAnimation=animationResourceReader(this.snapshot,this.host.resources);
      for(const spec of this.specs.flatMap(item=>[item.oldStageExit,item.enter,item.exit,item.newStageEnter])){
        if(spec.preset!=='custom')continue;
        if(!spec.resourceId)throw new Error('自定义入口过渡缺少动画资源');
        const animation=await readAnimation(spec.resourceId,{});if(generation!==this.generation)return;
        if(!animation.ok)throw new Error(animation.error.message);this.animations.set(spec,animation.value);
      }
      for(const spec of this.specs){
        const asset=this.snapshot.assets.find(item=>item.assetId===spec.image.assetId&&(!spec.image.variantId||item.variantId===spec.image.variantId));
        if(!asset||asset.kind!=='image')throw new Error('间幕图片不存在或类型不正确');
        const location=await this.host.resources.resolve(asset.assetId,asset.variantId);if(!location.ok)throw new Error(location.error.message);
        if(generation!==this.generation){location.value.release();return;}this.releases.push(location.value.release);
        const image=new Image();image.crossOrigin='anonymous';const uri=new URL(location.value.uri);uri.searchParams.set('gc-entry',String(generation));image.src=uri.href;await image.decode();if(generation!==this.generation)return;
        const canvas=document.createElement('canvas');canvas.width=this.snapshot.project.canvas.width;canvas.height=this.snapshot.project.canvas.height;
        const context=canvas.getContext('2d')!,sx=canvas.width/image.naturalWidth,sy=canvas.height/image.naturalHeight;
        const scale=spec.fit==='cover'?Math.max(sx,sy):Math.min(sx,sy),width=spec.fit==='fill'?canvas.width:image.naturalWidth*scale,height=spec.fit==='fill'?canvas.height:image.naturalHeight*scale;
        context.fillStyle=this.snapshot.project.canvas.stageColor;context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,(canvas.width-width)/2,(canvas.height-height)/2,width,height);
        const voice=spec.voice?this.snapshot.assets.find(item=>item.assetId===spec.voice!.assetId&&(!spec.voice!.variantId||item.variantId===spec.voice!.variantId)):null;
        if(spec.voice&&(!voice||voice.kind!=='audio'))throw new Error('间幕语音不存在或类型不正确');
        this.loaded.push({spec,image:canvas,voice:voice?{assetId:voice.assetId,variantId:voice.variantId}:null});
      }
      if(generation!==this.generation)return;this.phase=this.skipped?'awaitingStage':'oldStageExit';this.elapsed=0;this.paint();if(this.skipped)this.readyResolve?.(ok(undefined));
    }catch(error){if(generation===this.generation)this.failed(String(error));}
  }
  private failed(message:string) {
    this.phase='failed';this.stopVoice();if(!this.controls)return;
    const text=document.createElement('p');text.role='alert';text.textContent=message;
    const retry=document.createElement('button');retry.textContent='重试 / Retry';retry.onclick=()=>{this.index=0;void this.prepare();};
    const skip=document.createElement('button');skip.textContent='跳过间幕 / Skip interlude';skip.onclick=()=>this.skip(true);this.controls.replaceChildren(text,retry,skip);
    // Failure presents the existing retry/skip surface instead of retaining an inert source.
    this.visualReady?.(1);
  }
  private async prepareTitle(){
    const title=this.title,instance=this.instance;this.titleReady=false;this.titleError=null;this.titleAnimations.clear();
    try{if(title)for(const spec of[title.enter,title.exit]){if(spec.preset!=='custom')continue;if(!spec.resourceId)throw new Error('自定义标题过渡缺少动画资源');const loaded=await animationResourceReader(this.snapshot,this.host.resources)(spec.resourceId,{});if(instance!==this.instance||title!==this.title)return;if(!loaded.ok)throw new Error(loaded.error.message);this.titleAnimations.set(spec,loaded.value);}}
    catch(error){if(instance!==this.instance||title!==this.title)return;this.titleError=String(error);}
    this.titleReady=true;if(!this.active)this.showTitle();
  }
  private stopVoice(){if(this.voiceId)this.audio.release(this.voiceId);this.voiceId=null;this.voiceLoading=false;}
  private async startVoice(){const item=this.loaded[this.index];if(!item?.voice||!this.sessionId)return;
    const generation=this.generation;this.voiceLoading=true;
    const played=await this.audio.play({sessionId:this.sessionId,bus:'voice',voicePurpose:'interlude',state:{...item.voice,stopped:false,volume:1,startSec:0,loop:false,loopStartSec:0,loopEndSec:null,fadeInMs:0,fadeOutMs:0}});
    if(generation!==this.generation||this.phase!=='holding'){if(played.ok)this.audio.release(played.value);return;}
    this.voiceLoading=false;if(!played.ok){this.failed(played.error.message);return;}this.voiceId=played.value;
    this.audio.setSourcePaused(played.value,this.paused);
  }
  async enterBody(sessionId:Id,state:RuntimeState):Promise<Result<void>> {
    this.begin(sessionId,state);if(!state.entryPresentation||state.entryPresentation.completed)return ok(undefined);
    const instance=this.instance;const ready=await this.ready;if(!ready.ok)return ready;
    if(instance!==this.instance||sessionId!==this.sessionId)return fail('ENTRY_STALE','入口演出已失效');
    if(this.specs.length){this.newStage=this.shot();this.phase='newStageEnter';this.elapsed=0;if(this.skipped)this.complete();return this.done;}
    this.complete();return ok(undefined);
  }
  skip(force=false){if(!this.active||!force&&!this.specs.every(item=>item.allowSkip))return false;
    this.skipped=true;this.generation++;this.stopVoice();this.controls?.replaceChildren();this.phase='awaitingStage';this.readyResolve?.(ok(undefined));return true;}
  keydown(event:KeyboardEvent){if(!this.active)return false;if(event.code==='Escape'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();this.skip();return true;}if(['Enter','Space'].includes(event.code)){event.preventDefault();return true;}return false;}
  setPreferences(paused:boolean,reduced:boolean,showTitles=true){this.paused=paused;this.reduced=reduced;this.showTitles=showTitles;if(this.voiceId)this.audio.setSourcePaused(this.voiceId,paused);}
  bgmStarted(sessionId:Id,id:Id,assetId:Id){this.bgmCandidate={sessionId,id,assetId};}
  tick(deltaMs:number){
    if(!this.paused){this.titleElapsed+=deltaMs;this.bgmElapsed+=deltaMs;}
    if(this.titleElement&&this.title){const enter=this.titleDuration(this.title.enter),exit=this.titleDuration(this.title.exit),total=enter+this.title.holdMs+exit;
      if(!this.showTitles||!this.titleError&&this.titleElapsed>=total){releaseEntryTitle(this.titleElement);this.titleElement.remove();this.titleElement=null;this.titleAnimations.clear();}else if(!this.titleError){const entering=this.titleElapsed<enter,exiting=this.titleElapsed>total-exit,spec=entering?this.title.enter:exiting?this.title.exit:cut;
        this.titleElement.dataset.phase=entering?'enter':exiting?'exit':'holding';this.titleElement.dataset.preset=spec.preset;
        const duration=entering?enter:exit,progress=entering?this.titleElapsed/Math.max(1,duration):exiting?(this.titleElapsed-total+exit)/Math.max(1,duration):1;
        paintEntryTitle(this.titleElement,spec,progress,entering,this.titleAnimations.get(spec),this.reduced,1);}}
    if(this.bgmElement&&this.bgmElapsed>2900){this.bgmElement.remove();this.bgmElement=null;}
    if(this.bgmCandidate){const candidate=this.bgmCandidate,playing=this.audio.inspect({sessionId:candidate.sessionId,source:{kind:'instance',id:candidate.id}});
      if(playing.ok&&playing.value.status==='playing'){this.bgmPending={id:candidate.id,name:bgmDisplayName(this.snapshot.assets.find(asset=>asset.assetId===candidate.assetId)?.name??'')};this.bgmCandidate=null;}}
    if(!this.active&&this.bgmPending&&this.bgmPending.id!==this.bgmShown){this.bgmShown=this.bgmPending.id;this.bgmElapsed=0;this.bgmElement?.remove();this.bgmElement=document.createElement('aside');this.bgmElement.className='gc-bgm-notice';this.bgmElement.dataset.gcPart='story.bgmNotice';this.bgmElement.textContent=`♫  ${this.bgmPending.name}`;this.surface.append(this.bgmElement);this.stylePart?.('story.bgmNotice',this.bgmElement);this.bgmPending=null;}
    if(!this.active||this.paused)return;
    const item=this.loaded[this.index];if(!item){this.paint();return;}
    const duration=this.reduced?0:this.phase==='oldStageExit'?this.duration(item.spec.oldStageExit):this.phase==='interludeEnter'?this.duration(item.spec.enter):this.phase==='interludeExit'?this.duration(item.spec.exit):this.phase==='newStageEnter'?this.duration(this.loaded.at(-1)!.spec.newStageEnter):Infinity;
    this.elapsed+=Math.max(0,deltaMs);
    if(this.phase==='holding'){
      if(item.voice){if(this.voiceId){const voice=this.audio.inspect({sessionId:this.sessionId!,source:{kind:'instance',id:this.voiceId}});
        if(!voice.ok||voice.value.status==='failed'){this.failed(voice.ok?'间幕语音播放失败':voice.error.message);return;}
        if(voice.value.problems.includes('AUTOPLAY_BLOCKED')&&!this.controls?.children.length){const resume=document.createElement('button');resume.textContent='恢复语音播放 / Resume audio';resume.onclick=()=>{void this.audio.resumeBlocked(this.voiceId!).then(result=>{if(!result.ok)this.failed(result.error.message);else this.controls?.replaceChildren();});};this.controls?.append(resume);}
        if(voice.value.status==='ended'){this.stopVoice();this.phase='interludeExit';this.elapsed=0;}}
      }else if(!this.voiceLoading&&this.elapsed>=item.spec.holdMs){this.phase='interludeExit';this.elapsed=0;}
    }else if(this.elapsed>=duration){this.elapsed=0;
      if(this.phase==='oldStageExit')this.phase='interludeEnter';
      else if(this.phase==='interludeEnter'){this.phase='holding';void this.startVoice();}
      else if(this.phase==='interludeExit'){if(++this.index<this.loaded.length)this.phase='interludeEnter';else{this.index=this.loaded.length-1;this.phase='awaitingStage';this.readyResolve?.(ok(undefined));}}
      else if(this.phase==='newStageEnter')this.complete();
    }this.paint();
  }
  private paint(){if(!this.canvas)return;const context=this.canvas.getContext('2d')!;const {width,height}=this.canvas;
    if(this.element){this.element.dataset.phase=this.phase;this.element.dataset.interlude=String(this.index);this.element.dataset.preset=this.loaded[this.index]?.spec.enter.preset??'';}
    context.clearRect(0,0,width,height);context.fillStyle=this.snapshot.project.canvas.stageColor;context.fillRect(0,0,width,height);
    const item=this.loaded[this.index],old=this.oldStage;if(this.phase==='preparing'||this.phase==='failed'){if(old)context.drawImage(old,0,0);return;}
    const entering=this.phase==='interludeEnter'||this.phase==='newStageEnter';
    const image=this.phase==='oldStageExit'?old:this.phase==='newStageEnter'?this.newStage:item?.image;if(!image||!item)return;
    const spec=this.phase==='oldStageExit'?item.spec.oldStageExit:this.phase==='interludeEnter'?item.spec.enter:this.phase==='interludeExit'?item.spec.exit:this.phase==='newStageEnter'?this.loaded.at(-1)!.spec.newStageEnter:cut;
    const duration=this.duration(spec),progress=this.reduced||duration===0?1:Math.min(1,this.elapsed/duration),amount=entering?progress:1-progress;
    if(['holding','awaitingStage'].includes(this.phase))context.drawImage(image,0,0);
    else if(spec.preset==='custom'&&!this.reduced){
      const animation=this.animations.get(spec);if(!animation)return;
      let surface=this.surfaces.get(image);if(!surface){surface=this.stage.createSurfaceAnimation(image);this.surfaces.set(image,surface);}
      const time=ease(progress,spec.easing.family,spec.easing.direction)*this.animationDuration(animation);
      context.drawImage(surface.render(animation,time),0,0);
    }
    else if(spec.preset==='gridFlip'||spec.preset==='diagonalReveal')paintGridTransition(context,image,{width,height},spec,progress,entering);
    else {context.save();const eased=ease(amount,spec.easing.family,spec.easing.direction);context.globalAlpha=spec.preset==='cut'?1:eased;
      if(spec.preset==='wipe'||spec.preset==='blinds'){
        context.globalAlpha=1;context.beginPath();
        const horizontal=spec.direction==='left'||spec.direction==='right',reverse=spec.direction==='left'||spec.direction==='up';
        const strips=spec.preset==='blinds'?12:1,span=(horizontal?width:height)/strips,visible=span*eased;
        for(let index=0;index<strips;index++){const offset=index*span+(reverse?span-visible:0);context.rect(horizontal?offset:0,horizontal?0:offset,horizontal?visible:width,horizontal?height:visible);}context.clip();
      }
      if(spec.preset==='slide'&&!this.reduced){const sign=spec.direction==='left'||spec.direction==='up'?-1:1;context.translate(['left','right'].includes(spec.direction)?(1-eased)*width*sign:0,['up','down'].includes(spec.direction)?(1-eased)*height*sign:0);}context.drawImage(image,0,0);context.restore();}
    if(this.index===0&&this.phase==='interludeEnter')this.visualReady?.(spec.preset==='cut'?1:progress);
    else if(['holding','awaitingStage','newStageEnter'].includes(this.phase))this.visualReady?.(1);
    this.element!.dataset.phase=this.phase;
  }
  private animationDuration(animation:ExecutableAnimation){return Array.isArray(animation)?animation.reduce((sum,item)=>sum+item.durationMs,0):animation.durationMs;}
  private duration(spec:Transition){const animation=this.animations.get(spec);return spec.durationMs||(animation?this.animationDuration(animation):0);}
  private releaseSurfaces(){for(const surface of this.surfaces.values())surface.dispose();this.surfaces.clear();}
  private titleDuration(spec:Transition){const animation=this.titleAnimations.get(spec);return this.reduced?0:spec.durationMs||(animation?this.animationDuration(animation):0);}
  private showTitle(){if(!this.title||!this.titleReady||!this.showTitles)return;if(this.titleElement){releaseEntryTitle(this.titleElement);this.titleElement.remove();}
    this.titleElement=createEntryTitle(this.title.lines);
    if(this.titleError){const text=document.createElement('span');text.role='alert';text.textContent=this.titleError;const retry=document.createElement('button');retry.textContent='重试提示 / Retry title';retry.style.pointerEvents='auto';retry.onclick=()=>void this.prepareTitle();this.titleElement.append(text,retry);}
    this.titleElapsed=0;this.surface.append(this.titleElement);this.stylePart?.('story.entryTitle',this.titleElement);if(!this.titleError)paintEntryTitle(this.titleElement,this.title.enter,0,true,this.titleAnimations.get(this.title.enter),this.reduced,1);
  }
  private complete(){this.phase='entered';this.element?.remove();this.element=null;this.canvas=null;this.controls=null;this.root.classList.remove('gc-entry-active');
    this.stopVoice();this.releaseSurfaces();this.animations.clear();for(const release of this.releases)release();this.releases=[];this.doneResolve?.(ok(undefined));this.doneResolve=null;this.readyResolve=null;
    this.showTitle();}
  stop(){this.generation++;this.stopVoice();this.readyResolve?.(fail('ENTRY_CANCELLED','入口演出已结束'));this.doneResolve?.(fail('ENTRY_CANCELLED','入口演出已结束'));this.readyResolve=null;this.doneResolve=null;this.ready=Promise.resolve(ok(undefined));this.done=Promise.resolve(ok(undefined));
    this.releaseSurfaces();this.animations.clear();this.titleAnimations.clear();this.titleReady=false;this.titleError=null;for(const release of this.releases)release();this.releases=[];this.element?.remove();if(this.titleElement)releaseEntryTitle(this.titleElement);this.titleElement?.remove();this.bgmElement?.remove();this.element=null;this.canvas=null;this.controls=null;this.titleElement=null;this.bgmElement=null;this.title=null;this.root.classList.remove('gc-entry-active');this.phase='entered';this.instance=null;this.sessionId=null;this.bgmCandidate=null;this.bgmPending=null;}
}
