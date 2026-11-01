import { IssueNotice } from '../../components/issue-notice.js';
import { Identity } from '../../components/identity.js';
import { CodeBlock } from '../../components/code-block.js';
import { Input } from '../../components/ui/input.js';
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ObjectTree } from "../../components/workbench/ObjectTree.js";
import { InspectorSection } from "../../components/workbench/WorkbenchShell.js";
import { Package, Plus, FolderCode, ArrowRight } from "lucide-react";
import {
  Button,
  Badge,
  Empty,
  Field,
} from "../../components/controls.js";
import type { WorkbenchBridge } from "../Production/bridge.js";
import { unwrap } from "../Production/bridge.js";
import { tr } from "../Production/Production.js";
import './plugins.css';
import { Skeleton } from '../../components/ui/skeleton.js';
import type { StudioPluginHost } from './studio-host.js';
import { contributionStatus, contributionStatusLabels } from './contribution-status.js';
import { PluginOverview, pluginCapabilityLabel } from './PluginOverview.js';
import { pluginDisplayMetadata } from '@galcraft/plugins/contracts';
import type { PluginManifest } from '@galcraft/plugins/contracts';

export function Plugins({
  bridge,
  locale,
  projectId,
  changed,
  authorHost,
  explorerContainer, inspectorContainer, documentActive = true, revealInspector,
}: {
  bridge: WorkbenchBridge;
  locale: string;
  projectId: string;
  changed(): Promise<void>;
  authorHost?: StudioPluginHost | null;
  explorerContainer?: HTMLElement | null;
  inspectorContainer?: HTMLElement | null;
  documentActive?: boolean;
  revealInspector?(): void;
}) {
  const t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja);
  const display = (manifest: PluginManifest) => pluginDisplayMetadata(manifest, locale);
  const [data, setData] = useState<
    | (Awaited<
        ReturnType<typeof bridge.plugins.list>
      > extends import("@galcraft/contracts").Result<infer T>
        ? T
        : never)
    | null
  >(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [path, setPath] = useState(""),
    [modal, setModal] = useState("");
  const [plan, setPlan] = useState<
    | (Awaited<
        ReturnType<typeof bridge.plugins.planChange>
      > extends import("@galcraft/contracts").Result<infer T>
        ? T
        : never)
    | null
  >(null);
  const [selected, setSelected] = useState("");
  const [side, setSide] = useState<"explorer" | "inspector">("explorer");
  const [inspection, setInspection] = useState<import('@galcraft/plugins').PackageInspection | null>(null);
  const [diagnostic, setDiagnostic] = useState<import('@galcraft/plugins').PluginManifest | null>(null);
  const openModal = (value: string) => { setError(""); setDiagnostic(value ? null : packageEntries.find(entry => entry.key === selected)?.manifest ?? null); setModal(value); };
  const refresh = async () => setData(unwrap(await bridge.plugins.list()));
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)));
  }, []);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const packageKey = (id: string, version: string, development = false) => `${id}/${version}/${development}`;
  const packageCounts = new Map<string, number>(), packageOccurrences = new Map<string, number>();
  for (const entry of data?.entries ?? []) {
    const identity = packageKey(entry.manifest.id, entry.manifest.version, entry.development);
    packageCounts.set(identity, (packageCounts.get(identity) ?? 0) + 1);
  }
  // The catalog can list bundled and installed manifests for the same exact package.
  // It exposes no source ID; retain each registration while unrelated catalog rows move.
  const packageEntries = (data?.entries ?? []).map(entry => {
    const identity = packageKey(entry.manifest.id, entry.manifest.version, entry.development);
    const registration = (packageOccurrences.get(identity) ?? 0) + 1;
    packageOccurrences.set(identity, registration);
    return { ...entry, display: display(entry.manifest), key: `${identity}/${registration}`, registration, registrations: packageCounts.get(identity)! };
  });
  const selectedEntry = packageEntries.find(entry => entry.key === selected);
  const studioServices = packageEntries.filter(entry => entry.studioService);
  const installedEntries = packageEntries.filter(entry => !entry.studioService);
  const diagnosticStudioService = !!diagnostic && studioServices.some(entry => entry.manifest.id === diagnostic.id && entry.manifest.version === diagnostic.version);
  const enabledVersion = data?.lock?.plugins.find(plugin => plugin.id === selectedEntry?.manifest.id)?.version;
  const changeLabel = enabledVersion === selectedEntry?.manifest.version ? t('停用此版本…','Disable this version…','このバージョンを無効化…') : enabledVersion ? t('切换到此版本…','Switch to this version…','このバージョンに切替…') : t('启用到作品…','Enable in project…','作品で有効化…');
  const missing = data?.lock?.plugins.filter(plugin => !data.entries.some(entry => entry.manifest.id === plugin.id && entry.manifest.version === plugin.version)) ?? [];
  const selectedMissing = missing.find(plugin => `missing/${plugin.id}` === selected);
  const showInspector = () => { setSide('inspector'); revealInspector?.(); };
  const selectPackage = (id: string) => {
    setSelected(id);
    const entry = packageEntries.find(item => item.key === id);
    if (entry) { openModal(''); setDiagnostic(entry.manifest); }
    else if (id.startsWith('missing/')) { openModal(''); setDiagnostic(null); }
  };
  const reviewImpact = () => selectedEntry && !selectedEntry.studioService && void run(async () => {
    const manifest = selectedEntry.manifest;
    setPlan(unwrap(await bridge.plugins.planChange({ pluginId: manifest.id,
      version: data?.lock?.plugins.some(plugin => plugin.id === manifest.id && plugin.version === manifest.version) ? null : manifest.version })));
    openModal('change');
  });
  const packageNode = (entry: typeof packageEntries[number]) => {
    const enabled = data?.lock?.plugins.some(plugin => plugin.id === entry.manifest.id && plugin.version === entry.manifest.version);
    return { id: entry.key, name: entry.display.name, icon: <Package size={15}/>, detail: <span className="plugin-tree-state"><span>{entry.manifest.version}{entry.registrations > 1 && ` · ${entry.registration}`}</span>{!entry.studioService && <Badge tone={enabled ? 'good' : ''}>{enabled ? t('已启用', 'Enabled', '有効') : t('未启用', 'Disabled', '無効')}</Badge>}</span> };
  };
  const explorer = <div className="plugin-explorer-content">
    <div className="plugin-explorer-actions"><Button tone="primary" onClick={() => { setInspection(null); openModal('install'); }}><Plus size={16}/>{t('安装插件', 'Install plugin', 'プラグインを追加')}</Button><Button onClick={() => { setInspection(null); openModal('development'); }}><FolderCode size={16}/>{t('开发目录', 'Development directory', '開発ディレクトリ')}</Button></div>
    {!data && !error && <div role="status" aria-label={t('正在读取插件', 'Loading plugins', 'プラグインを読み込み中')}><Skeleton className="loading-card"/></div>}
    {data && <ObjectTree label={t('本机插件与作品依赖', 'Installed plugins and dependencies', 'ローカルプラグインと作品の依存関係')}
      nodes={[...(studioServices.length ? [{ id: 'studio-services', name: t('Studio 默认装配', 'Provided by Studio', 'Studio 標準搭載'), icon: <Package size={15}/>, detail: String(studioServices.length), children: studioServices.map(packageNode) }] : []),
        { id: 'installed', name: t('本机已安装', 'Installed locally', 'ローカルにインストール済み'), icon: <Package size={15}/>, detail: String(installedEntries.length), children: installedEntries.map(packageNode) },
        ...(missing.length ? [{ id: 'missing', name: t('缺失的作品依赖', 'Missing project dependencies', '不足している作品の依存関係'), children: missing.map(plugin => ({ id: `missing/${plugin.id}`, name: plugin.id, detail: plugin.version })) }] : [])]}
    selected={[selected]} onSelect={ids => selectPackage(ids.at(-1) ?? '')} onOpen={selectPackage}/>}
    {data && !data.entries.length && <p className="plugin-explorer-empty">{t('安装插件后，在作品中启用需要的版本。', 'Install a plugin, then enable the version this project needs.', 'インストール後、作品に必要なバージョンを有効にします。')}</p>}
  </div>;
  const inspector = <div className="plugin-inspector-content">
    <InspectorSection title={selectedEntry?.display.name ?? t('插件概要', 'Plugin overview', 'プラグイン概要')}>
      {selectedEntry ? <><p>{selectedEntry.display.description}</p><dl className="plugin-inspector-facts">
        <dt>{t('包版本', 'Package version', 'パッケージのバージョン')}</dt><dd>{selectedEntry.manifest.version}</dd>
        {selectedEntry.registrations > 1 && <><dt>{t('本机登记', 'Local registration', 'ローカル登録')}</dt><dd>{selectedEntry.registration} / {selectedEntry.registrations}</dd></>}
        <dt>{t('支持目标', 'Targets', '対象')}</dt><dd>{selectedEntry.manifest.targets.join(' / ')}</dd>
        <dt>{t('本机状态', 'Local status', 'ローカル状態')}</dt><dd>{selectedEntry.development ? t('开发目录', 'Development directory', '開発ディレクトリ') : t('已安装', 'Installed', 'インストール済み')}</dd>
        <dt>{selectedEntry.studioService ? t('装配来源', 'Provided by', '提供元') : t('当前作品', 'Current project', '現在の作品')}</dt><dd>{selectedEntry.studioService ? t('Studio 默认装配', 'Provided by Studio', 'Studio 標準搭載') : data?.lock?.plugins.some(plugin => plugin.id === selectedEntry.manifest.id && plugin.version === selectedEntry.manifest.version) ? t('作品已启用', 'Enabled in project', '作品で有効') : t('作品未启用', 'Not enabled', '作品で無効')}</dd>
      </dl><div className="gc-actions"><Button onClick={() => { openModal(''); setDiagnostic(selectedEntry.manifest); }}>{t('贡献与诊断', 'Contributions and diagnostics', 'コントリビューションと診断')}</Button></div>
      <details><summary>{t('包身份', 'Package identity', 'パッケージID')}</summary><code>{selectedEntry.manifest.id}</code></details></> : selectedMissing ? <><p>{t('作品锁定的版本未在本机安装。安装对应包后再检查当前作品。', 'The locked version is not installed locally. Install the matching package, then check this project.', '作品で固定したバージョンがありません。対応パッケージをインストールしてください。')}</p><p>{selectedMissing.version}</p><code>{selectedMissing.id}</code></> : <>{!!studioServices.length && <p>{t('Studio 默认装配', 'Provided by Studio', 'Studio 標準搭載')} · {studioServices.length}</p>}<p>{t('本机已安装', 'Installed locally', 'ローカルにインストール済み')} · {installedEntries.length}</p><p>{t('作品已启用', 'Enabled in project', '作品で有効')} · {data?.lock?.plugins.filter(plugin => !studioServices.some(entry => entry.manifest.id === plugin.id && entry.manifest.version === plugin.version)).length ?? 0}</p><p>{t('选择插件查看版本、贡献和装配状态。', 'Select a plugin to inspect its version, contributions and assembly status.', 'プラグインを選択してバージョン、コントリビューション、搭載状態を確認します。')}</p></>}
    </InspectorSection>
  </div>;
  return (
    <main className={`plugins-page plugin-desktop-workbench ${explorerContainer ? 'has-external-explorer' : ''} ${inspectorContainer ? 'has-external-inspector' : ''}`} data-side={side}>
      {explorerContainer ? documentActive && createPortal(explorer, explorerContainer) : <aside className="plugin-local-explorer" aria-label="Explorer"><header className="plugin-pane-heading">{t('插件', 'Plugins', 'プラグイン')}</header>{explorer}</aside>}
      <div className="plugin-workbench-document">
        <header className="plugin-workbench-toolbar"><h1>{modal === 'install' ? t('安装插件包', 'Install package', 'パッケージを追加') : modal === 'development' ? t('加载开发目录', 'Load development directory', '開発ディレクトリを読み込む') : modal === 'change' ? t('插件变更影响', 'Plugin change impact', 'プラグイン変更の影響') : (diagnostic ? display(diagnostic).name : null) ?? t('插件', 'Plugins', 'プラグイン')}</h1><div className="gc-actions">{selectedEntry && !selectedEntry.studioService && modal !== "change" && <Button disabled={busy} tone="primary" onClick={reviewImpact}>{changeLabel}<ArrowRight size={14}/></Button>}{!explorerContainer && <Button tone="quiet" className="plugin-local-toggle" onClick={() => setSide('explorer')}>{t('插件列表', 'Plugins', 'プラグイン一覧')}</Button>}<Button tone="quiet" onClick={showInspector}>{t('插件属性', 'Plugin properties', 'プラグインのプロパティ')}</Button></div></header>
        <div className="plugin-document-scroll">
      {error && !modal && <div role="alert" className="workbench-error"><p>{error}</p><Button disabled={busy} onClick={() => void run(async () => {})}>{t('重新读取插件','Reload plugins','プラグインを再読込')}</Button></div>}
      {selectedMissing && !modal && <Empty title={t('缺少作品依赖', 'Project dependency missing', '作品の依存関係がありません')} detail={t('从插件列表安装作品锁定的版本。', 'Install the locked version from the plugin explorer.', 'プラグイン一覧から固定されたバージョンをインストールします。')}/>}
      {data && !data.entries.length && !selectedMissing && !modal && <Empty title={t('本机尚未安装插件','No plugins installed locally','ローカルプラグインはありません')} detail={t('安装插件包后，再审阅并启用到当前作品。','Install a package, then review and enable it in this project.','パッケージをインストールしてから、確認して作品で有効化します。')}><Button tone="primary" onClick={() => { setInspection(null); openModal('install'); }}>{t('安装插件','Install plugin','プラグインを追加')}</Button></Empty>}
      {data && !!data.entries.length && !selectedMissing && !diagnostic && !modal && <Empty title={t('选择插件', 'Select a plugin', 'プラグインを選択')} detail={t('查看贡献与诊断，或审阅当前作品的启用影响。', 'Inspect contributions or review the impact on this project.', 'コントリビューションと診断、または作品への影響を確認します。')}/>}
      {diagnostic && <section className="plugin-editor" aria-label={`${display(diagnostic).name} · ${t('贡献与诊断', 'Contributions and diagnostics', 'コントリビューションと診断')}`}>
        <PluginOverview manifest={diagnostic} enabledVersion={data?.lock?.plugins.find(plugin => plugin.id === diagnostic.id)?.version} studioService={diagnosticStudioService} locale={locale}/>
        <h3>{t('贡献与诊断', 'Contributions and diagnostics', 'コントリビューションと診断')}</h3>
        <p>{t('此处显示编辑端状态；主进程服务和演出运行时在使用时加载，按需状态不代表已通过运行验证。', 'Editor status is shown here. Host services and runtime contributions load on demand; this does not confirm successful execution.', 'ここには編集環境の状態を表示します。ホストサービスと実行環境は必要時に読み込み、動作検証の完了を示しません。')}</p>
        <div className="plugin-document-list">{[...diagnostic.contributions.map(item => ({ key: item.key, kind: item.kind, target: item.targets.join(' / ') })), ...(diagnostic.studio ?? []).map(item => ({ key: item.key, kind: item.kind, target: item.slot }))].map(item => {
          const state = contributionStatus(diagnostic, item, diagnosticStudioService || (data?.lock?.plugins.some(plugin => plugin.id === diagnostic.id && plugin.version === diagnostic.version) ?? false), authorHost?.inspect(diagnostic.id));
          const label = contributionStatusLabels[state];
          return <article key={item.key}><div><strong>{pluginCapabilityLabel(item.kind, locale)}</strong><p>{item.target}</p><details><summary>{t('贡献标识','Contribution identity','機能の識別情報')}</summary><Identity label={t('贡献键','Contribution key','機能キー')} value={item.key} locale={locale}/></details></div><Badge tone={state === 'active' || state === 'definition' ? 'good' : ''}>{t(label[0], label[1], label[2])}</Badge></article>;
        })}</div>
        {authorHost?.inspect(diagnostic.id).loadError && <p role="alert" className="workbench-error">{authorHost.inspect(diagnostic.id).loadError}</p>}
        {authorHost?.inspect(diagnostic.id).issues.map((issue, index) => <IssueNotice key={index} issue={issue} locale={locale}/>)}
        <details><summary>{t('包身份与入口', 'Package identity and entries', 'パッケージIDとエントリー')}</summary><Identity label={t('插件 ID','Plugin ID','プラグイン ID')} value={diagnostic.id} locale={locale}/><CodeBlock code={JSON.stringify({ version:diagnostic.version, targets:diagnostic.targets, stateVersions:diagnostic.stateVersions, studioVersion:authorHost?.inspect(diagnostic.id).manifest?.version ?? null, schemaVersion: diagnostic.schemaVersion, sdkMajor: diagnostic.sdkMajor, entry: diagnostic.entry }, null, 2)} language="json" locale={locale}/></details>
        <footer><Button onClick={() => setDiagnostic(null)}>{t('关闭', 'Close', '閉じる')}</Button></footer>
      </section>}
      {["install", "development"].includes(modal) && (
        <section className="plugin-editor" aria-label={
            modal === "install"
              ? t("安装插件包", "Install package", "パッケージを追加")
              : t(
                  "加载开发目录",
                  "Load development directory",
                  "開発ディレクトリを読み込む",
                )
          }>
          <header className="plugin-editor-heading"><h2>{modal === 'install' ? t('安装插件包', 'Install package', 'パッケージを追加') : t('加载开发目录', 'Load development directory', '開発ディレクトリを読み込む')}</h2><Button tone="quiet" disabled={busy} onClick={() => openModal('')}>{t('返回插件列表', 'Back to plugins', 'プラグイン一覧へ戻る')}</Button></header>
          <Field label={t("本机路径", "Local path", "ローカルパス")}>
            <Input
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setInspection(null);
              }}
            />
          </Field>
          <div className="gc-actions">
            <Button disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (modal === "development") {
                    const directory = bridge.files.chooseImport?unwrap(await bridge.files.chooseImport({purpose:'packages',directory:true}))[0]:unwrap(await bridge.projects.chooseDirectory());
                    if (directory) setPath(directory);
                  } else {
                    const paths = unwrap(await (bridge.files.chooseImport?bridge.files.chooseImport({purpose:'packages',extensions:['galplugin','zip']}):bridge.files.pickAssets()));
                    if (paths[0]) {
                      setPath(paths[0]);
                      setInspection(null);
                    }
                  }
                })
              }
            >
              {modal === "development"
                ? t("选择目录", "Choose directory", "ディレクトリを選択")
                : t("选择文件", "Choose file", "ファイルを選択")}
            </Button>
          </div>
          {inspection !== null && (
            <>
              <section className="plugin-inspection">
                <h3>{display(inspection.manifest).name} <Badge>{inspection.manifest.version}</Badge></h3>
                <p>{display(inspection.manifest).description}</p>
                <dl className="impact-facts">
                  <dt>{t('包身份', 'Package ID', 'パッケージ ID')}</dt><dd>{inspection.manifest.id}</dd>
                  <dt>{t('支持目标', 'Targets', '対象')}</dt><dd>{inspection.manifest.targets.join(' / ')}</dd>
                  <dt>{t('已安装版本', 'Installed version', 'インストール済み')}</dt><dd>{inspection.installedVersion ?? t('尚未安装', 'Not installed', '未インストール')}</dd>
                </dl>
                {inspection.issues.map((issue,index) => <IssueNotice key={index} issue={issue} locale={locale}/>)}
                <details><summary>{t('包清单详情', 'Package manifest', 'パッケージの詳細')}</summary><CodeBlock code={JSON.stringify(inspection.manifest, null, 2)} locale={locale} /></details>
              </section>
            </>
          )}
          <footer className="dialog-actions plugin-dialog-actions">
            {error && <p className="workbench-error" role="alert">{error}</p>}
            <div className="gc-actions">
              <Button disabled={busy} onClick={() => openModal("")}>{t("取消", "Cancel", "キャンセル")}</Button>
              {inspection === null ? <>
            <Button tone="primary"
              disabled={busy || !path}
              onClick={() =>
                void run(async () => {
                  if (modal === "development") {
                    unwrap(
                      await bridge.plugins.loadDevelopment({
                        directory: path,
                        projectId,
                      }),
                    );
                    openModal("");
                  } else
                    setInspection(
                      unwrap(
                        await bridge.plugins.inspectPackage({
                          kind: /\.(zip|galplugin)$/i.test(path)
                            ? "archive"
                            : "directory",
                          path,
                        }),
                      ) as import('@galcraft/plugins').PackageInspection,
                    );
                })
              }
            >
              {t("检查", "Inspect", "確認")}
            </Button>
              </> : <>
              <Button
                tone="primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    unwrap(
                      await bridge.plugins.install({
                        kind: /\.(zip|galplugin)$/i.test(path)
                          ? "archive"
                          : "directory",
                        path,
                      }),
                    );
                    openModal("");
                  })
                }
              >
                {t("确认安装", "Confirm install", "インストールを確認")}
              </Button>
              </>}
            </div>
          </footer>
        </section>
      )}
      {modal === "change" && plan && (
        <section className="plugin-editor" aria-label={t(
            "插件变更影响",
            "Plugin change impact",
            "プラグイン変更の影響",
          )}>
          <header className="plugin-editor-heading"><h2>{t('插件变更影响', 'Plugin change impact', 'プラグイン変更の影響')}</h2><Button tone="quiet" disabled={busy} onClick={() => openModal('')}>{t('返回插件列表', 'Back to plugins', 'プラグイン一覧へ戻る')}</Button></header>
          <div className="plugin-impact-list" role="region" aria-label={t('插件影响清单','Plugin impact list','プラグイン影響一覧')} tabIndex={0}>{plan.change.changes.map(change => <section className="plugin-impact" key={change.pluginId}>
            <header><Package size={22} /><h3>{packageEntries.find(entry => entry.manifest.id === change.pluginId)?.display.name ?? change.pluginId}</h3>
              <Badge tone={change.to ? 'good' : 'warm'}>{change.to
                ? change.from ? t('将切换版本', 'Will change version', 'バージョン変更予定') : t('将启用', 'Will enable', '有効化予定')
                : t('将停用', 'Will disable', '無効化予定')}</Badge></header>
            <div className="plugin-version-change"><span>{t('当前', 'Current', '現在')} · {change.from ?? t('未启用', 'Not enabled', '無効')}</span><ArrowRight size={18} /><strong>{t('确认后', 'After confirmation', '確認後')} · {change.to ?? t('停用', 'Disabled', '無効')}</strong></div>
            <dl className="impact-facts">
              <dt>{t('关联文档', 'Affected documents', '関連文書')}</dt><dd>{change.affected.length}</dd>
              <dt>{t('涉及资料', 'Data scope', 'データ範囲')}</dt><dd>{change.savedData.map(kind => ({ document: t('作品文档','Documents','作品文書'), progress: t('游戏进度','Progress','ゲーム進行'), longTerm: t('长期资料','Long-term data','長期データ') })[kind] ?? kind).join(' · ')}</dd>
              <dt>{t('目标依赖', 'Target dependencies', '変更後の依存関係')}</dt><dd>{change.dependencies.map(item => `${item.id} · ${item.version}`).join('\n') || '—'}</dd>
            </dl>
            {change.issues.map((issue,index) => <IssueNotice key={index} issue={issue} locale={locale}/>)}
          </section>)}</div>
          <details><summary>{t('展开完整影响清单', 'Full impact details', '影響の詳細を表示')}</summary><CodeBlock code={JSON.stringify(plan.change.changes, null, 2)} locale={locale} /></details>
          <p>
            {t(
              "确认后更新作品工作内容；保存后保留精确依赖。",
              "Confirmation updates working content. Save persists the exact dependency.",
              "確認後に作業内容を更新します。保存すると正確な依存バージョンを保持します。",
            )}
          </p>
          <footer className="dialog-actions plugin-dialog-actions">
            {error && <p className="workbench-error" role="alert">{error}</p>}
            <div className="gc-actions">
              <Button disabled={busy} onClick={() => openModal("")}>{t("取消", "Cancel", "キャンセル")}</Button>
          <Button
            tone="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                unwrap(
                  await bridge.documents.applyEdit(
                    plan.edit.planId,
                    plan.edit.input.expected,
                  ),
                );
                await changed();
                openModal("");
              })
            }
          >
            {t("确认变更", "Confirm change", "変更を確認")}
          </Button>
            </div>
          </footer>
        </section>
      )}
      </div>
      </div>
      {inspectorContainer ? documentActive && createPortal(inspector, inspectorContainer) : <aside className="plugin-local-inspector" aria-label="Inspector"><header className="plugin-pane-heading">{t('插件属性', 'Plugin properties', 'プラグインのプロパティ')}</header>{inspector}</aside>}
    </main>
  );
}
