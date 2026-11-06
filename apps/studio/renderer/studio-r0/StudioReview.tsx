import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { BookOpen, Boxes, ChevronDown, ChevronRight, CircleHelp, Code2, Command, FileText, Film, Folder, Home, LayoutPanelLeft, Moon, PanelLeftClose, Play, Plus, Redo2, Save, Search, Settings, Sparkles, Sun, Undo2, Users, X } from 'lucide-react';
import { ReviewContext, useReview, useReviewState } from './context.js';
import { ReviewStore, sourceLine, sourceTitle, type ReviewSeed, type ReviewServices, type Task } from './model.js';
import { SupportView } from './SupportViews.js';
import { DockWorkspace, type DockHandle, type LayoutPreset } from './DockWorkspace.js';
import { AssetsView, ProjectOverview, SettingsView } from './AuxiliaryViews.js';
import { WritingView } from './views/WritingView.js';
import { SourceView } from './views/SourceView.js';
import { StageView } from './views/StageView.js';
import { InspectorView } from './views/InspectorView.js';
import { PageView, BlueprintView, CharacterView, PsdMappingView, ProductionView } from './workfaces/index.js';
import '../styles/studio-theme.css';
import './studio-r0.css';
export type StudioReviewProps = {
  seed: ReviewSeed;
  services: ReviewServices | (() => ReviewServices);
  initialLayout?: LayoutPreset;
  initialView?: string;
  preferenceKey: string;
  startProduction?: boolean;
  initialExplorer?: boolean;
};
export function StudioReview({
  seed,
  services,
  ...props
}: StudioReviewProps) {
  const [store] = useState(() => new ReviewStore(seed, typeof services === 'function' ? services() : services)),
    generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    return () => {
      queueMicrotask(() => {
        if (generation.current === current) store.dispose();
      });
    };
  }, [store]);
  return <ReviewContext value={store}><Workspace {...props} /></ReviewContext>;
}
function Workspace({
  initialLayout = 'balanced',
  initialView,
  preferenceKey,
  startProduction,
  initialExplorer = true
}: Omit<StudioReviewProps, 'seed' | 'services'>) {
  const store = useReview(),
    state = useReviewState(),
    {
      project,
      ui
    } = state,
    dock = useRef<DockHandle>(null),
    root = useRef<HTMLDivElement>(null);
  const [explorer, setExplorer] = useState(initialExplorer),
    [query, setQuery] = useState(''),
    [menu, setMenu] = useState<'file' | 'layout' | null>(null),
    [help, setHelp] = useState(false),
    [newScene, setNewScene] = useState(false),
    [sceneName, setSceneName] = useState(''),
    [sections, setSections] = useState({
      scenes: true,
      pages: true,
      characters: true
    });
  const [explorerWidth, setExplorerWidth] = useState(216);
  const [presetDialog, setPresetDialog] = useState<'save' | 'restore' | null>(null),
    [presetName, setPresetName] = useState('我的布局');
  const open = (id: string) => dock.current?.open(id);
  useEffect(() => {
    if (startProduction) void store.produce();
  }, []);
  const title = (id: string) => id.startsWith('writing:') ? project.scenes.find(s => s.id === id.slice(8))?.name ?? '文稿' : id.startsWith('source:') ? `${project.scenes.find(s => s.id === id.slice(7))?.name ?? '文稿'} · 源码` : {
    stage: '舞台',
    inspector: '属性',
    assets: '素材',
    page: '开始界面',
    blueprint: '开始界面 · 蓝图',
    character: '角色组合',
    psd: 'PSD 映射',
    production: '素材制作',
    settings: '设置',
    'project-settings': '作品设置',
    connections: '插件与连接',
    backups: '备份与恢复',
    build: '构建与成果',
    overview: '作品概览'
  }[id] ?? id;
  function activate(id: string) {
    const documentId = id.startsWith('writing:') || id.startsWith('source:') ? id.split(':')[1] : undefined;
    if (documentId && store.getSnapshot().ui.sceneId !== documentId) store.activateDocument(documentId);
    store.updateUi(u => {
      if (id.startsWith('writing:') || id.startsWith('source:')) {
        const sceneId = id.split(':')[1]!;
        u.task = 'writing';
        u.focusDocument = sceneId;
      } else if (['page', 'blueprint'].includes(id)) {
        u.task = 'page';
        u.focusDocument = project.page.id;
      } else if (['character', 'psd'].includes(id)) {
        u.task = 'character';
        u.focusDocument = id === 'psd' ? u.importDraft.characterId : u.selected.characterId ?? (u.selected.kind === 'character' ? u.selected.id : project.characters[1]?.id ?? '');
      } else if (['production', 'assets', 'settings'].includes(id)) {
        u.task = id as Task;
        u.focusDocument = id === 'production' ? u.production.characterId : id;
      } else if (['project-settings', 'connections', 'backups', 'build'].includes(id)) {
        u.task = 'settings';
        u.focusDocument = id;
      }
    });
  }
  function preview() {
    const {
      scene,
      line
    } = sourceLine(project, store.source('stage'));
    if (!scene || !line) {
      store.notice('舞台来源中没有可预览的语句');
      return;
    }
    store.updateUi(u => {
      const continuing = u.preview.sceneId === scene.id && u.preview.lineId === line.id;
      const requested = continuing ? u.preview.offset : u.selection?.lineId === line.id ? u.selection.start : 0;
      u.preview = {
        ...u.preview,
        status: continuing && u.preview.status === 'playing' ? 'paused' : 'playing',
        sceneId: scene.id,
        lineId: line.id,
        offset: requested >= line.text.length ? 0 : requested
      };
    });
    open('stage');
  }
  function keydown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.defaultPrevented || e.nativeEvent.isComposing) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const nativeEditor = (e.target as HTMLElement).closest('input, textarea, select, .monaco-editor');
    if (ctrl && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      store.updateUi(u => {
        u.commandOpen = !u.commandOpen;
      });
    } else if (ctrl && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void store.save();
    } else if (ctrl && e.key.toLowerCase() === 'z' && !nativeEditor) {
      e.preventDefault();
      e.shiftKey ? store.redo() : store.undo();
    } else if (ctrl && e.key.toLowerCase() === 'y' && !nativeEditor) {
      e.preventDefault();
      store.redo();
    } else if (e.key === 'F5') {
      e.preventDefault();
      preview();
    } else if (e.key === 'Escape') {
      setMenu(null);
      setHelp(false);
      setNewScene(false);
      store.updateUi(u => {
        u.commandOpen = false;
      });
    }
  }
  function globalKeyCapture(e: KeyboardEvent<HTMLDivElement>) {
    if (e.nativeEvent.isComposing) return;
    if ((e.ctrlKey || e.metaKey) && ['k', 's'].includes(e.key.toLowerCase()) || e.key === 'F5') {
      keydown(e);
      e.stopPropagation();
    }
  }
  const renderView = (id: string) => id.startsWith('writing:') ? <WritingView sceneId={id.slice(8)} onOpen={open} /> : id.startsWith('source:') ? <SourceView sceneId={id.slice(7)} onOpen={open} /> : id === 'stage' ? <StageView onOpen={open} /> : id === 'inspector' ? <InspectorView onOpen={open} /> : id === 'assets' ? <AssetsView onOpen={open} /> : id === 'page' ? <PageView onOpen={open} /> : id === 'blueprint' ? <BlueprintView onOpen={open} /> : id === 'character' ? <CharacterView onOpen={open} /> : id === 'psd' ? <PsdMappingView onOpen={open} /> : id === 'production' ? <ProductionView onOpen={open} /> : id === 'settings' ? <SettingsView /> : ['project-settings', 'connections', 'backups', 'build'].includes(id) ? <SupportView kind={id as 'project-settings' | 'connections' | 'backups' | 'build'} /> : <ProjectOverview onOpen={open} />;
  const tasks = [['writing', '写作', BookOpen, `writing:${ui.sceneId}`], ['page', '页面', LayoutPanelLeft, 'page'], ['character', '角色', Users, 'character'], ['assets', '素材', Boxes, 'assets'], ['production', '制作', Sparkles, 'production']] as const;
  return <div ref={root} className="gc-r0 authoring-shell" data-theme={ui.theme} onKeyDown={keydown} onKeyDownCapture={globalKeyCapture}>
    <header className="gc-r0-topbar"><button className="gc-r0-brand" onClick={() => open('overview')} title="作品概览"><span>G</span>GalCraft</button><div className="gc-r0-menu-anchor"><button onClick={() => setMenu(menu === 'file' ? null : 'file')}>文件<ChevronDown size={11} /></button>{menu === 'file' && <div className="gc-r0-menu" role="menu"><button role="menuitem" onClick={() => {
            open('overview');
            setMenu(null);
          }}>作品概览</button><button role="menuitem" onClick={() => {
            setNewScene(true);
            setMenu(null);
          }}>新建场景</button><button role="menuitem" onClick={() => {
            void store.save();
            setMenu(null);
          }}>保存到审核会话 <kbd>Ctrl S</kbd></button><button role="menuitem" onClick={() => {
            open('psd');
            setMenu(null);
          }}>导入 PSD 映射样例</button><button role="menuitem" onClick={() => {
            open('settings');
            setMenu(null);
          }}>设置</button></div>}</div><button onClick={() => store.updateUi(u => {
        u.commandOpen = true;
      })}>命令</button><button onClick={() => setHelp(true)}>帮助</button><span className="gc-r0-project-name">{project.name}{(state.dirty || project.scenes.some(scene => ui.sourceErrors[scene.id])) && <i title="有未保存修改" />}</span><button className="gc-r0-command-trigger" aria-label="搜索或运行命令" onClick={() => store.updateUi(u => {
        u.commandOpen = true;
      })}><Search size={13} /><span>搜索或运行命令</span><kbd>Ctrl K</kbd></button><button aria-label="切换主题" title="切换主题" onClick={() => store.updateUi(u => {
        u.theme = u.theme === 'light' ? 'dark' : 'light';
      })}>{ui.theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}</button><span className="gc-r0-review-badge">R0 审核</span></header>
    <div className="gc-r0-taskbar"><div className="gc-r0-task-tabs">{tasks.map(([task, name, Icon, view]) => <button key={task} aria-pressed={ui.task === task} className={ui.task === task ? 'is-active' : ''} onClick={() => open(view)}><Icon size={15} />{name}</button>)}</div><span className="gc-r0-spacer" /><button aria-label="撤销" title={`撤销 ${state.undoLabel} · Ctrl Z`} disabled={!state.canUndo} onClick={() => store.undo()}><Undo2 size={15} /></button><button aria-label="重做" disabled={!state.canRedo} onClick={() => store.redo()}><Redo2 size={15} /></button><span className="gc-r0-divider" /><div className="gc-r0-menu-anchor"><button onClick={() => setMenu(menu === 'layout' ? null : 'layout')}><LayoutPanelLeft size={14} /><span>布局</span><ChevronDown size={10} /></button>{menu === 'layout' && <div className="gc-r0-menu" role="menu">{([['balanced', '文稿与舞台并重'], ['writing', '专注写作'], ['source', '文稿与源码并排'], ['page', '页面设计'], ['character', '角色组合'], ['production', '素材制作'], ['stage', '舞台主导'], ['documents', '不同文档并排'], ['custom', '自定义停靠']] as const).map(([id, name]) => <button role="menuitem" key={id} onClick={() => {
            dock.current?.preset(id);
            setMenu(null);
          }}>{name}</button>)}<hr /><button role="menuitem" onClick={() => {
            setPresetDialog('save');
            setPresetName('我的布局');
            setMenu(null);
          }}>保存个人预设</button><button role="menuitem" onClick={() => {
            setPresetDialog('restore');
            setMenu(null);
          }}>恢复个人预设</button><button role="menuitem" onClick={() => {
            setExplorer(!explorer);
            setMenu(null);
          }}>{explorer ? '收起' : '显示'}对象树</button></div>}</div><button disabled={state.saving} onClick={() => void store.save()}><Save size={14} />{state.saving ? '保存中…' : '保存'}</button><button className="gc-r0-primary" title={`预览 ${sourceTitle(project, store.source('stage'))}`} onClick={preview}><Play size={13} />{ui.preview.status === 'playing' ? '暂停剧情' : '剧情预览'}<kbd>F5</kbd></button></div>
    <div className="gc-r0-main"><nav className="gc-r0-activity" aria-label="全局入口"><button title="作品概览" aria-label="作品概览" onClick={() => open('overview')}><Home size={19} /></button><button className={explorer ? 'is-active' : ''} title="对象树" aria-label="切换对象树" onClick={() => setExplorer(!explorer)}><Folder size={19} /></button><button title="全局搜索" aria-label="全局搜索" onClick={() => store.updateUi(u => {
          u.commandOpen = true;
        })}><Search size={19} /></button><button title="当前场景源码" aria-label="当前场景源码" onClick={() => open(`source:${ui.sceneId}`)}><Code2 size={19} /></button><span className="gc-r0-spacer" /><button aria-label="审核说明" title="审核说明" onClick={() => setHelp(true)}><CircleHelp size={18} /></button><button aria-label="设置" title="设置" onClick={() => open('settings')}><Settings size={18} /></button></nav>
      {explorer && <aside className="gc-r0-explorer" style={{
        width: explorerWidth
      }}><div className="gc-r0-explorer-heading"><strong>作品</strong><span className="gc-r0-spacer" /><button aria-label="新建场景" title="新建场景" onClick={() => setNewScene(true)}><Plus size={14} /></button><button aria-label="收起对象树" onClick={() => setExplorer(false)}><PanelLeftClose size={14} /></button></div><label className="gc-r0-tree-search"><Search size={13} /><input aria-label="筛选对象" value={query} onChange={e => setQuery(e.target.value)} placeholder="筛选对象…" /></label><div className="gc-r0-explorer-scroll">
        <button className="gc-r0-tree-section" onClick={() => setSections(s => ({
            ...s,
            scenes: !s.scenes
          }))}>{sections.scenes ? <ChevronDown size={13} /> : <ChevronRight size={13} />}场景<span>{project.scenes.length}</span></button>{sections.scenes && project.scenes.filter(s => s.name.includes(query)).map(scene => <button key={scene.id} title={scene.name} className={`gc-r0-tree-item ${ui.sceneId === scene.id && ui.task === 'writing' ? 'is-selected' : ''}`} onClick={() => open(`writing:${scene.id}`)}><FileText size={14} /><span>{scene.name}</span></button>)}
        <button className="gc-r0-tree-section" onClick={() => setSections(s => ({
            ...s,
            pages: !s.pages
          }))}>{sections.pages ? <ChevronDown size={13} /> : <ChevronRight size={13} />}页面</button>{sections.pages && [{
            id: 'page',
            name: '开始界面'
          }, {
            id: 'blueprint',
            name: '蓝图'
          }].filter(item => item.name.includes(query)).map(item => <button key={item.id} className="gc-r0-tree-item" onClick={() => open(item.id)}><LayoutPanelLeft size={14} />{item.name}</button>)}
        <button className="gc-r0-tree-section" onClick={() => setSections(s => ({
            ...s,
            characters: !s.characters
          }))}>{sections.characters ? <ChevronDown size={13} /> : <ChevronRight size={13} />}角色<span>{project.characters.length}</span></button>{sections.characters && project.characters.filter(c => c.name.includes(query)).map(c => <button key={c.id} className={`gc-r0-tree-item ${ui.selected.id === c.id ? 'is-selected' : ''}`} onClick={() => {
            store.select({
              kind: 'character',
              documentId: c.id,
              id: c.id
            });
            open('character');
          }}><img src={`/practice/figures/${c.prefix}-neutral.png`} alt="" /><span>{c.name}</span></button>)}
        <button className="gc-r0-tree-section" onClick={() => open('assets')}><Boxes size={14} />素材库<span>{project.assets.length}</span></button><button className="gc-r0-tree-item" onClick={() => open('psd')}><Plus size={14} />PSD 组合映射</button><button className="gc-r0-tree-item" onClick={() => open('production')}><Sparkles size={14} />制作表情素材</button></div><div className="gc-r0-tree-footer"><span className="gc-r0-status-dot" />会话作品 · 本地审核</div><div role="separator" aria-orientation="vertical" aria-label="调整对象树宽度" tabIndex={0} className="gc-r0-explorer-resize" onKeyDown={e => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            setExplorerWidth(w => Math.max(160, Math.min(360, w + (e.key === 'ArrowRight' ? 8 : -8))));
          }
        }} onPointerDown={e => {
          const el = e.currentTarget;
          el.setPointerCapture(e.pointerId);
          const start = e.clientX,
            original = explorerWidth;
          const move = (event: PointerEvent) => setExplorerWidth(Math.max(160, Math.min(360, original + event.clientX - start)));
          const end = () => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', end);
            el.removeEventListener('pointercancel', end);
          };
          el.addEventListener('pointermove', move);
          el.addEventListener('pointerup', end);
          el.addEventListener('pointercancel', end);
        }} /></aside>}
      <DockWorkspace ref={dock} sceneId={ui.sceneId} sceneIds={project.scenes.map(s => s.id)} storageKey={`galcraft-r0:${preferenceKey}`} initial={initialLayout} initialView={initialView} renderView={renderView} title={title} onActivate={activate} notice={message => store.notice(message)} />
    </div>
    {state.error && <div className="gc-r0-error-bar" role="alert"><span>{state.error}</span><button onClick={() => void store.save()}>重试保存</button></div>}
    <footer className="gc-r0-statusbar"><span className="gc-r0-status-dot" /><span role="status">{ui.notice}</span><span className="gc-r0-spacer" /><span>{project.scenes.reduce((n, s) => n + s.lines.length, 0)} 句</span><span>{project.scenes.some(scene => ui.sourceErrors[scene.id]) ? '源码草稿有错误，尚未保存' : state.dirty ? '有未保存修改' : '会话已保存'}</span><span>UTF-8</span><button onClick={() => setHelp(true)}>确定性审核服务</button></footer>
    {ui.commandOpen && <CommandPalette open={open} close={() => store.updateUi(u => {
      u.commandOpen = false;
    })} />}
    {help && <Modal title="R0 审核说明" close={() => setHelp(false)}><p>三个入口共享同一套工作面与语义操作。每个 Story 使用独立作品。</p><p>可以连续写作、插入句内事件、检查舞台、修改属性、撤销，以及切换回来继续编辑。拖动标签可跨区停靠；按住 Alt 拖动可在窗口内浮动。</p><p>保存、素材制作和 PSD 输入使用确定性审核服务。磁盘保存、AI 生成、真实 PSD 解析和正式运行流程将在后续批次接入。</p><button className="gc-r0-primary" onClick={() => setHelp(false)}>开始审核</button></Modal>}
    {presetDialog && <Modal title={presetDialog === 'save' ? '保存个人布局' : '恢复个人布局'} close={() => setPresetDialog(null)}>{presetDialog === 'save' ? <form onSubmit={e => {
        e.preventDefault();
        if (presetName.trim()) {
          dock.current?.savePreset(presetName.trim());
          setPresetDialog(null);
        }
      }}><label>布局名称<input autoFocus aria-label="布局名称" value={presetName} onChange={e => setPresetName(e.target.value)} maxLength={60} /></label><p>跨作品复用面板与分屏安排，文档按当前作品的场景位置映射。</p><div className="gc-r0-dialog-actions"><button type="button" onClick={() => setPresetDialog(null)}>取消</button><button className="gc-r0-primary" disabled={!presetName.trim()}>保存预设</button></div></form> : <div className="gc-r0-command-results">{(dock.current?.listPresets() ?? []).map(name => <button key={name} onClick={() => {
          dock.current?.restorePreset(name);
          setPresetDialog(null);
        }}><LayoutPanelLeft size={16} />{name}</button>)}{!dock.current?.listPresets().length && <p>还没有个人布局。调整工作面后，可通过布局菜单保存。</p>}</div>}</Modal>}
    {newScene && <Modal title="新建场景" close={() => setNewScene(false)}><form onSubmit={e => {
        e.preventDefault();
        if (!sceneName.trim()) return;
        const id = crypto.randomUUID();
        store.edit('新建场景', p => p.scenes.push({
          id,
          name: sceneName.trim(),
          background: p.scenes[0]?.background ?? '',
          lines: [{
            id: crypto.randomUUID(),
            speakerId: null,
            text: '',
            events: []
          }],
          cast: structuredClone(p.scenes[0]?.cast ?? {})
        }));
        setNewScene(false);
        setSceneName('');
        open(`writing:${id}`);
      }}><label>场景名称<input autoFocus value={sceneName} onChange={e => setSceneName(e.target.value)} placeholder="例如：河边 · 明年春天" required maxLength={160} /></label><div className="gc-r0-dialog-actions"><button type="button" onClick={() => setNewScene(false)}>取消</button><button className="gc-r0-primary" disabled={!sceneName.trim()}>创建</button></div></form></Modal>}
  </div>;
}
function Modal({
  title,
  close,
  children,
  restoreFocus,
  variant
}: {
  title: string;
  close(): void;
  children: React.ReactNode;
  restoreFocus?: {
    current: boolean;
  };
  variant?: 'command';
}) {
  const ref = useRef<HTMLDivElement>(null),
    previousFocus = useRef(document.activeElement as HTMLElement | null);
  const previousRange = useRef(document.getSelection()?.rangeCount ? document.getSelection()!.getRangeAt(0).cloneRange() : null);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('input,textarea,select') ?? ref.current?.querySelector<HTMLElement>('button');
    first?.focus();
    return () => {
      if (restoreFocus?.current === false || !previousFocus.current?.isConnected) return;
      previousFocus.current.focus({
        preventScroll: true
      });
      if (previousFocus.current.isContentEditable && previousRange.current?.commonAncestorContainer.isConnected) {
        const selection = document.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(previousRange.current);
      }
    };
  }, []);
  return <div className={`gc-r0-modal-backdrop ${variant === 'command' ? 'gc-r0-command-backdrop' : ''}`} onPointerDown={e => {
    if (e.target === e.currentTarget) close();
  }}><div ref={ref} className="gc-r0-modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
      if (e.key === 'Tab') {
        const nodes = [...ref.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,[tabindex="0"]')];
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }}><header><h2>{title}</h2><button aria-label="关闭对话框" onClick={close}><X size={17} /></button></header>{children}</div></div>;
}
function CommandPalette({
  open,
  close
}: {
  open(id: string): void;
  close(): void;
}) {
  const restoreFocus = useRef(true);
  const results = useRef<HTMLDivElement>(null),
    resultId = useId();
  const store = useReview(),
    {
      project,
      ui
    } = useReviewState(),
    [query, setQuery] = useState(''),
    [index, setIndex] = useState(0);
  const commands = [...project.scenes.flatMap(s => [{
    name: `打开文稿 · ${s.name}`,
    run: () => open(`writing:${s.id}`)
  }, {
    name: `打开源码 · ${s.name}`,
    run: () => open(`source:${s.id}`)
  }]), ...project.characters.map(c => ({
    name: `角色 · ${c.name}`,
    run: () => {
      store.select({
        kind: 'character',
        id: c.id,
        documentId: c.id
      });
      open('character');
    }
  })), ...([['stage', '舞台'], ['inspector', '属性'], ['assets', '素材'], ['page', '开始界面'], ['blueprint', '蓝图'], ['psd', 'PSD 映射'], ['production', '素材制作'], ['settings', '设置'], ['project-settings', '作品设置'], ['connections', '插件与连接'], ['backups', '备份与恢复'], ['build', '构建与成果']] as const).map(([id, name]) => ({
    name: `打开${name}`,
    run: () => open(id)
  })), {
    name: '保存当前审核作品',
    run: () => void store.save()
  }, {
    name: '撤销上一步',
    run: () => store.undo()
  }, {
    name: '切换浅色 / 深色',
    run: () => store.updateUi(u => {
      u.theme = u.theme === 'light' ? 'dark' : 'light';
    })
  }, ...project.scenes.flatMap(s => s.lines.filter(l => query.length > 1 && l.text.includes(query)).slice(0, 12).map(l => ({
    name: `${s.name} / ${l.text}`,
    run: () => {
      open(`writing:${s.id}`);
      store.revealLine(s.id, l.id, l.text.indexOf(query));
    }
  })))].filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
  const run = (i: number) => {
    const c = commands[i];
    if (c) {
      restoreFocus.current = false;
      close();
      c.run();
    }
  };
  useEffect(() => {
    results.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({
      block: 'nearest'
    });
  }, [index, query]);
  const targetName = ui.task === 'character' ? project.characters.find(c => c.id === (ui.selected.characterId ?? (ui.selected.kind === 'character' ? ui.selected.id : ui.focusDocument)))?.name : ui.task === 'production' ? project.characters.find(c => c.id === ui.production.characterId)?.name : project.scenes.find(s => s.id === ui.focusDocument)?.name ?? (ui.focusDocument === project.page.id ? project.page.name : {
    assets: '素材库',
    settings: '设置',
    'project-settings': '作品设置',
    connections: '插件与连接',
    backups: '备份与恢复',
    build: '构建与成果'
  }[ui.focusDocument]);
  return <Modal title="命令与作品搜索" close={close} restoreFocus={restoreFocus} variant="command"><input autoFocus className="gc-r0-command-input" role="combobox" aria-expanded="true" aria-controls={`${resultId}-results`} aria-activedescendant={commands.length ? `${resultId}-${index}` : undefined} aria-autocomplete="list" aria-label="搜索命令或作品内容" placeholder="搜索命令、场景、角色或文稿内容…" value={query} onChange={e => {
      setQuery(e.target.value);
      setIndex(0);
    }} onKeyDown={e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex(i => Math.max(0, Math.min(commands.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        run(index);
      }
    }} /><div ref={results} id={`${resultId}-results`} className="gc-r0-command-results" role="listbox" aria-label="命令搜索结果">{commands.map((c, i) => <button id={`${resultId}-${i}`} key={`${c.name}-${i}`} role="option" aria-selected={i === index} className={i === index ? 'is-selected' : ''} onMouseEnter={() => setIndex(i)} onClick={() => run(i)}><Command size={14} /><span>{c.name}</span>{i === index && <kbd>Enter</kbd>}</button>)}{!commands.length && <p>没有找到匹配的命令或内容。</p>}</div><small>命令目标：{targetName ?? '当前工作面'}</small></Modal>;
}
