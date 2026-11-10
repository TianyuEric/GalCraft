import React, { useEffect, useState } from 'react';
import type {Asset,Id,Interlude,SceneDecorLayer,SceneEntryPresentation,Transition} from '@galcraft/contracts';
import {Button,Choice,Field} from '../components/controls.js';
import {Input} from '../components/ui/input.js';
import {Clapperboard,Play} from 'lucide-react';
import { StudioNumberField } from '../components/editor-fields/StudioNumberField.js';
import './scene-entry-editor.css';
const fade=(durationMs=200):Transition=>({preset:'fade',durationMs,resourceId:null,easing:{family:'sine',direction:'inOut'},direction:'left'});

export function SceneDecorEditor({ layers, assets, locale, change, choose, locate }: {
  layers: SceneDecorLayer[]; assets: Asset[]; locale: string;
  change(layers: SceneDecorLayer[]): void;
  choose(layer: SceneDecorLayer | null, origin: HTMLElement): Promise<SceneDecorLayer | null>;
  locate?: { id: Id; request: number };
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [selected, setSelected] = useState<Id | undefined>(locate?.id);
  useEffect(() => { if (locate) setSelected(locate.id); }, [locate]);
  const index = Math.max(0, layers.findIndex(layer => layer.id === selected));
  const active = layers[index];
  const name = (layer: SceneDecorLayer) => assets.find(asset => asset.id === layer.assetId)?.name
    ?? t('原图片缺失', 'Image missing', '画像なし');
  const update = (patch: Partial<SceneDecorLayer>) => change(layers.map(layer => layer.id === active?.id ? { ...layer, ...patch } : layer));
  const move = (direction: -1 | 1) => {
    const next = [...layers];
    const [layer] = next.splice(index, 1);
    if (!layer) return;
    next.splice(index + direction, 0, layer);
    setSelected(layer.id); change(next);
  };
  const number = (key: 'x' | 'y' | 'scale' | 'cameraFollow' | 'z', label: string, step: number, min?: number, max?: number) =>
    active && <Field label={label}><StudioNumberField label={label} value={active[key]} locale={locale} step={step} min={min} max={max}
      unit={key === 'x' || key === 'y' ? 'px' : ''}
      onPreview={() => {}} onCommit={value => { if (value !== active[key]) update({ [key]: value }); }}/></Field>;
  return <section className="scene-entry-editor scene-decor-editor" aria-label={t('场景布景', 'Scene decor', 'シーンの背景レイヤー')}>
    <section className="scene-entry-section">
      <header className="scene-decor-heading">
        <h3>{t('场景布景', 'Scene decor', 'シーンの背景レイヤー')}</h3>
        <Button onClick={async event => {
          const layer = await choose(null, event.currentTarget);
          if (layer) { setSelected(layer.id); change([...layers, layer]); }
        }}>{t('添加布景图层', 'Add decor layer', 'レイヤーを追加')}</Button>
      </header>
      <p className="scene-entry-help">{t('图层和立绘共享层级。同一层级的布景按列表顺序叠放。用指令「变换」选择舞台目标来移动镜头。',
        'Decor shares stacking levels with figures. The list determines order between decor layers at the same level. Use Transform with the Stage target to move the camera.',
        '背景レイヤーと立ち絵は重なり順を共有します。同じレベルの背景レイヤーはリスト順に重なります。ステージを対象に変換してカメラを動かします。')}</p>
      {active && <>
        <div className="scene-decor-tools" data-decor-layer-id={active.id}>
          <Choice label={t('编辑布景图层', 'Edit decor layer', '背景レイヤーを編集')} value={active.id}
            options={layers.map((layer, order) => ({ value: layer.id, label: `${order + 1} · ${name(layer)}` }))} onChange={setSelected}/>
          <Button tone="quiet" disabled={index === 0} onClick={() => move(-1)}>{t('上移', 'Move up', '上に移動')}</Button>
          <Button tone="quiet" disabled={index === layers.length - 1} onClick={() => move(1)}>{t('下移', 'Move down', '下に移動')}</Button>
        </div>
        <div className="scene-decor-tools">
          <Button tone="quiet" onClick={async event => { const layer = await choose(active, event.currentTarget); if (layer) update(layer); }}>{t('替换布景图片', 'Replace decor image', '画像を置換')}</Button>
          <label><input type="checkbox" checked={active.visible} onChange={event => update({ visible: event.target.checked })}/> {t('显示图层', 'Show layer', 'レイヤーを表示')}</label>
          <Button tone="quiet" onClick={() => change(layers.filter(layer => layer.id !== active.id))}>{t('移除图层', 'Remove layer', 'レイヤーを削除')}</Button>
        </div>
        <div className="scene-entry-grid" key={active.id}>
          {number('x', t('横向偏移', 'Horizontal offset', '横方向のオフセット'), 1)}
          {number('y', t('纵向偏移', 'Vertical offset', '縦方向のオフセット'), 1)}
          {number('scale', t('缩放', 'Scale', '拡大率'), .05, .01)}
          {number('z', t('层级', 'Stacking level', '重なり順'), 1)}
          {number('cameraFollow', t('镜头跟随系数', 'Camera follow factor', 'カメラ追従係数'), .05, 0, 2)}
        </div>
      </>}
    </section>
  </section>;
}
export function EntryTransitionEditor({label,value,change,locale}:{label:string;value:Transition;change(value:Transition):void;locale:string}){
  const t=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
  return <fieldset className="scene-entry-transition"><legend>{label}</legend><div className="scene-entry-grid">
    <Field label={t('效果','Effect','効果')}><Choice label={`${label} · ${t('效果','effect','効果')}`} value={value.preset} options={(['cut','fade','slide','wipe','blinds','gridFlip','diagonalReveal']as const).map((value,index)=>({value,label:[t('硬切','Cut','切替'),t('交叉淡化','Crossfade','クロスフェード'),t('滑动','Slide','スライド'),t('擦除','Wipe','ワイプ'),t('百叶窗','Blinds','ブラインド'),t('网格翻转','Grid flip','グリッド反転'),t('斜向揭示','Diagonal reveal','斜め表示')][index]!}))} onChange={preset=>change({...value,preset:preset as Transition['preset'],durationMs:preset==='cut'?0:value.durationMs||600})}/></Field>
    <Field label={t('时长 ms','Duration ms','時間 ms')}><Input type="number" min={0} value={value.durationMs} onChange={event=>change({...value,durationMs:Number(event.target.value)})}/></Field>
    <Field label={t('方向','Direction','方向')}><Choice label={`${label} · ${t('方向','direction','方向')}`} value={value.direction} options={['left','right','up','down'].map((value,index)=>({value,label:[t('向左','Left','左'),t('向右','Right','右'),t('向上','Up','上'),t('向下','Down','下')][index]!}))} onChange={direction=>change({...value,direction:direction as Transition['direction']})}/></Field>
    <Field label={t('缓动','Easing','イージング')}><Choice label={`${label} · ${t('缓动','easing','イージング')}`} value={value.easing.family} options={['linear','sine','quad','cubic'].map((value,index)=>({value,label:[t('线性','Linear','線形'),t('正弦','Sine','サイン'),t('二次','Quadratic','二次'),t('三次','Cubic','三次')][index]!}))} onChange={family=>change({...value,easing:{...value.easing,family:family as Transition['easing']['family']}})}/></Field>
    {['gridFlip','diagonalReveal'].includes(value.preset)&&(['columns','rows']as const).map(key=><Field key={key} label={key==='columns'?t('网格列数','Columns','列数'):t('网格行数','Rows','行数')}><Input type="number" min={1} max={key==='columns'?64:36} value={value.grid?.[key]??(key==='columns'?12:8)} onChange={event=>change({...value,grid:{columns:12,rows:8,...value.grid,[key]:Number(event.target.value)}})}/></Field>)}
  </div></fieldset>;
}
export function SceneEntryEditor({value,change,assets,locale,preview}:{value:SceneEntryPresentation;change(value:SceneEntryPresentation):void;assets:Asset[];locale:string;preview?(value:SceneEntryPresentation):void}){
  const t=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
  const interlude=value.interlude,update=(patch:Partial<Interlude>)=>interlude&&change({...value,interlude:{...interlude,...patch}});
  const media=(label:string,kind:'image'|'audio',ref:{assetId:string;variantId:string|null}|null,set:(ref:{assetId:string;variantId:string|null}|null)=>void)=>{
    const filtered=assets.filter(asset=>asset.kind===kind),selected=filtered.find(asset=>asset.id===ref?.assetId);
    return <><Field label={label}><Choice label={label} value={ref?.assetId??''} options={[{value:'',label:t('未配置','None','未設定')},...filtered.map(asset=>({value:asset.id,label:asset.name})),...(ref&&!selected?[{value:ref.assetId,label:t('原素材缺失','Original asset missing','元の素材なし')}]:[])]} onChange={assetId=>set(assetId?{assetId,variantId:filtered.find(asset=>asset.id===assetId)?.activeVariantId??null}:null)}/></Field>
      {selected&&<Field label={t('固定版本','Pinned version','固定バージョン')}><Choice label={`${label} · ${t('版本','version','バージョン')}`} value={ref?.variantId??selected.activeVariantId} options={selected.variants.map((variant,index)=>({value:variant.id,label:`${index+1} · ${variant.role}`}))} onChange={variantId=>ref&&set({...ref,variantId})}/></Field>}</>;
  };
  return <section className="scene-entry-editor"><header className="scene-entry-intro"><Clapperboard size={18} aria-hidden="true"/><p>{t('在章节或场景开头显示标题与可选间幕。读档后从正文位置继续。','Show a title and optional interlude at a chapter or scene opening. Loading continues from the reading position.','章やシーンの冒頭でタイトルと任意の幕間を表示します。ロード後は本文位置から続行します。')}</p></header>
    <div className="scene-entry-order" aria-label={t('播放顺序','Playback order','再生順序')}>{t('章节开场 → 场景开场 → 剧情正文','Chapter opening → Scene opening → Story','章の開始 → シーンの開始 → 本文')}</div>
    <section className="scene-entry-section"><label className="scene-entry-toggle"><span>{t('短标题卡','Title card','タイトルカード')}</span><input aria-label={t('显示短标题卡','Show title card','短いタイトルカードを表示')} type="checkbox" checked={!!value.title?.enabled} onChange={event=>change({...value,title:event.target.checked?{...(value.title??{text:'',holdMs:2500,enter:fade(),exit:fade()}),enabled:true}:null})}/></label>
    <p className="scene-entry-help">{t('章节在首场景执行，同次进入合并显示两级标题。','Chapter titles play at the first scene; simultaneous entries share a two-level title card.','章は最初のシーンで実行し、同時に入る場合は二段のタイトルにまとめます。')}</p>
    {value.title?.enabled&&<><div className="scene-entry-grid"><Field label={t('标题文字','Title text','タイトル')} help={t('留空使用章节或场景名称','Leave blank to use the chapter or scene name','空欄は章またはシーン名を使用')}><Input value={value.title.text} onChange={event=>change({...value,title:{...value.title!,text:event.target.value}})}/></Field><Field label={t('停留时间（ms）','Hold time (ms)','表示時間（ms）')}><Input aria-label={t('停留时间（ms）','Hold time (ms)','表示時間（ms）')} type="number" min={0} value={value.title.holdMs} onChange={event=>change({...value,title:{...value.title!,holdMs:Number(event.target.value)}})}/></Field></div><details className="scene-entry-advanced"><summary>{t('标题过渡','Title transitions','タイトルの遷移')} · {value.title.enter.durationMs} / {value.title.exit.durationMs} ms</summary><EntryTransitionEditor label={t('标题入场','Title enter','タイトル入場')} value={value.title.enter} change={enter=>change({...value,title:{...value.title!,enter}})} locale={locale}/><EntryTransitionEditor label={t('标题退场','Title exit','タイトル退場')} value={value.title.exit} change={exit=>change({...value,title:{...value.title!,exit}})} locale={locale}/></details></>}
    </section><section className="scene-entry-section"><label className="scene-entry-toggle"><span>{t('全屏间幕','Fullscreen interlude','全画面の幕間')}</span><input aria-label={t('播放全屏间幕','Play fullscreen interlude','全画面の幕間を再生')} type="checkbox" checked={!!interlude} disabled={!interlude&&!assets.some(asset=>asset.kind==='image')} onChange={event=>{const image=assets.find(asset=>asset.kind==='image');change({...value,interlude:event.target.checked&&image?{image:{assetId:image.id,variantId:image.activeVariantId},voice:null,fit:'contain',holdMs:2000,oldStageExit:fade(300),enter:{...fade(700),preset:'gridFlip',grid:{columns:12,rows:8}},exit:fade(300),newStageEnter:fade(300),allowSkip:true}:null});}}/></label>
    <p className="scene-entry-help">{!interlude&&!assets.some(asset=>asset.kind==='image')?t('先导入一张图片，再启用全屏间幕。','Import an image to enable the fullscreen interlude.','画像をインポートすると幕間を有効にできます。'):t('在正文前展示图片，可搭配语音和转场。','Show an image before the story, with optional voice and transitions.','本文の前に画像を表示し、音声や遷移を組み合わせられます。')}</p>
    {interlude&&<><div className="scene-entry-grid">{media(t('间幕图片','Interlude image','幕間画像'),'image',interlude.image,image=>image&&update({image}))}{media(t('可选语音','Optional voice','音声（任意）'),'audio',interlude.voice,voice=>update({voice}))}
      <Field label={t('图片适配','Image fit','画像表示')}><Choice label={t('图片适配','Image fit','画像表示')} value={interlude.fit} options={['contain','cover','fill'].map((value,index)=>({value,label:[t('完整显示','Contain','全体を表示'),t('铺满裁切','Cover','全面に表示'),t('拉伸填充','Stretch','引き伸ばし')][index]!}))} onChange={fit=>update({fit:fit as Interlude['fit']})}/></Field>
      <Field label={t('无语音停留 ms','Hold without voice ms','音声なしの表示時間 ms')}><Input type="number" min={0} value={interlude.holdMs} onChange={event=>update({holdMs:Number(event.target.value)})}/></Field></div>
      <label><input type="checkbox" checked={interlude.allowSkip} onChange={event=>update({allowSkip:event.target.checked})}/>{t('允许右键或 Esc 跳过整个入口','Allow right-click or Esc to skip the entry','右クリック・Escで入口をスキップ')}</label>
      <details className="scene-entry-advanced"><summary>{t('过渡 · 旧舞台退场 → 间幕入场 → 间幕退场 → 新舞台入场','Transitions · Old stage exit → Interlude enter → Interlude exit → New stage enter','遷移・旧舞台退場 → 幕間入場 → 幕間退場 → 新舞台入場')}</summary>{(['oldStageExit','enter','exit','newStageEnter']as const).map((key,index)=><EntryTransitionEditor key={key} label={[t('旧舞台退场','Old stage exit','旧舞台退場'),t('间幕入场','Interlude enter','幕間入場'),t('间幕退场','Interlude exit','幕間退場'),t('新舞台入场','New stage enter','新舞台入場')][index]!} value={interlude[key]} change={transition=>update({[key]:transition})} locale={locale}/>)}</details></>}
    </section>{preview&&<Button onClick={()=>preview(value)}><Play size={16}/>{t('应用并预览','Apply and preview','適用してプレビュー')}</Button>}
  </section>;
}
