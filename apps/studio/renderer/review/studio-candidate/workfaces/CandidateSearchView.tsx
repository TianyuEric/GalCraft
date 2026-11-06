import { CandidateButton, CandidateField, CandidateFieldGroup, CandidateInput, CandidateSection, CandidateSelect, CandidateState } from '../components/controls/index.js';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Search } from 'lucide-react';
import type { Asset, SemanticHit } from '@galcraft/contracts';
import { parse } from '@galcraft/dsl';
import { initialSidebarState, runSidebarSearch, type SidebarState } from '../../../authoring/sidebar.js';
import { useCandidate, useCandidateState } from '../application/context.js';
import { authoringSource, documentData } from '../application/documents.js';
import { candidateWorkfaces } from '../application/workfaces.js';
import { openStructureTarget } from './CandidateStructureView.js';
import type { WritingReturn } from './CandidateWritingView.js';
import '../styles/search.css';

type SearchFields = Pick<SidebarState, 'mode' | 'term' | 'target' | 'scope' | 'variableAccess'>;
type Origin = { view: string; sceneId: string | null; statementId: string | null; writing?: WritingReturn['position'] };
const pageSize = 40;
const uses = { dialogue: '对白', read: '读取', write: '写入', assetUse: '引用素材', bgmPlay: '播放 BGM', bgmStop: '停止 BGM' } as const;

export function CandidateSearchView({ onOpen }: { onOpen(id: string): void }) {
  const store = useCandidate(), state = useCandidateState();
  const [search, setSearch] = useState<SidebarState>(() => ({ ...(store.viewState<SidebarState>('search:state') ?? initialSidebarState()), searching: false }));
  const [origin, setOrigin] = useState<Origin | undefined>(() => store.viewState('search:origin'));
  const [scopeScene, setScopeScene] = useState(() => store.viewState<string>('search:scopeScene') ?? '');
  const [locateError, setLocateError] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const source = useMemo(() => authoringSource(store.host.list()), [store, state.project]);
  const assets = useMemo(() => documentData<{ assets: Asset[] }>(store.host.list(), 'assets/index.json')?.assets ?? [], [store, state.project]);
  const currentScene = source.scenes.find(scene => scene.sceneId === state.ui.sceneId);
  const scenes = new Map(source.scenes.map(scene => [scene.sceneId, scene]));
  const page = search.page;
  const affected = page?.coverage.filter(item => item.state !== 'complete') ?? [];

  function update(next: SidebarState) { setSearch(next); store.rememberViewState('search:state', next); }
  function change(fields: Partial<SearchFields>) {
    generation.current++;
    setLocateError('');
    update({ ...search, ...fields, page: null, offset: 0, error: '', hasSearched: false, searching: false });
  }
  async function run(offset = 0, scoped = currentScene?.sceneId ?? '') {
    const id = ++generation.current, next = { ...search, offset, error: '', page: null };
    setScopeScene(scoped); store.rememberViewState('search:scopeScene', scoped); setLocateError('');
    const result = runSidebarSearch({ services: store.services, source: authoringSource(store.host.list()), sceneId: scoped || null, state: next, locale: 'zh-CN' });
    update({ ...next });
    await result;
    if (generation.current === id) update(next);
  }

  function captureOrigin() {
    if (origin) return;
    const snap = store.getSnapshot(), saved = store.viewState<string>('search:editorOrigin');
    const view = snap.activeView && (candidateWorkfaces[snap.activeView]?.zone ?? 'center') === 'center' ? snap.activeView : saved ?? (currentScene ? `writing:${currentScene.sceneId}` : '');
    if (!view) return;
    const sceneId = /^(writing|source|commands):(.+)$/.exec(view)?.[2] ?? null;
    const location: Origin = { view, sceneId, statementId: sceneId ? store.commandSelection(sceneId) : null, writing: sceneId ? store.writingPosition(sceneId) : undefined };
    setOrigin(location); store.rememberViewState('search:origin', location);
  }

  function locate(hit: SemanticHit) {
    const location = hit.source, documents = store.host.list();
    const document = documents.find(item => item.documentId === location.documentId);
    if (!document || location.revision !== document.revision) { setLocateError('来源已变化，请重新查找后再定位。'); return; }
    const scene = source.scenes.find(item => item.documentId === location.documentId);
    if (scene && location.statementId) {
      const statement = parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }).cst
        .find(node => node.id === location.statementId && node.valid);
      if (!statement) { setLocateError('这条指令已移除，请重新查找。'); return; }
      captureOrigin(); setLocateError('');
      const line = statement.command === 'say' && state.project.scenes.find(item => item.id === scene.sceneId)?.lines.find(item => item.id === location.statementId);
      if (line) {
        const offset = search.mode === 'text' ? Math.max(0, line.text.indexOf(search.term)) : 0;
        onOpen(`writing:${scene.sceneId}`); store.revealLine(scene.sceneId, line.id, offset);
      } else if (store.sourceReadOnly(scene.sceneId)) {
        onOpen(`source:${scene.sceneId}`); store.selectCommand(scene.sceneId, statement.id!);
      } else {
        onOpen(`commands:${scene.sceneId}`); store.selectCommand(scene.sceneId, statement.id!);
      }
      return;
    }
    const paths = Object.keys(document.files);
    const path = paths.find(path => /^(project\.json$|ui\/pages\/|characters\/)/.test(path));
    if (scene) {
      captureOrigin(); openStructureTarget(store, { kind: 'scene', id: scene.sceneId }); onOpen('structure');
    } else if (path === 'project.json') {
      const section = location.field?.startsWith('/data/display/') ? 'startup' : 'project';
      captureOrigin(); store.rememberViewState('settings:section', section);
      store.rememberViewState('settings:sectionRequest', { section, serial: (store.viewState<{ serial: number }>('settings:sectionRequest')?.serial ?? 0) + 1 });
      onOpen('settings');
    } else if (path?.startsWith('ui/pages/') || path?.startsWith('characters/')) {
      const data = JSON.parse(document.files[path]!).data as { key?: string; id?: string };
      const view = path.startsWith('ui/pages/') ? data.key && `page:${data.key}` : data.id && `character:${data.id}`;
      if (!view) { setLocateError('来源文档未提供可打开的对象身份。'); return; }
      captureOrigin(); onOpen(view);
    } else {
      setLocateError(`此引用没有可定位的编辑入口：${paths[0] ?? location.documentId}${location.field ? ` · ${location.field}` : ''}`);
      return;
    }
    setLocateError('');
  }

  function returnToOrigin() {
    if (!origin) return;
    if (origin.sceneId && !scenes.has(origin.sceneId)) { setLocateError('原场景已移除。'); return; }
    if (origin.sceneId && origin.view.startsWith('writing:') && origin.writing) {
      store.rememberWriting(origin.sceneId, origin.writing);
      store.rememberViewState(`search:return:${origin.sceneId}`, { position: origin.writing, serial: performance.now() });
    }
    onOpen(origin.view);
    if (origin.sceneId && !origin.view.startsWith('writing:')) store.selectCommand(origin.sceneId, origin.statementId);
    setOrigin(undefined); store.rememberViewState('search:origin', undefined); setLocateError('');
  }

  function resultMeta(hit: SemanticHit) {
    const { source: location } = hit;
    const scene = hit.sceneId ? scenes.get(hit.sceneId) : undefined;
    const line = scene && location.range ? scene.text.slice(0, location.range.start).split('\n').length : null;
    return [hit.uses.map(use => uses[use]).join('、'), hit.command, line ? `第 ${line} 行` : location.field].filter(Boolean).join(' · ');
  }

  const groupHits = new Map<string | null, SemanticHit[]>();
  for (const hit of page?.items ?? []) groupHits.set(hit.sceneId, [...(groupHits.get(hit.sceneId) ?? []), hit]);
  const canSearch = search.mode === 'text' ? !!search.term.trim() : search.mode === 'variable' || search.mode === 'asset' ? !!search.target : true;
  const selectTarget = (target: string) => change({ target });
  const mode = search.mode;
  return <aside className="candidate-semantic-search" aria-label="语义查找">
    <form aria-label="查找条件" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (canSearch && !search.searching) void run(); }}>
      <CandidateFieldGroup className="candidate-semantic-conditions">
      <CandidateField label="查找类型"><CandidateSelect value={mode} onValueChange={value => change({ mode: value as SidebarState['mode'], target: '' })}>
        <option value="text">对白正文</option><option value="dialogue">角色对白</option><option value="variable">变量读写</option><option value="asset">素材引用</option><option value="bgm">BGM</option>
      </CandidateSelect></CandidateField>
      {mode === 'text' && <CandidateField label="正文关键词"><CandidateInput type="search" value={search.term} onChange={event => change({ term: event.target.value })} placeholder="输入对白中的文字"/></CandidateField>}
      {mode === 'dialogue' && <CandidateField label="说话人"><CandidateSelect searchLabel="查找角色" value={search.target} onValueChange={selectTarget}><option value="">旁白</option>{source.characters.map(character => <option value={character.id} key={character.id}>{character.name}</option>)}</CandidateSelect></CandidateField>}
      {mode === 'variable' && <>
        <CandidateField label="变量"><CandidateSelect searchLabel="查找变量" value={search.target} onValueChange={selectTarget}><option value="">请选择变量</option>{source.variables?.map(variable => <option value={variable.id} key={variable.id}>{variable.name} · {variable.declaringSceneId ? scenes.get(variable.declaringSceneId)?.name ?? '局部' : variable.scope === 'longTerm' ? '长期' : '进度'}</option>)}</CandidateSelect></CandidateField>
        <CandidateField label="访问方式"><CandidateSelect value={search.variableAccess} onValueChange={value => change({ variableAccess: value as SidebarState['variableAccess'] })}><option value="both">读取和写入</option><option value="read">只查读取</option><option value="write">只查写入</option></CandidateSelect></CandidateField>
      </>}
      {(mode === 'asset' || mode === 'bgm') && <CandidateField label={mode === 'bgm' ? '音乐' : '素材'}><CandidateSelect searchLabel="查找素材" value={search.target} onValueChange={selectTarget}>
        <option value="">{mode === 'bgm' ? '全部音乐及停止指令' : '请选择素材'}</option>{assets.filter(asset => mode !== 'bgm' || asset.kind === 'audio').map(asset => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
      </CandidateSelect></CandidateField>}
      <CandidateField label="查找范围"><CandidateSelect value={search.scope} onValueChange={value => change({ scope: value as SidebarState['scope'] })}><option value="project">全作品</option><option value="scene">当前场景{currentScene ? `：${currentScene.name}` : ''}</option></CandidateSelect></CandidateField>
      </CandidateFieldGroup>
      <CandidateButton variant="primary" type="submit" disabled={!canSearch || search.searching}><Search size={14} aria-hidden="true"/>查找</CandidateButton>
    </form>
    <section className="candidate-semantic-results" aria-label="查找结果" aria-busy={search.searching}>
      {origin && <CandidateButton type="button" onClick={returnToOrigin}><ArrowLeft size={14} aria-hidden="true"/>返回原位置</CandidateButton>}
      {(search.error || locateError) && <CandidateState kind="error" title={locateError || search.error}/>}
      {search.searching ? <CandidateState kind="loading" title="正在查找"/> : !search.error && <p role="status">{page ? `${page.total} 个结果 · ${search.scope === 'scene' ? scenes.get(scopeScene)?.name ?? '当前场景' : '全作品'}` : '查找对白、角色发言和指令中的引用。'}</p>}
      {!!affected.length && <CandidateSection className="candidate-semantic-coverage" title={`${affected.length} 个来源解析不完整`} collapsible initiallyOpen={false}>
        <ul>{affected.map(item => <li key={item.documentId}>{source.scenes.find(scene => scene.documentId === item.documentId)?.name ?? '作品配置'}：{item.state === 'unavailable' ? '无法解析' : '部分解析'}{item.issues[0]?.message ? ` · ${item.issues[0].message}` : ''}</li>)}</ul>
      </CandidateSection>}
      {page?.total === 0 && <CandidateState kind="empty" title="没有匹配结果"/>}
      {[...groupHits].map(([id, hits]) => <CandidateSection key={id ?? 'project'} className="candidate-semantic-group" title={id ? scenes.get(id)?.name ?? '场景' : '作品配置'}>
        <ul>{hits.map((hit, index) => <li key={`${hit.source.documentId}:${hit.source.statementId ?? hit.source.field}:${index}`}>
          <CandidateButton type="button" className="candidate-semantic-hit" onClick={() => locate(hit)}>
            <span><strong>{hit.context.current || hit.label}</strong><ArrowUpRight size={14} aria-hidden="true"/></span>
            <small>{resultMeta(hit)}</small>
            {hit.context.before && <small>前：{hit.context.before}</small>}
            {hit.context.after && <small>后：{hit.context.after}</small>}
          </CandidateButton>
        </li>)}</ul>
      </CandidateSection>)}
      {page && page.total > pageSize && <nav aria-label="查找结果分页">
        <CandidateButton type="button" disabled={page.offset === 0} onClick={() => void run(Math.max(0, page.offset - pageSize), scopeScene)}>上一页</CandidateButton>
        <span>{page.offset + 1}–{page.offset + page.items.length}</span>
        <CandidateButton type="button" disabled={page.offset + pageSize >= page.total} onClick={() => void run(page.offset + pageSize, scopeScene)}>下一页</CandidateButton>
      </nav>}
    </section>
  </aside>;
}
