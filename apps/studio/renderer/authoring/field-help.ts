import { createId } from '@galcraft/contracts';
import type { FieldSpec } from '@galcraft/contracts';
import { formHint } from '../components/form-hints.js';
export const names: Record<string, [string, string, string]> = {
  animationId: ['动画实例', 'Animation instance', 'アニメーションインスタンス'],
  figureVisible: ['显示共同差分立绘', 'Show shared figure', '共通差分の立ち絵を表示'], avatarVisible: ['显示共同差分头像', 'Show shared portrait', '共通差分のアバターを表示'],
  difference: ['绑定角色共同差分', 'Bind shared character difference', 'キャラクターの共通差分を連動'], variantId: ['固定素材版本', 'Pinned asset version', '固定素材バージョン'],
  grid: ['网格设置', 'Grid settings', 'グリッド設定'], columns: ['网格列数', 'Grid columns', 'グリッド列数'], rows: ['网格行数', 'Grid rows', 'グリッド行数'],
  shockwave: ['冲击波', 'Shockwave', '衝撃波'], time: ['时间', 'Time', '時間'],
  amplitude: ['振幅', 'Amplitude', '振幅'], wavelength: ['波长', 'Wavelength', '波長'], radius: ['半径', 'Radius', '半径'],
  centerX: ['中心 X', 'Center X', '中心 X'], centerY: ['中心 Y', 'Center Y', '中心 Y'],
  circle: ['圆形显隐', 'Circular reveal', '円形表示'], invert: ['反转', 'Invert', '反転'],
  playback: ['图片播放', 'Image playback', '画像再生'], wait: ['等待完成', 'Wait for completion', '完了まで待機'], layer: ['绘制层', 'Render layer', '描画レイヤー'],
  retainIllustrations: ['NVL 中保留插图', 'Keep illustrations in NVL', 'NVLで挿絵を表示'],
  avatarMode: ['本句头像来源', 'Sentence portrait source', '台詞のアバター'],
  illustrationFrame: ['插图目标框', 'Illustration frame', '挿絵の表示枠'],
  widthRatio: ['画布宽度比例', 'Canvas width ratio', '画面の幅に対する割合'], heightRatio: ['画布高度比例', 'Canvas height ratio', '画面の高さに対する割合'],
  states: ['命名差分', 'Named states', '名前付き差分'], stateName: ['差分名称', 'State name', '差分名'],
  state: ['差分状态', 'State', '差分状態'],
  differenceId:['CG 差分','CG variation','CG 差分'],differenceIds:['解锁差分','Variations to unlock','解放する差分'],
  portrait: ['说话头像（当前立绘）', 'Speaking portrait (current figure)', '話者ポートレート（現在の立ち絵）'],
  characterId: ['角色', 'Character', 'キャラクター'], objectId: ['舞台对象标识', 'Stage object ID', 'ステージオブジェクトID'], soundId: ['音效标识', 'Sound ID', '効果音ID'], styleId: ['样式', 'Style', 'スタイル'], effectId: ['特效标识', 'Effect ID', 'エフェクトID'],
  options: ['选项', 'Options', '選択肢'], previewDefault: ['预览默认选项', 'Preview default', 'プレビューの既定値'],
  speaker: ['说话者', 'Speaker', '話者'], kind: ['类型', 'Kind', '種類'], id: ['标识', 'ID', 'ID'], text: ['正文', 'Text', '本文'],
  textLocale: ['正文语言', 'Text language', '本文の言語'], keepName: ['保留姓名', 'Keep name', '名前を保持'], append: ['续接文本', 'Append text', '本文を続ける'],
  target: ['目标', 'Target', '対象'], voice: ['配音', 'Voice', '音声'], voiceByLocale: ['多语言配音', 'Voices by language', '言語別音声'],
  voiceVolume: ['配音音量', 'Voice volume', '音声音量'], fontSize: ['字号', 'Font size', '文字サイズ'], avatar: ['头像', 'Avatar', 'アバター'],
  op: ['操作', 'Operation', '操作'], assetId: ['素材', 'Asset', '素材'], fit: ['适配方式', 'Fit', '表示方法'],
  positionX: ['水平位置', 'Horizontal position', '水平位置'], positionY: ['垂直位置', 'Vertical position', '垂直位置'],
  transition: ['转场', 'Transition', 'トランジション'], volume: ['音量', 'Volume', '音量'], loop: ['循环', 'Loop', 'ループ'],
  durationMs: ['时长（毫秒）', 'Duration (ms)', '時間（ミリ秒）'], sceneId: ['场景', 'Scene', 'シーン'],
  labelId: ['标签', 'Label', 'ラベル'], when: ['执行条件', 'Condition', '実行条件'], note: ['备注', 'Note', 'メモ'],
  continue: ['继续执行', 'Continue', '続行'], skippable: ['允许跳过', 'Skippable', 'スキップ可能'],

  channel:['声音通道','Audio channel','音声チャンネル'],blend:['混合模式','Blend mode','合成モード'],imageMouth:['图片口型','Image mouth shapes','画像の口形'],closed:['闭嘴图片','Closed mouth image','閉じた口の画像'],half:['半张嘴图片','Half-open mouth image','半開きの口の画像'],open:['张嘴图片','Open mouth image','開いた口の画像'],imageBlink:['图片眨眼','Image blinking','画像のまばたき'],

  effects:['视觉效果','Visual effects','表示効果'], x:['水平位移','Horizontal offset','水平移動'], y:['垂直位移','Vertical offset','垂直移動'],
  scaleX:['水平缩放','Horizontal scale','横倍率'], scaleY:['垂直缩放','Vertical scale','縦倍率'], rotationDeg:['旋转角度','Rotation (degrees)','回転角度'],
  opacity:['不透明度','Opacity','不透明度'], blur:['模糊强度','Blur','ぼかし'], rgb:['颜色叠加','Tint color','色調'],
  brightness:['亮度','Brightness','明るさ'], contrast:['对比度','Contrast','コントラスト'], saturation:['饱和度','Saturation','彩度'], gamma:['伽马','Gamma','ガンマ'],
  bloom:['泛光','Bloom','ブルーム'], bevel:['倒角','Bevel','ベベル'], intensity:['强度','Intensity','強さ'], threshold:['阈值','Threshold','しきい値'],
  color:['颜色','Color','色'], thickness:['厚度','Thickness','厚さ'], softness:['软化','Softness','柔らかさ'], filters:['滤镜','Filters','フィルター'],
  oldFilm:['老电影','Old film','古い映画'], dot:['点状','Halftone','網点'], reflection:['反射','Reflection','反射'], glitch:['故障','Glitch','グリッチ'], rgbSplit:['色差','RGB split','色ずれ'], godray:['光辉','God rays','光線'],
  station:['舞台位置','Stage position','ステージ位置'], z:['叠放顺序','Layer order','重なり順'], reset:['重置效果','Reset effects','効果をリセット'],
  enter:['入场动画','Enter animation','登場アニメーション'], exit:['退场动画','Exit animation','退場アニメーション'], preset:['动画预设','Animation preset','プリセット'],
  easing:['缓动','Easing','イージング'], family:['曲线类型','Curve','曲線'], direction:['方向','Direction','方向'], directionDeg:['方向角度','Direction (degrees)','方向角度'],
  resourceId:['动画素材','Animation asset','アニメーション素材'], galleryId:['鉴赏条目','Gallery entry','鑑賞項目'], presetId:['演出预设','Presentation preset','演出プリセット'],
  startSec:['起播时间','Start time','開始時間'], loopStartSec:['循环开始','Loop start','ループ開始'], loopEndSec:['循环结束','Loop end','ループ終了'],
  fadeInMs:['淡入时间','Fade-in duration','フェードイン時間'], fadeOutMs:['淡出时间','Fade-out duration','フェードアウト時間'], skipFadeMs:['跳过淡出时间','Skip fade duration','スキップ時のフェード時間'],
  completeDefaults:['补全默认值','Complete defaults','既定値を補完'], cross:['跨语句播放','Play across statements','文を跨いで再生'], parallel:['并行播放','Play in parallel','並列再生'],
  segments:['动画分段','Animation segments','アニメーション区間'], segment:['分段','Segment','区間'], inherit:['继承当前效果','Inherit current effects','現在の効果を継承'], repeat:['重复次数','Repeat count','繰り返し回数'],
  keepFinal:['保留结束状态','Keep final state','終了状態を保持'], writeDefault:['写入默认状态','Set default state','既定状態に保存'], ignoreDefault:['忽略默认状态','Ignore defaults','既定状態を無視'],
  enabled:['启用条件','Enabled condition','有効条件'], visible:['显示条件','Visibility condition','表示条件'], lockedReason:['不可选原因','Unavailable reason','選択できない理由'],
  model:['模型与口型','Model and lip sync','モデルと口パク'], framing:['立绘取景','Character framing','立ち絵の構図'], scale:['缩放倍率','Scale','倍率'], offsetX:['水平偏移','Horizontal offset','水平移動'], offsetY:['垂直偏移','Vertical offset','垂直移動'], crop:['裁剪区域','Crop region','切り抜き領域'],
  width:['宽度','Width','幅'], height:['高度','Height','高さ'], mode:['模式','Mode','モード'], name:['名称','Name','名前'], parameters:['自定义参数','Custom parameters','カスタムパラメーター'],
  motion:['动作','Motion','モーション'], expression:['表情','Expression','表情'], group:['动作组','Motion group','モーショングループ'], index:['序号','Index','番号'],
  blink:['自动眨眼','Auto blink','自動まばたき'], breath:['呼吸','Breathing','呼吸'], physics:['物理效果','Physics','物理演算'], autoMotion:['自动动作','Auto motion','自動モーション'],
  gaze:['视线','Gaze','視線'], follow:['跟随方式','Follow mode','追従方法'], smooth:['平滑跟随','Smooth follow','滑らかな追従'], lip:['口型同步','Lip sync','口パク同期'], gain:['增益','Gain','ゲイン'],
  imageFaceCombinations:['图片表情组合','Image face combinations','画像の表情組合せ'], intervalMs:['间隔','Interval','間隔'], randomMs:['随机间隔','Random interval','ランダム間隔'], closeMs:['闭合时间','Close duration','閉じる時間'], holdMs:['保持时间','Hold duration','保持時間'], openMs:['打开时间','Open duration','開く時間'],
  closedOpen:['闭嘴睁眼','Mouth closed, eyes open','口閉・目開'], halfOpen:['半张嘴睁眼','Mouth half open, eyes open','口半開・目開'], openOpen:['张嘴睁眼','Mouth open, eyes open','口開・目開'], closedClosed:['闭嘴闭眼','Mouth closed, eyes closed','口閉・目閉'], halfClosed:['半张嘴闭眼','Mouth half open, eyes closed','口半開・目閉'], openClosed:['张嘴闭眼','Mouth open, eyes closed','口開・目閉'],
  all:['全部音效','All sounds','すべての効果音'], type:['效果类型','Effect type','効果の種類'], density:['密度','Density','密度'], speed:['速度','Speed','速度'], scope:['作用范围','Scope','範囲'],
  paragraphs:['段落','Paragraphs','段落'], paragraph:['段落正文','Paragraph text','段落の本文'], backgroundColor:['背景颜色','Background color','背景色'], backgroundImage:['背景图片','Background image','背景画像'], textColor:['文字颜色','Text color','文字色'], animation:['文字动画','Text animation','文字アニメーション'], manual:['点击继续','Click to continue','クリックで続行'], top:['顶部遮幅比例','Top bar ratio','上の帯の比率'], bottom:['底部遮幅比例','Bottom bar ratio','下の帯の比率'],
  receiver:['返回值接收','Return value','戻り値'], variableId:['变量','Variable','変数'], variableIds:['变量列表','Variables','変数一覧'], value:['值或表达式','Value or expression','値・式'], entryId:['鉴赏条目','Gallery entry','鑑賞項目'],
  prompt:['输入提示','Input prompt','入力メッセージ'], defaultText:['默认文字','Default text','既定テキスト'], allowEmpty:['允许留空','Allow empty input','空欄を許可'], maxLength:['最多字符数','Maximum characters','最大文字数'], pattern:['格式规则','Pattern','入力形式'], validation:['校验表达式','Validation expression','検証式'], errorText:['校验失败提示','Validation message','検証エラーの説明'], cancelTarget:['取消后跳转','Cancel destination','キャンセル時の移動先'],
  achievement:['成就名称','Achievement name','実績名'], unavailable:['不可用时处理','When unavailable','利用不可時の処理'], endingId:['结局标识','Ending identifier','エンディング識別子'], pageId:['页面','Page','ページ'], option:['选项','Choice','選択肢']
};
export function extendedFieldLabel(spec: FieldSpec, locale: string, command?: string): string {
  const index = locale === 'en' ? 1 : locale === 'ja' ? 2 : 0;
  if (command === 'setComplexAnimation' && spec.path === 'animation') return ['动画内容', 'Animation content', 'アニメーション内容'][index]!;
  if (command === 'characterDifference' && spec.path === 'differenceId') return ['角色共同差分', 'Shared character difference', 'キャラクター共通差分'][index]!;
  if (command === 'return' && spec.path === 'value') return ['返回值（可选）', 'Return value (optional)', '戻り値（任意）'][index]!;
  if (command === 'end' && (spec.path === 'target' || spec.path === 'kind')) return ['结束后前往', 'Destination after ending', '終了後の移動先'][index]!;
  return names[spec.path]?.[index] ?? spec.label;
}
export function fieldHint(spec: FieldSpec, label: string, locale: string, command?: string) {
  const index = locale === 'en' ? 1 : locale === 'ja' ? 2 : 0;
  if (command === 'playEffect' && spec.path === 'soundId') return ['声音对象与素材分别标识。停止只影响所选对象，BGM 和其他声音继续。', 'Sound instances and assets have separate IDs. Stopping one keeps BGM and other sounds.', '音声インスタンスと素材は別のIDです。選んだ音声だけ停止し、BGMとほかの音声は続きます。'][index]!;
  if (command === 'playEffect' && spec.path === 'all') return ['明确开启时停止全部效果声音；BGM 沿自己的操作控制。', 'Enable explicitly to stop all effect sounds. BGM has separate controls.', '有効にするとすべての効果音を停止します。BGMは個別に操作します。'][index]!;
  if (command === 'pixi' && spec.path === 'type') return ['天气粒子使用纹理形状和独立运动；画面滤镜处理舞台画面。', 'Weather particles combine textures and motion. Filters process the stage image.', '天候はテクスチャと動きを組み合わせます。フィルターは舞台の映像に適用します。'][index]!;
  if (command === 'pixi' && spec.path === 'target') return ['整台只影响舞台画面；文字和系统界面保持。指定对象只影响该实例。', 'Stage scope affects the stage image; text and system UI remain. Object scope affects only that instance.', '舞台全体は映像に適用し、本文とシステムUIは保持します。オブジェクトはそのインスタンスだけに適用します。'][index]!;
  if (command === 'return' && spec.path === 'value') return [
    '需要返回结果时填写与接收变量匹配的值；返回调用处后继续调用后的语句。仅用于被“调用场景”调用的场景。',
    'If a result is needed, supply a value matching the receiver variable. Continue after the call. Use only in a scene entered with Call scene.',
    '結果を返す場合は受け取り変数と一致する値を入力します。呼び出しの次の文から続行します。「シーン呼び出し」で呼ばれたシーンで使います。',
  ][index]!;
  if (command === 'end' && (spec.path === 'target' || spec.path === 'kind')) return [
    '终止当前剧情流程并前往所选目标；“返回标题”回到标题页（主菜单），场景目标开始新的剧情流程。',
    'End the current story flow and go to the selected destination. Return to title opens the title screen (main menu); a scene starts a new story flow.',
    '現在の物語の進行を終了し、選択した移動先へ進みます。「タイトルに戻る」はタイトル画面（メインメニュー）を開き、シーンは新しい物語の進行として開始します。',
  ][index]!;
  const meanings: Record<string,[string,string,string]> = {
    x:['向右为正、向左为负（像素）；默认 0','Positive moves right, negative left (pixels); default 0','正は右、負は左（px）。既定値 0'],
    y:['向下为正、向上为负（像素）；默认 0','Positive moves down, negative up (pixels); default 0','正は下、負は上（px）。既定値 0'],
    scaleX:['水平缩放倍率；1 保持原宽，负值水平翻转','Horizontal scale; 1 keeps width, negative flips horizontally','横方向の倍率。1 は元の幅、負数で左右反転'],
    scaleY:['垂直缩放倍率；1 保持原高，负值垂直翻转','Vertical scale; 1 keeps height, negative flips vertically','縦方向の倍率。1 は元の高さ、負数で上下反転'],
    speed:['天气速度百分比；100 对应雨约850、雪60、樱花65像素/秒，横向还叠加摆动。','Weather speed percentage: 100 is about 850 px/s for rain, 60 for snow and 65 for petals, plus horizontal sway.','速度100で雨約850・雪60・桜65 px/秒。横揺れも加わります。'],
    positionX:['取景位置：0 靠左、0.5 居中、1 靠右','Framing: 0 left, 0.5 center, 1 right','構図：0 左、0.5 中央、1 右'],
    positionY:['取景位置：0 靠上、0.5 居中、1 靠下','Framing: 0 top, 0.5 center, 1 bottom','構図：0 上、0.5 中央、1 下'],
    brightness:['亮度倍率；1 保持原样','Brightness multiplier; 1 keeps the original','明るさの倍率。1 で元のまま'],contrast:['对比度倍率；1 保持原样','Contrast multiplier; 1 keeps the original','コントラストの倍率。1 で元のまま'],saturation:['饱和度倍率；0 为灰度，1 保持原样','Saturation: 0 grayscale, 1 original','彩度：0 はグレー、1 は元のまま'],gamma:['中间调亮度；1 保持原样','Midtone brightness; 1 keeps the original','中間調の明るさ。1 で元のまま'],
    volume:['播放音量百分比；0 静音，100 原始音量','Volume percentage: 0 muted, 100 original','音量％：0 ミュート、100 元の音量'],
    effects:['仅修改填写的效果；未填项沿用当前状态，勾选重置后从默认值开始','Only supplied effects change; omitted fields keep the current state. Reset starts from defaults','入力した効果だけ変更。空欄は現在値を継承。リセットで既定値から開始'],
    bloom:['强度大于 0 时显示泛光','Bloom appears when intensity is above 0','強さが 0 より大きい場合にブルームを表示'],bevel:['不透明度与厚度都大于 0 时显示倒角','Bevel needs both opacity and thickness above 0','不透明度と厚さが共に 0 より大きい場合に表示'],
    keepFinal:['动画结束后保留终点；关闭则回到动画前状态','Keep the end state; off returns to the pre-animation state','終了状態を保持。オフでは開始前に戻る'],writeDefault:['将结束状态作为后续演出的默认状态','Use the end state as the default for later animations','終了状態を後続の演出の既定値にする']
  };
  const meaning=meanings[spec.path]?.[locale==='en'?1:locale==='ja'?2:0];
  return meaning ?? formHint(locale, label, spec.type, { ...spec, unit: (spec.unit && spec.unit !== 'none' ? spec.unit : /Ms$/.test(spec.path) ? 'ms' : /Sec$/.test(spec.path) ? 's' : undefined) });
}
export function initialFieldValue(spec: FieldSpec): unknown {
  if (spec.path === 'id' && spec.refKind === 'statement') return createId();
  if (spec.type === 'object') return Object.fromEntries((spec.children ?? []).filter(c => c.required || c.default != null).map(c => [c.path, initialFieldValue(c)]));
  return spec.default;
}

export function ownsIdentity(command:string, path:string, args:Record<string,unknown>) {
 return ['setAnimation','setComplexAnimation'].includes(command)&&path==='animationId'||command==='label'&&path==='labelId'||command==='pixi'&&path==='effectId'||['changeBg','changeFigure','changeIllustration'].includes(command)&&path==='objectId'&&(args.op??'show')==='show'||command==='playEffect'&&path==='soundId'&&(args.op??'play')!=='stop';
}
const enumNames:Record<string,[string,string,string]> = {
 gridFlip:['网格翻转','Grid flip','グリッド反転'],diagonalReveal:['斜向揭示','Diagonal reveal','斜め表示'],
 stage:['整台镜头','Stage camera','舞台カメラ'],front:['前景','Foreground','前景'],
 loop:['循环播放','Loop','ループ再生'],once:['单次播放','Play once','一度再生'],petals:['花瓣','Petals','花びら'],sakura:['樱花','Cherry blossoms','桜'],
 replace:['替换','Replace','置き換え'],exit:['退场','Exit','退場'],full:['全身','Full body','全身'],upper:['上半身','Upper body','上半身'],
 left:['左侧','Left','左'],right:['右侧','Right','右'],center:['居中','Center','中央'],leftQuarter:['左四分之一','Left quarter','左1/4'],leftThird:['左三分之一','Left third','左1/3'],rightQuarter:['右四分之一','Right quarter','右1/4'],rightThird:['右三分之一','Right third','右1/3'],
 show:['显示','Show','表示'],hide:['隐藏','Hide','非表示'],play:['播放','Play','再生'],stop:['停止','Stop','停止'],set:['设置','Set','設定'],reset:['重置','Reset','リセット'],clear:['清除','Clear','解除'],
 normal:['正常','Normal','通常'],multiply:['正片叠底','Multiply','乗算'],screen:['滤色','Screen','スクリーン'],overlay:['叠加','Overlay','オーバーレイ'],darken:['变暗','Darken','比較（暗）'],lighten:['变亮','Lighten','比較（明）'],add:['叠加增亮','Add','加算'],
  cut:['直接切换','Cut','即時'],fade:['淡入淡出','Fade','フェード'],dissolve:['溶解','Dissolve','ディゾルブ'],slide:['滑动','Slide','スライド'],wipe:['擦除','Wipe','ワイプ'],blinds:['百叶窗','Blinds','ブラインド'],custom:['自定义','Custom','カスタム'],
 linear:['线性','Linear','線形'],sine:['正弦','Sine','サイン'],quad:['二次','Quadratic','2次'],cubic:['三次','Cubic','3次'],quart:['四次','Quartic','4次'],quint:['五次','Quintic','5次'],expo:['指数','Exponential','指数'],circ:['圆形','Circular','円形'],back:['回弹','Back','バック'],elastic:['弹性','Elastic','弾性'],bounce:['弹跳','Bounce','バウンス'],
 in:['渐入','Ease in','加速'],out:['渐出','Ease out','減速'],inOut:['渐入渐出','Ease in/out','加速・減速'],up:['向上','Up','上'],down:['向下','Down','下'],
 object:['舞台对象','Stage object','舞台オブジェクト'],station:['舞台位置','Stage position','舞台位置'],instance:['指定实例','Instance','インスタンス'],target:['指定目标','Target','対象'],all:['全部','All','すべて'],none:['不启用','None','なし'],pointer:['跟随指针','Follow pointer','ポインター追従'],fixed:['固定位置','Fixed position','固定位置'],off:['关闭','Off','オフ'],basic:['基础口型','Basic lip sync','基本口パク'],motionSync:['动作同步','Motion sync','モーション同期'],
 typewriter:['逐字显示','Typewriter','タイプライター'],pixel:['像素显现','Pixel','ピクセル'],reveal:['渐次显现','Reveal','リビール'],title:['标题页','Title','タイトル'],page:['页面','Page','ページ'],scene:['场景','Scene','シーン'],narrator:['旁白','Narrator','ナレーション'],character:['角色','Character','キャラクター'],
 cover:['填满并裁剪','Cover','覆う'],contain:['完整显示','Contain','全体表示'],native:['原始大小','Original size','原寸'],rain:['雨','Rain','雨'],snow:['雪','Snow','雪'],fog:['雾','Fog','霧']
};
export function enumLabel(value:string,locale:string,command?:string){
  if(command==='pixi') {
    const types:Record<string,[string,string,string]>={cherryBlossoms:['天气粒子 · 樱花','Weather · Cherry blossoms','天候・桜'],petals:['天气粒子 · 花瓣','Weather · Petals','天候・花びら'],rain:['天气粒子 · 雨','Weather · Rain','天候・雨'],snow:['天气粒子 · 雪','Weather · Snow','天候・雪'],oldFilm:['画面滤镜 · 老电影','Filter · Old film','フィルター・古い映画'],dot:['画面滤镜 · 网点','Filter · Halftone','フィルター・網点'],reflection:['画面滤镜 · 反射','Filter · Reflection','フィルター・反射'],glitch:['画面滤镜 · 故障','Filter · Glitch','フィルター・グリッチ'],rgbSplit:['画面滤镜 · 色差','Filter · RGB split','フィルター・色ずれ'],godray:['画面滤镜 · 光辉','Filter · God rays','フィルター・光線']};
    if(types[value])return types[value]![locale==='en'?1:locale==='ja'?2:0];
    if(value==='stage')return locale==='en'?'Whole stage':locale==='ja'?'舞台全体':'整台画面';
  }
  if(value==='back' && command==='pixi')return locale==='en'?'Background layer':locale==='ja'?'背景レイヤー':'后景';
  if(value==='adv')return locale==='en'?'ADV · dialogue box':locale==='ja'?'ADV・会話ウィンドウ':'ADV · 对话框';
  if(value==='nvl')return locale==='en'?'NVL · cumulative reading':locale==='ja'?'NVL・累積表示':'NVL · 全屏累积阅读';
  if(command==='say' && ['auto','image','hidden'].includes(value))return ({auto:['自动来源','Automatic source','自動選択'],image:['指定图片','Selected image','画像を指定'],hidden:['明确隐藏','Hide portrait','非表示']} as Record<string,string[]>)[value]![locale==='en'?1:locale==='ja'?2:0]!;
  if(command==='miniAvatar' && value==='clear')return locale==='en'?'Hide portrait':locale==='ja'?'アバターを非表示':'明确隐藏头像';
  if(command==='miniAvatar' && value==='auto')return locale==='en'?'Automatic source':locale==='ja'?'自動選択':'使用自动来源';
  const index=locale==='en'?1:locale==='ja'?2:0;
  if(command==='end'&&value==='title')return ['返回标题','Return to title','タイトルに戻る'][index]!;
  return enumNames[value]?.[index]??value;
}
