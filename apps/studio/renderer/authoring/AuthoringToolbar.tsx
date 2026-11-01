import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle } from '@base-ui/react/toggle';
import { Code, Columns2, PenLine, Undo2, Redo2, Save, Play, ChevronDown, MoreHorizontal, GitBranch, Sparkles, Info, ClipboardPaste } from 'lucide-react';
import { Button } from '../components/controls.js';
import { IconAction } from '../components/workbench/WorkbenchShell.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu.js';
import { TooltipProvider } from '../components/ui/tooltip.js';
import './pilot.css';

export type AuthoringToolbarProps = {
  locale: string;
  view: 'cards' | 'writing' | 'script';
  dirty: boolean;
  saveState: string;
  hasSelection: boolean;
  hasStatements: boolean;
  readOnly: boolean;
  pluginTools: boolean;
  changeView(view: AuthoringToolbarProps['view']): void;
  play(from: 'entry' | 'scene' | 'statement'): void;
  action(action: 'save' | 'undo' | 'redo' | 'graph' | 'status' | 'paste' | 'ai-writing' | 'ai-direction' | 'plugins'): void;
};

/** View controls consume the author's existing document state and commands. */
export function AuthoringToolbar(props: AuthoringToolbarProps) {
  const t = (zh: string, en: string, ja: string) => props.locale === 'en' ? en : props.locale === 'ja' ? ja : zh;
  const from = props.hasSelection ? 'statement' : props.hasStatements ? 'scene' : 'entry';
  const status = props.saveState === 'saving' ? t('正在保存', 'Saving', '保存中') : props.saveState === 'failed' ? t('保存失败', 'Save failed', '保存失敗') : props.dirty ? t('未保存', 'Unsaved', '未保存') : t('已保存', 'Saved', '保存済み');
  return <TooltipProvider delay={350}><div className="authoring-pilot-toolbar">
    <ToggleGroup className="authoring-mode-switch" value={[props.view]} aria-label={t('编辑视图', 'Editor view', '編集ビュー')} onValueChange={values => { if (values[0]) props.changeView(values[0] as AuthoringToolbarProps['view']); }}>
      <Toggle data-slot="authoring-mode" value="cards"><Columns2/>{t('演出', 'Direction', '演出')}</Toggle>
      <Toggle data-slot="authoring-mode" value="writing"><PenLine/>{t('写作', 'Writing', '執筆')}</Toggle>
      <Toggle data-slot="authoring-mode" value="script"><Code/>{t('源码', 'Source', 'ソース')}</Toggle>
    </ToggleGroup>
    <div className="authoring-history-tools" role="group" aria-label={t('编辑历史', 'Edit history', '編集履歴')}>
      <IconAction label={t('撤销 · Ctrl+Z', 'Undo · Ctrl+Z', '元に戻す · Ctrl+Z')} onClick={() => props.action('undo')}><Undo2/></IconAction>
      <IconAction label={t('恢复 · Ctrl+Y', 'Redo · Ctrl+Y', 'やり直す · Ctrl+Y')} onClick={() => props.action('redo')}><Redo2/></IconAction>
      <IconAction label={`${t('保存当前文档 · Ctrl+S', 'Save document · Ctrl+S', '文書を保存 · Ctrl+S')} · ${status}`} disabled={props.saveState === 'saving'} onClick={() => props.action('save')}><Save/>{props.dirty && <i className="authoring-save-dot"/>}</IconAction>
    </div>
    <span className="authoring-save-state" data-dirty={props.dirty} role="status">{status}</span>
    <div className="authoring-play-tools">
      <Button tone="primary" onClick={() => props.play(from)} title={from === 'statement' ? t('从此句试玩', 'Play from this line', 'この文からテスト') : from === 'scene' ? t('从当前场景试玩', 'Play from this scene', 'このシーンからテスト') : t('从头试玩', 'Play from beginning', '最初からテスト')}><Play/>{t('试玩', 'Playtest', 'テスト')}</Button>
      <DropdownMenu><DropdownMenuTrigger render={<Button tone="primary" className="authoring-play-range"/>} aria-label={t('选择试玩起点', 'Choose playtest start', 'テスト開始位置を選択')} title={t('选择试玩起点', 'Choose playtest start', 'テスト開始位置を選択')}><ChevronDown/></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="authoring-pilot-menu">
          <DropdownMenuItem disabled={!props.hasSelection} onClick={() => props.play('statement')}>{t('从此句试玩', 'From this line', 'この文から')}</DropdownMenuItem>
          <DropdownMenuItem disabled={!props.hasStatements} onClick={() => props.play('scene')}>{t('从当前场景试玩', 'From this scene', 'このシーンから')}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => props.play('entry')}>{t('从头试玩', 'From beginning', '最初から')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <DropdownMenu><DropdownMenuTrigger render={<Button tone="quiet" className="gc-wb-icon"/>} aria-label={t('更多创作工具', 'More authoring tools', 'その他の創作ツール')} title={t('更多创作工具', 'More authoring tools', 'その他の創作ツール')}><MoreHorizontal/></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="authoring-pilot-menu">
        <DropdownMenuItem onClick={() => props.action('ai-writing')}><Sparkles/>{t('AI 写作', 'AI writing', 'AI で書く')}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => props.action('ai-direction')}><Columns2/>{t('配演出', 'Add direction', '演出を作成')}</DropdownMenuItem>
        <DropdownMenuItem disabled={props.readOnly} onClick={() => props.action('paste')}><ClipboardPaste/>{t('批量粘贴', 'Paste dialogue', '台詞を一括貼り付け')}</DropdownMenuItem>
        {props.pluginTools && <DropdownMenuItem onClick={() => props.action('plugins')}>{t('插件工具', 'Plugin tools', 'プラグインツール')}</DropdownMenuItem>}
        <DropdownMenuSeparator/>
        <DropdownMenuItem onClick={() => props.action('graph')}><GitBranch/>{t('场景关系图', 'Scene graph', 'シーン関係図')}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => props.action('status')}><Info/>{t('创作状态', 'Authoring status', '創作の状態')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div></TooltipProvider>;
}
