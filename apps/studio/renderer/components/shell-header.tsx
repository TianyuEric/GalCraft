import { useState } from 'react';
import { ProjectTitle } from './ProjectTitle.js';
import { useModalState } from './motion.js';
import { Search, Moon, Sun, Save, ArrowUpRight, FolderOpen, Undo2, Redo2, BookOpen, Keyboard } from 'lucide-react';
import type { StudioLocale } from '../authoring/controller.js';
import { Button, Choice, Modal } from './controls.js';
import { Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem, MenubarSeparator } from './ui/menubar.js';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip.js';
import { StudioToaster } from './toast.js';
import brandLight from '../authoring/galcraft-icon.svg?url';
import brandDark from '../authoring/galcraft-icon-dark.svg?url';

export type ShellAction = 'quickOpen' | 'commands' | 'projects' | 'closeProject' | 'save' | 'saveAll' | 'undo' | 'redo' | 'cards' | 'writing' | 'script' | 'resetLayout' | 'preferences' | 'publish';
export function ShellHeader({ locale, theme, project, dirty, action, preferences, collapsed, toggleSidebar, service }: {
  locale: StudioLocale; theme: 'light' | 'dark'; project?: string; dirty: boolean;
  action(value: ShellAction): void; preferences(value: { locale?: StudioLocale; theme?: 'light' | 'dark' }): void;
  collapsed: boolean; toggleSidebar(): void; service?: React.ReactNode;
}) {
  const [help, setHelp] = useModalState(false);
  const [guideError, setGuideError] = useState('');
  const guideUrl = `https://galcraft.dev/docs/${locale === 'zh-CN' ? 'zh-CN' : 'en'}/studio-guide/`;
  const openGuide = async () => {
    try {
      if (window.studioDesktop) await window.studioDesktop.openExternal(guideUrl);
      else window.open(guideUrl, '_blank', 'noopener,noreferrer');
      setGuideError('');
    } catch (error) { setGuideError(String(error instanceof Error ? error.message : error)); }
  };
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const item = (id: ShellAction, label: string, icon?: React.ReactNode) => <MenubarItem disabled={id !== 'projects' && !project} onClick={() => action(id)}>{icon}{label}</MenubarItem>;
  const themeLabel = theme === 'light' ? t('切换深色主题', 'Switch to dark theme', 'ダークテーマに切り替え') : t('切换浅色主题', 'Switch to light theme', 'ライトテーマに切り替え');
  return <>
    <StudioToaster locale={locale}/>
    <div className="authoring-brand"><img className="authoring-brand-icon" src={theme === 'light' ? brandLight : brandDark} alt="" /><strong>GalCraft</strong><small>STUDIO</small></div>
    <Menubar className="studio-menubar" aria-label={t('主菜单', 'Main menu', 'メインメニュー')}>
      <MenubarMenu><MenubarTrigger>{t('文件', 'File', 'ファイル')}</MenubarTrigger><MenubarContent>
        {item('projects', t('作品工作台', 'Project workbench', '作品ワークスペース'), <FolderOpen />)}
        {item('closeProject', t('关闭作品', 'Close project', '作品を閉じる'))}<MenubarSeparator />
        {item('save', t('保存当前文档', 'Save document', '文書を保存'), <Save />)}{item('saveAll', t('保存全部', 'Save all', 'すべて保存'))}
        <MenubarSeparator />{item('publish', t('发布作品', 'Publish project', '作品を公開'), <ArrowUpRight />)}
      </MenubarContent></MenubarMenu>
      <MenubarMenu><MenubarTrigger>{t('编辑', 'Edit', '編集')}</MenubarTrigger><MenubarContent>
        {item('undo', t('撤销', 'Undo', '元に戻す'), <Undo2 />)}{item('redo', t('恢复', 'Redo', 'やり直す'), <Redo2 />)}
      </MenubarContent></MenubarMenu>
      <MenubarMenu><MenubarTrigger>{t('视图', 'View', '表示')}</MenubarTrigger><MenubarContent>
        {item('cards', t('卡片视图', 'Cards', 'カード'))}{item('writing', t('写作视图', 'Writing', '執筆'))}{item('script', t('脚本视图', 'Script', 'スクリプト'))}
        <MenubarSeparator />{item('preferences', t('工作台偏好', 'Workbench preferences', 'ワークスペース設定'))}{item('resetLayout', t('恢复默认布局', 'Reset layout', 'レイアウトをリセット'))}
      </MenubarContent></MenubarMenu>
      <MenubarMenu><MenubarTrigger>{t('帮助', 'Help', 'ヘルプ')}</MenubarTrigger><MenubarContent>
        <MenubarItem onClick={() => void openGuide()}><BookOpen />{t('操作教学', 'Studio guide', '操作ガイド')}</MenubarItem>
        <MenubarItem onClick={() => setHelp(true)}><Keyboard />{t('键盘操作', 'Keyboard controls', 'キーボード操作')}</MenubarItem>
      </MenubarContent></MenubarMenu>
    </Menubar>
    <Button tone="quiet" className="shell-command-center" onClick={() => action('quickOpen')} aria-label={t('搜索作品与命令','Search project and commands','作品とコマンドを検索')}><Search size={16}/><span>{t('搜索作品与命令','Search project and commands','作品とコマンドを検索')}</span><kbd>Ctrl+P</kbd></Button>
    <ProjectTitle name={project ?? t('作品工作台', 'Project workbench', '作品ワークスペース')} dirty={dirty} unsavedLabel={t('未保存', 'Unsaved', '未保存')}/>
    <div className="shell-header-actions">
      <Choice label="Studio language" value={locale} options={[{ value: 'zh-CN', label: '简体中文' }, { value: 'en', label: 'English' }, { value: 'ja', label: '日本語' }]} onChange={value => preferences({ locale: value as StudioLocale })} />
      <TooltipProvider delay={400}><Tooltip><TooltipTrigger render={<Button tone="quiet" />} aria-label={themeLabel} onClick={() => preferences({ theme: theme === 'light' ? 'dark' : 'light' })}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</TooltipTrigger><TooltipContent>{themeLabel}</TooltipContent></Tooltip></TooltipProvider>
      <Button disabled={!project} aria-label={t('保存全部', 'Save all', 'すべて保存')} title={t('保存全部 · Ctrl+Shift+S', 'Save all · Ctrl+Shift+S', 'すべて保存 · Ctrl+Shift+S')} onClick={() => action('saveAll')}><Save size={15} /><span>{t('保存全部', 'Save all', 'すべて保存')}</span></Button>
      <Button disabled={!project} tone="primary" onClick={() => action('publish')}>{t('发布', 'Publish', '公開')}<ArrowUpRight size={15} /></Button>
      <div id="studio-local-service-slot" className="shell-local-service-slot">{service}</div>
    </div>
    {guideError && <Modal title={t('无法打开帮助', 'Could not open the guide', 'ガイドを開けませんでした')} close={() => setGuideError('')}>
      <p role="alert">{t('请通过下方链接重试，或复制地址到浏览器。', 'Retry the link below, or copy its address to your browser.', '下のリンクを再試行するか、アドレスをブラウザーにコピーしてください。')}</p>
      <a href={guideUrl} target="_blank" rel="noreferrer" onClick={event => { event.preventDefault(); void openGuide(); }}>{guideUrl}</a><details><summary>{t('技术详情','Technical details','技術詳細')}</summary><pre>{guideError}</pre></details>
    </Modal>}
    {help && <Modal title={t('键盘操作', 'Keyboard controls', 'キーボード操作')} close={() => setHelp(false)}>
      <dl className="shortcut-list"><dt>Ctrl / ⌘ + S</dt><dd>{t('保存当前文档', 'Save current document', '現在の文書を保存')}</dd>
        <dt>Ctrl / ⌘ + P</dt><dd>{t('搜索作品对象','Search project objects','作品の項目を検索')}</dd><dt>Ctrl / ⌘ + Shift + P</dt><dd>{t('应用与插件命令','Application and plugin commands','アプリと拡張のコマンド')}</dd><dt>Ctrl / ⌘ + Shift + S</dt><dd>{t('保存全部', 'Save all', 'すべて保存')}</dd>
        <dt>Ctrl / ⌘ + Z</dt><dd>{t('撤销当前编辑', 'Undo current edit', '編集を元に戻す')}</dd>
        <dt>Ctrl / ⌘ + Y<br/>Ctrl / ⌘ + Shift + Z</dt><dd>{t('恢复当前编辑', 'Redo current edit', '編集をやり直す')}</dd>
        <dt>Ctrl + Enter</dt><dd>{t('写作视图中新增下一句', 'Add the next line in Writing', '執筆で次の文を追加')}</dd>
        <dt>Alt + ↑ / ↓</dt><dd>{t('在卡片手柄上调整顺序', 'Reorder a focused card handle', 'カードハンドルで並べ替え')}</dd>
        <dt>Delete</dt><dd>{t('删除所选卡片（焦点在输入框外时）', 'Delete selected cards when focus is outside an input', '入力欄以外で選択したカードを削除')}</dd>
        <dt>Esc</dt><dd>{t('关闭弹窗或取消拖动', 'Close a dialog or cancel a drag', 'ダイアログを閉じる・ドラッグを取消')}</dd></dl>
    </Modal>}
  </>;
}
