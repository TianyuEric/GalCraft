import type { Asset, AssetKind, AssetPickerPage, Id, SemanticHit, SemanticPage, SemanticQuery, Source } from '@galcraft/contracts';
import { parse } from '@galcraft/dsl';
import { queryDialogueText } from './controller.js';
import type { AssetPage, AssetQuery, AuthoringServices, AuthoringSource, StudioLocale } from './controller.js';
import { openAssetPicker } from './asset-picker.js';
import { loadVisibleAssetThumbnails } from './asset-picker-thumbnails.js';
import { actionIcon } from '../components/action-icon.js';
import './sidebar.css';

type SearchMode = 'text' | 'dialogue' | 'variable' | 'asset' | 'bgm';
type AssetCategory = 'all' | 'background' | 'figure' | 'live2d' | 'audio';
export type SidebarState = {
  tab: 'search' | 'assets'; mode: SearchMode; term: string; target: Id | ''; targetLabel: string;
  scope: 'project' | 'scene'; variableAccess: 'read' | 'write' | 'both'; offset: number;
  page: SemanticPage | null; hasSearched: boolean; searching: boolean; error: string; located: boolean;
  searchGeneration: number; assetCategory: AssetCategory; assetTab: 'all' | 'context' | 'recent';
  assetUsage: 'all' | 'bgm' | 'voice' | 'effect'; assetTerm: string; assetOffset: number;
  assetPage: AssetPage | AssetPickerPage | null; assetError: string; assetGeneration: number;
};
export function initialSidebarState(): SidebarState {
  return { tab: 'search', mode: 'text', term: '', target: '', targetLabel: '', scope: 'project', variableAccess: 'both',
    offset: 0, page: null, hasSearched: false, searching: false, error: '', located: false, searchGeneration: 0,
    assetCategory: 'all', assetTab: 'all', assetUsage: 'all', assetTerm: '', assetOffset: 0,
    assetPage: null, assetError: '', assetGeneration: 0 };
}
type SearchOptions = { services: AuthoringServices; source: AuthoringSource; sceneId: Id | null; state: SidebarState; locale?: StudioLocale };
export type AuthoringSidebarOptions = SearchOptions & {
  locale: StudioLocale; cache(asset: Asset): void; locate(source: Source): void; returnToOrigin?(): void;
  applyAsset(asset: Asset): Promise<void>; previewAsset(asset: Asset): Promise<void>; browseAssets(): void;
};
const ALL_KINDS: AssetKind[] = ['image', 'audio', 'video', 'font', 'live2d', 'texture', 'animation', 'effect'];
const SEARCH_LIMIT = 40, ASSET_LIMIT = 12;

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

export function sidebarAssetQuery(state: SidebarState, sceneId: Id | null): AssetQuery {
  const kind = state.assetCategory === 'background' || state.assetCategory === 'figure' ? 'image' :
    state.assetCategory === 'audio' ? 'audio' : state.assetCategory === 'live2d' ? 'live2d' : null;
  const usage = state.assetCategory === 'background' || state.assetCategory === 'figure' ? state.assetCategory :
    state.assetCategory === 'audio' && state.assetUsage !== 'all' ? state.assetUsage : null;
  return { kind, allowedKinds: kind ? [kind] : ALL_KINDS, usage, text: state.assetTerm, offset: state.assetOffset, limit: ASSET_LIMIT,
    sceneId: state.assetTab === 'context' ? sceneId : null };
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

export function createAuthoringSidebar(options: AuthoringSidebarOptions): HTMLElement {
  const { services, source, state, sceneId, locale } = options;
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const root = node('section', 'authoring-sidebar'); root.ariaLabel = t('查找与素材', 'Search and assets', '検索と素材');
  const tabs = node('div', 'sidebar-tabs'); tabs.setAttribute('role', 'tablist');
  const searchPanel = node('div', 'sidebar-panel'), assetPanel = node('div', 'sidebar-panel');
  searchPanel.setAttribute('role', 'tabpanel'); assetPanel.setAttribute('role', 'tabpanel');
  const searchTab = button(t('查找', 'Search', '検索'), () => switchTab('search'));
  const assetTab = button(t('素材', 'Assets', '素材'), () => switchTab('assets'));
  searchTab.prepend(actionIcon('search')); assetTab.prepend(actionIcon('folder'));
  for (const tab of [searchTab, assetTab]) tab.setAttribute('role', 'tab');
  tabs.append(searchTab, assetTab); root.append(tabs, searchPanel, assetPanel);
  let searchTimer: ReturnType<typeof setTimeout> | undefined, assetTimer: ReturnType<typeof setTimeout> | undefined;
  const searchControls = node('div', 'sidebar-controls'), targets = node('div', 'sidebar-targets');
  const query = node('input'); query.type = 'search'; query.value = state.term;
  query.placeholder = t('搜索对白正文…', 'Search dialogue text…', 'セリフ本文を検索…'); query.ariaLabel = query.placeholder;
  const filters = node('div', 'sidebar-filters');
  const mode = select<SearchMode>(t('查找类型', 'Search type', '検索の種類'), [
    ['text', t('正文', 'Text', '本文')], ['dialogue', t('角色对白', 'Speaker', '話者')], ['variable', t('变量', 'Variable', '変数')],
    ['asset', t('素材引用', 'Asset usage', '素材参照')], ['bgm', t('BGM', 'BGM', 'BGM')],
  ], state.mode, value => { state.mode = value; state.target = ''; state.targetLabel = ''; resetSearch(); drawTargets(); if (value === 'dialogue' || value === 'bgm') void search(); });
  const scope = select<'project' | 'scene'>(t('查找范围', 'Search scope', '検索範囲'), [
    ['project', t('当前作品', 'Project', '作品全体')], ['scene', t('当前场景', 'Scene', '現在のシーン')],
  ], state.scope, value => { state.scope = value; state.offset = 0; void search(); });
  filters.append(mode, scope); searchControls.append(query, filters, targets);
  const searchSummary = node('div', 'sidebar-summary'); searchSummary.setAttribute('aria-live', 'polite');
  const searchResults = node('div', 'sidebar-results'), searchPaging = node('div', 'sidebar-paging');
  searchPanel.append(searchControls, searchSummary, searchResults, searchPaging);
  query.oninput = () => {
    state.term = query.value; state.offset = 0; state.searchGeneration++; clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { void search(); }, 180);
  };
  query.onkeydown = event => { if (event.key === 'Enter') { clearTimeout(searchTimer); void search(); } };

  function resetSearch() {
    clearTimeout(searchTimer); state.searchGeneration++; state.offset = 0; state.page = null; state.error = ''; state.hasSearched = false; state.searching = false; drawSearch();
  }
  async function search() {
    const pending = runSidebarSearch(options); drawSearch(); await pending; drawSearch();
  }
  function drawTargets() {
    query.hidden = state.mode !== 'text'; targets.replaceChildren();
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
            state.target = choice.assetId; state.targetLabel = choice.asset.name; state.offset = 0;
            options.cache(choice.asset); pick.replaceChildren(actionIcon('search'), document.createTextNode(state.targetLabel));
            await search(); return { ok: true, value: undefined, warnings: [] };
          } });
        if (root.isConnected) { drawTargets(); targets.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }
      }, 'sidebar-target-picker');
      pick.prepend(actionIcon('search')); targets.append(pick);
      if (state.target) targets.append(button(t('清除', 'Clear', '解除'), () => { state.target = ''; state.targetLabel = ''; resetSearch(); drawTargets(); if (state.mode === 'bgm') void search(); }, 'sidebar-clear'));
    }
  }
  function drawSearch() {
    searchSummary.replaceChildren(); searchResults.replaceChildren(); searchPaging.replaceChildren();
    if (state.located && options.returnToOrigin) searchSummary.append(button(t('返回原位置', 'Return to origin', '元の位置へ戻る'), () => {
      state.located = false; options.returnToOrigin?.(); drawSearch();
    }, 'sidebar-origin'));
    if (state.searching) { searchResults.append(node('p', 'sidebar-empty', t('正在查找…', 'Searching…', '検索中…'))); return; }
    if (state.error) { searchResults.append(node('p', 'sidebar-error', state.error)); return; }
    if (!state.hasSearched || !state.page) {
      searchResults.append(node('p', 'sidebar-empty', t('输入正文，或按角色、变量与素材查找。', 'Search text, speakers, variables or asset usage.', '本文・話者・変数・素材参照を検索。'))); return;
    }
    const page = state.page;
    searchSummary.append(node('span', '', t(`${page.total} 个结果`, `${page.total} results`, `${page.total} 件`)));
    if (page.coverage.some(item => item.state !== 'complete')) searchSummary.append(node('small', 'sidebar-coverage', t('部分场景尚未完成解析', 'Some scenes have incomplete coverage', '一部のシーンは解析が未完了です')));
    if (!page.items.length) searchResults.append(node('p', 'sidebar-empty', t('没有匹配结果。', 'No matches.', '該当する結果がありません。')));
    const groups = new Map<Id | null, SemanticHit[]>();
    for (const hit of page.items) { const group = groups.get(hit.sceneId) ?? []; group.push(hit); groups.set(hit.sceneId, group); }
    for (const [id, hits] of groups) {
      const group = node('section', 'sidebar-scene-results');
      group.append(node('h3', '', source.scenes.find(scene => scene.sceneId === id)?.name ?? t('作品', 'Project', '作品')));
      for (const hit of hits) {
        const result = button('', () => { state.located = true; options.locate(hit.source); drawSearch(); }, 'sidebar-search-hit');
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
  }

  const assetControls = node('div', 'sidebar-controls');
  const categories = node('div', 'sidebar-chips sidebar-asset-categories');
  const categoryLabels: [AssetCategory, string][] = [
    ['all', t('全部', 'All', 'すべて')], ['background', t('背景', 'BG', '背景')], ['figure', t('图片立绘', 'Art', '立ち絵')],
    ['live2d', 'Live2D'], ['audio', t('声音', 'Audio', '音声')],
  ];
  for (const [key, label] of categoryLabels) {
    const tab = button(label, () => { state.assetCategory = key; state.assetOffset = 0; drawAssetControls(); void loadAssets(); });
    tab.dataset.category = key; categories.append(tab);
  }
  const assetQuery = node('input'); assetQuery.type = 'search'; assetQuery.value = state.assetTerm;
  assetQuery.placeholder = t('搜索素材名称…', 'Search assets…', '素材名を検索…'); assetQuery.ariaLabel = assetQuery.placeholder;
  const assetModes = node('div', 'sidebar-chips');
  for (const [key, label] of [['all', t('搜索', 'Search', '検索')], ['context', t('当前场景', 'Scene', '現在のシーン')], ['recent', t('最近', 'Recent', '最近')]] as const) {
    const tab = button(label, () => { state.assetTab = key; state.assetOffset = 0; drawAssetControls(); void loadAssets(); }); tab.dataset.mode = key; assetModes.append(tab);
  }
  const usages = node('div', 'sidebar-chips sidebar-audio-usages');
  for (const [key, label] of [['all', t('全部声音', 'All audio', 'すべて')], ['bgm', 'BGM'], ['voice', t('语音', 'Voice', 'ボイス')], ['effect', t('音效', 'SFX', '効果音')]] as const) {
    const tab = button(label, () => { state.assetUsage = key; state.assetOffset = 0; drawAssetControls(); void loadAssets(); }); tab.dataset.usage = key; usages.append(tab);
  }
  assetControls.append(categories, assetQuery, assetModes, usages);
  const assetSummary = node('div', 'sidebar-summary'); assetSummary.setAttribute('aria-live', 'polite');
  const assetResults = node('div', 'sidebar-results sidebar-asset-results'), assetPaging = node('div', 'sidebar-paging');
  const library = button(t('打开素材库', 'Open asset library', '素材ライブラリを開く'), options.browseAssets, 'sidebar-library-link'); library.prepend(actionIcon('folder'));
  assetPanel.append(assetControls, assetSummary, assetResults, assetPaging, library);
  assetQuery.oninput = () => {
    state.assetTerm = assetQuery.value; state.assetOffset = 0; state.assetGeneration++; clearTimeout(assetTimer);
    assetTimer = setTimeout(() => { void loadAssets(); }, 180);
  };
  assetQuery.onkeydown = event => { if (event.key === 'Enter') { clearTimeout(assetTimer); void loadAssets(); } };
  function drawAssetControls() {
    for (const item of categories.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item.dataset.category === state.assetCategory));
    for (const item of assetModes.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item.dataset.mode === state.assetTab));
    for (const item of usages.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item.dataset.usage === state.assetUsage));
    usages.hidden = state.assetCategory !== 'audio';
  }
  async function loadAssets() {
    const generation = ++state.assetGeneration; state.assetError = ''; assetResults.setAttribute('aria-busy', 'true');
    assetSummary.textContent = t('正在加载…', 'Loading…', '読込中…');
    try {
      const query = sidebarAssetQuery(state, sceneId);
      if (state.assetTab === 'context' && !sceneId) throw new Error(t('请先选择场景。', 'Select a scene first.', 'シーンを選択してください。'));
      if (state.assetTab === 'recent' && !services.queryAssetPicker) throw new Error(t('最近使用记录尚未就绪。', 'Recent assets are unavailable.', '最近使用した素材を利用できません。'));
      const result = services.queryAssetPicker ? await services.queryAssetPicker({
        context: { projectId: source.project.projectId, allowedKinds: query.allowedKinds ?? ALL_KINDS, characterId: null,
          sceneId, locale: null, currentAssetId: null, currentVariantId: null, tab: state.assetTab },
        query: { kind: query.kind as AssetKind | null, folder: null, characterId: null, sceneId: null, locale: null,
          search: query.text, tags: [], usage: query.usage, reference: 'any', review: 'any', sort: 'name', direction: 'asc',
          offset: query.offset, limit: ASSET_LIMIT, indexRevision: null, allowedKinds: query.allowedKinds },
      }) : await services.queryAssets(query);
      if (generation !== state.assetGeneration) return;
      if (!result.ok) throw new Error(result.error.message);
      state.assetPage = result.value; for (const asset of result.value.items) options.cache(asset);
    } catch (error) {
      if (generation !== state.assetGeneration) return;
      state.assetError = String(error instanceof Error ? error.message : error); state.assetPage = null;
    }
    if (generation === state.assetGeneration) { assetResults.removeAttribute('aria-busy'); drawAssets(); }
  }
  function drawAssets() {
    assetSummary.replaceChildren(); assetResults.replaceChildren(); assetPaging.replaceChildren();
    if (state.assetError) { assetResults.append(node('p', 'sidebar-error', state.assetError)); return; }
    const page = state.assetPage; if (!page) return;
    assetSummary.append(node('span', '', t(`${page.total} 项素材`, `${page.total} assets`, `${page.total} 件の素材`)));
    if (state.assetTab === 'context') assetSummary.append(node('small', '', source.scenes.find(scene => scene.sceneId === sceneId)?.name ?? ''));
    if (!page.items.length) assetResults.append(node('p', 'sidebar-empty', state.assetTab === 'recent'
      ? t('成功使用的素材会出现在这里。', 'Successfully used assets appear here.', '使用した素材がここに表示されます。')
      : t('没有匹配素材，可切换“全部”或打开素材库。', 'No matches. Choose All or open the library.', '該当する素材がありません。「すべて」かライブラリをご確認ください。')));
    for (const asset of page.items) {
      const row = node('article', 'sidebar-asset-row'); row.draggable = true;
      row.ondragstart = event => { event.dataTransfer?.setData('text/x-galcraft-asset', asset.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'; };
      const thumb = node('div', 'sidebar-asset-thumb');
      if (asset.kind === 'image') {
        const image = node('img'); image.alt = ''; image.draggable = false; image.dataset.assetId = asset.id; image.dataset.variantId = asset.activeVariantId;
        thumb.append(image);
      }
      else { thumb.append(actionIcon(asset.kind === 'audio' ? 'play' : 'folder')); if (asset.kind === 'live2d') thumb.append(node('small', '', 'L2D')); }
      const caption = node('div', 'sidebar-asset-caption'); caption.append(node('strong', '', asset.name));
      const metadata = asset.variants.find(variant => variant.id === asset.activeVariantId)?.metadata;
      const kindLabels: Record<AssetKind, string> = { image: t('图像', 'Image', '画像'), audio: t('声音', 'Audio', '音声'),
        video: t('视频', 'Video', '動画'), font: t('字体', 'Font', 'フォント'), live2d: 'Live2D', texture: t('纹理', 'Texture', 'テクスチャ'),
        animation: t('动画', 'Animation', 'アニメーション'), effect: t('特效', 'Effect', 'エフェクト') };
      const details = metadata?.width && metadata.height ? `${metadata.width} × ${metadata.height}` : metadata?.durationSec !== undefined
        ? `${Math.floor(metadata.durationSec / 60)}:${String(Math.floor(metadata.durationSec % 60)).padStart(2, '0')}` : kindLabels[asset.kind];
      caption.append(node('small', '', details)); caption.title = [asset.name, asset.folder.join('/'), asset.sourceName].filter(Boolean).join('\n');
      const actions = node('div', 'sidebar-asset-actions');
      const preview = button('', async () => { try { await options.previewAsset(asset); } catch (error) { showAssetError(error); } }, 'sidebar-icon-button');
      preview.ariaLabel = t(`预览 ${asset.name}`, `Preview ${asset.name}`, `${asset.name} をプレビュー`); preview.title = preview.ariaLabel; preview.append(actionIcon('play'));
      const apply = button('', async () => { apply.disabled = true; try { await options.applyAsset(asset); } catch (error) { showAssetError(error); } finally { apply.disabled = false; } }, 'sidebar-icon-button');
      apply.ariaLabel = t(`应用 ${asset.name}`, `Apply ${asset.name}`, `${asset.name} を使用`); apply.title = apply.ariaLabel; apply.append(actionIcon('plus'));
      actions.append(preview, apply); row.append(thumb, caption, actions); assetResults.append(row);
    }
    if ('recentEntries' in page) for (const entry of page.recentEntries.filter(item => item.missing)) {
      const missing = node('div', 'sidebar-missing-asset'); missing.append(node('small', '', t('素材已移除', 'Removed asset', '削除された素材')));
      if (services.removeRecentAsset) missing.append(button(t('移除记录', 'Remove record', '履歴を削除'), async () => {
        const result = await services.removeRecentAsset!({ projectId: source.project.projectId, assetId: entry.assetId });
        if (!result.ok) showAssetError(result.error.message); else await loadAssets();
      })); assetResults.append(missing);
    }
    pager(assetPaging, state.assetOffset, page.total, ASSET_LIMIT, offset => { state.assetOffset = offset; void loadAssets(); });
    refreshThumbnails();
  }
  function showAssetError(error: unknown) { state.assetError = String(error instanceof Error ? error.message : error); assetSummary.replaceChildren(node('small', 'sidebar-error', state.assetError)); }
  function pager(container: HTMLElement, offset: number, total: number, limit: number, change: (offset: number) => void) {
    if (total <= limit) return;
    const previous = button('‹', () => change(Math.max(0, offset - limit))); previous.ariaLabel = t('上一页', 'Previous page', '前のページ'); previous.disabled = offset === 0;
    const next = button('›', () => change(offset + limit)); next.ariaLabel = t('下一页', 'Next page', '次のページ'); next.disabled = offset + limit >= total;
    container.append(previous, node('small', '', `${Math.floor(offset / limit) + 1} / ${Math.max(1, Math.ceil(total / limit))}`), next);
  }
  function switchTab(tab: SidebarState['tab']) {
    state.tab = tab; searchPanel.hidden = tab !== 'search'; assetPanel.hidden = tab !== 'assets';
    searchTab.setAttribute('aria-selected', String(tab === 'search')); assetTab.setAttribute('aria-selected', String(tab === 'assets'));
    searchTab.tabIndex = tab === 'search' ? 0 : -1; assetTab.tabIndex = tab === 'assets' ? 0 : -1;
    if (tab === 'assets') { drawAssets(); void loadAssets(); }
    else refreshThumbnails();
  }
  function refreshThumbnails() {
    if (services.thumbnails && root.isConnected) void loadVisibleAssetThumbnails(services).catch(() => { /* The row stays usable without a thumbnail. */ });
  }
  tabs.onkeydown = event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); switchTab(state.tab === 'search' ? 'assets' : 'search'); (state.tab === 'search' ? searchTab : assetTab).focus(); } };
  drawTargets(); drawSearch(); drawAssetControls(); switchTab(state.tab);
  return root;
}
