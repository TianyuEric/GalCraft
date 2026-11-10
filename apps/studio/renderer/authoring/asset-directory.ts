import type { AssetTypeCatalogEntry } from '@galcraft/contracts';
import { actionIcon } from '../components/action-icon.js';
import { assetTypeIcon, assetTypeName, uniqueAssetTypes } from './asset-type-catalog.js';
import { createAssetTypeFilters } from './asset-type-filters.js';
import type { AssetQuery } from './controller.js';
import './asset-surfaces.css';

type AssetScope = Pick<AssetQuery, 'kind' | 'folder' | 'typeFields'>;
type DirectoryOptions = {
  locale: string;
  catalog: readonly AssetTypeCatalogEntry[];
  query: AssetScope;
  folders?: readonly (readonly string[])[];
  onScopeChange(change: Partial<AssetScope>): void;
  tools?: HTMLElement;
};

export function createAssetDirectory() {
  const node = document.createElement('nav');
  node.className = 'asset-workbench-directory';
  const folderHeading = document.createElement('h3');
  const folders = document.createElement('div');
  const folderForm = document.createElement('form');
  const folderLabel = document.createElement('label');
  const folderHint = document.createElement('span');
  const folderInput = document.createElement('input');
  folderInput.type = 'search';
  folderInput.dataset.focusKey = 'asset-directory-folder';
  folderInput.dataset.dockFocus = '';
  folderLabel.append(folderHint, folderInput);
  folderForm.append(folderLabel);
  const typeHeading = document.createElement('h3');
  const types = document.createElement('div');
  const filters = document.createElement('div');
  const tools = document.createElement('div');
  node.append(folderHeading, folders, folderForm, typeHeading, types, filters, tools);
  let options: DirectoryOptions | undefined;
  let previousFolder = '', previousLocale = '', directoryKey = '';
  let requestedFolder = '';

  const applyFolder = () => {
    const path = folderInput.value.split('/').map(part => part.trim()).filter(Boolean);
    const next = path.join('/');
    folderInput.value = next;
    if (next !== requestedFolder) {
      requestedFolder = next;
      options?.onScopeChange({ folder: path.length ? path : null });
    }
  };
  folderForm.onsubmit = event => { event.preventDefault(); applyFolder(); };
  folderInput.onchange = applyFolder;

  const render = (next: DirectoryOptions) => {
    const current = options;
    options = next;
    const { catalog, locale, query } = next;
    const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
    const folder = query.folder?.join('/') ?? '';
    if (folder !== previousFolder || locale !== previousLocale || !current) {
      node.ariaLabel = t('素材目录', 'Asset directory', '素材ディレクトリ');
      folderHeading.textContent = t('目录范围', 'Folder scope', 'フォルダー範囲');
      typeHeading.textContent = t('素材类型', 'Asset types', '素材の種類');
      folderHint.textContent = t('按路径筛选', 'Filter by path', 'パスで絞り込み');
      folderInput.placeholder = t('例如 背景/雨站', 'For example backgrounds/station', '例 背景/駅');
      folderInput.value = folder;
    }
    previousFolder = folder;
    requestedFolder = folder;
    previousLocale = locale;

    const row = (key: string, name: string, selected: boolean, icon: SVGSVGElement, change: Partial<AssetScope>, detail?: number) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'asset-directory-row';
      button.dataset.focusKey = key;
      button.ariaPressed = String(selected);
      button.onclick = () => options?.onScopeChange(change);
      const label = document.createElement('span');
      label.textContent = name;
      label.title = name;
      button.append(icon, label);
      if (detail !== undefined) {
        const count = document.createElement('small');
        count.textContent = String(detail);
        button.append(count);
      }
      return button;
    };
    const restoreFocus = (container: HTMLElement, children: HTMLElement[]) => {
      const active = container.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.focusKey : undefined;
      container.replaceChildren(...children);
      if (active) children.find(child => child.dataset.focusKey === active)?.focus({ preventScroll: true });
    };
    const directory = [...new Map((next.folders ?? []).filter(path => path.length).map(path => [path.join('/'), path])).entries()];
    if (folder && !directory.some(([key]) => key === folder)) directory.push([folder, query.folder!]);
    directory.sort(([left], [right]) => left.localeCompare(right, locale));
    const nextKey = JSON.stringify([locale, folder, directory]);
    if (nextKey !== directoryKey) {
      directoryKey = nextKey;
      restoreFocus(folders, [row('asset-directory-all-folders', t('所有目录', 'All folders', 'すべてのフォルダー'), !folder, actionIcon('folder'), { folder: null }),
        ...directory.map(([key, path]) => {
          const item = row(`asset-directory-folder:${key}`, key, folder === key, actionIcon('folder'), { folder: [...path] });
          item.style.setProperty('--asset-folder-depth', String(Math.min(path.length, 4)));
          return item;
        })]);
    }
    const typeRows = uniqueAssetTypes(catalog);
    if (!current || current.query.kind !== query.kind || current.catalog !== catalog || current.locale !== locale) {
      restoreFocus(types, [row('asset-directory-all-types', t('所有类型', 'All types', 'すべての種類'), !query.kind, actionIcon('shapes'), { kind: null, typeFields: {} }),
        ...typeRows.map(({ descriptor, count }) => row(`asset-directory-type:${descriptor.key}`, assetTypeName(descriptor.key, catalog, locale), query.kind === descriptor.key,
          assetTypeIcon(descriptor.key, catalog), { kind: descriptor.key, typeFields: {} }, count))]);
    }
    if (!current || current.query.kind !== query.kind || current.query.typeFields !== query.typeFields || current.catalog !== catalog || current.locale !== locale) {
      const kind = typeRows.find(item => item.descriptor.key === query.kind)?.descriptor.key ?? null;
      filters.replaceChildren(createAssetTypeFilters(catalog, kind, query.typeFields, locale, values => options?.onScopeChange({ typeFields: values })));
    }
    if (next.tools !== current?.tools) tools.replaceChildren(...(next.tools ? [next.tools] : []));
  };
  return { node, render, dispose() { options = undefined; node.remove(); } };
}
