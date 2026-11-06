import { createId } from '@galcraft/contracts';
export type Theme = 'light' | 'dark';
export type Task = 'writing' | 'page' | 'character' | 'assets' | 'production' | 'settings';
export type Expression = 'neutral' | 'smile' | 'surprised' | 'serious' | 'sad' | 'shy';
export type InlineEvent = {
  id: string;
  kind: 'expression' | 'pause' | 'sound';
  offset: number;
  characterId?: string;
  value: string;
  durationMs: number;
};
export type Line = {
  id: string;
  speakerId: string | null;
  text: string;
  events: InlineEvent[];
};
export type Appearance = {
  outfit: string;
  expression: Expression;
  x: number;
  y: number;
  scale: number;
  visible: boolean;
  parts?: Part[];
};
export type Scene = {
  id: string;
  name: string;
  background: string;
  lines: Line[];
  cast: Record<string, Appearance>;
};
export type Part = {
  id: string;
  name: string;
  axis: 'shared' | 'outfit' | 'expression';
  value: string;
  image: string;
  visible: boolean;
  x: number;
  y: number;
  source: string;
  effect?: 'bake' | 'merge';
};
export type Character = {
  id: string;
  name: string;
  description: string;
  prefix: string;
  outfit: string;
  expression: Expression;
  parts: Part[];
  autoMouth: boolean;
  autoBlink: boolean;
};
export type Asset = {
  id: string;
  name: string;
  kind: 'image' | 'audio';
  url: string;
  characterId?: string;
  expression?: Expression;
};
export type PageObject = {
  id: string;
  name: string;
  kind: 'text' | 'button' | 'image';
  text: string;
  image?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  fontSize: number;
};
export type GraphNode = {
  id: string;
  kind: 'click' | 'fade' | 'condition' | 'variable' | 'scene';
  label: string;
  x: number;
  y: number;
  value?: boolean;
  durationMs?: number;
  sceneId?: string;
  objectId?: string;
};
export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  kind: 'execution' | 'boolean';
};
export type PageDocument = {
  id: string;
  name: string;
  background: string;
  objects: PageObject[];
  nodes: GraphNode[];
  edges: GraphEdge[];
};
export type Project = {
  id: string;
  name: string;
  scenes: Scene[];
  characters: Character[];
  assets: Asset[];
  page: PageDocument;
};
export type Source = {
  kind: 'line' | 'event' | 'character' | 'page-object' | 'part';
  documentId: string;
  id: string;
  lineId?: string;
  characterId?: string;
};
export type Panel = 'stage' | 'inspector' | 'assets';
export type PsdLayer = {
  id: string;
  name: string;
  sourceVisible: boolean;
  kept: boolean;
  axis: Part['axis'];
  value: string;
  image: string;
  sourceX: number;
  sourceY: number;
  x: number;
  y: number;
  keepSourceOffset?: boolean;
  effect: 'none' | 'glow';
  strategy: 'bake' | 'merge';
};
export type ImportDraft = {
  step: 1 | 2 | 3;
  characterId: string;
  name: string;
  layers: PsdLayer[];
  selectedId: string;
  outfit: string;
  expression: Expression;
};
export type Candidate = {
  id: string;
  name: string;
  url: string;
  expression: Expression;
  description: string;
};
export type Production = {
  status: 'idle' | 'running' | 'failed' | 'ready' | 'cancelled';
  request: string;
  progress: number;
  attempt: number;
  characterId: string;
  expression: Expression;
  candidates: Candidate[];
  selectedId: string | null;
  compareId: string | null;
  adoptedId: string | null;
  overlay: boolean;
  error: string | null;
};
export type UiState = {
  theme: Theme;
  task: Task;
  sceneId: string;
  lineId: string;
  focusDocument: string;
  documentPositions?: Record<string, {
    lineId: string;
    offset: number;
  }>;
  productionServiceEnabled?: boolean;
  selected: Source;
  pins: Partial<Record<Panel, Source>>;
  selection: {
    lineId: string;
    start: number;
    end: number;
  } | null;
  preview: {
    status: 'stopped' | 'playing' | 'paused';
    sceneId: string;
    lineId: string;
    offset: number;
    temporaryCandidateId: string | null;
  };
  sourceDrafts: Record<string, string>;
  sourceErrors: Record<string, string>;
  importDraft: ImportDraft;
  production: Production;
  graphRun: {
    status: 'idle' | 'running' | 'paused' | 'finished' | 'failed';
    currentId: string | null;
    trace: string[];
    message: string;
    breakpointId: string | null;
  };
  notice: string;
  commandOpen: boolean;
  reveal?: {
    sceneId: string;
    lineId: string;
    offset: number;
    serial: number;
  };
  graphSelection?: string | null;
};
export type ReviewState = {
  project: Project;
  ui: UiState;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  revision: number;
};
export type ReviewServices = {
  save(project: Project, signal: AbortSignal): Promise<void>;
  produce(request: {
    character: Character;
    expression: Expression;
    prompt: string;
    attempt: number;
  }, signal: AbortSignal, progress: (value: number) => void): Promise<Candidate[]>;
};
export type ReviewSeed = {
  project: Project;
  ui: UiState;
};
type HistoryEntry = {
  project: Project;
  label: string;
};

/** Shared authoring session. Views are movable; the work and its history live here. */
export class ReviewStore {
  private state: ReviewState;
  private saved: Project;
  private listeners = new Set<() => void>();
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private lastGroup = '';
  private lastEdit = 0;
  private running: AbortController | null = null;
  private saving: AbortController | null = null;
  private alive = true;
  constructor(seed: ReviewSeed, readonly services: ReviewServices) {
    const project = structuredClone(seed.project);
    this.saved = project;
    this.state = {
      project,
      ui: structuredClone(seed.ui),
      dirty: false,
      saving: false,
      error: null,
      canUndo: false,
      canRedo: false,
      undoLabel: '',
      revision: 0
    };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(next: ReviewState) {
    if (!this.alive) return;
    if (next.project !== this.state.project) next = {
      ...next,
      ui: this.reconcilePosition(next.project, next.ui)
    };
    this.state = next;
    for (const listener of this.listeners) listener();
  }
  private reconcilePosition(project: Project, current: UiState): UiState {
    const scene = project.scenes.find(s => s.id === current.sceneId) ?? project.scenes[0];
    if (!scene || scene.lines.some(l => l.id === current.lineId)) return current;
    const previous = this.state.project.scenes.find(s => s.id === current.sceneId);
    const ordinal = Math.max(0, previous?.lines.findIndex(l => l.id === current.lineId) ?? 0);
    const resolved = current.selected.kind === 'event' ? sourceLine(project, current.selected).line : undefined;
    const line = resolved ?? scene.lines[Math.min(ordinal, scene.lines.length - 1)];
    const ui = structuredClone(current);
    ui.sceneId = scene.id;
    ui.lineId = line?.id ?? '';
    ui.selection = line ? {
      lineId: line.id,
      start: 0,
      end: 0
    } : null;
    if (!resolved) ui.selected = {
      kind: 'line',
      documentId: scene.id,
      id: ui.lineId
    };
    if (ui.preview.sceneId === scene.id && !scene.lines.some(l => l.id === ui.preview.lineId)) {
      ui.preview.lineId = ui.lineId;
      ui.preview.offset = 0;
      ui.preview.status = 'paused';
    }
    return ui;
  }
  activateDocument(sceneId: string) {
    const scene = this.state.project.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    this.updateUi(ui => {
      ui.documentPositions ??= {};
      ui.documentPositions[ui.sceneId] = {
        lineId: ui.lineId,
        offset: ui.selection?.start ?? 0
      };
      const position = ui.documentPositions[sceneId];
      const line = scene.lines.find(l => l.id === position?.lineId) ?? scene.lines[0];
      ui.sceneId = sceneId;
      ui.lineId = line?.id ?? '';
      ui.focusDocument = sceneId;
      ui.selected = {
        kind: 'line',
        documentId: sceneId,
        id: ui.lineId
      };
      const offset = Math.min(position?.offset ?? 0, line?.text.length ?? 0);
      ui.selection = line ? {
        lineId: line.id,
        start: offset,
        end: offset
      } : null;
    });
  }
  updateUi(change: (ui: UiState) => void) {
    const ui = structuredClone(this.state.ui);
    change(ui);
    this.emit({
      ...this.state,
      ui
    });
  }
  notice(message: string) {
    this.updateUi(ui => {
      ui.notice = message;
    });
  }
  edit(label: string, change: (project: Project) => void, group = '') {
    const project = structuredClone(this.state.project);
    change(project);
    if (JSON.stringify(project) === JSON.stringify(this.state.project)) return;
    const now = performance.now();
    if (!group || this.lastGroup !== group || now - this.lastEdit > 900) this.past.push({
      project: this.state.project,
      label
    });
    this.lastGroup = group;
    this.lastEdit = now;
    this.future = [];
    this.emit({
      ...this.state,
      project,
      dirty: project !== this.saved,
      canUndo: true,
      canRedo: false,
      undoLabel: label,
      revision: this.state.revision + 1,
      error: null
    });
  }
  endEditGroup() {
    this.lastGroup = '';
  }
  undo() {
    const entry = this.past.pop();
    if (!entry) return;
    this.future.push({
      project: this.state.project,
      label: entry.label
    });
    this.endEditGroup();
    this.emit({
      ...this.state,
      project: entry.project,
      dirty: entry.project !== this.saved,
      canUndo: !!this.past.length,
      canRedo: true,
      undoLabel: this.past.at(-1)?.label ?? '',
      revision: this.state.revision + 1,
      error: null
    });
  }
  redo() {
    const entry = this.future.pop();
    if (!entry) return;
    this.past.push({
      project: this.state.project,
      label: entry.label
    });
    this.endEditGroup();
    this.emit({
      ...this.state,
      project: entry.project,
      dirty: entry.project !== this.saved,
      canUndo: true,
      canRedo: !!this.future.length,
      undoLabel: entry.label,
      revision: this.state.revision + 1,
      error: null
    });
  }
  selectLine(sceneId: string, lineId: string, offset = 0) {
    this.updateUi(ui => {
      ui.documentPositions ??= {};
      ui.documentPositions[sceneId] = {
        lineId,
        offset
      };
      ui.sceneId = sceneId;
      ui.lineId = lineId;
      ui.focusDocument = sceneId;
      ui.selected = {
        kind: 'line',
        documentId: sceneId,
        id: lineId
      };
      ui.selection = {
        lineId,
        start: offset,
        end: offset
      };
    });
  }
  select(source: Source) {
    this.updateUi(ui => {
      ui.selected = source;
    });
  }
  revealLine(sceneId: string, lineId: string, offset = 0) {
    this.selectLine(sceneId, lineId, offset);
    this.updateUi(ui => {
      ui.reveal = {
        sceneId,
        lineId,
        offset,
        serial: (ui.reveal?.serial ?? 0) + 1
      };
    });
  }
  pin(panel: Panel, source?: Source) {
    const next = source ?? this.source(panel);
    this.updateUi(ui => {
      if (ui.pins[panel]) delete ui.pins[panel];else ui.pins[panel] = structuredClone(next);
    });
  }
  source(panel: Panel): Source {
    return this.state.ui.pins[panel] ?? (panel === 'stage' ? {
      kind: 'line',
      documentId: this.state.ui.sceneId,
      id: this.state.ui.lineId
    } : this.state.ui.selected);
  }
  updateText(sceneId: string, lineId: string, text: string) {
    this.edit('编辑文稿', project => {
      const line = project.scenes.find(scene => scene.id === sceneId)?.lines.find(line => line.id === lineId);
      if (!line) return;
      // Keep event anchors attached through insertion/deletion before their text.
      let prefix = 0;
      while (prefix < line.text.length && prefix < text.length && line.text[prefix] === text[prefix]) prefix++;
      let suffix = 0;
      while (suffix < line.text.length - prefix && suffix < text.length - prefix && line.text.at(-1 - suffix) === text.at(-1 - suffix)) suffix++;
      const end = line.text.length - suffix,
        delta = text.length - line.text.length;
      for (const event of line.events) event.offset = Math.max(0, Math.min(text.length, event.offset >= end ? event.offset + delta : event.offset > prefix ? prefix : event.offset));
      line.text = text;
    }, `text:${lineId}`);
  }
  insertEvent(sceneId: string, lineId: string, kind: InlineEvent['kind'], offset: number) {
    const id = createId();
    this.edit('插入句内事件', project => {
      const line = project.scenes.find(s => s.id === sceneId)?.lines.find(l => l.id === lineId);
      if (!line) return;
      line.events.push({
        id,
        kind,
        offset: Math.max(0, Math.min(offset, line.text.length)),
        characterId: line.speakerId ?? project.characters[1]?.id,
        value: kind === 'expression' ? 'surprised' : kind === 'sound' ? '通电' : '',
        durationMs: kind === 'pause' ? 600 : 0
      });
      line.events.sort((a, b) => a.offset - b.offset);
    });
    this.select({
      kind: 'event',
      documentId: sceneId,
      id,
      lineId
    });
    return id;
  }
  updateEvent(source: Source, patch: Partial<InlineEvent>) {
    this.edit('修改句内事件', project => {
      const {
        line
      } = sourceLine(project, source);
      const event = line?.events.find(e => e.id === source.id);
      if (event && line) Object.assign(event, patch, {
        id: event.id,
        offset: Math.max(0, Math.min(patch.offset ?? event.offset, line.text.length))
      });
    });
  }
  async save() {
    if (this.saving) return;
    if (this.state.project.scenes.some(scene => this.state.ui.sourceErrors[scene.id])) {
      this.emit({
        ...this.state,
        error: '源码草稿仍有错误，请修正后保存。'
      });
      return;
    }
    const controller = new AbortController();
    this.saving = controller;
    const project = this.state.project;
    this.emit({
      ...this.state,
      saving: true,
      error: null
    });
    try {
      await this.services.save(structuredClone(project), controller.signal);
      if (!controller.signal.aborted) {
        this.saved = project;
        this.emit({
          ...this.state,
          saving: false,
          dirty: this.state.project !== project
        });
        this.notice('已保存到本次审核会话');
      }
    } catch (error) {
      if (!controller.signal.aborted) this.emit({
        ...this.state,
        saving: false,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      this.saving = null;
    }
  }
  async produce() {
    if (this.running) return;
    if (this.state.ui.productionServiceEnabled === false) {
      this.updateUi(ui => {
        ui.production.status = 'failed';
        ui.production.error = '审核素材服务已停用，请在插件与连接中启用后重试。';
      });
      return;
    }
    const task = this.state.ui.production,
      character = this.state.project.characters.find(c => c.id === task.characterId);
    if (!character) return;
    const controller = new AbortController();
    this.running = controller;
    this.updateUi(ui => {
      ui.production.status = 'running';
      ui.production.progress = 0;
      ui.production.error = null;
      ui.production.attempt++;
      ui.preview.temporaryCandidateId = null;
    });
    try {
      const candidates = await this.services.produce({
        character: structuredClone(character),
        expression: task.expression,
        prompt: task.request,
        attempt: task.attempt + 1
      }, controller.signal, progress => {
        if (!controller.signal.aborted) this.updateUi(ui => {
          ui.production.progress = progress;
        });
      });
      if (!controller.signal.aborted) this.updateUi(ui => {
        ui.production.status = 'ready';
        ui.production.progress = 100;
        ui.production.candidates = candidates;
        ui.production.selectedId = candidates[0]?.id ?? null;
        ui.production.compareId = candidates[1]?.id ?? null;
      });
    } catch (error) {
      if (!controller.signal.aborted) this.updateUi(ui => {
        ui.production.status = 'failed';
        ui.production.error = error instanceof Error ? error.message : String(error);
      });
    } finally {
      if (this.running === controller) this.running = null;
    }
  }
  cancelProduction() {
    this.running?.abort();
    this.running = null;
    this.updateUi(ui => {
      ui.production.status = 'cancelled';
    });
  }
  previewCandidate(id: string | null) {
    this.updateUi(ui => {
      ui.preview.temporaryCandidateId = id;
    });
  }
  adoptCandidate(id: string) {
    const task = this.state.ui.production,
      candidate = task.candidates.find(c => c.id === id);
    if (!candidate) return;
    this.edit('采用表情制作成果', project => {
      const character = project.characters.find(c => c.id === task.characterId);
      if (!character) return;
      let part = character.parts.find(p => p.axis === 'expression' && p.value === task.expression);
      if (!part) {
        part = {
          id: createId(),
          name: expressionNames[task.expression],
          axis: 'expression',
          value: task.expression,
          image: candidate.url,
          visible: true,
          x: 0,
          y: 0,
          source: candidate.name
        };
        character.parts.push(part);
      } else {
        part.image = candidate.url;
        part.source = candidate.name;
      }
      character.expression = task.expression;
      if (!project.assets.some(a => a.id === candidate.id)) project.assets.push({
        id: candidate.id,
        name: candidate.name,
        kind: 'image',
        url: candidate.url,
        characterId: character.id,
        expression: task.expression
      });
    });
    this.updateUi(ui => {
      ui.production.adoptedId = id;
      ui.preview.temporaryCandidateId = null;
      ui.task = 'character';
      ui.selected = {
        kind: 'character',
        documentId: task.characterId,
        id: task.characterId
      };
      ui.notice = '已采用成果，可以撤销恢复原部件';
    });
  }
  applyAppearance(characterId: string) {
    const character = this.state.project.characters.find(c => c.id === characterId);
    if (!character) return;
    const sceneId = this.state.ui.sceneId;
    this.edit('将组合外观用于场景', project => {
      const appearance = project.scenes.find(s => s.id === sceneId)?.cast[characterId];
      if (appearance) {
        appearance.outfit = character.outfit;
        appearance.expression = character.expression;
        appearance.parts = structuredClone(character.parts);
      }
    });
    this.notice('组合外观已用于当前场景');
  }
  applyPsd() {
    const draft = this.state.ui.importDraft;
    this.edit('确认 PSD 组合映射', project => {
      const character = project.characters.find(c => c.id === draft.characterId);
      if (!character) return;
      character.parts = draft.layers.filter(l => l.kept).map(l => ({
        id: l.id,
        name: l.name,
        axis: l.axis,
        value: l.value,
        image: l.image,
        visible: true,
        x: (l.keepSourceOffset === false ? 0 : l.sourceX) + l.x,
        y: (l.keepSourceOffset === false ? 0 : l.sourceY) + l.y,
        effect: l.strategy,
        source: `${draft.name} / ${l.name} · ${l.strategy === 'bake' ? '烘焙' : '合并'}`
      }));
      character.outfit = draft.outfit;
      character.expression = draft.expression;
    });
    this.updateUi(ui => {
      ui.task = 'character';
      ui.notice = '已将映射结果写入角色定义，可以撤销';
      ui.selected = {
        kind: 'character',
        documentId: draft.characterId,
        id: draft.characterId
      };
    });
  }
  dispose() {
    this.alive = false;
    this.running?.abort();
    this.saving?.abort();
    this.listeners.clear();
  }
}
export const expressionNames: Record<Expression, string> = {
  neutral: '平静',
  smile: '微笑',
  surprised: '惊喜',
  serious: '认真',
  sad: '难过',
  shy: '害羞'
};
export function sourceLine(project: Project, source: Source) {
  const scene = project.scenes.find(s => s.id === source.documentId);
  const line = source.kind === 'event' ? scene?.lines.find(line => line.events.some(event => event.id === source.id)) : scene?.lines.find(line => line.id === (source.lineId ?? source.id));
  return {
    scene,
    line
  };
}
export function sourceTitle(project: Project, source: Source): string {
  const {
    scene,
    line
  } = sourceLine(project, source);
  if (scene && line) return `${scene.name} / 第 ${scene.lines.indexOf(line) + 1} 句`;
  if (source.kind === 'page-object') return `${project.page.name} / ${project.page.objects.find(o => o.id === source.id)?.name ?? '对象已移除'}`;
  return project.characters.find(c => c.id === (source.characterId ?? source.id))?.name ?? '来源已移除';
}
