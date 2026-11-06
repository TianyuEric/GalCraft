import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { Popover as BasePopover } from '@base-ui/react/popover';
import { AudioLines, Code2, GitBranch, GripVertical, Image, MessageSquare, Monitor, MoreHorizontal, PanelRight, Plus, Puzzle, Variable, X } from 'lucide-react';
import { DialogueContentSchema, dialoguePlainText, type CommandSpec, type Id, type Json, type Result } from '@galcraft/contracts';
import type { AuthorOperation } from '@galcraft/documents/authoring';
import type { StatementNode } from '@galcraft/dsl';
import { recordAssetsPicked } from '../../../authoring/asset-picker.js';
import { commandCategory, commandName } from '../../../authoring/command-picker.js';
import { buildMoveInstructionsModel, resolveMovePosition, type MovePosition } from '../../../authoring/move-instructions-model.js';
import { CandidateActionMenu, CandidateButton, CandidateField, CandidateFieldGroup, CandidateIconButton, CandidateInput, CandidateReviewDialog, CandidateSection, CandidateSelect, CandidateState, CandidateToolbar, type CandidateMenuAction, type CandidateMenuTarget } from '../components/controls/index.js';
import type { SceneSource } from '../../../authoring/controller.js';
import { useCandidate, useCandidateState } from '../application/context.js';
import { applyCommandOperation, commandArgs, commandRegistry, commandSource, loadCommandSpecs, type CommandReceipt } from '../adapters/command-preview.js';
import { CandidateCommandFields, initialCommandArgs } from './CandidateCommandFields.js';
import { commandMoveTarget, startCommandReorder } from './command-reorder.js';
import {professionalCommandViewId,hasProfessionalCommandEditor} from './CandidateCommandProfessionalView.js';
import {readCandidateAssetDrag,droppedAssetCommand} from './asset-workspace.js';
import {candidateAssets} from '../application/services.js';
import '../styles/commands.css';

const locale = 'zh-CN';
type Draft = { kind: 'insert' | 'update'; source: SceneSource; command: string; targetId: Id | null; args: Record<string, Json>; figureKind?: 'image' | 'live2d'; position: string; before: Selection };
type Operation = Extract<AuthorOperation, { sceneId: Id }>;
type Props = { sceneId: string; onOpen?: (viewId: string) => void };
type Insertion = { source: SceneSource; beforeId: Id | null; position: string; anchor?: HTMLElement };
type ListPosition = { id: Id; offset: number } | null;
type Selection = { primary: Id | null; selected: Id[]; anchor: Id | null; scroll: ListPosition };
type History = { group: Id; applied: boolean; before: Selection; after: Selection };
type ListState = { selection: Selection; details: boolean; history: History[] };
const commandIcons = { text: MessageSquare, sound: AudioLines, flow: GitBranch, variable: Variable, visual: Image };

function excerpt(node: StatementNode, spec?: CommandSpec) {
  const args = commandArgs(node.object?.value);
  const text = DialogueContentSchema.safeParse(args.text);
  if (text.success) return dialoguePlainText(text.data).replace(/\s+/g, ' ').trim();
  return [args.name, args.note, args.op, args.type].find((value): value is string => typeof value === 'string' && value.length > 0) ?? spec?.description ?? node.raw;
}

const commandCategories = [['all', '全部'], ['text', '文本'], ['visual', '画面'], ['sound', '声音'], ['flow', '流程'], ['variable', '变量']] as const;

function CommandPicker({ registry, select }: { registry: ReadonlyMap<string, CommandSpec>; select(key: string, assetKind: 'image' | 'live2d'): void }) {
  const [query, setQuery] = useState(''), [category, setCategory] = useState<string>('all');
  const search = useRef<HTMLInputElement>(null), results = useRef<HTMLDivElement>(null);
  const needle = query.trim().toLocaleLowerCase();
  const options = [...registry.values()].flatMap(spec => {
    if (category !== 'all' && commandCategory(spec.key) !== category) return [];
    const kinds = spec.key === 'changeFigure' ? ['image', 'live2d'] as const : [null];
    return kinds.flatMap(kind => {
      const label = kind === 'image' ? '图片立绘' : kind === 'live2d' ? 'Live2D 立绘' : commandName(spec, locale);
      return `${label} ${spec.name} ${spec.key} ${spec.description} ${spec.keywords.join(' ')}`.toLocaleLowerCase().includes(needle)
        ? [{ spec, kind, label }] : [];
    });
  });
  useEffect(() => { search.current?.focus(); }, []);
  function pickerKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing || !['ArrowDown', 'ArrowUp', 'Enter', 'Home', 'End'].includes(event.key)) return;
    const items = [...(results.current?.querySelectorAll<HTMLButtonElement>('.command-result') ?? [])];
    if (!items.length) return;
    const index = items.indexOf(event.target as HTMLButtonElement);
    if (event.target !== search.current && index < 0) return;
    if (index < 0 && (event.key === 'Home' || event.key === 'End')) return;
    if (event.key === 'Enter') {
      if (index >= 0) return;
      event.preventDefault();
      items[0]?.click();
      return;
    }
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? Math.min(index + 1, items.length - 1) : index - 1;
    if (next < 0) search.current?.focus();
    else items[next]?.focus();
  }
  return <div className="gc-candidate-command-catalog" onKeyDown={pickerKeys}>
    <CandidateInput ref={search} type="search" aria-label="搜索指令名称或用途" placeholder="搜索指令名称或用途" value={query} onChange={event => setQuery(event.target.value)}/>
    <CandidateToolbar className="command-categories" label="指令分类">{commandCategories.map(([key, label]) =>
      <CandidateButton key={key} aria-pressed={category === key} onClick={() => setCategory(key)}>{label}</CandidateButton>)}</CandidateToolbar>
    <div ref={results} className="command-results" aria-label="匹配指令">
      {options.map(({ spec, kind, label }) => <CandidateButton key={`${spec.key}:${kind}`} className="command-result"
        data-key={spec.key} data-asset-kind={kind ?? undefined} onClick={() => select(spec.key, kind ?? 'image')}>
        <span>{label}</span><small>{kind === 'image' ? 'PNG / JPG' : kind === 'live2d' ? '模型与动作' : spec.key}</small>
      </CandidateButton>)}
      {!options.length && <CandidateState kind="empty" title="没有匹配的指令" description="试试其他名称或用途。"/>}
    </div>
  </div>;
}

export function CandidateCommandView({ sceneId, onOpen }: Props) {
  const session = useCandidate(), state = useCandidateState();
  const viewId = `commands:${sceneId}`;
  const remembered = session.viewState<ListState>(viewId);
  const scene = session.graphSceneSource(sceneId), documents = session.host.list();
  const [authoring, setAuthoring] = useState(session.controller.source);
  const [plugins, setPlugins] = useState<CommandSpec[]>([]);
  const [pluginError, setPluginError] = useState('');
  const [problem, setProblem] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [multi, setMulti] = useState<Id[] | null>(remembered?.selection.selected ?? null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<Insertion | null>(null);
  const [menu, setMenu] = useState<(CandidateMenuTarget & { row?: Id }) | null>(null);
  const [details, setDetails] = useState(remembered?.details ?? false);
  const [action, setAction] = useState<'move' | 'remove' | null>(null);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const anchor = useRef<Id | null>(remembered?.selection.anchor ?? null), operating = useRef(false);
  const rowRefs = useRef(new Map<Id, HTMLButtonElement>());
  const list = useRef<HTMLDivElement>(null), insertButton = useRef<HTMLButtonElement>(null);
  const stopDrag = useRef<(() => void) | undefined>(undefined);
  const history = useRef<History[]>(remembered?.history ?? []);
  const readRequest = useRef(0);

  useEffect(() => { setPortal(list.current?.closest<HTMLElement>('.gc-candidate') ?? null); }, []);
  useEffect(() => {
    session.setViewPending(viewId, Boolean(draft));
    return () => session.setViewPending(viewId, false);
  }, [session, viewId, Boolean(draft)]);
  useEffect(() => () => stopDrag.current?.(), []);

  useEffect(() => {
    const request = ++readRequest.current;
    void session.services.read(session.host.list()).then(result => { if (request === readRequest.current && result.ok) setAuthoring(result.value); });
    return () => { readRequest.current++; };
  }, [session, state.revision]);
  useEffect(() => {
    let alive = true;
    void loadCommandSpecs(session).then(result => {
      if (!alive) return;
      if (result.ok) { setPlugins(result.value); setPluginError(''); }
      else setPluginError(result.error.message);
    }).catch(cause => { if (alive) setPluginError(String(cause)); });
    return () => { alive = false; };
  }, [session, authoring?.projectRevision,session.host.list().find(document=>'dependencies.lock.json' in document.files)?.revision]);

  const registry = useMemo(() => commandRegistry(authoring?.project.engineVersion ?? '0.1.0', plugins), [authoring?.project.engineVersion, plugins]);
  const parsed = useMemo(() => scene && commandSource(scene), [scene?.documentId, scene?.revision, scene?.text]);
  const nodes = parsed?.cst ?? [];
  const ids = nodes.flatMap(node => node.valid && node.id ? [node.id] : []);
  const requested = session.commandSelection(sceneId);
  const primary = requested && ids.includes(requested) ? requested : null;
  const current = nodes.find(node => node.id === primary);
  const pendingSelection = new Set(multi?.includes(primary ?? '') ? multi : primary ? [primary] : []);
  const selected = ids.filter(id => pendingSelection.has(id));
  const selection = new Set(selected);
  const firstSelected = selected.length ? ids.indexOf(selected[0]!) : -1;
  const lastSelected = selected.length ? ids.indexOf(selected[selected.length - 1]!) : -1;
  const sourceDraft = state.ui.sourceDrafts[sceneId];
  const readOnly = session.sourceReadOnly(sceneId) || !scene || Boolean(state.ui.sourceErrors[sceneId]) || sourceDraft !== undefined && sourceDraft !== scene.text || Boolean(parsed?.issues.some(issue => issue.severity === 'error'));
  const disabled = readOnly || busy || Boolean(draft);
  const canInsert = !disabled && !pluginError && Boolean(authoring) && Boolean(portal);
  const spec = draft ? registry.get(draft.command) : null;
  useEffect(() => {
    if (!primary) return;
    const frame = requestAnimationFrame(() => {
      const row = rowRefs.current.get(primary);
      if (row?.getClientRects().length) row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [primary]);

  function scrollAnchor(): ListPosition {
    const scroller = list.current;
    if (!scroller?.clientHeight) return null;
    const top = scroller.getBoundingClientRect().top;
    for (const row of scroller.querySelectorAll<HTMLElement>('[data-command-row]')) {
      const bounds = row.getBoundingClientRect();
      if (bounds.bottom > top) return { id: row.dataset.commandRow!, offset: bounds.top - top };
    }
    return null;
  }

  function restoreScroll(position: ListPosition) {
    if (!position) return;
    requestAnimationFrame(() => {
      const scroller = list.current, row = rowRefs.current.get(position.id);
      if (!scroller?.clientHeight || !row) return;
      scroller.scrollTop += row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - position.offset;
    });
  }

  function capture(): Selection {
    return { primary, selected, anchor: anchor.current, scroll: scrollAnchor() };
  }

  function restoreSelection(next: Selection) {
    anchor.current = next.anchor;
    setMulti(next.selected);
    const available = next.primary && ids.includes(next.primary) ? next.primary : next.selected.find(id => ids.includes(id)) ?? null;
    if (available !== requested) session.selectCommand(sceneId, available);
    restoreScroll(next.scroll);
  }

  // Read the state of the actual document history groups, including changes made by global Undo/Redo.
  useEffect(() => {
    if (busy || state.activeView !== viewId) return;
    let restored: Selection | undefined, redone: Selection | undefined;
    for (const entry of history.current) {
      const status = session.host.historyGroupStatus(entry.group);
      if (!status) continue;
      const applied = status !== 'unadopted';
      if (entry.applied && !applied) restored ??= entry.before;
      if (!entry.applied && applied) redone = entry.after;
      entry.applied = applied;
    }
    if (restored || redone) restoreSelection((redone ?? restored)!);
  }, [busy, scene?.revision, state.activeView]);

  const latest = useRef({ capture, details });
  latest.current = { capture, details };
  useLayoutEffect(() => {
    restoreScroll(remembered?.selection.scroll ?? null);
    return () => session.rememberViewState(viewId, {
      selection: latest.current.capture(), details: latest.current.details, history: history.current,
    } satisfies ListState);
  }, [session, viewId]);

  function rememberEdit(receipt: CommandReceipt, before: Selection, after: Selection) {
    history.current = history.current.filter(entry => session.host.historyGroupStatus(entry.group));
    history.current.push({ group: receipt.edit.groupId, applied: true, before, after });
  }

  function choose(id: Id, mode: 'one' | 'toggle' | 'range' = 'one') {
    if (busy) return;
    setAction(null);
    if (mode === 'range' && anchor.current && ids.includes(anchor.current)) {
      const left = ids.indexOf(anchor.current), right = ids.indexOf(id);
      setMulti(ids.slice(Math.min(left, right), Math.max(left, right) + 1));
    } else if (mode === 'toggle') {
      if (selection.has(id)) {
        const remaining = selected.filter(item => item !== id);
        setMulti(remaining);
        session.selectCommand(sceneId, remaining.at(-1) ?? null);
        return;
      }
      setMulti([...selected, id]);
      anchor.current = id;
    } else {
      setMulti(null);
      anchor.current = id;
    }
    if (nodes.find(node => node.id === id)?.command === 'say') session.selectLine(sceneId, id);
    session.selectCommand(sceneId, id);
  }

  function focusRow(id: Id | null) {
    requestAnimationFrame(() => (id ? rowRefs.current.get(id) : insertButton.current)?.focus());
  }

  useEffect(() => {
    if (state.projectActive && !readOnly) return;
    stopDrag.current?.();
    setPicker(null);
    setMenu(null);
  }, [state.projectActive, readOnly]);

  async function run(operation: Operation, origin = scene, target?: SceneSource): Promise<Result<CommandReceipt> | undefined> {
    if (!origin || operating.current) return;
    operating.current = true; setBusy(true); setProblem('');
    try {
      const result = await applyCommandOperation(session, origin, operation, plugins, target);
      if (!result.ok) setProblem(result.error.message);
      return result;
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
    } finally {
      operating.current = false; setBusy(false);
    }
  }

  function moveGap(direction: -1 | 1) {
    if (!selected.length) return undefined;
    if (direction < 0 && firstSelected === 0 || direction > 0 && lastSelected === ids.length - 1) return undefined;
    return commandMoveTarget(ids, selected, direction < 0 ? ids[firstSelected - 1]! : ids[lastSelected + 2] ?? null);
  }
  async function moveCommands(moved: Id[], beforeId: Id | null, origin: SceneSource | undefined, before: Selection, keyboard = false) {
    const result = await run({ op: 'commands.move', sceneId, ids: moved, targetSceneId: sceneId, beforeId }, origin);
    if (!result?.ok) return;
    rememberEdit(result.value, before, { ...before, scroll: scrollAnchor() });
    if (keyboard) focusRow(before.primary);
  }
  async function moveBy(direction: -1 | 1) {
    const beforeId = moveGap(direction);
    if (beforeId === undefined) return;
    await moveCommands(selected, beforeId, scene, capture(), true);
  }
  function drag(event: PointerEvent<HTMLElement>, id: Id) {
    if (disabled || picker || menu || action || !scene || !list.current || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    stopDrag.current?.();
    const before = capture();
    const moved = selection.has(id) ? selected : [id];
    stopDrag.current = startCommandReorder({
      list: list.current, handle: event.currentTarget, event: event.nativeEvent, order: ids, moved,
      drop: beforeId => { void moveCommands(moved, beforeId, scene, before); },
    });
  }
  async function duplicate() {
    const before = capture();
    const result = await run({ op: 'commands.duplicate', sceneId, ids: selected, beforeId: ids[lastSelected + 1] ?? null });
    if (!result?.ok) return;
    const copies = result.value.added;
    const first = copies[0];
    if (first) {
      rememberEdit(result.value, before, { primary: first, selected: copies, anchor: first, scroll: { id: first, offset: 0 } });
      anchor.current = first; session.selectCommand(sceneId, first); setMulti(copies); focusRow(first);
    }
  }
  async function remove() {
    const before = capture();
    const fallback = ids.slice(firstSelected).find(id => !selection.has(id)) ?? ids[firstSelected - 1] ?? null;
    const result = await run({ op: 'commands.remove', sceneId, ids: selected });
    if (!result?.ok) return;
    rememberEdit(result.value, before, { primary: fallback, selected: fallback ? [fallback] : [], anchor: fallback, scroll: scrollAnchor() });
    setAction(null); setMulti(null); anchor.current = fallback; session.selectCommand(sceneId, fallback); focusRow(fallback);
  }
  function locateSource() {
    if (!scene) return;
    session.selectCommand(sceneId, current?.id ?? null);
    onOpen?.(`source:${sceneId}`);
  }
  function insertion(beforeId: Id | null, trigger?: HTMLElement): Insertion | null {
    if (!scene || !canInsert) return null;
    const index = beforeId === null ? -1 : nodes.findIndex(node => node.id === beforeId);
    const position = index >= 0 ? `第 ${index + 1} 条指令之前` : '场景末尾';
    return { source: scene, beforeId, position, anchor: trigger };
  }
  function onRowKey(event: KeyboardEvent<HTMLButtonElement>, node: StatementNode, id: Id) {
    if (event.nativeEvent.isComposing) return;
    const index = ids.indexOf(id);
    if (event.key === 'Insert' || event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey || event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Insert') setPicker(insertion(event.shiftKey ? ids[index + 1] ?? null : id, event.currentTarget));
      else if (event.key === 'Enter') { if (!disabled) editCommand(node); }
      else {
        if (!selection.has(id)) choose(id);
        setMenu({ row: id, anchor: event.currentTarget });
      }
      return;
    }
    if (event.key === ' ' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); event.stopPropagation();
      choose(id, 'toggle');
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      if (!disabled && selection.has(id)) void moveBy(event.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    const next = event.key === 'Home' ? ids[0] : event.key === 'End' ? ids.at(-1) : ids[index + (event.key === 'ArrowUp' ? -1 : 1)];
    if (next) { if (event.shiftKey) choose(next, 'range'); focusRow(next); }
  }
  function beginInsert(key: string, figureKind: 'image' | 'live2d') {
    const command = registry.get(key);
    if (!picker || !command) return;
    setPicker(null); setProblem('');
    setDraft({ kind: 'insert', source: picker.source, command: key, targetId: picker.beforeId,
      position: picker.position, args: initialCommandArgs(command), figureKind, before: capture() });
  }
  function dropAsset(event:DragEvent, beforeId:Id|null) {
    const data=readCandidateAssetDrag(event.dataTransfer);
    if(!data||!canInsert||!scene)return;
    event.preventDefault();event.stopPropagation();
    if(data.projectId!==state.project.id){setProblem('素材来自另一作品，请先导入当前作品。');return;}
    const asset=candidateAssets(session.host.list()).find(asset=>asset.id===data.assetId),key=asset&&droppedAssetCommand(asset.kind),command=key&&registry.get(key);
    if(!asset||!command||!key){setProblem('此素材没有可用的场景指令，请使用素材属性选择用途。');return;}
    const target=insertion(beforeId);if(!target)return;
    const args=initialCommandArgs(command);args[key==='setComplexAnimation'?'resourceId':'assetId']=asset.id;
    if(key==='setComplexAnimation')args.target='stage';
    setDraft({kind:'insert',source:scene,command:key,targetId:beforeId,position:target.position,args,before:capture()});
    setProblem('');
  }
  function editCommand(node: StatementNode) {
    if (!scene || !node.valid || !node.id || !registry.has(node.command) || readOnly) return;
    const position = `第 ${nodes.indexOf(node) + 1} 条指令`;
    const before = { primary: node.id, selected: [node.id], anchor: node.id, scroll: scrollAnchor() };
    choose(node.id); setProblem('');
    setDraft({ kind: 'update', source: scene, command: node.command, targetId: node.id, position, args: commandArgs(node.object?.value), before });
  }
  async function saveFields(args: Record<string, Json>, changes: Array<{ field: string; op: 'set' | 'inherit'; value: Json }>, assetIds: Id[]) {
    if (!draft) return;
    const result = draft.kind === 'insert'
      ? await run({ op: 'commands.insert', sceneId, beforeId: draft.targetId, commands: [{ command: draft.command, args }] }, draft.source)
      : await run({ op: 'commands.fields', sceneId, ids: [draft.targetId!], changes }, draft.source);
    if (!result?.ok) return;
    const id = draft.kind === 'insert' ? result.value.added[0] : draft.targetId;
    if (id) {
      rememberEdit(result.value, draft.before, { primary: id, selected: [id], anchor: id, scroll: { id, offset: 0 } });
      if (draft.command === 'say') session.selectLine(sceneId, id);
      anchor.current = id; session.selectCommand(sceneId, id); setMulti(null); focusRow(id);
    }
    setDraft(null);
    if (authoring && assetIds.length) {
      const persisted = JSON.stringify(args);
      void recordAssetsPicked(session.services, authoring.project.projectId, assetIds.filter(id => persisted.includes(JSON.stringify(id))));
    }
  }

  const moveModel = action === 'move' && authoring ? buildMoveInstructionsModel(authoring, sceneId, selected, locale) : null;
  const menuIndex = menu?.row ? ids.indexOf(menu.row) : -1;
  const toolbarBefore = current?.valid ? current.id : null;
  const insertReason = canInsert ? undefined : '当前无法插入指令';
  const selectionReason = disabled ? '当前无法编辑指令' : !selected.length ? '请先选择指令' : undefined;
  const menuActions: CandidateMenuAction[] = [
    ...(menuIndex >= 0 ? [
      { id: 'before', label: '在此指令之前插入', shortcut: 'Insert', disabledReason: insertReason,
        run: () => setPicker(insertion(ids[menuIndex]!, menu?.anchor)) },
      { id: 'after', label: '在此指令之后插入', shortcut: 'Shift+Insert', disabledReason: insertReason,
        run: () => setPicker(insertion(ids[menuIndex + 1] ?? null, menu?.anchor)) },
    ] : []),
    { id: 'up', label: '上移所选指令', shortcut: 'Alt+↑', separatorBefore: menuIndex >= 0,
      disabledReason: selectionReason ?? (moveGap(-1) === undefined ? '已到可移动范围的开头' : undefined), run: () => { void moveBy(-1); } },
    { id: 'down', label: '下移所选指令', shortcut: 'Alt+↓',
      disabledReason: selectionReason ?? (moveGap(1) === undefined ? '已到可移动范围的末尾' : undefined), run: () => { void moveBy(1); } },
    { id: 'copy', label: '复制', disabledReason: selectionReason, run: () => { void duplicate(); } },
    { id: 'move', label: '移至场景', disabledReason: selectionReason ?? (!authoring?.scenes.some(item => item.sceneId !== sceneId) ? '没有其他场景' : undefined),
      run: () => { setProblem(''); setAction('move'); } },
    { id: 'remove', label: '删除', danger: true, separatorBefore: true, disabledReason: selectionReason,
      run: () => { setProblem(''); setAction('remove'); } },
  ];
  const gap = (beforeId: Id | null, label: string) => <div className="gc-candidate-command-gap" data-command-gap={beforeId ?? ''} aria-hidden="true" onDragOver={event=>{if(canInsert)event.preventDefault();}} onDrop={event=>dropAsset(event,beforeId)}>
    {canInsert && <CandidateIconButton label={label} tabIndex={-1} data-insert-before={beforeId ?? ''} variant="outline"
      onPointerDown={event => event.preventDefault()} onClick={event => { setMenu(null); setPicker(insertion(beforeId, event.currentTarget)); }}><Plus size={14}/></CandidateIconButton>}
  </div>;
  return <section className="gc-candidate-command-view" aria-label="剧情指令">
    <CandidateToolbar className="gc-candidate-command-bar gc-candidate-command-actions" label="指令操作">
      <BasePopover.Root open={Boolean(picker)} onOpenChange={open => setPicker(open ? insertion(toolbarBefore) : null)}>
        <BasePopover.Trigger render={<CandidateButton ref={insertButton} variant="primary" disabled={!canInsert}/>}>
          <Plus size={15}/>插入指令
        </BasePopover.Trigger>
        {portal && <BasePopover.Portal container={portal}><BasePopover.Positioner className="gc-candidate-command-floating" anchor={picker?.anchor} positionMethod="fixed" align="start" sideOffset={4}>
          <BasePopover.Popup aria-label="插入指令" className="gc-candidate-command-picker"
            onKeyDownCapture={event => {
              if (event.nativeEvent.isComposing && ['Enter', 'Escape'].includes(event.key)) { event.stopPropagation(); return; }
              if (event.key === 'Escape' && picker?.anchor) focusRow(picker.beforeId ?? primary);
            }}>
            <p className="gc-candidate-command-insert-location">插入位置 · {picker?.position}</p>
            <CommandPicker registry={registry} select={beginInsert}/>
          </BasePopover.Popup>
        </BasePopover.Positioner></BasePopover.Portal>}
      </BasePopover.Root>
      <span className="gc-candidate-command-count">{nodes.length} 条{selected.length ? ` · 已选 ${selected.length}` : ''}</span>
      <div className="gc-candidate-command-utilities">
        {current?.id && hasProfessionalCommandEditor(current.command) && <CandidateButton variant="secondary" disabled={readOnly} onClick={() => onOpen?.(professionalCommandViewId(sceneId, current.id!))}>专业编辑</CandidateButton>}
        <CandidateIconButton label="演出检查" onClick={() => onOpen?.(`command-stage:${sceneId}`)} disabled={!scene}><Monitor size={15}/></CandidateIconButton>
        <CandidateIconButton label="源码" onClick={locateSource} disabled={!scene}><Code2 size={15}/></CandidateIconButton>
        <CandidateIconButton label="指令属性" onClick={() => setDetails(value => !value)} disabled={!current?.valid || Boolean(draft)}
          aria-pressed={details && Boolean(current?.valid)}><PanelRight size={15}/></CandidateIconButton>
        <CandidateIconButton label="更多指令操作" aria-haspopup="menu" aria-expanded={Boolean(menu && !menu.row)} onClick={event => {
          const trigger = event.currentTarget;
          setMenu(menu?.anchor === trigger ? null : { anchor: trigger });
        }}><MoreHorizontal size={16}/></CandidateIconButton>
      </div>
      <CandidateActionMenu label="更多指令操作" target={menu} actions={menuActions} onDismiss={() => setMenu(null)}/>
    </CandidateToolbar>
    {readOnly && scene && <p className="gc-candidate-command-status" role="status">{session.sourceReadOnly(sceneId)?session.sourceRecoveryNotice(sceneId):'请先应用或还原源码草稿。当前展示最近有效的指令内容。'}</p>}
    {pluginError && <p className="gc-candidate-command-error" role="alert">无法读取扩展指令目录。{pluginError}</p>}
    {problem && action !== 'remove' && <p className="gc-candidate-command-error" role="alert">{problem}</p>}
    <CandidateReviewDialog open={action === 'remove'} title="删除所选指令" busy={busy} onDismiss={() => { if (!busy) setAction(null); }}
      description={`从「${scene?.name}」删除 ${selected.length} 条指令？可通过撤销恢复。`}
      actions={<><CandidateButton disabled={busy} onClick={() => setAction(null)}>取消</CandidateButton>
        <CandidateButton variant="danger" disabled={disabled || !selected.length} onClick={() => void remove()}>确认删除</CandidateButton></>}>
      {problem && <CandidateState kind="error" title={problem}/>}
    </CandidateReviewDialog>
    {moveModel && <CrossSceneMove key={selected.join('/')} model={moveModel} disabled={disabled} busy={busy} close={() => setAction(null)} move={async (targetSceneId, beforeId) => {
      const target = authoring?.scenes.find(item => item.sceneId === targetSceneId);
      if (!target) return;
      const before = capture();
      const result = await run({ op: 'commands.move', sceneId, targetSceneId, beforeId, ids: selected }, scene, target);
      if (result?.ok) {
        rememberEdit(result.value, before, { primary: null, selected: [], anchor: null, scroll: scrollAnchor() });
        setAction(null); setMulti(null); anchor.current = null; session.selectCommand(sceneId, null);
        session.selectCommand(targetSceneId, primary); onOpen?.(`commands:${targetSceneId}`);
      }
    }}/>}
    <div className="gc-candidate-command-body">
      <div ref={list} className="gc-candidate-command-list" role="listbox" aria-label="场景指令" aria-multiselectable="true" onDragOver={event=>{if(canInsert)event.preventDefault();}} onDrop={event=>dropAsset(event,null)}>
        {nodes.map((node, index) => {
          const id = node.id, known = registry.get(node.command), label = known ? commandName(known, locale) : node.command || '无效指令';
          const issues = parsed?.issues.filter(issue => id && issue.source?.statementId === id) ?? [];
          const Icon = known ? commandIcons[commandCategory(node.command) as keyof typeof commandIcons] ?? Puzzle : Puzzle;
          const summary = excerpt(node, known);
          return <Fragment key={id && node.valid ? id : `${node.start}:${index}`}>
            {id && node.valid && gap(id, `第 ${index + 1} 条指令之前`)}
            <div className="gc-candidate-command-row" role="presentation" data-command-row={id && node.valid ? id : undefined}>
              <span className="gc-candidate-command-grip" aria-hidden="true" data-draggable={!disabled && node.valid && Boolean(id)}
                title={!disabled && node.valid ? '拖动排序 · Alt+↑/↓' : undefined}
                onPointerDown={event => { if (id && node.valid) drag(event, id); }}><GripVertical size={16}/></span>
              <CandidateButton className="gc-candidate-command-row-main" ref={value => { if (id && node.valid) { if (value) rowRefs.current.set(id, value); else rowRefs.current.delete(id); } }} type="button" role="option"
                data-statement-id={id ?? undefined} data-command={node.command} aria-selected={Boolean(id && selection.has(id))}
                aria-keyshortcuts="Insert Shift+Insert Alt+ArrowUp Alt+ArrowDown" title={`${label} · ${summary}`}
                tabIndex={id && (primary ? primary === id : ids[0] === id) ? 0 : -1} aria-disabled={!id || !node.valid || undefined}
                onClick={event => { if (id && node.valid) choose(id, event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'one'); }}
                onContextMenu={event => {
                  if (!id || !node.valid) return;
                  event.preventDefault();
                  if (!selection.has(id)) choose(id);
                  event.currentTarget.focus();
                  setMenu({ row: id, anchor: event.currentTarget, point: { x: event.clientX, y: event.clientY } });
                }}
                onDoubleClick={() => { if (!draft) editCommand(node); }} onKeyDown={event => { if (id && node.valid) onRowKey(event, node, id); }}>
                <span className="gc-candidate-command-ordinal">{index + 1}</span>
                <Icon size={16} aria-hidden="true"/>
                <span className="gc-candidate-command-name">{label}</span>
                <span className="gc-candidate-command-excerpt" data-dialogue={node.command === 'say'}>{summary}</span>
                {(!node.valid || !known || issues.length > 0) && <span className="gc-candidate-command-warning">{!node.valid ? '语法错误' : !known ? '缺少指令定义' : '诊断'}</span>}
              </CandidateButton>
            </div>
          </Fragment>;
        })}
        {gap(null, '场景末尾')}
        {!nodes.length && <CandidateState kind="empty" title={scene ? '场景暂无指令' : '请选择一个场景'} description={scene && '使用「插入指令」开始编排。'}/>}
      </div>
      {draft && spec && authoring && <CandidateCommandFields key={`${draft.kind}:${draft.targetId}:${draft.command}`} spec={spec} args={draft.args}
        kind={draft.kind} scene={draft.source} source={authoring} documents={documents} statementId={draft.targetId} figureKind={draft.figureKind}
        position={draft.position} busy={busy} readOnly={readOnly} stale={scene?.revision !== draft.source.revision} onApply={saveFields}
        onClose={() => { setDraft(null); setProblem(''); focusRow(primary); }}/>}
      {!draft && details && current?.valid && <aside className="gc-candidate-command-detail" aria-label="指令属性">
        <header>
          <div><strong>{registry.has(current.command) ? commandName(registry.get(current.command)!, locale) : current.command}</strong><code>{current.command}</code></div>
          <CandidateIconButton label="收起指令属性" onClick={() => { setDetails(false); focusRow(primary); }}><X size={16}/></CandidateIconButton>
        </header>
        <CandidateToolbar className="gc-candidate-command-detail-actions" label="当前指令操作">
          <CandidateButton type="button" disabled={disabled || !registry.has(current.command) || !authoring} onClick={() => editCommand(current)}>编辑字段</CandidateButton>
          {current.command === 'say' && <CandidateButton type="button" onClick={() => { if (current.id) session.revealLine(sceneId, current.id); onOpen?.(`writing:${sceneId}`); }}>定位文稿</CandidateButton>}
        </CandidateToolbar>
        <CandidateSection title="指令原文" collapsible initiallyOpen={false}><pre>{current.raw}</pre></CandidateSection>
      </aside>}
    </div>
    {parsed && parsed.issues.length > 0 && <CandidateSection className="gc-candidate-command-diagnostics" title={`源码诊断 · ${parsed.issues.length}`} collapsible initiallyOpen={readOnly}>
      <ul>{parsed.issues.map((issue, index) => <li key={index}><code>{issue.code}</code> {issue.message}</li>)}</ul>
    </CandidateSection>}
  </section>;
}

function CrossSceneMove({ model, disabled, busy, close, move }: {
  model: ReturnType<typeof buildMoveInstructionsModel>; disabled: boolean; busy: boolean; close(): void; move(targetId: Id, beforeId: Id | null): Promise<void>;
}) {
  const [targetId, setTargetId] = useState(''), [position, setPosition] = useState<MovePosition>('end'), [beforeId, setBeforeId] = useState('');
  const target = model.scenes.find(scene => scene.id === targetId);
  const resolution = target && resolveMovePosition(target, position, beforeId || null, locale);
  return <form className="gc-candidate-command-confirm" onSubmit={event => {
    event.preventDefault();
    if (target && resolution && !resolution.error && !model.error && !disabled) void move(target.id, resolution.beforeId);
  }}>
    <CandidateFieldGroup title={`移动 ${model.instructions.length} 条指令`}>
    <CandidateField label="目标场景"><CandidateSelect searchLabel="查找场景" value={targetId} onValueChange={value => { setTargetId(value); setBeforeId(''); }} disabled={disabled}>
      <option value="">选择场景</option>{model.scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.label}</option>)}
    </CandidateSelect></CandidateField>
    <CandidateField label="插入位置"><CandidateSelect value={position} onValueChange={value => setPosition(value as MovePosition)} disabled={disabled}>
      <option value="end">场景末尾</option><option value="start">场景开头</option><option value="before">指定指令之前</option>
    </CandidateSelect></CandidateField>
    {target && position === 'before' && <CandidateField label="目标指令"><CandidateSelect searchLabel="查找指令" value={beforeId} onValueChange={value => setBeforeId(value)} disabled={disabled}>
      <option value="">选择指令</option>{target.instructions.map((instruction, index) => <option key={instruction.id} value={instruction.id}>{index + 1}. {instruction.name} {instruction.preview}</option>)}
    </CandidateSelect></CandidateField>}
    {(model.error || resolution?.error) && <p role="status">{model.error || resolution?.error}</p>}
    </CandidateFieldGroup>
    <CandidateToolbar label="移动操作">
    <CandidateButton type="button" onClick={close} disabled={busy}>取消</CandidateButton>
    <CandidateButton variant="primary" type="submit" disabled={disabled || !target || Boolean(model.error || resolution?.error)}>移动</CandidateButton>
    </CandidateToolbar>
  </form>;
}
