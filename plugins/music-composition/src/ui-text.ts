const messages = {
  '主体约 {body} 秒；成品约 {total} 秒': ['Body about {body} s; output about {total} s', '本体 約 {body} 秒；完成 約 {total} 秒'],
  '循环范围约 {seconds} 秒': ['Loop region about {seconds} s', 'ループ範囲 約 {seconds} 秒'],
  '含 {seconds} 秒尾音': ['Includes {seconds} s ending tail', '{seconds} 秒の余韻を含む'],
  '写谱风格（可选）': ['Writing style (optional)', '作風（任意）'],
  '自定义 · 按本次描述': ['Custom · follow this description', 'カスタム・今回の説明に従う'],
  '可编辑编曲工位': ['Editable composition workstation', '編集可能な作曲ワークステーション'],
  '可编辑编曲': ['Editable composition', '編集可能な作曲'],
  '制作草稿': ['Production draft', '制作下書き'], '作品作者源': ['Project composition source', '作品の作曲ソース'],
  '{tracks} 条音轨 · {seconds} 秒': ['{tracks} tracks · {seconds} s', '{tracks} トラック · {seconds} 秒'],
  '试听': ['Play', '試聴'], '暂停 / 继续': ['Pause / resume', '一時停止 / 再開'], '停止': ['Stop', '停止'],
  '撤销': ['Undo', '元に戻す'], '重做': ['Redo', 'やり直す'], '使用作品撤销 / 重做': ['Use project undo / redo', '作品の元に戻す / やり直すを使用'],
  '本地渲染连接': ['Local render connection', 'ローカルレンダリング接続'],
  '请选择已配置的采样渲染连接': ['Choose a configured sample render connection', '設定済みのサンプルレンダリング接続を選択'],
  '检查本地渲染输入': ['Review local render input', 'ローカルレンダリング入力を確認'], '提交本地渲染': ['Submit local render', 'ローカルレンダリングを実行'],
  '在制作中审阅': ['Review in Production', '制作で確認'],
  '当前作品作者源形成新的冻结任务；完成后在制作页审阅候选。': ['Freeze the current composition source in a new task. Review its candidate in Production when complete.', '現在の作曲ソースを新しいタスクに固定します。完了後、制作で候補を確認してください。'],
  '曲名': ['Title', '曲名'], '速度 BPM': ['Tempo BPM', 'テンポ BPM'], '每小节拍数': ['Beats per bar', '小節の拍数'],
  '拍号分母': ['Beat unit', '拍子の分母'], '时长 / 小节': ['Duration / bars', '長さ / 小節'], '循环 BGM': ['Loop BGM', 'BGM をループ'],
  '采样音色': ['Sample soundbank', 'サンプル音源'], '轻量': ['Compact', '軽量'], '自备': ['Imported', '持ち込み'],
  '审阅并切换音色': ['Review and switch soundbank', '音源の切り替えを確認'], '读取乐器目录': ['Read instrument catalog', '楽器一覧を読み込む'],
  '安装所选音色': ['Install selected soundbank', '選択した音源をインストール'],
  '已安装': ['Installed', 'インストール済み'], '尚未安装': ['Not installed', '未インストール'], '检查本机安装': ['Check local installation', 'ローカルの状態を確認'],
  '{count} 个实际预设': ['{count} actual presets', '{count} 個の実際のプリセット'], '尚未读取乐器目录': ['Instrument catalog has not been read', '楽器一覧は未読み込みです'],
  '切换将把整曲音色从 {from} 改为 {to}。保留乐器身份；新包缺少的乐器需在音轨属性中明确重映射，再重新试听、计划。': ['Switch the whole score from {from} to {to}. Instrument identities stay the same. Remap missing instruments in Track properties, then play and plan again.', '曲全体の音源を {from} から {to} に切り替えます。楽器の識別情報は保持します。新しい音源にない楽器をトラックの設定で再割り当てし、再試聴して計画してください。'],
  '导入自备 SF2 / SF3 音色': ['Import an SF2 / SF3 soundbank', 'SF2 / SF3 音源をインポート'], '选择音色文件': ['Choose soundbank file', '音源ファイルを選択'],
  '明确选择本机文件，填写来源与许可后再导入': ['Choose a local file and enter its source and license before importing.', 'ローカルファイルを選択し、配布元とライセンスを入力してインポートしてください。'],
  '音色名称': ['Soundbank name', '音源名'], '来源': ['Source', '配布元'], '许可和署名资料': ['License and attribution', 'ライセンスとクレジット'],
  '导入并读取实际目录': ['Import and read actual catalog', 'インポートして実際の一覧を読み込む'],
  '乐曲分段': ['Score sections', '曲のセクション'], '添加分段': ['Add section', 'セクションを追加'], '音轨列表': ['Track list', 'トラック一覧'],
  '音轨': ['Tracks', 'トラック'], '添加音轨': ['Add track', 'トラックを追加'], '乐器目录未就绪': ['Instrument catalog is not ready', '楽器一覧の準備ができていません'],
  '{count} 个音符': ['{count} notes', '{count} 個のノート'],
  '钢琴卷帘 · 双击添加，拖动移动，右侧调整长度；Esc 取消拖动': ['Piano roll · Double-click to add, drag to move, resize at the right edge; Esc cancels a drag.', 'ピアノロール · ダブルクリックで追加、ドラッグで移動、右端で長さを調整。Esc でドラッグを取り消します。'],
  '量化': ['Snap', 'スナップ'], '{track}音符编辑': ['Edit notes in {track}', '{track} のノート編集'],
  '{pitch} {position} 力度 {velocity}': ['{pitch} {position} velocity {velocity}', '{pitch} {position} ベロシティ {velocity}'],
  '播放位置': ['Playback position', '再生位置'], '{current} / {duration} 秒': ['{current} / {duration} s', '{current} / {duration} 秒'],
  '音轨与音符属性': ['Track and note properties', 'トラックとノートの設定'], '音轨属性': ['Track properties', 'トラックの設定'], '音轨名称': ['Track name', 'トラック名'],
  '乐器': ['Instrument', '楽器'], '需要定位': ['Needs remapping', '再割り当てが必要'], '鼓组': ['Drum kit', 'ドラムキット'],
  '音量': ['Volume', '音量'], '声像（64 居中）': ['Pan (64 = center)', 'パン（64 = 中央）'], '删除音轨': ['Delete track', 'トラックを削除'],
  '选中音符': ['Selected note', '選択中のノート'], '音高 MIDI': ['Pitch MIDI', '音高 MIDI'], '起点 tick': ['Start tick', '開始 tick'],
  '时值 tick': ['Duration ticks', '長さ tick'], '力度': ['Velocity', 'ベロシティ'], '删除音符': ['Delete note', 'ノートを削除'],
  '选择音符后调整音高、节奏与力度；方向键微调，Delete 删除，Esc 取消拖动。': ['Select a note to edit pitch, timing and velocity. Use arrow keys to adjust, Delete to remove, and Esc to cancel a drag.', 'ノートを選択して音高、タイミング、ベロシティを編集します。矢印キーで微調整、Delete で削除、Esc でドラッグを取り消します。'],
  '分段与循环范围': ['Section and loop ranges', 'セクションとループ範囲'], '分段名称': ['Section name', 'セクション名'],
  '分段起点 tick': ['Section start tick', 'セクション開始 tick'], '分段终点 tick': ['Section end tick', 'セクション終了 tick'],
  '循环起点 tick': ['Loop start tick', 'ループ開始 tick'], '循环终点 tick': ['Loop end tick', 'ループ終了 tick'],
  '表现控制与渲染 · {count} 个控制事件': ['Expression and rendering · {count} control events', '表現とレンダリング · {count} 個のコントロールイベント'],
  '控制': ['Controller', 'コントローラー'], '数值': ['Value', '値'], '添加控制': ['Add control event', 'コントロールを追加'], '移除': ['Remove', '削除'],
  '调制': ['Modulation', 'モジュレーション'], '呼吸 / 连续力度': ['Breath / continuous dynamics', 'ブレス / 連続ダイナミクス'],
  '声像': ['Pan', 'パン'], '表情': ['Expression', 'エクスプレッション'], '延音踏板': ['Sustain pedal', 'サステインペダル'], '混响量': ['Reverb send', 'リバーブ量'], '合唱量': ['Chorus send', 'コーラス量'],
  '渲染增益': ['Render gain', 'レンダリングゲイン'], '尾音 / 秒': ['Tail / seconds', '余韻 / 秒'], '混响': ['Reverb', 'リバーブ'], '合唱': ['Chorus', 'コーラス'],
  '循环尾音': ['Loop tail', 'ループの余韻'], '回卷至循环起点': ['Wrap to loop start', 'ループ先頭に折り返す'], '结束截断': ['Cut at loop end', 'ループ終端で切る'],
  '由描述写谱 · 使用已有大模型连接': ['Compose from a description · Use an existing LLM connection', '説明から作曲 · 既存の LLM 接続を使用'],
  '先审阅实际提示与连接，再明确发送一次请求。结果保留原文，校验通过后由你采用为新草稿；渲染另行计划。': ['Review the actual prompt and connection, then send one explicit request. The original result is retained. Validate and adopt it as a new draft, then plan rendering separately.', '実際のプロンプトと接続を確認してから、明示的に一度だけリクエストを送信します。結果の原文を保持し、検証後に新しい下書きとして採用します。レンダリングは別途計画してください。'],
  '提示预设': ['Prompt preset', 'プロンプトプリセット'], '宁静叙事': ['Quiet narrative', '静かな物語'], '情绪推进': ['Emotional progression', '感情の展開'], '轻快日常': ['Light everyday life', '軽快な日常'],
  '大模型连接': ['LLM connection', 'LLM 接続'], '请选择已有文字连接': ['Choose an existing text connection', '既存のテキスト接続を選択してください'],
  '刷新连接': ['Refresh connections', '接続を更新'], '场景、情绪与风格': ['Scene, mood and style', '場面、雰囲気、スタイル'],
  '检查实际输入': ['Review actual input', '実際の入力を確認'], '发送一次写谱请求': ['Send one composition request', '作曲リクエストを一度送信'],
  '读取写谱结果': ['Read composition result', '作曲結果を読み込む'], '取消写谱任务': ['Cancel composition task', '作曲タスクをキャンセル'],
  '实际发送提示与任务身份': ['Actual prompt and task identity', '実際のプロンプトとタスク識別情報'],
  '检查实际输入后在此审阅完整 system 与用户文本。': ['Review the complete system and user text here after checking the actual input.', '実際の入力を確認した後、完全な system とユーザーテキストをここで確認できます。'],
  '任务': ['Task', 'タスク'], '尚未发送': ['Not sent', '未送信'], '写谱原文 / 手动修正': ['Original composition result / manual correction', '作曲結果の原文 / 手動修正'],
  '校验并采用乐谱': ['Validate and adopt score', '検証して楽譜を採用'], '乐谱 JSON 与精确音色资料': ['Score JSON and exact soundbank details', '楽譜 JSON と正確な音源情報'],
  '乐谱 JSON': ['Score JSON', '楽譜 JSON'], '校验并应用 JSON': ['Validate and apply JSON', '検証して JSON を適用'],
  '草稿已保存；源变更后请重新计划渲染': ['Draft saved; plan rendering again after source changes', '下書きを保存しました。ソース変更後はレンダリングを再計画してください'],
  '作者源已提交作品编辑': ['Composition source submitted as a project edit', '作曲ソースを作品の編集として送信しました'],
  '正在读取实际音色与乐器目录…': ['Reading the actual soundbank and instrument catalog…', '実際の音源と楽器一覧を読み込み中…'],
  '采样音色宿主不可用': ['The sample soundbank host is unavailable', 'サンプル音源ホストを利用できません'], '无法读取已安装音色文件': ['Cannot read the installed soundbank file', 'インストール済みの音源ファイルを読み込めません'],
  '已读取 {count} 个预设。请审阅配器、试听并重新计划渲染。': ['Read {count} presets. Review instruments, play the score and plan rendering again.', '{count} 個のプリセットを読み込みました。楽器編成を確認して試聴し、レンダリングを再計画してください。'],
  '使用当前乐谱与音色准备试听…': ['Preparing playback with the current score and soundbank…', '現在の楽譜と音源で試聴を準備中…'],
  '正在试听当前乐谱；修改后需重新试听与计划': ['Playing the current score; play and plan again after edits', '現在の楽譜を試聴中。編集後は再試聴して再計画してください'],
  '试听已停止': ['Playback stopped', '試聴を停止しました'], '音色导入服务不可用': ['Soundbank import is unavailable', '音源のインポートを利用できません'],
  '音色安装服务不可用': ['Soundbank installation is unavailable', '音源のインストールを利用できません'],
  '正在安装所选音色，请稍候；此操作只下载明确选择的包…': ['Installing the selected soundbank. Only the selected package will be downloaded…', '選択した音源をインストール中。選択したパッケージのみをダウンロードします…'],
  '音色安装完成，请读取乐器目录': ['Soundbank installed. Read the instrument catalog.', '音源をインストールしました。楽器一覧を読み込んでください。'],
  '音轨 {count}': ['Track {count}', 'トラック {count}'], '分段 {count}': ['Section {count}', 'セクション {count}'],
  '制作服务不可用': ['Production service is unavailable', '制作サービスを利用できません'], '请选择实际采样渲染连接': ['Choose an actual sample render connection', '実際のサンプルレンダリング接続を選択してください'],
  '作者源渲染': ['Composition source render', '作曲ソースのレンダリング'],
  '已冻结「{title}」的乐谱、音色和渲染设置；一次本地执行，提交后产生新候选。': ['The score, soundbank and render settings for “{title}” are frozen. Submit once to render locally and produce a new candidate.', '「{title}」の楽譜、音源、レンダリング設定を固定しました。一度実行するとローカルでレンダリングし、新しい候補を作成します。'],
  '已提交本地渲染，可在制作页取消和审阅候选。': ['Local render submitted. Cancel or review its candidate in Production.', 'ローカルレンダリングを開始しました。制作でキャンセルや候補の確認ができます。'],
  '连接': ['Connection', '接続'], '模型': ['Model', 'モデル'], '写谱': ['Composition', '作曲'],
  '{requests} 次请求 · {characters} 字符 · {destination}': ['{requests} requests · {characters} characters · {destination}', '{requests} 回のリクエスト · {characters} 文字 · {destination}'],
  '请先检查实际输入': ['Review the actual input first', '先に実際の入力を確認してください'], '写谱任务已发送；有效乐谱将自动生成本地试听候选。': ['Composition sent. A valid score is rendered into a local listening candidate automatically.', '作曲を送信しました。有効な楽譜から試聴候補を自動生成します。'],
  '写谱任务不存在': ['Composition task was not found', '作曲タスクが見つかりません'], '写谱任务状态：{state}': ['Composition task status: {state}', '作曲タスクの状態：{state}'],
  '原文已保留；校验并采用后进入当前草稿。': ['Original result retained. Validate and adopt it into the current draft.', '原文を保持しました。検証して採用すると、現在の下書きに反映されます。'],
  '已取消写谱任务，已有完整候选保留': ['Composition task cancelled; complete candidates are retained', '作曲タスクをキャンセルしました。完成済みの候補は保持します'],
  '拖动已取消，音符保持原状': ['Drag cancelled; the note is unchanged', 'ドラッグを取り消しました。ノートは元の状態です'],
  '乐谱必须是 JSON 对象': ['The score must be a JSON object', '楽譜には JSON オブジェクトが必要です'],
  '乐谱数据版本应为 1': ['Score schema version must be 1', '楽譜のデータバージョンは 1 が必要です'],
  '请填写名称或稳定身份': ['Enter a name or stable identity', '名前または固定の識別情報を入力してください'],
  '每拍 tick 数应为 24～9600 的整数': ['Ticks per beat must be an integer from 24 to 9600', '1 拍の tick 数は 24～9600 の整数にしてください'],
  '完整时长应为正整数 tick': ['Full duration must be a positive integer in ticks', '全体の長さは正の整数 tick にしてください'],
  '拍号应为 1～16 拍，分母为 1、2、4、8 或 16': ['Meter must have 1–16 beats and a unit of 1, 2, 4, 8 or 16', '拍子は 1～16 拍、分母は 1、2、4、8、16 のいずれかにしてください'],
  '速度从 tick 0 开始，位置递增，BPM 为 20～300': ['Tempo must start at tick 0, use increasing positions and BPM 20–300', 'テンポは tick 0 から開始し、位置を昇順、BPM を 20～300 にしてください'],
  '请选择明确身份及精确版本的采样音色包': ['Choose a soundbank with an explicit identity and exact version', '識別情報と正確なバージョンを持つ音源を選択してください'],
  '循环区起点应小于终点，并位于完整时长内': ['Loop start must precede its end within the full duration', 'ループ開始は終了より前にし、全体の長さ内に収めてください'],
  '渲染使用 48kHz 双声道，增益 0.01～1、尾音 0～10 秒与明确效果/循环尾音处理': ['Rendering requires 48 kHz stereo, gain 0.01–1, a 0–10 second tail and explicit effect/loop-tail settings', 'レンダリングは 48kHz ステレオ、ゲイン 0.01～1、余韻 0～10 秒と明確なエフェクト / ループ余韻設定が必要です'],
  '请保留手写或生成来源': ['Retain the manual or generated origin', '手動作成または生成の由来を保持してください'], '至少建立一个分段': ['Create at least one section', 'セクションを 1 つ以上作成してください'],
  '分段需要唯一身份、名称与完整时长内的有效区间': ['Each section needs a unique identity, a name and a valid range within the full duration', 'セクションには一意の識別情報、名前、全体の長さ内の有効範囲が必要です'],
  '请建立 1～16 条音轨': ['Create 1–16 tracks', 'トラックを 1～16 本作成してください'], '音轨必须是对象': ['A track must be an object', 'トラックにはオブジェクトが必要です'],
  '音轨身份应唯一': ['Track identities must be unique', 'トラックの識別情報は一意にしてください'],
  '音轨需要名称、音色身份及 0～127 音量/声像': ['Each track needs a name, instrument identity and volume/pan from 0 to 127', 'トラックには名前、楽器の識別情報、0～127 の音量 / パンが必要です'],
  '请提供音符数组': ['Provide a notes array', 'ノートの配列を指定してください'],
  '音符需要唯一身份、0～127 音高、正整数时值、1～127 力度且位于完整时长内': ['Notes need unique identities, pitch 0–127, positive integer durations, velocity 1–127 and must fit within the full duration', 'ノートには一意の識別情報、0～127 の音高、正の整数の長さ、1～127 のベロシティが必要です。全体の長さ内に収めてください'],
  '请提供控制事件数组': ['Provide a control events array', 'コントロールイベントの配列を指定してください'],
  '控制事件需位于完整时长内并使用已公开控制与 0～127 数值': ['Control events must fit within the full duration and use supported controllers with values 0–127', 'コントロールイベントは全体の長さ内に配置し、公開コントローラーと 0～127 の値を使用してください'],
  '写谱结果不是完整 JSON；原文已保留，请手动修正或明确重新请求': ['The composition result is not complete JSON. The original text is retained; correct it manually or explicitly send a new request.', '作曲結果が完全な JSON ではありません。原文を保持しています。手動で修正するか、明示的に再リクエストしてください。'],
  '当前版本使用一个 GM 鼓组通道；请把鼓组音符合并至同一音轨': ['This version uses one GM drum channel. Merge drum notes into one track.', 'このバージョンは GM ドラムチャンネルを 1 つ使用します。ドラムノートを 1 本のトラックにまとめてください。'],
  '当前版本最多使用 15 条旋律音轨与一条鼓组音轨': ['This version supports up to 15 melodic tracks and one drum track', 'このバージョンは旋律トラック 15 本とドラムトラック 1 本まで使用できます'],
  '内部循环区需要按相同音源渲染实际边界尾音': ['An internal loop requires its boundary tail rendered with the same soundbank', '曲内のループ範囲には、同じ音源でレンダリングした境界の余韻が必要です'],
  '音轨 {track} · ': ['Track {track} · ', 'トラック {track} · '], '第 {bar} 小节 · ': ['Bar {bar} · ', '第 {bar} 小節 · '],
  '音轨「{track}」的乐器 {instrument} 不在指定音色包中；请明确重映射': ['Track “{track}”: instrument {instrument} is missing from the selected soundbank. Remap it explicitly.', 'トラック「{track}」の楽器 {instrument} は指定した音源にありません。明示的に再割り当てしてください。'],
  '音轨「{track}」音符 {note} 超出「{instrument}」实际音域 {low}～{high}': ['Track “{track}”: note {note} exceeds the actual range {low}–{high} of “{instrument}”.', 'トラック「{track}」のノート {note} は「{instrument}」の実際の音域 {low}～{high} を超えています。'],
  '音轨「{track}」乐器「{instrument}」未声明 CC{controller} 控制': ['Track “{track}”: instrument “{instrument}” does not declare CC{controller} support.', 'トラック「{track}」の楽器「{instrument}」は CC{controller} に対応していません。'],
  '渲染峰值 {peak} 超出音频范围；请降低音轨音量或渲染增益后重新计划': ['Render peak {peak} exceeds the audio range. Lower track volume or render gain and plan again.', 'レンダリングのピーク {peak} が音声範囲を超えています。トラック音量かレンダリングゲインを下げて再計画してください。'],
  '不允许此值': ['Value is disallowed', 'この値は使用できません'], '结构定义无效': ['Invalid schema', 'スキーマが無効です'],
  '值不在可选范围内': ['Value is outside enum', '値が選択肢にありません'], '值与固定值不符': ['Value differs from const', '値が固定値と一致しません'],
  '文本过短': ['String too short', 'テキストが短すぎます'], '文本过长': ['String too long', 'テキストが長すぎます'], '格式不符': ['Pattern mismatch', '形式が一致しません'],
  '项目数量不足': ['Too few items', '項目が少なすぎます'], '项目数量过多': ['Too many items', '項目が多すぎます'],
  '缺少必填字段': ['Required field missing', '必須フィールドがありません'], '未定义的字段': ['Unknown property', '未定義のフィールドです'],
  '需要 {type} 类型': ['Expected {type}', '{type} 型が必要です'], '最小值为 {value}': ['Minimum {value}', '最小値は {value} です'], '最大值为 {value}': ['Maximum {value}', '最大値は {value} です'],
  '应大于 {value}': ['Greater than {value}', '{value} より大きい値が必要です'], '应小于 {value}': ['Less than {value}', '{value} より小さい値が必要です'],
  '{keyword} 约束不满足': ['{keyword} constraints failed', '{keyword} の制約を満たしていません'],
  '草稿': ['Draft', '下書き'], '排队中': ['Queued', '待機中'], '执行中': ['Running', '実行中'], '等待审阅': ['Ready for review', '確認待ち'],
  '失败': ['Failed', '失敗'], '已取消': ['Cancelled', 'キャンセル済み'], '已完成': ['Completed', '完了'], '已采用': ['Adopted', '採用済み'],
  '受阻': ['Blocked', 'ブロック中'], '提交中': ['Submitting', '送信中'], '读取中': ['Fetching', '取得中'], '已中断': ['Interrupted', '中断'],
  '错误': ['Error', 'エラー'],
  '请选择受支持的音色包及其精确版本': ['Choose a supported soundbank and its exact version', '対応する音源と正確なバージョンを選択してください'],
  '音色包身份或版本不可用': ['The soundbank identity or version is unavailable', '音源の識別情報またはバージョンを利用できません'],
  '自备音色安装记录不符': ['The imported soundbank installation record does not match', '持ち込み音源のインストール記録が一致しません'],
  '安装记录与音色包版本不符': ['The installation record does not match the soundbank version', 'インストール記録と音源のバージョンが一致しません'],
  '音色包版权资料缺失': ['Soundbank copyright information is missing', '音源の著作権情報がありません'],
  '音色文件大小与固定版本不符，请重新安装': ['The soundbank file size differs from its fixed version. Reinstall it.', '音源ファイルのサイズが固定バージョンと一致しません。再インストールしてください。'],
  '文件不是可读取的 SoundFont 音色': ['The file is not a readable SoundFont soundbank', '読み込み可能な SoundFont 音源ではありません'],
  '请填写音色名称、来源和许可资料': ['Enter the soundbank name, source and license information', '音源名、配布元、ライセンス情報を入力してください'],
  '请选择 SF2 或 SF3 音色文件': ['Choose an SF2 or SF3 soundbank file', 'SF2 または SF3 の音源ファイルを選択してください'],
  '音色下载失败（HTTP {status}）': ['Soundbank download failed (HTTP {status})', '音源のダウンロードに失敗しました（HTTP {status}）'],
  '下载未完成，请重新安装音色包': ['The download is incomplete. Reinstall the soundbank.', 'ダウンロードが完了していません。音源を再インストールしてください。'],
  '音色安装目录不在本机媒体目录内': ['The soundbank installation directory is outside the local media directory', '音源のインストール先がローカルメディアのディレクトリ内にありません'],
  '音色包不可用：{detail}。请在编曲工位安装指定音色包。': ['Soundbank unavailable: {detail}. Install the specified soundbank in the composition workstation.', '音源を利用できません：{detail}。作曲ワークステーションで指定の音源をインストールしてください。'],
} satisfies Record<string, readonly [string, string]>;

export type MusicTextKey = keyof typeof messages;
export function musicText(locale = 'zh-CN') {
  const language = locale.toLowerCase().split('-')[0];
  return (key: MusicTextKey, values: Record<string, string | number> = {}): string => {
    const template = language === 'en' ? messages[key][0] : language === 'ja' ? messages[key][1] : key;
    return template.replace(/\{(\w+)\}/g, (token, name: string) => String(values[name] ?? token));
  };
}

/** Localize only plugin diagnostics; captures retain author names and identifiers verbatim. */
export function musicError(locale: string, message: string): string {
  const t = musicText(locale);
  const diagnostic = (text: string) => {const key=Object.hasOwn(messages,text)?text:Object.keys(messages).find(key=>messages[key as MusicTextKey][0]===text);return key?t(key as MusicTextKey):text;};
  return message.split('\n').map(line => {
    if (line.startsWith('Error: ')) return `${t('错误')}: ${musicError(locale, line.slice(7))}`;
    if (diagnostic(line)!==line) return diagnostic(line);
    const nativeMissing=/^Track "(.*)" uses instrument (.*), absent from the selected soundbank\. Explicitly remap it\.$/.exec(line);if(nativeMissing)return t('音轨「{track}」的乐器 {instrument} 不在指定音色包中；请明确重映射',{track:nativeMissing[1]!,instrument:nativeMissing[2]!});
    const nativeRange=/^Track "(.*)" note (.*) exceeds instrument "(.*)" range (\d+) through (\d+)$/.exec(line);if(nativeRange)return t('音轨「{track}」音符 {note} 超出「{instrument}」实际音域 {low}～{high}',{track:nativeRange[1]!,note:nativeRange[2]!,instrument:nativeRange[3]!,low:nativeRange[4]!,high:nativeRange[5]!});
    const nativeControl=/^Track "(.*)" instrument "(.*)" does not declare CC(\d+)$/.exec(line);if(nativeControl)return t('音轨「{track}」乐器「{instrument}」未声明 CC{controller} 控制',{track:nativeControl[1]!,instrument:nativeControl[2]!,controller:nativeControl[3]!});
    const soundbank = /^音色包不可用：(.+)。请在编曲工位安装指定音色包。$/.exec(line);
    if (soundbank) return t('音色包不可用：{detail}。请在编曲工位安装指定音色包。', { detail: musicError(locale, soundbank[1]!) });
    const download = /^音色下载失败（HTTP (\d+)）$/.exec(line); if (download) return t('音色下载失败（HTTP {status}）', { status: download[1]! });
    const schema = /^(\$.*?): (.+)$/.exec(line);
    if (schema) {
      const keys: Record<string, MusicTextKey> = { 'Value is disallowed': '不允许此值', 'Invalid schema': '结构定义无效', 'Value is outside enum': '值不在可选范围内', 'Value differs from const': '值与固定值不符', 'String too short': '文本过短', 'String too long': '文本过长', 'Pattern mismatch': '格式不符', 'Too few items': '项目数量不足', 'Too many items': '项目数量过多', 'Required field missing': '缺少必填字段', 'Unknown property': '未定义的字段' };
      const detail = schema[2]!, key = keys[detail];
      if (key) return `${schema[1]}: ${t(key)}`;
      const type = /^Expected (.+)$/.exec(detail); if (type) return `${schema[1]}: ${t('需要 {type} 类型', { type: type[1]! })}`;
      const range = /^(Minimum|Maximum|Greater than|Less than) (.+)$/.exec(detail);
      if (range) return `${schema[1]}: ${t(({ Minimum: '最小值为 {value}', Maximum: '最大值为 {value}', 'Greater than': '应大于 {value}', 'Less than': '应小于 {value}' } as const)[range[1] as 'Minimum'], { value: range[2]! })}`;
      const constraint = /^(anyOf|oneOf|allOf) constraints failed$/.exec(detail); if (constraint) return `${schema[1]}: ${t('{keyword} 约束不满足', { keyword: constraint[1]! })}`;
    }
    const normalized=line.replace(/^Track (.*?) · /,'音轨 $1 · ').replace(/Bar (\d+) · /,'第 $1 小节 · ');
    const score = /^(?:音轨 (.*?) · )?(?:第 (\d+) 小节 · )?([^：]+)：(.+)$/.exec(normalized);
    if (score && (Object.hasOwn(messages,score[4]!)||Object.values(messages).some(values=>values[0]===score[4]))) return `${score[1] ? t('音轨 {track} · ', { track: score[1] }) : ''}${score[2] ? t('第 {bar} 小节 · ', { bar: score[2] }) : ''}${score[3]}: ${diagnostic(score[4]!)}`;
    const missing = /^音轨「(.*)」的乐器 (.*) 不在指定音色包中；请明确重映射$/.exec(line);
    if (missing) return t('音轨「{track}」的乐器 {instrument} 不在指定音色包中；请明确重映射', { track: missing[1]!, instrument: missing[2]! });
    const range = /^音轨「(.*)」音符 (.*) 超出「(.*)」实际音域 (\d+)～(\d+)$/.exec(line);
    if (range) return t('音轨「{track}」音符 {note} 超出「{instrument}」实际音域 {low}～{high}', { track: range[1]!, note: range[2]!, instrument: range[3]!, low: range[4]!, high: range[5]! });
    const control = /^音轨「(.*)」乐器「(.*)」未声明 CC(\d+) 控制$/.exec(line);
    if (control) return t('音轨「{track}」乐器「{instrument}」未声明 CC{controller} 控制', { track: control[1]!, instrument: control[2]!, controller: control[3]! });
    const peak = /^渲染峰值 ([\d.]+) 超出音频范围；请降低音轨音量或渲染增益后重新计划$/.exec(line);
    if (peak) return t('渲染峰值 {peak} 超出音频范围；请降低音轨音量或渲染增益后重新计划', { peak: peak[1]! });
    return line;
  }).join('\n');
}

export function musicTaskState(locale: string, state: string): string {
  const keys: Record<string, MusicTextKey> = { draft: '草稿', queued: '排队中', blocked: '受阻', submitting: '提交中', running: '执行中', fetching: '读取中', review: '等待审阅', interrupted: '已中断', failed: '失败', cancelled: '已取消', completed: '已完成', succeeded: '已完成', adopted: '已采用' };
  return keys[state] ? musicText(locale)(keys[state]) : state;
}
