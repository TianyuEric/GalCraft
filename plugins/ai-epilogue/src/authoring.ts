import { createId, reserveIds } from '@galcraft/contracts';
import type { DocumentView } from '@galcraft/contracts';
import type { StudioPlugin, StudioPluginContext } from '@galcraft/plugins/contracts';
import { catalog, ConfigError, configEdit, configIssues, configPath, contextPreview, parseConfig, pluginId, translate,
  type AiEpilogueConfig, type AiEpilogueEntry, type ConfigIssue, type EntryField } from './model.js';

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
  const value = document.createElement(tag); value.textContent = text; value.className = className; return value;
};
const styleText = `
.ai-epilogue-editor{box-sizing:border-box;width:min(1240px,100%);margin:auto;padding:20px 24px;color:var(--foreground);font-size:14px;line-height:1.5}
.ai-epilogue-editor *{box-sizing:border-box}.ai-epilogue-editor [hidden]{display:none!important}.ai-epilogue-editor h1,.ai-epilogue-editor h2,.ai-epilogue-editor h3,.ai-epilogue-editor p{margin:0}
.ai-epilogue-editor h1{font-size:24px;font-weight:600}.ai-epilogue-editor h2{font-size:18px;font-weight:600}.ai-epilogue-editor h3{font-size:16px;font-weight:600}
.epilogue-header{display:grid;gap:6px;margin-bottom:20px}.epilogue-muted{color:var(--muted-foreground);font-size:13px}.epilogue-layout{display:grid;grid-template-columns:224px minmax(0,1fr);gap:24px}
.epilogue-entries{display:flex;flex-direction:column;gap:14px;min-width:0}.epilogue-entry-list{display:grid;gap:4px;max-height:calc(100vh - 420px);min-height:80px;overflow:auto}
.epilogue-entry{display:grid;text-align:left;width:100%;gap:4px;padding:12px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;cursor:pointer;overflow-wrap:anywhere}
.epilogue-entry[aria-current=true]{background:var(--secondary);border-color:var(--border)}.epilogue-entry strong{font-size:14px;font-weight:600}.epilogue-entry span{font-size:12px;color:var(--muted-foreground)}
.epilogue-new{display:grid;gap:8px;border-top:1px solid var(--border);padding-top:16px}.epilogue-main{min-width:0;container-type:inline-size;display:flex;flex-direction:column}
.epilogue-form{display:grid;gap:24px;max-height:calc(100vh - 280px);min-height:220px;overflow:auto;padding:0 8px 16px 0;scrollbar-gutter:stable}
.epilogue-section{display:grid;gap:14px;padding-top:20px;border-top:1px solid var(--border)}.epilogue-section:first-child{padding-top:0;border-top:0}.epilogue-section-header{display:grid;gap:4px}.epilogue-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.epilogue-field{display:grid;gap:6px;min-width:0;align-content:start}.epilogue-field label{font-weight:500}.epilogue-field input:not([type=checkbox]),.epilogue-field textarea,.epilogue-field select,.epilogue-new select,.epilogue-reference select{width:100%;border:1px solid var(--border);border-radius:6px;background:var(--background);color:var(--foreground);font:inherit;padding:7px 10px;min-height:34px}
.epilogue-field textarea{min-height:90px;resize:vertical}.epilogue-field [aria-invalid=true]{border-color:var(--destructive)}.epilogue-error{color:var(--destructive);font-size:13px;overflow-wrap:anywhere}.epilogue-feedback{display:grid;gap:6px;padding:12px;background:var(--secondary);border-radius:6px}
.epilogue-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.epilogue-button{font:inherit;min-height:34px;border:1px solid var(--border);border-radius:6px;padding:6px 12px;color:var(--foreground);background:var(--card);cursor:pointer}
.epilogue-button:hover{background:var(--secondary)}.epilogue-button:disabled{opacity:.55;cursor:default}.epilogue-button-primary{background:var(--primary);border-color:var(--primary);color:var(--primary-foreground)}.epilogue-button-primary:hover{background:var(--primary);filter:brightness(.95)}.epilogue-button-danger{color:var(--destructive)}
.ai-epilogue-editor :focus-visible{outline:2px solid var(--ring,var(--primary));outline-offset:2px}.epilogue-footer{position:sticky;bottom:0;z-index:1;display:grid;gap:10px;background:var(--background);border-top:1px solid var(--border);padding:14px 0 0}.epilogue-footer-main{display:flex;justify-content:space-between;align-items:center;gap:16px}.epilogue-footer-state{display:grid;gap:2px;min-width:0}
.epilogue-reference{display:flex;align-items:start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);min-width:0}.epilogue-reference-content{flex:1;min-width:0;display:grid;gap:4px;overflow-wrap:anywhere}.epilogue-reference-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:55%}.epilogue-reference-actions select{max-width:180px}
.epilogue-options{display:grid;gap:4px;max-height:190px;overflow:auto;border:1px solid var(--border);border-radius:6px;padding:8px}.epilogue-option{display:flex;align-items:start;gap:8px;padding:6px;overflow-wrap:anywhere}.epilogue-option input{margin-top:4px;accent-color:var(--primary);width:18px;height:18px;min-width:18px;min-height:18px;flex:0 0 18px;padding:0}.epilogue-option span{min-width:0}.epilogue-selected{display:grid;gap:4px}.epilogue-details{font-size:13px}.epilogue-details summary{cursor:pointer;color:var(--muted-foreground);padding:6px 0}.epilogue-details code,.epilogue-details pre{overflow-wrap:anywhere;white-space:pre-wrap}.epilogue-details pre{padding:12px;background:var(--secondary);max-height:280px;overflow:auto}
.epilogue-preview{display:grid;gap:20px;font-size:14px}.epilogue-preview section{display:grid;gap:6px}.epilogue-preview h3{margin:0;font-size:15px}.epilogue-preview p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.epilogue-preview ul{padding-left:20px;margin:0}.epilogue-preview .epilogue-details{border-top:1px solid var(--border);padding-top:12px}.epilogue-empty{padding:24px 0;display:grid;gap:8px}
@container (max-width:520px){.epilogue-fields{grid-template-columns:1fr}.epilogue-reference{flex-direction:column;gap:8px}.epilogue-reference-actions{max-width:100%}.epilogue-footer-main{align-items:start}}
@media(max-width:720px){.ai-epilogue-editor{padding:16px}.epilogue-layout{grid-template-columns:180px minmax(0,1fr);gap:16px}.epilogue-footer-main{flex-direction:column;align-items:stretch}.epilogue-form{max-height:calc(100vh - 310px)}}
@media(prefers-reduced-motion:reduce){.ai-epilogue-editor *{scroll-behavior:auto}}
`;
function hostError(error: unknown, locale: string) {
  if (error instanceof ConfigError) return error.message;
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (/CONFLICT|REVISION|STALE/i.test(code)) return translate(locale, '作品内容已变化。草稿已保留，请重新读取作品引用后重试；配置冲突时可放弃草稿并重新读取。', 'Project content changed. Your draft is retained. Refresh references and retry, or discard the draft to reload a conflicting configuration.', '作品内容が変更されました。下書きは保持しています。参照を更新して再試行するか、設定の競合時は下書きを破棄して再読込してください。');
  return translate(locale, '操作未完成，草稿已保留。请重试，或重新读取作品后继续。', 'The operation could not finish. Your draft is retained. Retry or reload the project to continue.', '操作を完了できませんでした。下書きは保持しています。再試行するか、作品を再読込してください。');
}
const assetKind = (kind: string, locale: string) => ({ image: ['图像', 'Image', '画像'], audio: ['音频', 'Audio', '音声'], video: ['视频', 'Video', '動画'], live2d: ['Live2D', 'Live2D', 'Live2D'], font: ['字体', 'Font', 'フォント'], other: ['其他', 'Other', 'その他'] }[kind]?.[locale === 'en' ? 1 : locale === 'ja' ? 2 : 0] ?? kind);

export function createStudioPlugin(): StudioPlugin {
  let draft: AiEpilogueConfig | null = null, applied: AiEpilogueConfig | null = null, documents: DocumentView[] = [], baseDocument: DocumentView | null = null;
  let selected = '', alive = true, saving = false, issues: ConfigIssue[] = [], feedback = '', feedbackError = false, currentLocale = '';
  const searches = new Map<string, string>(), positions = new Map<string, number>();
  const load = async (context: StudioPluginContext, accepted = false) => {
    const listed = await context.documents.list(); if (!listed.ok) throw listed.error;
    if (!alive) return;
    documents = listed.value; reserveIds(documents);
    const latest = documents.find(item => configPath in item.files) ?? null;
    if (!draft || accepted || latest?.revision === baseDocument?.revision) baseDocument = structuredClone(latest);
    if (!draft) {
      const locale = 'locale' in context && typeof context.locale === 'string' ? context.locale : 'zh-CN';
      const raw = baseDocument?.files[configPath]; draft = raw ? parseConfig(JSON.parse(raw).data, locale) : { entries: [] };
      applied = structuredClone(draft);
    } else if (accepted) applied = structuredClone(draft);
  };
  const editDocuments = () => [...documents.filter(item => !(configPath in item.files)), ...(baseDocument ? [baseDocument] : [])];
  const dirty = () => JSON.stringify(draft) !== JSON.stringify(applied);
  return { async activateStudio() {
    const title = (zh: string, en: string, ja: string) => ({ 'zh-CN': zh, en, ja });
    return [{ key: `${pluginId}/settings`, title: title('AI 后日谈配置', 'AI afterstory setup', 'AI アフターストーリー設定'),
      mount(root, context) {
        const t = (zh: string, en: string, ja: string) => translate(context.locale, zh, en, ja);
        const heading = node('h2', t('AI 后日谈 · 作者配置', 'AI afterstory · Author setup', 'AI アフターストーリー · 作者設定'));
        const detail = node('p', t('配置许可内容并预览发送上下文。Player 互动尚未交付。', 'Configure permitted content and preview outgoing context. Player interaction is not yet available.', '許可する内容と送信コンテキストを確認します。Player のやり取りは未実装です。'));
        const button = node('button', t('打开后日谈工作台', 'Open afterstory workbench', 'アフターストーリーを開く'), 'studio-button'); button.type = 'button';
        button.onclick = () => { void context.open(`${pluginId}/authoring`); }; root.append(heading, detail, button);
        return () => { button.onclick = null; root.replaceChildren(); };
      } },
      { key: `${pluginId}/context-preview`, title: title('发送上下文预览', 'Outgoing context preview', '送信コンテキスト確認'),
        mount(root, context) {
          let mounted = true; const t = (zh: string, en: string, ja: string) => translate(context.locale, zh, en, ja);
          const style = node('style', styleText); root.append(style); root.classList.add('epilogue-preview');
          void load(context).then(() => {
            if (!mounted || !alive || !draft) return;
            const preview = contextPreview(documents, draft, typeof context.input === 'string' ? context.input : selected, context.locale), source = catalog(documents);
            root.append(node('p', t('以下是作者许可的发送范围。本预览不会发起生成请求。', 'This is the author-approved outgoing context. This preview sends no request.', '作者が許可した送信範囲です。この確認画面は送信しません。')));
            const part = (label: string, text: string | string[]) => {
              const section = node('section'); section.append(node('h3', label));
              if (Array.isArray(text)) { const list = node('ul'); for (const value of text) list.append(node('li', value)); section.append(text.length ? list : node('p', t('未配置', 'None configured', '設定なし'))); }
              else section.append(node('p', text)); root.append(section);
            };
            part(t('角色', 'Character', 'キャラ'), preview.character.name || t('关联角色已移除', 'Linked character was removed', '関連キャラが削除されました'));
            part(t('许可角色设定', 'Permitted character setting', '許可するキャラ設定'), preview.character.setting);
            part(t('后日谈起点', 'Starting point', '開始状況'), preview.startingPoint);
            part(t('可披露事实', 'Permitted facts', '公開可能な事実'), preview.allowedFacts);
            part(t('允许互动范围', 'Allowed interaction', '許可するやり取り'), preview.interactionRules);
            part(t('结束条件', 'Ending condition', '終了条件'), preview.endingCondition);
            part(t('许可素材', 'Allowed assets', '許可素材'), preview.allowedAssetIds.map(id => { const asset = source.assets.find(asset => asset.id === id); return asset ? `${asset.name} · ${assetKind(asset.kind, context.locale)}` : t('已移除素材', 'Removed asset', '削除済みの素材'); }));
            const details = node('details', '', 'epilogue-details'); details.append(node('summary', t('身份与 JSON 详情', 'Identity and JSON details', '識別情報と JSON の詳細')), node('pre', JSON.stringify(preview, null, 2))); root.append(details);
          }).catch(error => { if (mounted && alive) { const alert = node('p', hostError(error, context.locale), 'epilogue-error'); alert.setAttribute('role', 'alert'); root.append(alert); } });
          return () => { mounted = false; root.replaceChildren(); root.classList.remove('epilogue-preview'); };
        } },
      { key: `${pluginId}/authoring`, title: title('AI 后日谈', 'AI afterstory', 'AI アフターストーリー'),
        mount(root, context) {
          let mounted = true, form: HTMLElement | null = null;
          const t = (zh: string, en: string, ja: string) => translate(context.locale, zh, en, ja);
          if (currentLocale && currentLocale !== context.locale) {
            if (issues.length) issues = configIssues(draft, context.locale, documents);
            if (feedback) feedback = feedbackError ? t('操作未完成。请检查字段与引用后重试，草稿已保留。', 'The operation did not finish. Check fields and references, then retry. Your draft is retained.', '操作は未完了です。項目と参照を確認して再試行してください。下書きは保持しています。') : t('草稿与作品配置已保留。', 'Your draft and project configuration are retained.', '下書きと作品の設定を保持しています。');
          }
          currentLocale = context.locale;
          root.classList.add('ai-epilogue-editor'); const style = node('style', styleText), ui = node('div'); root.append(style, ui);
          const fields = new Map<EntryField, { input: HTMLElement; error: HTMLElement }>();
          let stateText: HTMLElement, stateHint: HTMLElement, message: HTMLElement, apply: HTMLButtonElement;
          const button = (label: string, action: () => void, variant = '') => { const value = node('button', label, `epilogue-button ${variant ? `epilogue-button-${variant}` : ''}`); value.type = 'button'; value.onclick = action; return value; };
          const state = () => {
            if (!mounted || !stateText) return;
            const hasDraft = dirty(); stateText.textContent = hasDraft ? t('草稿 · 尚未应用', 'Draft · Not applied', '下書き · 未適用') : baseDocument?.dirty ? t('已应用 · 作品未保存', 'Applied · Project not saved', '適用済み · 作品は未保存') : baseDocument ? t('已保存的配置', 'Saved configuration', '保存済みの設定') : t('尚未配置', 'Not configured', '未設定');
            stateHint.textContent = hasDraft ? t('应用后使用 Studio“保存全部”写入磁盘。', 'After applying, use Studio Save all to write to disk.', '適用後、Studio の「すべて保存」でディスクに保存します。') : baseDocument?.dirty ? t('使用 Studio“保存全部”完成保存。', 'Use Studio Save all to persist this configuration.', 'Studio の「すべて保存」で設定を保存してください。') : t('修改字段后应用到作品。', 'Edit fields, then apply to the project.', '項目を編集し、作品に適用してください。');
            apply.disabled = saving; apply.textContent = saving ? t('正在应用…', 'Applying…', '適用中…') : t('应用到作品', 'Apply to project', '作品に適用');
            if (form) form.inert = saving;
            for (const container of ui.querySelectorAll<HTMLElement>('.epilogue-entries,.epilogue-footer>details')) container.inert = saving;
          };
          const refreshErrors = () => {
            for (const [field, controls] of fields) {
              const error = issues.find(issue => issue.entryId === selected && issue.field === field);
              controls.error.textContent = error?.message ?? ''; controls.error.hidden = !error;
              controls.input.setAttribute('aria-invalid', String(!!error));
            }
            if (message) { message.textContent = feedback; message.hidden = !feedback; message.setAttribute('role', feedbackError ? 'alert' : 'status'); }
          };
          const changed = (field?: EntryField) => {
            if (field && issues.length && draft) {
              issues = [...issues.filter(issue => issue.entryId !== selected || issue.field !== field), ...configIssues(draft, context.locale, documents).filter(issue => issue.entryId === selected && issue.field === field)];
              refreshErrors();
            }
            state();
          };
          const savePosition = () => { if (form && selected) positions.set(selected, form.scrollTop); };
          const show = () => {
            if (!mounted || !alive || !draft) return; savePosition(); ui.replaceChildren(); fields.clear();
            const source = catalog(documents), mains = source.characters.filter(item => item.narrativeRole === 'main');
            const header = node('header', '', 'epilogue-header'); header.append(node('h1', t('AI 后日谈', 'AI afterstory', 'AI アフターストーリー')),
              node('p', t('为每位个人路线主角色配置作者许可的互动内容。Player 互动尚未交付。', 'Configure author-approved content for each route protagonist. Player interaction is not yet available.', '個人ルートの主要キャラごとに許可する内容を設定します。Player のやり取りは未実装です。'), 'epilogue-muted')); ui.append(header);
            const layout = node('div', '', 'epilogue-layout'), aside = node('aside', '', 'epilogue-entries'), main = node('div', '', 'epilogue-main'); layout.append(aside, main); ui.append(layout);
            aside.append(node('h2', t('角色入口', 'Character entries', 'キャラの入口')));
            const list = node('nav', '', 'epilogue-entry-list'); list.ariaLabel = t('后日谈入口', 'Afterstory entries', 'アフターストーリーの入口'); aside.append(list);
            const entry = draft.entries.find(item => item.id === selected) ?? draft.entries[0]; if (entry) selected = entry.id;
            for (const item of draft.entries) {
              const tab = button('', () => { savePosition(); selected = item.id; form = null; show(); ui.querySelector<HTMLButtonElement>(`[data-entry-id="${item.id}"]`)?.focus(); });
              tab.className = 'epilogue-entry'; tab.dataset.entryId = item.id; tab.setAttribute('aria-current', String(item.id === selected));
              tab.append(node('strong', source.characters.find(character => character.id === item.characterId)?.name ?? t('关联角色已移除', 'Linked character was removed', '関連キャラが削除されました')), node('span', item.title || t('未命名入口', 'Untitled entry', '名称未設定の入口'))); list.append(tab);
            }
            if (!draft.entries.length) list.append(node('p', t('还没有后日谈入口。', 'No afterstory entries yet.', '入口はまだありません。'), 'epilogue-muted'));
            const addArea = node('div', '', 'epilogue-new'), picker = node('select'); picker.ariaLabel = t('个人路线主角色', 'Route protagonist', '個人ルートの主要キャラ');
            for (const character of mains.filter(item => !draft!.entries.some(entry => entry.characterId === item.id))) { const option = node('option', character.name); option.value = character.id; picker.append(option); }
            if (picker.options.length) addArea.append(picker);
            const add = button(t('新增入口', 'Add entry', '入口を追加'), () => {
              const character = mains.find(item => item.id === picker.value); if (!character) return; savePosition();
              const created: AiEpilogueEntry = { id: createId([documents, draft]), characterId: character.id, title: `${character.name} · AI`, characterSetting: '', startingPoint: '', publicFacts: [], interactionRules: '', endingCondition: '', unlockEndingIds: [], assetIds: [] };
              draft!.entries.push(created); selected = created.id; form = null; feedback = ''; show(); fields.get('title')?.input.focus();
            }); add.disabled = !picker.options.length || saving; addArea.append(add); aside.append(addArea);
            if (!mains.length) aside.append(node('p', t('请先在创作页的角色资料中设置个人路线主角色和个人结局。', 'Set a route protagonist and personal endings in Creation first.', '創作画面で個人ルートの主要キャラと結末を設定してください。'), 'epilogue-muted'));
            else if (!picker.options.length) addArea.append(node('p', t('所有主角色均已有入口。', 'Every route protagonist already has an entry.', 'すべての主要キャラに入口があります。'), 'epilogue-muted'));
            form = node('div', '', 'epilogue-form'); main.append(form);
            const section = (label: string, hint = '') => { const block = node('section', '', 'epilogue-section'), heading = node('div', '', 'epilogue-section-header'); heading.append(node('h3', label)); if (hint) heading.append(node('p', hint, 'epilogue-muted')); block.append(heading); form!.append(block); return block; };
            const field = (container: HTMLElement, key: 'title' | 'characterSetting' | 'startingPoint' | 'publicFacts' | 'interactionRules' | 'endingCondition', label: string, help = '') => {
              if (!entry) return;
              const wrap = node('div', '', 'epilogue-field'), id = `epilogue-${entry.id}-${key}`, labelNode = node('label', label), input = key === 'title' ? node('input') : node('textarea');
              labelNode.htmlFor = id; input.id = id; input.value = key === 'publicFacts' ? entry.publicFacts.join('\n') : entry[key];
              const error = node('p', '', 'epilogue-error'); error.id = `${id}-error`; error.hidden = true; input.setAttribute('aria-describedby', `${id}-help ${error.id}`);
              const hint = node('p', help, 'epilogue-muted'); hint.id = `${id}-help`; hint.hidden = !help;
              input.oninput = () => { if (key === 'publicFacts') entry.publicFacts = input.value.split('\n').map(value => value.trim()).filter(Boolean); else entry[key] = input.value;
                if (key === 'title') { const text = ui.querySelector(`[data-entry-id="${entry.id}"] span`); if (text) text.textContent = input.value || t('未命名入口', 'Untitled entry', '名称未設定の入口'); } changed(key); };
              if (key !== 'publicFacts') input.setAttribute('aria-required', 'true'); wrap.append(labelNode, input, hint, error); container.append(wrap); fields.set(key, { input, error });
            };
            const details = (container: HTMLElement, label: string, text: string) => { const fold = node('details', '', 'epilogue-details'); fold.append(node('summary', label), node('code', text)); container.append(fold); };
            if (entry) {
              const setup = section(t('作者设定与起点', 'Author setting and starting point', '作者設定と開始状況'));
              const linked = node('p', source.characters.find(character => character.id === entry.characterId)?.name ?? t('关联角色已移除，请在管理中移除此入口。', 'Linked character was removed. Remove this entry in Management.', '関連キャラが削除されました。管理からこの入口を削除してください。'), 'epilogue-muted');
              const linkedError = node('p', '', 'epilogue-error'); fields.set('characterId', { input: linked, error: linkedError }); setup.append(linked, linkedError);
              field(setup, 'title', t('入口标题', 'Entry title', '入口タイトル')); const setupFields = node('div', '', 'epilogue-fields'); setup.append(setupFields);
              field(setupFields, 'characterSetting', t('许可角色设定', 'Permitted character setting', '許可するキャラ設定'), t('只使用这里明确许可的设定，不自动包含全局角色描述。', 'Only this approved setting is included; the global character description is not included automatically.', 'ここで許可した設定のみを使用し、全体のキャラ説明は自動で含めません。'));
              field(setupFields, 'startingPoint', t('后日谈起点', 'Starting point', '開始状況'));
              const facts = section(t('许可上下文', 'Permitted context', '許可するコンテキスト')); field(facts, 'publicFacts', t('可披露事实（每行一条）', 'Permitted facts (one per line)', '公開可能な事実（1行ずつ）'));
              const rules = section(t('互动与结束规则', 'Interaction and ending rules', 'やり取りと終了のルール')), ruleFields = node('div', '', 'epilogue-fields'); rules.append(ruleFields);
              field(ruleFields, 'interactionRules', t('允许互动范围', 'Allowed interaction', '許可するやり取り')); field(ruleFields, 'endingCondition', t('结束条件', 'Ending condition', '終了条件'));
              const references = section(t('解锁与许可素材', 'Unlocks and allowed assets', '解放条件と許可素材'));
              const referenceGroup = (key: 'unlockEndingIds' | 'assetIds', label: string, options: { id: string; name: string }[], search = false) => {
                const group = node('div', '', 'epilogue-field'), groupId = `epilogue-${entry.id}-${key}`; group.id = groupId;
                const error = node('p', '', 'epilogue-error'); error.id = `${groupId}-error`; fields.set(key, { input: group, error }); group.append(node('h3', label), error);
                const selectedList = node('div', '', 'epilogue-selected'); group.append(selectedList);
                const renderSelected = () => {
                  selectedList.replaceChildren(); selectedList.append(node('p', `${t('已选', 'Selected', '選択済み')} · ${entry[key].length}`, 'epilogue-muted'));
                  for (const id of entry[key]) {
                    const option = options.find(option => option.id === id), row = node('div', '', 'epilogue-reference'); row.dataset.referenceId = id;
                    const content = node('div', '', 'epilogue-reference-content'); content.append(node('span', option?.name ?? t(key === 'assetIds' ? '已移除素材' : '已移除结局', key === 'assetIds' ? 'Removed asset' : 'Removed ending', key === 'assetIds' ? '削除済みの素材' : '削除済みの結末'), option ? '' : 'epilogue-error'));
                    details(content, t('身份详情', 'Identity details', '識別情報の詳細'), id); row.append(content);
                    const actions = node('div', '', 'epilogue-reference-actions');
                    if (!option) {
                      const replacement = node('select'); replacement.ariaLabel = t('替换已移除引用', 'Replace removed reference', '削除済みの参照を置換');
                      for (const candidate of options.filter(option => !entry[key].includes(option.id))) { const choice = node('option', candidate.name); choice.value = candidate.id; replacement.append(choice); }
                      if (replacement.options.length) { const replace = button(t('替换', 'Replace', '置換'), () => { const nextId = replacement.value; entry[key].splice(entry[key].indexOf(id), 1, nextId); changed(key); renderSelected(); renderOptions(); selectedList.querySelector<HTMLButtonElement>(`[data-reference-id="${nextId}"] button`)?.focus(); }); actions.append(replacement, replace); }
                    }
                    actions.append(button(t('删除引用', 'Remove reference', '参照を削除'), () => { const index = entry[key].indexOf(id); entry[key].splice(index, 1); changed(key); renderSelected(); renderOptions();
                      const remaining = selectedList.querySelectorAll<HTMLButtonElement>('.epilogue-reference button'); (remaining[Math.min(index, remaining.length - 1)] ?? available.querySelector<HTMLInputElement>('input'))?.focus(); })); row.append(actions); selectedList.append(row);
                  }
                };
                const available = node('div', '', 'epilogue-options'); available.setAttribute('role', 'group'); available.ariaLabel = label; available.setAttribute('aria-describedby', error.id);
                let query = search ? searches.get(entry.id) ?? '' : '';
                if (search) {
                  const searchId = `${groupId}-search`, searchLabel = node('label', t('搜索素材', 'Search assets', '素材を検索')), input = node('input'); input.type = 'search'; input.id = searchId; input.value = query; searchLabel.htmlFor = searchId;
                  input.oninput = () => { query = input.value; searches.set(entry.id, query); renderOptions(); }; group.append(searchLabel, input);
                }
                group.append(available); references.append(group);
                const renderOptions = () => {
                  available.replaceChildren(); const matching = options.filter(option => !query || option.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
                  for (const option of matching) {
                    const row = node('label', '', 'epilogue-option'), check = node('input'); check.type = 'checkbox'; check.checked = entry[key].includes(option.id);
                    check.onchange = () => { if (check.checked && !entry[key].includes(option.id)) entry[key].push(option.id); else if (!check.checked) entry[key].splice(entry[key].indexOf(option.id), 1); changed(key); renderSelected(); };
                    row.append(check, node('span', option.name)); available.append(row);
                  }
                  if (!matching.length) available.append(node('p', options.length ? t('没有匹配的素材。', 'No matching assets.', '一致する素材がありません。') : t('暂无可选项，请先配置角色结局或导入素材。', 'No options. Configure endings or import assets first.', '選択肢がありません。結末または素材を設定してください。'), 'epilogue-muted'));
                };
                renderSelected(); renderOptions();
              };
              referenceGroup('unlockEndingIds', t('解锁结局', 'Unlock endings', '解放する結末'), (source.characters.find(character => character.id === entry.characterId)?.personalRoute?.endingIds ?? []).map((id, index) => ({ id, name: source.endingScenes.get(id)?.join(' / ') || (isReadableEnding(id) ? id : `${t('个人结局', 'Personal ending', '個人ルートの結末')} ${index + 1}`) })));
              referenceGroup('assetIds', t('许可素材', 'Allowed assets', '許可素材'), source.assets.map(asset => ({ id: asset.id, name: `${asset.name} · ${assetKind(asset.kind, context.locale)}` })), true);
              const validation = section(t('校验与预览', 'Validation and preview', '検証とプレビュー'), t('预览只展示作者许可内容，不会发起生成请求。', 'Preview shows approved content and sends no generation request.', 'プレビューには許可内容のみを表示し、生成リクエストは送信しません。'));
              validation.append(button(t('预览发送上下文', 'Preview outgoing context', '送信内容を確認'), () => {
                issues = configIssues(draft, context.locale, documents);
                if (issues.length) { feedbackError = true; feedback = t('请先修正标出的字段或已移除引用。草稿已保留。', 'Correct the marked fields or removed references first. Your draft is retained.', 'マークされた項目または削除済みの参照を修正してください。下書きは保持しています。'); showIssues(); return; }
                void context.open(`${pluginId}/context-preview`, entry.id).then(result => { if (!result.ok && mounted) { feedbackError = true; feedback = hostError(result.error, context.locale); refreshErrors(); } });
              })); details(validation, t('入口与配置详情', 'Entry and configuration details', '入口と設定の詳細'), JSON.stringify({ entryId: entry.id, characterId: entry.characterId }, null, 2));
            } else { const empty = node('div', '', 'epilogue-empty'); empty.append(node('h2', t('从角色入口开始', 'Start with a character entry', 'キャラの入口から始める')), node('p', t('选择已有个人路线主角色，新增后配置许可内容。', 'Choose a route protagonist and add an entry to configure permitted content.', '個人ルートの主要キャラを選択し、入口を追加して許可内容を設定してください。'), 'epilogue-muted')); form.append(empty); }
            const footer = node('footer', '', 'epilogue-footer'), footerMain = node('div', '', 'epilogue-footer-main'), status = node('div', '', 'epilogue-footer-state');
            stateText = node('strong'); stateText.setAttribute('role', 'status'); stateHint = node('p', '', 'epilogue-muted'); status.append(stateText, stateHint);
            apply = button(t('应用到作品', 'Apply to project', '作品に適用'), () => {
              if (saving) return; saving = true; state();
              void load(context).then(async () => {
                if (!mounted || !alive) return;
                issues = configIssues(draft, context.locale, documents); if (issues.length) throw new ConfigError(issues);
                const result = await context.documents.apply(configEdit(editDocuments(), draft!, context.locale)); if (!result.ok) throw result.error;
                await load(context, true); if (!mounted || !alive) return;
                saving = false; issues = []; feedbackError = false; feedback = t('已应用到作品工作内容。请使用 Studio“保存全部”。', 'Applied to project working content. Use Studio Save all.', '作品の作業内容に適用しました。Studio の「すべて保存」を実行してください。'); show(); apply.focus();
              }).catch(error => {
                if (!mounted || !alive) return;
                saving = false;
                if (error instanceof ConfigError) issues = error.issues;
                feedbackError = true; feedback = error instanceof ConfigError ? t('请修正标出的字段或已移除引用，再应用到作品。草稿已保留。', 'Correct the marked fields or removed references, then apply again. Your draft is retained.', 'マークされた項目または削除済みの参照を修正し、再度適用してください。下書きは保持しています。') : hostError(error, context.locale);
                showIssues();
              }).finally(() => { saving = false; state(); });
            }, 'primary'); footerMain.append(status, apply); footer.append(footerMain);
            message = node('p', feedback, 'epilogue-feedback'); footer.append(message);
            const management = node('details', '', 'epilogue-details'); management.append(node('summary', t('管理草稿与入口', 'Manage draft and entries', '下書きと入口を管理'))); const managementActions = node('div', '', 'epilogue-actions'); management.append(managementActions);
            managementActions.append(button(t('重新读取作品引用', 'Refresh project references', '作品の参照を更新'), () => {
              if (saving) return; void load(context).then(() => { if (!mounted) return; issues = configIssues(draft, context.locale, documents); feedback = t('已刷新结局与素材引用，草稿已保留。', 'Ending and asset references refreshed. Your draft is retained.', '結末と素材の参照を更新しました。下書きは保持しています。'); feedbackError = false; show(); }).catch(error => { feedback = hostError(error, context.locale); feedbackError = true; refreshErrors(); });
            }), button(t('放弃草稿并重新读取', 'Discard draft and reload', '下書きを破棄して再読込'), () => {
              if (saving) return; draft = null; applied = null; selected = ''; issues = []; feedback = ''; form = null;
              void load(context).then(show).catch(error => { if (mounted) { feedbackError = true; feedback = hostError(error, context.locale); refreshErrors(); } });
            }));
            if (entry) managementActions.append(button(t('移除此入口（草稿）', 'Remove this entry from draft', '下書きからこの入口を削除'), () => {
              if (saving) return; savePosition(); const index = draft!.entries.indexOf(entry); draft!.entries.splice(index, 1); selected = draft!.entries[index]?.id ?? draft!.entries[index - 1]?.id ?? ''; form = null; issues = issues.filter(issue => issue.entryId !== entry.id); feedback = ''; show(); ui.querySelector<HTMLButtonElement>('.epilogue-entry[aria-current=true]')?.focus();
            }, 'danger'));
            footer.append(management); main.append(footer); form.scrollTop = positions.get(selected) ?? 0; state(); refreshErrors();
          };
          const showIssues = () => {
            const first = issues[0]; if (first?.entryId && first.entryId !== selected) { savePosition(); selected = first.entryId; form = null; }
            show(); const control = first ? fields.get(first.field)?.input : undefined; if (control) { control.scrollIntoView({ block: 'nearest' }); const input = control.matches('input,textarea,select') ? control : control.querySelector<HTMLElement>('button,input,select'); (input ?? control).focus(); }
          };
          void load(context).then(show).catch(error => { if (mounted && alive) { const alert = node('p', hostError(error, context.locale), 'epilogue-error'); alert.setAttribute('role', 'alert'); ui.append(alert); } });
          return () => { savePosition(); mounted = false; root.replaceChildren(); root.classList.remove('ai-epilogue-editor'); };
        } }];
  }, async deactivate() { alive = false; draft = null; applied = null; documents = []; baseDocument = null; issues = []; searches.clear(); positions.clear(); } };
}
function isReadableEnding(id: string) { return !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) && id.length !== 6; }
