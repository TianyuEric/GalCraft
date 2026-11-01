import React, { useEffect, useRef, useState } from 'react';
import type { GalleryEntry, Id, LongTerm, PlayerHost, Snapshot } from '@galcraft/contracts';
import type { AudioMixer } from '@galcraft/stage';
import { ResourceImage } from './resource-image.js';
import type { PageAudioController } from './page-audio.js';
import { businessParts } from './business-parts.js';
import type { BusinessPageAdapter } from './instance-renderer.js';
import { componentDefinition } from '@galcraft/templates';
import { issueDetails, localizeIssue, issueFromError, type Issue } from '@galcraft/contracts';

export type GalleryState = { type: 'cg'|'video'; series: Record<'cg'|'video', string>; selected: Record<'cg'|'video', Id|null>;
  scroll: Record<'cg'|'video', number>; viewer: Id|null; difference: Id|null; music: Id|null; auxiliary: boolean };
export const galleryState = (): GalleryState => ({ type: 'cg', series: { cg: '', video: '' }, selected: { cg: null, video: null }, scroll: { cg: 0, video: 0 }, viewer: null, difference: null, music: null, auxiliary: true });
export const ordered = <T extends {order:number}>(items: T[]): T[] => [...items].sort((a,b) => a.order-b.order);
export function unlockedDifferences(entry: GalleryEntry, data: LongTerm) {
  return ordered(entry.differences ?? []).filter(diff => data.cg[entry.id]?.includes(diff.id));
}
export function galleryUnlocked(entry: GalleryEntry, data: LongTerm): boolean {
  return entry.kind === 'cg' ? unlockedDifferences(entry,data).length > 0 : data[entry.kind].includes(entry.id);
}
export function galleryCover(entry: GalleryEntry, data: LongTerm): Id|undefined {
  if (!galleryUnlocked(entry,data)) return undefined;
  if (entry.kind !== 'cg') return entry.cover ?? undefined;
  const differences = unlockedDifferences(entry,data);
  return (differences.find(diff => diff.id === entry.coverDifferenceId) ?? differences[0])?.assetId;
}
type Part = (key: string) => (element: HTMLElement|null) => void;
type Props = { snapshot: Snapshot; data: LongTerm; host: PlayerHost; state: GalleryState; page: 'cg'|'music';
  compose?(adapter:BusinessPageAdapter,rootPart?:string):React.ReactNode;
  present?(change:()=>void):void|Promise<void>;
  audio: PageAudioController; mixer: AudioMixer; part: Part; language: string; volume: number; paused: boolean;
  redraw():void; back():void; settings():void; animate(change:()=>void):void; sample?:string };

export function GalleryPage(p: Props) {
  const {snapshot,data,state,audio} = p;
  const part:Part=key=>p.part(p.page==='cg'&&key.startsWith('music.')?`cg.${key}`:key);
  const t = (zh:string,en:string,ja:string) => p.language==='en'?en:p.language==='ja'?ja:zh;
  const asset = (id:Id|undefined) => snapshot.assets.find(item=>item.assetId===id);
  const list = ordered(snapshot.gallery.filter(entry=>entry.kind===state.type && (galleryUnlocked(entry,data)||entry.lockedView==='placeholder')));
  const series = [...new Map([...list].sort((a,b)=>(a.seriesOrder??0)-(b.seriesOrder??0)).map(entry=>[entry.series,entry.series])).values()];
  const filtered = list.filter(entry=>!state.series[state.type]||entry.series===state.series[state.type]);
  const current = list.find(entry=>entry.id===state.viewer&&galleryUnlocked(entry,data));
  const available = current?.kind==='cg'?unlockedDifferences(current,data):[];
  const difference = available.find(diff=>diff.id===state.difference)??available[0];
  const viewerNode=useRef<HTMLElement|null>(null);
  const trapViewerFocus=(event:React.KeyboardEvent<HTMLElement>)=>{
    if(event.key!=='Tab')return;
    const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(element=>element.getClientRects().length&&!element.closest('[hidden]'));
    const index=controls.indexOf(document.activeElement as HTMLElement);
    if(controls.length&&(index<0||event.shiftKey&&index===0||!event.shiftKey&&index===controls.length-1)){event.preventDefault();event.stopPropagation();controls[event.shiftKey?controls.length-1:0]?.focus();}
  };
  useEffect(()=>{const viewer=viewerNode.current;if(!current||!viewer)return;
    const origin=document.activeElement as HTMLElement|null;
    const siblings=[...viewer.parentElement!.children].filter(element=>element!==viewer) as HTMLElement[];
    const prior=siblings.map(element=>element.inert);siblings.forEach(element=>element.inert=true);
    if(!viewer.contains(document.activeElement))viewer.querySelector<HTMLElement>('button:not(:disabled),[tabindex="0"]')?.focus();
    return()=>{siblings.forEach((element,index)=>element.inert=prior[index]!);if(origin?.isConnected)origin.focus({preventScroll:true});};
  },[current?.id]);
  const present=(change:()=>void)=>{const redraw=()=>{change();p.redraw();};if(p.present)void p.present(redraw);else redraw();};
  const selectDifference = (delta:number) => {const index=available.findIndex(diff=>diff.id===difference?.id);present(()=>{state.difference=available[(index+delta+available.length)%available.length]?.id??null;});};
  const image = (id:Id|undefined, key:string, title='') => <span className="gc-gallery-art" ref={part(key)}>{asset(id)?<ResourceImage host={p.host} asset={asset(id)} alt={title}/>:<span aria-hidden="true" className="gc-gallery-placeholder">◇</span>}</span>;
  const close = () => {state.viewer=null;p.redraw();requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-gallery-id="${state.selected[state.type]}"]`)?.focus());};
  const music = ordered(snapshot.gallery.filter(entry=>entry.kind==='music'&&(data.music.includes(entry.id)||entry.lockedView==='placeholder')));
  const selectedMusic = music.find(entry=>entry.id===state.music&&data.music.includes(entry.id));
  const musicAsset=asset(selectedMusic?.assets[0]);
  const playing=audio.audition.state==='playing';
  const inspection=audio.auditionInspection();const staticPlayback=p.sample?.startsWith('playback:');const position=staticPlayback?45:inspection?.ok?inspection.value.positionSec:0,duration=staticPlayback?180:inspection?.ok?inspection.value.durationSec:0;
  const statuses={idle:t('未播放','Idle','未再生'),loading:t('准备中','Loading','準備中'),playing:t('播放中','Playing','再生中'),paused:t('已暂停','Paused','一時停止'),stopped:t('已停止','Stopped','停止'),ended:t('已结束','Ended','終了'),blocked:t('请启用声音','Enable sound','音声を有効化'),failed:t('播放失败','Playback failed','再生失敗')};
  const audition = <section className="gc-gallery-music" ref={part(p.page==='cg'?'cg.music':'music.player')} aria-label={t('音乐鉴赏','Music gallery','音楽鑑賞')}>
    <h2>{t('音乐鉴赏','Music gallery','音楽鑑賞')}</h2>
    <section className="gc-gallery-tracks" ref={part('music.list')}>
      {music.map(entry=>{const unlocked=data.music.includes(entry.id);return <button key={entry.id} data-locked={!unlocked} ref={part('music.list.item')} disabled={!unlocked||current?.kind==='video'} aria-pressed={state.music===entry.id} onClick={()=>{state.music=entry.id;p.redraw();}}>
        <span ref={part('music.list.item.cover')} aria-hidden="true">{unlocked&&entry.cover?image(entry.cover,'music.list.item.cover.image'):unlocked?'♫':'◇'}</span><span ref={part('music.list.item.title')}>{unlocked?entry.name:<span ref={part('music.list.item.locked')}>{t('未解锁','Locked','未解放')}</span>}</span></button>;})}
      {!music.length&&<p>{t('暂无音乐','No music yet','楽曲がありません')}</p>}
    </section>
    <section className="gc-gallery-player" ref={p.page==='cg'?part('music.player'):undefined}><label>{t('音乐音量','Music volume','音楽の音量')}<input aria-label={t('音乐音量','Music volume','音楽の音量')} ref={part('music.player.volume')} type="range" min="0" max="1" step="0.05" value={audio.audition.volume??1} onChange={event=>audio.setAuditionVolume(Number(event.target.value))}/></label>
    <h3>{selectedMusic?.name??t('选择曲目后播放','Select a track to play','曲を選択して再生')}</h3>
    <p role="status">{staticPlayback?statuses[p.sample!.slice(9) as keyof typeof statuses]:statuses[audio.audition.state]}{audio.audition.error&&` · ${audio.audition.issue?localizeIssue(audio.audition.issue,p.language):audio.audition.error}`}</p>{audio.audition.issue&&<details><summary>{t('诊断详情','Diagnostic details','診断の詳細')}</summary><pre>{issueDetails(audio.audition.issue)}</pre></details>}
    <label className="gc-gallery-seek">{t('播放进度','Playback position','再生位置')}<input aria-label={t('播放进度','Playback position','再生位置')} ref={part('music.player.progress')} className="gc-music-seek" type="range" min="0" max={duration||1} step="0.1" value={position} disabled={!duration||current?.kind==='video'} onChange={event=>audio.seekAudition(Number(event.target.value))}/><output className="gc-music-position" ref={part('music.player.time')}>{formatTime(position)} / {formatTime(duration)}</output></label>
    <nav className="gc-gallery-controls"><button ref={part('music.player.play')} disabled={!musicAsset||current?.kind==='video'||playing||audio.audition.state==='loading'} onClick={()=>{if(!musicAsset)return;if(audio.audition.asset?.assetId===musicAsset.assetId&&playing)audio.pauseAudition();else if(audio.audition.asset?.assetId===musicAsset.assetId&&['paused','blocked'].includes(audio.audition.state))void audio.resumeAudition();else void audio.playAudition(musicAsset);}}>{audio.audition.state==='paused'?t('继续','Resume','再開'):t('播放','Play','再生')}</button>
      <button ref={part('music.player.pause')} disabled={!playing||current?.kind==='video'} onClick={()=>audio.pauseAudition()}>{t('暂停','Pause','一時停止')}</button><button ref={part('music.player.stop')} disabled={current?.kind==='video'} onClick={()=>audio.stopAudition()}>{t('停止','Stop','停止')}</button><label><input type="checkbox" checked={audio.audition.loop} onChange={event=>audio.setAuditionLoop(event.target.checked)}/>{t('循环','Loop','ループ')}</label></nav></section>
  </section>;
  const source = <section className={`gc-gallery-shell ${p.page==='music'?'gc-gallery-music-only':''}`}>
    <nav className="gc-gallery-top"><h1 ref={part(`${p.page}.header`)}>{p.page==='music'?t('音乐鉴赏','Music gallery','音楽鑑賞'):t('图像与影片鉴赏','Image & video gallery','画像・映像鑑賞')}</h1><button onClick={p.settings}>{t('设置','Settings','設定')}</button></nav>
    <section className="gc-gallery-columns">
      {p.page==='cg'&&<section className="gc-gallery-main">
        <nav className="gc-gallery-tabs" ref={part('cg.types')} aria-label={t('鉴赏类型','Gallery type','鑑賞の種類')}>{(['cg','video'] as const).map(type=><button key={type} ref={part(`cg.types.${type}`)} aria-pressed={state.type===type} onClick={()=>p.animate(()=>{state.type=type;state.viewer=null;p.redraw();})}>{type==='cg'?'CG':t('影片','Videos','映像')}</button>)}</nav>
        <nav className="gc-gallery-series" ref={part('cg.seriesTabs')} aria-label={t('系列','Series','シリーズ')}><button aria-pressed={!state.series[state.type]} onClick={()=>{state.series[state.type]='';p.redraw();}}>{t('全部','All','すべて')}</button>{series.map(name=><button key={name} title={name} aria-pressed={state.series[state.type]===name} onClick={()=>p.animate(()=>{state.series[state.type]=name;p.redraw();})}>{name||t('默认系列','Default series','既定のシリーズ')}</button>)}</nav>
        <section data-gc-part={state.type==='cg'?'cg.grid':'video.grid'} key={`${state.type}/${state.series[state.type]}`} className={`gc-gallery-cards gc-gallery-${state.type}-cards`} ref={element=>{part(state.type==='cg'?'cg.grid':'video.grid')(element);if(element)element.scrollTop=state.scroll[state.type];}} onScroll={event=>{state.scroll[state.type]=event.currentTarget.scrollTop;}}>
          {filtered.map(entry=>{const unlocked=galleryUnlocked(entry,data),prefix=entry.kind==='cg'?'cg.grid.item':'video.grid.item';return <button key={entry.id} data-gallery-id={entry.id} data-locked={!unlocked} ref={part(prefix)} disabled={!unlocked} aria-pressed={state.selected[state.type]===entry.id} title={unlocked?entry.name:t('尚未解锁','Not unlocked yet','未解放')} onClick={()=>{state.selected[state.type]=entry.id;p.redraw();}} onDoubleClick={()=>present(()=>{state.viewer=entry.id;state.difference=null;})}>
            {image(galleryCover(entry,data),`${prefix}.cover`)}<span ref={part(`${prefix}.title`)}>{unlocked?entry.name:t('未解锁','Locked','未解放')}</span><small ref={part(`${prefix}.locked`)}>{entry.kind==='cg'?`${unlockedDifferences(entry,data).length} / ${entry.differences?.length??0}`:unlocked?'▶':'◇'}</small></button>;})}
          {filtered.length>0&&Array.from({length: Math.max(0,(state.type==='cg'?16:9)-filtered.length)},(_,index)=><section aria-hidden="true" key={`empty-${index}`} className="gc-gallery-empty-slot" data-empty="true" ref={part(`${state.type==='cg'?'cg':'video'}.grid.item.empty`)}>{image(undefined,`${state.type==='cg'?'cg':'video'}.grid.item.cover`)}</section>)}
          {!filtered.length&&<p className="gc-gallery-empty" ref={part('cg.empty')}>{t('此系列暂无内容','No items in this series','このシリーズには内容がありません')}</p>}
        </section>
        <nav className="gc-gallery-controls"><button disabled={!state.selected[state.type]||!list.some(entry=>entry.id===state.selected[state.type]&&galleryUnlocked(entry,data))} onClick={()=>present(()=>{state.viewer=state.selected[state.type];state.difference=null;})}>{state.type==='cg'?t('查看','View','表示'):t('播放影片','Play video','映像を再生')}</button><span>{filtered.length} {t('个条目','items','項目')}</span></nav>
      </section>}{audition}
    </section>
    <footer ref={part(`${p.page}.footer`)}><span>{t('仅显示已解锁内容','Only unlocked content is available','解放済みの内容のみ利用できます')}</span><button ref={part(`${p.page}.back`)} onClick={p.back}>{t('返回','Back','戻る')}</button></footer>
    {current&&<section data-gc-part={current.kind==='cg'?'cg.viewer':'video.viewer'} className="gc-gallery-viewer" role="dialog" aria-modal="true" aria-label={current.name} onKeyDown={trapViewerFocus} ref={node=>{viewerNode.current=node;part(current.kind==='cg'?'cg.viewer':'video.viewer')(node);}}>
      {current.kind==='cg'?<><nav className="gc-gallery-controls gc-gallery-viewer-header" ref={part('cg.viewer.header')}><h2 ref={part('cg.viewer.title')}>{current.name}</h2><button ref={part('cg.viewer.auxiliary')} aria-pressed={state.auxiliary} onClick={()=>{state.auxiliary=!state.auxiliary;p.redraw();}}>{t('辅助栏','Navigation bars','補助バー')}</button><button ref={part('cg.viewer.back')} onClick={close}>{t('返回目录','Back to gallery','一覧に戻る')}</button></nav>
        {state.auxiliary&&<nav className="gc-gallery-entry-strip" ref={part('cg.viewer.entries')}>{list.filter(entry=>galleryUnlocked(entry,data)).map(entry=><button key={entry.id} ref={part('cg.viewer.entry')} aria-pressed={entry.id===current.id} onClick={()=>present(()=>{state.viewer=entry.id;state.difference=null;})}>{image(galleryCover(entry,data),'cg.viewer.entry.cover')}<span ref={part('cg.viewer.entry.title')}>{entry.name}</span></button>)}</nav>}
        <section className="gc-gallery-image-area" ref={part('cg.viewer.content')} tabIndex={0} onKeyDown={event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();selectDifference(event.key==='ArrowRight'?1:-1);}}}>
          {state.auxiliary&&(current.differences?.length??0)>1&&<nav className="gc-gallery-differences" ref={part('cg.viewer.differences')}>{ordered(current.differences??[]).map(diff=>{const unlocked=data.cg[current.id]?.includes(diff.id);return <button key={diff.id} data-locked={!unlocked} disabled={!unlocked} aria-pressed={difference?.id===diff.id} ref={part('cg.viewer.difference')} onClick={()=>present(()=>{state.difference=diff.id;})}>{unlocked?image(diff.assetId,'cg.viewer.difference.cover'):<span className="gc-gallery-art" aria-hidden="true"/>}<span ref={part('cg.viewer.difference.title')}>{unlocked?diff.name:t('未解锁','Locked','未解放')}</span></button>;})}</nav>}
          <section className="gc-gallery-full-image" ref={part('cg.viewer.image')}>{difference&&image(difference.assetId,'cg.viewer.image.content',difference.name)}</section>
        </section><nav className="gc-gallery-controls" ref={part('cg.viewer.footer')}><button ref={part('cg.viewer.previous')} disabled={available.length<2} onClick={()=>selectDifference(-1)}>{t('上一张','Previous','前へ')}</button><output ref={part('cg.viewer.counter')}>{t('已解锁','Unlocked','解放済み')} {available.length} / {current.differences?.length??0}</output><button ref={part('cg.viewer.next')} disabled={available.length<2} onClick={()=>selectDifference(1)}>{t('下一张','Next','次へ')}</button></nav></>:
        <GalleryVideo sample={p.sample} entry={current} host={p.host} snapshot={snapshot} mixer={p.mixer} volume={p.volume} paused={p.paused} part={part} close={close} t={t}/>}
    </section>}
  </section>;
  if(!p.compose)return source;
  const projection=businessParts(source);
  return p.compose({data:{galleryEntries:filtered.map(entry=>({...entry,locked:!galleryUnlocked(entry,data)})),musicEntries:music.map(entry=>({...entry,locked:!data.music.includes(entry.id)})),viewerEntries:list.filter(entry=>galleryUnlocked(entry,data)),galleryDifferences:ordered(current?.differences??[])},
    state:(component)=>({visible:!component.part.startsWith('video.viewer.')&&(projection.has(component.part)||component.part===`${p.page}.root`||component.part==='cg.music'||component.part.startsWith('basic.'))}),
    business:(component,children,context)=>{
      const musicPart=component.part.replace(/^cg\.(music\.)/,'$1');
      if(['cg.viewer.title','cg.viewer.entry.title','cg.viewer.difference.title'].includes(component.part)){
        const rendered=projection.render(component,children,context),item=context.item as {id?:Id;name?:string}|undefined;
        const unlocked=component.part!=='cg.viewer.difference.title'||!!(current&&item?.id&&data.cg[current.id]?.includes(item.id));
        return React.isValidElement<{style?:React.CSSProperties;title?:string}>(rendered)?React.cloneElement(rendered,{title:unlocked?(component.part==='cg.viewer.title'?current?.name:item?.name):undefined,style:{...rendered.props.style,minWidth:0,maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}):rendered;
      }
      if(component.part==='cg.viewer.content'||component.part==='cg.viewer.image'){
        const rendered=projection.render(component,children,context);
        return React.isValidElement<{style?:React.CSSProperties}>(rendered)?React.cloneElement(rendered,{style:{...rendered.props.style,flex:'1 1 0',minHeight:0,minWidth:0}}):rendered;
      }
      if(musicPart==='music.list.item.title'){const rendered=projection.render(component,children,context);return React.isValidElement<{style?:React.CSSProperties;title?:string}>(rendered)?React.cloneElement(rendered,{title:(context.item as {name?:string;locked?:boolean})?.locked?undefined:(context.item as {name?:string})?.name,style:{...rendered.props.style,flex:'1 1 0',minWidth:0,width:'auto',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}):rendered;}
      if(musicPart==='music.player')return <section className="gc-gallery-player"><h3>{selectedMusic?.name??t('选择曲目后播放','Select a track to play','曲を選択して再生')}</h3><p role="status">{staticPlayback?statuses[p.sample!.slice(9) as keyof typeof statuses]:statuses[audio.audition.state]}{audio.audition.error&&` · ${audio.audition.issue?localizeIssue(audio.audition.issue,p.language):audio.audition.error}`}</p>{audio.audition.issue&&<details><summary>{t('诊断详情','Diagnostic details','診断の詳細')}</summary><pre>{issueDetails(audio.audition.issue)}</pre></details>}{children}<label className="gc-gallery-loop"><input type="checkbox" checked={audio.audition.loop} onChange={event=>audio.setAuditionLoop(event.target.checked)}/>{t('循环','Loop','ループ')}</label></section>;
      if(musicPart==='music.player.volume')return <label className="gc-gallery-volume">{t('音乐音量','Music volume','音楽の音量')}<input aria-label={t('音乐音量','Music volume','音楽の音量')} type="range" min="0" max="1" step="0.05" value={audio.audition.volume??1} onChange={event=>audio.setAuditionVolume(Number(event.target.value))}/>{children}</label>;
      if(musicPart==='music.player.progress')return <label className="gc-gallery-seek">{t('播放进度','Playback position','再生位置')}<input aria-label={t('播放进度','Playback position','再生位置')} type="range" min="0" max={duration||1} step="0.1" value={position} disabled={!duration||current?.kind==='video'} onChange={event=>audio.seekAudition(Number(event.target.value))}/>{children}</label>;
      if(component.part===`${p.page}.root`)return <section className="gc-gallery-shell" style={{inset:0}}>{children}<button style={{position:'absolute',right:48,top:48}} onClick={p.settings}>{t('设置','Settings','設定')}</button>{p.page==='cg'&&<nav className="gc-gallery-controls" style={{position:'absolute',left:48,bottom:100}}><button disabled={!state.selected[state.type]||!list.some(entry=>entry.id===state.selected[state.type]&&galleryUnlocked(entry,data))} onClick={()=>present(()=>{state.viewer=state.selected[state.type];state.difference=null;})}>{state.type==='cg'?t('查看','View','表示'):t('播放影片','Play video','映像を再生')}</button><span>{filtered.length} {t('个条目','items','項目')}</span></nav>}</section>;if(component.part==='video.viewer'&&current?.kind==='video')return <section ref={node=>{viewerNode.current=node;part('video.viewer')(node);}} className="gc-gallery-viewer" role="dialog" aria-modal="true" aria-label={current.name} onKeyDown={trapViewerFocus}><GalleryVideo sample={p.sample} entry={current} host={p.host} snapshot={snapshot} mixer={p.mixer} volume={p.volume} paused={p.paused} part={part} close={close} t={t} compose={p.compose}/></section>;if(!componentDefinition(component.part))return undefined;return projection.render(component,children,context);}});
}
export const formatTime = (seconds:number) => {const n=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};

function GalleryVideo(p:{sample?:string;entry:GalleryEntry;host:PlayerHost;snapshot:Snapshot;mixer:AudioMixer;volume:number;paused:boolean;part:Part;close():void;t(zh:string,en:string,ja:string):string;compose?:Props['compose']}) {
  const ref=useRef<HTMLVideoElement>(null),[error,setError]=useState(''),[status,setStatus]=useState('loading'),[time,setTime]=useState(0),[duration,setDuration]=useState(0),[retry,setRetry]=useState(0),[gain,setGain]=useState(1);
  const [errorIssue,setErrorIssue]=useState<Issue|null>(null),locale=p.t('zh-CN','en','ja');
  const reportError=(error:unknown)=>{const issue=issueFromError(error,'M07');setErrorIssue(issue);setError(localizeIssue(issue,locale));};
  const wasPlaying=useRef(false);const staticSample=!!p.sample&&p.sample!=='actual';
  const fullscreenButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{let fullscreen=false;const changed=()=>{if(document.fullscreenElement===ref.current)fullscreen=true;else if(fullscreen){fullscreen=false;fullscreenButton.current?.focus();}};document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
  useEffect(()=>{let active=true,release:(()=>void)|undefined;const element=ref.current!;if(staticSample){setStatus(p.sample?.slice(9)||'paused');setDuration(180);setTime(45);if(p.sample==='playback:failed')setError(p.t('影片读取或播放失败','Video could not be loaded or played','映像を読み込み・再生できません'));return;}p.mixer.setPause('video',true);setError('');setStatus('loading');
    const media=p.snapshot.assets.find(item=>item.assetId===p.entry.assets[0]);
    if(!media){setError(p.t('影片素材不可用','Video unavailable','映像を利用できません'));return ()=>p.mixer.setPause('video',false);}
    void p.host.resources.resolve(media.assetId,media.variantId).then(async resolved=>{if(!active){if(resolved.ok)resolved.value.release();return;}if(!resolved.ok){setErrorIssue(resolved.error);setError(localizeIssue(resolved.error,locale));return;}release=resolved.value.release;element.src=resolved.value.uri;try{await element.play();}catch(e){if(active)reportError(e);}});
    return()=>{active=false;element.pause();element.removeAttribute('src');element.load();release?.();p.mixer.setPause('video',false);};
  },[p.entry.id,retry]);
  useEffect(()=>{if(ref.current)ref.current.volume=p.volume*gain;},[p.volume,gain]);
  useEffect(()=>{const video=ref.current;if(!video)return;if(p.paused){wasPlaying.current=!video.paused;video.pause();}else if(wasPlaying.current){wasPlaying.current=false;void video.play().catch(reportError);}},[p.paused]);
  const source = <><nav className="gc-gallery-controls"><h2>{p.entry.name}</h2><button ref={p.part('video.viewer.back')} onClick={p.close}>{p.t('返回目录','Back to gallery','一覧に戻る')}</button></nav>
    <video ref={ref} playsInline preload="metadata" onLoadedMetadata={e=>setDuration(e.currentTarget.duration)} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onPlay={()=>setStatus('playing')} onPause={()=>setStatus('paused')} onEnded={()=>setStatus('ended')} onError={()=>setError(p.t('影片读取或播放失败','Video could not be loaded or played','映像を読み込み・再生できません'))}/>
    <p role="status">{error||({loading:p.t('准备中','Loading','準備中'),playing:p.t('播放中','Playing','再生中'),paused:p.t('已暂停','Paused','一時停止'),ended:p.t('已结束','Ended','終了')}[status])}</p>
    <label>{p.t('影片进度','Video position','映像の再生位置')}<input aria-label={p.t('影片进度','Video position','映像の再生位置')} ref={p.part('video.viewer.progress')} type="range" min="0" max={duration||1} step="0.1" value={time} disabled={!duration} onChange={event=>{const value=Number(event.target.value);if(ref.current)ref.current.currentTime=value;setTime(value);}}/><output ref={p.part('video.viewer.time')}>{formatTime(time)} / {formatTime(duration)}</output></label>
    <nav className="gc-gallery-controls"><button ref={p.part('video.viewer.play')} onClick={()=>{const video=ref.current!;if(video.paused){if(video.ended)video.currentTime=0;void video.play().catch(reportError);}else video.pause();}}>{status==='playing'?p.t('暂停','Pause','一時停止'):p.t('播放／重播','Play / replay','再生・リプレイ')}</button><button ref={p.part('video.viewer.stop')} onClick={()=>{ref.current!.pause();ref.current!.currentTime=0;}}>{p.t('停止','Stop','停止')}</button>
    <label>{p.t('音量','Volume','音量')}<input aria-label={p.t('音量','Volume','音量')} ref={p.part('video.viewer.volume')} type="range" min="0" max="1" step="0.05" value={gain} onChange={event=>setGain(Number(event.target.value))}/></label>
    <button data-gc-part="video.viewer.fullscreen" ref={element=>{fullscreenButton.current=element;p.part('video.viewer.fullscreen')(element);}} onClick={()=>void ref.current?.requestFullscreen().catch(reportError)}>{p.t('全屏','Fullscreen','全画面')}</button>{error&&<button onClick={()=>setRetry(retry+1)}>{p.t('重试','Retry','再試行')}</button>}</nav>{errorIssue&&<details><summary>{p.t('诊断详情','Diagnostic details','診断の詳細')}</summary><pre>{issueDetails(errorIssue)}</pre></details>}</>;
  if(!p.compose)return source;
  const projection=businessParts(source);
  return <>{projection.residual}{p.compose({data:{},state:component=>({visible:projection.has(component.part)||component.part.startsWith('basic.')}),business:projection.render},'video.viewer')}</>;
}
