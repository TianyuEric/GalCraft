import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Button } from '../components/controls.js';
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from '../components/ui/command.js';
import type { CommandSpec } from '@galcraft/contracts';

const commandNames: Record<string, [string,string]> = {
  stopAnimation:['Stop animation instance','アニメーション停止'],
  readingMode:['Reading mode','読書モード'],clearPage:['Clear reading page','読書ページをクリア'],
  changeIllustration:['Illustration','演出挿絵'],changeIllustrationDiff:['Illustration state','挿絵の差分'],
  say:['Dialogue','セリフ・ナレーション'],changeBg:['Background','背景'],changeFigure:['Character art','立ち絵'],bgm:['Background music','BGM'],video:['Video','動画'],playEffect:['Sound effects & ambience','効果音・環境音'],
  setAnimation:['Animation preset','アニメーション設定'],setComplexAnimation:['Composite animation','複合アニメーション'],setTransform:['Transform','変形'],setTempAnimation:['Temporary animation','一時アニメーション'],setTransition:['Transition','切り替え'],pixi:['Stage effects','舞台エフェクト'],pixiInit:['Clear stage effects','舞台エフェクトをクリア'],
  intro:['Intro text','序幕テキスト'],miniAvatar:['Portrait','アバター'],setTextbox:['Text box','テキストボックス'],filmMode:['Letterbox','シネマ表示'],callScene:['Call scene','シーン呼び出し'],changeScene:['Change scene','シーン切り替え'],choose:['Choice','選択肢'],label:['Label','ラベル'],jumpLabel:['Jump to label','ラベルに移動'],return:['Return to caller','呼び出し元に戻る'],
  unlockVideo:['Unlock video','映像解放'],unlockCg:['Unlock CG','CG解放'],unlockBgm:['Unlock music','音楽解放'],getUserInput:['Player input','プレイヤー入力'],setVar:['Set variable','変数設定'],showVars:['Watch variables','変数確認'],wait:['Wait','待機'],applyStyle:['Page style','ページスタイル'],callSteam:['Steam achievement','Steam実績'],end:['End story','物語を終了'],comment:['Comment','コメント'],
};
export function commandName(spec:CommandSpec,locale:string):string {
  return locale==='zh-CN' ? spec.name : commandNames[spec.key]?.[locale==='ja'?1:0] ?? spec.name;
}

export function commandCategory(key: string): string {
  if (['say','intro','comment','getUserInput','readingMode','clearPage'].includes(key)) return 'text';
  if (['bgm','playEffect','unlockBgm'].includes(key)) return 'sound';
  if (['choose','callScene','changeScene','jumpLabel','label','return','end','wait'].includes(key)) return 'flow';
  if (['setVar','showVars'].includes(key)) return 'variable';
  return 'visual';
}
export function createCommandPicker(registry: ReadonlyMap<string, CommandSpec>, locale: string, onSelect: (key: string) => void) {
  const root = document.createElement('section'); root.className = 'command-picker';
  const react = createRoot(root); let selected = registry.keys().next().value ?? '', assetKind: 'image' | 'live2d' = 'image';
  function Picker() {
    const [query, setQuery] = useState(''), [category, setCategory] = useState('all');
    const t=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
    const categories=[['all',t('全部','All','すべて')],['text',t('文本','Text','テキスト')],['visual',t('画面','Visual','画面')],['sound',t('声音','Sound','音声')],['flow',t('流程','Flow','フロー')],['variable',t('变量','Variables','変数')]];
    return <Command shouldFilter={false} onKeyDownCapture={event => { if(event.nativeEvent.isComposing && ['Enter','Escape'].includes(event.key)) {event.preventDefault();event.stopPropagation();} }}>
      <CommandInput aria-label={t('搜索指令名称或用途','Search commands or purpose','コマンド名・用途で検索')} placeholder={t('搜索指令名称或用途','Search commands or purpose','コマンド名・用途で検索')} value={query} onValueChange={setQuery}/>
      <div className="command-categories">{categories.map(([key,label])=><Button key={key} tone="quiet" aria-pressed={category===key} onClick={()=>setCategory(key)}>{label}</Button>)}</div>
      <CommandList className="command-results">{[...registry.values()].flatMap(spec => {
        const kinds: ('image'|'live2d'|null)[] = spec.key==='changeFigure'?['image','live2d']:[null];
        return kinds.flatMap(kind => {
          const label=kind==='image'?t('图片立绘','Image character art','画像の立ち絵'):kind==='live2d'?t('Live2D 立绘','Live2D character','Live2D 立ち絵'):commandName(spec,locale);
          if(category!=='all'&&commandCategory(spec.key)!==category || query&&!`${label} ${spec.name} ${spec.key} ${spec.description} ${spec.keywords.join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) return [];
          return [<CommandItem key={`${spec.key}:${kind}`} value={`${spec.key}:${kind}`} className="command-result" data-key={spec.key} data-asset-kind={kind ?? undefined} onSelect={()=>{selected=spec.key;if(kind)assetKind=kind;onSelect(spec.key);}}><strong>{label}</strong><small>{kind==='image'?'PNG / JPG':kind==='live2d'?t('模型与动作','Model & motion','モデル・動作'):spec.key}</small></CommandItem>];
        });
      })}<CommandEmpty>{t('没有匹配指令，试试其他名称。','No matching commands. Try another name.','該当するコマンドがありません。')}</CommandEmpty></CommandList>
    </Command>;
  }
  flushSync(()=>react.render(<Picker/>));
  return {root,select(key:string){selected=key;},get value(){return selected;},get assetKind(){return assetKind;},dispose(){react.unmount();}};
}
