import { DiagnosticError, issueDetails, issueFromError, localizeIssue, type Json, type SoundBankStatus } from '@galcraft/contracts';
import type { FieldEditorContribution } from '@galcraft/plugins/contracts';
import { readSoundBank, type MusicInstrument } from './catalog.js';
import { musicConstraintConflicts, parseMusicConstraints, scoreDurations, type MusicConstraints } from './constraints.js';
import { createMusicScore, parseGeneratedMusicScore } from './score.js';
import { musicWritingPresets } from './prompts.js';
import { workstationStyles } from './workstation-style.js';
type Context = Parameters<FieldEditorContribution['mount']>[1];
const html = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Uses the same native authoring controls and semantic tokens as the score workstation. */
export function mountMusicWritingEditor(root: HTMLElement, context: Context) {
  const target = context.target;
  if (!target) return () => {};
  const t = (zh: string, en: string, ja: string) => context.locale === 'en' ? en : context.locale === 'ja' ? ja : zh;
  const fields = structuredClone(target.fields);
  let referenceText = fields.score ? JSON.stringify(fields.score, null, 2) : '', referenceError = '', referenceTechnical = '';
  const referenceErrorId = `music-reference-${crypto.randomUUID()}`;
  let statuses: SoundBankStatus[] = [], instruments: MusicInstrument[] = [], disposed = false, loading = false, saving = false, status = '', error = false;
  let revision = target.revision;
  const reference = () => fields.score ? parseGeneratedMusicScore(JSON.stringify(fields.score)) : null;
  const bank = () => (fields.soundbank ?? (reference()?.ok ? (reference() as {ok:true;value:ReturnType<typeof createMusicScore>}).value.soundbank : null)) as {id:string;version:'0.1.0'} | null;
  const constraints = () => (fields.musicConstraints ?? {}) as MusicConstraints;
  const announce = (message: string, failed = false) => { status = message; error = failed; const node = root.querySelector<HTMLElement>('[data-writing-status]'); if (node) { node.textContent = message; node.setAttribute('role', failed ? 'alert' : 'status'); } };
  const diagnostic = document.createElement('details'), heading = document.createElement('summary'), technical = document.createElement('pre'); diagnostic.hidden = true; heading.textContent = t('诊断详情', 'Diagnostic details', '診断の詳細'); technical.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto'; diagnostic.append(heading, technical);
  const reportError = (problem: unknown, catalog = false) => { const issue = issueFromError(problem, 'M09'); diagnostic.hidden = false; technical.textContent = issueDetails(issue); announce(catalog ? t('音源目录无法读取。请重新选择已安装音源，再点击“读取实际乐器”；本次输入已保留。', 'The soundbank catalog could not be read. Select an installed soundbank and choose Read actual instruments; your input is retained.', '音源一覧を読み込めません。インストール済みの音源を選び直し「実際の楽器を読む」を選択してください。入力は保持されています。') : localizeIssue(issue, context.locale), true); };
  function readReference(focus: boolean) {
    const input = root.querySelector<HTMLTextAreaElement>('[data-writing="score"]');
    referenceText = input?.value ?? referenceText;
    const checked = referenceText.trim() ? parseGeneratedMusicScore(referenceText) : null;
    referenceError = checked && !checked.ok ? t('参考谱不完整或格式有误；请修正 JSON 或移除参考谱。', 'The reference score is incomplete or invalid. Correct its JSON or remove the reference.', '参照楽譜が不完全または無効です。JSONを修正するか参照を削除してください。') : '';
    referenceTechnical = checked && !checked.ok ? checked.error.message : '';
    input?.setAttribute('aria-invalid', String(!!referenceError));
    const message = root.querySelector<HTMLElement>('[data-reference-error]'), details = root.querySelector<HTMLDetailsElement>('[data-reference-technical]');
    if (message) message.textContent = referenceError;
    if (details) { details.hidden = !referenceError; details.querySelector('pre')!.textContent = referenceTechnical; }
    if (referenceError) {
      announce(referenceError, true);
      if (focus && input) { input.closest('details')!.open = true; input.focus(); }
      return false;
    }
    if (checked?.ok) fields.score = checked.value as unknown as Json; else delete fields.score;
    return true;
  }
  async function save(focus = false) {
    if (saving || disposed || target!.readonly) return;
    if (!readReference(focus)) return;
    if (!String(fields.description ?? '').trim()) { announce(t('填写创作描述后应用本次输入。', 'Enter a creative description to apply this input.', '制作の説明を入力して適用してください。')); return; }
    saving = true;
    try {
      const current = reference();
      const problems = musicConstraintConflicts(parseMusicConstraints(fields.musicConstraints), instruments, (fields.render ?? (current?.ok ? current.value.render : createMusicScore().render)) as ReturnType<typeof createMusicScore>['render'], current?.ok ? current.value.ppq : 480);
      if (problems.length && instruments.length) throw new Error(problems.join('\n'));
      const saved = await target!.commit({ expectedRevision: revision, fields, references: target!.references });
      if (!saved.ok) throw new DiagnosticError(saved.error);
      revision = (saved.value as {revision:number}).revision;
      diagnostic.hidden = true; announce(t('本次输入已保存；检查制作输入后执行。', 'Input saved. Review the production input to execute.', '入力を保存しました。制作入力を確認して実行してください。'));
    } catch (problem) { reportError(problem); }
    finally { saving = false; }
  }
  async function readCatalog() {
    instruments = [];
    const selected = bank();
    if (!selected || !context.studio.soundbanks) return;
    loading = true; render();
    try {
      const resolved = await context.studio.soundbanks.resolve(selected); if (!resolved.ok) throw new DiagnosticError(resolved.error);
      const response = await fetch(resolved.value.url); if (!response.ok) throw new Error(`soundbank: HTTP ${response.status}`);
      const actual = await readSoundBank(await response.arrayBuffer()); instruments = actual.instruments;
      status = t(`已读取 ${instruments.length} 个实际乐器。`, `${instruments.length} actual instruments loaded.`, `${instruments.length} 個の実際の楽器を読み込みました。`); error = false;
    } catch (problem) { reportError(problem, true); }
    finally { loading = false; if (!disposed) render(); }
  }
  function render() {
    if (disposed) return;
    const c = constraints(), selected = bank(), score = reference(), duration = score?.ok ? scoreDurations(score.value) : null;
    const numeric = (label: string, key: string, value: unknown, attrs = '') => `<label class="authoring-field"><span>${html(label)}</span><input type="number" data-constraint="${key}" value="${html(value)}" ${attrs}></label>`;
    root.innerHTML = `<style>${workstationStyles}</style><section class="gc-music gc-music-writing-editor" aria-label="${t('写谱输入', 'Score writing input', '作曲の入力')}">
      <p class="field-help">${t('用创作描述开始；风格、参考谱和明确音乐约束均可选。音源必须来自已安装的真实目录。', 'Start with a creative description. Style, reference score and explicit constraints are optional. Choose an actual installed soundbank.', '制作の説明から始めます。作風、参照楽譜、明示的な制約は任意です。実際にインストールされた音源を選んでください。')}</p>
      <label class="authoring-field"><span>${t('创作描述', 'Creative description', '制作の説明')}</span><textarea data-writing="description" rows="4" required>${html(fields.description)}</textarea></label>
      <div class="music-parameters"><label class="authoring-field"><span>${t('写谱风格（可选）', 'Writing style (optional)', '作風（任意）')}</span><select data-writing="presetId"><option value="">${t('自定义 · 按本次描述', 'Custom · follow this description', 'カスタム・今回の説明に従う')}</option>${musicWritingPresets.map(item => `<option value="${item.id}" ${fields.presetId === item.id ? 'selected' : ''}>${html(item.id === 'ambient' ? t('宁静叙事', item.name, '穏やかな物語') : item.id === 'dramatic' ? t('情绪推进', item.name, '感情の展開') : t('轻快日常', item.name, '軽快な日常'))} (${item.id})</option>`).join('')}</select></label>
      <label class="authoring-field"><span>${t('本次音源', 'Selected soundbank', '今回の音源')}</span><select data-writing="soundbank"><option value="">${t('请选择已安装音源', 'Choose an installed soundbank', 'インストール済み音源を選択')}</option>${statuses.map(item => `<option value="${html(item.descriptor.id)}" ${selected?.id === item.descriptor.id ? 'selected' : ''}>${html(item.descriptor.name)}${item.availability !== 'ready' ? ` · ${t('不可用', 'Unavailable', '利用不可')}` : ''}</option>`).join('')}</select></label><button type="button" data-action="catalog" ${loading || !selected ? 'disabled' : ''}>${t('读取实际乐器', 'Read actual instruments', '実際の楽器を読む')}</button></div>
      <details><summary>${t('明确音乐约束（可选）', 'Explicit music constraints (optional)', '明示的な音楽制約（任意）')}</summary><p class="field-help">${t('空白项交由创作决定。参考谱与已修改字段不自动成为硬限制。', 'Leave blank to let composition decide. Reference material and edited fields do not become hard requirements.', '空欄は作曲に委ねます。参照楽譜と編集項目は自動的に必須条件になりません。')}</p>
      <div class="music-parameters">${numeric(t('固定 BPM', 'Fixed BPM', '固定 BPM'), 'fixedBpm', c.fixedBpm, 'min="20" max="300" step="any"')}${numeric(t('每小节拍数', 'Beats per bar', '小節の拍数'), 'meter.beats', c.meter?.beats, 'min="1" max="16"')}<label class="authoring-field"><span>${t('拍号分母', 'Beat unit', '拍子の分母')}</span><select data-constraint="meter.unit"><option value="">${t('不限制', 'Unspecified', '指定なし')}</option>${[1,2,4,8,16].map(unit=>`<option ${c.meter?.unit === unit ? 'selected' : ''}>${unit}</option>`).join('')}</select></label>${numeric(t('主体小节数', 'Body bars', '本体の小節数'), 'bars', c.bars, 'min="1"')}
      ${numeric(t('音乐主体 / 秒', 'Music body / seconds', '本体 / 秒'), 'bodySeconds', c.bodySeconds, 'min="0" step="any"')}${numeric(t('成品总长 / 秒', 'Total output / seconds', '完成音声 / 秒'), 'totalSeconds', c.totalSeconds, 'min="0" step="any"')}${numeric(t('允许误差 / 秒', 'Allowed error / seconds', '許容誤差 / 秒'), 'toleranceSeconds', c.toleranceSeconds, 'min="0" step="any"')}</div>
      <p class="field-help">${t('主体时长不含结束尾音；成品总长按实际循环裁切和尾音规则计算。精确长度仅允许时基与采样精度。', 'Body duration excludes the ending tail. Total output follows the actual loop crop and tail rules. Exact lengths allow only tick and sample precision.', '本体の長さは末尾の余韻を含みません。完成音声は実際のループと余韻の規則で計算します。')}</p>
      <div class="music-parameters"><label class="authoring-field"><span>${t('循环', 'Loop', 'ループ')}</span><select data-constraint="loop.enabled"><option value="">${t('不限制', 'Unspecified', '指定なし')}</option><option value="true" ${c.loop?.enabled === true ? 'selected' : ''}>${t('开启 · 默认全曲', 'Enabled · full score by default', '有効・既定は全曲')}</option><option value="false" ${c.loop?.enabled === false ? 'selected' : ''}>${t('关闭', 'Disabled', '無効')}</option></select></label>${numeric(t('循环起点 tick', 'Loop start tick', 'ループ開始 tick'), 'loop.startTick', c.loop?.startTick, 'min="0"')}${numeric(t('循环终点 tick', 'Loop end tick', 'ループ終了 tick'), 'loop.endTick', c.loop?.endTick, 'min="1"')}</div>
      <div class="music-parameters">${(['requiredInstruments','allowedInstruments','excludedInstruments'] as const).map((key,index)=>`<label class="authoring-field"><span>${[t('必需乐器 · 实际含音符', 'Required · with actual notes', '必須・実際の音符あり'),t('仅允许这些乐器', 'Allow only these instruments', 'これらの楽器のみ許可'),t('排除乐器', 'Excluded instruments', '除外する楽器')][index]}</span><select data-instruments="${key}" multiple size="5" ${!instruments.length ? 'disabled' : ''}>${instruments.map(item=>`<option value="${html(item.id)}" ${c[key]?.includes(item.id) ? 'selected' : ''}>${html(item.name)}</option>`).join('')}</select></label>`).join('')}</div><p class="field-help">${t('读取实际乐器后选择身份；Ctrl 可多选。必需乐器可与其他合法乐器并用，允许名单限定全部配器。', 'Read actual instruments, then select identities (Ctrl for multiple). Required instruments may coexist with others; the allowed list limits the complete arrangement.', '実際の楽器を読んで選択します（Ctrl で複数選択）。必須楽器は他と併用でき、許可リストは全体を制限します。')}</p></details>
      <details><summary>${t('创作参考谱（可选）', 'Creative reference score (optional)', '参照楽譜（任意）')}</summary><p class="field-help">${duration ? t(`主体约 ${duration.bodySeconds.toFixed(2)} 秒；成品约 ${duration.totalSeconds.toFixed(2)} 秒${duration.loopSeconds !== null ? `；循环范围约 ${duration.loopSeconds.toFixed(2)} 秒` : ''}。这些值只描述参考谱。`, `Reference: body ${duration.bodySeconds.toFixed(2)} s; total ${duration.totalSeconds.toFixed(2)} s; loop ${duration.loopSeconds?.toFixed(2) ?? 'none'}. These are reference facts.`, `参照：本体 ${duration.bodySeconds.toFixed(2)} 秒、完成 ${duration.totalSeconds.toFixed(2)} 秒。`) : t('尚无参考谱。直接按描述写谱。', 'No reference score. Compose from the description.', '参照楽譜はありません。説明から作曲します。')}</p><textarea data-writing="score" aria-invalid="${!!referenceError}" aria-describedby="${referenceErrorId}" rows="6" spellcheck="false" aria-label="${t('参考谱 JSON', 'Reference score JSON', '参照楽譜 JSON')}">${html(referenceText)}</textarea><p id="${referenceErrorId}" data-reference-error class="field-help">${html(referenceError)}</p><details data-reference-technical ${referenceError ? '' : 'hidden'}><summary>${t('技术详情', 'Technical details', '技術的な詳細')}</summary><pre class="music-prompt">${html(referenceTechnical)}</pre></details><button type="button" data-action="clear-score">${t('移除参考谱', 'Remove reference score', '参照楽譜を削除')}</button></details>
      <div class="music-actions"><button type="button" data-action="save" ${target!.readonly || saving ? 'disabled' : ''}>${t('应用本次输入', 'Apply this input', '今回の入力を適用')}</button></div><p data-writing-status role="${error ? 'alert' : 'status'}" class="music-status">${html(status)}</p></section>`;
    root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-constraint]').forEach(element => { element.onchange = () => {
      try { const value = structuredClone(constraints()) as Record<string,Json>, [key,child] = element.dataset.constraint!.split('.');
        if (child) { const part = { ...(value[key!] as Record<string,Json> ?? {}) }; if (element.value === '') delete part[child]; else part[child] = child === 'enabled' ? element.value === 'true' : Number(element.value); if (Object.keys(part).length) value[key!] = part; else delete value[key!]; }
        else if (element.value === '') delete value[key!]; else value[key!] = Number(element.value);
        fields.musicConstraints = value; void save();
      } catch (problem) { reportError(problem); }
    }; });
    root.querySelectorAll<HTMLSelectElement>('[data-instruments]').forEach(element => { element.onchange = () => { const value = { ...constraints() }; const chosen = [...element.selectedOptions].map(option=>option.value); if(chosen.length) value[element.dataset.instruments as keyof Pick<typeof value,'requiredInstruments'|'allowedInstruments'|'excludedInstruments'>] = chosen; else delete value[element.dataset.instruments as 'requiredInstruments']; fields.musicConstraints = value as Json; void save(); }; });
    root.querySelectorAll<HTMLTextAreaElement|HTMLSelectElement>('[data-writing]').forEach(element => { element.onchange = () => { const key = element.dataset.writing!;
      try { if (key === 'score') { referenceText = element.value; }
        else if (key === 'soundbank') { if(element.value) fields.soundbank = {id:element.value,version:'0.1.0'}; else delete fields.soundbank; delete fields.instruments; void readCatalog(); }
        else fields[key] = element.value;
        void save();
      } catch (problem) { reportError(problem); }
    }; });
    root.querySelector<HTMLButtonElement>('[data-action="save"]')!.onclick = () => { void save(true); };
    root.querySelector<HTMLButtonElement>('[data-action="catalog"]')!.onclick = () => { void readCatalog(); };
    root.querySelector<HTMLButtonElement>('[data-action="clear-score"]')!.onclick = () => { referenceText = ''; referenceError = ''; referenceTechnical = ''; delete fields.score; render(); void save(); };
    root.querySelector('.gc-music-writing-editor')!.append(diagnostic);
  }
  render();
  void context.studio.soundbanks?.list().then(result=>{if(disposed)return;if(result.ok){statuses=result.value;render();void readCatalog();}else reportError(new DiagnosticError(result.error),true);}).catch(problem=>{if(!disposed)reportError(problem,true);});
  return () => { disposed = true; root.replaceChildren(); };
}
