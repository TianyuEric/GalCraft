import { prepareSaveSample } from '@galcraft/player-ui';
import { createId, StartupSequenceSchema } from '@galcraft/contracts';
import { emptyContributions } from '@galcraft/plugins/contracts';
import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { applyReadingPreset, components, completePluginPages, type OfficialTemplateKind } from '@galcraft/templates';
import type { PageKey, PlayerHost } from '@galcraft/contracts';
import { FixtureFlowEntry, FixtureIds, fixtureId } from '@galcraft/contracts/fixtures';
import { productSnapshot, productMedia, figureId, figureVariantId } from './product-fixture.js';
import { mountPlayer, PreviewHost, prepareGallerySample, gallerySampleLongTerm, type PlayerMount } from '@galcraft/player-ui';
import '@galcraft/player-ui/player.css';


const ok = <T,>(value: T) => ({ ok: true as const, value, warnings: [] });


function PlayerPage({ leaveFailure=false,galleryCardMode,continuityCards=false,surfaceRefinement=false,opening=false,canvasFourByThree=false,inputBoundary=false,page, kind='standard', appearance='paper', contract=false, sample='full',portrait=false,clear=false,nameAbove=false,nameMode='unchanged', viewportBackground=false, backgroundFit='cover', nvl=false, rich=false, independentAvatar=false, readingRoundtrip=false }: {leaveFailure?:boolean;galleryCardMode?:'single'|'multipleOneUnlocked';continuityCards?:boolean;surfaceRefinement?:boolean;opening?:boolean;canvasFourByThree?:boolean;inputBoundary?:boolean;readingRoundtrip?:boolean; nvl?:boolean; rich?:boolean; independentAvatar?:boolean; viewportBackground?:boolean; backgroundFit?:'cover'|'contain'; portrait?:boolean; clear?:boolean; nameAbove?:boolean; contract?:boolean; page: PageKey; kind?:OfficialTemplateKind; appearance?:'paper'|'night';sample?:'empty'|'partialSaves'|'selectionSaves'|'missingSaves'|'full'|'unlocked'|'longText'|'unbound'|'locked'|'partial'|'viewer'|'actual'|'playback:failed';nameMode?:'unchanged'|'fixed'|'custom' }) {
  const root = useRef<HTMLDivElement>(null), mounted=useRef<PlayerMount|null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    const container = root.current;
    if (!container) return;
    const element = document.createElement('div');
    element.style.cssText = 'width:100%;height:100%';
    container.append(element);
    let active = true;
    let dispose: (() => void) | undefined;
    const snapshot = productSnapshot(kind,appearance);
    if(surfaceRefinement){
      const panel=components(snapshot.template.pages.find(page=>page.key==='story')!.root).find(item=>item.part==='story.readingPanel')!;
      panel.normal.background={...snapshot.template.defaultVisual.background,color:'#243b61',colorOpacity:.9};panel.normal.color='#ffffff';panel.content.portrait=true;
      const character=snapshot.characters[0]!;character.avatar=figureId;
      snapshot.template.locales['zh-CN']!['title.continue']='从上一次停留的位置继续游戏';
      const title=components(snapshot.template.pages.find(page=>page.key==='title')!.root),menu=title.find(item=>item.part==='title.menu')!;menu.layout.width={unit:'px',value:360};
      for(const [index,item] of title.filter(item=>item.part.startsWith('title.menu.')).entries()){
        const asset=structuredClone(snapshot.assets.find(asset=>asset.kind==='image')!);asset.assetId=fixtureId(0x1200+index);asset.variantId=fixtureId(0x1300+index);snapshot.assets.push(asset);productMedia[asset.assetId]=`/practice/ui/spring-${['start','start','load','settings','cg','music','flow','characters','exit'][index]??'back'}.svg`;
        item.normal.images={icon:{assetId:asset.assetId,variantId:asset.variantId,mode:'contain',positionX:.5,positionY:.5,colorMode:'mask',tint:null,opacity:1,slices:null,borders:null,fillCenter:false}};item.layout.padding={top:12,right:24,bottom:12,left:24};item.layout.gap=14;if(item.part==='title.menu.exit')item.normal.images={};
      }
    }
    if(opening)snapshot.project.display.startupSequence=StartupSequenceSchema.parse({background:'#000000',revealMode:'withLastClip',clips:[{id:createId(),kind:'text',name:'作品标题',text:{'zh-CN':snapshot.project.name},fadeInMs:0,holdMs:600,fadeOutMs:1200}]});
    if(canvasFourByThree){snapshot.project.canvas.width=1600;snapshot.project.canvas.height=1200;}
    if(inputBoundary){const scene=snapshot.scenes[0]!,say=scene.instructions.find(i=>i.opcode==='say')!,variableId=createId();snapshot.variables.push({id:variableId,name:'玩家输入',type:'string',scope:'progress',initial:''});scene.instructions=[{...say,statementId:createId(),args:{speaker:{kind:'narrator'},text:'键盘起点'}},{...say,statementId:createId(),opcode:'getUserInput',args:{prompt:'输入一句话',defaultText:'',maxLength:24,allowEmpty:false,variableId}},{...say,statementId:createId(),args:{speaker:{kind:'narrator'},text:'输入完成，继续阅读。'}}];}
    if(viewportBackground){for(const page of snapshot.template.pages){if(!['story','choice','input'].includes(page.key)){page.background.imageId=FixtureIds.background;page.background.imageOpacity=1;page.background.fit=backgroundFit;}}}

    if(nvl||rich||independentAvatar){
      const scene=snapshot.scenes[0]!, index=scene.instructions.findIndex(instruction=>instruction.opcode==='say'), say=scene.instructions[index]!;
      if(nvl||rich)(say.args as Record<string,unknown>).text={segments:[{text:'星空',ruby:'ほしぞら',color:'#b8cfff',bold:true},{text:nvl?' 文字逐段留在当前页，长段按实际排版继续下一页。'.repeat(120):' hello <b>literal text</b>',italic:true}]};
      if(nvl)scene.instructions.splice(index,0,{...say,statementId:createId(),opcode:'readingMode',continuation:'continue',args:{mode:'nvl',retainIllustrations:false}});
      if(independentAvatar){const asset=snapshot.assets.find(item=>item.kind==='image')!;for(const character of snapshot.characters)character.avatar=asset.assetId;scene.instructions=scene.instructions.filter(instruction=>instruction.opcode!=='changeFigure');applyReadingPreset(snapshot.template,'portrait');}
    }
    if(clear)applyReadingPreset(snapshot.template,'clear');
    if(readingRoundtrip){
      const scene=snapshot.scenes[0]!, say=scene.instructions.find(instruction=>instruction.opcode==='say')!;
      const line=(text:string)=>({...say,statementId:createId(),args:{speaker:{kind:'character',id:snapshot.characters[0]!.id},text}});
      const mode=(mode:'adv'|'nvl')=>({...say,statementId:createId(),opcode:'readingMode',continuation:'continue' as const,args:{mode}});
      scene.instructions=[line('ADV before NVL'),mode('nvl'),line('NVL paragraph'),mode('adv'),line('ADV restored')];
    }
    const reading=components(snapshot.template.pages.find(page=>page.key==='story')!.root).find(item=>item.part==='story.readingPanel')!;
    if(surfaceRefinement)for(const character of snapshot.characters)character.avatar=figureId;
    reading.content.nameAbove=nameAbove;
    if(portrait)for(const scene of snapshot.scenes)for(const instruction of scene.instructions)if(instruction.opcode==='changeFigure')(instruction.args as Record<string,unknown>).portrait={enabled:true,crop:{x:.22,y:.02,width:.56,height:.37}};
    snapshot.lock.template=snapshot.template.dependencies.find(d=>d.kind==='template')!;
    snapshot.lock.plugins = [];
    snapshot.pluginDocuments = {};
    if(page==='choice')snapshot.scenes[0]!.instructions=[...snapshot.scenes[0]!.instructions.slice(0,2),snapshot.scenes[0]!.instructions.find(i=>i.opcode==='choose')!,...snapshot.scenes[0]!.instructions.slice(2).filter(i=>i.opcode!=='choose')];
    if(page==='input'&&nameMode==='unchanged'){const variableId=createId();snapshot.variables.push({id:variableId,name:'玩家输入',type:'string',scope:'progress',initial:''});const first=snapshot.scenes[0]!.instructions[2]!;first.opcode='getUserInput';first.args={prompt:'你想在信上写下什么？',defaultText:'愿我们再次相遇',maxLength:24,allowEmpty:false,variableId};}
    if(nameMode!=='unchanged'){
      const variableId=fixtureId(0xf30);snapshot.variables.push({id:variableId,name:'主角姓名',type:'string',scope:'progress',initial:'林舟'});
      snapshot.project.player.name={characterId:FixtureIds.an,defaultName:nameMode==='fixed'?'晨光':'林舟',allowCustom:nameMode==='custom',variableId:nameMode==='custom'?variableId:null,maxLength:nameMode==='custom'?8:24,promptPolicy:nameMode==='custom'?'firstAndAfterCompletion':'always'};
    }
    if(sample==='longText')for(const scene of snapshot.scenes)for(const i of scene.instructions)if(i.opcode==='say')(i.args as Record<string,unknown>).text='雨声渐渐变小。我们沿着站台，寻找那封来信的主人。'.repeat(24);
    if(page==='choice'&&sample==='longText'){
      const choose=snapshot.scenes[0]!.instructions.find(i=>i.opcode==='choose')!;
      const args=choose.args as {options:Record<string,unknown>[]},seed=args.options[0]!;
      args.options=[
        '沿着亮起的街灯继续前行，把还没说完的话留到明天。沿着亮起的街灯继续前行，把还没说完的话留到明天。',
        'Follow the lights to the next station, and leave enough room for the story we have not finished telling.',
        '明かりが灯る道を進み、まだ伝えていない言葉を明日へつなぐ。明かりが灯る道を進み、まだ伝えていない言葉を明日へつなぐ。',
      ].map(text=>({...seed,id:createId(),text}));
    }
    if(page==='flow'){
      const ids=Array.from({length:7},()=>createId()), scenarioId=createId(), scene=snapshot.scenes[0]!, position={sceneId:scene.scene.id,statementId:scene.instructions[0]!.statementId};
      snapshot.flowInitials=[{schemaVersion:1,id:scenarioId,name:'雨站来信 · 作者初值',projectId:snapshot.projectId,entry:position,target:position,initialProgress:{},pluginInitial:{},route:[],playerInputs:[],externalPolicy:'simulate',engineVersion:snapshot.engineVersion,pluginVersions:[snapshot.lock.engine,snapshot.lock.template]}];
      snapshot.flows=[{id:createId(),name:'共同路线',roots:[ids[0]!],nodes:ids.map((id,i)=>({id,name:['序章','雨站来信','读信','等待','支线一','支线二','尾声'][i]!,x:i%2*260,y:0,sceneId:scene.scene.id,statementId:null,unlock:{kind:'literal',value:true},lockedView:'locked',entry:i===1?{kind:'initial',debugScenarioId:scenarioId}:{kind:'firstUnlock'}})),edges:[[0,1],[1,2],[1,3],[2,4],[3,5],[4,6],[5,6]].map(([from,to])=>({id:createId(),from:ids[from!]!,to:ids[to!]!,label:''}))}];
    }

    if(['cg','music'].includes(page))prepareGallerySample(snapshot,sample);
    if(galleryCardMode){const entry=snapshot.gallery.find(item=>item.kind==='cg')!;if(galleryCardMode==='single')entry.differences=entry.differences?.slice(0,1);for(const diff of entry.differences??[])diff.assetId=FixtureIds.background;}
    if(continuityCards)for(const [index,character] of snapshot.characters.entries()){character.narrativeRole='main';character.afterstory={id:createId(),title:'雨后重逢',entry:{sceneId:snapshot.scenes[0]!.scene.id,labelId:null},unlockEndingIds:[index===0?'continuity-open':'continuity-locked'],initialProgress:{},lockedView:'locked',presentation:{figure:{assetId:figureId,variantId:figureVariantId},crop:{x:0,y:0,width:1,height:1},order:index}};}
    const contributions=emptyContributions();
    const styles:Record<string,string>={},styleIds:string[]=[];
    if(contract){
      contributions.pages.push({key:'org.galcraft.test/relations',titleKey:'page.relations',componentKey:'org.galcraft.test/relations',inputSchema:{},resultSchema:{},configFields:[],publicParts:['relations.list','relations.value'],sampleInput:{},render:()=>{const section=document.createElement('section');section.dataset.part='relations.list';const value=document.createElement('button');value.dataset.part='relations.value';value.textContent='Plugin public part';section.append(value);return section;}});
      completePluginPages(snapshot.template,contributions.pages);
      const plugin=snapshot.template.pages.find(p=>p.key==='org.galcraft.test/relations')!;const value=components(plugin.root).find(c=>c.part==='relations.value')!;value.normal.color='#112233';value.states.hover={color:'#ff0000'};
      const story=snapshot.template.pages.find(p=>p.key==='story')!;components(story.root).find(c=>c.part==='story.bodyText')!.normal.fontSize=30;
      const asset=snapshot.assets.find(a=>a.kind==='image')!;
      components(story.root).find(c=>c.part==='story.textBox')!.normal.images={frame:{assetId:asset.assetId,variantId:asset.variantId,mode:'nineSlice',positionX:.5,positionY:.5,colorMode:'original',tint:null,opacity:1,slices:{top:8,right:8,bottom:8,left:8},borders:{top:20,right:20,bottom:20,left:20},fillCenter:true}};
      const styleId=createId(),path='ui/styles/contract.css';styleIds.push(styleId);
      snapshot.template.styles.push({id:styleId,name:'Contract style',scope:{pageId:story.id,componentId:null},language:'css',sourcePath:path,sourceRevision:1,compiledPath:path,compiledSourceRevision:1,assets:[],issues:[]});
      styles[path]=`[data-gc-page-id="${story.id}"] [data-gc-part="story.toolbar.save"] {color:rgb(12, 98, 76)} [data-gc-page-id="${story.id}"] [data-gc-part="story.toolbar.save"]:hover {color:rgb(156, 42, 84)}`;
      if(page==='choice'){const options=(snapshot.scenes[0]!.instructions.find(i=>i.opcode==='choose')!.args as {options:Record<string,unknown>[]}).options;options[0]!.enabled={kind:'literal',value:false};}
    }
    const domain = { projectId: snapshot.projectId, kind: 'sample' as const, instance: createId() };
    const resources: PlayerHost['resources'] = {
      resolve: async assetId => {
        const asset = snapshot.assets.find(item => item.assetId === assetId);
        if (asset?.kind === 'audio') {
          return ok({ uri:productMedia[assetId]!,mime:'audio/ogg',bytes:asset.files[0]!.bytes,rangeSupported:true,release:()=>{} });
        }
        return ok({ uri: contract?'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#465f88"/><rect x="8" y="8" width="48" height="48" fill="#eaf0f8"/></svg>'):productMedia[assetId]!, mime: 'image/png', bytes: 68, rangeSupported: true, release: () => {} });
      },
    };
    const host = new PreviewHost(domain, resources, element);
    void mountPlayer(element, host, snapshot, domain,[],[],{contributions,manifests:[]},styles,styleIds).then(async result => {
      if (!result.ok) throw new Error(result.error.message);
      if (!active) { result.value.view.dispose(); host.dispose(); return; }
      mounted.current=result.value;
      dispose = () => { result.value.view.dispose(); host.dispose(); };
      if (['story','save','load','history','choice','input'].includes(page)) {
        await result.value.view.newGame();
        if (!['story','choice','input'].includes(result.value.view.navigation.page)) throw new Error('Player story could not start');
      }

      if(['save','load'].includes(page)&&sample!=='empty'){const inspection=result.value.session.inspect();if(inspection)await prepareSaveSample(result.value.data,snapshot,inspection,result.value.stage.captureFrame(),sample==='partialSaves'||sample==='selectionSaves'?'partial':sample==='missingSaves'?'missing':sample);if(inspection&&sample==='selectionSaves'){const data=result.value.data,record=data.makeRecord({snapshot,inspection,kind:'manual',recordId:createId(),thumbnail:null});record.summary.text='雨后的站台上，我们终于读完了那封迟来的信。'.repeat(30);await data.save({kind:'manual',slotId:data.current()!.index.manual[1]!.slotId,record,expectedIndexRevision:data.current()!.index.revision});}}
      if(['cg','music'].includes(page)){const current=result.value.data.current()!.longTerm,next=gallerySampleLongTerm(snapshot,current,sample);if(galleryCardMode==='multipleOneUnlocked'){const entry=snapshot.gallery.find(item=>item.kind==='cg')!;next.cg[entry.id]=[entry.differences![0]!.id];}await result.value.data.saveLongTerm(next,current.revision);result.value.longTerm.syncFromDisk();result.value.view.configureGallerySample(sample);}
      if(continuityCards){const current=result.value.data.current()!.longTerm;await result.value.data.saveLongTerm({...current,endings:['continuity-open']},current.revision);result.value.longTerm.syncFromDisk();}
      if(page==='flow'&&sample!=='empty'){const current=result.value.data.current()!.longTerm;for(const node of snapshot.flows[0]!.nodes.slice(0,sample==='unlocked'?7:3).filter(node=>node.entry.kind==='firstUnlock'))current.flowEntries[node.id]={...structuredClone(FixtureFlowEntry),nodeId:node.id};await result.value.data.saveLongTerm(current,current.revision);result.value.longTerm.syncFromDisk();}
      if(page==='videoError')result.value.view.showError('影片首帧读取失败。请重试，或返回标题。');
      if(leaveFailure){const preferences=result.value.data.current()!.preferences;await result.value.data.savePreferences({...preferences,confirmations:{...preferences.confirmations,title:false}},preferences.revision);host.storage.commit=async()=>({ok:false,error:{code:'STORAGE_FAILED',owner:'M07',severity:'error',message:'存储位置暂时无法写入。请检查磁盘空间后重试。',related:[],actions:['retry']},issues:[]});const title=element.querySelector<HTMLButtonElement>('[data-gc-part="story.toolbar.title"]');title?.click();}
      if (page !== 'title' && page !== 'story') result.value.view.navigation.open(page);
      element.dataset.playerReady = page;if(opening)await result.value.view.previewStartup('startup');
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; element.remove(); mounted.current = null; queueMicrotask(() => dispose?.()); };
  }, [leaveFailure,page,kind,appearance,contract,sample,nameMode,portrait,clear,nameAbove,viewportBackground,backgroundFit,nvl,rich,independentAvatar,readingRoundtrip,canvasFourByThree,inputBoundary,surfaceRefinement,opening,galleryCardMode,continuityCards]);
  return <>{surfaceRefinement&&<nav aria-label="阅读与开屏检查"><button onClick={()=>mounted.current?.view.navigation.open('settings')}>阅读设置</button><button onClick={()=>{const player=mounted.current;if(player)void player.view.newGame();}}>正式阅读</button><button onClick={()=>{const player=mounted.current;if(player&&!player.session.inspect())void player.view.previewStartup('startup');}}>预览开屏</button></nav>}{contract&&<nav aria-label="Contract controls"><button onClick={()=>{const player=mounted.current;if(player)void player.data.savePreferences({...player.data.current()!.preferences,fontScale:1.5},player.data.current()!.preferences.revision).then(()=>player.view.render());}}>Font 150%</button><button onClick={()=>mounted.current?.view.navigation.open('org.galcraft.test/relations')}>Plugin</button><button onClick={()=>mounted.current?.view.navigation.open('confirm')}>Confirm</button><button onClick={()=>mounted.current?.view.navigation.open('story')}>Story</button></nav>}{error && <div className="product-story-error" role="alert">{error}</div>}<div ref={root} className="product-story player-story" /></>;
}

const meta = { title: 'Product/Player/Pages', component: PlayerPage, args: {kind:'standard',appearance:'paper'}, argTypes:{kind:{control:'select',options:['light','standard','rich']},appearance:{control:'select',options:['paper','night']}}, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof PlayerPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Title: Story = { args: { page: 'title' } };
export const Reading: Story = { args: { page: 'story' } };
export const Save: Story = { args: { page: 'save' } };
export const Load: Story = { args: { page: 'load' } };
export const Settings: Story = { args: { page: 'settings' } };
export const History: Story = { args: { page: 'history' } };

export const Flow: Story = { args: { page: 'flow',kind:'rich' }, play:async({canvas})=>{
  const first=await canvas.findByRole('button',{name:'序章'}); await userEvent.click(first);
  await expect(canvas.getByText(/首次解锁回访位置/)).toBeVisible();
  await userEvent.click(canvas.getByRole('button',{name:'雨站来信'}));
  await expect(canvas.getByText(/独立初值/)).toBeVisible();
  await userEvent.click(canvas.getByRole('button',{name:'确认'}));
  await waitFor(()=>expect(canvas.queryByText(/独立初值/)).not.toBeInTheDocument());
  await expect(canvas.findByRole('button',{name:'返回标题'})).resolves.toBeVisible();
} };
export const FlowNight: Story = { args: { page:'flow',kind:'rich',appearance:'night' } };
export const Choice: Story = { args: { page:'choice' } };
export const Gallery: Story = { args: { page:'cg' } };
export const Music: Story = { args: { page:'music' } };
export const UnlockedMusic:Story={args:{page:'music',sample:'unlocked'}};
export const Characters: Story = { args: { page:'characters',kind:'rich' } };
export const Input: Story = {args:{page:'input'}};
export const ErrorPage: Story = {args:{page:'error'}};
export const Confirm: Story = {args:{page:'confirm'}};
export const MovieConfirmation: Story = {
  args:{page:'confirm'},
  play:async({canvas,canvasElement})=>{
    const dialog=await canvas.findByRole('dialog');
    const player=canvasElement.querySelector<HTMLElement>('.galcraft-player')!;
    player.classList.add('gc-video-active');
    await expect(dialog).toBeVisible();
    expect(getComputedStyle(player.querySelector('.gc-content:not(.gc-portal)')!).display).toBe('none');
    const cancel=canvas.getByRole('button',{name:/^取消$/}),confirm=canvas.getByRole('button',{name:/^确认$/});
    cancel.focus(); await userEvent.tab(); await expect(confirm).toHaveFocus();
    await userEvent.tab(); await expect(cancel).toHaveFocus();
  },
};
export const MovieConfirmationNight: Story = {...MovieConfirmation,args:{page:'confirm',appearance:'night'}};
export const DataClear: Story = {args:{page:'dataClear'}};
export const DataImport: Story = {args:{page:'dataImport'}};
export const Emergency: Story = {args:{page:'emergency'}};
export const VideoError: Story = {args:{page:'videoError'}};
export const SaveFailure: Story = {args:{page:'story',leaveFailure:true}};
export const SaveFailureNight: Story = {args:{page:'story',leaveFailure:true,appearance:'night'}};

export const Contracts:Story={args:{page:"story",contract:true}};
export const LockedChoice:Story={args:{page:"choice",contract:true}};
export const EmptySaves:Story={args:{page:'save',sample:'empty'}};
export const FullSaves:Story={args:{page:'save',sample:'full'}};
export const UnlockedGallery:Story={args:{page:'cg',sample:'unlocked'}};
export const LongDialogue:Story={args:{page:'story',sample:'longText'}};
export const FixedProtagonist:Story={args:{page:'story',nameMode:'fixed'}};
export const CustomProtagonist:Story={args:{page:'input',nameMode:'custom'}};

export const SpeakingPortrait:Story={args:{page:'story',portrait:true}};
export const ClearReading:Story={args:{page:'story',clear:true,nameAbove:true}};

export const UnboundGallery:Story={args:{page:'cg',sample:'unbound'}};
export const LockedGallery:Story={args:{page:'cg',sample:'locked'}};
export const PartialGallery:Story={args:{page:'cg',sample:'partial'}};
export const GalleryViewer:Story={args:{page:'cg',sample:'viewer'}};
export const GalleryLongText:Story={args:{page:'cg',sample:'longText'}};

export const GalleryNight:Story={args:{page:'cg',sample:'partial',appearance:'night'}};
export const GalleryPlaybackError:Story={args:{page:'cg',sample:'playback:failed'}};
export const GalleryEmpty:Story={args:{page:'cg',sample:'empty'}};

export const ViewportCover: Story = { args:{ page:'title', viewportBackground:true, backgroundFit:'cover' } };
export const ViewportContain: Story = { args:{ page:'title', viewportBackground:true, backgroundFit:'contain' } };

export const NvlLongParagraph: Story = { args: { page:'story',nvl:true } };
export const RichText: Story = { args: { page:'story',rich:true } };
export const IndependentAvatar: Story = { args: { page:'story',independentAvatar:true } };
export const ReadingModeRoundtrip: Story = {
  args:{page:'story',independentAvatar:true,readingRoundtrip:true},
  play:async({canvasElement})=>{
    await waitFor(()=>expect(canvasElement.querySelector('[data-player-ready="story"]')).not.toBeNull());
    const body=()=>canvasElement.querySelector<HTMLElement>('.gc-body')!;
    const clickBody=async()=>{const box=body().getBoundingClientRect();await userEvent.pointer({target:body(),keys:'[MouseLeft]',coords:{clientX:box.x+box.width/2,clientY:box.y+box.height/2}});};
    const visible=()=>canvasElement.querySelector('.gc-dialogue-visible')?.textContent;
    await waitFor(()=>expect(visible()).toBe('「ADV before NVL」'),{timeout:10000});
    const before=body().getBoundingClientRect();
    await clickBody();
    await waitFor(()=>expect(canvasElement.querySelector('.gc-nvl')).not.toBeNull());
    await waitFor(()=>expect(visible()).toContain('NVL paragraph'),{timeout:10000});
    await clickBody();
    await waitFor(()=>expect(visible()).toContain('ADV restored'));
    await waitFor(()=>expect(canvasElement.querySelector<HTMLImageElement>('img.gc-dialogue-portrait')?.naturalWidth).toBeGreaterThan(0));
    const portrait=canvasElement.querySelector('img.gc-dialogue-portrait')!.getBoundingClientRect();
    expect(body().getBoundingClientRect().x).toBe(before.x);
    expect(portrait.width).toBeLessThan(before.width/2);
  },
};

export const OneFullElevenEmpty: Story = {args:{page:'save',sample:'partialSaves'}};
export const MissingSaveThumbnails: Story = {args:{page:'load',sample:'missingSaves'}};
export const LongSaveSummary: Story = {args:{page:'save',sample:'longText'}};
export const SingleDifferenceViewer: Story = {args:{page:'cg',sample:'viewer',galleryCardMode:'single'}};
export const MultipleDifferencesOneUnlocked: Story = {args:{page:'cg',sample:'viewer',galleryCardMode:'multipleOneUnlocked'}};
export const AfterstoryWholeCards: Story = {args:{page:'characters',continuityCards:true}};
export const SaveSelectionStates: Story = {args:{page:'load',sample:'selectionSaves'},play:async({canvasElement})=>{
  await waitFor(()=>expect(canvasElement.querySelectorAll('.gc-save-slot')).toHaveLength(12));
  const slots=canvasElement.querySelectorAll<HTMLElement>('.gc-save-slot');await userEvent.click(slots[1]!);await userEvent.hover(slots[1]!);
  await expect(slots[1]).toHaveAttribute('data-gc-state','selected');await expect(slots[0]).toHaveAttribute('aria-pressed','false');
}};
export const MultilineChoices: Story = {args:{page:'choice',sample:'longText'}};

export const CanvasFourByThree:Story={args:{page:'title',canvasFourByThree:true,viewportBackground:true}};
export const KeyboardInputBoundary:Story={args:{page:'story',inputBoundary:true}};

export const SharedReadingSurface:Story={args:{page:'story',surfaceRefinement:true,independentAvatar:true},play:async({canvasElement})=>{
  await waitFor(()=>expect(canvasElement.querySelector('[data-player-ready="story"]')).not.toBeNull());
  const background=canvasElement.querySelector<HTMLElement>('.gc-reading-panel')!.style.backgroundImage;
  await userEvent.click(canvasElement.querySelector('nav[aria-label="阅读与开屏检查"] button')!);
  await waitFor(()=>expect(canvasElement.querySelector('.gc-settings-reading-stage .gc-reading-panel')).not.toBeNull());
  const panel=canvasElement.querySelector<HTMLElement>('.gc-settings-reading-stage .gc-reading-panel')!;
  expect(panel.style.backgroundImage).toBe(background);expect(panel.querySelector('.gc-speaker')).not.toBeNull();expect(panel.querySelector('.gc-body')).not.toBeNull();
}};
export const BalancedActionButtons:Story={args:{page:'title',surfaceRefinement:true}};
export const JointOpeningReveal:Story={args:{page:'title',surfaceRefinement:true,opening:true},play:async({canvasElement})=>{
  await waitFor(()=>expect(canvasElement.querySelector('.gc-startup')).not.toBeNull());
  expect(canvasElement.querySelector('.gc-startup-clip')?.textContent).toBe('雨站来信');
  await waitFor(()=>expect(canvasElement.querySelector('.gc-startup')).toBeNull(),{timeout:10000});
  expect(document.activeElement?.getAttribute('data-focus-key')).toBe('title.start');
}};
