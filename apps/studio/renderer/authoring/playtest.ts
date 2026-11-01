import { domButton } from '../components/dom-button.js';
import { DebugRouteIntent, routeLabel, routeReason } from './debug-route-intent.js';
import { createId } from '@galcraft/contracts';
import { codeBlock } from '../components/code-block.js';
import { prepareNativeDialog } from '../components/motion.js';
import type { Position } from '@galcraft/contracts';
import type { AuthoringServices } from './controller.js';
import { openPlayerPreview, type StudioPlayer } from './player-preview.js';
import { designerText } from './designer-strings.js';
import { actionIcon } from '../components/action-icon.js';
import { previewEntries, resolvePreviewEntry } from '@galcraft/runtime';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Choice } from '../components/controls.js';

const createButton = domButton;
type Scenario = Extract<Parameters<StudioPlayer['session']['prepareSession']>[0]['source'], { kind: 'entry' }>['scenario'];
type DebugCommand = Parameters<StudioPlayer['session']['dispatchDebug']>[0]['command'];
export async function startPlaytest(parent: HTMLElement, services: AuthoringServices, target: Position | null, onReturn: () => void, locale = 'zh-CN', intent = new DebugRouteIntent(), entryId?: string) {
  const t = (value: string) => designerText(value, locale);
  const tri=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
  const button = (label: string, run: () => void) => createButton(t(label), run);
  const toolButton = (label:string, icon:string, run:()=>void) => { const item=button(label,run);item.prepend(actionIcon(icon));item.title=t(label);return item; };
  const compiled = await services.compilePreview?.();
  if (!compiled?.ok || !(compiled.value.snapshot ?? compiled.value.lastValid)) throw new Error(compiled && !compiled.ok ? compiled.error.message : '没有有效快照');
  const snapshot = compiled.value.snapshot ?? compiled.value.lastValid!;
  const root = document.createElement('section'); root.className = 'studio-playtest';
  const header = document.createElement('header'), surface = document.createElement('div'), status = document.createElement('div'); surface.className = 'playtest-surface';
  const label = document.createElement('span'); label.className='playtest-title';label.textContent = locale === 'en' ? 'Playtest' : locale === 'ja' ? 'テストプレイ' : '试玩';
  const transport=document.createElement('div');transport.className='playtest-controls';transport.setAttribute('role','group');transport.ariaLabel=tri('播放控制','Playback controls','再生操作');
  const tools=document.createElement('div');tools.className='playtest-tools';tools.setAttribute('role','group');tools.ariaLabel=tri('调试与记录','Debug and records','デバッグと記録');
  const runState=document.createElement('span');runState.className='playtest-run-state';
  header.append(label,transport,runState,tools); const diagnostics = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = locale === 'en' ? 'Debug state' : locale === 'ja' ? 'デバッグ状態' : '调试状态'; diagnostics.append(summary, status); root.append(header, surface, diagnostics); parent.append(root);
  const docs = await services.bridge.documents.list();
  const styles = docs.ok ? Object.assign({}, ...docs.value.map(doc => doc.files)) : {};
  const player = await openPlayerPreview(surface, services, snapshot, 'playtest', styles);
  let disposed = false;
  const close = () => { disposed = true; clearInterval(timer); entryRoot.unmount(); player.dispose(); dialog.remove(); root.remove(); onReturn(); };
  const returnButton=toolButton('返回编辑位置','back',close);returnButton.classList.add('playtest-return');header.prepend(returnButton);
  let selected = resolvePreviewEntry(snapshot, target, entryId ?? (target ? intent.previewEntryId : undefined), !!target && intent.previewEntrySceneId === target.sceneId); const entry = selected.entry;
  const scenario: Scenario = { schemaVersion: 1, id: createId(), name: '从此句试玩', projectId: snapshot.projectId,
    engineVersion: snapshot.engineVersion, pluginVersions: [snapshot.lock.engine, ...snapshot.lock.plugins, snapshot.lock.template],
    entry, target: target ?? entry, route: [], playerInputs: [], initialProgress: selected.initialProgress, pluginInitial: {}, externalPolicy: 'simulate' };
  let routeSource = intent.restore(snapshot, scenario, selected.key);
  const entryPicker = document.createElement('div'); entryPicker.className='playtest-entry'; const entryRoot = createRoot(entryPicker);
  const chooseEntry = (key: string) => { selected = resolvePreviewEntry(snapshot, target, key, true); intent.previewEntryId = selected.key; intent.previewEntrySceneId = target?.sceneId;
    scenario.entry = selected.entry; scenario.target = target ?? selected.entry; scenario.initialProgress = structuredClone(selected.initialProgress); scenario.route = []; scenario.playerInputs = []; scenario.pluginInitial = {};
    routeSource = intent.restore(snapshot, scenario, selected.key); drawEntry(); void prepare(); };
  const drawEntry = () => entryRoot.render(createElement(Choice, { label: tri('试玩入口', 'Playtest entry', 'テストプレイ入口'), value: selected.key,
    options: previewEntries(snapshot).map(item => ({ value: item.key, label: item.title })), onChange: chooseEntry })); drawEntry(); header.append(entryPicker);
  const routeStatus = document.createElement('span'); routeStatus.className = 'playtest-route-status'; header.append(routeStatus);
  let previousReport = '';
  const report = () => { if (disposed) return; const inspection = player.session.inspect();
    const paused=inspection?.status==='paused';
    pauseResume.replaceChildren(actionIcon(paused?'play':'pause'),document.createTextNode(t(paused?'继续':'暂停')));pauseResume.title=t(paused?'继续':'暂停');
    pauseResume.disabled=!inspection||['ended','error'].includes(inspection.status);stepButton.disabled=!paused;
    runState.textContent=inspection?tri(paused?'已暂停':'试玩中',paused?'Paused':'Playing',paused?'一時停止中':'テスト中'):player.view.navigation.page==='title'?tri('标题画面','Title screen','タイトル画面'):tri('等待开始','Ready to start','開始待ち');
    const text = JSON.stringify(inspection ? { snapshot: inspection.snapshotId, scene: inspection.state.position.sceneId,
      statement: inspection.state.position.statementId, route: inspection.state.route, variables: inspection.state.progress,
      status: inspection.status, issue: inspection.issue } : { status: '等待调试方案' }, null, 2); if (text !== previousReport) { previousReport = text; status.replaceChildren(codeBlock(text, 'json', locale)); } };
  const timer = setInterval(report, 500);
  const debugOutput = document.createElement('div');
  const debug = async (command: DebugCommand) => {
    const inspection = player.session.inspect(); if (!inspection) return;
    const result = await player.session.dispatchDebug({ requestId: createId(), sessionId: inspection.sessionId,
      expectedSequence: inspection.sequence, command });
    debugOutput.replaceChildren(codeBlock(JSON.stringify(result.ok ? result.value.condition ?? result.value.value ?? result.value : result.error, null, 2), 'json', locale));
    if (result.ok) { player.view.render(); report(); }
    return result;
  };
  const playback = (op:'pause'|'resume'|'step') => {
    const inspection = player.session.inspect(); if (!inspection) return;
    void player.session.dispatchDebug({ requestId: createId(), sessionId: inspection.sessionId, expectedSequence: inspection.sequence,
      command: { op } }).then(result => { if (!result.ok) status.textContent = result.error.message; else { player.view.render(); report(); } });
  };
  const pauseResume=toolButton('暂停','pause',()=>playback(player.session.inspect()?.status==='paused'?'resume':'pause'));pauseResume.classList.add('authoring-primary');
  const stepButton=toolButton('单步','step',()=>playback('step'));transport.append(pauseResume,stepButton);
  tools.append(toolButton('导出问题记录','download', () => {
    const panel=prepareNativeDialog(document.createElement('dialog'));panel.className='designer-dialog';
    const title=document.createElement('h2');title.textContent=t('导出问题记录');
    const field=document.createElement('label'),trace=document.createElement('input');trace.type='checkbox';trace.checked=true;
    field.append(trace,document.createTextNode(tri('附带当前执行轨迹','Include the current execution trace','現在の実行履歴を含める')));
    const footer=document.createElement('footer');footer.className='studio-dialog-footer dialog-actions';
    footer.append(button('取消',()=>panel.close()),button(tri('导出','Export','エクスポート'),()=>{
      const inspection = player.session.inspect();
      const blob = new Blob([JSON.stringify({ projectId: snapshot.projectId, engineVersion: snapshot.engineVersion, snapshotId: snapshot.snapshotId,
        target: scenario.target, scenario, source: inspection?.state.position, ...(trace.checked ? { trace: inspection?.trace } : {}) }, null, 2)], { type: 'application/json' });
      const uri = URL.createObjectURL(blob), link = document.createElement('a'); link.href = uri; link.download = 'playtest-issue.json'; link.click(); URL.revokeObjectURL(uri);panel.close();
    }));panel.append(title,field,footer);root.append(panel);panel.addEventListener('close',()=>panel.remove(),{once:true});panel.showModal();
  }));
  tools.prepend(toolButton('调试检查','debug', () => {
    const panel = prepareNativeDialog(document.createElement('dialog')); panel.className = 'designer-dialog';
    const heading = document.createElement('h2'); heading.textContent = t('当前会话检查'); panel.append(heading);
    for (const [scope, label] of [['variables','变量'],['stack','调用栈'],['stage','舞台'],['trace','执行轨迹']] as const)
      panel.append(button(label, () => { void debug({ op: 'inspect', scope }); }));
    const expression = document.createElement('input'); expression.ariaLabel=tri('调试表达式','Debug expression','デバッグ式');expression.placeholder=tri('例如 progress["变量 ID"]','e.g. progress["variable ID"]','例：progress["変数 ID"]');
    panel.append(expression, button('求值', () => { void debug({ op: 'evaluate', expression: expression.value }); }));
    const field = document.createElement('input'); field.ariaLabel = tri('条件字段','Condition field','条件フィールド'); field.value = 'when';
    panel.append(field, button('解释条件', () => { const token = player.session.inspect()?.token;
      if (token) void debug({ op: 'explainCondition', token, field: field.value }); }));
    for (const variable of snapshot.variables.filter(value => value.scope === 'progress')) {
      const label = document.createElement('label'); label.textContent = variable.name;
      const input = document.createElement('input'); input.value = String(player.session.inspect()?.state.progress[variable.id] ?? variable.initial);
      input.placeholder=tri('临时覆盖本次试玩中的变量值','Temporarily override this playtest variable','この試遊中の変数値を一時的に変更');
      input.ariaLabel = tri('调试变量','Debug variable','デバッグ変数')+' '+variable.name;
      label.append(input, button('修改试玩值', () => { void debug({ op: 'setVariable', scope: 'progress', id: variable.id,
        value: variable.type === 'number' ? Number(input.value) : variable.type === 'boolean' ? input.value === 'true' : input.value }); })); panel.append(label);
    }
    panel.append(debugOutput, button('关闭', () => panel.close())); root.append(panel);
    panel.addEventListener('close', () => panel.remove()); panel.showModal();
  }));
  const dialog = document.createElement('section'); dialog.className = 'playtest-route-editor'; dialog.hidden = true;
  const title = document.createElement('h2'); title.textContent = t('选择通往目标语句的实际路线'); dialog.append(title);
  const initialValues = document.createElement('details'); const initialTitle = document.createElement('summary'); initialTitle.textContent = tri('调试初值','Debug initial values','デバッグ初期値'); initialValues.append(initialTitle); dialog.append(initialValues);
  for (const variable of snapshot.variables.filter(variable => variable.scope === 'progress')) {
    const label = document.createElement('label'); label.textContent = variable.name;
    const input = document.createElement('input'); input.value = String(scenario.initialProgress[variable.id] ?? variable.initial); input.placeholder=tri('本次试玩的初值，不修改作品默认值','Initial value for this playtest; project defaults are unchanged','この試遊の初期値。作品の既定値は変更しません'); input.onchange = () => {
      const value = variable.type === 'number' ? Number(input.value) : variable.type === 'boolean' ? input.value === 'true' : input.value;
      scenario.initialProgress[variable.id] = value; routeSource = 'selected';
    }; label.append(input); initialValues.append(label);
  }
  const route = document.createElement('div'), errors = document.createElement('p'); dialog.append(route, errors);
  let preparedId: string | null = null;
  const revealRoute = () => { dialog.hidden = false; };
  const prepare = async () => {
    if (preparedId) player.session.disposePrepared(preparedId);
    const preparation = await intent.prepare(player.session, { snapshot, domain: player.data.domain, source: { kind: 'entry', scenario }, target: scenario.target, story: selected.story }, routeSource);
    const prepared = preparation.result; routeSource = preparation.source; errors.textContent = preparation.invalidated ? tri('原路线已失效，已重新检查。','The previous route was invalidated and checked again.','前のルートを再確認しました。') : '';
    if (!prepared.ok) { errors.textContent = prepared.error.message; revealRoute(); return; }
    preparedId = prepared.value.id; route.replaceChildren();
    if (!prepared.value.reached && prepared.value.state.wait?.kind === 'choice') {
      revealRoute();
      const state = prepared.value.state, wait = prepared.value.state.wait;
      const instruction = snapshot.scenes.flatMap(scene => scene.instructions).find(item => item.statementId === state.position.statementId)!;
      const options = (instruction.args as { options: { id: string; text: string }[] }).options;
      const message = document.createElement('p'); message.textContent = routeReason(prepared.value.routePreparation?.kind, locale); route.append(message);
      for (const option of options.filter(option => (prepared.value.routePreparation?.candidateOptionIds ?? wait.optionIds).includes(option.id))) route.append(button(option.text, () => {
        scenario.route = scenario.route.filter(item => !(item.statementId === instruction.statementId && item.occurrence === state.occurrence));
        scenario.route.push({ statementId: instruction.statementId, occurrence: state.occurrence, optionId: option.id }); routeSource = 'selected'; void prepare();
      }));
      return;
    }
    if (!prepared.value.reached && prepared.value.state.wait?.kind === 'input') {
      revealRoute();
      const state = prepared.value.state, input = document.createElement('input'); input.ariaLabel = tri('路线玩家输入','Player input for this route','このルートのプレイヤー入力');
      route.append(input, button('采用输入并继续', () => {
        scenario.playerInputs = scenario.playerInputs.filter(item => !(item.statementId === state.position.statementId && item.occurrence === state.occurrence));
        scenario.playerInputs.push({ statementId: state.position.statementId!, occurrence: state.occurrence, text: input.value }); routeSource = 'selected'; void prepare();
      })); return;
    }
    if (!prepared.value.reached) { revealRoute(); errors.textContent = tri('当前路线未到达目标；请选择可达目标或补齐玩家输入。','This route did not reach the target. Choose a reachable target or supply player input.','このルートは目標に到達しませんでした。到達可能な目標を選ぶか、プレイヤー入力を補ってください。'); return; }
    const started = await player.activatePreview(prepared.value);
    if (!started.ok) { errors.textContent = started.error.message; revealRoute(); return; }
    player.view.navigation.replace('story'); dialog.hidden = true; routeStatus.textContent = routeSource === 'selected' ? tri('已选择路线','Selected route','選択したルート') : tri('自动路线','Automatic route','自動ルート'); routeStatus.textContent += routeLabel(snapshot, scenario) ? ` · ${routeLabel(snapshot, scenario)}` : ''; report();
  };
  const importIssue = button('导入问题记录',()=>{void (async()=>{
    try {
      const file=await services.bridge.files?.readImport?.({purpose:'documents',extensions:['json'],title:tri('导入问题记录','Import playtest record','テストプレイ記録を読み込み')});if(!file)throw new Error('Local import selection is unavailable.');if(!file.ok)throw new Error(file.error.message);if(!file.value)return;
      const issue = JSON.parse(file.value.text); const incoming = issue.scenario as Scenario;
      if (incoming.schemaVersion !== 1 || incoming.projectId !== snapshot.projectId || incoming.engineVersion !== snapshot.engineVersion ||
        JSON.stringify(incoming.pluginVersions) !== JSON.stringify(scenario.pluginVersions)) throw new Error('问题记录的作品或依赖版本不匹配');
      Object.assign(scenario, incoming); routeSource = 'selected'; await prepare();
    } catch (error) { errors.textContent = String(error); }
  })(); });
  const advanced = document.createElement('details'); const advancedTitle = document.createElement('summary'); advancedTitle.textContent = locale === 'en' ? 'Advanced: import a playtest record (.json)' : locale === 'ja' ? '詳細：テストプレイ記録を読み込み (.json)' : '高级：导入试玩记录（.json）'; advanced.append(advancedTitle, importIssue); dialog.append(advanced, button('准备路线', () => { void prepare(); }), button('关闭', () => { dialog.hidden = true; }));
  root.append(dialog); dialog.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.isComposing) { dialog.hidden = true; returnButton.focus(); } });
  tools.append(toolButton(tri('更换路线','Change route','ルート変更'),'route', () => { revealRoute(); }), toolButton(tri('重新推导路线','Find route again','ルートを再確認'),'refresh', () => { intent.clear(); routeSource = 'automatic'; scenario.route = []; scenario.playerInputs = []; void prepare(); }));
  tools.append(toolButton('导入问题记录','upload', () => { if (!dialog.isConnected) root.append(dialog); revealRoute(); advanced.open = true; }));
  await prepare();
  return { player, scenario, close };
}
