/** Author-facing hints shared by React and DOM forms. Labels stay visible when a value is entered. */
export function formHint(locale: string, label: string, type = 'text', options: { unit?: string | null; default?: unknown; min?: number; max?: number } = {}): string {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const explanations: [RegExp, string, string, string][] = [
    [/水平位置|Horizontal position|横位置|垂直位置|Vertical position|縦位置/i,'元素在画布内的位置；像素或百分比以标签为准','Position within the canvas; see the label for pixels or percent','キャンバス内の位置。単位はラベルの px または％'],
    [/字号|Font size|文字サイズ/i,'文字大小（单位为像素）','Text size in pixels','文字の大きさ（ピクセル）'],
    [/圆角|Radius|角丸/i,'边角半径（单位为像素）；0 为直角','Corner radius in pixels; 0 is square','角の半径（px）。0 で直角'],
    [/行高|Line height|行間/i,'行高倍率，例如 1.5 表示字号的 1.5 倍','Line-height multiplier, e.g. 1.5 times the font size','行高の倍率（例：文字サイズの 1.5 倍）'],
    [/工作流名称|Workflow name|ワークフロー名/i,'给工作流取一个易识别的名称，例如背景生成','A recognizable name, e.g. Background generation','用途が分かる名前（例：背景生成）'],
    [/场景名|Scene name|シーン名/i,'例如：候车室 · 读信；改名不改变引用','For example: Waiting room · The letter; renaming preserves references','例：待合室・手紙。名前変更で参照は変わりません'],
    [/作品名|Project name|作品名/i,'显示在作品列表与游戏标题中的名称','Name shown in the project list and game title','作品一覧とゲームタイトルに表示する名前'],
    [/本机包路径|Local package path|パッケージ.*パス/i,'本机插件包文件或目录的绝对路径','Absolute path to a local plugin package or folder','ローカルのプラグインパッケージ・フォルダーの絶対パス'],
    [/新.*场景.*ID|New scene ID/i,'选择本次发行的目标场景标识','Target scene identifier in this release','今回の公開で使用する移動先のシーン ID'],
    [/新.*语句.*ID|New statement ID/i,'目标场景内的语句标识','Statement identifier within the target scene','移動先シーン内の文 ID'],
    [/语速|Speech speed|話速/i,'语速倍率；1 为正常速度','Speech speed multiplier; 1 is normal','話速の倍率。1 は通常速度'],
    [/情绪|Emotion|感情/i,'描述语气，例如平静、惊讶或低声','Tone such as calm, surprised or whispered','口調の指定（例：穏やか・驚き・ささやき）'],
    [/歌词|Lyrics|歌詞/i,'填写需要演唱的歌词；纯音乐时留空','Lyrics to sing; leave blank for instrumental music','歌う歌詞。インストゥルメンタルでは空欄'],
    [/对白|正文|Speech text|Spoken text|Dialogue|朗读文本|台詞|音声テキスト|読み上げ本文/i,'输入要显示或朗读的正文','Text to display or speak','表示または読み上げる本文'],
    [/语言|Language|言語/i,'语言代码，例如 zh-CN、en 或 ja','Language code, e.g. zh-CN, en or ja','言語コード（例：zh-CN、en、ja）'],
    [/排除端口|Omitted ports|除外.*ポート/i,'用英文逗号分隔本次不发送的端口名','Comma-separated names of ports excluded from this request','今回送信しないポート名をカンマで区切る'],
    [/^(宽度|画布宽度|Width|Canvas width|幅|キャンバス幅)$/i,'画布或图像宽度（单位为像素）','Canvas or image width (pixels)','キャンバス・画像の幅（ピクセル）'],
    [/^(高度|画布高度|Height|Canvas height|高さ|キャンバス高さ)$/i,'画布或图像高度（单位为像素）','Canvas or image height (pixels)','キャンバス・画像の高さ（ピクセル）'],
    [/输出目录|Output directory|出力ディレクトリ/i,'发行文件保存到此本机目录','Local folder for the exported release','公開ファイルを保存するローカルフォルダー'],
    [/旧发行版本|Old release|旧配布バージョン/i,'从旧发行记录复制版本号，例如 1.1.0','Copy the previous release version, e.g. 1.1.0','旧配布の記録からバージョンをコピー（例：1.1.0）'],
    [/候选源码|Candidate source|候補ソース/i,'编辑生成内容，检查后采用到作品','Edit the generated content before adopting it into the project','生成内容を編集・確認してから作品へ採用'],
    [/发行版本|Release version|公開バージョン|配布バージョン/i,'例如 1.2.0，填写本次发行的版本号','Release version, for example 1.2.0','今回の公開バージョン（例：1.2.0）'],
    [/服务地址|Base URL|Service URL|接続先|サービス.*URL/i,'服务的 API 基础地址，例如 http://127.0.0.1:8188','API base address, e.g. http://127.0.0.1:8188','API のベース URL（例：http://127.0.0.1:8188）'],
    [/密钥|API key|シークレット|キー/i,'填写服务密钥；编辑已有连接时留空可保留','Service API key; leave blank to keep the existing key','API キー。既存の接続では空欄で現在のキーを保持'],
    [/模型|Model|モデル/i,'填写服务提供的模型名称或标识','Model name or identifier provided by the service','サービスで提供されるモデル名または ID'],
    [/正向提示词|Positive prompt|ポジティブ/i,'描述希望生成的主体、环境、构图和风格','Describe the subject, setting, composition and style','被写体・背景・構図・画風を記述'],
    [/负向提示词|Negative prompt|ネガティブ/i,'填写希望避免的内容，可留空','Describe elements to avoid; optional','避けたい要素を記述（任意）'],
    [/场景大纲|创作要求|Creative brief|Outline|Prompt \/ edit instruction|制作要件|あらすじ・制作の要望|プロンプト・変更の要望/i,'描述目标场景、人物、情节和期望结果','Describe the scene, characters, plot and desired result','シーン・人物・展開・希望する結果を記述'],
    [/声音.*ID|Voice ID|音声.*ID/i,'填写服务提供的声音标识','Voice identifier provided by the service','サービスが提供する音声 ID'],
    [/随机种子|Seed|シード/i,'整数种子；留空由服务随机选择','Integer seed; leave blank for a random result','整数のシード。空欄でランダム'],
    [/时长|Duration|時間|長さ/i,'填写持续时间','Enter the duration','継続時間を入力'],
    [/数量|Count|枚数/i,'一次生成的候选数量（正整数）','Number of candidates per run (positive integer)','一度に生成する候補数（正の整数）'],
    [/方案名|Recipe name|レシピ名/i,'为这套可复用的创作方式命名','Name this reusable creation recipe','再利用できる制作レシピの名前'],
    [/旧.*场景.*ID|Old scene ID/i,'从旧版记录复制场景标识','Copy the scene identifier from the previous release','旧版の記録からシーン ID をコピー'],
    [/旧.*语句.*ID|Old statement ID/i,'从旧版记录复制语句标识','Copy the statement identifier from the previous release','旧版の記録から文 ID をコピー'],
    [/原因|Reason|理由/i,'说明这次变更或入口映射的原因','Explain this change or entry mapping','変更または入口の対応を変更する理由'],
    [/透明度|Opacity|不透明度/i,'0 为完全透明，1 为完全显示','0 is transparent; 1 is fully visible','0 は透明、1 は不透明'],
  ];
  const explanation = explanations.find(([pattern])=>pattern.test(label));
  const unit = options.unit === 'ms' ? t('毫秒', 'milliseconds', 'ミリ秒') : options.unit === 's' ? t('秒', 'seconds', '秒') : options.unit === 'percent' ? '%' : options.unit === 'none' ? undefined : options.unit === 'px' ? t('像素','pixels','ピクセル') : options.unit === 'deg' ? t('度','degrees','度') : options.unit === 'ratio' ? t('倍率','ratio','倍率') : options.unit;
  const notes: string[] = [];
  if (unit) notes.push(t(`单位：${unit}`, `unit: ${unit}`, `単位：${unit}`));
  if (options.default !== undefined && options.default !== null && typeof options.default !== 'object') notes.push(t(`默认 ${options.default}`, `default ${options.default}`, `既定値 ${options.default}`));
  if (options.min !== undefined || options.max !== undefined) notes.push(`${options.min ?? '−∞'}–${options.max ?? '∞'}`);
  if (!label) label = type === 'number' ? t('数值', 'Number', '数値') : type === 'password' ? t('密钥（仅用于此连接）', 'API key for this connection', 'この接続の API キー') : t('内容', 'Text', '内容');
  return `${explanation ? explanation[locale==='en'?2:locale==='ja'?3:1] : t(`填写${label}`, `Enter ${label}`, `${label}を入力`)}${notes.length ? locale==='en' ? ` (${notes.join('; ')})` : `（${notes.join(locale==='ja'?'、':'，')}）` : ''}`;
}

export function completeFormHints(root: HTMLElement, locale: string) {
  for (const input of root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
    if (input.closest('.monaco-editor') || input.placeholder && input.placeholder !== input.dataset.gcHint || input.readOnly || input instanceof HTMLInputElement && ['checkbox', 'radio', 'range', 'file', 'color', 'button', 'hidden'].includes(input.type)) continue;
    const label = input.getAttribute('aria-label') ?? input.labels?.[0]?.querySelector('span')?.textContent ?? input.labels?.[0]?.textContent ?? input.closest('.gc-field')?.querySelector(':scope > span')?.textContent ?? '';
    input.placeholder = formHint(locale, label.trim(), input.type, input instanceof HTMLInputElement ? { min: input.min ? Number(input.min) : undefined, max: input.max ? Number(input.max) : undefined } : {});
    input.dataset.gcHint = input.placeholder;
  }
}

export function observeFormHints(root: HTMLElement) {
 const apply=()=>completeFormHints(root,root.lang||'zh-CN');
 const observer=new MutationObserver(apply); observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['lang']});apply();return()=>observer.disconnect();
}
