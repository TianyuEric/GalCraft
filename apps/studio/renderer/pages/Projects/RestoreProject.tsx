import { useRef, useState } from 'react';
import type { RestoreOptions, RestorePlanSummary, RestoreReceipt, StudioBridge } from '@galcraft/contracts';
import { ArchiveRestore, Check, FolderOpen, LoaderCircle } from 'lucide-react';
import { Button, Field } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { IssueNotice } from '../../components/issue-notice.js';
import type { StudioLocale } from '../../authoring/controller.js';
import { tr } from '../Production/Production.js';
import { unwrap } from '../Production/bridge.js';
import './restore-project.css';

export type RestoreProjectPort = {
  projects: Pick<StudioBridge['projects'], 'chooseBackupFile' | 'chooseDirectory' | 'supplyRestoreDependency'>;
  documents: Pick<StudioBridge['documents'], 'prepareRestore' | 'checkRestore' | 'commitRestore' | 'cancelRestore'>;
};
export function RestoreProject({ locale, bridge, open, close }: { locale: StudioLocale; bridge: RestoreProjectPort; open(directory: string): Promise<boolean>; close(): void }) {
  const t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja);
  const [packagePath, setPackagePath] = useState(''), [parent, setParent] = useState(''), [name, setName] = useState('');
  const [identity, setIdentity] = useState<RestoreOptions['identity'] | ''>('');
  const [plan, setPlan] = useState<RestorePlanSummary | null>(null), [receipt, setReceipt] = useState<RestoreReceipt | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const running = useRef(false);
  const destination = parent && name ? `${parent.replace(/[\\/]$/, '')}/${name}` : '';
  const validName = !!name.trim() && !/[<>:"/\\|?*]/.test(name) && !['.', '..'].includes(name) && !/[. ]$/.test(name);
  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { running.current = false; setBusy(false); }
  };
  const reset = async () => { if (plan && !receipt) unwrap(await bridge.documents.cancelRestore(plan.operationDirectory)); setPlan(null); setReceipt(null); };
  const blocked = !plan || plan.missing.some(issue => issue.severity === 'error') || plan.readiness?.editing !== 'editable';
  const readiness = receipt?.readiness ?? plan?.readiness;
  return <section className="project-restore" aria-label={t('从备份恢复作品', 'Restore project backup', 'バックアップから作品を復元')} aria-busy={busy}>
    <header><div><h2><ArchiveRestore size={18} aria-hidden="true"/>{t('从备份恢复作品', 'Restore project backup', 'バックアップから作品を復元')}</h2>
      <p>{t('恢复作品与已保存素材。备份不包含玩家存档、个人连接和凭据。', 'Restore the project and saved assets. The backup does not include player saves, personal connections or credentials.', '作品と保存済み素材を復元します。バックアップにプレイヤーのセーブ、個人接続、認証情報は含まれません。')}</p></div>
      <Button tone="quiet" disabled={busy} onClick={() => void run(async () => { await reset(); close(); })}>{t('返回作品库', 'Back to library', 'ライブラリに戻る')}</Button></header>
    {!plan && <>
      <div className="restore-inputs">
        <Field label={t('作品备份包', 'Project backup package', '作品バックアップ')}><div className="restore-file-choice"><span>{packagePath || t('选择 .galproject 文件', 'Choose a .galproject file', '.galproject ファイルを選択')}</span>
          <Button disabled={busy || !!plan} onClick={() => void run(async () => { const path = unwrap(await bridge.projects.chooseBackupFile()); if (path) { setPackagePath(path); setName(path.split(/[\\/]/).pop()!.replace(/\.galproject$/i, '') + t(' 恢复', ' restored', ' 復元')); } })}><FolderOpen size={15}/>{t('选择备份包', 'Choose backup', 'バックアップを選択')}</Button></div></Field>
        <Field label={t('目标父目录', 'Destination parent folder', '復元先の親フォルダー')}><div className="restore-file-choice"><span>{parent || t('选择放置恢复作品的位置', 'Choose where to restore the project', '復元先を選択')}</span>
          <Button disabled={busy || !!plan} onClick={() => void run(async () => { const path = unwrap(await bridge.projects.chooseDirectory()); if (path) setParent(path); })}><FolderOpen size={15}/>{t('选择目标位置', 'Choose destination', '復元先を選択')}</Button></div></Field>
        <Field label={t('新作品文件夹名称', 'New project folder name', '新しい作品フォルダー名')} help={t('恢复会创建新文件夹；已有目录保持原样。', 'Restoration creates a new folder and preserves existing directories.', '新しいフォルダーを作成し、既存のフォルダーを保持します。')} error={name && !validName ? t('请输入有效的文件夹名称。', 'Enter a valid folder name.', '有効なフォルダー名を入力してください。') : undefined}>
          <Input value={name} placeholder={t('例如：春日来信 恢复', 'e.g. Spring Letters restored', '例：春の便り 復元')} disabled={busy || !!plan} onChange={event => setName(event.target.value)}/></Field>
      </div>
      <fieldset className="restore-identity" disabled={busy || !!plan}><legend>{t('作品身份', 'Project identity', '作品の識別情報')}</legend>
        <label><input type="radio" name="restore-identity" checked={identity === 'restoreOriginal'} onChange={() => setIdentity('restoreOriginal')}/><span><strong>{t('保留原作品身份', 'Keep original identity', '元の作品の ID を保持')}</strong><small>{t('恢复后的作品继续关联原作品的玩家资料。', 'The restored project continues to use the original project’s player data.', '復元した作品は、元の作品のプレイヤーデータを引き続き使用します。')}</small></span></label>
        <label><input type="radio" name="restore-identity" checked={identity === 'copyNew'} onChange={() => setIdentity('copyNew')}/><span><strong>{t('创建独立副本', 'Create independent copy', '独立したコピーを作成')}</strong><small>{t('为副本建立新的作品身份，玩家资料与原作品分开。', 'Give this copy a new project identity and keep its player data separate.', 'コピーに新しい作品 ID を付け、プレイヤーデータを元の作品と分けます。')}</small></span></label>
      </fieldset>
    </>}
    {plan && <section className="restore-report" aria-label={t('恢复检查报告', 'Restore report', '復元チェック結果')}>
      <h3>{receipt ? t('作品已恢复', 'Project restored', '作品を復元しました') : t('恢复检查报告', 'Restore report', '復元チェック結果')}{plan.projectName && ` · ${plan.projectName}`}</h3>
      <dl><dt>{t('目标目录', 'Destination', '復元先')}</dt><dd>{plan.destination}</dd><dt>{t('身份策略', 'Identity', '識別情報')}</dt><dd>{plan.options.identity === 'copyNew' ? t('独立副本', 'Independent copy', '独立したコピー') : t('保留原作品身份', 'Keep original identity', '元の作品の ID を保持')}</dd></dl>
      {!receipt && <>
        <p role="status">{blocked ? t('先补齐下列缺项，再重新检查。目标作品尚未写入。', 'Resolve the issues below, then check again. The destination has not been installed.', '不足項目を補って再チェックしてください。復元先にはまだ書き込んでいません。') : t('检查已通过，可以确认恢复。', 'Checks passed. Ready to confirm restoration.', 'チェック完了。復元を確定できます。')}</p>
        {plan.missing.map((issue, index) => <IssueNotice key={index} issue={issue} locale={locale}/>)}
        <details open={blocked}><summary>{t('精确依赖与本地补齐', 'Exact dependencies and local import', '依存パッケージとローカル読み込み')}</summary>
          <ul className="restore-dependencies">{plan.manifest?.externalDependencies.map(({ dependency, included, reason, instructions, sourceUrl }) => <li key={`${dependency.kind}:${dependency.id}`}><div><strong>{dependency.id}@{dependency.version}</strong><span>{included ? t('备份已携带', 'Included in backup', 'バックアップに同梱') : reason}</span><small>{instructions}</small></div><div className="gc-actions">{sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">{t('来源说明', 'Source', '入手先')}</a>}<Button disabled={busy} onClick={() => void run(async () => { const next = unwrap(await bridge.projects.supplyRestoreDependency({ operationDirectory: plan.operationDirectory, kind: dependency.kind, id: dependency.id, version: dependency.version })); if (next) setPlan(next); })}>{t('导入本地目录', 'Import local folder', 'ローカルフォルダーを読み込む')}</Button></div></li>)}</ul>
        </details>
      </>}
      {readiness && <ul className="restore-readiness"><li>{readiness.editing === 'editable' && <Check size={15}/>} {readiness.editing === 'editable' ? t('可编辑', 'Editable', '編集可能') : readiness.editing === 'readOnly' ? t('仅可读取', 'Read only', '読み取り専用') : t('编辑不可用', 'Editing unavailable', '編集不可')}</li>
        <li>{t('试玩', 'Playtest', 'テストプレイ')}：{readiness.playtest === 'available' ? t('可用', 'Available', '利用可能') : readiness.playtest === 'unchecked' ? t('待检查', 'Unchecked', '未チェック') : t('不可用', 'Unavailable', '利用不可')}</li>
        <li>{t('发布', 'Publishing', '配布')}：{readiness.publish === 'available' ? t('可用', 'Available', '利用可能') : readiness.publish === 'unchecked' ? t('待检查', 'Unchecked', '未チェック') : t('不可用', 'Unavailable', '利用不可')}</li>
        <li>{readiness.generation.some(item => item.state === 'needsConnection') ? t('部分生成服务待配置；已有素材可继续使用。', 'Some generation services need configuration; saved assets remain usable.', '一部の生成サービスは設定が必要です。保存済み素材は使用できます。') : t('生成能力按实际连接检查。', 'Generation capabilities follow the actual connection checks.', '生成機能は実際の接続チェックに従います。')}</li></ul>}
    </section>}
    <footer>{error && <p className="project-library-error" role="alert">{error}</p>}<div className="gc-actions">
      {busy && <span role="status" className="restore-progress"><LoaderCircle size={15} className="gc-wb-spin"/>{t('正在处理…', 'Working…', '処理中…')}</span>}
      {!plan ? <Button tone="primary" disabled={busy || !packagePath || !destination || !validName || !identity} onClick={() => void run(async () => { if (identity) setPlan(unwrap(await bridge.documents.prepareRestore({ packagePath, destination, identity, collision: 'newDirectory' }))); })}>{t('准备恢复并检查依赖', 'Prepare and check dependencies', '復元を準備して依存をチェック')}</Button> : receipt ? <Button tone="primary" disabled={busy} onClick={() => void run(async () => { await open(receipt.directory); })}>{t('打开恢复作品', 'Open restored project', '復元した作品を開く')}</Button> : <>
        <Button disabled={busy} onClick={() => void run(reset)}>{t('更改选择', 'Change choices', '選択を変更')}</Button>
        <Button disabled={busy} onClick={() => void run(async () => setPlan(unwrap(await bridge.documents.checkRestore(plan.operationDirectory))))}>{t('重新检查', 'Check again', '再チェック')}</Button>
        <Button tone="primary" disabled={busy || blocked} onClick={() => void run(async () => { const result = unwrap(await bridge.documents.commitRestore(plan.operationDirectory)); setReceipt(result); await open(result.directory); })}>{t('确认恢复并打开', 'Restore and open', '復元して開く')}</Button>
      </>}
    </div></footer>
  </section>;
}
