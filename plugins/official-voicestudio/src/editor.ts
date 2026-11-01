import { emptyContributions } from '@galcraft/plugins/contracts';
import type { FieldEditorContribution, GalCraftPlugin } from '@galcraft/plugins/contracts';
import { localizeIssue, issueDetails, issueFromError, type Diagnostic, type Json, type SpeechServiceCatalog } from '@galcraft/contracts';
import { operations } from './definition.js';

/** Discovery updates its own region; in-progress author input keeps the same DOM and focus. */
export function mountVoiceStudioEditor(root: HTMLElement, context: Parameters<FieldEditorContribution['mount']>[1]) {
  const target = context.target, mode = target?.operation.id.split('/')[1] ?? 'speech';
  const t = (zh: string, en: string, ja: string) => context.locale === 'en' ? en : context.locale === 'ja' ? ja : zh;
  const fields = structuredClone(target?.fields ?? context.value) as Record<string, Json>;
  let catalog: SpeechServiceCatalog | undefined, pending = false, stopped = false, revision = target?.revision;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, content?: string) => { const node = document.createElement(tag); if (content) node.textContent = content; return node; };
  const style = element('style');
  style.textContent = `
    .voicestudio-editor{color:var(--foreground);display:flex;flex-direction:column;gap:12px;min-width:0;font:14px/22px var(--font-sans)}
    .voicestudio-editor .field{display:flex;flex-direction:column;gap:4px}
    .voicestudio-editor .field>span{color:var(--foreground-secondary,var(--muted-foreground));font:500 13px/20px var(--font-sans)}
    .voicestudio-editor [hidden],.voicestudio-editor small:empty,.voicestudio-editor p:empty{display:none}
    .voicestudio-editor input,.voicestudio-editor select,.voicestudio-editor textarea{box-sizing:border-box;width:100%;min-width:0;color:var(--foreground);caret-color:var(--primary);background-color:var(--control-background,var(--input,var(--background)));border:1px solid var(--control-border,var(--border));border-radius:6px;padding:4px 8px;font:inherit}
    .voicestudio-editor input,.voicestudio-editor select{height:32px;min-height:32px}
    .voicestudio-editor select{appearance:auto;background-image:none}
    .voicestudio-editor textarea{min-height:88px;padding-block:8px;resize:vertical}
    .voicestudio-editor input:hover:not(:disabled),.voicestudio-editor select:hover:not(:disabled),.voicestudio-editor textarea:hover:not(:disabled){border-color:var(--primary)}
    .voicestudio-editor input:disabled,.voicestudio-editor select:disabled,.voicestudio-editor textarea:disabled{color:var(--foreground-secondary,var(--muted-foreground));opacity:1;cursor:default}
    .voicestudio-editor button{align-self:flex-start;box-sizing:border-box;min-height:32px;border:1px solid var(--control-border,var(--border));background:var(--background);color:var(--foreground);border-radius:6px;padding:4px 10px;font:500 13px/20px var(--font-sans);cursor:pointer}
    .voicestudio-editor button:hover:not(:disabled){background:var(--surface-hover,var(--background))}
    .voicestudio-editor button:active:not(:disabled){background:var(--selection,var(--surface-hover))}
    .voicestudio-editor button:disabled{color:var(--foreground-disabled,var(--muted-foreground));border-color:var(--border);opacity:1;cursor:default}
    .voicestudio-editor :focus-visible{outline:2px solid var(--ring,var(--primary));outline-offset:2px}
    .voicestudio-editor small{display:block;color:var(--muted-foreground);font:400 12px/18px var(--font-sans)}
    .voicestudio-editor a{color:var(--primary);text-underline-offset:2px}
    .voicestudio-editor p{margin:0;overflow-wrap:anywhere}
    .voicestudio-editor .voice-discovery{display:grid;gap:8px;padding-bottom:12px;border-bottom:1px solid var(--border)}
    .voicestudio-editor .voice-connection{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-weight:500}
    .voicestudio-editor .voice-discovery-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px}
    .voicestudio-editor .voice-discovery-actions p,.voicestudio-editor .voice-engine{font-size:13px;line-height:20px;color:var(--muted-foreground)}
    .voicestudio-editor .voice-service-info{display:grid;gap:8px;padding-top:8px;color:var(--muted-foreground);font-size:13px;line-height:20px}
    .voicestudio-editor summary{box-sizing:border-box;min-height:32px;padding-block:6px;font:500 13px/20px var(--font-sans);cursor:pointer;border-radius:4px}
    .voicestudio-editor summary:hover{color:var(--primary)}
    .voicestudio-editor pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;font:12px/20px var(--font-mono)}
    .voicestudio-editor p[data-tone=error]{color:var(--danger-foreground,var(--destructive-foreground))}
    .voicestudio-editor ::selection{color:var(--foreground);background:var(--selection)}
  `;
  const discovery = element('section'), details = element('details'), serviceInfo = element('div'), refreshButton = element('button'), discoveryStatus = element('p'), commitStatus = element('p'), engineStatus = element('p');
  const issuePanel = (status: HTMLElement) => { const panel = element('div'), disclosure = element('details'), technical = element('pre'); panel.hidden = true; disclosure.append(element('summary', t('诊断详情', 'Diagnostic details', '診断の詳細')), technical); panel.append(status, disclosure); return { panel, show(issue?: Diagnostic) { panel.hidden = !issue; status.role = issue?.severity === 'info' ? 'status' : 'alert'; if (issue) { status.textContent = localizeIssue(issue, context.locale); technical.textContent = issueDetails(issue); } } }; };
  const discoveryIssue = issuePanel(element('p')), commitIssue = issuePanel(commitStatus);
  discovery.className = 'voice-discovery'; serviceInfo.className = 'voice-service-info'; engineStatus.className = 'voice-engine';
  for (const status of [discoveryStatus, commitStatus]) { status.role = 'status'; status.setAttribute('aria-live', 'polite'); }
  commitStatus.dataset.tone = 'error';
  const connection = element('p', target?.connection?.name ?? t('请先选择 VoiceStudio 服务连接。', 'Choose a VoiceStudio connection first.', 'VoiceStudio 接続を選択してください。'));
  connection.className = 'voice-connection';
  const discoveryActions = element('div'); discoveryActions.className = 'voice-discovery-actions'; discoveryActions.append(refreshButton, discoveryStatus);
  details.append(element('summary', t('服务详情', 'Service details', 'サービス詳細')), serviceInfo);
  discovery.append(connection, engineStatus, discoveryActions, discoveryIssue.panel, details);
  refreshButton.type = 'button'; root.replaceChildren(style, discovery); root.classList.add('voicestudio-editor');
  const commit = async () => {
    if (stopped || context.signal.aborted) return;
    try {
      const result = target ? await target.commit({ expectedRevision: revision!, fields: structuredClone(fields), references: target.references }) : await context.commit(structuredClone(fields));
      if (stopped || context.signal.aborted) return;
      if (!result.ok) commitIssue.show(result.error);
      else { commitIssue.show(); if (target && result.value && 'revision' in result.value) revision = result.value.revision as number; }
    } catch (error) { if (!stopped) commitIssue.show(issueFromError(error, 'M09')); }
  };
  const input = (key: string, label: string, multiline = false, numeric = false) => {
    const wrapper = element('label'), caption = element('span', label), control = multiline ? element('textarea') : element('input'), help = element('small');
    wrapper.className = 'field'; control.dataset.voiceField = key; control.value = String(fields[key] ?? ''); control.disabled = !!target?.readonly;
    if (control instanceof HTMLTextAreaElement) control.rows = 3;
    else if (numeric) control.type = 'number';
    const capture = () => { fields[key] = numeric ? control.value === '' ? null : Number(control.value) : control.value; };
    control.oninput = capture; control.onchange = () => { capture(); void commit(); };
    wrapper.append(caption, control, help); root.append(wrapper); return { wrapper, caption, control, help };
  };
  const select = (key: string, label: string, changed: (value: string) => void) => {
    const wrapper = element('label'), control = element('select'); wrapper.className = 'field'; wrapper.append(element('span', label), control); control.disabled = !!target?.readonly;
    control.dataset.voiceField = key; control.onchange = () => changed(control.value); root.append(wrapper); return { wrapper, control };
  };
  const options = (control: HTMLSelectElement, current: string, choices: { value: string; label: string }[]) => {
    if (current && !choices.some(choice => choice.value === current)) choices.push({ value: current, label: `${current} · ${t('当前目录缺失，请重新选择', 'Missing from this catalog; rebind', '現在の一覧にありません。再選択してください')}` });
    control.replaceChildren(...choices.map(choice => { const option = element('option', choice.label); option.value = choice.value; return option; })); control.value = current;
  };
  let language: ReturnType<typeof input>, description: ReturnType<typeof input> | undefined, performance: ReturnType<typeof input> | undefined, speed: ReturnType<typeof input> | undefined;
  let voice: ReturnType<typeof select> | undefined, preset: ReturnType<typeof select> | undefined;
  const transcription = element('p'), limitation = element('small');
  if (mode === 'transcribe') {
    root.append(transcription); language = input('language', t('录音语言（可留空）', 'Recording language (optional)', '録音の言語（任意）'));
    root.append(element('p', t('转录结果是可编辑候选。审阅后选择“转入下一制作阶段”，将录音和逐字稿放入克隆草稿。', 'The transcript is an editable candidate. After review, use “Use in the next production stage” to put the recording and transcript into the clone draft.', '結果は編集可能な候補です。確認後「次の制作段階に反映」で録音とテキストを複製下書きへ移します。')));
  } else {
    input('text', t('朗读文本', 'Spoken text', '読み上げ文'), true); language = input('language', t('目标语言', 'Target language', '対象言語'));
    if (mode === 'speech') voice = select('voiceId', t('已保存声音 / 引擎预设', 'Saved voice / engine preset', '保存音声 / エンジンプリセット'), value => { fields.voiceId = value; void commit(); });
    if (mode === 'design' || fields.voiceDescription) {
      preset = select('designPreset', t('服务设计预设', 'Service design preset', 'サービスの声質プリセット'), instruction => { fields.voiceDescription = instruction; description!.control.value = instruction; void commit(); });
      description = input('voiceDescription', t('声音属性 / 描述', 'Voice attributes / description', '声質属性 / 説明'), true);
    }
    if (mode === 'clone' || mode === 'speech') input('referenceText', t('准确参考逐字稿', 'Exact reference transcript', '正確な参照テキスト'), true);
    performance = input('performanceInstruction', t('表演指令', 'Performance instruction', '演技指示'), true);
    limitation.textContent = t('当前 HTTP 端口没有独立情绪控制。IndexTTS 的 WebSocket 情绪参数未在此端口公开。', 'This HTTP endpoint has no separate emotion control. IndexTTS WebSocket emotion fields are not exposed here.', 'この HTTP には独立した感情制御がありません。IndexTTS WebSocket の感情項目は未公開です。');
    speed = input('speed', t('语速（倍）', 'Speed', '速度（倍）'), false, true); const speedControl = speed.control as HTMLInputElement; speedControl.min = '.25'; speedControl.max = '4'; speedControl.step = '.05';
    input('seed', t('种子（可留空）', 'Seed (optional)', 'シード（任意）'), false, true);
  }
  const retryCommit = element('button', t('重试应用保留的输入', 'Retry applying retained input', '保持した入力を再適用')); retryCommit.type = 'button'; retryCommit.disabled = !!target?.readonly; retryCommit.onclick = () => void commit(); commitIssue.panel.append(element('p', t('本次输入已保留。检查相关字段或连接后重试应用。', 'Your input is retained. Check the affected fields or connection, then retry applying it.', '入力は保持されています。対象の項目や接続を確認し、再適用してください。')), retryCommit);
  root.append(commitIssue.panel);
  const updateDiscovery = () => {
    const engine = catalog?.engines.find(engine => engine.id === target?.connection?.model);
    refreshButton.textContent = pending ? t('正在读取服务…', 'Reading service…', 'サービスを読み込み中…') : t('刷新引擎与声音', 'Refresh engines and voices', 'エンジンと音声を更新');
    refreshButton.disabled = pending || !target?.inspectConnection;
    discovery.setAttribute('aria-busy', String(pending));
    engineStatus.textContent = engine ? `${engine.name} · ${engine.available ? t('可用', 'Available', '利用可能') : engine.reason ?? t('不可用', 'Unavailable', '利用不可')}` : target?.connection?.model ?? '';
    engineStatus.dataset.tone = engine && !engine.available ? 'error' : 'neutral';
    serviceInfo.replaceChildren();
    if (target?.connection) serviceInfo.append(element('p', `${t('完整连接名称', 'Full connection name', '接続名の全文')}：${target.connection.name}`));
    if (engine) {
      for (const model of catalog!.models.filter(model => model.engines.includes(engine.id) && model.installed)) { const link = element('a', model.name); link.href = model.source; link.target = '_blank'; link.rel = 'noreferrer'; serviceInfo.append(link); if (model.conditions) serviceInfo.append(element('p', model.conditions)); }
      if (engine.maxReferenceSeconds && mode === 'clone') serviceInfo.append(element('p', t(`此引擎参考窗口最多 ${engine.maxReferenceSeconds} 秒；服务按自身规则选取参考片段。`, `This engine uses a reference window up to ${engine.maxReferenceSeconds} seconds; the service selects the actual segment.`, `参照窓は最大 ${engine.maxReferenceSeconds} 秒です。区間はサービスが選択します。`)));
    }
    if (mode !== 'transcribe') serviceInfo.append(limitation);
    if (mode === 'transcribe') transcription.textContent = catalog?.transcription ? `${t('实际转录引擎', 'Actual transcription engine', '実際の文字起こしエンジン')}：${catalog.transcription.engine} · ${catalog.transcription.model ?? '—'}` : t('选择参考录音，检查计划后开始转录。', 'Choose a recording, review the plan, then transcribe.', '録音を選び、計画を確認して文字起こしします。');
    else language.help.textContent = engine?.languages?.length ? engine.languages.join(' / ') : t('服务尚未声明完整语言范围。填写实际引擎支持的语言；计划或请求失败时保留输入。', 'The service has not declared its full language range. Enter a language the actual engine supports; failures preserve your input.', '言語一覧はサービス未宣言です。実際のエンジンが対応する言語を入力してください。');
    if (voice) options(voice.control, String(fields.voiceId ?? ''), [{ value: '', label: t('引擎默认声音或下方参考录音', 'Engine default or the recording below', '既定音声または下の参照録音') }, ...(catalog?.voices.filter(voice => (!voice.engine || voice.engine === engine?.id) && (voice.kind !== 'profile' || engine?.cloning)).map(voice => ({ value: voice.id, label: `${voice.name}${voice.language ? ` · ${voice.language}` : ''}` })) ?? [])]);
    if (preset) { preset.wrapper.hidden = engine?.design !== 'tags'; options(preset.control, String(fields.voiceDescription ?? ''), [{ value: '', label: t('自定义属性', 'Custom attributes', '属性を指定') }, ...(catalog?.designPresets.map(preset => ({ value: preset.instruction, label: preset.name })) ?? [])]); }
    if (description) description.help.textContent = engine?.design === 'tags' ? t('使用同一种语言的逗号分隔属性，例如 female, young adult, moderate pitch。OmniVoice 不接受 happy/sad 或自由情绪描述。', 'Use comma-separated attributes in one language, for example female, young adult, moderate pitch. OmniVoice does not accept happy/sad or free-form emotions.', '同じ言語の属性をカンマ区切りで指定します。例：female, young adult, moderate pitch。happy/sad や自由な感情文は使えません。') : '';
    if (performance) performance.wrapper.hidden = engine?.performance !== 'instruction' && !fields.performanceInstruction;
    limitation.hidden = engine?.performance === 'instruction';
    if (speed) speed.wrapper.hidden = !engine?.speed && (fields.speed === 1 || fields.speed === null || fields.speed === undefined);
  };
  const refresh = async () => {
    if (!target?.inspectConnection || pending) return;
    pending = true; updateDiscovery();
    try { const result = await target.inspectConnection(); if (stopped || context.signal.aborted) return; if (result.ok) { catalog = result.value.speechCatalog; discoveryStatus.textContent = result.value.issues.map(issue => localizeIssue(issue, context.locale)).join(' · ') || t('引擎与声音已刷新。', 'Engines and voices refreshed.', 'エンジンと音声を更新しました。'); discoveryStatus.dataset.tone = result.value.issues.some(issue => issue.severity === 'error') ? 'error' : 'neutral'; const issue = result.value.issues.find(issue => issue.severity === 'error'); discoveryIssue.show(issue ? { ...issue, code: 'VOICESTUDIO_DISCOVERY', messageKey: undefined, details: { provider: issue } } : undefined); } else { discoveryStatus.textContent = ''; discoveryIssue.show({ ...result.error, code: 'VOICESTUDIO_DISCOVERY', messageKey: undefined, details: { provider: result.error } }); } }
    catch (error) { if (!stopped) { discoveryStatus.textContent = ''; const issue = issueFromError(error, 'M09'); discoveryIssue.show({ ...issue, code: 'VOICESTUDIO_DISCOVERY', messageKey: undefined, details: { provider: issue } }); } }
    finally { pending = false; if (!stopped && !context.signal.aborted) updateDiscovery(); }
  };
  refreshButton.onclick = () => void refresh(); updateDiscovery(); void refresh();
  return () => { stopped = true; root.replaceChildren(); };
}
export function createPlugin(): GalCraftPlugin { return { async activate() { return { ...emptyContributions(), fieldEditors: operations.map(operation => ({ key: operation.fieldEditorKey!, contributionKey: operation.id, fieldKey: 'language', mount: mountVoiceStudioEditor })) }; }, async deactivate() {} }; }
