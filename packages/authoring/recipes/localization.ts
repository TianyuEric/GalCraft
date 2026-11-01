import { displayMessage } from '@galcraft/plugins/contracts';
import type { CreationRecipe } from './schema.js';

/** Library display metadata only; executable prompts, examples and defaults retain their source. */
export const OfficialRecipeMessages: Record<string, readonly [string, string, string, string]> = {
  '剧情脚本': ['Story script', 'Write a scene DSL draft from the scene requirements', 'シナリオ', 'シーンの要望から DSL の下書きを作成'],
  '背景提示': ['Background prompt', 'Prepare composition text for a background workflow', '背景プロンプト', '背景用ワークフローの構図を準備'],
  '立绘提示': ['Character art prompt', 'Prepare character appearance text', '立ち絵プロンプト', 'キャラクターの外見を準備'],
  'CG 提示': ['CG prompt', 'Prepare a narrative illustration prompt', 'CG プロンプト', '物語の挿絵のプロンプトを準備'],
  '差分指令': ['Variation instruction', 'Describe changes and preserved details relative to the original', '差分の指示', '元画像から変更する部分と保持する部分を指定'],
  '语音朗读': ['Speech text', 'Prepare spoken text for the current line', '読み上げテキスト', '現在の台詞の読み上げテキストを準備'],
  '音乐提示': ['Music prompt', 'Prepare a background music style prompt', '音楽プロンプト', 'BGM のスタイルを準備'],
  'UI 位图提示': ['UI bitmap prompt', 'Prepare image text for page artwork', 'UI 画像プロンプト', 'ページ素材の画像プロンプトを準備'],
  '页面计划': ['Page plan', 'Plan supported page editing steps', 'ページの計画', '対応するページ編集の手順を計画'],
  '页面修改': ['Page edit', 'Propose local edits to public page properties', 'ページの編集', '公開されたページ属性の部分編集を提案'],
  'SVG 图形': ['SVG artwork', 'Create supported static SVG artwork', 'SVG 図形', '対応する静的 SVG 図形を作成'],
  '剧情演出': ['Story staging', 'Stage the selected story with existing assets', 'シナリオ演出', '既存の素材で選択したシナリオを演出'],
  '直接图像': ['Direct image', 'Generate backgrounds, character art, CG or UI bitmaps from positive and negative prompts. Choose text preparation separately.', '画像を直接生成', 'プロンプトと除外プロンプトから背景、立ち絵、CG、UI 画像を生成します。テキスト準備は別途選択します。'],
  '直接差分': ['Direct variation', 'Provide a base image and requested changes to create a variation while keeping the original.', '差分を直接生成', '元画像と変更の要望を使って差分を生成し、元画像を保持します。'],
  '逐句配音': ['Line by line speech', 'Read selected dialogue or manual text without a text model by default. Voice parameters come from the actual connection.', '台詞ごとの音声', '選択した台詞または入力テキストを読み上げます。標準ではテキストモデルを使いません。声の設定は実際の接続に従います。'],
  '直接音乐': ['Direct music', 'Send a description, duration and instrumental setting to the configured music service.', '音楽を直接生成', '設定した音楽サービスに説明、長さ、インスト設定を送信します。'],
  'NovelAI V5 · 背景': ['NovelAI V5 · Background', 'Prepare editable base, negative and per-character prompts without calling the image service.', 'NovelAI V5・背景', '画像サービスを呼ばず、基本・除外・キャラクター別プロンプトを準備します。'],
  'NovelAI V5 · 透明立绘': ['NovelAI V5 · Transparent character art', 'Prepare editable base, negative and per-character prompts without calling the image service.', 'NovelAI V5・透過立ち絵', '画像サービスを呼ばず、基本・除外・キャラクター別プロンプトを準備します。'],
  'NovelAI V5 · 多人 CG': ['NovelAI V5 · Multiple character CG', 'Prepare editable base, negative and per-character prompts without calling the image service.', 'NovelAI V5・複数キャラクターの CG', '画像サービスを呼ばず、基本・除外・キャラクター別プロンプトを準備します。'],
  'NovelAI V5 · Q版立绘': ['NovelAI V5 · Chibi character art', 'Prepare editable base, negative and per-character prompts without calling the image service.', 'NovelAI V5・ちびキャラ立ち絵', '画像サービスを呼ばず、基本・除外・キャラクター別プロンプトを準備します。'],
  'NovelAI V5 · UI 图形': ['NovelAI V5 · UI artwork', 'Prepare editable base, negative and per-character prompts without calling the image service.', 'NovelAI V5・UI 図形', '画像サービスを呼ばず、基本・除外・キャラクター別プロンプトを準備します。'],
  'NovelAI 结构化提示': ['NovelAI structured prompt', 'Prepare structured NovelAI prompts', 'NovelAI 構造化プロンプト', 'NovelAI の構造化プロンプトを準備'],
};
const parameterMessages: Record<string, readonly [string, string]> = {
  '宽度（px）': ['Width (px)', '幅（px）'], '高度（px）': ['Height (px)', '高さ（px）'],
  '候选数量': ['Candidate count', '候補数'], '语速（倍）': ['Speed (multiplier)', '話速（倍率）'], '时长（秒）': ['Duration (seconds)', '長さ（秒）'],
};
export function localizeRecipe(recipe: CreationRecipe, locale: string): CreationRecipe {
  if (recipe.scope !== 'official') return recipe;
  const snapshot = recipe.operationSnapshot;
  const preset = snapshot?.definition.presets?.find(value => value.id === recipe.id);
  const result = structuredClone(recipe);
  if (snapshot && preset) {
    result.name = displayMessage(snapshot.messages, locale, preset.nameKey, recipe.name);
    result.description = displayMessage(snapshot.messages, locale, preset.descriptionKey, recipe.description);
  } else if (locale === 'en' || locale === 'ja') {
    const texts = OfficialRecipeMessages[recipe.name];
    if (texts) { result.name = texts[locale === 'en' ? 0 : 2]; result.description = texts[locale === 'en' ? 1 : 3]; }
    for (const parameter of [...result.parameters, ...result.production?.parameters ?? []]) {
      parameter.label = parameterMessages[parameter.label]?.[locale === 'en' ? 0 : 1] ?? parameter.label;
    }
  }
  return result;
}
