import { createId } from '@galcraft/contracts';
import type { DebugScenario, NativeAnimation, Position, PresentationState, Snapshot, StageObject } from '@galcraft/contracts';
import { StageCameraId, sampleObjectAnimation } from '@galcraft/stage';
import type { AuthoringServices } from './controller.js';
import { openPlayerPreview, type StudioPlayer } from './player-preview.js';
import { DebugRouteIntent, routeLabel, routeReason } from './debug-route-intent.js';
import { previewEntries, resolvePreviewEntry } from '@galcraft/runtime';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Choice } from '../components/controls.js';

/** The exact Player in an isolated preview domain, with explicit inspection and playback modes. */
export class MiniStage {
  readonly root = document.createElement('section');
  private surface = document.createElement('div');
  private status = document.createElement('p');
  private provenance = document.createElement('p');
  private route = document.createElement('div');
  private entryControl = document.createElement('div');
  private entryRoot = createRoot(this.entryControl);
  private player: StudioPlayer | null = null;
  private controls = document.createElement('div');
  private mode: 'inspection' | 'current' | 'playtest' = 'inspection';
  private muted = true;
  private target: Position | null = null;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private key = '';
  private animationBase: PresentationState | null = null;
  private animationQueue = Promise.resolve();
  private animationGeneration = 0;
  private animationPreview: { animation: NativeAnimation; timeMs: number; target: unknown } | null = null;
  private animationStatement: string | null = null;
  private highlightedObject: string | null = null;
  private design = { width: 1920, height: 1080 };
  highlightObject(id: string) { this.highlightedObject = id; this.drawHighlight(); }
  animationContext(rawTarget: unknown) {
    const target = rawTarget as { kind?: string; id?: string; station?: StageObject['station'] } | undefined;
    const object = this.animationBase?.objects.find(item => target?.kind === 'station' ? item.station === target.station : item.id === target?.id);
    return { stageWidth: this.design.width, station: object?.station ?? target?.station ?? 'center' as const };
  }
  animationTarget(rawTarget: unknown): StageObject | null {
    const target = rawTarget as { kind?: string; id?: string; station?: string } | undefined;
    const objects = this.animationBase?.objects.filter(item => target?.kind === 'station' ? item.station === target.station : item.id === target?.id) ?? [];
    return objects.length === 1 ? structuredClone(objects[0]!) : null;
  }
  objectAvailability(id: string, target: Position): 'present' | 'absent' | 'unknown' {
    if (this.root.dataset.stale !== 'false' || this.root.dataset.sceneId !== target.sceneId || this.root.dataset.statementId !== target.statementId || !this.animationBase) return 'unknown';
    return this.animationBase.objects.some(object => object.id === id) ? 'present' : 'absent';
  }
  private drawHighlight() {
    this.surface.querySelector('[data-animation-target-highlight]')?.remove();
    if (!this.highlightedObject || !this.player) return;
    const bounds = this.player.stage.objectBounds(this.highlightedObject); if (!bounds) { this.status.textContent = this.t('所选对象在当前预览路线中不可用；可定位来源检查。', 'The selected object is unavailable on this preview route. Locate its source to inspect it.', 'このプレビュールートには対象がありません。定義を確認してください。'); return; }
    const marker = document.createElement('div'); marker.dataset.animationTargetHighlight = this.highlightedObject;
    Object.assign(marker.style, { position: 'absolute', pointerEvents: 'none', border: '2px solid var(--primary)', boxSizing: 'border-box', zIndex: '5',
      left: `${bounds.x / this.design.width * 100}%`, top: `${bounds.y / this.design.height * 100}%`, width: `${bounds.width / this.design.width * 100}%`, height: `${bounds.height / this.design.height * 100}%` }); this.surface.append(marker);
  }
  sampleAnimation(animation: NativeAnimation, timeMs: number, rawTarget: unknown) {
    this.animationPreview = { animation, timeMs, target: rawTarget };
    const player = this.player, baseline = this.animationBase;
    const generation = ++this.animationGeneration;
    if (!player || !baseline) return Promise.resolve();
    const target = rawTarget as { kind?: string; id?: string; station?: string } | undefined;
    const state = structuredClone(baseline);
    if (target?.kind === 'stage' && state.camera) {
      const camera = sampleObjectAnimation({ id: StageCameraId, current: state.camera.current, defaults: state.camera.defaults, processes: [] }, animation, timeMs);
      state.camera = { current: camera.current, defaults: camera.defaults, processes: [] };
    } else state.objects = state.objects.map(object => (!target || target.kind === 'object' && object.id === target.id || target.kind === 'station' && object.station === target.station) ? sampleObjectAnimation({ ...object, processes: [] }, animation, timeMs, { ...object, processes: [] }) : object);
    this.animationQueue = this.animationQueue.catch(() => {}).then(async () => {
      if (this.player !== player || generation !== this.animationGeneration) return;
      const owner = { sessionId: createId(), occurrence: 1, statementId: createId() };
      const prepared = await player.stage.prepareStage(owner.sessionId, state);
      if (!prepared.ok) { this.status.textContent = prepared.error.message; return; }
      if (this.player !== player || generation !== this.animationGeneration) { player.stage.discardPrepared(prepared.value.id); return; }
      player.stage.commitStage(prepared.value.id, owner);
      this.drawHighlight();
    });
    return this.animationQueue;
  }
  private pending: { player: StudioPlayer; surface: HTMLElement } | null = null;
  private resize: ResizeObserver;
  constructor(private services: AuthoringServices, private preview?: (snapshot: Snapshot) => void, private locale='zh-CN', private intent = new DebugRouteIntent()) {
    this.root.className = 'studio-mini-stage'; this.surface.className = 'studio-mini-player';
    const title = document.createElement('strong'); title.textContent = this.t('当前指令舞台','Current command stage','現在のコマンドの舞台');
    this.provenance.className = 'mini-stage-source';
    this.entryControl.className = 'mini-entry';
    this.controls.className = 'mini-stage-controls gc-actions';
    const action = (label: string, run: () => void) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.onclick = run; this.controls.append(button); return button; };
    for (const [mode, label] of [['inspection', this.t('定位检查','Inspect position','位置を確認')], ['current', this.t('播放当前演出','Play current performance','現在の演出を再生')], ['playtest', this.t('从此处试玩','Playtest from here','ここから試遊')]] as const)
      action(label, () => { if(!this.target)return;this.mode=mode;this.update(`${this.key}:${mode}:${this.generation}`,this.target); });
    action(this.t('暂停／继续','Pause / resume','一時停止／再開'),()=>{const player=this.player;if(!player||this.mode==='inspection')return;player.session.setPreviewPaused(player.session.inspect()?.status!=='paused');player.view.render();});
    action(this.t('停止','Stop','停止'),()=>{if(!this.target)return;this.mode='inspection';this.update(`${this.key}:stop`,this.target);});
    const sound=action(this.t('声音：关','Sound: off','音声：オフ'),()=>{this.muted=!this.muted;this.player?.setPreviewMuted(this.mode==='inspection'||this.muted);sound.textContent=this.muted?this.t('声音：关','Sound: off','音声：オフ'):this.t('声音：开','Sound: on','音声：オン');sound.ariaPressed=String(!this.muted);});sound.ariaPressed='false';
    this.status.setAttribute('role', 'status'); this.root.append(title, this.entryControl, this.controls, this.surface, this.status, this.provenance, this.route);
    this.resize = new ResizeObserver(() => { const bounds = this.surface.getBoundingClientRect();
      this.player?.stage.setViewport({ x: 0, y: 0, width: bounds.width, height: bounds.height }); });
    this.resize.observe(this.surface);
  }
  private t(zh:string,en:string,ja:string){return this.locale==='en'?en:this.locale==='ja'?ja:zh;}
  update(key: string, target: Position | null, message?: string) {
    if(this.target?.sceneId!==target?.sceneId||this.target?.statementId!==target?.statementId)this.mode='inspection';
    this.target=target;
    if (this.animationStatement !== target?.statementId) { this.animationPreview = null; this.animationStatement = target?.statementId ?? null; }
    if (key === this.key) return; this.key = key; const generation = ++this.generation;
    if (this.timer) clearTimeout(this.timer);
    this.clearPending(); this.route.replaceChildren(); this.root.dataset.stale = String(Boolean(this.player));
    if(this.player){this.player.session.setPreviewPaused(true);this.player.view.render();}
    this.status.textContent = message ?? (target ? this.t('正在准备当前指令…','Preparing the current command…','現在のコマンドを準備中…') : this.t('选择一条指令查看舞台效果','Select a command to preview its stage','コマンドを選択して舞台をプレビュー'));
    if (this.player) this.status.textContent += this.t(' · 保留上次有效画面', ' · showing the last valid stage', '・前回の有効な舞台を表示');
    if (target) this.timer = setTimeout(() => { void this.prepare(target, generation); }, 180);
  }
  private clearPending() { if (this.pending) { this.pending.player.dispose(); this.pending.surface.remove(); this.pending = null; } }
  dispose() { this.entryRoot.unmount(); this.clearPending(); this.generation++; if (this.timer) clearTimeout(this.timer); this.player?.dispose(); this.player = null; this.resize.disconnect(); }
  private async prepare(target: Position, generation: number) {
    const current = () => generation === this.generation;
    try {
      let compiled = await this.services.compilePreview?.(); if (!current()) return;
      // Another preview can supersede a compile request without a document error.
      if (compiled?.ok && !compiled.value.current && !compiled.value.issues.length) { compiled = await this.services.compilePreview?.(); if (!current()) return; }
      if (!compiled?.ok || !compiled.value.snapshot || !compiled.value.current) {
        this.status.textContent = this.t('当前内容存在问题，修复下方问题后更新预览。','Fix the listed issues to update the preview.','表示された問題を修正するとプレビューを更新できます。') + (this.player ? this.t(' 保留上次有效画面。',' Showing the last valid stage.','前回の有効な舞台を表示。') : ''); return;
      }
      const snapshot = structuredClone(compiled.value.snapshot); this.preview?.(snapshot);
      this.design = snapshot.project.canvas;
      snapshot.project.display.titleMusic = null; snapshot.project.display.titleVideo = null;
      const documents = await this.services.bridge.documents.list(); if (!current()) return;
      if (!documents.ok) throw new Error(documents.error.message);
      const styles = Object.assign({}, ...documents.value.map(doc => doc.files));
      const surface = document.createElement('div'); surface.className = 'studio-mini-player'; surface.inert = this.mode !== 'playtest';
      surface.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
      surface.style.width = `${this.surface.getBoundingClientRect().width}px`;
      surface.style.aspectRatio = `${snapshot.project.canvas.width}/${snapshot.project.canvas.height}`; this.root.append(surface);
      const player = await openPlayerPreview(surface, this.services, snapshot, 'playtest', styles).catch(error => { surface.remove(); throw error; });
      if (!current()) { player.dispose(); surface.remove(); return; } this.pending = { player, surface };
      player.stage.pause(true);
      player.setPreviewMuted(this.mode==='inspection'||this.muted);
      const selected = resolvePreviewEntry(snapshot, target, this.intent.previewEntryId, this.intent.previewEntrySceneId === target.sceneId), entry = selected.entry;
      this.entryRoot.render(createElement(Choice, { label: this.t('预览入口', 'Preview entry', 'プレビュー入口'), value: selected.key,
        options: previewEntries(snapshot).map(item => ({ value: item.key, label: item.title })),
        onChange: value => { this.intent.previewEntryId = value; this.intent.previewEntrySceneId = target.sceneId; this.update(`${this.key}:${value}`, target); } }));
      const scenario: DebugScenario = { schemaVersion: 1, id: createId(), name: this.t('当前指令舞台','Current command stage','現在のコマンドの舞台'), projectId: snapshot.projectId,
        engineVersion: snapshot.engineVersion, pluginVersions: [snapshot.lock.engine, ...snapshot.lock.plugins, snapshot.lock.template],
        entry, target, route: [], playerInputs: [], initialProgress: selected.initialProgress, pluginInitial: {}, externalPolicy: 'simulate' };
      let source = this.intent.restore(snapshot, scenario, selected.key);
      let preparedId: string | null = null;
      const prepareRoute = async () => {
        if (!current()) return;
        if (preparedId) player.session.disposePrepared(preparedId);
        const preparation = await this.intent.prepare(player.session, { snapshot, domain: player.data.domain, source: { kind: 'entry', scenario }, target, evaluateTarget: true, targetPhase: this.mode === 'inspection' ? 'after' : 'before', story: selected.story }, source);
        const prepared = preparation.result; source = preparation.source;
        if (!current()) return;
        if (!prepared.ok) throw new Error(prepared.error.message);
        preparedId = prepared.value.id; this.route.replaceChildren();
        const state = prepared.value.state;
        const button = (label: string, action: () => void) => { const item = document.createElement('button'); item.type = 'button'; item.textContent = label; item.onclick = action; this.route.append(item); };
        const retry = () => { void prepareRoute().catch(error => { if (current()) this.status.textContent = String(error); }); };
        if (!prepared.value.reached) {
          this.status.textContent = (preparation.invalidated ? this.t('原路线已失效。','Previous route is no longer valid. ','前のルートは無効です。') : '') + (routeReason(prepared.value.routePreparation?.kind, this.locale)) + (this.player ? this.t(' · 保留上次有效画面',' · showing the last valid stage','・前回の有効な舞台を表示') : '');
          if (state.wait?.kind === 'choice') {
            const wait = state.wait, instruction = snapshot.scenes.flatMap(scene => scene.instructions).find(item => item.statementId === state.position.statementId)!;
            for (const option of (instruction.args as { options: {id:string;text:string}[] }).options.filter(option => (prepared.value.routePreparation?.candidateOptionIds ?? wait.optionIds).includes(option.id)))
              button(option.text, () => {
                scenario.route = scenario.route.filter(item => item.statementId !== instruction.statementId || item.occurrence !== state.occurrence);
                scenario.route.push({ statementId: instruction.statementId, occurrence: state.occurrence, optionId: option.id }); source = 'selected'; retry();
              });
          } else if (state.wait?.kind === 'input') {
            const input = document.createElement('input'); input.ariaLabel = this.t('路线玩家输入','Player input for this route','ルートのプレイヤー入力'); input.placeholder=this.t('填写这条路线需要的玩家输入','Enter the player response needed for this route','このルートに必要なプレイヤーの回答を入力'); this.route.append(input);
            button(this.t('采用输入','Use input','入力を使用'), () => {
              scenario.playerInputs = scenario.playerInputs.filter(item => item.statementId !== state.position.statementId || item.occurrence !== state.occurrence);
              scenario.playerInputs.push({ statementId: state.position.statementId!, occurrence: state.occurrence, text: input.value }); source = 'selected'; retry();
            });
          } else this.status.textContent = this.t('当前路线未到达此指令；可从此句试玩检查路线。','This route does not reach the command. Playtest from here to inspect it.','このルートでは到達できません。ここから試遊して確認できます。');
          if (scenario.route.length || scenario.playerInputs.length) button(this.t('重新选择路线','Choose another route','ルートを選び直す'), () => { this.intent.clear(); source = 'automatic'; scenario.route = []; scenario.playerInputs = []; retry(); });
          return;
        }
        let animationBase = state.presentation;
        const instruction = snapshot.scenes.flatMap(scene => scene.instructions).find(item => item.statementId === target.statementId);
        if (this.mode === 'inspection' && ['setTransform','setAnimation','setComplexAnimation','setTempAnimation'].includes(instruction?.opcode ?? '')) {
          const baseline = await player.session.prepareSession({ snapshot, domain: player.data.domain, source: { kind: 'entry', scenario }, target,
            evaluateTarget: true, targetPhase: 'before', routePolicy: 'unique', story: selected.story });
          if (!baseline.ok) throw new Error(baseline.error.message);
          animationBase = structuredClone(baseline.value.state.presentation);
          if (!animationBase.camera && state.presentation.camera) {
            const defaults = structuredClone(state.presentation.camera.defaults);
            animationBase.camera = { current: structuredClone(defaults), defaults, processes: [] };
          }
          player.session.disposePrepared(baseline.value.id);
          if (!current()) return;
          if (!baseline.value.reached) throw new Error(this.t('动画起点路线尚未确定','Choose the animation baseline route','アニメーション開始ルートを選択してください'));
        }
        const activated = await player.activatePreview(prepared.value, this.mode);
        if(!activated.ok)throw new Error(activated.error.message);
        if(!current())return;
        preparedId=null;
        this.animationBase = structuredClone(animationBase);
        if (this.player !== player) { this.player?.dispose(); this.resize.unobserve(this.surface); this.surface.replaceWith(surface); this.surface = surface; this.player = player; this.pending = null; this.resize.observe(surface); }
        surface.style.position = ''; surface.style.visibility = ''; surface.style.width = ''; surface.style.pointerEvents = ''; this.root.dataset.stale = 'false';
        const scene = snapshot.scenes.find(scene => scene.scene.id === target.sceneId);
        const line = (scene?.instructions.findIndex(instruction => instruction.statementId === target.statementId) ?? -1) + 1;
        this.provenance.textContent = `${selected.title} / ${scene?.scene.name ?? ''} · ${this.t(`第 ${line} 条`, `Line ${line}`, `${line} 行目`)}`;
        this.root.dataset.sceneId = target.sceneId;
        this.root.dataset.previewMode=this.mode;
        this.status.textContent = (this.mode==='inspection'?this.t('当前指令 · 静音定格','Current command · paused and muted','現在のコマンド・静止／消音'):this.mode==='current'?this.t('当前演出 · 可暂停与重播','Current performance · pause or replay','現在の演出・一時停止／再生'):this.t('连续试玩 · 独立预览资料','Continuous playtest · isolated profile','連続試遊・独立データ')) + (source === 'selected' ? this.t(' · 已选择路线',' · route selected','・ルート選択済み') : this.t(' · 自动路线',' · automatic route','・自動ルート')) + (routeLabel(snapshot, scenario) ? ` · ${routeLabel(snapshot, scenario)}` : '');
        if (scenario.route.length || scenario.playerInputs.length) button(this.t('重新选择预览路线','Change preview route','プレビュールートを変更'), () => { this.intent.clear(); source = 'automatic'; scenario.route = []; scenario.playerInputs = []; retry(); });
        this.root.dataset.statementId = target.statementId ?? '';
        this.drawHighlight();
        player.session.disposePrepared(prepared.value.id); preparedId = null;
        if (this.animationPreview) void this.sampleAnimation(this.animationPreview.animation, this.animationPreview.timeMs, this.animationPreview.target);
      };
      await prepareRoute();
    } catch (error) { if (current()) { this.status.textContent = `${this.t('预览暂不可用','Preview unavailable','プレビュー不可')}：${error instanceof Error ? error.message : String(error)}`; this.clearPending(); this.root.dataset.stale = String(Boolean(this.player)); if (this.player) this.status.textContent += this.t(' · 保留上次有效画面',' · showing the last valid stage','・前回の有効な舞台を表示'); } }
  }
}
