import { useEffect, useState } from 'react';
import { Folder, File, ChevronUp, RefreshCw, Server, Square } from 'lucide-react';
import type { BrowserStudioBridge, LocalDirectory, LocalFileDialog, StudioServiceStatus } from '../browser-bridge.js';
import { Button, Field, Modal } from './controls.js';
import { Input } from './ui/input.js';
import './local-service.css';

type Service = BrowserStudioBridge['service'];
export function LocalFileBrowser({ service, dialog, locale = 'zh-CN', close }: { service: Service; dialog: LocalFileDialog; locale?: string; close(): void }) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [listing, setListing] = useState<LocalDirectory | null>(null), [path, setPath] = useState(''), [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState(dialog.kind === 'save' ? dialog.defaultPath?.split(/[\\/]/).at(-1) ?? '' : ''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const directoryOnly = dialog.properties?.includes('openDirectory'), multiple = dialog.properties?.includes('multiSelections');
  const load = async (directory: string | null) => { setBusy(true); setError(''); try { const result = await service.listDirectory(directory); setListing(result); setPath(result.directory); setSelected([]); } catch (reason) { setError(String(reason instanceof Error ? reason.message : reason)); } finally { setBusy(false); } };
  useEffect(() => { const initial = dialog.defaultPath ? dialog.kind === 'save' ? /[\\/]/.test(dialog.defaultPath) ? dialog.defaultPath.replace(/[\\/][^\\/]*$/, '') : null : dialog.defaultPath : null; void load(initial); }, [dialog.id]);
  const cancel = async () => { await service.answerDialog(dialog.id, { canceled: true, filePaths: [] }); close(); };
  const confirm = async () => { if (!listing) return; const files = dialog.kind === 'save' ? [listing.directory.replace(/[\\/]$/, '') + (listing.directory.includes('\\') ? '\\' : '/') + name] : directoryOnly ? selected.length ? selected : [listing.directory] : selected; if (!files.length || dialog.kind === 'save' && (!name.trim() || /[\\/]/.test(name))) return; setBusy(true); try { await service.answerDialog(dialog.id, dialog.kind === 'save' ? { canceled: false, filePath: files[0] } : { canceled: false, filePaths: files }); close(); } catch (reason) { setError(String(reason)); setBusy(false); } };
  return <Modal title={dialog.title ?? t('选择本机文件', 'Choose a local file', 'ローカルファイルを選択')} close={() => void cancel()} wide className="studio-file-dialog">
    <div className="studio-file-browser" aria-busy={busy}>
      <form className="studio-file-location" onSubmit={event => { event.preventDefault(); void load(path); }}>
        <Field label={t('本机目录', 'Local directory', 'ローカルフォルダー')}><Input value={path} onChange={event => setPath(event.target.value)} /></Field>
        <Button type="submit" disabled={busy}>{t('打开目录', 'Open directory', 'フォルダーを開く')}</Button>
        <Button disabled={busy || !listing?.parent} onClick={() => void load(listing!.parent)}><ChevronUp size={15}/>{t('上一级', 'Parent', '上へ')}</Button>
      </form>
      {!!listing?.roots?.length && <div className="gc-actions">{listing.roots.map(root => <Button key={root} tone="quiet" onClick={() => void load(root)}>{root}</Button>)}</div>}
      <div className="studio-file-list" role="group" aria-label={t('目录内容', 'Directory contents', 'フォルダーの内容')}>
        {listing?.entries.filter(item => !directoryOnly || item.kind === 'directory').map(item => <button type="button" key={item.path} className={selected.includes(item.path) ? 'selected' : ''} aria-pressed={selected.includes(item.path)} onKeyDown={event=>{if(event.key==='ArrowRight'&&item.kind==='directory'){event.preventDefault();void load(item.path);}}} onDoubleClick={() => item.kind === 'directory' && void load(item.path)} onClick={() => { if(item.kind==='directory'&&!directoryOnly){void load(item.path);return;}setSelected(current => multiple ? current.includes(item.path) ? current.filter(path => path !== item.path) : [...current, item.path] : [item.path]); if (dialog.kind === 'save' && item.kind === 'file') setName(item.name); }}>
          {item.kind === 'directory' ? <Folder size={16}/> : <File size={16}/>}<span>{item.name}</span>{item.kind === 'directory' && <span className="studio-file-open" onClick={event => { event.stopPropagation(); void load(item.path); }}>{t('打开', 'Open', '開く')}</span>}
        </button>)}
        {listing && !listing.entries.length && <p>{t('此目录为空。', 'This directory is empty.', '空のフォルダーです。')}</p>}
      </div>
      {dialog.kind === 'save' && <Field label={t('文件名', 'File name', 'ファイル名')}><Input value={name} onChange={event => setName(event.target.value)}/></Field>}
      <p className="field-help">{directoryOnly ? t('选择目录，或确认当前目录。双击可进入子目录。', 'Select a folder or confirm the current folder. Double-click to enter a folder.', 'フォルダーを選択するか、現在のフォルダーを確定。ダブルクリックで移動します。') : t('文件位于 Studio 服务所在的这台机器。', 'Files are on the machine running the Studio service.', 'Studio サービスを実行するマシンのファイルです。')}</p>
      {error && <p role="alert" className="field-error">{error}</p>}
    </div>
      <footer className="dialog-actions"><Button disabled={busy} onClick={() => void cancel()}>{t('取消', 'Cancel', 'キャンセル')}</Button><Button tone="primary" disabled={busy || !listing || !directoryOnly && dialog.kind !== 'save' && !selected.length || dialog.kind === 'save' && !name.trim()} onClick={() => void confirm()}>{t('确认选择', 'Confirm selection', '選択を確定')}</Button></footer>
  </Modal>;
}

export function LocalServicePanel({ service, flush, locale = 'zh-CN', dialogs = true }: { service: Service; flush(): Promise<void>; locale?: string; dialogs?: boolean }) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [status, setStatus] = useState<StudioServiceStatus | null>(null), [error, setError] = useState(''), [stopping, setStopping] = useState(false), [confirm, setConfirm] = useState(false), [dialog, setDialog] = useState<LocalFileDialog | null>(null);
  const refresh = async () => { try { setStatus(await service.status()); setError(''); } catch { setError(t('服务连接已断开，可重新启动 Studio 后刷新。', 'The service is disconnected. Start Studio and refresh.', 'サービスとの接続が切れました。Studio を起動して更新してください。')); } };
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 10000); const off = dialogs ? service.onDialog(setDialog) : () => {}; return () => { clearInterval(timer); off(); }; }, [service,dialogs]);
  return <><details className="studio-service-panel"><summary><Server size={14}/>{error ? t('服务已断开', 'Disconnected', '切断') : status?.addressChange ? t('本机服务 · 地址已变更', 'Local service · Address changed', 'ローカルサービス・アドレス変更') : t('本机服务', 'Local service', 'ローカルサービス')}</summary><div className="studio-service-details"><strong>{t('Studio 本机服务', 'Studio local service', 'Studio ローカルサービス')}</strong><p>{t('关闭此窗口后，作品与任务继续保留。', 'Projects and tasks stay active after closing this window.', 'このウィンドウを閉じても作品とタスクは継続します。')}</p>{status && <p>{status.origin} · PID {status.pid}</p>}{status?.addressChange&&<div role="status"><strong>{t('Studio 地址已变更','Studio address changed','Studio アドレスが変更されました')}</strong><p>{status.addressChange.previous} → {status.origin}</p><p>{t('使用旧地址的窗口或书签需要改用当前地址。','Update windows or bookmarks using the previous URL to this address.','以前の URL を使用するウィンドウやブックマークを現在のアドレスに更新してください。')}</p></div>}{error && <p role="alert">{error}</p>}<div className="gc-actions"><Button tone="quiet" onClick={() => void refresh()}><RefreshCw size={14}/>{t('刷新状态', 'Refresh status', '状態を更新')}</Button><Button disabled={stopping || !!error} onClick={() => setConfirm(true)}><Square size={14}/>{t('停止服务…', 'Stop service…', 'サービスを停止…')}</Button></div></div></details>
    {confirm && <Modal title={t('停止本机服务？', 'Stop the local service?', 'ローカルサービスを停止しますか？')} close={() => setConfirm(false)}><p>{t('所有 Studio 窗口和 MCP 将断开。服务先保存恢复工作与任务记录，再释放运行资源。', 'All Studio windows and MCP will disconnect. The service saves recovery work and task records before releasing resources.', 'すべての Studio と MCP が切断されます。復元用の作業とタスク記録を保存してからリソースを解放します。')}</p><div className="dialog-actions"><Button disabled={stopping} onClick={() => setConfirm(false)}>{t('取消', 'Cancel', 'キャンセル')}</Button><Button tone="danger" disabled={stopping} onClick={() => { setStopping(true); void flush().then(() => service.stop()).then(() => { setConfirm(false); void refresh(); }).catch(reason => { setError(String(reason)); setStopping(false); }); }}>{stopping ? t('正在停止…', 'Stopping…', '停止中…') : t('停止服务', 'Stop service', 'サービスを停止')}</Button></div></Modal>}
    {dialog && <LocalFileBrowser key={dialog.id} service={service} dialog={dialog} locale={locale} close={() => setDialog(null)}/>}</>;
}
