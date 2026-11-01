import { useEffect, useRef, useState } from 'react';
import { createId } from '@galcraft/contracts';
import type { BuildInput, Json } from '@galcraft/contracts';
import type { WorkbenchBridge } from '../Production/bridge.js';
import type { TargetBuilderDescription, TargetBuilderProgress, TargetToolchain } from '@galcraft/plugins/contracts';
import { Button, Choice, Field } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { Progress } from '../../components/ui/progress.js';
import './mobile-targets.css';

export type MobileBuildDraft = { builder: NonNullable<BuildInput['targetBuilder']> | null; options: Record<string, Json> };
export type MobileDrafts = Partial<Record<'android' | 'ios', MobileBuildDraft>>;
export function initialMobileOptions(target: 'android' | 'ios', projectId: string): Record<string, Json> {
  const identity = `org.galcraft.game${projectId.replaceAll('-', '').toLowerCase()}`;
  return target === 'android' ? { applicationId: identity, versionCode: 1, orientation: 'landscape', minSdk: 26, targetSdk: 35, output: 'apk', toolchain: { directory: '' } } :
    { bundleId: identity, buildNumber: '1', orientation: 'landscape', minimumOSVersion: '15.0', output: 'xcodeProject' };
}
type Catalog = { builder: NonNullable<BuildInput['targetBuilder']>; description: TargetBuilderDescription }[];
export function MobileTargetOptions({ target, value, onChange, builds, chooseDirectory, locale = 'zh-CN' }: {
  target: 'android' | 'ios'; value: MobileBuildDraft; onChange(value: MobileBuildDraft): void;
  builds: WorkbenchBridge['builds']; chooseDirectory(): Promise<string | null>; locale?: string;
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [catalog, setCatalog] = useState<Catalog>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [licenses, setLicenses] = useState(false);
  const [progress, setProgress] = useState<TargetBuilderProgress | null>(null), [tools, setTools] = useState<TargetToolchain | null>(null);
  const operation = useRef<string | null>(null);
  const unwrap = <T,>(result: import('@galcraft/contracts').Result<T>) => { if (!result.ok) throw new Error(result.error.message); return result.value; };
  useEffect(() => { let live = true; void builds.targets().then(result => { if (live) { if (result.ok) setCatalog(result.value.filter(item => item.description.target === target)); else setError(result.error.message); } });
    return () => { live = false; }; }, [builds, target]);
  useEffect(() => builds.subscribeToolchainProgress?.(event => { if (event.operationId === operation.current) setProgress(event); }), [builds]);
  const selected = catalog.find(item => item.builder.key === value.builder?.key && item.builder.pluginId === value.builder.pluginId && item.builder.version === value.builder.version);
  const update = (key: string, next: Json) => { onChange({ ...value, options: { ...value.options, [key]: next } }); setTools(null); };
  const options = value.options;
  const toolchain = (options.toolchain ?? { directory: '' }) as Record<string, Json>;
  const updateTool = (key: string, next: string) => update('toolchain', { ...toolchain, [key]: next });
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { operation.current = null; setProgress(null); setBusy(false); } };
  return <section className="publish-mobile" aria-label={t('移动目标设置', 'Mobile target settings', 'モバイル対象設定')}>
    <h3>{target === 'android' ? 'Android' : 'iOS'}</h3>
    <Field label={t('目标构建器', 'Target builder', '対象ビルダー')}><Choice label={t('目标构建器', 'Target builder', '対象ビルダー')}
      value={selected ? `${selected.builder.pluginId}@${selected.builder.version}/${selected.builder.key}` : ''}
      onChange={key => { const entry = catalog.find(item => `${item.builder.pluginId}@${item.builder.version}/${item.builder.key}` === key); onChange({ ...value, builder: entry?.builder ?? null, options: target === 'android' && !toolchain.directory && entry?.description.toolchain ? { ...value.options, toolchain: entry.description.toolchain as unknown as Json } : value.options }); }}
      options={[{ value: '', label: t('选择已安装的构建器', 'Choose an installed builder', 'インストール済みビルダーを選択') }, ...catalog.map(item => ({ value: `${item.builder.pluginId}@${item.builder.version}/${item.builder.key}`, label: `${item.description.name} · ${item.builder.version}` }))]}/></Field>
    {!catalog.length && <p>{t('此目标没有可用构建器，请在插件页安装目标包。', 'Install a target package in Plugins to build this target.', 'プラグインで対象パッケージをインストールしてください。')}</p>}
    {selected && <>
      <Field label={target === 'android' ? t('应用 ID', 'Application ID', 'アプリ ID') : 'Bundle ID'}><Input value={String(options[target === 'android' ? 'applicationId' : 'bundleId'] ?? '')} onChange={event => update(target === 'android' ? 'applicationId' : 'bundleId', event.target.value)}/></Field>
      <Field label={t('构建序号', 'Build number', 'ビルド番号')}><Input inputMode="numeric" value={String(options[target === 'android' ? 'versionCode' : 'buildNumber'] ?? '')} onChange={event => update(target === 'android' ? 'versionCode' : 'buildNumber', target === 'android' ? Number(event.target.value) : event.target.value)}/></Field>
      <Field label={t('屏幕方向', 'Orientation', '画面の向き')}><Choice label={t('屏幕方向', 'Orientation', '画面の向き')} value={String(options.orientation ?? 'landscape')} onChange={value => update('orientation', value)} options={[{ value: 'landscape', label: t('固定横屏', 'Landscape', '横向き固定') }, { value: 'sensorLandscape', label: t('横屏随设备旋转', 'Both landscape orientations', '横向きで回転') }]}/></Field>
      <Field label={t('输出类型', 'Output', '出力形式')}><Choice label={t('输出类型', 'Output', '出力形式')} value={String(options.output ?? '')} onChange={output => {onChange({...value,options:{...options,output,...(target==='android'?{signingMode:output==='aab'?'author':'test'}:{})}});setTools(null);}} options={target === 'android' ? [{value:'androidProject',label:t('完整 Android 工程','Complete Android project','完全な Android プロジェクト')},{ value: 'apk', label: 'APK' }, { value: 'aab', label: 'AAB' }] : [{ value: 'xcodeProject', label: t('完整 Xcode 工程', 'Complete Xcode project', '完全な Xcode プロジェクト') }, { value: 'archive', label: t('Xcode 归档 · 需要 macOS', 'Xcode archive · requires macOS', 'Xcode アーカイブ・macOS が必要') }]}/></Field>
      {target === 'ios' ? <>
        <p>{t('工程包含共同 Player、作品快照、资源和原生桥。Windows 可直接导出；归档与签名在 macOS 使用 Xcode 完成。', 'The project includes the shared Player, snapshot, assets and native bridge. Export on Windows; archive and sign using Xcode on macOS.', '共通 Player、スナップショット、素材、ネイティブブリッジを含みます。Windows で出力し、macOS の Xcode で署名します。')}</p>
        {options.output === 'archive' && <Field label={t('Apple 开发团队 ID', 'Apple development team ID', 'Apple 開発チーム ID')}><Input value={String(options.developmentTeam ?? '')} onChange={event => update('developmentTeam', event.target.value)}/></Field>}
      </> : options.output==='androidProject'?<p>{t('导出完整工程，在 Android Studio 中配置工具与签名。此输出无需检测或下载 SDK/JDK，也不执行 Gradle。','Export a complete project and configure tools and signing in Android Studio. This output does not detect or download SDK/JDK, or run Gradle.','完全なプロジェクトを出力し、Android Studio でツールと署名を設定します。SDK/JDK の確認・取得や Gradle 実行は行いません。')}</p>:<>
        <h4>{t('Android 构建环境', 'Android build environment', 'Android ビルド環境')}</h4>
        <p>{t('JDK、SDK 与 Gradle 缓存独立保存。准备环境会复用兼容工具，取消后已完成组件仍可使用。', 'JDK, SDK and Gradle cache stay outside Studio. Compatible tools are reused; completed components remain available after cancellation.', 'JDK、SDK、Gradle キャッシュは Studio の外に保存。対応ツールを再利用し、中止後も完了した構成を保持します。')}</p>
        <Field label={t('工具下载位置', 'Tool download location', 'ツール保存先')}><Input value={String(toolchain.directory ?? '')} onChange={event => updateTool('directory', event.target.value)}/></Field>
        <Button disabled={busy} onClick={() => void run(async () => { const path = await chooseDirectory(); if (path) updateTool('directory', path); })}>{t('选择工具目录', 'Choose tools directory', 'ツールフォルダーを選択')}</Button>
        <details><summary>{t('复用已有 JDK / SDK', 'Reuse existing JDK / SDK', '既存の JDK / SDK を使用')}</summary>
          <Field label={t('JDK 路径', 'JDK path', 'JDK パス')}><Input value={String(toolchain.javaHome ?? '')} onChange={event => updateTool('javaHome', event.target.value)}/></Field>
          <Field label={t('Android SDK 路径', 'Android SDK path', 'Android SDK パス')}><Input value={String(toolchain.sdkRoot ?? '')} onChange={event => updateTool('sdkRoot', event.target.value)}/></Field>
        </details>
        <label className="publish-mobile-license"><input type="checkbox" checked={licenses} onChange={event => setLicenses(event.target.checked)}/><span>{t('我已阅读并同意', 'I have read and accept the', '次の内容を確認し同意します：')} <a href="https://developer.android.com/studio/terms" target="_blank" rel="noreferrer">Android SDK {t('许可条款', 'license terms', 'ライセンス条項')}</a></span></label>
        <div className="gc-actions">
          <Button disabled={busy || !toolchain.directory} onClick={() => void run(async () => { setTools(unwrap(await builds.detectToolchain({ builder: selected.builder, input: { directory: String(toolchain.directory), ...(toolchain.javaHome ? { javaHome: String(toolchain.javaHome) } : {}), ...(toolchain.sdkRoot ? { sdkRoot: String(toolchain.sdkRoot) } : {}) } }))); })}>{t('检测环境', 'Detect tools', '環境を確認')}</Button>
          <Button disabled={busy || !licenses || !toolchain.directory} onClick={() => void run(async () => { const operationId = createId(); operation.current = operationId; setProgress({ phase: 'detecting', message: t('准备环境', 'Preparing tools', '環境を準備'), completed: 0, total: null });
            setTools(unwrap(await builds.prepareToolchain({ builder: selected.builder, operationId, input: { directory: String(toolchain.directory), ...(toolchain.javaHome ? { javaHome: String(toolchain.javaHome) } : {}), ...(toolchain.sdkRoot ? { sdkRoot: String(toolchain.sdkRoot) } : {}), acceptLicenses: licenses } }))); operation.current = null;
          })}>{t('准备环境', 'Prepare tools', '環境を準備')}</Button>
          {busy && operation.current && <Button onClick={() => void builds.cancelToolchain(operation.current!).then(result => { if (!result.ok) setError(result.error.message); })}>{t('取消准备', 'Cancel preparation', '準備を中止')}</Button>}
        </div>
        {progress && <div role="status" className="publish-mobile-progress"><strong>{progress.message}</strong><Progress aria-label={t('Android 环境准备进度', 'Android tool preparation', 'Android 環境の準備状況')} value={progress.total ? progress.completed / progress.total * 100 : null}/>{progress.total !== null && <span>{Math.round(progress.completed / 1024 / 1024)} / {Math.round(progress.total / 1024 / 1024)} MB</span>}</div>}
        {tools && <div role="status"><strong>{t('环境可用', 'Tools ready', '環境を利用できます')}</strong><p>{tools.javaHome}<br/>{tools.sdkRoot}<br/>{tools.cacheDirectory}</p>{tools.space && <p>{t('外置工具与下载归档', 'External tools and downloads', '外部ツールとダウンロード')} · {Math.ceil(tools.space.toolsBytes / 1048576)} MB<br/>Gradle {t('缓存', 'cache', 'キャッシュ')} · {Math.ceil(tools.space.cacheBytes / 1048576)} MB</p>}</div>}
        <Field label={t('签名方式','Signing mode','署名方式')}><Choice label={t('签名方式','Signing mode','署名方式')} value={String(options.signingMode??(options.output==='aab'?'author':options.signing?'author':'test'))} onChange={signingMode=>onChange({...value,options:{...options,signingMode,...(signingMode==='test'?{signing:null}:{})}})} options={[{value:'author',label:t('作者发布签名','Author release signing','作者の配布用署名')},{value:'test',label:t('明确用于本地测试','Explicit local test','ローカルテスト用')}]}/></Field>
        <p className="field-help">{t('AAB 默认要求作者发布签名；本地测试签名仅用于明确的测试目标。密码从本机环境变量读取。','AAB requires author release signing by default. Local test signing is only for explicit testing. Passwords are read from local environment variables.','AAB は既定で作者の配布用署名が必要です。テスト署名は明示したローカルテスト専用です。')}</p>
        {(options.signingMode??(options.output==='aab'?'author':options.signing?'author':'test'))==='author'&&<details open><summary>{t('作者密钥库','Author keystore','作者のキーストア')}</summary>
          {(['storeFile', 'keyAlias', 'storePasswordEnvironment', 'keyPasswordEnvironment'] as const).map((key, index) => <Field key={key} label={[t('密钥库路径', 'Keystore path', 'キーストアのパス'), t('密钥别名', 'Key alias', 'キー別名'), t('库密码环境变量', 'Store password environment variable', 'ストアパスワード環境変数'), t('密钥密码环境变量', 'Key password environment variable', 'キーパスワード環境変数')][index]!}><Input value={String((options.signing as Record<string, Json> | undefined)?.[key] ?? '')} onChange={event => { const signing = { ...(options.signing as Record<string, Json> ?? {}), [key]: event.target.value }; update('signing', Object.values(signing).some(Boolean) ? signing : null); }}/></Field>)}
        </details>}
      </>}
      <details><summary>{t('目标能力与版本', 'Target capabilities and versions', '対象機能とバージョン')}</summary><p>{selected.builder.pluginId} · {selected.builder.version}</p><p>{selected.description.architectures.join(' / ')}</p>{selected.description.tools.map(tool => <p key={tool.id}>{tool.id} · {tool.version}<br/>{tool.purpose}</p>)}</details>
    </>}
    {error && <p role="alert" className="workbench-error">{error}</p>}
  </section>;
}
