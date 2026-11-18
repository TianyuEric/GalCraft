import type { Asset, AssetKind, Id, SemanticHit, SemanticPage, SemanticQuery, Source, WorkspaceResume } from '@galcraft/contracts';
import { parse } from '@galcraft/dsl';
import { queryDialogueText } from './controller.js';
import type { AuthoringServices, AuthoringSource, StudioLocale } from './controller.js';
import { openAssetPicker } from './asset-picker.js';
import { actionIcon } from '../components/action-icon.js';
import './sidebar.css';

export type SemanticSearchResume = NonNullable<NonNullable<WorkspaceResume['workbench']>['semanticSearch']>;
type SearchMode = SemanticSearchResume['mode'];
export type SidebarState = SemanticSearchResume & {
  page: SemanticPage | null; searching: boolean; error: string; located: boolean; searchGeneration: number;
};
export function initialSidebarState(saved?: SemanticSearchResume): SidebarState {
  return { mode: 'text', term: '', target: '', targetLabel: '', scope: 'project', variableAccess: 'both',
    offset: 0, hasSearched: false, searchScrollTop: 0, ...saved,
    page: null, searching: false, error: '', located: false, searchGeneration: 0 };
}

type SearchOptions = { services: AuthoringServices; source: AuthoringSource; sceneId: Id | null; state: SidebarState; locale?: StudioLocale };
export type AuthoringSidebarOptions = SearchOptions & {
  locale: StudioLocale; cache(asset: Asset): void; locate(source: Source): Promise<void>; returnToOrigin?(): Promise<void>; changed?(): void;
};
const ALL_KINDS: AssetKind[] = ['image', 'audio', 'video', 'font', 'live2d', 'texture', 'animation', 'effect'];
const SEARCH_LIMIT = 40;

/** Runs against the current working documents, so unsaved dialogue remains searchable. */
export async function runSidebarSearch({ services, source, sceneId, state, locale = 'zh-CN' }: SearchOptions): Promise<SemanticPage | null> {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const generation = ++state.searchGeneration;
  state.searching = true; state.error = ''; state.hasSearched = true;
  try {
    const sceneIds = state.scope === 'scene' ? sceneId ? [sceneId] : [] : undefined;
    if (state.scope === 'scene' && !sceneId) throw new Error(t('请先选择场景。', 'Select a scene first.', 'シーンを選択してください。'));
    let page: SemanticPage;
    if (state.mode === 'text') {
      if (!state.term.trim()) { state.page = null; state.hasSearched = false; return null; }
      const scoped = sceneIds ? { ...source, scenes: source.scenes.filter(scene => sceneIds.includes(scene.sceneId)) } : source;
      page = queryDialogueText(scoped, state.term, state.offset);
      addDialogueContext(scoped, page);
    } else {
      let filter: SemanticQuery['filter'];
      if (state.mode === 'dialogue') filter = { kind: 'dialogue', speaker: state.target ? { kind: 'character', id: state.target } : { kind: 'narrator' } };
      else if (state.mode === 'variable') {
        const variable = source.variables?.find(item => item.id === state.target);
        if (!variable) throw new Error(t('请选择变量。', 'Select a variable.', '変数を選択してください。'));
        filter = { kind: 'variable', id: variable.id, scope: variable.scope, declaringSceneId: variable.declaringSceneId, access: state.variableAccess };
      } else if (state.mode === 'asset') {
        if (!state.target) throw new Error(t('请选择素材。', 'Select an asset.', '素材を選択してください。'));
        filter = { kind: 'asset', id: state.target };
      } else filter = { kind: 'bgm', assetId: state.target || null, includeChannelStops: true };
      if (!services.searchSemantic) throw new Error(t('查找服务尚未就绪。', 'Search is unavailable.', '検索サービスを利用できません。'));
      const result = await services.searchSemantic(filter, state.offset, sceneIds);
      if (!result.ok) throw new Error(result.error.message);
      page = result.value;
    }
    if (generation !== state.searchGeneration) return null;
    state.page = page; return page;
  } catch (error) {
    if (generation === state.searchGeneration) { state.error = String(error instanceof Error ? error.message : error); state.page = null; }
    return null;
  } finally { if (generation === state.searchGeneration) state.searching = false; }
}

function addDialogueContext(source: AuthoringSource, page: SemanticPage): void {
  for (const scene of source.scenes) {
    const hits = page.items.filter(hit => hit.sceneId === scene.sceneId); if (!hits.length) continue;
    const statements = parse({ documentId: scene.documentId, revision: scene.revision, text: scene.text }).cst.filter(node => node.valid && node.id);
    const caption = (index: number) => {
      const node = statements[index]; if (!node) return null;
      const value = node.object?.value as Record<string, unknown> | undefined;
      return node.command === 'say' ? String(value?.text ?? '') : node.command ?? null;
    };
    for (const hit of hits) {
      const index = statements.findIndex(node => node.id === hit.source.statementId);
      if (index >= 0) hit.context = { before: caption(index - 1), current: hit.context.current, after: caption(index + 1) };
    }
  }
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag); result.className = className; result.textContent = text; return result;
}
function button(label: string, action: () => void | Promise<void>, className = ''): HTMLButtonElement {
  const result = node('button', className, label); result.type = 'button'; result.onclick = () => { void action(); }; return result;
}
function select<T extends string>(label: string, values: [T, string][], value: T, change: (value: T) => void): HTMLSelectElement {
  const result = node('select'); result.ariaLabel = label;
  for (const [key, text] of values) { const option = node('option', '', text); option.value = key; result.append(option); }
  result.value = value; result.onchange = () => change(result.value as T); return result;
}
function highlight(text: string, term: string): DocumentFragment {
  const content = document.createDocumentFragment(); let start = 0;
  if (!term) { content.append(document.createTextNode(text)); return content; }
  for (let at = text.indexOf(term); at >= 0; at = text.indexOf(term, start)) {
    content.append(document.createTextNode(text.slice(start, at)), node('mark', '', text.slice(at, at + term.length))); start = at + term.length;
  }
  content.append(document.createTextNode(text.slice(start))); return content;
}

export function createAuthoringSidebar(options: AuthoringSidebarOptions) {
  const { services, state, locale } = options;
  let { source, sceneId } = options;
  let sceneRevision = source.scenes.find(scene => scene.sceneId === sceneId)?.revision;
  let searchedSceneId: Id | null = null;
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const root = node('section', 'authoring-sidebar'); root.ariaLabel = t('语义查找', 'Semantic search', '意味検索');
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let rendered: { page: SidebarState['page']; searching: boolean; error: string; located: boolean; hasSearched: boolean } | undefined;
  const searchControls = node('div', 'sidebar-controls'), targets = node('div', 'sidebar-targets');
  const query = node('input'); query.type = 'search'; query.value = state.term;
  query.placeholder = t('搜索对白正文…', 'Search dialogue text…', 'セリフ本文を検索…'); query.ariaLabel = query.placeholder;
  const filters = node('div', 'sidebar-filters');
  const mode = select<SearchMode>(t('查找类型', 'Search type', '検索の種類'), [
    ['text', t('正文', 'Text', '本文')], ['dialogue', t('角色对白', 'Speaker', '話者')], ['variable', t('变量', 'Variable', '変数')],
    ['asset', t('素材引用', 'Asset usage', '素材参照')], ['bgm', t('BGM', 'BGM', 'BGM')],
  ], state.mode, value => {
    state.mode = value; state.target = ''; state.targetLabel = ''; resetSearch(); drawTargets();
    if (value === 'dialogue' || value === 'bgm') void search(); else options.changed?.();
  });
  const scope = select<'project' | 'scene'>(t('查找范围', 'Search scope', '検索範囲'), [
    ['project', t('当前作品', 'Project', '作品全体')], ['scene', t('当前场景', 'Scene', '現在のシーン')],
  ], state.scope, value => { state.scope = value; state.offset = 0; drawSource(); void search(); });
  filters.append(mode, scope); searchControls.append(query, filters, targets);
  const sourceLabel = node('p', 'sidebar-source'); sourceLabel.setAttribute('role', 'status');
  const searchSummary = node('div', 'sidebar-summary'); searchSummary.setAttribute('aria-live', 'polite');
  const searchResults = node('div', 'sidebar-results'), searchPaging = node('div', 'sidebar-paging');
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    if (searchResults.clientHeight) searchResults.scrollTop = state.searchScrollTop;
  });
  resize?.observe(searchResults);
  searchResults.onscroll = () => {
    if (state.searching || !state.page || !searchResults.clientHeight || state.searchScrollTop === searchResults.scrollTop) return;
    state.searchScrollTop = searchResults.scrollTop;
    options.changed?.();
  };
  root.append(searchControls, sourceLabel, searchSummary, searchResults, searchPaging);
  query.oninput = () => {
    state.term = query.value; state.offset = 0; state.hasSearched = Boolean(state.term.trim()); state.searchGeneration++;
    options.changed?.(); clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchTimer = undefined; void search(); }, 180);
  };
  query.onkeydown = event => { if (event.key === 'Enter' && !event.isComposing) { clearTimeout(searchTimer); void search(); } };

  function resetSearch() {
    clearTimeout(searchTimer); searchTimer = undefined; state.searchGeneration++;
    state.offset = 0; state.page = null; state.error = ''; state.hasSearched = false; state.searching = false;
    state.searchScrollTop = 0; drawSearch();
  }
  async function search(resetScroll = true) {
    if (disposed) return;
    if (resetScroll) state.searchScrollTop = 0;
    clearTimeout(searchTimer); searchTimer = undefined;
    if (state.scope === 'scene' && sceneId) searchedSceneId = sceneId;
    const pending = runSidebarSearch({ ...options, source, sceneId });
    const generation = state.searchGeneration;
    drawSearch();
    if (resetScroll) options.changed?.();
    await pending;
    if (state.searchGeneration !== generation) return;
    drawSearch();
  }
  function drawSource() {
    const currentScene = source.scenes.find(scene => scene.sceneId === sceneId);
    const unavailable = state.scope === 'scene' && !currentScene;
    const label = state.scope === 'project' ? source.project.name : currentScene?.name
      ?? t('打开场景以查找当前场景，或切换到当前作品。', 'Open a scene to search it, or switch to Project.', 'シーンを開くか、作品全体に切り替えてください。');
    if (sourceLabel.textContent !== label) sourceLabel.textContent = label;
    query.disabled = mode.disabled = unavailable;
    targets.inert = unavailable;
  }
  function drawTargets() {
    query.hidden = state.mode !== 'text'; targets.replaceChildren();
    targets.dataset.mode = state.mode; targets.dataset.target = state.target;
    if (state.mode === 'dialogue') {
      const values: [string, string][] = [['', t('旁白', 'Narrator', 'ナレーション')], ...source.characters.map(character => [character.id, character.name] as [string, string])];
      targets.append(select(t('对白角色', 'Dialogue speaker', 'セリフの話者'), values, state.target, value => { state.target = value; state.offset = 0; void search(); }));
    } else if (state.mode === 'variable') {
      const variables = source.variables ?? [];
      const values: [string, string][] = [['', t('选择变量…', 'Choose variable…', '変数を選択…')], ...variables.map(variable => [variable.id, variable.name] as [string, string])];
      targets.append(select(t('变量', 'Variable', '変数'), values, state.target, value => { state.target = value; state.offset = 0; void search(); }));
      const access = node('div', 'sidebar-chips');
      for (const [value, label] of [['both', t('全部', 'Both', 'すべて')], ['read', t('读取', 'Read', '読取')], ['write', t('写入', 'Write', '書込')]] as const) {
        const chip = button(label, () => { state.variableAccess = value; state.offset = 0; drawTargets(); void search(); });
        chip.setAttribute('aria-pressed', String(state.variableAccess === value)); access.append(chip);
      }
      targets.append(access);
    } else if (state.mode === 'asset' || state.mode === 'bgm') {
      const pick = button(state.targetLabel || (state.target ? t('已选素材', 'Selected asset', '選択した素材') :
        state.mode === 'bgm' ? t('全部 BGM（含停止）', 'All BGM, including stops', 'すべての BGM（停止を含む）') : t('选择素材…', 'Choose asset…', '素材を選択…')), async () => {
        await openAssetPicker({ services, projectId: source.project.projectId, locale,
          allowedKinds: state.mode === 'bgm' ? ['audio'] : ALL_KINDS, currentAssetId: state.target || null,
          currentName: state.targetLabel || undefined, purpose: t('查找素材引用', 'Find asset usage', '素材参照を検索'),
          scope: root, returnFocus: pick, remember: false,
          onApply: async choice => {
            if (disposed) return { ok: false, error: { code: 'SEARCH_SOURCE_CHANGED', message: t('查找来源已切换。', 'The search source has changed.', '検索対象が変わりました。'), severity: 'error', owner: 'M01', related: [], actions: [] }, issues: [] };
            state.target = choice.assetId; state.targetLabel = choice.asset.name; state.offset = 0;
            options.cache(choice.asset); pick.replaceChildren(actionIcon('search'), document.createTextNode(state.targetLabel));
            await search(); return { ok: true, value: undefined, warnings: [] };
          } });
        if (root.isConnected) { drawTargets(); targets.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }
      }, 'sidebar-target-picker');
      pick.prepend(actionIcon('search')); targets.append(pick);
      if (state.target) targets.append(button(t('清除', 'Clear', '解除'), () => {
        state.target = ''; state.targetLabel = ''; resetSearch(); drawTargets();
        if (state.mode === 'bgm') void search(); else options.changed?.();
      }, 'sidebar-clear'));
    }
  }
  function drawSearch() {
    const scroll = state.searchScrollTop;
    const { page, searching, error, located, hasSearched } = state;
    rendered = { page, searching, error, located, hasSearched };
    searchSummary.replaceChildren(); searchResults.replaceChildren(); searchPaging.replaceChildren();
    if (state.located && options.returnToOrigin) searchSummary.append(button(t('返回原位置', 'Return to origin', '元の位置へ戻る'), options.returnToOrigin, 'sidebar-origin'));
    if (state.scope === 'scene' && !sceneId) return;
    if (state.searching) { searchResults.append(node('p', 'sidebar-empty', t('正在查找…', 'Searching…', '検索中…'))); return; }
    if (state.error) { searchResults.append(node('p', 'sidebar-error', state.error)); return; }
    if (!state.hasSearched || !page) {
      searchResults.append(node('p', 'sidebar-empty', t('输入正文，或按角色、变量与素材查找。', 'Search text, speakers, variables or asset usage.', '本文・話者・変数・素材参照を検索。'))); return;
    }
    searchSummary.append(node('span', '', t(`${page.total} 个结果`, `${page.total} results`, `${page.total} 件`)));
    if (page.coverage.some(item => item.state !== 'complete')) searchSummary.append(node('small', 'sidebar-coverage', t('部分场景尚未完成解析', 'Some scenes have incomplete coverage', '一部のシーンは解析が未完了です')));
    if (!page.items.length) searchResults.append(node('p', 'sidebar-empty', t('没有匹配结果。', 'No matches.', '該当する結果がありません。')));
    const groups = new Map<Id | null, SemanticHit[]>();
    for (const hit of page.items) { const group = groups.get(hit.sceneId) ?? []; group.push(hit); groups.set(hit.sceneId, group); }
    for (const [id, hits] of groups) {
      const group = node('section', 'sidebar-scene-results');
      group.append(node('h3', '', source.scenes.find(scene => scene.sceneId === id)?.name ?? t('作品', 'Project', '作品')));
      for (const hit of hits) {
        const result = button('', () => options.locate(hit.source), 'sidebar-search-hit');
        if (hit.context.before) result.append(node('small', 'sidebar-hit-neighbor', hit.context.before));
        const current = node('span', 'sidebar-hit-current'); current.append(highlight(hit.context.current, state.mode === 'text' ? state.term : '')); result.append(current);
        if (hit.context.after) result.append(node('small', 'sidebar-hit-neighbor', hit.context.after));
        const line = source.scenes.find(scene => scene.documentId === hit.source.documentId)?.text.slice(0, hit.source.range?.start ?? 0).split('\n').length;
        result.append(node('small', 'sidebar-hit-meta', [hit.command, line ? t(`第 ${line} 行`, `Line ${line}`, `${line} 行`) : ''].filter(Boolean).join(' · ')));
        group.append(result);
      }
      searchResults.append(group);
    }
    pager(searchPaging, page.offset, page.total, SEARCH_LIMIT, offset => { state.offset = offset; void search(); });
    searchResults.scrollTop = scroll;
  }

  function pager(container: HTMLElement, offset: number, total: number, limit: number, change: (offset: number) => void) {
    if (total <= limit) return;
    const previous = button('‹', () => change(Math.max(0, offset - limit))); previous.ariaLabel = t('上一页', 'Previous page', '前のページ'); previous.disabled = offset === 0;
    const next = button('›', () => change(offset + limit)); next.ariaLabel = t('下一页', 'Next page', '次のページ'); next.disabled = offset + limit >= total;
    container.append(previous, node('small', '', `${Math.floor(offset / limit) + 1} / ${Math.max(1, Math.ceil(total / limit))}`), next);
  }
  drawSource(); drawTargets(); drawSearch();
  if (state.hasSearched && !state.page && !state.error && !state.searching && (state.scope === 'project' || sceneId)) void search(false);
  return { node: root, dispose() {
    disposed = true; clearTimeout(searchTimer); state.searchGeneration++; state.searching = false;
    resize?.disconnect(); searchResults.onscroll = null;
  }, update(nextSource: AuthoringSource, nextSceneId: Id | null) {
    const nextRevision = nextSource.scenes.find(scene => scene.sceneId === nextSceneId)?.revision;
    const sceneChanged = sceneId !== nextSceneId || sceneRevision !== nextRevision;
    const targetsChanged = source.characters !== nextSource.characters || source.variables !== nextSource.variables;
    source = nextSource; sceneId = nextSceneId; sceneRevision = nextRevision;
    query.value = state.term;
    mode.value = state.mode; scope.value = state.scope;
    drawSource();
    if (targetsChanged || targets.dataset.mode !== state.mode || targets.dataset.target !== state.target) drawTargets();
    if (sceneChanged && state.scope === 'scene' && state.hasSearched) {
      if (sceneId) {
        const differentScene = Boolean(searchedSceneId && searchedSceneId !== sceneId);
        if (differentScene) state.offset = 0;
        void search(differentScene);
      } else {
        clearTimeout(searchTimer); searchTimer = undefined; state.searchGeneration++;
        state.page = null; state.searching = false; drawSearch();
      }
    } else if (!rendered || rendered.page !== state.page || rendered.searching !== state.searching || rendered.error !== state.error
      || rendered.located !== state.located || rendered.hasSearched !== state.hasSearched || sceneChanged && state.scope === 'scene') drawSearch();
  } };
}
