import { Fragment, type ReactNode } from 'react';
import { ChevronDown, LayoutPanelLeft, Moon, Play, Redo2, Save, Search, Settings2, Sun, Undo2 } from 'lucide-react';
import type { StudioLocale } from '../../authoring/controller.js';
import brandLight from '../../authoring/galcraft-icon.svg?url';
import brandDark from '../../authoring/galcraft-icon-dark.svg?url';
import { Button, Choice } from '../controls.js';
import { ProjectTitle } from '../ProjectTitle.js';
import type { RailItem } from '../rail-navigation.js';
import { StudioMenubar, type ShellAction } from '../shell-header.js';
import { StudioToaster } from '../toast.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '../ui/dropdown-menu.js';
import './studio-chrome.css';

/** Shared app bar. The host supplies the project and search surfaces. */
export function StudioChromeHeader({ brand, menubar, project, context, search, actions, className = '', searchClassName = '' }: {
  brand: ReactNode;
  menubar?: ReactNode;
  project: ReactNode;
  context?: ReactNode;
  search: ReactNode;
  actions: ReactNode;
  className?: string;
  searchClassName?: string;
}) {
  return <header className={`gc-studio-chrome-header ${className}`}>
    {brand}{menubar}{project}{context}
    <div className={`gc-studio-chrome-search ${searchClassName}`}>{search}</div>
    <div className="gc-studio-chrome-actions">{actions}</div>
  </header>;
}

/** Keep the workface entries at the start and the editing actions at the end. */
export function StudioChromeToolbar({ label, workfaces, routes, history, layout, save, preview, className = '' }: {
  label: string;
  workfaces: ReactNode;
  routes: ReactNode;
  history: ReactNode;
  layout: ReactNode;
  save: ReactNode;
  preview: ReactNode;
  className?: string;
}) {
  return <div role="group" aria-label={label} className={`gc-studio-chrome-toolbar ${className}`}>
    {workfaces}{routes}<span className="gc-studio-chrome-spacer"/>{history}{layout}{save}{preview}
  </div>;
}

export function StudioChromeToolGroup({ children, className = '', split = false, label, as: Group = 'div' }: {
  children: ReactNode;
  className?: string;
  split?: boolean;
  label?: string;
  as?: 'div' | 'nav';
}) {
  return <Group className={`gc-studio-chrome-group ${className}`} data-split={split || undefined}
    role={Group === 'div' && label ? 'group' : undefined} aria-label={label}>{children}</Group>;
}

export type StudioChromeMenuItem = {
  id: string;
  label: string;
  run(): void;
  disabled?: boolean;
  current?: boolean;
  shortcut?: string;
  separatorBefore?: boolean;
};

function ChromeMenu({ label, items, icon, iconOnly = false, align = 'start', disabled, focusKey }: {
  label: string;
  items: readonly StudioChromeMenuItem[];
  icon?: ReactNode;
  iconOnly?: boolean;
  align?: 'start' | 'end';
  disabled?: boolean;
  focusKey: string;
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button tone={iconOnly ? undefined : 'quiet'} className={iconOnly ? 'gc-studio-chrome-icon' : undefined}/>}
      aria-label={label} title={label} disabled={disabled} data-focus-key={focusKey}>
      {icon}{!iconOnly && <span>{label}</span>}<ChevronDown aria-hidden="true" className="gc-studio-chrome-chevron"/>
    </DropdownMenuTrigger>
    <DropdownMenuContent align={align} className="gc-studio-chrome-menu" aria-label={label}>
      {items.map(item => <Fragment key={item.id}>
        {item.separatorBefore && <DropdownMenuSeparator/>}
        <DropdownMenuItem disabled={item.disabled} aria-current={item.current ? 'page' : undefined} onClick={item.run}>
          <span>{item.label}</span>{item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
        </DropdownMenuItem>
      </Fragment>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

const quickRoutes = ['production', 'collaboration', 'plugins', 'publish'];

export type StudioChromeProps = {
  locale: StudioLocale;
  theme: 'light' | 'dark';
  project?: string;
  dirty: boolean;
  action(value: ShellAction): void;
  preferences(value: { locale?: StudioLocale; theme?: 'light' | 'dark' }): void;
  items: readonly RailItem[];
  navigate(key: string): void;
  combinations?: readonly StudioChromeMenuItem[];
  layout?: readonly StudioChromeMenuItem[];
  preview?(): void;
  saving?: boolean;
  editTarget?: string;
  historyUnavailable?: string;
  canSaveCurrent?: boolean;
  service?: ReactNode;
  auxiliary?: ReactNode;
};

/** Connect the shared workbench chrome to the real Studio commands. */
export function StudioChrome({ locale, theme, project, dirty, action, preferences, items, navigate, combinations = [], layout, preview, saving, editTarget, historyUnavailable, canSaveCurrent = !!project, service, auxiliary }: StudioChromeProps) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const workbench = t('作品工作台', 'Project workbench', '作品ワークスペース');
  const preferencesLabel = t('工作台偏好', 'Workbench preferences', 'ワークスペース設定');
  const searchLabel = t('搜索作品与命令', 'Search project and commands', '作品とコマンドを検索');
  const themeLabel = theme === 'light' ? t('切换深色主题', 'Switch to dark theme', 'ダークテーマに切り替え') : t('切换浅色主题', 'Switch to light theme', 'ライトテーマに切り替え');
  const saveLabel = t('保存当前文档', 'Save document', '文書を保存');
  const previewLabel = t('运行预览', 'Run preview', 'プレビューを実行');
  const undoLabel = t('撤销', 'Undo', '元に戻す');
  const redoLabel = t('重做', 'Redo', 'やり直す');
  const commandTitle = (label: string, shortcut: string) => `${label}${editTarget ? ` · ${editTarget}` : ''} · ${shortcut}`;
  const workfaces: StudioChromeMenuItem[] = items.map(item => ({
    id: item.key, label: item.label, current: item.current, disabled: item.disabled, run: () => navigate(item.key),
  }));
  workfaces.push(
    ...combinations.map((item, index) => index === 0 ? { ...item, separatorBefore: true } : item),
    { id: 'view-writing', label: t('当前场景文稿', 'Current scene manuscript', '現在のシーンの原稿'), separatorBefore: true, disabled: !project, run: () => action('writing') },
    { id: 'view-cards', label: t('当前场景指令', 'Current scene commands', '現在のシーンのコマンド'), disabled: !project, run: () => action('cards') },
    { id: 'view-script', label: t('当前场景源码', 'Current scene source', '現在のシーンのソース'), disabled: !project, run: () => action('script') },
    { id: 'commands', label: t('搜索命令', 'Search commands', 'コマンドを検索'), separatorBefore: true, shortcut: 'Ctrl+Shift+P', run: () => action('commands') },
  );
  const layoutItems = layout?.length ? layout : [
    { id: 'reset', label: t('恢复默认布局', 'Reset layout', 'レイアウトをリセット'), disabled: !project, run: () => action('resetLayout') },
  ];
  return <div className="gc-studio-chrome">
    <StudioToaster locale={locale}/>
    <StudioChromeHeader
      brand={<Button tone="quiet" className="gc-studio-chrome-brand" aria-label={workbench} title={workbench} data-focus-key="studio:projects" onClick={() => action('projects')}>
        <img src={theme === 'light' ? brandLight : brandDark} alt=""/><strong>GalCraft Studio</strong>
      </Button>}
      menubar={<StudioMenubar locale={locale} project={project} action={action}/>}
      project={<div className="gc-studio-chrome-project"><ProjectTitle name={project ?? workbench} dirty={dirty} unsavedLabel={t('未保存', 'Unsaved', '未保存')}/></div>}
      search={<Button className="shell-command-center gc-studio-chrome-command" aria-label={searchLabel} title={`${searchLabel} · Ctrl+P`} data-focus-key="studio:search" onClick={() => action('quickOpen')}>
        <Search aria-hidden="true"/><span>{searchLabel}</span><kbd>Ctrl+P</kbd>
      </Button>}
      actions={<>
        <Button tone="quiet" className="gc-studio-chrome-preferences" aria-label={preferencesLabel} title={preferencesLabel} disabled={!project} data-focus-key="studio:preferences" onClick={() => action('preferences')}>
          <Settings2 aria-hidden="true"/><span>{preferencesLabel}</span>
        </Button>
        <Button tone="quiet" className="gc-studio-chrome-icon" aria-label={themeLabel} title={themeLabel} data-focus-key="studio:theme" onClick={() => preferences({ theme: theme === 'light' ? 'dark' : 'light' })}>
          {theme === 'light' ? <Moon aria-hidden="true"/> : <Sun aria-hidden="true"/>}
        </Button>
        <div className="gc-studio-chrome-locale"><Choice label="Studio language" value={locale} options={[{ value: 'zh-CN', label: '简体中文' }, { value: 'en', label: 'English' }, { value: 'ja', label: '日本語' }]} onChange={value => preferences({ locale: value as StudioLocale })}/></div>
        {auxiliary}
        <div id="studio-local-service-slot" className="shell-local-service-slot">{service}</div>
      </>}
    />
    <StudioChromeToolbar label={t('工作台命令', 'Workbench commands', 'ワークスペースのコマンド')}
      workfaces={<ChromeMenu label={t('工作面', 'Workfaces', '作業ビュー')} items={workfaces} focusKey="studio:workfaces" icon={<LayoutPanelLeft aria-hidden="true"/>}/>}
      routes={<StudioChromeToolGroup as="nav" label={t('常用工作面', 'Common workfaces', 'よく使う作業ビュー')}>
        {items.filter(item => quickRoutes.includes(item.key)).map(item => <Button key={item.key} tone="quiet" disabled={item.disabled} aria-current={item.current ? 'page' : undefined} data-focus-key={`route:${item.key}`} onClick={() => navigate(item.key)}>{item.label}</Button>)}
      </StudioChromeToolGroup>}
      history={<StudioChromeToolGroup label={t('编辑历史', 'Edit history', '編集履歴')}>
        <Button tone="quiet" className="gc-studio-chrome-icon" aria-label={undoLabel} aria-description={historyUnavailable} title={historyUnavailable ?? commandTitle(undoLabel, 'Ctrl+Z')} data-action="undo" data-focus-key="studio:undo" disabled={!project || !!historyUnavailable} onClick={() => action('undo')}><Undo2 aria-hidden="true"/></Button>
        <Button tone="quiet" className="gc-studio-chrome-icon" aria-label={redoLabel} aria-description={historyUnavailable} title={historyUnavailable ?? commandTitle(redoLabel, 'Ctrl+Y')} data-action="redo" data-focus-key="studio:redo" disabled={!project || !!historyUnavailable} onClick={() => action('redo')}><Redo2 aria-hidden="true"/></Button>
      </StudioChromeToolGroup>}
      layout={<ChromeMenu label={t('布局', 'Layout', 'レイアウト')} items={layoutItems} focusKey="studio:layout" align="end"/>}
      save={<StudioChromeToolGroup split>
        <Button aria-label={saveLabel} title={commandTitle(saveLabel, 'Ctrl+S')} data-action="save" data-focus-key="studio:save" disabled={saving || !canSaveCurrent} onClick={() => action('save')}>
          <Save aria-hidden="true"/>{saving ? t('保存中…', 'Saving…', '保存中…') : t('保存', 'Save', '保存')}
        </Button>
        <ChromeMenu label={t('保存选项', 'Save options', '保存オプション')} iconOnly align="end" focusKey="studio:save-options" disabled={!project || saving} items={[
          { id: 'save-all', label: t('保存全部', 'Save all', 'すべて保存'), shortcut: 'Ctrl+Shift+S', run: () => action('saveAll') },
        ]}/>
      </StudioChromeToolGroup>}
      preview={<Button tone="primary" data-action="preview" data-focus-key="studio:preview" disabled={!preview} onClick={preview}><Play aria-hidden="true"/>{previewLabel}</Button>}
    />
  </div>;
}
