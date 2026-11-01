import { writingOperationId } from './metadata.js';
import type { ConnectionConfig, Json, Result } from '@galcraft/contracts';
import type { FieldEditorContribution } from '@galcraft/plugins/contracts';
import { createMusicScore, controllerNames, parseGeneratedMusicScore, parseMusicScore, tickToSeconds } from './score.js';
import type { MusicScore } from './score.js';
import { readSoundBank, soundBankKeys } from './catalog.js';
import type { MusicInstrument, SoundBankStatus } from './catalog.js';
import { MusicPreview } from './preview.js';
import { tickPosition } from './time.js';
import { assembleMusicWritingInput, musicWritingPresets } from './prompts.js';
import { musicText, musicError, musicTaskState } from './ui-text.js';
import type { MusicTextKey } from './ui-text.js';
import { workstationStyles } from './workstation-style.js';
import { musicRenderOperation } from './definition.js';
import { operationId, pluginId } from './score.js';
import { scoreDurations } from './constraints.js';
type Context = Parameters<FieldEditorContribution['mount']>[1];
type History = { undo: MusicScore[]; redo: MusicScore[] };
const histories = new Map<string, History>();
const writingSessions = new Map<string, { description: string; preset: string; raw: string; candidateId: string; taskId: string; planId: string; connectionId: string; prompt: string; summary: string }>();
const html = (value: unknown) => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Json;
const success = <T>(value: T): Result<T> => ({ ok: true, warnings: [], value });
const noteName = (pitch: number) => `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitch % 12]}${Math.floor(pitch / 12) - 1}`;

export function mountMusicWorkstation(root: HTMLElement, context: Context, options: { instruments?: MusicInstrument[]; workletUrl?: string } = {}) {
  const locale = context.locale, t = musicText(locale);
  const target = context.target;
  const raw = target ? target.fields.score : context.value;
  const initial = raw === undefined ? success(createMusicScore()) : parseMusicScore(raw);
  let score = initial.ok ? initial.value : createMusicScore(), selectedTrack = score.tracks[0]!.id, selectedNote = '', selectedSegment = score.segments[0]!.id;
  let instruments = options.instruments ?? [], soundbank: ArrayBuffer | null = null, statuses: SoundBankStatus[] = [], status = initial.ok ? '' : musicError(locale, initial.error.message);
  let revision = target?.revision ?? 0, saving = false, loading = false, disposed = false, snap = score.ppq / 4;
  let cancelGesture: (() => void) | undefined;
  const preview = new MusicPreview(), history = target ? histories.get(target.draftId) ?? { undo: [], redo: [] } : { undo: [], redo: [] };
  if (target) histories.set(target.draftId, history);
  const writing = target ? writingSessions.get(target.draftId) : undefined;
  let writingDescription = writing?.description ?? '', preset = writing?.preset ?? '', writingRaw = writing?.raw ?? '', writingCandidateId = writing?.candidateId ?? '', writingTaskId = writing?.taskId ?? '', writingPlanId = writing?.planId ?? '', writingConnectionId = writing?.connectionId ?? '', connections: ConnectionConfig[] = [];
  let promptView = writing?.prompt ?? '', planSummary = writing?.summary ?? '', pendingBank = score.soundbank.id;
  let invalidSourceJson = initial.ok ? null : JSON.stringify(raw, null, 2);
  let importPath = '', importName = '', importLicense = '', importSource = '';
  let renderConnections: ConnectionConfig[] = [], renderConnectionId = '', renderPlanId = '', renderTaskId = '';
  const workletUrl = options.workletUrl ?? new URL(/* @vite-ignore */ './spessasynth_processor.min.js', import.meta.url).href;
  const soundbanks = context.studio.soundbanks;
  const track = () => score.tracks.find(item => item.id === selectedTrack) ?? score.tracks[0]!;
  const showStatus = (message: string, error = false) => { status = musicError(locale, message); const element = root.querySelector('[data-status]');
    if (element) { element.textContent = status; element.setAttribute('role', error ? 'alert' : 'status'); } };
  async function apply(next: MusicScore, action: 'edit' | 'undo' | 'redo' = 'edit') {
    if (saving || disposed || target?.readonly) return false;
    const checked = parseMusicScore(next); if (!checked.ok) { showStatus(checked.issues.map(issue => issue.message).join('\n'), true); return false; }
    saving = true; await preview.stop();
    try {
      const result = target ? await target.commit({ expectedRevision: revision, fields: { ...target.fields, score: json(next) }, references: target.references }) : await context.commit(json(next));
      if (!result.ok) { showStatus(result.error.message, true); return false; }
      if (action === 'edit' && target) { history.undo.push(structuredClone(score)); if (history.undo.length > 60) history.undo.shift(); history.redo = []; }
      score = structuredClone(next); invalidSourceJson = null; writingPlanId = ''; renderPlanId = ''; if (target && 'revision' in (result.value ?? {})) revision = (result.value as { revision: number }).revision;
      else revision++;
      status = target ? t('草稿已保存；源变更后请重新计划渲染') : t('作者源已提交作品编辑');
      if (!disposed) render(); return true;
    } finally { saving = false; }
  }
  const change = (edit: (next: MusicScore) => void) => { const next = structuredClone(score); edit(next); return apply(next); };
  const button = (label: string, action: string, disabled = false) => `<button type="button" class="studio-button" data-action="${action}"${disabled ? ' disabled' : ''}>${label}</button>`;
  const field = (label: string, key: string, value: unknown, type = 'number', extra = '') => `<label class="authoring-field"><span>${label}</span><input data-field="${key}" data-focus="${key}" type="${type}" value="${html(value)}" ${extra}${target?.readonly ? ' disabled' : ''}></label>`;
  function render() {
    if (disposed) return;
    cancelGesture?.();
    const focused = root.contains(document.activeElement) ? document.activeElement?.getAttribute('data-focus') : undefined;
    const scroll = root.querySelector('[data-roll]')?.scrollLeft ?? 0;
    const current = track(), note = current.notes.find(item => item.id === selectedNote), selectedInstrument = instruments.find(item => item.id === current.instrumentId);
    const segment = score.segments.find(item => item.id === selectedSegment) ?? score.segments[0]!;
    const duration = tickToSeconds(score, score.durationTicks), bars = score.durationTicks / (score.ppq * score.meter.beats * 4 / score.meter.unit);
    const durations = scoreDurations(score);
    const pianoWidth = Math.max(720, score.durationTicks / score.ppq * 56), pianoHeight = 408, low = Math.min(48, ...current.notes.map(item => item.pitch)) - 2, high = Math.max(78, ...current.notes.map(item => item.pitch)) + 2;
    const yFor = (pitch: number) => 28 + (high - pitch) * ((pianoHeight - 28) / (high - low + 1));
    const rowHeight = (pianoHeight - 28) / (high - low + 1);
    const selectedStatus = statuses.find(item => item.descriptor.id === score.soundbank.id);
    const bankName = (id: string) => statuses.find(item => item.descriptor.id === id)?.descriptor.name ?? (id === 'ms-basic' ? 'MS Basic' : id === 'musescore-general-hq' ? 'General HQ' : id);
    root.innerHTML = `<style>${workstationStyles}</style><section class="gc-music" aria-label="${t('可编辑编曲工位')}">
      <header class="music-heading"><div><strong>${t('可编辑编曲')}</strong><span class="field-help">${target ? t('制作草稿') : t('作品作者源')} · ${t('{tracks} 条音轨 · {seconds} 秒', { tracks: score.tracks.length, seconds: duration.toFixed(1) })}</span></div>
        <div class="music-actions">${button(t('试听'), 'play', loading || !instruments.length)}${button(t('暂停 / 继续'), 'pause')}${button(t('停止'), 'stop')}${target ? button(t('撤销'), 'undo', !history.undo.length) + button(t('重做'), 'redo', !history.redo.length) : `<span class="field-help">${t('使用作品撤销 / 重做')}</span>`}</div></header>
      ${!target && context.studio.production ? `<div class="music-bank"><label>${t('本地渲染连接')} <select data-render-connection><option value="">${t('请选择已配置的采样渲染连接')}</option>${renderConnections.map(connection => `<option value="${html(connection.id)}" ${connection.id === renderConnectionId ? 'selected' : ''}>${html(connection.name)}</option>`).join('')}</select></label>${button(t('检查本地渲染输入'), 'prepare-source-render', !renderConnectionId)}${button(t('提交本地渲染'), 'submit-source-render', !renderPlanId)}${renderTaskId ? button(t('在制作中审阅'), 'review-source-render') : ''}<span class="field-help">${t('当前作品作者源形成新的冻结任务；完成后在制作页审阅候选。')}</span></div>` : ''}
      <p class="field-help">${t('主体约 {body} 秒；成品约 {total} 秒', { body: durations.bodySeconds.toFixed(2), total: durations.totalSeconds.toFixed(2) })}${durations.loopSeconds !== null ? ` · ${t('循环范围约 {seconds} 秒', { seconds: durations.loopSeconds.toFixed(2) })}` : ` · ${t('含 {seconds} 秒尾音', { seconds: score.render.tailSeconds })}`}</p>
      <div class="music-parameters">${field(t('曲名'), 'title', score.title, 'text')}${field(t('速度 BPM'), 'tempo', score.tempo[0]!.bpm, 'number', 'min="20" max="300" step="1"')}${field(t('每小节拍数'), 'beats', score.meter.beats, 'number', 'min="1" max="16"')}
        <label class="authoring-field"><span>${t('拍号分母')}</span><select data-field="unit">${[1, 2, 4, 8, 16].map(unit => `<option ${unit === score.meter.unit ? 'selected' : ''}>${unit}</option>`).join('')}</select></label>
        ${field(t('时长 / 小节'), 'bars', bars, 'number', 'min="1" step="1"')}<label class="music-check"><input data-field="loop" type="checkbox" ${score.loop ? 'checked' : ''}>${t('循环 BGM')}</label>
      </div>
      <div class="music-bank"><label>${t('采样音色')} <select data-field="bank" aria-label="${t('采样音色')}"><option value="ms-basic" ${pendingBank === 'ms-basic' ? 'selected' : ''}>MS Basic · ${t('轻量')} SF3 · 49 MiB</option><option value="musescore-general-hq" ${pendingBank === 'musescore-general-hq' ? 'selected' : ''}>MuseScore General HQ 0.2.1 · SF2 · 467 MiB</option>${statuses.filter(item => !['ms-basic', 'musescore-general-hq'].includes(item.descriptor.id)).map(item => `<option value="${html(item.descriptor.id)}" ${item.descriptor.id === pendingBank ? 'selected' : ''}>${html(item.descriptor.name)} · ${t('自备')} ${item.descriptor.format.toUpperCase()}</option>`).join('')}</select></label>
        ${button(pendingBank !== score.soundbank.id ? t('审阅并切换音色') : t('读取乐器目录'), 'load-bank', loading)}${button(t('安装所选音色'), 'install-bank', loading || !soundbanks)}
        <span class="field-help">${selectedStatus ? selectedStatus.installed ? t('已安装') : t('尚未安装') : t('检查本机安装')} · ${instruments.length ? t('{count} 个实际预设', { count: instruments.length }) : t('尚未读取乐器目录')}</span></div>
      ${pendingBank !== score.soundbank.id ? `<p class="music-notice">${html(t('切换将把整曲音色从 {from} 改为 {to}。保留乐器身份；新包缺少的乐器需在音轨属性中明确重映射，再重新试听、计划。', { from: bankName(score.soundbank.id), to: bankName(pendingBank) }))}</p>` : ''}
      <details><summary>${t('导入自备 SF2 / SF3 音色')}</summary><div class="music-actions">${button(t('选择音色文件'), 'choose-bank', !soundbanks)}<span class="field-help">${html(importPath || t('明确选择本机文件，填写来源与许可后再导入'))}</span></div><div class="music-parameters"><label class="authoring-field"><span>${t('音色名称')}</span><input data-import="name" value="${html(importName)}"></label><label class="authoring-field"><span>${t('来源')}</span><input data-import="source" value="${html(importSource)}"></label></div><label class="authoring-field"><span>${t('许可和署名资料')}</span><textarea data-import="license" rows="3">${html(importLicense)}</textarea></label>${button(t('导入并读取实际目录'), 'import-bank', !soundbanks)}</details>
      <nav class="music-segments" aria-label="${t('乐曲分段')}">${score.segments.map(item => `<button type="button" data-segment="${html(item.id)}" aria-pressed="${item.id === selectedSegment}">${html(item.name)} <small>${html(tickPosition(score, item.startTick))} → ${html(tickPosition(score, item.endTick))}</small></button>`).join('')}${button(t('添加分段'), 'add-segment')}</nav>
      <div class="music-workspace"><aside class="music-tracks" aria-label="${t('音轨列表')}"><div class="music-section-title">${t('音轨')} ${button(t('添加音轨'), 'add-track', score.tracks.length >= 16)}</div>${score.tracks.map(item => `<button type="button" class="music-track" data-track="${html(item.id)}" aria-pressed="${item.id === current.id}"><strong>${html(item.name)}</strong><span>${html(instruments.find(instrument => instrument.id === item.instrumentId)?.name ?? t('乐器目录未就绪'))}</span><small>${t('{count} 个音符', { count: item.notes.length })}</small></button>`).join('')}</aside>
      <div class="music-roll-area"><div class="music-roll-toolbar"><span>${t('钢琴卷帘 · 双击添加，拖动移动，右侧调整长度；Esc 取消拖动')}</span><label>${t('量化')} <select aria-label="${t('量化')}" data-field="snap">${[1, 2, 4].map(value => `<option value="${score.ppq / value}" ${snap === score.ppq / value ? 'selected' : ''}>1/${value * 4}</option>`).join('')}</select></label></div>
        <div class="music-roll" data-roll><svg viewBox="0 0 ${pianoWidth} ${pianoHeight}" width="${pianoWidth}" height="${pianoHeight}" role="group" aria-label="${html(t('{track}音符编辑', { track: current.name }))}"><rect data-grid x="0" y="28" width="${pianoWidth}" height="${pianoHeight - 28}" fill="var(--workbench-editor,var(--background))"/>
          ${Array.from({ length: high - low + 1 }, (_, index) => { const pitch = high - index, y = yFor(pitch); return `<rect x="0" y="${y}" width="${pianoWidth}" height="${rowHeight}" fill="${[1, 3, 6, 8, 10].includes(pitch % 12) ? 'var(--muted-foreground)' : 'transparent'}" opacity=".06" pointer-events="none"/><line x1="0" x2="${pianoWidth}" y1="${y}" y2="${y}" stroke="var(--border)" pointer-events="none"/>${pitch % 12 === 0 ? `<text x="4" y="${y + 10}" class="music-axis" pointer-events="none">${noteName(pitch)}</text>` : ''}`; }).join('')}
          ${Array.from({ length: Math.ceil(score.durationTicks / score.ppq) + 1 }, (_, beat) => { const x = beat * score.ppq / score.durationTicks * pianoWidth; return `<line x1="${x}" x2="${x}" y1="20" y2="${pianoHeight}" stroke="var(--border)" stroke-width="${beat % score.meter.beats === 0 ? 2 : 1}" pointer-events="none"/>${beat % score.meter.beats === 0 ? `<text x="${x + 4}" y="15" class="music-axis">${Math.floor(beat / score.meter.beats) + 1}</text>` : ''}`; }).join('')}
          ${current.notes.map(item => { const x = item.startTick / score.durationTicks * pianoWidth, width = Math.max(8, item.durationTicks / score.durationTicks * pianoWidth), y = yFor(item.pitch); return `<g data-note="${html(item.id)}" data-focus="note-${html(item.id)}" tabindex="0" role="button" aria-label="${html(t('{pitch} {position} 力度 {velocity}', { pitch: noteName(item.pitch), position: tickPosition(score, item.startTick), velocity: item.velocity }))}"><rect data-body x="${x}" y="${y + 1}" width="${width}" height="${Math.max(7, rowHeight - 2)}" rx="2" fill="var(--primary)" opacity="${selectedNote === item.id ? 1 : .7}" stroke="${selectedNote === item.id ? 'var(--foreground)' : 'none'}"/><rect data-resize x="${x + width - 7}" y="${y + 1}" width="7" height="${Math.max(7, rowHeight - 2)}" fill="transparent" cursor="ew-resize"/></g>`; }).join('')}
          <line data-playhead x1="0" x2="0" y1="20" y2="${pianoHeight}" stroke="var(--foreground)" stroke-width="2" pointer-events="none"/>
        </svg></div><label class="music-playhead">${t('播放位置')} <input type="range" data-field="position" min="0" max="${duration}" step="0.05" value="0"><output data-time>${t('{current} / {duration} 秒', { current: '0.0', duration: duration.toFixed(1) })}</output></label></div>
      <aside class="music-inspector" aria-label="${t('音轨与音符属性')}"><h3>${t('音轨属性')}</h3>${field(t('音轨名称'), 'track-name', current.name, 'text')}
        <label class="authoring-field"><span>${t('乐器')}</span><select data-field="instrument" ${!instruments.length ? 'disabled' : ''}>${!selectedInstrument ? `<option value="${html(current.instrumentId)}">${html(current.instrumentId)} · ${t('需要定位')}</option>` : ''}${instruments.map(item => `<option value="${html(item.id)}" ${item.id === current.instrumentId ? 'selected' : ''}>${html(item.name)}${item.drum ? ` · ${t('鼓组')}` : ''}</option>`).join('')}</select></label>
        ${field(t('音量'), 'volume', current.volume, 'range', 'min="0" max="127"')}${field(t('声像（64 居中）'), 'pan', current.pan, 'range', 'min="0" max="127"')}
        ${button(t('删除音轨'), 'remove-track', score.tracks.length <= 1)}<h3>${t('选中音符')}</h3>${note ? `${field(t('音高 MIDI'), 'pitch', note.pitch, 'number', 'min="0" max="127"')}${field(t('起点 tick'), 'note-start', note.startTick, 'number', 'min="0"')}${field(t('时值 tick'), 'note-duration', note.durationTicks, 'number', 'min="1"')}${field(t('力度'), 'velocity', note.velocity, 'range', 'min="1" max="127"')}${button(t('删除音符'), 'remove-note')}` : `<p class="field-help">${t('选择音符后调整音高、节奏与力度；方向键微调，Delete 删除，Esc 取消拖动。')}</p>`}
        <details><summary>${t('分段与循环范围')}</summary>${field(t('分段名称'), 'segment-name', segment.name, 'text')}${field(t('分段起点 tick'), 'segment-start', segment.startTick)}${field(t('分段终点 tick'), 'segment-end', segment.endTick)}${score.loop ? field(t('循环起点 tick'), 'loop-start', score.loop.startTick) + field(t('循环终点 tick'), 'loop-end', score.loop.endTick) : ''}</details>
      </aside></div>
      <details class="music-controls"><summary>${t('表现控制与渲染 · {count} 个控制事件', { count: current.controls.length })}</summary><div class="music-parameters"><label>${t('控制')} <select data-control="controller">${(selectedInstrument?.controllers ?? [1, 7, 10, 11, 64, 91, 93]).map(controller => `<option value="${controller}">${html(controllerNames[controller] ? t(controllerNames[controller] as MusicTextKey) : `CC${controller}`)}</option>`).join('')}</select></label><label>tick <input data-control="tick" type="number" value="0" min="0"></label><label>${t('数值')} <input data-control="value" type="number" value="100" min="0" max="127"></label>${button(t('添加控制'), 'add-control')}</div>
        <ul>${current.controls.map((event, index) => `<li>${html(tickPosition(score, event.tick))} · ${html(controllerNames[event.controller] ? t(controllerNames[event.controller] as MusicTextKey) : `CC${event.controller}`)} ${event.value} <button data-remove-control="${index}" type="button">${t('移除')}</button></li>`).join('')}</ul>
        <div class="music-parameters">${field(t('渲染增益'), 'gain', score.render.gain, 'number', 'min="0.01" max="1" step="0.05"')}${field(t('尾音 / 秒'), 'tail', score.render.tailSeconds, 'number', 'min="0" max="10" step="0.5"')}<label class="music-check"><input type="checkbox" data-field="reverb" ${score.render.reverb ? 'checked' : ''}>${t('混响')}</label><label class="music-check"><input type="checkbox" data-field="chorus" ${score.render.chorus ? 'checked' : ''}>${t('合唱')}</label><label>${t('循环尾音')} <select data-field="loop-tail"><option value="wrap" ${score.render.loopTail === 'wrap' ? 'selected' : ''}>${t('回卷至循环起点')}</option><option value="cut" ${score.render.loopTail === 'cut' ? 'selected' : ''}>${t('结束截断')}</option></select></label></div>
      </details>
      <details class="music-writing"><summary>${t('由描述写谱 · 使用已有大模型连接')}</summary><p class="field-help">${t('先审阅实际提示与连接，再明确发送一次请求。结果保留原文，校验通过后由你采用为新草稿；渲染另行计划。')}</p>
        <div class="music-parameters"><label>${t('写谱风格（可选）')} <select data-writing="preset"><option value="">${t('自定义 · 按本次描述')}</option>${musicWritingPresets.map(item => `<option value="${item.id}" ${item.id === preset ? 'selected' : ''}>${t(item.name as MusicTextKey)}</option>`).join('')}</select></label><label>${t('大模型连接')} <select data-writing="connection"><option value="">${t('请选择已有文字连接')}</option>${connections.map(item => `<option value="${html(item.id)}" ${item.id === writingConnectionId ? 'selected' : ''}>${html(item.name)} · ${html(item.model)}</option>`).join('')}</select></label>${button(t('刷新连接'), 'connections')}</div>
        <label class="authoring-field"><span>${t('场景、情绪与风格')}</span><textarea data-writing="description" rows="3">${html(writingDescription)}</textarea></label>
        <div class="music-actions">${button(t('检查实际输入'), 'prepare-writing', !instruments.length || !writingConnectionId)}${button(t('发送一次写谱请求'), 'submit-writing', !writingPlanId)}${button(t('读取写谱结果'), 'refresh-writing', !writingTaskId)}${button(t('取消写谱任务'), 'cancel-writing', !writingTaskId)}</div>
        <p class="field-help">${html(planSummary)}</p><details><summary>${t('实际发送提示与任务身份')}</summary><pre class="music-prompt">${html(promptView || t('检查实际输入后在此审阅完整 system 与用户文本。'))}</pre><p>${t('任务')} ${html(writingTaskId || t('尚未发送'))}</p></details>
        <label class="authoring-field"><span>${t('写谱原文 / 手动修正')}</span><textarea data-writing="raw" rows="6" spellcheck="false">${html(writingRaw)}</textarea></label>${button(t('校验并采用乐谱'), 'apply-writing', !writingRaw.trim())}
      </details>
      <details${invalidSourceJson ? ' open' : ''}><summary>${t('乐谱 JSON 与精确音色资料')}</summary><textarea data-score-json rows="8" spellcheck="false" aria-label="${t('乐谱 JSON')}">${html(invalidSourceJson ?? JSON.stringify(score, null, 2))}</textarea>${button(t('校验并应用 JSON'), 'apply-json')}<p class="field-help">${html(selectedStatus?.descriptor.sourceUrl ?? '')}</p>${selectedStatus?.descriptor.notices.map(notice => `<details><summary>${html(notice.name)}</summary><pre class="music-prompt">${html(notice.text)}</pre></details>`).join('') ?? ''}</details>
      <p data-status role="${initial.ok ? 'status' : 'alert'}" class="music-status">${html(status)}</p>
    </section>`;
    root.querySelector<HTMLElement>('[data-roll]')!.scrollLeft = scroll;
    if (focused) root.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    root.querySelectorAll<HTMLElement>('[data-track]').forEach(element => { element.onclick = () => { selectedTrack = element.dataset.track!; selectedNote = ''; render(); }; });
    root.querySelectorAll<HTMLElement>('[data-segment]').forEach(element => { element.onclick = () => { selectedSegment = element.dataset.segment!; render(); }; });
    root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(element => { element.onclick = () => { void action(element.dataset.action!).catch(error => showStatus(error instanceof Error ? error.message : String(error), true)); }; });
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]').forEach(element => { element.onchange = () => { void editField(element.dataset.field!, element); }; });
    root.querySelectorAll<HTMLTextAreaElement | HTMLSelectElement>('[data-writing]').forEach(element => { element.oninput = () => {
      const key = element.dataset.writing; if (key === 'description') writingDescription = element.value; if (key === 'raw') { writingRaw = element.value; root.querySelector<HTMLButtonElement>('[data-action="apply-writing"]')!.disabled = !writingRaw.trim(); }
      if (key === 'preset') preset = element.value; if (key === 'connection') writingConnectionId = element.value;
      if (key !== 'raw') { writingPlanId = ''; root.querySelector<HTMLButtonElement>('[data-action="submit-writing"]')!.disabled = true; root.querySelector<HTMLButtonElement>('[data-action="prepare-writing"]')!.disabled = !instruments.length || !writingConnectionId; }
    }; });
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-import]').forEach(element => { element.oninput = () => { if (element.dataset.import === 'name') importName = element.value; if (element.dataset.import === 'source') importSource = element.value; if (element.dataset.import === 'license') importLicense = element.value; }; });
    const renderer = root.querySelector<HTMLSelectElement>('[data-render-connection]'); if (renderer) renderer.onchange = () => { renderConnectionId = renderer.value; renderPlanId = ''; render(); };
    root.querySelectorAll<HTMLElement>('[data-remove-control]').forEach(element => { element.onclick = () => { void change(next => next.tracks.find(item => item.id === current.id)!.controls.splice(Number(element.dataset.removeControl), 1)); }; });
    const svg = root.querySelector<SVGSVGElement>('svg')!;
    svg.ondblclick = event => { if (!(event.target instanceof SVGElement) || !event.target.hasAttribute('data-grid')) return;
      const point = coordinates(event, svg), pitch = Math.max(0, Math.min(127, high - Math.floor((point.y - 28) / rowHeight))), startTick = Math.max(0, Math.round(point.x / pianoWidth * score.durationTicks / snap) * snap);
      const id = crypto.randomUUID(); selectedNote = id; void change(next => next.tracks.find(item => item.id === current.id)!.notes.push({ id, pitch, startTick, durationTicks: Math.min(snap, score.durationTicks - startTick), velocity: 90 })); };
    root.querySelectorAll<SVGGElement>('[data-note]').forEach(element => {
      element.onpointerdown = event => { if (target?.readonly || saving || loading || event.button !== 0) return; event.preventDefault(); cancelGesture?.(); const original = current.notes.find(item => item.id === element.dataset.note)!;
        selectedNote = original.id; const origin = coordinates(event, svg), resize = event.target instanceof SVGElement && event.target.hasAttribute('data-resize');
        const body = element.querySelector<SVGRectElement>('[data-body]')!; element.setPointerCapture(event.pointerId); root.querySelector<HTMLElement>(`[data-note="${CSS.escape(original.id)}"]`)?.focus(); let next = structuredClone(original), finished = false;
        element.onpointermove = move => { if (move.pointerId !== event.pointerId) return; const point = coordinates(move, svg), delta = Math.round((point.x - origin.x) / pianoWidth * score.durationTicks / snap) * snap;
          next = { ...original, ...(resize ? { durationTicks: Math.max(snap, Math.min(score.durationTicks - original.startTick, original.durationTicks + delta)) }
            : { startTick: Math.max(0, Math.min(score.durationTicks - original.durationTicks, original.startTick + delta)), pitch: Math.max(0, Math.min(127, original.pitch - Math.round((point.y - origin.y) / rowHeight))) }) };
          body.setAttribute('x', String(next.startTick / score.durationTicks * pianoWidth)); body.setAttribute('y', String(yFor(next.pitch) + 1)); body.setAttribute('width', String(Math.max(8, next.durationTicks / score.durationTicks * pianoWidth))); };
        const cleanup = () => { if (finished) return; finished = true; element.onpointermove = null; element.onpointerup = null; element.onpointercancel = null; element.onlostpointercapture = null;
          document.removeEventListener('keydown', keydown, true); if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId); cancelGesture = undefined; };
        const finish = (cancelled: boolean) => { if (finished) return; cleanup();
          const changed = next.startTick !== original.startTick || next.pitch !== original.pitch || next.durationTicks !== original.durationTicks;
          if (!cancelled && changed) void change(value => { Object.assign(value.tracks.find(item => item.id === current.id)!.notes.find(item => item.id === original.id)!, next); });
          else { render(); if (cancelled) showStatus(t('拖动已取消，音符保持原状')); } };
        const keydown = (key: KeyboardEvent) => { if (key.key === 'Escape') { key.preventDefault(); key.stopPropagation(); finish(true); } };
        cancelGesture = cleanup; document.addEventListener('keydown', keydown, true);
        element.onpointerup = up => { if (up.pointerId === event.pointerId) finish(false); };
        element.onpointercancel = cancel => { if (cancel.pointerId === event.pointerId) finish(true); }; element.onlostpointercapture = () => finish(true);
      };
      element.onkeydown = event => { const note = current.notes.find(item => item.id === element.dataset.note)!; selectedNote = note.id;
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Backspace', 'Enter'].includes(event.key)) return; event.preventDefault();
        if (event.key === 'Enter') { render(); return; }
        void change(next => { const selected = next.tracks.find(item => item.id === current.id)!, value = selected.notes.find(item => item.id === note.id)!;
          if (['Delete', 'Backspace'].includes(event.key)) selected.notes = selected.notes.filter(item => item.id !== note.id);
          else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') value.pitch = Math.max(0, Math.min(127, value.pitch + (event.key === 'ArrowUp' ? 1 : -1)));
          else if (event.shiftKey) value.durationTicks = Math.max(snap, value.durationTicks + (event.key === 'ArrowRight' ? snap : -snap));
          else value.startTick = Math.max(0, value.startTick + (event.key === 'ArrowRight' ? snap : -snap)); });
      };
    });
  }
  const coordinates = (event: MouseEvent | PointerEvent, svg: SVGSVGElement) => { const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY; return point.matrixTransform(svg.getScreenCTM()!.inverse()); };
  async function editField(key: string, element: HTMLInputElement | HTMLSelectElement) {
    const value = element.value, numeric = Number(value), currentId = track().id;
    if (key === 'snap') { snap = numeric; return; }
    if (key === 'position') { preview.seek(numeric); return; }
    if (loading) return;
    if (key === 'bank') { pendingBank = value as typeof pendingBank; render(); return; }
    if (element instanceof HTMLInputElement && element.type === 'number' && (!value.trim() || !element.reportValidity())) return;
    await change(next => {
      const current = next.tracks.find(item => item.id === currentId)!, note = current.notes.find(item => item.id === selectedNote), segment = next.segments.find(item => item.id === selectedSegment) ?? next.segments[0]!;
      if (key === 'title') next.title = value;
      else if (key === 'tempo') next.tempo[0]!.bpm = numeric;
      else if (key === 'beats') next.meter.beats = numeric;
      else if (key === 'unit') next.meter.unit = numeric;
      else if (key === 'bars') { const previous = next.durationTicks; next.durationTicks = Math.round(numeric * next.ppq * next.meter.beats * 4 / next.meter.unit);
        if (next.loop?.endTick === previous) next.loop.endTick = next.durationTicks; if (next.segments.at(-1)?.endTick === previous) next.segments.at(-1)!.endTick = next.durationTicks; }
      else if (key === 'loop') next.loop = (element as HTMLInputElement).checked ? { startTick: 0, endTick: next.durationTicks } : null;
      else if (key === 'track-name') current.name = value;
      else if (key === 'instrument') current.instrumentId = value;
      else if (key === 'volume' || key === 'pan') current[key] = numeric;
      else if (key === 'pitch' && note) note.pitch = numeric;
      else if (key === 'note-start' && note) note.startTick = numeric;
      else if (key === 'note-duration' && note) note.durationTicks = numeric;
      else if (key === 'velocity' && note) note.velocity = numeric;
      else if (key === 'segment-name') segment.name = value;
      else if (key === 'segment-start') segment.startTick = numeric;
      else if (key === 'segment-end') segment.endTick = numeric;
      else if (key === 'loop-start' && next.loop) next.loop.startTick = numeric;
      else if (key === 'loop-end' && next.loop) next.loop.endTick = numeric;
      else if (key === 'gain') next.render.gain = numeric;
      else if (key === 'tail') next.render.tailSeconds = numeric;
      else if (key === 'reverb' || key === 'chorus') next.render[key] = (element as HTMLInputElement).checked;
      else if (key === 'loop-tail') next.render.loopTail = value as 'wrap' | 'cut';
    });
  }
  async function loadBank() {
    loading = true; showStatus(t('正在读取实际音色与乐器目录…'));
    try {
      const resolved = soundbanks ? await soundbanks.resolve({ id: pendingBank, version: '0.1.0' }) : soundBankKeys[pendingBank] ? await context.studio.runtimeDependencies?.resolve(soundBankKeys[pendingBank]!) : undefined;
      if (!resolved?.ok) throw new Error(resolved && !resolved.ok ? resolved.error.message : t('采样音色宿主不可用'));
      try {
        const response = await fetch(resolved.value.url); if (!response.ok) throw new Error(t('无法读取已安装音色文件'));
        const bytes = await response.arrayBuffer(), parsed = await readSoundBank(bytes); if (disposed) return;
        instruments = parsed.instruments; soundbank = bytes;
        if (score.soundbank.id !== pendingBank) await change(next => { next.soundbank.id = pendingBank; });
        status = t('已读取 {count} 个预设。请审阅配器、试听并重新计划渲染。', { count: instruments.length });
      } finally { if ('release' in resolved.value && typeof resolved.value.release === 'function') resolved.value.release(); }
    } finally { loading = false; render(); }
  }
  async function action(action: string) {
    if (loading && !['stop', 'pause'].includes(action)) return;
    const current = track();
    if (action === 'play') { if (!soundbank) { await loadBank(); if (!soundbank) return; } loading = true; showStatus(t('使用当前乐谱与音色准备试听…'));
      try { await preview.play(score, soundbank, instruments, workletUrl); showStatus(t('正在试听当前乐谱；修改后需重新试听与计划')); } finally { loading = false; } }
    else if (action === 'pause') { if (preview.playing) preview.pause(); else await preview.resume(); }
    else if (action === 'stop') { await preview.stop(); showStatus(t('试听已停止')); }
    else if (action === 'undo' || action === 'redo') { const from = action === 'undo' ? history.undo : history.redo, to = action === 'undo' ? history.redo : history.undo, previous = from.pop();
      if (previous) { to.push(structuredClone(score)); if (!await apply(previous, action)) { from.push(previous); to.pop(); } } }
    else if (action === 'load-bank') await loadBank();
    else if (action === 'choose-bank') { const selected = await soundbanks!.chooseFile(); if (!selected.ok) throw new Error(selected.error.message); if (selected.value) { importPath = selected.value; render(); } }
    else if (action === 'import-bank') { if (!soundbanks) throw new Error(t('音色导入服务不可用')); const imported = await soundbanks.import({ path: importPath, name: importName, license: importLicense, sourceUrl: importSource }); if (!imported.ok) throw new Error(imported.error.message);
      const listed = await soundbanks.list(); if (listed.ok) statuses = listed.value; pendingBank = imported.value.descriptor.id; await loadBank(); }
    else if (action === 'install-bank') { if (!soundbanks) throw new Error(t('音色安装服务不可用')); loading = true; showStatus(t('正在安装所选音色，请稍候；此操作只下载明确选择的包…'));
      try { const installed = await soundbanks.install({ id: pendingBank, version: '0.1.0' }); if (!installed.ok) throw new Error(installed.error.message); const listed = await soundbanks.list(); if (listed.ok) statuses = listed.value; status = t('音色安装完成，请读取乐器目录'); }
      finally { loading = false; render(); } }
    else if (action === 'add-track') { const id = crypto.randomUUID(); await change(next => next.tracks.push({ id, name: t('音轨 {count}', { count: next.tracks.length + 1 }), instrumentId: instruments.find(item => !item.drum)?.id ?? 'melodic:0:0:0', volume: 100, pan: 64, notes: [], controls: [] })); selectedTrack = id; render(); }
    else if (action === 'remove-track') await change(next => { next.tracks = next.tracks.filter(item => item.id !== current.id); selectedTrack = next.tracks[0]!.id; });
    else if (action === 'remove-note') await change(next => { next.tracks.find(item => item.id === current.id)!.notes = current.notes.filter(item => item.id !== selectedNote); selectedNote = ''; });
    else if (action === 'add-segment') { const id = crypto.randomUUID(); await change(next => next.segments.push({ id, name: t('分段 {count}', { count: next.segments.length + 1 }), startTick: 0, endTick: next.durationTicks })); selectedSegment = id; render(); }
    else if (action === 'add-control') { const read = (key: string) => Number(root.querySelector<HTMLInputElement>(`[data-control="${key}"]`)!.value);
      await change(next => next.tracks.find(item => item.id === current.id)!.controls.push({ tick: read('tick'), controller: read('controller'), value: read('value') })); }
    else if (action === 'apply-json') { const parsed = parseGeneratedMusicScore(root.querySelector<HTMLTextAreaElement>('[data-score-json]')!.value); if (!parsed.ok) throw new Error(parsed.issues.map(issue => issue.message).join('\n')); await apply(parsed.value); }
    else if (action === 'connections') { const result = await context.studio.production?.connections(); if (!result?.ok) throw new Error(result && !result.ok ? result.error.message : t('制作服务不可用')); connections = (result.value as unknown as ConnectionConfig[]).filter(item => item.purposes.includes('text')); render(); }
    else if (action === 'prepare-source-render') {
      const connection = renderConnections.find(item => item.id === renderConnectionId); if (!connection) throw new Error(t('请选择实际采样渲染连接'));
      const scope = context.studio.scope?.read(), sourceVersions = scope?.versions ?? [];
      if(!context.studio.production?.prepareOperation)throw new Error(t('制作服务不可用'));
      const result=await context.studio.production.prepareOperation({operation:operationId,connectionId:connection.id,usage:'bgm',name:`${score.title} · ${t('作者源渲染')}`,fields:{score:json(score)},sourceVersions});
      if (!result.ok) throw new Error(result.error.message); const plan = result.value as unknown as { planId: string; issues: { severity: string; message: string }[] };
      renderPlanId = plan.issues.some(issue => issue.severity === 'error') ? '' : plan.planId; status = musicError(locale, plan.issues.map(issue => issue.message).join('\n')) || t('已冻结「{title}」的乐谱、音色和渲染设置；一次本地执行，提交后产生新候选。', { title: score.title }); render();
    } else if (action === 'submit-source-render') { const submitted = await context.studio.production!.submit(renderPlanId); if (!submitted.ok) throw new Error(submitted.error.message);
      renderTaskId = (submitted.value as unknown as { id: string }).id; renderPlanId = ''; status = t('已提交本地渲染，可在制作页取消和审阅候选。'); render();
    } else if (action === 'review-source-render') { const result = await context.studio.results?.show({ kind: 'task', taskId: renderTaskId }); if (result && !result.ok) throw new Error(result.error.message); }
    else if (action === 'prepare-writing') {
      const connection = connections.find(item => item.id === writingConnectionId); if (!connection) throw new Error(t('请选择已有文字连接'));
      const input = assembleMusicWritingInput(score, instruments, preset, writingDescription); promptView = `${t('连接')}：${connection.name}\n${t('模型')}：${connection.model}\n\nSYSTEM\n${input.system}\n\nUSER\n${input.messages[0]!.text}`;
      if(!context.studio.production?.prepareOperation)throw new Error('统一文字准备端口未连接');
      const result = await context.studio.production.prepareOperation({operation:writingOperationId,connectionId:connection.id,usage:'bgm',name:`${score.title} · ${t('写谱')}`,fields:{score:json(score),instruments:json(instruments),presetId:preset,description:writingDescription},sourceVersions:context.studio.scope?.read().versions??[]});
      if (!result.ok) throw new Error(result.error.message); const plan = result.value as unknown as { planId: string; issues: { severity: string; message: string }[]; sendSummary: { requests: number; textCharacters: number; destination: string }[] };
      writingPlanId = plan.issues.some(issue => issue.severity === 'error') ? '' : plan.planId; planSummary = musicError(locale, plan.issues.map(issue => issue.message).join('\n')) || plan.sendSummary.map(item => t('{requests} 次请求 · {characters} 字符 · {destination}', { requests: item.requests, characters: item.textCharacters, destination: item.destination })).join('；'); render();
    } else if (action === 'submit-writing') {
      if (!writingPlanId) throw new Error(t('请先检查实际输入')); const result = await context.studio.production!.submit(writingPlanId); if (!result.ok) throw new Error(result.error.message);
      writingTaskId = (result.value as unknown as { id: string }).id; writingPlanId = ''; status = t('写谱任务已发送；有效乐谱将自动生成本地试听候选。'); render();
    } else if (action === 'refresh-writing') {
      const tasks = await context.studio.production!.tasks(); if (!tasks.ok) throw new Error(tasks.error.message);
      const task = (tasks.value as unknown as { id: string; items: { state: string; candidateIds: string[]; issues: { message: string }[] }[] }[]).find(task => task.id === writingTaskId);
      const item = task?.items[0]; if (!item) throw new Error(t('写谱任务不存在'));
      const candidateId = item.candidateIds.at(-1); if (!candidateId) { showStatus(item.issues.map(issue => issue.message).join('；') || t('写谱任务状态：{state}', { state: musicTaskState(locale, item.state) })); return; }
      const result = await context.studio.production!.candidate(candidateId); if (!result.ok) throw new Error(result.error.message);
      writingRaw = (result.value as unknown as { content: { text: string } }).content.text; writingCandidateId = candidateId; status = t('原文已保留；校验并采用后进入当前草稿。'); render();
    } else if (action === 'cancel-writing') { const result = await context.studio.production!.cancel(writingTaskId); if (!result.ok) throw new Error(result.error.message); showStatus(t('已取消写谱任务，已有完整候选保留')); }
    else if (action === 'apply-writing') { const parsed = parseGeneratedMusicScore(writingRaw); if (!parsed.ok) throw new Error(parsed.issues.map(issue => issue.message).join('\n'));
      parsed.value.origin = { kind: 'llm', ...(writingTaskId ? { taskId: writingTaskId } : {}), ...(writingCandidateId ? { candidateId: writingCandidateId } : {}) }; await apply(parsed.value); }
  }
  render();
  if (soundbanks) void soundbanks.list().then(result => { if (!disposed && result.ok) { statuses = result.value; render(); } });
  if (!target && context.studio.production) void context.studio.production.connections().then(result => { if (!disposed && result.ok) { renderConnections = (result.value as unknown as ConnectionConfig[]).filter(connection => connection.providerKey === musicRenderOperation.providerKey && connection.purposes.includes(operationId)); render(); } });
  let frame = 0; const tick = () => { if (disposed) return; const seconds = preview.currentTime, duration = tickToSeconds(score, score.durationTicks);
    const position = root.querySelector<HTMLInputElement>('[data-field="position"]'); if (position && document.activeElement !== position) position.value = String(seconds);
    const output = root.querySelector('output[data-time]'); if (output) output.textContent = t('{current} / {duration} 秒', { current: seconds.toFixed(1), duration: duration.toFixed(1) });
    const playhead = root.querySelector<SVGLineElement>('[data-playhead]'), svg = root.querySelector('svg'); if (playhead && svg) { const x = seconds / duration * svg.viewBox.baseVal.width; playhead.setAttribute('x1', String(x)); playhead.setAttribute('x2', String(x)); }
    frame = requestAnimationFrame(tick); }; frame = requestAnimationFrame(tick);
  const dispose = () => { if (disposed) return; disposed = true; if (target) writingSessions.set(target.draftId, { description: writingDescription, preset, raw: writingRaw, candidateId: writingCandidateId, taskId: writingTaskId, planId: writingPlanId, connectionId: writingConnectionId, prompt: promptView, summary: planSummary });
    context.signal.removeEventListener('abort', dispose); cancelGesture?.(); cancelAnimationFrame(frame); void preview.stop(); root.replaceChildren(); };
  context.signal.addEventListener('abort', dispose, { once: true }); return dispose;
}
