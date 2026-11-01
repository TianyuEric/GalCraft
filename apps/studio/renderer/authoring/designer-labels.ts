import { officialLocaleResources } from '@galcraft/templates';
import type { ComponentConfig } from '@galcraft/contracts';

const official=officialLocaleResources();
const parts: Record<string,[string,string,string]>={
  types:['类型标签','Media tabs','種類タブ'],seriesTabs:['系列栏','Series tabs','シリーズタブ'],music:['音乐侧栏','Music sidebar','音楽サイドバー'],video:['影片','Videos','映像'],viewer:['查看器','Viewer','ビューアー'],difference:['差分','Variation','差分'],empty:['空槽','Empty slot','空き枠'],locked:['锁定状态','Locked state','ロック状態'],cover:['封面','Cover','表紙'],player:['播放器','Player','プレイヤー'],progress:['进度','Progress','進行状況'],time:['时间','Time','時間'],fullscreen:['全屏','Fullscreen','全画面'],entry:['条目','Entry','項目'],
  root:['页面根','Page root','ページルート'],background:['背景','Background','背景'],logo:['标志','Logo','ロゴ'],workTitle:['作品名称','Project title','作品名'],description:['作品简介','Description','作品紹介'],menu:['菜单','Menu','メニュー'],stageFrame:['舞台','Stage','ステージ'],readingPanel:['阅读面板','Reading panel','読書パネル'],nameBox:['姓名区域','Name area','名前領域'],nameText:['姓名','Name','名前'],textBox:['正文区域','Text area','本文領域'],bodyText:['正文','Body text','本文'],avatar:['头像','Portrait','ポートレート'],advanceIndicator:['继续标记','Advance indicator','続行マーク'],toolbar:['工具栏','Toolbar','ツールバー'],header:['页眉','Header','ヘッダー'],title:['标题','Title','タイトル'],footer:['页脚','Footer','フッター'],list:['列表','List','一覧'],grid:['网格','Grid','グリッド'],item:['列表项','List item','一覧項目'],thumbnail:['缩略图','Thumbnail','サムネイル'],prompt:['提示','Prompt','案内'],field:['输入框','Input field','入力欄'],counter:['计数','Counter','カウンター'],validation:['校验提示','Validation','検証メッセージ'],detail:['详情','Details','詳細'],panel:['面板','Panel','パネル'],
};
export function designerPageName(key:string,locale:string,locales:Record<string,Record<string,string>>={}):string {
  return locales[locale]?.[`page.${key}`]??official[locale as keyof typeof official]?.strings[`page.${key}`]??key;
}
export function designerComponentName(component:ComponentConfig,locale:string,locales:Record<string,Record<string,string>>={}):string {
  const label=component.content.labelKey;
  if(typeof label==='string')return locales[locale]?.[label]??official[locale as keyof typeof official]?.strings[label]??label;
  const part=component.part.split('.').at(-1)!;
  return parts[part]?.[locale==='en'?1:locale==='ja'?2:0]??part.replace(/([a-z])([A-Z])/g,'$1 $2');
}
