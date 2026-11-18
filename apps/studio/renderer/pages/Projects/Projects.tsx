import { MessageBox } from '../../components/workbench/MessageBox.js';
import { useModalState } from '../../components/motion.js';
import { Input } from '../../components/ui/input.js';
import { useEffect, useRef, useState } from "react";
import type { Result } from '@galcraft/contracts';
import {
  ArrowRight,
  ArchiveRestore,
  BookOpen,
  FolderOpen,
  Layers3,
  LoaderCircle,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import type {
  AuthoringSource,
  StudioLocale,
} from "../../authoring/controller.js";
import { Button, Choice, Field, Modal } from "../../components/controls.js";
import { tr } from "../Production/Production.js";
import "./projects.css";
import { ProjectLibrary, type ProjectLibraryActions } from './ProjectLibrary.js';
import { RestoreProject, type RestoreProjectPort } from './RestoreProject.js';

export type ProjectDraft = {
  name: string;
  template: "empty" | "light" | "standard" | "rich";
  width: number;
  height: number;
  engineVersion: string;
};
export function Projects({
  locale,
  source,
  open,
  copy,
  backup,
  restoreBridge,
  openRestored,
  library,
  openRecent,
  reveal,
  navigate,
  continueAuthoring,
  openSettings,
  openMaintenance,
  recovery,
  create,
  listCreationVersions,
  draft,
  updateDraft,
  explorerContainer,
  inspectorContainer,
  revealInspector,
  onUnappliedChange,
}: {
  locale: StudioLocale;
  source: AuthoringSource | null;
  open(): Promise<void>;
  copy(directory?: string): Promise<void>;
  backup?(directory?: string): Promise<void>;
  restoreBridge?: RestoreProjectPort;
  openRestored?(directory: string): Promise<boolean>;
  library?: ProjectLibraryActions;
  openRecent?(directory: string): Promise<void>;
  reveal(): Promise<void>;
  navigate(page: "editor" | "pages" | "production"): void;
  continueAuthoring?(): void;
  openSettings?(): void;
  openMaintenance?(): void;
  recovery?: { pending: boolean; review(): void };
  create(value: ProjectDraft): Promise<boolean>;
  listCreationVersions(): Promise<Result<string[]>>;
  draft: ProjectDraft;
  updateDraft(value: ProjectDraft): void;
  explorerContainer?: HTMLElement;
  inspectorContainer?: HTMLElement;
  revealInspector?(): void;
  onUnappliedChange?(dirty: boolean): void;
}) {
  const t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja);
  const [creating, setCreating] = useState(false), [creatingActive, setCreatingActive] = useState(false), [discardCreate, setDiscardCreate] = useState(false), [createBaseline, setCreateBaseline] = useState(''),
    [busy, setBusy] = useState(false), [creatingProject, setCreatingProject] = useState(false);
  const creatingRequest = useRef(false);
  const [restoring, setRestoring] = useState(false);
  const [form, setForm] = useState(draft);
  const [engineVersions, setEngineVersions] = useState<string[]>([]);
  const [engineError, setEngineError] = useState('');
  const [preparingCreate, setPreparingCreate] = useState(false);
  const [actionError, setActionError] = useState('');
  const change = (patch: Partial<ProjectDraft>) => {
    const next = { ...form, ...patch };
    setForm(next);
    updateDraft(next);
  };
  const templates = [
    {
      id: "standard",
      title: t("标准", "Standard", "標準"),
      note: t(
        "完整阅读体验，含 CG 与音乐鉴赏",
        "Reading, saves, CG and music galleries",
        "読書・セーブ・CG・音楽鑑賞",
      ),
    },
    {
      id: "light",
      title: t("轻量", "Light", "軽量"),
      note: t(
        "从阅读、存档和历史开始",
        "Reading, saves and history essentials",
        "読書・セーブ・履歴から始める",
      ),
    },
    {
      id: "rich",
      title: t("丰富", "Rich", "豊富"),
      note: t(
        "加入流程图、角色与变量关系页",
        "Flowchart, characters and variable relationships",
        "フロー・キャラクター・変数の関係ページ",
      ),
    },
    {
      id: "empty",
      title: t("空白作品", "Blank project", "空の作品"),
      note: t(
        "搭建自己的故事结构",
        "Build your own story structure",
        "独自の物語構成を作る",
      ),
    },
  ] as const;
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const loadVersions = async () => {
    setPreparingCreate(true); setEngineError('');
    try {
      const result = await listCreationVersions();
      const versions = result.ok ? result.value : [];
      setEngineVersions(versions);
      if (!result.ok) setEngineError(result.error.message);
      change({ engineVersion: versions.includes(form.engineVersion) ? form.engineVersion : versions.at(-1) ?? '' });
    } catch (error) { setEngineVersions([]); setEngineError(String(error)); }
    finally { setPreparingCreate(false); }
  };
  const openCreate = () => { if(creating){setCreatingActive(true);return;} void run(async () => {
    await loadVersions();
    setCreating(true); setCreatingActive(true); setCreateBaseline(JSON.stringify(form));
  }); };
  const createDirty = creating && JSON.stringify({ ...form, engineVersion: '' }) !== (createBaseline ? JSON.stringify({ ...JSON.parse(createBaseline), engineVersion: '' }) : JSON.stringify({ ...form, engineVersion: '' }));
  useEffect(() => { onUnappliedChange?.(createDirty); }, [createDirty, onUnappliedChange]);
  const closeCreate = () => { if (createDirty) { setDiscardCreate(true); return false; } setCreating(false);setCreatingActive(false);return true; };
  if (restoring && restoreBridge && openRestored) return <main className="project-workbench"><RestoreProject locale={locale} bridge={restoreBridge} open={openRestored} close={() => setRestoring(false)}/></main>;
  return (
    <main className="project-workbench">
      {!creatingActive && <header className="project-welcome">
        <div>
          <h1>
            {t(
              "作品中心",
              "Project center",
              "作品センター",
            )}
          </h1>
          <p>
            {t(
              "继续上次的编辑，或打开、新建和恢复作品。",
              "Pick up where you left off, or open, create, and restore projects.",
              "前回の編集を続けるか、作品を開く・作成・復元できます。",
            )}
          </p>
        </div>
        <div className="project-actions">
          {restoreBridge && openRestored && <Button disabled={busy} onClick={() => setRestoring(true)}><ArchiveRestore size={16}/>{t('从备份恢复', 'Restore backup', 'バックアップから復元')}</Button>}
          <Button disabled={busy} onClick={() => void run(open)}>
            <FolderOpen size={16} />
            {t("打开作品文件夹", "Open project folder", "作品フォルダーを開く")}
          </Button>
          <Button tone="primary" disabled={busy} aria-busy={preparingCreate} onClick={openCreate}>
            {preparingCreate ? <LoaderCircle size={16} className="gc-wb-spin" aria-hidden="true"/> : <Plus size={16} />}
            {preparingCreate ? t('正在准备…','Preparing…','準備中…') : t("新建作品", "New project", "新規作品")}
          </Button>
        </div>
      </header>}
      {!creatingActive && recovery?.pending && <section className="project-recovery-notice" aria-label={t('保留的作品草稿', 'Retained project draft', '保持した作品の草稿')}>
        <div><strong>{t('此作品有保留的草稿', 'This project has a retained draft', 'この作品には保持した草稿があります')}</strong>
          <p>{t('比较草稿与已保存内容，然后选择恢复或丢弃。', 'Compare the draft with saved content, then restore or discard it.', '草稿を保存済みの内容と比較し、復元または破棄を選びます。')}</p></div>
        <Button onClick={() => recovery.review()}>{t('查看保留的草稿', 'Review retained draft', '保持した下書きを確認')}</Button>
      </section>}
      {!creatingActive && preparingCreate && <p role="status" className="project-library-hint">{t('正在准备作品模板与本机引擎…','Preparing templates and local engines…','テンプレートとローカルエンジンを準備中…')}</p>}
      {!creatingActive && actionError && <p className="project-library-error" role="alert">{actionError}</p>}
      {creating && <nav className="project-section-navigation" aria-label={t('作品中心内容','Project library content','作品ライブラリの内容')}>
        {creatingActive
          ? <Button tone="quiet" onClick={() => setCreatingActive(false)}>{t('返回作品库','Back to library','ライブラリに戻る')}</Button>
          : <Button tone="quiet" onClick={() => setCreatingActive(true)}>{t('新建作品草稿','New project draft','新規作品の下書き')}{createDirty && ' ·'}</Button>}
      </nav>}
      <div hidden={creatingActive}>
      <p className="field-help">{t('完整教学样例单独提供 .galproject 文件；下载后从备份恢复，并选择创建独立副本。', 'The complete tutorial is a separate .galproject file. Download it, restore the backup, and choose an independent copy.', '完全なチュートリアルは別配布の .galproject ファイルです。ダウンロード後、バックアップから独立したコピーとして復元してください。')}</p>
      <ProjectLibrary locale={locale} library={library} currentId={source?.project.projectId} revision={source?.projectRevision} open={openRecent ?? (async () => open())} copy={copy} backup={backup} explorerContainer={explorerContainer} inspectorContainer={inspectorContainer} revealInspector={revealInspector} />
      {source ? (
        <section className="project-current">
          <div className="project-cover" aria-hidden="true">
            <div className="project-cover-lines" />
            <span>{source.project.name.slice(0, 1)}</span>
            <small>GALCRAFT</small>
          </div>
          <div className="project-current-body">
            <span className="project-kicker">
              {t("当前作品", "CURRENT PROJECT", "現在の作品")}
            </span>
            <h2>{source.project.name}</h2>
            <p>
              {source.project.description ||
                t(
                  "你的场景、角色与每一次选择，都在这里。",
                  "Your scenes, characters and choices, together.",
                  "シーンもキャラクターも、すべての選択もここに。",
                )}
            </p>
            <dl>
              <div>
                <dt>{t("场景", "Scenes", "シーン")}</dt>
                <dd>{source.scenes.length}</dd>
              </div>
              <div>
                <dt>{t("角色", "Characters", "キャラクター")}</dt>
                <dd>{source.characters.length}</dd>
              </div>
              <div>
                <dt>{t("画布", "Canvas", "キャンバス")}</dt>
                <dd>
                  {source.project.canvas.width} × {source.project.canvas.height}
                </dd>
              </div>
            </dl>
            <div className="project-actions">
              <Button tone="primary" onClick={continueAuthoring ?? (() => navigate("editor"))}>
                {t("继续创作", "Continue authoring", "制作を続ける")}
                <ArrowRight size={16} />
              </Button>
              {openSettings && <Button tone="quiet" onClick={openSettings}>{t('作品设置', 'Project settings', '作品設定')}</Button>}
              {openMaintenance && <Button tone="quiet" onClick={openMaintenance}>{t('作品维护', 'Project maintenance', '作品のメンテナンス')}</Button>}
              <Button tone="quiet" onClick={() => void run(reveal)}>
                <FolderOpen size={15} />
                {t("所在目录", "Project folder", "作品フォルダー")}
              </Button>
              <Button tone="quiet" disabled={busy} onClick={() => void run(copy)}>
                {t("复制作品", "Duplicate project", "作品を複製")}
              </Button>
              {backup && <Button tone="quiet" disabled={busy} onClick={() => void run(backup)}>{t('备份作品', 'Back up project', '作品をバックアップ')}</Button>}
            </div>
          </div>
        </section>
      ) : (
        <section className="project-start">
          <BookOpen size={32} />
          <h2>
            {t(
              "还没有打开作品",
              "Your workspace is ready",
              "ワークスペースの準備ができました",
            )}
          </h2>
          <p>
            {t(
              "打开本地作品目录，或选择一个模板开始创作。",
              "Open a local project folder, or start with a template.",
              "ローカルの作品を開くか、テンプレートで始めましょう。",
            )}
          </p>
          <Button disabled={busy} onClick={openCreate}>
            {t("选择模板", "Choose a template", "テンプレートを選ぶ")}
            <ArrowRight size={16} />
          </Button>
        </section>
      )}
      <div className="project-section-heading">
        <h2>{t("创作空间", "Your workspace", "制作スペース")}</h2>
        <span>
          {t(
            "从故事到玩家界面",
            "From story to player experience",
            "物語からプレイヤー画面へ",
          )}
        </span>
      </div>
      <div className="project-entry-grid">
        {[
          {
            icon: BookOpen,
            page: "editor",
            title: t("编写故事", "Write your story", "物語を書く"),
            detail: t(
              "组织场景、对白与分支，让故事逐步成形。",
              "Shape scenes, dialogue and choices.",
              "シーン・会話・分岐で物語を形に。",
            ),
          },
          {
            icon: Layers3,
            page: "pages",
            title: t(
              "设计玩家界面",
              "Design the player",
              "プレイヤー画面を設計",
            ),
            detail: t(
              "调整标题、阅读与菜单，预览完整体验。",
              "Style titles, reading and menus in context.",
              "タイトル・読書・メニューをプレビュー。",
            ),
          },
          {
            icon: SlidersHorizontal,
            page: "production",
            title: t("管理制作", "Manage production", "制作を管理"),
            detail: t(
              "整理创作方案，比较候选并采用合适的结果。",
              "Plan requests, compare candidates and adopt results.",
              "計画を立て、候補を比較して採用する。",
            ),
          },
        ].map((item) => (
          <button
            className="project-entry"
            key={item.page}
            disabled={!source}
            onClick={() =>
              navigate(item.page as "editor" | "pages" | "production")
            }
          >
            <item.icon size={21} />
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
            <ArrowRight className="project-entry-arrow" size={18} />
          </button>
        ))}
      </div>
      </div>
      {creating && (
        <section hidden={!creatingActive} className="project-create-document" aria-label={t('新建作品','New project','新規作品')}>
          <header>
            <div>
              <h1>{t('新建作品','New project','新規作品')}</h1>
              {createDirty && <p>{t('草稿已修改','Draft modified','下書きを変更済み')}</p>}
            </div>
            <Button disabled={creatingProject} onClick={closeCreate}>{t('关闭文档','Close document','文書を閉じる')}</Button>
          </header>
          <form
            className="project-create"
            aria-busy={creatingProject}
            onSubmit={(event) => {
              event.preventDefault();
              if (creatingRequest.current || busy) return;
              creatingRequest.current = true; setCreatingProject(true);
              void run(async () => {
                try { if (await create(form)) { setCreating(false);setCreatingActive(false); } }
                finally { creatingRequest.current = false; setCreatingProject(false); }
              });
            }}
          >
            <Field name="project-name" label={t("作品名称", "Project name", "作品名")} required>
              <Input
                autoFocus
                required
                disabled={creatingProject}
                value={form.name}
                onChange={(e) => change({ name: e.target.value })}
                placeholder={t(
                  "给故事起个名字",
                  "Give your story a name",
                  "物語に名前をつける",
                )}
              />
            </Field>
            <fieldset>
              <legend>
                {t("选择起点", "Choose a starting point", "出発点を選ぶ")}
              </legend>
              <div className="project-template-grid">
                {templates.map((item) => (
                  <label
                    className={`project-template ${form.template === item.id ? "selected" : ""}`}
                    key={item.id}
                  >
                    <input
                      type="radio"
                      disabled={creatingProject}
                      name="template"
                      value={item.id}
                      checked={form.template === item.id}
                      onChange={() => change({ template: item.id })}
                    />
                    <strong>{item.title}</strong>
                    <small>{item.note}</small>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="project-create-settings">
              <Field label={t("画布宽度（px）", "Canvas width (px)", "キャンバス幅（px）")}>
                <Input
                  type="number"
                  disabled={creatingProject}
                  min="1"
                  required
                  value={form.width}
                  onChange={(e) => change({ width: Number(e.target.value) })}
                />
              </Field>
              <Field label={t("画布高度（px）", "Canvas height (px)", "キャンバス高さ（px）")}>
                <Input
                  type="number"
                  disabled={creatingProject}
                  min="1"
                  required
                  value={form.height}
                  onChange={(e) => change({ height: Number(e.target.value) })}
                />
              </Field>
              <Field
                label={t("引擎版本", "Engine version", "エンジンバージョン")}
              >
                <Choice
                  label={t("引擎版本", "Engine version", "エンジンバージョン")}
                  value={form.engineVersion}
                  options={engineVersions.map(version => ({ value: version, label: version }))}
                  onChange={engineVersion => change({ engineVersion })}
                  disabled={creatingProject || !engineVersions.length}
                />
              </Field>
            </div>
            {!engineVersions.length && <div className="project-create-engine-status">
              <p role={preparingCreate ? 'status' : 'alert'}>{preparingCreate ? t('正在读取本机引擎…', 'Reading local engines…', 'ローカルエンジンを読み込み中…') : engineError || t(
              '没有可用的本机引擎，请完成引擎安装后重新读取。',
              'No local engine is available. Install an engine, then reload.',
              '使用できるエンジンがありません。インストール後に再読み込みしてください。')}</p>
              <Button type="button" disabled={busy || preparingCreate} onClick={() => void run(loadVersions)}>{t('重新读取引擎','Reload engines','エンジンを再読み込み')}</Button>
            </div>}
            <footer>
              <p role={creatingProject ? 'status' : actionError ? 'alert' : undefined} data-error={!!actionError}>
                {creatingProject ? t('正在创建作品，请稍候…','Creating your project…','作品を作成しています…') : actionError || t(
                  "下一步选择作品存放目录。",
                  "Choose the project folder in the next step.",
                  "次に作品の保存先を選択します。",
                )}
              </p>
              <Button type="submit" tone="primary" disabled={busy || !engineVersions.includes(form.engineVersion)}>
                {creatingProject && <LoaderCircle size={16} className="gc-wb-spin" aria-hidden="true"/>}
                {creatingProject ? t('正在创建…','Creating…','作成中…') : t(
                  "选择目录并创建",
                  "Choose folder & create",
                  "保存先を選んで作成",
                )}
                {!creatingProject && <ArrowRight size={16} />}
              </Button>
            </footer>
          </form>
        </section>
      )}
      {discardCreate && <MessageBox title={t('放弃新建作品输入？','Discard new project input?','新規作品の入力を破棄しますか？')} description={form.name || t('尚未创建作品目录。','No project folder has been created.','作品フォルダーは未作成です。')} onClose={()=>setDiscardCreate(false)} actions={[{label:t('放弃输入并关闭','Discard and close','破棄して閉じる'),tone:'danger',run:()=>{const initial=createBaseline ? JSON.parse(createBaseline) as ProjectDraft : {...form,name:''};setForm(initial);updateDraft(initial);setCreating(false);setCreatingActive(false);}}]}/>}
    </main>
  );
}
