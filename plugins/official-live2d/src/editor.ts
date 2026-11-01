import type { AssetEditorContext, AssetPreviewContext, GalCraftPlugin, PluginContext, StageInstance } from '@galcraft/plugins/contracts';
import { emptyContributions } from '@galcraft/plugins/contracts';
import { localizeIssue, issueDetails, issueFromError, type Diagnostic, type Json, type ResolvedAsset, type ResourceCapabilities } from '@galcraft/contracts';
import { pluginId } from './metadata.js';
import { stageProvider } from './runtime.js';

const record = (value: unknown): Record<string, Json> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Json> : {};
function inspector(root: HTMLElement, context: AssetEditorContext) {
  const t = (zh: string, en: string, ja: string) => context.locale === 'en' ? en : context.locale === 'ja' ? ja : zh;
  const asset = context.target.kind === 'asset';
  let value = structuredClone(record(context.value));
  const capabilities = context.resource?.variant.groupCapabilities ?? record(context.value).capabilities as ResourceCapabilities | undefined;
  const status = document.createElement('p'); status.className = 'field-help'; status.setAttribute('role', 'status');
  const errorDetails = document.createElement('details'), errorSummary = document.createElement('summary'), technical = document.createElement('pre'); errorDetails.hidden = true;
  errorSummary.textContent = t('诊断详情', 'Diagnostic details', '診断の詳細'); technical.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto'; errorDetails.append(errorSummary, technical); root.append(errorDetails);
  const report = (issue: Diagnostic) => { status.role = 'alert'; status.textContent = localizeIssue(issue, context.locale); errorDetails.hidden = false; technical.textContent = issueDetails(issue); };
  if (context.resource && context.studio.assets?.inspect) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'studio-button'; button.textContent = t('读取模型参数', 'Read model parameters', 'モデルのパラメーターを取得');
    button.disabled = context.target.readonly; button.onclick = async () => {
      button.disabled = true;
      try {
        const asset = await context.studio.assets!.read(context.resource!.assetId);
        if (!asset.ok) { report(asset.error); return; }
        if (asset.value.activeVariantId !== context.resource!.variant.id) { status.textContent = t('固定版本保留已有能力；请在素材页选择活动版本后读取。', 'The fixed version retains its capabilities. Inspect the active version in Assets.', '固定版は既存の機能を保持します。素材ページで有効な版を選んで取得してください。'); return; }
        const result = await context.studio.assets!.inspect!(asset.value.id); if (context.signal.aborted) return;
        if (!result.ok || !result.value) { if (!result.ok) report(result.error); else status.textContent = t('素材已移除', 'Asset removed', '素材は削除されました'); return; }
        const variant = result.value.variants.find(item => item.id === context.resource!.variant.id);
        if (variant) { root.replaceChildren(); inspector(root, { ...context, value, resource: { assetId: asset.value.id, variant } }); }
      } catch (error) { if (!context.signal.aborted) report(issueFromError(error, 'M09')); }
      finally { button.disabled = context.target.readonly; }
    }; root.append(button);
  }
  const commit = async (key: string, next?: Json) => {
    const changed = { ...value }; if (next === undefined) delete changed[key]; else changed[key] = next;
    try {
    const result = await context.commit(changed);
    if (context.signal.aborted) return;
    if (result.ok) value = changed;
    if (!result.ok) report(result.error); else { status.textContent = ''; status.role = 'status'; errorDetails.hidden = true; }
    } catch (error) { if (!context.signal.aborted) report(issueFromError(error, 'M09')); }
  };
  const row = (name: string, input: HTMLElement) => { const label = document.createElement('label'); label.className = 'authoring-field';
    const title = document.createElement('span'); title.textContent = name; label.append(title, input); root.append(label); };
  const select = (name: string, values: [string, string][], selected: string, change: (value: string) => void) => {
    const input = document.createElement('select'); input.ariaLabel = name; input.disabled = context.target.readonly;
    for (const [key, title] of values) { const option = document.createElement('option'); option.value = key; option.textContent = title; input.append(option); }
    input.value = selected; input.onchange = () => change(input.value); row(name, input); return input;
  };
  if (asset) {
    const summary = document.createElement('p'); summary.textContent = t('模型资源组的能力由精确插件和锁定 Core 读取。动作与口型在立绘指令中设置。', 'The exact plugin and locked Core inspect this model. Configure motion and lip sync in the figure command.', '指定バージョンのプラグインと Core がモデルの機能を取得します。動作とリップシンクは立ち絵コマンドで設定します。'); root.append(summary);
  } else if (capabilities) {
    const motion = record(value.motion);
    let loop: HTMLInputElement;
    select(t('动作', 'Motion', '動作'), [['', t('保持当前动作', 'Keep current motion', '現在の動作を保持')], ['stop', t('停止动作', 'Stop motion', '動作を停止')],
      ...capabilities.motions.map(item => [JSON.stringify([item.group, item.index]), item.name || `${item.group} ${item.index}`] as [string, string])],
    motion.op === 'stop' ? 'stop' : typeof motion.group === 'string' ? JSON.stringify([motion.group, motion.index]) : '', next => {
      loop.disabled = context.target.readonly || !next || next === 'stop';
      if (next === 'stop') void commit('motion', { op: 'stop' });
      else if (next) { const [group, index] = JSON.parse(next); void commit('motion', { op: 'play', group, index, loop: record(value.motion).loop ?? false }); }
      else void commit('motion');
    });
    const checkbox = (key: string, name: string, fallback = true) => { const input = document.createElement('input'); input.type = 'checkbox'; input.checked = value[key] === undefined ? fallback : !!value[key];
      input.disabled = context.target.readonly; input.onchange = () => { void commit(key, input.checked); }; row(name, input); };
    checkbox('blink', t('自动眨眼', 'Auto blink', '自動まばたき')); checkbox('breath', t('呼吸', 'Breathing', '呼吸')); checkbox('physics', t('物理', 'Physics', '物理演算'));
    loop = document.createElement('input'); loop.type = 'checkbox'; loop.checked = motion.loop === true; loop.disabled = context.target.readonly || motion.op !== 'play' || typeof motion.group !== 'string';
    loop.onchange = () => { void commit('motion', { ...record(value.motion), loop: loop.checked }); }; row(t('循环动作', 'Loop motion', '動作をループ'), loop);
    const expression = record(value.expression);
    select(t('表情', 'Expression', '表情'), [['', t('保持当前表情', 'Keep current expression', '現在の表情を保持')], ['__reset', t('重置表情', 'Reset expression', '表情をリセット')], ...capabilities.expressions.map(name => [name, name] as [string, string])],
      expression.op === 'reset' ? '__reset' : String(expression.name ?? ''), next => { void commit('expression', next === '__reset' ? { op: 'reset', name: null } : next ? { op: 'set', name: next } : undefined); });
    const lip = record(value.lip);
    select(t('口型', 'Lip sync', 'リップシンク'), [['off', t('关闭', 'Off', 'オフ')], ...(capabilities.capabilities.includes('amplitudeLip') ? [['basic', t('基础口型', 'Amplitude', '音量に合わせる')]] as [string, string][] : []),
      ...(capabilities.capabilities.includes('motionSync') ? [['motionSync', 'MotionSync']] as [string, string][] : [])], String(lip.mode ?? 'off'), mode => { void commit('lip', { ...record(value.lip), mode, gain: record(value.lip).gain ?? 1 }); });
    const numeric = (name: string, initial: number, min: number, max: number, change: (value: number) => void) => { const input = document.createElement('input'); input.type = 'number'; input.step = 'any'; input.min = String(min); input.max = String(max); input.value = String(initial); input.disabled = context.target.readonly;
      input.onchange = () => { if (input.value.trim() && input.reportValidity()) change(Number(input.value)); }; row(name, input); };
    numeric(t('口型增益', 'Lip gain', 'リップシンクの倍率'), Number(lip.gain ?? 1), 0, 10, gain => { void commit('lip', { ...record(value.lip), mode: record(value.lip).mode ?? 'off', gain }); });
    const gaze = record(value.gaze);
    select(t('视线', 'Gaze', '視線'), [['none', t('居中', 'Centered', '中央')], ['fixed', t('固定', 'Fixed', '固定')], ['pointer', t('跟随指针', 'Follow pointer', 'ポインターに追従')]], String(gaze.follow ?? 'none'), follow => { void commit('gaze', { ...record(value.gaze), follow, x: gaze.x ?? 0, y: gaze.y ?? 0 }); });
    for (const axis of ['x', 'y']) numeric(`${t('视线', 'Gaze', '視線')} ${axis.toUpperCase()}`, Number(gaze[axis] ?? 0), -1, 1, next => { void commit('gaze', { ...record(value.gaze), follow: record(value.gaze).follow ?? 'fixed', [axis]: next }); });
    for (const parameter of capabilities.parameters) numeric(parameter.id, Number(record(value.parameters)[parameter.id] ?? parameter.default), parameter.min, parameter.max,
      next => { void commit('parameters', { ...record(value.parameters), [parameter.id]: next }); });
  }
  const details = document.createElement('details'), heading = document.createElement('summary'); heading.textContent = t('模型能力', 'Model capabilities', 'モデルの機能'); details.append(heading);
  const description = document.createElement('p'); description.textContent = capabilities ? `${capabilities.parameters.length} ${t('参数', 'parameters', 'パラメーター')} · ${capabilities.motions.length} ${t('动作', 'motions', '動作')} · ${capabilities.expressions.length} ${t('表情', 'expressions', '表情')}` : t('模型能力尚未读取，请检查插件和锁定 SDK。', 'Model capabilities are unavailable. Check the plugin and locked SDK.', 'モデルの機能を取得できません。プラグインと指定バージョンの SDK を確認してください。'); details.append(description); root.append(details, status);
}
async function preview(root: HTMLElement, context: AssetPreviewContext, thumbnail = false) {
  const dependency = context.studio.runtimeDependencies;
  if (!dependency?.load) throw new Error('Cubism 外部运行时服务尚未就绪');
  const resource: ResolvedAsset = { assetId: context.source.kind === 'asset' ? context.source.assetId : context.source.candidateId,
    variantId: context.variant.id, kind: context.kind, entry: context.resource.entry,
    files: context.resource.files.map(({ path, bytes, mime }) => ({ path, bytes, mime })), metadata: context.variant.metadata,
    canvas: context.variant.canvas, provider: context.variant.groupCapabilities?.resolver ?? null, ...(context.variant.typeData ? { typeData: context.variant.typeData } : {}) };
  const unavailable = () => { throw new Error('预览上下文只允许读取当前资源组'); };
  const provider = await stageProvider({ pluginId, target: context.studio.target, domain: { projectId: context.studio.projectId, kind: 'sample', instance: 'asset-preview' },
    signal: context.signal,
    runtimeDependencies: { resolve: dependency.resolve, load: async key => { const result = await dependency.load!(key); if (result.ok) context.onDispose(result.value.release); return result; } },
    assets: { resolve: async () => ({ ok: true, value: resource, warnings: [] }), readBytes: (_resource, path) => context.resource.read(path), readText: async (_resource, path) => new TextDecoder().decode(await context.resource.read(path)) },
    documents: { read: unavailable, propose: unavailable }, pages: { open: unavailable }, log: () => {} } as PluginContext);
  context.onDispose(() => provider.dispose());
  const opened = await provider.create(resource, {}); if (!opened.ok) { provider.dispose(); throw new Error(opened.error.message); }
  const instance = opened.value; let frame = 0, previous = performance.now(), disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; cancelAnimationFrame(frame); instance.dispose(); provider.dispose(); };
  context.onDispose(dispose); if (context.signal.aborted) { dispose(); return; }
  const canvas = instance.renderSurface(); canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.objectFit = 'contain'; root.append(canvas);
  instance.pause(thumbnail);
  const tick = (now: number) => { if (context.signal.aborted) return; instance.update(Math.min(100, now - previous), 0); previous = now; frame = requestAnimationFrame(tick); };
  if (!thumbnail) frame = requestAnimationFrame(tick);
  return dispose;
}
export function createPlugin(): GalCraftPlugin {
  return { async activate() { const contributions = emptyContributions();
    contributions.assetEditors!.push({ key: `${pluginId}/inspector`, assetType: 'live2d', contexts: ['asset', 'command', 'instance'], mount: inspector });
    contributions.assetPreviews!.push({ key: `${pluginId}/preview`, assetType: 'live2d', mount: (root, context) => preview(root, context) });
    contributions.assetThumbnails!.push({ key: `${pluginId}/thumbnail`, assetType: 'live2d', mount: (root, context) => preview(root, context, true) });
    return contributions;
  }, async deactivate() {} };
}
