import { UIAnimationManager, type UIAnimationManagerHandle, type UIAnimationManagerState } from './UIAnimationManager.js';
import type { UIAnimationBinding } from '@galcraft/templates';
import { GalleryContent, galleryDocuments } from './gallery-content.js';
import { ReadingStylesEditor } from './ReadingStylesEditor.js';
import { previewFontFamily } from './preview-fonts.js';
import { prepareSaveSample, prepareGallerySample, gallerySampleLongTerm } from '@galcraft/player-ui';
import { adoptCanvasStyle, applyBasicPageAnimations, componentTextEditable, componentTextOverride, officialLocaleResources } from '@galcraft/templates';
import { domButton } from '../components/dom-button.js';
import { actionIcon } from '../components/action-icon.js';
import { createId } from '@galcraft/contracts';
import { formHint } from '../components/form-hints.js';
import { codeBlock } from '../components/code-block.js';
import { prepareNativeDialog } from '../components/motion.js';
import type { ComponentConfig, DocumentView, EditInput, EditReceipt, Id, Json, NamedStyle, PageKey, RuntimeTemplate, Snapshot, Visual } from '@galcraft/contracts';
import { captureAuthoringFocus, markAuthoringFocus, restoreAuthoringFocus } from './focus.js';
import { requestHistoryReview } from '../components/history-review.js';
import { RuntimeTemplateSchema, ComponentChangesSchema } from '@galcraft/contracts';
import { applyReadingPreset, componentDefinition, components, createOfficialTemplate, explainVisual, findComponent, insertPluginComponent, pluginComponentCatalog, prepareTemplateSwitch, PreviewGeometry, readTemplateDocuments, readTemplateSource, restoreHiddenTemplatePage, templateEdit, templateIssues } from '@galcraft/templates';
import type { ComponentContribution } from '@galcraft/plugins/contracts';
import { createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PluginComponentProperties } from '../pages/Plugins/component-properties.js';
import { pluginReferencesFromDocuments } from '../pages/Plugins/plugin-fields.js';
import type { AuthoringServices } from './controller.js';
import { openPlayerPreview, type StudioPlayer } from './player-preview.js';
import './page-designer.css';
import { designerText } from './designer-strings.js';
import { designerComponentName, designerPageName } from './designer-labels.js';
import { TemplateChooser } from './template-chooser.js';
import { openAssetPicker } from './asset-picker.js';
import { openActionIconPicker } from './action-icon-picker.js';
import { pagePreviewSample } from './page-preview-sample.js';
import * as monaco from 'monaco-editor';
import { configureMonacoWorkers } from '../components/monaco-workers.js';
import { planPortraitBatch } from './portrait-batch.js';
import { ColorAlpha, colorAlphaValue } from '../components/color-alpha.js';
import { StudioColorField } from '../components/editor-fields/StudioColorField.js';
import { StudioNumberField } from '../components/editor-fields/StudioNumberField.js';
import { AfterstoryLayoutEditor } from './characters/AfterstoryLayoutEditor.js';
import { CharacterSchema } from '@galcraft/contracts';
import type { Asset, Character, BasicComponentKind, PageEditInput, PageEditOperation } from '@galcraft/contracts';
import { BasicComponentCatalog, createBasicComponent } from '@galcraft/templates/editor';
import { pageDataEditor, pageInteractionEditor, pageLocalStateEditor } from './page-data-fields.js';

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
  const element = document.createElement(tag); if (element instanceof HTMLDialogElement) prepareNativeDialog(element); element.textContent = text; element.className = className; return element;
};
const action = domButton;

type PageFieldInputDrafts = Record<string,{baseline:string;value:string;number?:import('../components/editor-fields/StudioNumberField.js').NumberInputDraft;color?:import('../components/editor-fields/StudioColorField.js').ColorInputDraft}>;
type State = 'normal' | 'hover' | 'pressed' | 'focus' | 'disabled' | 'selected' | 'locked' | 'empty';

export class PageDesigner {
  private changing=false;
  private edits: Promise<unknown> = Promise.resolve();
  private animationManagerRoot:Root|null=null;
  private animationManagerHost:HTMLElement|null=null;
  private animationManager=createRef<UIAnimationManagerHandle>();
  private animationResume:UIAnimationManagerState|null=null;
  private afterstorySelection: Id | undefined;
  readonly root = this.node('main', '', 'page-designer');
  private documents: DocumentView[] = [];
  private galleryEditor:GalleryContent|null=null;
  private template!: RuntimeTemplate;
  private snapshot: Snapshot | null = null;
  private compilation: import('./controller.js').AuthoringRefresh['compilation'];
  private page: PageKey = 'title';
  private selected = new Set<Id>();
  private navigating = false;
  private state: State = 'normal';
  private sample = 'normal';
  private zoom: 'fit' | '100' = 'fit';
  private previewLocale: string | null = null;
  private player: StudioPlayer | null = null;
  private previewQueue: Promise<void> = Promise.resolve();
  private previewMounts = 0;
  private geometry: PreviewGeometry | null = null;
  private generation = 0;
  private resize: ResizeObserver | null = null;
  private disposed = false;
  private notice = this.node('p', '', 'designer-notice');
  private inspector = this.node('aside', '', 'designer-properties');
  private tree = this.node('aside', '', 'designer-tree');
  private canvas = this.node('div', '', 'designer-canvas');
  private overlay = this.node('div', '', 'designer-overlay');
  private surface = this.node('div', '', 'designer-player');
  private cancelDrag: (() => void) | null = null;
  private styleDrafts: Record<string,string> = {};
  private styleDraftOptions: Record<string,NamedStyle> = {};
  private backgroundRelease: (() => void) | null = null;
  private pluginProperties: Root | null = null;
  private colorProperties: Root[] = [];
  private numberEditors = new Map<string, { mount: HTMLElement; root: Root }>();
  private renderedNumberFields = new Set<string>();
  private fieldPreview = false;
  private fieldInputDrafts: PageFieldInputDrafts = {};
  private inspectorGroups = new Set<string>();
  private templateWorkspace: { node: HTMLElement; root: Root } | null = null;
  private styleEditors = new Map<string, { node: HTMLElement; synchronize(): void; dispose(): void }>();
  private pageContexts = new Map<PageKey, { selected: Id[]; state: State; sample: string; zoom: 'fit' | '100'; scrollTop: number }>();
  private auxiliaryDocument: string | null = null;
  private stylePinned = false;
  private started:Promise<void>|null=null;
  constructor(private services: AuthoringServices, private changed: (receipt?: EditReceipt, refresh?: import('./controller.js').AuthoringRefresh) => Promise<void>, private locale = 'zh-CN', resume: {page:PageKey;selected:Id[];state:State;sample:string;styleDrafts:Record<string,string>;styleDraftOptions?:Record<string,NamedStyle>;pageContexts?:[PageKey,{ selected: Id[]; state: State; sample: string; zoom: 'fit' | '100'; scrollTop: number }][];auxiliaryDocument?:string|null;animation?:UIAnimationManagerState|null;zoom?:'fit'|'100'}|null = null,
    private assistant?: (scope:{pageIds:Id[];componentIds:Id[]}, intent:'assist'|'ui-assets')=>void, private pluginComponents: ComponentContribution[] = [], private pageChanged?: (key: PageKey, name: string) => void, private saveDocument?: () => Promise<void>, private locateSource?: (source:import('@galcraft/contracts').Source)=>void, private galleryOrigin?:()=>import('@galcraft/contracts').Source|null, private selectionChanged?:()=>void,private draftChanged?:()=>void) {
    if(resume){this.previewLocale=(resume as typeof resume & {previewLocale?:string|null}).previewLocale??null;this.page=resume.page;this.selected=new Set(resume.selected);this.state=resume.state;this.sample=resume.sample;this.zoom=resume.zoom??'fit';this.styleDrafts=resume.styleDrafts;this.styleDraftOptions=resume.styleDraftOptions??{};this.pageContexts=new Map(resume.pageContexts??[]);this.auxiliaryDocument=resume.auxiliaryDocument??null;this.animationResume=resume.animation??null;this.fieldInputDrafts=(resume as typeof resume & {fieldInputs?:PageFieldInputDrafts}).fieldInputs??{};}
  }
  capture() { return {previewLocale:this.previewLocale,page:this.page,selected:[...this.selected],state:this.state,sample:this.sample,zoom:this.zoom,styleDrafts:this.styleDrafts,styleDraftOptions:this.styleDraftOptions,pageContexts:[...this.pageContexts],auxiliaryDocument:this.auxiliaryDocument,animation:this.animationManager?.current?.capture()??this.animationResume,fieldInputs:this.fieldInputDrafts}; }
  hasAnimationDraft() { const state=this.capture().animation;return !!state&&JSON.stringify(state.draft)!==state.baseline; }
  workbenchRegions() { this.tree.dataset.workbench = 'true'; this.inspector.dataset.workbench = 'true'; return { tree: this.tree, inspector: this.inspector }; }
  workbenchPages() { return [...(this.template?.pages.map(page => ({ id: page.key, name: this.pageLabel(page.key) })) ?? []),
    {id:'gallery-content',name:this.t('鉴赏内容','Gallery content','鑑賞コンテンツ')}, {id:'@animations',name:this.t('界面动画','Interface animations','UIアニメーション')},
    {id:'@templates',name:this.t('作品模板','Project templates','作品テンプレート')}, ...(this.template?.styles.map(style=>({id:`@style:${style.id}`,name:style.name,detail:style.language.toUpperCase()}))??[]),...Object.entries(this.styleDraftOptions).filter(([,style])=>!this.template?.styles.some(item=>item.id===style.id)).map(([key,style])=>({id:`@draft:${key}`,name:`${style.name} · ${this.t('草稿','Draft','下書き')}`}))]; }
  private pageLabel(key:string) { const page=this.template?.pages.find(item=>item.key===key); return page&&!['page.'+key,key].includes(page.titleKey)&&!this.template.locales[this.locale]?.[page.titleKey] ? page.titleKey : designerPageName(key,this.locale,this.template.locales); }
  workbenchComponents(): import('../components/workbench/ObjectTree.js').WorkbenchTreeNode[] {
    if (!this.template) return [];
    if(this.galleryEditor)return galleryDocuments(this.documents).map(({entry})=>({id:entry.id,name:entry.name,children:entry.differences?.map(difference=>({id:difference.id,name:difference.name}))}));
    const visit = (component: ComponentConfig): import('../components/workbench/ObjectTree.js').WorkbenchTreeNode => ({ id: component.id, name: this.componentLabel(component), detail: component.locked ? this.t('锁定','Locked','ロック') : undefined, ...(component.children.length||['container','list','tab','button'].includes(componentDefinition(component.part)?.kind??'') ? { children: component.children.map(visit) } : {}) });
    return [visit(this.currentPage().root)];
  }
  selectComponents(ids: Id[]) { if(this.galleryEditor){if(ids[0])this.galleryEditor.selectEntry(ids[0]);return;}this.selected = new Set(ids.filter(id => components(this.currentPage().root).some(component => component.id === id))); this.drawInspector(); this.selectionBounds(); if(!this.stylePinned&&this.root.querySelector('.has-style'))this.styleEditor(); }
  async moveComponents(ids:Id[],parentId:Id) {const page=this.currentPage(),valid=ids.filter(id=>id!==page.root.id&&findComponent(this.template,id)&&!findComponent(this.template,id)!.locked);if(valid.length)await this.instanceOperation(this.t('移动到容器','Reparent components','親を変更'),{kind:'component.reparent',pageId:page.id,componentIds:valid,parentId});}
  async renameComponent(id:Id,name:string):Promise<string|void> {try{await this.editInstances(this.t('重命名组件','Rename component','部品名を変更'),[{kind:'component.update',pageId:this.currentPage().id,componentId:id,changes:{name}}]);}catch(reason){return String(reason);}}
  private componentLabel(component: ComponentConfig): string {
    return component.name || designerComponentName(component,this.locale,this.template.locales);
  }
  workbenchDocumentId() { return this.template ? this.historyScope().documentId : null; }
  private historyScope() {
    if (this.galleryEditor) return { documentId: this.galleryEditor.documentId() ?? this.template.instanceId };
    const focusedStyle = document.activeElement?.closest<HTMLElement>('[data-style-id]')?.dataset.styleId;
    const styleId = this.auxiliaryDocument?.startsWith('@style:') ? this.auxiliaryDocument.slice(7) : focusedStyle;
    const style = this.template.styles.find(item => item.id === styleId);
    if (style) return { documentId: this.documents.find(item => style.sourcePath in item.files)?.documentId ?? this.template.instanceId };
    return { documentId: this.auxiliaryDocument ? this.template.instanceId : this.currentPage().id };
  }
  workbenchPage() { return this.galleryEditor ? 'gallery-content' : this.auxiliaryDocument ?? this.page; }
  hasWorkingChanges() { return this.hasAnimationDraft() || this.documents.some(document => document.dirty && Object.keys(document.files).some(path => path.startsWith('ui/'))) || Object.keys(this.styleDrafts).length > 0; }
  discardAnimationDraft() {
    this.animationResume=null;
    this.animationManagerRoot?.unmount();this.animationManagerRoot=null;
    this.animationManagerHost?.remove();this.animationManagerHost=null;
    this.canvas.hidden=false;this.drawInspector();void this.preview();
  }
  discardStyleDrafts() { for (const editor of this.styleEditors.values()) { editor.dispose(); editor.node.remove(); } this.styleEditors.clear(); this.styleDrafts = {};this.styleDraftOptions={}; this.root.querySelector('.designer-center')?.classList.remove('has-style'); }
  async openPage(id: string, notify = false) {
    if(this.started)await this.started;else if(!this.template)await this.start();
    if(this.disposed)return;
    if(id!=='@animations'&&this.animationManagerHost){this.animationResume=this.animationManager.current?.capture()??this.animationResume;this.animationManagerHost.hidden=true;}
    if(this.templateWorkspace){this.templateWorkspace.node.hidden=id!=='@templates';this.root.querySelector('.designer-center')?.classList.toggle('has-template',id==='@templates');}
    this.auxiliaryDocument = null;
    if(id==='@animations'){this.auxiliaryDocument=id;if(this.animationManagerHost)this.animationManagerHost.hidden=false;this.openAnimations();return;}
    if(id==='@templates'){this.auxiliaryDocument=id;this.templates();return;}
    if(id.startsWith('@draft:')){const key=id.slice(7),style=this.styleDraftOptions[key];if(!style)return;await this.openPage(style.scope.pageId);this.selected=new Set(style.scope.componentId?[style.scope.componentId]:[]);this.auxiliaryDocument=id;this.styleEditor(undefined,false,key);return;}
    if(id.startsWith('@style:')){const style=this.template.styles.find(item=>item.id===id.slice(7));if(!style)return;await this.openPage(style.scope.pageId);this.selected=new Set(style.scope.componentId?[style.scope.componentId]:[]);this.auxiliaryDocument=id;this.styleEditor(style.id);this.drawInspector();return;}
    if(id==='gallery-content'){this.openGalleryContent();return;}
    const hadGallery=!!this.galleryEditor;this.galleryEditor?.root.remove();this.galleryEditor=null;this.canvas.hidden=false;this.root.querySelector<HTMLElement>('.designer-toolbar')?.removeAttribute('hidden');
    const page = this.template?.pages.find(page => page.id === id || page.key === id); if(!page)return;if(this.page===page.key){if(hadGallery){this.drawTree();this.drawInspector();await this.preview();}return;}
    const center = this.root.querySelector<HTMLElement>('.designer-center'); this.pageContexts.set(this.page, { selected: [...this.selected], state: this.state, sample: this.sample, zoom: this.zoom, scrollTop: center?.scrollTop ?? 0 });
    this.page = page.key; const context = this.pageContexts.get(this.page); this.selected = new Set(context?.selected ?? []); this.state = context?.state ?? 'normal'; this.sample = context?.sample ?? 'normal'; this.zoom = context?.zoom ?? 'fit';
    this.drawTree(); this.drawInspector(); await this.preview(); if (center) center.scrollTop = context?.scrollTop ?? 0;
    if(center?.classList.contains('has-style')&&!this.stylePinned)this.styleEditor();
    if (notify) this.pageChanged?.(page.key, this.pageLabel(page.key));
  }
  async refresh() { if (this.disposed) return; await this.reload(); this.drawTree(); this.drawInspector(); await this.preview(); }
  private node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') {
    return node(tag, designerText(text, this.locale), className);
  }
  private t(zh:string,en:string,ja:string){return this.locale==='en'?en:this.locale==='ja'?ja:zh;}
  private action(label: string, run: () => void | Promise<void>) { return action(designerText(label, this.locale), run); }
  private iconAction(label: string, path: string, run: () => void | Promise<void>) {
    const control=this.action('',run), svg=document.createElementNS('http://www.w3.org/2000/svg','svg');control.className='designer-icon-action';
    for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','aria-hidden':'true'}))svg.setAttribute(key,value);
    const shape=document.createElementNS('http://www.w3.org/2000/svg','path');shape.setAttribute('d',path);svg.append(shape);
    control.append(svg,this.node('span',label));control.title=designerText(label,this.locale);return control;
  }
  start():Promise<void> { return this.started??=(async()=>{await this.reload(); if (this.disposed) return; this.draw(); if(this.animationResume)this.openAnimations(this.animationResume.target);await this.preview();})(); }
  dispose() {
    for (const editor of this.numberEditors.values()) editor.root.unmount(); this.numberEditors.clear();
    this.animationManagerRoot?.unmount();this.animationManagerRoot=null; for (const root of this.colorProperties) root.unmount(); this.colorProperties = []; this.templateWorkspace?.root.unmount(); this.templateWorkspace=null; for (const editor of this.styleEditors.values()) editor.dispose(); this.styleEditors.clear(); this.pluginProperties?.unmount(); this.pluginProperties = null; this.cancelDrag?.(); this.disposed = true; this.generation++; this.geometry?.dispose(); this.geometry = null; this.player?.dispose(); this.player = null; this.resize?.disconnect(); this.backgroundRelease?.(); for(const dialog of this.root.querySelectorAll('dialog'))dialog.close(); }
  private async reload() {
    const listed = await this.services.bridge.documents.list(); if (!listed.ok) throw new Error(listed.error.message);
    this.documents = listed.value; this.template = readTemplateDocuments(this.documents);
    for (const editor of this.styleEditors.values()) editor.synchronize();
    if (!this.template.pages.some(page => page.key === this.page)) this.page = this.template.pages[0]!.key;
    const compiled = await this.services.compilePreview?.(false, this.documents); this.compilation = compiled;
    if (compiled?.ok) { this.snapshot = compiled.value.snapshot ?? compiled.value.lastValid;
      this.notice.textContent = compiled.value.current ? '' : '当前输入无效，预览为上次有效版本'; }
  }
  private async apply(edit: EditInput, redraw = true) {
    if (!edit.patches.length) return;
    const bridge = this.services.bridge.documents;
    const planned = await bridge.planEdit(edit); if (!planned.ok) throw new Error(planned.error.message);
    const applied = await bridge.applyEdit(planned.value.planId, edit.expected); if (!applied.ok) throw new Error(applied.error.message);
    await this.reload(); const focus = captureAuthoringFocus(this.inspector);
    await this.changed(applied.value, { documents: this.documents, compilation: this.compilation }); this.fieldPreview = false;
    if (redraw) { this.drawTree(); this.drawInspector(focus); await this.preview(); }
    this.notice.textContent ||= '已修改 · 未保存';
    return focus;
  }
  async history(action: 'undo' | 'redo') {
    await this.safely(async () => {
      const documents = this.services.bridge.documents;
      await this.edits;
      const scope = this.historyScope(), plan = await (action === 'undo' ? documents.planUndo(scope.documentId) : documents.planRedo(scope.documentId));
      if (!plan.ok) { if (['NOTHING_TO_UNDO','NOTHING_TO_REDO'].includes(plan.error.code)) { this.notice.textContent = this.t('当前范围没有可撤销或重做的修改','No changes to undo or redo in this scope','この範囲に元に戻す・やり直す変更はありません'); return; } throw new Error(plan.error.message); }
      if ((plan.value.members?.length > 1 || plan.value.reverseOrder?.length > 1) && !await requestHistoryReview(plan.value, this.documents, this.locale)) return;
      const result = await documents[action](plan.value.planId); if (!result.ok) throw new Error(result.error.message);
      await this.reload(); const focus = captureAuthoringFocus(this.inspector);
      await this.changed(result.value, { documents: this.documents, compilation: this.compilation }); this.fieldPreview = false; this.drawTree(); this.drawInspector(focus); await this.preview();
    });
  }
  private async safely(run: () => Promise<void>) { try { await run(); } catch (error) { this.notice.textContent = String(error); } }
  private async change(run: (next: RuntimeTemplate) => void, label = '修改页面公开属性') {
    if(this.navigating)return;
    await this.safely(() => this.queueEdit(async () => {
    this.surface.dataset.previewStatus='loading';
    for(const button of this.inspector.querySelectorAll<HTMLButtonElement>('[data-preview-animation]'))button.disabled=true;
    const next = structuredClone(this.template); run(next);
      await this.apply(templateEdit(this.documents, RuntimeTemplateSchema.parse(next), label)); }));
  }
  private queueEdit<T>(run: () => Promise<T>): Promise<T> {
    const task = this.edits.then(async () => { if (this.disposed) return undefined as T; this.changing = true; try { return await run(); } finally { this.changing = false; } });
    this.edits = task.catch(() => {}); return task;
  }
  private async enableFigurePortraits() {
    if(this.navigating)return;
    await this.safely(async () => {
      const source = await this.services.read(); if (!source.ok) throw new Error(source.error.message);
      const planned = planPortraitBatch(source.value);
      if (!planned.ok) throw new Error(this.t('请先修正作品中的脚本错误，再批量开启头像。', 'Fix the project script errors before enabling portraits in bulk.', '一括設定の前に作品のスクリプトエラーを修正してください。'));
      if (!planned.value.count) { this.notice.textContent = this.t('没有需要批量开启的立绘入场、重置或已有头像配置。', 'No figure entries, resets, or existing portrait settings need enabling.', '一括で有効にする立ち絵の登場・リセット・既存のポートレート設定はありません。'); return; }
      await this.apply(planned.value.edit);
      this.notice.textContent = this.t(`已更新 ${planned.value.count} 条立绘头像配置 · 入场与重置默认开启，差分继承已有取景 · 未保存`, `Updated ${planned.value.count} figure portrait settings · Entries and resets use defaults; replacements inherit existing crops · Unsaved`, `${planned.value.count} 件の立ち絵ポートレートを更新 · 登場とリセットは既定の範囲、差分は既存の範囲を継承 · 未保存`);
    });
  }
  private async pickerChange(run: (next: RuntimeTemplate) => void) {
    try { const next=structuredClone(this.template);run(next);await this.apply(templateEdit(this.documents,RuntimeTemplateSchema.parse(next),'修改页面图片'));
      return {ok:true as const,value:undefined,warnings:[]};
    } catch(error) { return {ok:false as const,error:{code:'PAGE_IMAGE_APPLY',message:String(error),severity:'error' as const,owner:'M01' as const,related:[],actions:[]},issues:[]}; }
  }
  private currentPage() { return this.template.pages.find(page => page.key === this.page)!; }
  private draw() {
    const header = this.node('header', '', 'designer-heading');
    const title = this.node('div'); title.append(this.node('h1', '页面设计'), this.node('p', '独立页面、公开组件与导航'));
    const actions=this.node('div','','designer-heading-actions');
    const group=(label:string)=>{const controls=this.node('div','','designer-action-group');controls.setAttribute('role','group');controls.ariaLabel=designerText(label,this.locale);controls.append(this.node('small',label));actions.append(controls);return controls;};
    const templates=group('模板'), edit=group('编辑'), preview=group('预览');
    edit.append(this.action(this.t('界面动画','Interface animations','UIアニメーション'),()=>this.openAnimations()));
    templates.append(this.iconAction('模板','M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z', () => this.templates()));
    edit.append(this.iconAction('保存页面','M4 3h14l3 3v15H3V3h1 M7 3v6h10V3 M7 21v-8h10v8', () => this.safely(async () => {
      if (this.saveDocument) { await this.saveDocument(); return; }
      const plan = await this.services.bridge.documents.planSave({ kind: 'current', documentId: this.workbenchDocumentId()! });
      if (!plan.ok) throw new Error(plan.error.message);
      const result = await this.services.bridge.documents.save(plan.value.planId); if (!result.ok) throw new Error(result.error.message);
      await this.reload(); await this.changed(); this.notice.textContent = `已保存 ${result.value.saved.length} 个关联文档`;
    })), this.iconAction('撤销','M9 5 3 11l6 6 M3 11h11a7 7 0 0 1 7 7', () => this.history('undo')), this.iconAction(this.t('恢复','Redo','やり直す'),'m15 5 6 6-6 6 M21 11H10a7 7 0 0 0-7 7', () => this.history('redo')));
    const hint=this.node('p','设计模式点击组件；Shift 多选；方向键移动，Shift + 方向键移动 10 像素。','designer-mode-hint');
    const modes=this.node('div','','designer-mode-switch');modes.setAttribute('role','group');modes.ariaLabel=this.t('页面模式','Page mode','ページモード');
    const setMode=(navigating:boolean)=>{if(!navigating)this.previewLocale=this.player?.data.current()?.preferences.menuLocale??this.previewLocale;this.navigating=navigating;this.surface.ariaHidden=String(!navigating);this.cancelDrag?.();for(const control of [...edit.querySelectorAll('button'),...templates.querySelectorAll('button'),...reading.querySelectorAll('button')])control.disabled=navigating;if(navigating){for(const saved of this.styleEditors.values())saved.node.hidden=true;center.classList.remove('has-style');styleToggle.setAttribute('aria-pressed','false');}this.overlay.hidden=navigating;this.canvas.dataset.mode=navigating?'preview':'design';design.setAttribute('aria-pressed',String(!navigating));navigation.setAttribute('aria-pressed',String(navigating));hint.textContent=navigating?this.t('导航预览：点击页面控件体验跳转。返回设计后继续编辑。','Navigation preview: use page controls to navigate. Return to Design to edit.','ナビゲーションプレビュー：ページの操作で移動します。編集はデザインに戻って行います。'):designerText('设计模式点击组件；Shift 多选；方向键移动，Shift + 方向键移动 10 像素。',this.locale);if(!navigating)this.player?.view.navigation.replace(this.page);this.drawTree();this.drawInspector();};
    const design=this.iconAction(this.t('设计','Design','デザイン'),'m4 20 4-1L20 7l-3-3L5 16z',()=>{setMode(false);this.scheduleFit();});design.setAttribute('aria-pressed',String(!this.navigating));
    const navigation=this.iconAction('导航预览','m9 4 12 8-12 8z',()=>{setMode(true);this.scheduleFit();});navigation.setAttribute('aria-pressed',String(this.navigating));modes.append(design,navigation);
    const reading=group(this.t('阅读面板','Reading panel','読書パネル'));reading.dataset.readingActions='';reading.hidden=this.page!=='story';
    reading.append(this.action(this.t('头像阅读','Portrait reading','ポートレート付き'),()=>this.change(next=>applyReadingPreset(next,'portrait'))),this.action(this.t('通透阅读','Clear reading','透過表示'),()=>this.change(next=>applyReadingPreset(next,'clear'))));
    const batchPortraits = this.action(this.t('批量开启立绘头像', 'Enable figure portraits in bulk', '立ち絵のポートレートを一括有効化'), () => this.enableFigurePortraits());
    batchPortraits.dataset.portraitBatch = ''; batchPortraits.title = this.t('为立绘入场与重置设置默认头像；已有取景保持，差分继续继承已有取景。可在立绘属性中逐个微调。', 'Enable default portraits for figure entries and resets. Preserve existing crops and let replacements inherit them. Fine-tune each in figure properties.', '立ち絵の登場とリセットに既定のポートレートを設定し、既存の範囲を保持します。差分は範囲を継承し、立ち絵のプロパティで個別調整できます。'); reading.append(batchPortraits);
    const startup=this.action(this.t('开屏预览','Preview startup','起動画面をプレビュー'),()=>this.safely(async()=>{await this.preview();if(this.player)await this.player.view.previewStartup('startup');}));startup.dataset.startupPreview='';preview.append(modes,startup);header.append(title,actions);
    if(this.assistant) { const ai=group('AI 与素材'), open=(intent:'assist'|'ui-assets')=>this.assistant!({pageIds:[this.currentPage().id],componentIds:[...this.selected]},intent);
      const assist=this.iconAction('AI 辅助','m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z',()=>open('assist'));
      assist.title=this.t('调整当前页面或组件的布局与样式','Adjust the selected page or component layout and styles','現在のページ・部品の配置とスタイルを調整');
      const assets=this.iconAction('UI 素材','M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M16 7h.01',()=>open('ui-assets'));
      assets.title=this.t('制作页面背景、边框和图标素材','Create page backgrounds, frames and icons','ページ背景・枠・アイコン素材を制作');ai.append(assist,assets); }
    const center = this.node('section', '', 'designer-center');
    const toolbar = this.node('div', '', 'designer-toolbar');
    const states = this.node('select'); states.ariaLabel = designerText('组件状态',this.locale);
    for (const [value, label] of [['normal', '普通'], ['hover', '悬浮'], ['pressed', '按下'], ['focus', '焦点'], ['disabled', '禁用'], ['selected','选中'], ['locked','业务锁定'], ['empty','空槽']]) {
      const option = this.node('option', label); option.value = value; states.append(option); }
    states.dataset.previewState='';states.value=this.state;states.onchange = () => { this.state = states.value as State; this.drawInspector(); void this.preview(); };
    const samples = this.node('select'); samples.ariaLabel = designerText('页面样例',this.locale);
    for (const [value, label] of [['partial',['save','load'].includes(this.page)?'一满十一空':'部分解锁'],['missing','缺缩略图'],['normal','未放素材'],['viewer','查看器'],['actual','实际内容'],['longText','多语言长文本'],['playback:loading','准备中'],['playback:playing','播放中（静音样例）'],['playback:paused','已暂停'],['playback:stopped','已停止'],['playback:ended','已结束'],['playback:failed','播放失败'],['zh-CN','中文长文本'],['en','English long text'],['ja','日本語の長文'],['empty','空内容'],['full','满存档'],['unlocked','已解锁'],['locked','未解锁']]) {
      const option = this.node('option', label); option.value = value; samples.append(option); }
    for (const [value, label] of [['reading:unread',this.t('ADV · 未读','ADV · Unread','ADV・未読')],['reading:read',this.t('ADV · 已读','ADV · Read','ADV・既読')],['reading:nvl-unread',this.t('NVL · 未读','NVL · Unread','NVL・未読')],['reading:nvl-read',this.t('NVL · 已读','NVL · Read','NVL・既読')]]) { const option = this.node('option', label); option.value = value!; samples.append(option); }
    samples.dataset.previewSample='';samples.value=this.sample;samples.onchange = () => { this.sample = samples.value; void this.preview(); };
    const zoom=this.node('select');zoom.ariaLabel=this.t('预览倍率','Preview zoom','プレビュー倍率');
    for(const [value,label] of [['fit','适应窗口'],['100','100%']]){const option=this.node('option',label);option.value=value!;zoom.append(option);}
    zoom.dataset.previewZoom='';zoom.value=this.zoom;zoom.onchange=()=>{this.zoom=zoom.value as typeof this.zoom;this.fitPreview();};
    const styleToggle=this.iconAction(this.t('样式','Styles','スタイル'),'m8 6-6 6 6 6M16 6l6 6-6 6',()=>{if(center.classList.contains('has-style')){for(const saved of this.styleEditors.values())saved.node.hidden=true;center.classList.remove('has-style');styleToggle.setAttribute('aria-pressed','false');}else this.styleEditor();});styleToggle.dataset.styleToggle='';styleToggle.setAttribute('aria-pressed','false');
    const menuLanguage=this.node('select');menuLanguage.ariaLabel=this.t('Player 菜单语言','Player menu language','Player メニュー言語');menuLanguage.dataset.previewLocale='';
    for(const value of this.snapshot?.project.languages.menus??Object.keys(this.template.locales)){const option=this.node('option',({'zh-CN':'简体中文',en:'English',ja:'日本語'} as Record<string,string>)[value]??value);option.value=value;menuLanguage.append(option);}
    menuLanguage.value=this.previewLocale??this.snapshot?.project.languages.menuDefault??'zh-CN';menuLanguage.onchange=()=>{this.previewLocale=menuLanguage.value;this.drawInspector();void this.preview();};
    toolbar.append(this.node('span', '同一 Player · 独立样例资料'), states, samples,menuLanguage,zoom,styleToggle);
    this.canvas.dataset.mode = this.navigating ? 'preview' : 'design';
    this.surface.ariaHidden = String(!this.navigating);
    this.surface.addEventListener('focusin', () => { if (!this.navigating) this.canvas.focus({ preventScroll: true }); });
    this.canvas.ariaLabel = this.t('页面设计画布；从页面组件树选择组件，使用方向键移动', 'Page design canvas; select components in the component tree and move with arrow keys', 'ページデザインキャンバス。部品ツリーで選択し、矢印キーで移動');
    this.canvas.append(this.surface, this.overlay);
    this.canvas.addEventListener('click', event => {
      if (!this.navigating) { event.preventDefault(); event.stopPropagation(); }
    }, true);
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener('pointerdown', event => {
      if (this.navigating || event.button !== 0 || !this.snapshot) return;
      const handle=(event.target as HTMLElement).closest<HTMLElement>('[data-resize-direction]');
      if(handle){event.preventDefault();event.stopPropagation();this.resizeInstance(event,handle.dataset.resizeDirection!);return;}
      event.preventDefault(); event.stopPropagation(); this.canvas.focus({ preventScroll: true });
      const hit = (event.target as HTMLElement).closest<HTMLElement>('[data-gc-component]');
      if (!hit?.dataset.gcComponent) return;
      const repeat=(event.target as HTMLElement).closest<HTMLElement>('[data-gc-part="cg.grid.item"],[data-gc-part="video.grid.item"],[data-gc-part="cg.music.list.item"],[data-gc-part="music.list.item"]');
      const repeated=repeat?.dataset.gcComponent&&findComponent(this.template,repeat.dataset.gcComponent);
      const id = repeated&&!components(repeated).some(component=>this.selected.has(component.id))?repeated.id:hit.dataset.gcComponent;
      if (event.shiftKey && this.selected.has(id)) this.selected.delete(id);
      else { if (!event.shiftKey && !this.selected.has(id)) this.selected.clear(); this.selected.add(id); }
      this.drawTree(); this.drawInspector(); this.selectionBounds();
      if(!this.stylePinned&&center.classList.contains('has-style'))this.styleEditor();
      this.selectionChanged?.();
      if (findComponent(this.template, id)?.locked) { this.notice.textContent = '该组件已锁定，请先在右侧取消锁定。'; return; }
      const moving = [...this.selected].filter(id => !findComponent(this.template, id)?.locked).map(id => this.surface.querySelector<HTMLElement>(`[data-gc-component="${id}"]`)).filter((element): element is HTMLElement => Boolean(element));
      // A selected child follows its selected ancestor once, rather than receiving the offset twice.
      const roots = moving.filter(element => !moving.some(parent => parent !== element && parent.contains(element)));
      const originals = roots.map(element => ({ element, translate: element.style.translate }));
      const start = { x: event.clientX, y: event.clientY }, scale = this.snapshot.project.canvas.width / this.surface.getBoundingClientRect().width;
      let dx = 0, dy = 0;
      this.canvas.setPointerCapture(event.pointerId); this.canvas.classList.add('dragging');
      this.canvas.onpointermove = next => {
        dx = Math.round((next.clientX - start.x) * scale); dy = Math.round((next.clientY - start.y) * scale);
        for (const { element } of originals) element.style.translate = `${dx}px ${dy}px`;
        this.selectionBounds(); this.notice.textContent = `移动：X ${dx} px · Y ${dy} px`;
      };
      const finish = (commit: boolean) => {
        this.cancelDrag = null;
        this.canvas.onpointermove = this.canvas.onpointerup = this.canvas.onpointercancel = null;
        if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
        this.canvas.classList.remove('dragging'); for (const { element, translate } of originals) element.style.translate = translate;
        this.selectionBounds(); if (commit && (dx || dy)) void this.move(dx, dy);
      };
      this.cancelDrag = () => finish(false);
      this.canvas.onpointerup = () => finish(true); this.canvas.onpointercancel = () => finish(false);
    }, true);
    this.canvas.onkeydown = event => {
      if (event.key === 'Escape' && this.cancelDrag) { event.preventDefault(); this.cancelDrag(); return; }
      if(!this.navigating&&(event.key==='Delete'||event.key==='Backspace')&&this.selected.size){event.preventDefault();void this.instanceOperation(this.t('删除组件','Delete components','部品を削除'),{kind:'component.remove',pageId:this.currentPage().id,componentIds:[...this.selected].filter(id=>id!==this.currentPage().root.id&&!findComponent(this.template,id)?.locked)});return;}
      if (this.navigating || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault(); const step = event.shiftKey ? 10 : 1;
      void this.move(event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
        event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
    };
    center.append(toolbar, this.canvas, hint);
    const layout = this.node('div', '', 'designer-layout');
    if(this.tree.dataset.workbench!=='true')layout.append(this.tree);
    layout.append(center);
    if(this.inspector.dataset.workbench!=='true')layout.append(this.inspector);
    this.root.append(header, this.notice, layout); this.drawTree(); this.drawInspector(); this.styleEditor();
  }
  private async editInstances(label:string, operations:PageEditOperation[]) {
    if(this.navigating)return;
    return this.queueEdit(async () => {
    const previousStatus=this.surface.dataset.previewStatus;this.surface.dataset.previewStatus='loading';this.surface.setAttribute('aria-busy','true');
    try {
      const prepare=this.services.bridge.templates?.preparePageEdit;
      if(!prepare)throw new Error(this.t('页面编辑服务不可用，请重新打开作品。','Page editing is unavailable. Reopen the project.','ページ編集を利用できません。作品を開き直してください。'));
      const result=await prepare({label,operations});if(!result.ok)throw new Error(result.error.message);
      const focus = await this.apply(result.value.edit, false);
      const added=result.value.created.components;
      if(added.length)this.selected=new Set([added[0]!]);
      else this.selected=new Set([...this.selected].filter(id=>findComponent(this.template,id)));
      this.drawTree();this.drawInspector(focus);await this.preview();this.selectionBounds();this.selectionChanged?.();
      return result.value;
    } finally {if(this.surface.dataset.previewStatus==='loading'){this.surface.dataset.previewStatus=previousStatus??'ready';this.surface.setAttribute('aria-busy','false');}}
    });
  }
  private instanceOperation(label:string, operation:PageEditOperation) { return this.safely(async()=>{await this.editInstances(label,[operation]);}); }
  private addBasic(kind:BasicComponentKind) {
    return this.safely(async()=>{
      const page=this.currentPage(), selected=findComponent(this.template,[...this.selected][0]??'');
      const parent=selected&&['container','list','tab','button'].includes(componentDefinition(selected.part)?.kind??'')?selected:page.root;
      const component=createBasicComponent(kind,{name:this.basicName(kind)});
      component.layout.x={unit:'px',value:40};component.layout.y={unit:'px',value:40};
      if(parent.part==='basic.tabs'&&parent.options?.[0])component.content.tabValue=parent.options[0].value;
      if(parent.layout.mode!=='absolute')component.layout.position='flow';
      const operations:PageEditOperation[]=[];
      if(['input','slider','toggle','select','tabs'].includes(kind)){
        const key=`value_${component.id.replaceAll('-','')}`, value=kind==='toggle'?false:kind==='slider'?50:kind==='select'||kind==='tabs'?'first':'';
        operations.push({kind:'page.update',pageId:page.id,localState:{...page.localState,[key]:value}});
        component.bindings={value:{source:'local',path:key}};
        if(kind==='select'||kind==='tabs')component.options=[{value:'first',label:this.t('第一项','First','項目1')},{value:'second',label:this.t('第二项','Second','項目2')}];
        if(kind==='tabs')for(const option of component.options!){const child=createBasicComponent('text',{name:option.label});child.content={text:option.label,tabValue:option.value};child.layout.position='flow';component.children.push(child);}
      }
      if(kind==='list'){
        component.layout.mode='column';component.repeat={source:{source:'data',path:'characters'},key:'id',emptyText:this.t('还没有角色','No characters yet','キャラクターがありません')};
        const item=createBasicComponent('text',{name:this.t('角色名称样板','Character name template','キャラクター名のテンプレート')});item.bindings={text:{source:'item',path:'name'}};item.layout.position='flow';component.children.push(item);
      }
      operations.push({kind:'component.add',pageId:page.id,parentId:parent.id,component});
      await this.editInstances(this.t('添加组件','Add component','部品を追加'),operations);
    });
  }
  private basicName(kind:BasicComponentKind) { return ({container:this.t('容器 / 组合','Container / group','コンテナー / グループ'),text:this.t('文本','Text','テキスト'),image:this.t('图片','Image','画像'),button:this.t('按钮','Button','ボタン'),decoration:this.t('装饰','Decoration','装飾'),input:this.t('输入框','Input','入力欄'),slider:this.t('滑杆','Slider','スライダー'),toggle:this.t('开关 / 复选框','Toggle / checkbox','スイッチ / チェック'),select:this.t('选择器','Select','セレクト'),tabs:this.t('页签','Tabs','タブ'),list:this.t('列表 / 重复容器','List / repeat','リスト / 繰り返し')})[kind]; }
  private selectField(label:string, values:{value:string;label:string}[], value:string, changed:(value:string)=>void) {
    const field=this.node('label',label),input=this.node('select');input.ariaLabel=label;
    for(const entry of values){const option=this.node('option',entry.label);option.value=entry.value;input.append(option);}input.value=value;input.onchange=()=>changed(input.value);field.append(input);this.inspector.append(field);return input;
  }
  private instanceLayout(component:ComponentConfig) {
    const page=this.currentPage(), all=components(page.root), parent=all.find(item=>item.children.some(child=>child.id===component.id));
    const update=(changes:Parameters<typeof ComponentChangesSchema.parse>[0])=>this.safely(async()=>{await this.editInstances(this.t('调整组件布局','Edit component layout','部品の配置を編集'),[{kind:'component.update',pageId:page.id,componentId:component.id,changes:ComponentChangesSchema.parse(changes)}]);});
    this.field(this.t('实例名称','Instance name','インスタンス名'),component.name??this.componentLabel(component),value=>void update({name:value}));
    this.selectField(this.t('自身定位','Position in parent','親内の配置'),[{value:'free',label:this.t('自由定位','Free position','自由配置')},{value:'flow',label:this.t('跟随父级排布','Parent flow','親のレイアウト')}],component.layout.position??(component.layout.mode==='absolute'?'free':'flow'),value=>{
      if(value==='flow'){void update({layout:{position:'flow'}});return;}
      const element=this.surface.querySelector<HTMLElement>(`[data-gc-component="${component.id}"]`),owner=parent&&this.surface.querySelector<HTMLElement>(`[data-gc-component="${parent.id}"]`);
      const rect=element?.getBoundingClientRect(),base=(owner??this.surface).getBoundingClientRect(),scale=this.snapshot!.project.canvas.width/this.surface.getBoundingClientRect().width;
      void update({layout:{position:'free',anchorX:0,anchorY:0,...(rect?{x:{unit:'px',value:(rect.left-base.left)*scale},y:{unit:'px',value:(rect.top-base.top)*scale},width:{unit:'px',value:rect.width*scale},height:{unit:'px',value:rect.height*scale}}:{})}});
    });
    if(['container','list','tab'].includes(componentDefinition(component.part)?.kind??'')){
      this.selectField(this.t('内部排布','Children layout','子のレイアウト'),['absolute','row','column','grid'].map(value=>({value,label:({absolute:this.t('自由','Free','自由'),row:this.t('横排','Row','横'),column:this.t('纵排','Column','縦'),grid:this.t('网格','Grid','グリッド')})[value]!})),component.layout.mode,value=>void this.safely(async()=>{
        const operations:PageEditOperation[]=[{kind:'component.update',pageId:page.id,componentId:component.id,changes:{layout:{mode:value as ComponentConfig['layout']['mode']}}}];
        const owner=this.surface.querySelector<HTMLElement>(`[data-gc-component="${component.id}"]`),base=owner?.getBoundingClientRect(),scale=this.snapshot!.project.canvas.width/this.surface.getBoundingClientRect().width;
        for(const child of component.children){const rect=this.surface.querySelector<HTMLElement>(`[data-gc-component="${child.id}"]`)?.getBoundingClientRect();operations.push({kind:'component.update',pageId:page.id,componentId:child.id,changes:{layout:value==='absolute'&&rect&&base?{position:'free',anchorX:0,anchorY:0,x:{unit:'px',value:(rect.left-base.left)*scale},y:{unit:'px',value:(rect.top-base.top)*scale},width:{unit:'px',value:rect.width*scale},height:{unit:'px',value:rect.height*scale}}:{position:'flow'}}});}
        await this.editInstances(this.t('调整内部排布','Change children layout','子の配置を変更'),operations);
      }));
      this.field(this.t('子项间距','Child gap','子の間隔'),component.layout.gap,value=>void update({layout:{gap:Number(value)}}),'number');
      if(component.layout.mode==='grid')this.field(this.t('网格列数','Grid columns','列数'),component.layout.columns,value=>void update({layout:{columns:Number(value)}}),'number');
      if((component.layout.position??'free')==='free')this.field(this.t('组视觉倍率','Group visual scale','グループの表示倍率'),component.visualScale??1,value=>void update({visualScale:Number(value)}),'number');
    }
    if(parent){
      const legal=all.filter(item=>item.id!==component.id&&!components(component).some(child=>child.id===item.id)&&['container','list','tab','button'].includes(componentDefinition(item.part)?.kind??''));
      if(!legal.some(item=>item.id===page.root.id))legal.unshift(page.root);
      this.selectField(this.t('父容器','Parent container','親コンテナー'),legal.map(item=>({value:item.id,label:this.componentLabel(item)})),parent.id,parentId=>void this.instanceOperation(this.t('移动到容器','Reparent components','親を変更'),{kind:'component.reparent',pageId:page.id,componentIds:[...this.selected],parentId}));
      const row=this.node('div','','designer-instance-action-row'),index=parent.children.findIndex(item=>item.id===component.id);
      for(const [offset,label] of [[-1,this.t('向前排列','Move earlier','前へ')],[1,this.t('向后排列','Move later','後へ')]] as const){const button=this.action(label,()=>this.instanceOperation(this.t('调整组件顺序','Reorder component','順序を変更'),{kind:'component.reorder',pageId:page.id,componentId:component.id,index:index+offset}));button.disabled=index+offset<0||index+offset>=parent.children.length||component.locked;row.append(button);}this.inspector.append(row);
    }
  }
  private basicContent(component:ComponentConfig) {
    const definition=BasicComponentCatalog.find(entry=>entry.part===component.part);if(!definition)return;
    const update=(changes:unknown)=>this.safely(async()=>{await this.editInstances(this.t('编辑组件内容','Edit component content','内容を編集'),[{kind:'component.update',pageId:this.currentPage().id,componentId:component.id,changes:ComponentChangesSchema.parse(changes)}]);});
    for(const key of definition.contentKeys.filter(key=>!Object.hasOwn(component.content,key)&&!['text','labelKey','labelOverrideKey'].includes(key))){
      const initial=['value','min','max','step','minLength','maxLength'].includes(key)?0:'';
      this.field(this.t(`内容：${key}`,`Content: ${key}`,`内容：${key}`),initial,value=>void update({content:{[key]:typeof initial==='number'?Number(value):value}}),typeof initial==='number'?'number':'text');
    }
    const page=this.currentPage(),context=this.pageFieldContext();
    this.inspector.append(pageDataEditor(component,context,async changes=>{await this.editInstances(this.t('编辑组件数据','Edit component data','部品データを編集'),[{kind:'component.update',pageId:page.id,componentId:component.id,changes:ComponentChangesSchema.parse(changes)}]);}));
  }
  private displayText(component:ComponentConfig) {
    if(!componentTextEditable(component))return;
    const locale=this.previewLocale??this.snapshot?.project.languages.menuDefault??'zh-CN',key=String(component.content.labelKey??'');
    const original=String(component.content.text??this.template.locales[locale]?.[key]??officialLocaleResources()[locale as 'zh-CN'|'en'|'ja']?.strings[key]??this.template.locales['zh-CN']?.[key]??key);
    const override=componentTextOverride(component,this.template.locales,locale), label=this.t('显示文字','Display text','表示テキスト');
    const edit=(text:string|null)=>this.safely(async()=>{await this.editInstances(this.t('修改显示文字','Edit display text','表示テキストを編集'),[{kind:'component.text',pageId:this.currentPage().id,componentId:component.id,locale,text}]);});
    const input=this.field(`${label} · ${locale}`,override??original,value=>void edit(value));input.dataset.componentDisplayText=component.id;
    this.inspector.append(this.node('p',this.t(`只修改当前部件的 ${locale} 文案；其他语言保留默认。`,`Edit only this component in ${locale}; other languages keep their default labels.`,`この部品の ${locale} のみ編集します。他の言語は既定の表示を保持します。`),'designer-field-help'));
    const reset=this.action(this.t('恢复此语言默认文字','Restore default for this language','この言語の既定に戻す'),()=>edit(null));reset.disabled=override===undefined;this.inspector.append(reset);
  }
  private pageFieldContext() {
    return { t:this.t.bind(this), local:this.currentPage().localState??{}, pages:this.template.pages.map(item=>({value:item.key,label:this.pageLabel(item.key)})),
      variables:[...(this.snapshot?.variables??[]),...(this.snapshot?.scenes??[]).flatMap(item=>item.scene.locals.map(variable=>({...variable,sceneName:item.scene.name})))] };
  }
  private interactionInspector(component:ComponentConfig) {
    const page=this.currentPage(),context=this.pageFieldContext();
    this.inspector.append(pageInteractionEditor(component.interactions??[],context,async interactions=>{await this.editInstances(this.t('配置组件交互','Edit component interactions','操作を設定'),[{kind:'component.update',pageId:page.id,componentId:component.id,changes:{interactions}}]);}),pageLocalStateEditor(page.localState??{},context.t,async localState=>{await this.editInstances(this.t('配置局部状态','Edit local state','ローカル状態を編集'),[{kind:'page.update',pageId:page.id,localState}]);}));
  }
  private instanceTools() {
    const page=this.currentPage(), component=findComponent(this.template,[...this.selected][0]??''), controls=this.node('section','','designer-instance-tools');
    controls.ariaLabel=this.t('页面与组件操作','Page and component actions','ページと部品の操作');
    const add=this.node('details'),summary=this.node('summary',this.t('添加组件','Add component','部品を追加'));add.append(summary);
    for(const definition of BasicComponentCatalog){const button=this.action(this.basicName(definition.componentKind),()=>this.addBasic(definition.componentKind));button.dataset.addComponent=definition.componentKind;button.disabled=this.navigating;add.append(button);}
    controls.append(add);
    const create=this.node('details');create.append(this.node('summary',this.t('新建页面','New page','ページを追加')));
    const label=this.node('label',this.t('页面名称','Page name','ページ名')),title=this.node('input');title.placeholder=this.t('人物介绍','Character introduction','キャラクター紹介');label.append(title);
    const submit=this.action(this.t('创建空白页面','Create blank page','空白ページを作成'),()=>this.safely(async()=>{if(!title.value.trim()){title.focus();return;}const key=`page-${createId().slice(0,8)}`;await this.editInstances(this.t('新建页面','Create page','ページを作成'),[{kind:'page.create',key,title:title.value.trim()}]);await this.openPage(key,true);}));submit.disabled=this.navigating;create.append(label,submit);controls.append(create);
    controls.append(this.action(this.t('新建命名样式','New named style','名前付きスタイルを追加'),()=>this.styleEditor(undefined,true)));
    if(component&&component!==page.root){const actions=this.node('div','','designer-instance-action-row');
      actions.append(this.action(this.t('复制','Duplicate','複製'),()=>this.instanceOperation(this.t('复制组件','Duplicate component','部品を複製'),{kind:'component.duplicate',pageId:page.id,componentId:component.id})),this.action(this.t('删除','Delete','削除'),()=>this.instanceOperation(this.t('删除组件','Delete components','部品を削除'),{kind:'component.remove',pageId:page.id,componentIds:[...this.selected]})));
      for(const button of actions.querySelectorAll('button'))button.disabled=this.navigating||component.locked;controls.append(actions);
    }
    this.tree.append(controls);
  }
  private drawTree() {
    const reading=this.root.querySelector<HTMLElement>('[data-reading-actions]');if(reading)reading.hidden=this.page!=='story';
    this.tree.replaceChildren();
    this.instanceTools();
    if (this.tree.dataset.workbench !== 'true') { this.tree.append(this.node('h2', '一级页面')); for (const page of this.template.pages) { const button = this.action(this.template.locales[this.locale]?.[`page.${page.key}`] ?? page.key,
      async () => { await this.openPage(page.key, true); });
      button.dataset.designerPage=page.key;button.ariaPressed = String(page.key === this.page); this.tree.append(button); } }
    if (this.tree.dataset.workbench !== 'true') { this.tree.append(this.node('h2', '页面组件'));
    for (const component of components(this.currentPage().root)) { const button = this.action(`${component.locked ? '🔒 ' : ''}${this.componentLabel(component)}`, () => {
      this.selected = new Set([component.id]); this.drawTree(); this.drawInspector(); this.selectionBounds(); });
      button.ariaPressed = String(this.selected.has(component.id)); this.tree.append(button); } }
    if (this.pluginComponents.length) {
      this.tree.append(this.node('h2', this.t('插件组件', 'Plugin components', 'プラグイン部品')));
      for (const definition of pluginComponentCatalog(this.pluginComponents)) {
        const add = this.action(this.t(`添加 ${definition.componentKey}`, `Add ${definition.componentKey}`, `${definition.componentKey}を追加`), () => this.safely(async () => {
          const page = this.currentPage(), parent = findComponent(this.template, [...this.selected][0] ?? '') ?? page.root;
          const inserted = insertPluginComponent(this.template, page.id, parent.id, definition);
          await this.apply(templateEdit(this.documents, inserted.template, this.t('添加插件组件', 'Add plugin component', 'プラグイン部品を追加')));
          this.selected = new Set([inserted.componentId]); this.drawTree(); this.drawInspector();
        })); add.disabled=this.navigating; this.tree.append(add);
      }
    }
  }
  private field(label: string, value: string | number, commit: (value: string) => void, type = 'text') {
    const key=this.fieldInputKey(label),retained=this.fieldInputDrafts[key];
    label = designerText(label, this.locale); const field = this.node('label', label), input = this.node('input'); input.type = type; input.value = String(value); input.ariaLabel = label; input.placeholder = formHint(this.locale, label, type);
    if(retained?.value===String(value))delete this.fieldInputDrafts[key];
    else if(retained?.baseline===String(value))input.value=retained.value;
    input.dataset.localHistory = String(input.value !== String(value));
    input.oninput=()=>{input.dataset.localHistory = String(input.value !== String(value));if(input.value===String(value))delete this.fieldInputDrafts[key];else this.fieldInputDrafts[key]={baseline:String(value),value:input.value};this.draftChanged?.();};
    input.onchange = () => { input.dataset.localHistory = 'false'; commit(input.value); }; field.append(input); this.inspector.append(field); return input;
  }
  private fieldInputKey(label:string){return `${this.page}:${[...this.selected].sort().join(',')}:${this.state}:${label}`;}
  private fieldDraft(run: (next: RuntimeTemplate) => void) {
    const next = structuredClone(this.template); run(next); this.fieldPreview = true; void this.preview(next);
  }
  private async commitField(run: (next: RuntimeTemplate) => void) {
    return this.queueEdit(async () => {
    const next = structuredClone(this.template); run(next);
    await this.apply(templateEdit(this.documents, RuntimeTemplateSchema.parse(next), this.t('修改页面公开属性','Edit page properties','ページのプロパティを編集')));
    });
  }
  private colorField(label: string, value: string, commit: (value: string) => void | Promise<void>, draft?: (value: string) => void) {
    if (!draft) { const mount=this.node('div'),root=createRoot(mount);this.inspector.append(mount);this.colorProperties.push(root);root.render(createElement(ColorAlpha,{label:designerText(label,this.locale),value,locale:this.locale,onChange:commit}));return; }
    const mount = this.node('div', '', 'designer-color-field'); this.inspector.append(mount);
    mount.setAttribute('role','group');mount.setAttribute('aria-label',designerText(label,this.locale));
    mount.append(this.node('span', designerText(label, this.locale)));
    const control = this.node('div'); mount.append(control);
    const field = createRoot(control); this.colorProperties.push(field);
    const key=this.fieldInputKey(label),initialColor=colorAlphaValue(value),retained=this.fieldInputDrafts[key];
    field.render(createElement(StudioColorField, { inputDraft:retained?.baseline===initialColor?retained.color:null,onInputDraftChange:next=>{if(next)this.fieldInputDrafts[key]={baseline:initialColor,value:next.text,color:next};else if(!this.fieldInputDrafts[key]||this.fieldInputDrafts[key]!.baseline===initialColor)delete this.fieldInputDrafts[key];this.draftChanged?.();},value: initialColor, locale: this.locale, allowAlpha: true, onPreview: next => draft?.(next), onCommit: commit, onSession: active => { if (!active && this.fieldPreview) { this.fieldPreview = false; void this.preview(); } } }));
  }
  private numberField(label: string, value: number, unit: string, run: (next: RuntimeTemplate, value: number) => void, options: { min?: number; max?: number; step?: number } = {}) {
    const key=this.fieldInputKey(label),retained=this.fieldInputDrafts[key];
    let editor = this.numberEditors.get(key);
    if (!editor) { const mount = this.node('div'); editor = { mount, root: createRoot(mount) }; this.numberEditors.set(key, editor); }
    const { mount, root } = editor; this.renderedNumberFields.add(key); this.inspector.append(mount);
    root.render(createElement(StudioNumberField, { label: designerText(label, this.locale), value, unit, step: options.step ?? 1, min: options.min, max: options.max, locale: this.locale,
      inputDraft:retained?.baseline===String(value)?retained.number:null,onInputDraftChange:next=>{if(next)this.fieldInputDrafts[key]={baseline:String(value),value:next.raw,number:next};else delete this.fieldInputDrafts[key];this.draftChanged?.();},
      onPreview: (next: number) => this.fieldDraft(template => run(template, next)), onCommit: (next: number) => this.commitField(template => run(template, next)) }));
  }
  private inspectorGroup(key: string, label: string, draw: () => void, collapsed = false) {
    const marker = document.createComment(key); this.inspector.append(marker); draw();
    const group = this.node(collapsed ? 'details' : 'section', '', 'designer-property-group'); group.dataset.propertyGroup = key;
    group.append(this.node(collapsed ? 'summary' : 'h3', label));
    while (marker.nextSibling) group.append(marker.nextSibling);
    marker.replaceWith(group);
    if (group instanceof HTMLDetailsElement) { group.open = this.inspectorGroups.has(key); group.ontoggle = () => { if (group.isConnected) group.open ? this.inspectorGroups.add(key) : this.inspectorGroups.delete(key); }; }
  }
  private drawInspector(focus = captureAuthoringFocus(this.inspector)) {
    this.renderedNumberFields.clear();
    this.renderInspector();
    for (const [key, editor] of this.numberEditors) if (!this.renderedNumberFields.has(key)) { editor.root.unmount(); this.numberEditors.delete(key); }
    if (document.activeElement === document.body) { markAuthoringFocus(this.inspector); restoreAuthoringFocus(this.inspector, focus); }
    requestAnimationFrame(() => requestAnimationFrame(() => { if (this.disposed || document.activeElement !== document.body) return; markAuthoringFocus(this.inspector); restoreAuthoringFocus(this.inspector, focus); }));
  }
  private renderInspector() {
    this.fieldPreview = false;
    for (const root of this.colorProperties) root.unmount(); this.colorProperties = [];
    if(this.galleryEditor){this.galleryEditor.draw();return;}
    if(this.templateWorkspace&&!this.templateWorkspace.node.hidden){this.inspector.replaceChildren(this.node('h2','作品模板'),this.node('p',this.t('在中央选择模板、审阅影响并选择保留项。关闭后继续编辑当前页面。','Choose a template, review its impact and retain settings in the document area. Close to resume page editing.','中央でテンプレート・影響・保持項目を確認します。閉じるとページ編集に戻ります。')));return;}

    this.pluginProperties?.unmount(); this.pluginProperties = null;
    this.backgroundRelease?.();this.backgroundRelease=null;
    const batchPortraits = this.root.querySelector<HTMLButtonElement>('[data-portrait-batch]');
    if (batchPortraits) batchPortraits.disabled = this.navigating || !components(this.template.pages.find(page => page.key === 'story')!.root).some(item => item.part === 'story.readingPanel' && item.content.portrait === true);
    delete this.inspector.dataset.componentId;
    this.inspector.replaceChildren(this.node('small', `${this.pageLabel(this.page)} · ${designerText({normal:'普通',hover:'悬浮',pressed:'按下',focus:'焦点',disabled:'禁用',selected:'选中',locked:'业务锁定',empty:'空槽'}[this.state],this.locale)}`));
    const styleToggle=this.root.querySelector<HTMLButtonElement>('[data-style-toggle]');if(styleToggle)styleToggle.disabled=this.navigating;
    if(this.navigating){this.inspector.append(this.node('h2',this.t('导航预览','Navigation preview','ナビゲーションプレビュー')),this.node('p',this.t('正在体验真实 Player 页面。返回设计后可以修改属性。','Previewing the real Player page. Return to Design to edit properties.','実際の Player ページを表示中。属性の編集はデザインに戻って行います。')));return;}

    if (this.page === 'characters') {
      const mount = this.node('div'), root = createRoot(mount); this.inspector.append(mount); this.colorProperties.push(root);
      const assets: Asset[] = this.documents.flatMap(doc => Object.entries(doc.files).filter(([path]) => path === 'assets/index.json').flatMap(([, text]) => JSON.parse(text).data.assets));
      const entries = this.documents.flatMap(doc => Object.entries(doc.files).filter(([path]) => /^characters\/[^/]+\.json$/.test(path)).map(([, text]) => ({ doc, character: CharacterSchema.parse(JSON.parse(text).data) })));
      root.render(createElement(AfterstoryLayoutEditor, { characters: entries.map(item => item.character), assets, resources: this.services.runtimeAssets, locale: this.locale,
        selectedId: this.afterstorySelection, select: (id: Id) => { this.afterstorySelection = id; },
        commit: async (values: { characterId: Id; presentation: NonNullable<NonNullable<Character['afterstory']>['presentation']> }[]) => {
          const changed = values.map(value => { const item = entries.find(item => item.character.id === value.characterId)!;
            const next = CharacterSchema.parse({ ...item.character, afterstory: { ...item.character.afterstory!, presentation: value.presentation } });
            return { item, next }; });
          await this.apply({ label: this.t('调整后日谈角色排列与取景', 'Edit afterstory order and framing', '後日談の順序と構図を編集'), origin: 'field',
            expected: changed.map(({ item }) => ({ ref: { kind: 'document' as const, id: item.doc.documentId }, revision: item.doc.revision })),
            patches: changed.map(({ item, next }) => ({ kind: 'json' as const, documentId: item.doc.documentId, changes: [{ path: '/data/afterstory/presentation', op: 'set' as const, before: item.character.afterstory!.presentation ?? null, after: next.afterstory!.presentation! }] })),
            preparedAssets: [], requiredRefs: values.map(value => ({ kind: 'asset' as const, id: value.presentation.figure.assetId })) });
        } }));
    }
    const component = findComponent(this.template, [...this.selected][0] ?? '');
    if (!component) {
      this.inspector.append(this.node('h2', '页面背景'));
      this.inspectorGroup('background',this.t('背景与图片','Background & image','背景と画像'),()=>{
      const background = this.currentPage().background;
      const page = this.page;
      const backgroundColor = (next:RuntimeTemplate,value:string) => {const target=next.pages.find(p=>p.key===page)!.background;target.color=value.slice(0,7);target.colorOpacity=parseInt(value.slice(7)||'ff',16)/255;};
      this.colorField('底色', colorAlphaValue(background.color, background.colorOpacity), value => this.commitField(next=>backgroundColor(next,value)),value=>this.fieldDraft(next=>backgroundColor(next,value)));
      for (const [key, label] of [['imageOpacity','图片透明度']] as const)
        this.numberField(label,background[key],'', (next,value)=>{next.pages.find(p=>p.key===page)!.background[key]=value;},{min:0,max:1,step:.05});
      const card=this.node('section','','designer-background-card'), image=this.node('img'),caption=this.node('p',background.imageId?'载入背景预览':'未设置背景图片');
      image.alt=designerText('页面背景',this.locale);image.hidden=true;card.append(image,caption);
      if(background.imageId)void this.backgroundPreview(background.imageId,image,caption);
      const choose=this.iconAction(background.imageId?'更换背景图片':'选择背景素材','M3 3h18v18H3ZM3 16l6-6 5 5 3-3 4 4M16 7h.01',()=>this.pickImage('页面背景',background.imageId,null,choose,choice=>this.pickerChange(next=>{next.pages.find(p=>p.key===this.page)!.background.imageId=choice.assetId;})));
      const clear=this.iconAction('清除背景图片','M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',()=>this.change(next=>{next.pages.find(p=>p.key===this.page)!.background.imageId=null;}));clear.disabled=!background.imageId;
      card.append(choose,clear);this.inspector.append(card);
      });
      this.inspectorGroup('page-animation',this.t('页面切换','Page transitions','ページ切替'),()=>this.animationInspector(this.currentPage().root),true);
    } else {
      this.inspector.dataset.componentId = component.id;
      this.inspector.append(this.node('h2', this.selected.size>1?this.t(`已选 ${this.selected.size} 个组件`,`${this.selected.size} components selected`,`${this.selected.size} 個のコンポーネントを選択`):this.componentLabel(component)));
      if(this.selected.size===1)this.inspector.append(this.action(this.t('交给当前协作','Hand off to current collaboration','現在のコラボレーションに引き継ぐ'),()=>this.safely(async()=>{
        const handoff=this.services.bridge.collaboration?.handoffTarget;if(!handoff)throw new Error(this.t('请先创建或连接当前作品的协作。','Create or connect a collaboration for this work first.','先にこの作品のコラボレーションを作成または接続してください。'));
        const page=this.currentPage(),document=this.documents.find(document=>`ui/pages/${page.id}.json`in document.files);
        if(!document)throw new Error('PAGE_DOCUMENT_MISSING');
        const result=await handoff({target:{ref:{kind:'component',id:component.id},source:{documentId:document.documentId,revision:document.revision}}});
        if(!result.ok)throw new Error(result.error.message);this.notice.textContent=this.t('已固定交接这个组件与所读版本。','Handed off this component and its read version.','このコンポーネントと読み取りバージョンを固定して引き継ぎました。');
      })));
      if(this.selected.size>1)this.inspector.append(this.node('p',this.t(`当前属性：${this.componentLabel(component)}；左对齐作用于所选未锁定组件。`,`Properties: ${this.componentLabel(component)}; Align left affects the unlocked selection.`,`プロパティ：${this.componentLabel(component)}。左揃えは選択した未ロック部品に適用。`),'designer-selection-summary'));
      if(component.plugin||component.part.startsWith('basic.')||Object.keys(component.content).length)this.inspectorGroup('content',this.t('内容','Content','内容'),()=>{
      if (component.plugin) {
        const definition = this.pluginComponents.find(item => item.key === component.plugin!.key);
        if (definition) {
          const mount = this.node('div'); this.inspector.append(mount); this.pluginProperties = createRoot(mount);
          this.pluginProperties.render(createElement(PluginComponentProperties, { definition, initial: component.plugin.props, locale: this.locale, references: pluginReferencesFromDocuments(this.documents), apply: async value => {
            try { const next = structuredClone(this.template); findComponent(next, component.id)!.plugin!.props = value; await this.apply(templateEdit(this.documents, next, this.t('编辑插件组件属性', 'Edit plugin component properties', 'プラグイン部品のプロパティを編集'))); return { ok: true as const, value: undefined, warnings: [] }; }
            catch (error) { const issue = { code: 'PLUGIN_COMPONENT_EDIT', severity: 'error' as const, owner: 'M01' as const, message: String(error), related: [], actions: [] }; return { ok: false as const, error: issue, issues: [issue] }; }
          } }));
        } else this.inspector.append(this.node('p', this.t('插件组件提供者不可用，配置已保留。', 'The component provider is unavailable; its configuration is preserved.', '部品の提供元を利用できません。設定は保持されています。')));
      }
      this.displayText(component);
      for (const [key, value] of Object.entries(component.content).filter(([key])=>!['labelKey','labelOverrideKey',...(componentTextEditable(component)?['text']:[])].includes(key)).filter(([key])=>component.part!=='story.readingPanel'||!['portrait','nameAbove','gradient','portraitWidth','nvlPadding','nvlScrimOpacity','nvlLineHeight','nvlScrimColor','nvlParagraphGap','nvlNameColor','nvlNameBold'].includes(key))) if (['string','number','boolean'].includes(typeof value))
        this.field(({labelKey:this.t('标签语言键','Label translation key','ラベルの翻訳キー'),text:this.t('显示文字','Display text','表示テキスト'),title:this.t('标题','Title','タイトル'),placeholder:this.t('输入提示','Input hint','入力ヒント')} as Record<string,string>)[key]??this.t(`内容：${key}`,`Content: ${key}`,`内容：${key}`), String(value), text => void this.change(next=>{const c=findComponent(next,component.id)!;c.content[key] = typeof value === 'number' ? Number(text) : typeof value === 'boolean' ? text === 'true' : text;}));
      this.basicContent(component);
      });
      const update = (run: (c: ComponentConfig, next: RuntimeTemplate) => void) => void this.change(next => run(findComponent(next, component.id)!, next));
      if (this.page === 'story' && ['story.readingPanel','story.bodyText'].includes(component.part)) this.inspectorGroup('reading-styles',this.t('阅读状态样式','Reading state styles','既読・未読のスタイル'),()=>{
        const mount=this.node('div'),root=createRoot(mount);this.inspector.append(mount);this.colorProperties.push(root);
        const all=components(this.currentPage().root),body=all.find(item=>item.part==='story.bodyText'),panel=all.find(item=>item.part==='story.readingPanel');
        const normalColor=body?.normal.color&&body.normal.color!=='inherit'?body.normal.color:panel?.normal.color??this.template.defaultVisual.color;
        const base={...this.template.defaultVisual,...panel?.normal,...body?.normal,color:colorAlphaValue(normalColor),background:panel?.normal.background??this.template.defaultVisual.background};
        const fonts:Asset[]=this.documents.flatMap(doc=>Object.entries(doc.files).filter(([path])=>path==='assets/index.json').flatMap(([,raw])=>JSON.parse(raw).data.assets)).filter((asset:Asset)=>asset.kind==='font');
        root.render(createElement(ReadingStylesEditor,{value:this.template.readingStyles,base,fonts:fonts.map(font=>({id:font.id,name:font.name,family:JSON.stringify(previewFontFamily(font.id,font.activeVariantId))})),locale:this.locale,
          commit:value=>this.queueEdit(async()=>{const next=structuredClone(this.template);if(Object.keys(value).length)next.readingStyles=value;else delete next.readingStyles;await this.apply(templateEdit(this.documents,next,this.t('修改阅读状态样式','Edit reading state styles','既読・未読のスタイルを変更')));})}));
      });
      this.inspectorGroup('layout',this.t('布局','Layout','レイアウト'),()=>{
      this.instanceLayout(component);
      for (const [key, label] of [['visible','显示'],['locked','锁定']] as const) {
        const input = this.field(label, '', value => {}, 'checkbox'); input.checked = component[key]; input.onchange = () => update(c => { c[key] = input.checked; }); }
      const dimensionsMarker=document.createComment('dimensions');this.inspector.append(dimensionsMarker);
      for (const key of ['x','y','width','height'] as const) {
        const length = component.layout[key],label=designerText({ x: '水平位置', y: '垂直位置', width: '宽度', height: '高度' }[key], this.locale);
        if(length.unit==='auto'){this.field(`${label} (auto)`,'',value=>update(c=>{c.layout[key]={unit:'px',value:Number(value)};}),'number');continue;}
        this.numberField(label,length.value,length.unit==='percent'?'%':length.unit,
          (next,value)=>{const c=findComponent(next,component.id)!;if(key==='x'||key==='y')c.layout.position='free';c.layout[key]={unit:length.unit,value};}); }
      const dimensions=this.node('div','','designer-dimensions');while(dimensionsMarker.nextSibling)dimensions.append(dimensionsMarker.nextSibling);dimensionsMarker.replaceWith(dimensions);
      this.inspector.append(this.node('p',this.t('拖动标签调整 · Enter 确认 · Esc 还原','Drag labels to adjust · Enter applies · Esc restores','ラベルをドラッグで調整 · Enterで確定 · Escで元に戻す'),'designer-field-help'));
      this.field('层级', component.layout.z, value => update(c => { c.layout.z = Number(value); }), 'number');
      if (this.selected.size > 1) this.inspector.append(this.action('左对齐', () => this.change(next => {for (const id of this.selected) { const c = findComponent(next, id); if (c && !c.locked) c.layout.x = structuredClone(component.layout.x); }})));
      });
      const state=this.state;
      const visual = this.state === 'normal' ? component.normal : component.states[this.state] ?? {};
      this.inspectorGroup('appearance',this.t('外观','Appearance','外観'),()=>{
      this.selectField(this.t('文字对齐','Text alignment','文字揃え'),[{value:'start',label:this.t('靠前','Start','開始')},{value:'center',label:this.t('居中','Center','中央')},{value:'end',label:this.t('靠后','End','終了')}],visual.textAlign??component.normal.textAlign??this.template.defaultVisual.textAlign,value=>update(c=>{const target=state==='normal'?c.normal:c.states[state]??={};target.textAlign=value as Visual['textAlign'];}));
      const wrap=this.field(this.t('文字换行','Wrap text','テキストの折り返し'),'',()=>{},'checkbox');wrap.checked=visual.wrap??component.normal.wrap??this.template.defaultVisual.wrap;wrap.onchange=()=>update(c=>{const target=state==='normal'?c.normal:c.states[state]??={};target.wrap=wrap.checked;});
      const appearanceBackground=visual.background??component.normal.background??this.template.defaultVisual.background;
      this.colorField(this.t('背景颜色','Background color','背景色'),colorAlphaValue(appearanceBackground.color,appearanceBackground.colorOpacity),value=>update(c=>{const target=state==='normal'?c.normal:c.states[state]??={};target.background={...appearanceBackground,color:value.slice(0,7),colorOpacity:parseInt(value.slice(7)||'ff',16)/255};}));
      for (const [key, label, type] of [['color','文字颜色','color'], ['fontSize','字号','number'], ['opacity','不透明度','number'], ['radius','圆角','number'], ['lineHeight','行高','number']] as const) {
        const edit = (next:RuntimeTemplate,value:string) => {const c=findComponent(next,component.id)!;
          const target = state === 'normal' ? c.normal : c.states[state] ??= {};
          (target as Record<string, unknown>)[key] = type === 'number' ? Number(value) : value;
        };
        const value = visual[key] ?? component.normal[key] ?? this.template.defaultVisual[key];
        if (type === 'color') this.colorField(label, String(value), value=>this.commitField(next=>edit(next,value)),value=>this.fieldDraft(next=>edit(next,value))); else this.field(label, value, value=>update((c,next)=>edit(next,value)), type);
      }
      if(component.part==='story.readingPanel') {
        this.inspector.append(this.node('p',this.t('透明度仅作用于姓名、正文与工具栏的共同背景。','Opacity affects the shared background only.','不透明度は共有背景のみに適用されます。')));
        for(const [key,label] of [['portrait',this.t('显示头像槽','Portrait slot','ポートレート枠')],['nameAbove',this.t('姓名放在上沿','Name above panel','名前を枠の上へ')],['gradient',this.t('顶部渐隐','Fade at top','上端をグラデーション')]] as const) {
          const input=this.field(label,'',()=>{},'checkbox');input.checked=component.content[key]===true;input.onchange=()=>update(c=>{c.content[key]=input.checked;});
        }
        this.field(this.t('头像宽度','Portrait width','ポートレート幅'),Number(component.content.portraitWidth??220),value=>update(c=>{c.content.portraitWidth=Math.max(80,Number(value));}),'number');
        for(const [key,label,initial,min,max] of [
          ['nvlPadding',this.t('NVL 文字区内边距','NVL reading padding','NVL本文の余白'),72,0,400],
          ['nvlScrimOpacity',this.t('NVL 暗罩不透明度','NVL scrim opacity','NVL暗幕の不透明度'),.65,0,1],
          ['nvlLineHeight',this.t('NVL 行距','NVL line height','NVL行間'),1.8,1,4],
          ['nvlParagraphGap',this.t('NVL 段落间距','NVL paragraph gap','NVL段落間隔'),16,0,200],
        ] as const) { const input=this.field(label,Number(component.content[key]??initial),value=>update(c=>{c.content[key]=Math.max(min,Math.min(max,Number(value)));}),'number');input.min=String(min);input.max=String(max);input.step=key==='nvlPadding'?'1':'.05'; }
        this.colorField(this.t('NVL 暗罩颜色','NVL scrim color','NVL暗幕色'),String(component.content.nvlScrimColor??'#000000'),value=>update(c=>{c.content.nvlScrimColor=value;}));
        this.colorField(this.t('NVL 姓名颜色','NVL speaker color','NVL話者名の色'),String(component.content.nvlNameColor??'#ffffff'),value=>update(c=>{c.content.nvlNameColor=value;}));
        const nameBold=this.field(this.t('NVL 姓名粗体','NVL bold speaker','NVL話者名を太字'),'',()=>{},'checkbox');nameBold.checked=component.content.nvlNameBold!==false;nameBold.onchange=()=>update(c=>{c.content.nvlNameBold=nameBold.checked;});
        const bg=component.normal.background??this.template.defaultVisual.background;
        this.colorField(this.t('共同背景颜色','Shared background color','共有背景色'),colorAlphaValue(bg.color,bg.colorOpacity),value=>update(c=>{c.normal.background={...bg,color:value.slice(0,7),colorOpacity:parseInt(value.slice(7),16)/255};}));
        for(const side of ['top','right','bottom','left'] as const)this.field(this.t('内边距','Padding','余白')+' '+side,component.layout.padding[side],value=>update(c=>{c.layout.padding[side]=Math.max(0,Number(value));}),'number');
      }
      this.inspector.append(this.action('恢复当前状态', () => this.change(next => { const c = findComponent(next, component.id)!;
        if (this.state === 'normal') c.normal = {}; else delete c.states[this.state]; })));
      });
      this.inspectorGroup('component-animation',this.t('动画与切换','Animation & transitions','アニメーションと切替'),()=>this.animationInspector(component),true);
      this.inspectorGroup('interaction',this.t('交互','Interaction','インタラクション'),()=>this.interactionInspector(component),true);
      this.inspectorGroup('details',this.t('图片槽与属性来源','Image slots & sources','画像スロットとプロパティの出典'),()=>{
      const identity = this.node('details'); identity.append(this.node('summary', '组件详情'), this.node('code', component.part),this.node('code',component.id)); this.inspector.append(identity);
      this.inspector.append(this.node('p', '继承顺序：模板 → 组件 → 命名样式 → 当前状态 → 玩家偏好。'));
      const origins=this.node('details','','designer-property-sources');origins.append(this.node('summary','属性来源'));this.inspector.append(origins);
      origins.addEventListener('toggle',()=>{if(!origins.open)return;origins.querySelector('.designer-property-source-body')?.remove();
        const element = this.surface.querySelector<HTMLElement>(`[data-gc-component="${component.id}"]`);
        const computed = element ? getComputedStyle(element) : null;
        const sources = this.template.styles.filter(style => style.scope.pageId === this.currentPage().id &&
          (style.scope.componentId === null || style.scope.componentId === component.id)).map(style => style.sourcePath);
        const dialog=this.node('div','','designer-property-source-body');origins.append(dialog);
        for (const key of ['color','fontSize','opacity','radius','lineHeight'] as const) {
          const value = computed?.getPropertyValue(({fontSize:'font-size',radius:'border-radius',lineHeight:'line-height'} as Record<string,string>)[key] ?? key);
          dialog.append(codeBlock(JSON.stringify(explainVisual(this.template, component.id, key, this.state, undefined, value), null, 2), 'json', this.locale));
        }
        dialog.append(this.node('p', sources.join('\n')));
        if(computed)dialog.append(codeBlock(JSON.stringify({layout:component.layout,effective:{position:computed.position,left:computed.left,top:computed.top,width:computed.width,height:computed.height,display:computed.display,gap:computed.gap,transform:computed.transform,zIndex:computed.zIndex}},null,2),'json',this.locale));
        for(const style of this.template.styles.filter(style=>style.scope.pageId===this.currentPage().id&&(style.scope.componentId===null||style.scope.componentId===component.id)))dialog.append(this.action(this.t(`定位样式：${style.name}`,`Open style: ${style.name}`,`スタイルを開く：${style.name}`),()=>this.styleEditor(style.id)));
      });
      const images = visual.images ?? component.normal.images ?? {};
      const imageSlots=componentDefinition(component.part)?.imageSlots??[];
      const slotPicker=this.node('select');slotPicker.ariaLabel=this.t('图片槽','Image slot','画像スロット');
      const slotLabels:Record<string,string>={icon:this.t('图标','Icon','アイコン'),frame:this.t('边框','Frame','枠'),decoration:this.t('图片 / 装饰','Image / decoration','画像 / 装飾')};
      for(const slot of imageSlots){const option=this.node('option',slotLabels[slot]);option.value=slot;slotPicker.append(option);}
      const chooseImage=this.action('设置图片槽',()=>{const current=images[slotPicker.value];return this.pickImage('设置图片槽',current?.assetId??null,current?.variantId??null,chooseImage,choice=>this.pickerChange(next=>{const c=findComponent(next,component.id)!;
          const target = this.state === 'normal' ? c.normal : c.states[this.state] ??= {};
          (target.images ??= {})[slotPicker.value] = { assetId:choice.assetId, variantId:choice.variantId??choice.asset.activeVariantId, mode: 'contain', positionX: .5, positionY: .5,
            colorMode: 'original', tint: null, opacity: 1, slices: null, borders: null, fillCenter: false };
        }));});
      if(imageSlots.length){
        const presets=this.action(this.t('常用图标','Common icons','よく使うアイコン'),async()=>{const assets=this.services.bridge.assets;if(!assets){this.notice.textContent=this.t('当前宿主未提供素材服务','Asset services are unavailable','素材サービスを利用できません');return;}const result=await assets.iconPresets();if(!result.ok){this.notice.textContent=result.error.message;return;}
          openActionIconPicker({root:this.root,presets:result.value,locale:this.locale,origin:presets,select:async key=>{const imported=await assets.importIconPreset({key,componentId:component.id,state:this.state});if(!imported.ok)throw new Error(imported.error.message);
            if(!imported.value)return;

            await this.reload();await this.changed(imported.value);this.drawTree();this.drawInspector();await this.preview();}});
        });
        const updateSource=()=>{presets.hidden=slotPicker.value!=='icon';chooseImage.textContent=this.t('作品图片','Project images','作品の画像');};slotPicker.onchange=updateSource;updateSource();
        this.inspector.append(slotPicker,presets,chooseImage);
        const inheritedState=this.state;if(inheritedState!=='normal'&&Object.hasOwn(component.states[inheritedState]?.images??{},'icon'))this.inspector.append(this.action(this.t('图标恢复继承','Inherit normal icon','通常のアイコンを継承'),()=>update(c=>{delete c.states[inheritedState]!.images!.icon;})));
      }
      for (const [slot, binding] of Object.entries(images)) {
        if (!binding) continue;
        const mode = this.node('select'); const slotName=slotLabels[slot]??slot; mode.ariaLabel = `${slotName} · ${this.t('图像适配','Image fit','画像のフィット')}`;
        for (const value of (slot==='frame'?['contain','cover','native','nineSlice']:['contain','cover','native'])) { const option = this.node('option',({contain:this.t('完整显示','Contain','全体表示'),cover:this.t('填满裁剪','Cover','覆う'),native:this.t('原始大小','Original size','原寸'),nineSlice:this.t('九宫格','Nine slice','9スライス')} as Record<string,string>)[value]); option.value = value; mode.append(option); }
        mode.value = binding.mode;
        const editImage = (run: (image: NonNullable<typeof binding>) => void) => update(c => {
          const target = this.state === 'normal' ? c.normal : c.states[this.state] ??= {};
          target.images = { ...images, ...target.images }; const image = target.images[slot] = structuredClone(target.images[slot]!); run(image);
        });
        mode.onchange = () => editImage(image => { image.mode = mode.value as typeof image.mode;
          if (image.mode === 'nineSlice') { image.slices ??= { top: 8, right: 8, bottom: 8, left: 8 }; image.borders ??= structuredClone(image.slices);image.fillCenter=true; }else{image.slices=null;image.borders=null;image.fillCenter=false;}
        }); this.inspector.append(mode);
        this.field(`${slotName} · ${this.t('不透明度','Opacity','不透明度')}`, binding.opacity, value => editImage(image => { image.opacity = Number(value); }), 'number');
        if (binding.mode === 'nineSlice') for (const side of ['top','right','bottom','left'] as const) {
          const label=({top:this.t('上','Top','上'),right:this.t('右','Right','右'),bottom:this.t('下','Bottom','下'),left:this.t('左','Left','左')})[side];
          const slice=this.field(`${slotName} · ${label} · ${this.t('源图切线','Source slice','元画像のスライス')}`,binding.slices?.[side]??0,value=>editImage(image=>{image.slices![side]=Number(value);}), 'number');
          slice.min='0';slice.placeholder=this.t('距源图边缘的像素数；SVG 使用 viewBox 单位','Pixels from the source edge; SVG uses viewBox units','元画像の端からの px。SVG は viewBox 単位');
          const border=this.field(`${slotName} · ${label} · ${this.t('显示边厚','Display border','表示の縁幅')}`,binding.borders?.[side]??0,value=>editImage(image=>{image.borders![side]=Number(value);}), 'number');
          border.min='0';border.placeholder=this.t('设计像素；随舞台等比缩放','Design pixels; scales with the stage','デザイン px。舞台に合わせて拡縮');
        }
        this.inspector.append(this.action('清除图片槽', () => update(c => {
          const target = this.state === 'normal' ? c.normal : c.states[this.state] ??= {}; target.images = { ...images }; target.images[slot] = null;
        })));
      }
      },true);
    }
    this.inspector.append(this.iconAction('CSS / SCSS','m8 6-6 6 6 6M16 6l6 6-6 6m-3-16-2 20', () => this.styleEditor()));
  }
  openGalleryContent() {
    this.galleryEditor?.root.remove();this.player?.dispose();this.player=null;this.canvas.hidden=true;this.root.querySelector<HTMLElement>('.designer-toolbar')?.setAttribute('hidden','');
    this.galleryEditor=new GalleryContent({services:this.services,documents:()=>this.documents,inspector:this.inspector,locale:this.locale,apply:async edit=>{await this.apply(edit);},save:()=>this.saveDocument?.()??Promise.resolve(),locate:source=>this.locateSource?.(source),origin:()=>this.galleryOrigin?.()??null,close:()=>{this.galleryEditor?.root.remove();this.galleryEditor=null;this.canvas.hidden=false;this.root.querySelector<HTMLElement>('.designer-toolbar')?.removeAttribute('hidden');this.drawInspector();void this.preview();}});
    this.root.querySelector('.designer-center')?.append(this.galleryEditor.root);
  }
  private openAnimations(target?:{componentId:Id;event:UIAnimationBinding}) {
    if(this.animationManagerRoot){if(this.animationManagerHost)this.animationManagerHost.hidden=false;this.animationManager.current?.open(target);return;}
    const host=this.node('section','','designer-animation-document');this.animationManagerHost=host;
    const root=createRoot(host);this.animationManagerRoot=root;this.canvas.hidden=true;
    this.root.querySelector('.designer-center')?.append(host);
    const resume=this.animationResume;this.animationResume=null;
    const close=()=>this.discardAnimationDraft();
    const draw=()=>root.render(createElement(UIAnimationManager,{ref:this.animationManager,template:this.template,locale:this.locale,target,resume,close,onDraftChange:()=>this.draftChanged?.(),apply:async(next,label)=>{
      await this.apply(templateEdit(this.documents,next,label));draw();
    }}));draw();
  }
  private animationInspector(component:ComponentConfig) {
    const root=component.id===this.currentPage().root.id;
    this.inspector.append(this.node('h3',this.t('界面动画','Interface animations','UIアニメーション')));
    if(root)this.inspector.append(this.action(this.t('应用基础淡变','Apply basic fades','基本フェードを適用'),()=>this.change(next=>applyBasicPageAnimations(next,[this.currentPage().id]))));
    const names={enter:this.t('进入','Enter','入る'),exit:this.t('退出','Exit','出る'),show:this.t('显示','Show','表示'),hide:this.t('隐藏','Hide','非表示'),hover:this.t('悬停','Hover','ホバー'),focus:this.t('焦点','Focus','フォーカス'),pressed:this.t('按下','Press','押す')};
    for(const binding of (root?['enter','exit']:['show','hide','hover','focus','pressed']) as UIAnimationBinding[]){
      const label=this.node('label',names[binding]),select=this.node('select');select.ariaLabel=names[binding];
      const none=this.node('option',this.t('无动画','None','なし'));none.value='';select.append(none);
      for(const animation of this.template.animations){const option=this.node('option',animation.name);option.value=animation.id;select.append(option);}
      select.value=component.animations[binding]??'';select.disabled=this.changing;select.onchange=()=>void this.change(next=>{const target=findComponent(next,component.id)!;if(select.value)target.animations[binding]=select.value;else delete target.animations[binding];});
      label.append(select);this.inspector.append(label,this.action(this.t('创建或编辑动画','Create or edit animation','作成・編集'),()=>this.openAnimations({componentId:component.id,event:binding})));
    }
    if(root)for(const [direction,label] of [['enter','播放进入'],['exit','播放退出'],['roundtrip','预览往返']] as const){const button=this.action(label,()=>this.player?.view.previewPageAnimation(direction));button.dataset.previewAnimation=direction;button.disabled=this.surface.dataset.previewStatus!=='ready';this.inspector.append(button);}
  }
  private async move(dx: number, dy: number) {
    const scale = this.snapshot!.project.canvas.width / this.surface.getBoundingClientRect().width;
    const all = components(this.currentPage().root);
    const selected = [...this.selected].filter(id => {
      const element = this.surface.querySelector(`[data-gc-component="${id}"]`);
      return element && ![...this.selected].some(parentId => parentId !== id && this.surface.querySelector(`[data-gc-component="${parentId}"]`)?.contains(element));
    });
    if(selected.length===1){const component=findComponent(this.template,selected[0]!)!,parent=all.find(item=>item.children.some(child=>child.id===component.id));
      if(parent&&parent.layout.mode!=='absolute'&&(component.layout.position??(component.layout.mode==='absolute'?'free':'flow'))==='flow'){
        const index=parent.children.indexOf(component),delta=parent.layout.mode==='row'?dx:dy||dx;
        if(delta){await this.instanceOperation(this.t('调整组件顺序','Reorder component','順序を変更'),{kind:'component.reorder',pageId:this.currentPage().id,componentId:component.id,index:Math.max(0,Math.min(parent.children.length-1,index+(delta>0?1:-1)))});}return;
      }
    }
    await this.change(next => {
      for (const id of selected) {
        const component = findComponent(next, id); if (!component || component.locked) continue;
        const element = this.surface.querySelector<HTMLElement>(`[data-gc-component="${id}"]`)!;
        const parent = all.find(item => item.children.some(child => child.id === id));
        const parentElement = element.offsetParent instanceof HTMLElement ? element.offsetParent : parent && this.surface.querySelector<HTMLElement>(`[data-gc-component="${parent.id}"]`);
        const bounds = element.getBoundingClientRect(), base = (parentElement ?? this.surface).getBoundingClientRect();
        const css=parentElement?getComputedStyle(parentElement):null,root=parentElement?.classList.contains('gc-content')??true;
        const paddingLeft=root?0:parseFloat(css?.paddingLeft??'0')||0,paddingTop=root?0:parseFloat(css?.paddingTop??'0')||0;
        const borderLeft=parseFloat(css?.borderLeftWidth??'0')||0,borderTop=parseFloat(css?.borderTopWidth??'0')||0;
        const parentWidth = (parentElement?.clientWidth??base.width*scale)-paddingLeft-(root?0:parseFloat(css?.paddingRight??'0')||0);
        const parentHeight = (parentElement?.clientHeight??base.height*scale)-paddingTop-(root?0:parseFloat(css?.paddingBottom??'0')||0);
        if (parent && parent.layout.mode !== 'absolute' && (component.layout.position??(component.layout.mode==='absolute'?'free':'flow'))==='flow') {
          // Preserve the rendered position when leaving a row/column/grid for free placement.
          const nextParent=findComponent(next,parent.id)!;
          if(parent.layout.height.unit==='auto')nextParent.layout.minHeight=Math.max(parent.layout.minHeight,base.height*scale);
          if(parent.layout.width.unit==='auto')nextParent.layout.minWidth=Math.max(parent.layout.minWidth,base.width*scale);
          const layout = component.layout;
          layout.position = 'free'; layout.anchorX = 0; layout.anchorY = 0;
          layout.x = { unit: 'px', value: (bounds.left - base.left) * scale - borderLeft - paddingLeft - layout.margin.left + layout.margin.right };
          layout.y = { unit: 'px', value: (bounds.top - base.top) * scale - borderTop - paddingTop - layout.margin.top + layout.margin.bottom };
          layout.width = { unit: 'px', value: bounds.width * scale }; layout.height = { unit: 'px', value: bounds.height * scale };
        }
        const { x, y } = component.layout;
        x.value += x.unit === 'px' ? dx : dx / Math.max(1, parentWidth) * 100;
        y.value += y.unit === 'px' ? dy : dy / Math.max(1, parentHeight) * 100;
      }
    }, '移动页面组件');
  }
  private async pickImage(purpose:string,currentAssetId:Id|null,currentVariantId:Id|null,returnFocus:HTMLElement,
    onApply:NonNullable<Parameters<typeof openAssetPicker>[0]['onApply']>) {
    if(!this.snapshot)return;
    await openAssetPicker({services:this.services,projectId:this.snapshot.projectId,allowedKinds:['image'],locale:this.locale,
      scope:this.root,returnFocus,currentAssetId,currentVariantId,purpose:designerText(purpose,this.locale),mode:'compact',onApply});
  }
  private async backgroundPreview(assetId:Id,image:HTMLImageElement,caption:HTMLElement) {
    const described=await this.services.getAsset?.(assetId);
    if(!image.isConnected)return;
    if(!described?.ok||!described.value){caption.textContent=this.t('背景素材不可用','Background asset unavailable','背景素材を利用できません');return;}
    caption.textContent=described.value.name;
    const resolved=await this.services.runtimeAssets?.resolveRuntime(assetId,described.value.activeVariantId);
    if(!resolved?.ok)return;
    const release=()=>{void this.services.runtimeAssets!.releaseRuntime(resolved.value.leaseId);};
    if(this.disposed||!image.isConnected){release();return;}
    this.backgroundRelease=release;image.src=resolved.value.uri;image.hidden=false;
  }
  private dialog(title: string) {
    const dialog = this.node('dialog', '', 'designer-dialog'); dialog.append(this.node('h2', title), this.action('关闭', () => dialog.close()));
    this.root.append(dialog); dialog.addEventListener('close', () => dialog.remove()); dialog.showModal(); return dialog;
  }
  private documentPanel(title: string): HTMLElement {
    const panel = this.node('section', '', 'designer-document-panel'); panel.ariaLabel = designerText(title, this.locale);
    const header = this.node('header'); header.append(this.node('h2', title), this.action('关闭', () => panel.remove())); panel.append(header);
    this.root.querySelector('.designer-center')?.append(panel); return panel;
  }
  private styleEditor(styleId?:string, createNew=false, draftKeyOverride?:string) {
    if(this.navigating)return;
    this.root.querySelector('[data-style-toggle]')?.setAttribute('aria-pressed','true');
    const selected = [...this.selected][0] ?? null, page = this.currentPage();
    const draftKey=draftKeyOverride??(createNew?`${page.id}/${createId()}`:`${page.id}/${styleId??selected??'page'}`);
    const center = this.root.querySelector<HTMLElement>('.designer-center')!;
    if(!center.querySelector('.designer-style-divider')){
      const divider=this.node('div','','designer-style-divider');divider.tabIndex=0;divider.setAttribute('role','separator');divider.setAttribute('aria-orientation','horizontal');divider.ariaLabel=this.t('调整样式面板高度','Resize style pane','スタイルパネルの高さ');
      const resize=(height:number)=>{const next=Math.max(240,Math.min(Math.max(240,center.clientHeight-180),height));center.style.setProperty('--style-height',`${next}px`);divider.setAttribute('aria-valuenow',String(Math.round(next)));this.fitPreview();};
      divider.onkeydown=event=>{if(!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();resize((parseFloat(center.style.getPropertyValue('--style-height'))||300)+(event.key==='ArrowUp'?24:-24));};
      divider.onpointerdown=event=>{divider.setPointerCapture(event.pointerId);divider.onpointermove=move=>resize(center.getBoundingClientRect().bottom-move.clientY);divider.onpointerup=()=>{divider.onpointermove=null;divider.releasePointerCapture(event.pointerId);};};center.append(divider);
    }    for (const saved of this.styleEditors.values()) saved.node.hidden = true;
    const saved = this.styleEditors.get(draftKey); if (saved) { saved.synchronize(); saved.node.hidden = false; center.classList.add('has-style');this.scheduleFit(); return; }
    const existing = createNew?undefined:this.template.styles.find(style => styleId?style.id===styleId:style.scope.pageId === page.id && style.scope.componentId === selected);
    const id = existing?.id ?? createId([this.documents, this.template]);
    const emptyStyle: NamedStyle = { id, name: `${this.page} 样式`, activation: 'page', scope: { pageId: page.id, componentId: selected },
      language: 'css', sourcePath: `ui/styles/${id}.source.css`, sourceRevision: 0, compiledPath: null, compiledSourceRevision: null, assets: [], issues: [] };
    let style: NamedStyle = existing ?? emptyStyle;
    const baselineStyle=style;style=this.styleDraftOptions?.[draftKey]??style;
    const files = Object.assign({}, ...this.documents.map(doc => doc.files)) as Record<string, string>;
    const dialog = this.node('section', '', 'designer-style-workspace'); dialog.ariaLabel = this.t('作用域 CSS / SCSS', 'Scoped CSS / SCSS', 'スコープ CSS / SCSS');
    dialog.dataset.styleId = id;
    const heading = this.node('header');const closeStyle=this.iconAction(this.t('关闭样式视图','Close styles','スタイルを閉じる'),'m6 6 12 12M18 6 6 18',()=>{dialog.hidden=true;center.classList.remove('has-style');this.root.querySelector('[data-style-toggle]')?.setAttribute('aria-pressed','false');this.canvas.focus();this.scheduleFit();}); closeStyle.classList.add('designer-style-close'); closeStyle.replaceChildren(actionIcon('close')); heading.append(this.node('strong',`${this.page} / ${selected?this.componentLabel(findComponent(this.template,selected)!):this.t('页面','Page','ページ')} / ${this.state}`),closeStyle); dialog.append(heading); center.append(dialog); center.classList.add('has-style');
    const scope=this.node('p',this.t(`作用域：${selected?findComponent(this.template,selected)!.part:this.page}`,`Scope: ${selected?findComponent(this.template,selected)!.part:this.page}`,`スコープ：${selected?findComponent(this.template,selected)!.part:this.page}`));
    const source = this.node('div','','designer-style-source'); source.ariaLabel = this.t('样式源码','Style source','スタイルソース');
    const defaultSource = `[data-gc-part="${selected ? findComponent(this.template, selected)!.part : components(page.root)[1]?.part ?? page.root.part}"] {\n  color: #466b92;\n}`;
    let committedSource = files[baselineStyle.sourcePath] ?? defaultSource, committedLanguage = baselineStyle.language, committedName=baselineStyle.name,committedActivation=baselineStyle.activation;
    const initial = this.styleDrafts[draftKey] ?? committedSource;
    const result = this.node('div','','designer-style-diagnostics');result.setAttribute('role','status');
    const language=this.node('select');language.ariaLabel=this.t('样式语言','Style language','スタイル言語');
    for(const value of ['css','scss']){const option=this.node('option',value.toUpperCase());option.value=value;language.append(option);}language.value=style.language;
    const styleName=this.node('input');styleName.ariaLabel=this.t('样式名称','Style name','スタイル名');styleName.value=style.name;
    const activation=this.node('select');activation.ariaLabel=this.t('样式激活方式','Style activation','スタイルの有効化');
    for(const [value,label] of [['page',this.t('页面自动生效','Automatic on page','ページで自動有効')],['command',this.t('剧情 applyStyle 激活','Activate with applyStyle','applyStyle で有効')]]){const option=this.node('option',label);option.value=value!;activation.append(option);}activation.value=style.activation??'page';
    const pin=this.action(this.t('固定样式目标','Pin style target','スタイルの対象を固定'),()=>{this.stylePinned=!this.stylePinned;pin.setAttribute('aria-pressed',String(this.stylePinned));});pin.setAttribute('aria-pressed',String(this.stylePinned));
    const controls=this.node('div','','designer-style-controls');controls.append(styleName,language,activation,pin);
    dialog.append(scope,controls,source,result);
    configureMonacoWorkers();
    const model=monaco.editor.createModel(initial,style.language,monaco.Uri.parse(`inmemory://galcraft/${id}.${style.language}`));
    monaco.editor.defineTheme('galcraft-source-light',{base:'vs',inherit:true,rules:[{token:'attribute.name',foreground:'9B2226'}],colors:{}});
    const editor=monaco.editor.create(source,{model,automaticLayout:true,language:style.language,theme:this.root.closest('[data-theme="dark"]')?'vs-dark':'galcraft-source-light',
      ariaLabel:source.ariaLabel!,lineNumbers:'on',minimap:{enabled:false},wordWrap:'on',scrollBeyondLastLine:false,fontSize:13,padding:{top:12}});
    let syncing = false;
    const updateDraft = () => {
      const wasDirty=Object.hasOwn(this.styleDrafts,draftKey);
      this.styleDraftOptions??={};
      if (model.getValue() !== committedSource || style.language !== committedLanguage || style.name!==committedName || style.activation!==committedActivation) {this.styleDrafts[draftKey] = model.getValue();this.styleDraftOptions[draftKey]=style;}
      else {delete this.styleDrafts[draftKey];delete this.styleDraftOptions[draftKey];}
      this.draftChanged?.();
      if(wasDirty!==Object.hasOwn(this.styleDrafts,draftKey))this.selectionChanged?.();
    };
    const changed=editor.onDidChangeModelContent(()=>{if (!syncing) updateDraft();});
    language.onchange=()=>{style={...style,language:language.value as 'css'|'scss'};monaco.editor.setModelLanguage(model,style.language);updateDraft();};
    styleName.onchange=()=>{style={...style,name:styleName.value};updateDraft();};activation.onchange=()=>{style={...style,activation:activation.value as 'page'|'command'};updateDraft();};
    const diagnostics=()=>{
      monaco.editor.setModelMarkers(model,'galcraft-style',style.issues.map(issue=>{const start=model.getPositionAt(issue.source?.range?.start??0),end=model.getPositionAt(issue.source?.range?.end??Math.max(1,issue.source?.range?.start??0));return{message:issue.message,severity:issue.severity==='error'?monaco.MarkerSeverity.Error:issue.severity==='warning'?monaco.MarkerSeverity.Warning:monaco.MarkerSeverity.Info,startLineNumber:start.lineNumber,startColumn:start.column,endLineNumber:end.lineNumber,endColumn:Math.max(start.column+1,end.column)};}));
      result.replaceChildren();for(const issue of style.issues){const item=this.action(issue.message,()=>{const position=model.getPositionAt(issue.source?.range?.start??0);editor.setPosition(position);editor.revealPositionInCenter(position);editor.focus();});item.className=`designer-style-issue ${issue.severity}`;result.append(item);}
    };
    const synchronize = () => {
      if (Object.hasOwn(this.styleDrafts,draftKey)) return;
      const latest = this.template.styles.find(item => item.id===style.id) ?? emptyStyle;
      const currentFiles = Object.assign({}, ...this.documents.map(doc => doc.files)) as Record<string, string>;
      const value = currentFiles[latest.sourcePath] ?? defaultSource;
      if (model.getValue() !== value) {
        const view = editor.saveViewState();
        syncing = true;
        editor.executeEdits('galcraft-style-document', [{ range: model.getFullModelRange(), text: value, forceMoveMarkers: true }]);
        syncing = false;
        if (view) editor.restoreViewState(view);
      }
      style = latest; committedSource = value; committedLanguage = style.language;committedName=style.name;committedActivation=style.activation;
      language.value = style.language; monaco.editor.setModelLanguage(model, style.language);
      updateDraft(); diagnostics();
    };
    this.styleEditors.set(draftKey, { node: dialog, synchronize, dispose: () => { changed.dispose(); editor.dispose(); model.dispose(); } });
    updateDraft(); diagnostics();
    let compiling = false;
    const compileAction = this.action('编译并应用', async () => {
      if (compiling) return;
      compiling = true; compileAction.disabled = true; language.disabled = true;
      result.textContent = this.t('正在编译并应用…','Compiling and applying…','コンパイルして適用中…');
      try {
      const requestedSource = model.getValue(), requestedName = styleName.value.trim() || style.name;
      const prepare=this.services.bridge.templates?.preparePageStyleEdit;
      if(prepare){
        this.styleDrafts[draftKey]=model.getValue();const latest=this.template.styles.find(item=>item.id===style.id);
        const planned=await prepare({label:this.t('修改命名样式','Edit named style','名前付きスタイルを編集'),...(latest?{styleId:latest.id}:{}),name:requestedName,pageId:page.id,componentId:selected,language:style.language,activation:activation.value as 'page'|'command',source:requestedSource});
        if(!planned.ok)throw new Error(planned.error.message);
        style=planned.value.template.styles.find(item=>item.id===(planned.value.created.styles[0]??latest?.id))!;
        await this.apply(planned.value.edit);committedSource=requestedSource;committedLanguage=style.language;committedName=style.name;committedActivation=style.activation;updateDraft();diagnostics();
        result.textContent=style.issues.some(issue=>issue.severity==='error')?this.t('源码已应用 · 预览保留最后有效样式','Source applied · preview keeps the last valid style','ソースを適用・プレビューは最後の有効なスタイル'):this.t('已编译并应用 · 工作内容未保存','Compiled and applied · unsaved changes','コンパイルして適用・未保存');return;
      }
      if (!this.services.compileStyle) throw new Error('样式编译服务不可用');
      const latest = this.template.styles.find(item => item.id===style.id);
      style = { ...(latest ?? style), language: style.language, sourceRevision: (latest?.sourceRevision ?? 0) + 1 };
      const value=requestedSource;this.styleDrafts[draftKey]=value;
      const files = Object.assign({}, ...this.documents.map(doc => doc.files)) as Record<string, string>;
      const compiled = await this.services.compileStyle({ style, source: value, instanceId: this.template.instanceId,
        modules: files, lastValidCss: style.compiledPath ? files[style.compiledPath] : undefined });
      if (!compiled.ok) throw new Error(compiled.error.message);
      style = compiled.value.style;
      const next = structuredClone(this.template); next.styles = [...next.styles.filter(item => item.id !== style.id), style];
      const edit = templateEdit(this.documents, next, '修改命名样式');
      const before = this.documents.find(doc => style.sourcePath in doc.files);
      const outputs = { [style.sourcePath]: value, ...(style.compiledPath && compiled.value.css !== null ? { [style.compiledPath]: compiled.value.css } : {}) };
      if (before) {
        edit.expected.push({ ref: { kind: 'document', id: before.documentId }, revision: before.revision });
        for (const [path, after] of Object.entries(outputs)) if (before.files[path] !== after)
          edit.patches.push({ kind: 'file', documentId: before.documentId, path, before: before.files[path] ?? null, after });
      } else { const documentId = createId([this.documents, this.template]); edit.patches.push({ kind: 'document', documentId, op: 'create', before: null,
        after: { documentId, format: 'json', files: { ...outputs, [`ui/styles/${style.id}.json`]: JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data: { styleId: style.id } }) } } }); }
      await this.apply(edit); committedSource = value; committedLanguage = style.language;committedName=style.name;committedActivation=style.activation; updateDraft(); synchronize(); diagnostics();
      if(!style.issues.length)result.textContent=this.t('编译成功 · 工作内容未保存','Compiled · changes are unsaved','コンパイル完了・変更は未保存');
      } catch (reason) { result.textContent = reason instanceof Error ? reason.message : String(reason); }
      finally { compiling = false; compileAction.disabled = false; language.disabled = false; }
    });
    const footer=this.node('div','','designer-style-actions');
    footer.append(this.action(this.t('聚焦源码','Focus source','ソースに集中'),()=>{center.classList.toggle('focus-style');editor.focus();this.fitPreview();}),this.action(this.t('查看生成 CSS','View compiled CSS','生成 CSS を表示'),()=>{const files=Object.assign({},...this.documents.map(document=>document.files));const content=style.compiledPath?files[style.compiledPath]??'':'';const preview=this.node('details');preview.open=true;preview.append(this.node('summary',style.compiledPath??this.t('尚未编译','Not compiled yet','未コンパイル')),codeBlock(content,'css',this.locale));dialog.append(preview);}),this.action(this.t('采用画布单位','Adopt canvas units','キャンバス単位を使用'),()=>{const next=adoptCanvasStyle(model.getValue());editor.executeEdits('galcraft-canvas-units',[{range:model.getFullModelRange(),text:next,forceMoveMarkers:true}]);updateDraft();result.textContent=this.t('已更新草稿，编译并应用后写入作品。','Draft updated. Compile and apply to save it to the project.','下書きを更新しました。コンパイル・適用で作品に反映します。');}),compileAction);
    const remove=this.action(this.t('删除样式','Delete style','スタイルを削除'),()=>this.safely(async()=>{const existing=this.template.styles.find(item=>item.id===style.id);if(existing)await this.editInstances(this.t('删除命名样式','Delete named style','名前付きスタイルを削除'),[{kind:'style.remove',styleId:style.id}]);this.styleEditors.get(draftKey)?.dispose();this.styleEditors.delete(draftKey);delete this.styleDrafts[draftKey];delete this.styleDraftOptions[draftKey];dialog.remove();this.draftChanged?.();this.styleEditor();}));footer.append(remove);dialog.append(footer);
    if(typeof requestAnimationFrame==='function')this.scheduleFit();
  }
  private templates() {
    if(this.templateWorkspace){this.templateWorkspace.node.hidden=false;this.templateWorkspace.node.scrollIntoView({block:'start'});return;}
    const center=this.root.querySelector<HTMLElement>('.designer-center')!, origin=document.activeElement as HTMLElement|null;
    const panel=this.node('section','','designer-template-workspace'), header=this.node('header','','designer-template-heading'), mount=this.node('div');
    const root=createRoot(mount);
    const close=()=>{root.unmount();panel.remove();center.classList.remove('has-template');this.templateWorkspace=null;this.drawInspector();if(origin?.isConnected)origin.focus({preventScroll:true});};
    header.append(this.node('h2',this.t('作品模板','Project templates','作品テンプレート')),this.action(this.t('关闭','Close','閉じる'),close));panel.append(header,mount);center.append(panel);center.classList.add('has-template');center.scrollTop=0;
    this.templateWorkspace={node:panel,root};this.drawInspector();
    const preview=async(host:HTMLElement,source:RuntimeTemplate,files:Record<string,string>={},plan?:import('@galcraft/contracts').TemplateSwitchResult|null)=>{
      if(!this.snapshot)throw new Error(this.t('需要有效剧情快照才能预览模板','A valid story snapshot is required to preview the template','テンプレートのプレビューには有効な物語が必要です'));
      const sample=pagePreviewSample(this.snapshot,source,'title','normal');sample.project.display.titleMusic=null;sample.project.display.titleVideo=null;
      const surface=this.node('div');surface.inert=true;surface.style.cssText=`width:${sample.project.canvas.width}px;height:${sample.project.canvas.height}px;transform-origin:top left;pointer-events:none;position:absolute;left:0;top:0`;
      host.append(surface);if(host.parentElement)host.parentElement.style.aspectRatio=`${sample.project.canvas.width}/${sample.project.canvas.height}`;
      const styles=Object.assign({},...this.documents.map(document=>document.files),files);
      const prepared=plan&&this.services.bridge.templates?.previewTemplateResources?await this.services.bridge.templates.previewTemplateResources(plan.planId):null;if(prepared&&!prepared.ok)throw new Error(prepared.error.message);
      const resources=prepared?.ok?prepared.value:{assets:[],locations:[],leaseIds:[]};sample.assets.push(...resources.assets);
      const releaseResources=()=>{for(const id of resources.leaseIds)void this.services.runtimeAssets?.releaseRuntime(id);};
      let player;try{player=await openPlayerPreview(surface,this.services,sample,'sample',styles,source.styles.map(style=>style.id),resources.locations);}catch(error){releaseResources();surface.remove();throw error;}
      const fit=()=>{surface.style.transform=`scale(${host.clientWidth/sample.project.canvas.width})`;};
      const resize=new ResizeObserver(fit);resize.observe(host);fit();
      return ()=>{resize.disconnect();player.dispose();releaseResources();surface.remove();};
    };
    const protectDrafts=()=>{if(Object.keys(this.fieldInputDrafts).length||Object.keys(this.styleDrafts).length||this.hasAnimationDraft())throw new Error(this.t('请先处理尚未应用的页面、样式或动画输入，再切换模板。','Apply or discard unapplied page, style and animation input before switching templates.','テンプレート切替前に未適用のページ・スタイル・アニメーション入力を処理してください。'));};
    const bridge=this.services.bridge.templates;
    const manage=bridge?.library?async(input:import('@galcraft/contracts').TemplateLibraryInput)=>{const result=await bridge.library!(input);if(!result.ok)throw new Error(result.error.message);return result.value;}:undefined;
    const targets=this.documents.flatMap(document=>Object.entries(document.files).flatMap(([path,raw])=>{if(!path.endsWith('.json'))return[];let data:any;try{data=JSON.parse(raw).data;}catch{return[];}return [...(data?.variables??[]).map((item:any)=>({id:item.id,name:item.name,kind:'variable'})),...(data?.locals??[]).map((item:any)=>({id:item.id,name:item.name,kind:'variable'})),...(data?.characters??[]).map((item:any)=>({id:item.id,name:item.name,kind:'character'})),...(path.startsWith('scenes/')&&data?.id?[{id:data.id,name:data.name,kind:'scene'}]:[])];}));
    root.render(createElement(TemplateChooser,{current:this.template,locale:this.locale,preview,manage,targets,hiddenPages:readTemplateSource(this.documents)?.hiddenPages,
      prepare:bridge?.prepareTemplateSwitch?async request=>{protectDrafts();const result=await bridge.prepareTemplateSwitch!(request);if(!result.ok)throw new Error(result.error.message);return result.value;}:undefined,
      applyPlan:async selected=>{protectDrafts();if(selected.blocked||!selected.edit)throw new Error('TEMPLATE_PLAN_BLOCKED');const errors=templateIssues(selected.template);if(errors.length)throw new Error(errors.join('\n'));await this.apply(selected.edit);close();},
      restore:async key=>{protectDrafts();if(bridge?.restoreTemplatePage){const result=await bridge.restoreTemplatePage(key);if(!result.ok)throw new Error(result.error.message);await this.apply(result.value.edit);}else await this.apply(restoreHiddenTemplatePage(this.documents,key));close();},
      apply:async(source,_keep,options)=>{protectDrafts();const selected=prepareTemplateSwitch(this.documents,source,options);if(selected.blocked)throw new Error(this.t('请先解决模板切换冲突。','Resolve the template switch conflicts first.','テンプレート切替の競合を先に解決してください。'));await this.apply(selected.edit);close();}
    }));
    panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopPropagation();close();}});
    requestAnimationFrame(()=>header.querySelector('button')?.focus({preventScroll:true}));
  }
  private selectionBounds() {
    this.overlay.replaceChildren(); if (this.navigating) return;
    const base = this.canvas.getBoundingClientRect();
    const measured = this.geometry?.read(this.geometry.previewId);
    if (measured?.status === 'ready') for (const part of measured.parts) if (part.visible && part.rect) {
      const bounds = part.rect, guide = this.node('div', '', 'designer-guide'); guide.title = part.part;
      Object.assign(guide.style, { left: `${bounds.x-base.left}px`, top: `${bounds.y-base.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
      this.overlay.append(guide);
    }
    for (const id of this.selected) {
      const target = this.surface.querySelector<HTMLElement>(`[data-gc-component="${id}"]`); if (!target) continue;
      const bounds = target.getBoundingClientRect(), box = this.node('div', '', 'designer-selection');
      Object.assign(box.style, { left: `${bounds.left - base.left}px`, top: `${bounds.top - base.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` }); this.overlay.append(box);
      const component=findComponent(this.template,id);
      if(this.selected.size===1&&component&&!component.locked&&component.id!==this.currentPage().root.id)for(const direction of ['nw','n','ne','e','se','s','sw','w']){
        const handle=this.node('button','','designer-resize-handle');handle.type='button';handle.dataset.resizeDirection=direction;handle.ariaLabel=this.t(`调整尺寸 ${direction}`,`Resize ${direction}`,`サイズ変更 ${direction}`);handle.style.cursor=`${direction}-resize`;box.append(handle);
        handle.onkeydown=event=>{if(!event.key.startsWith('Arrow'))return;event.preventDefault();event.stopPropagation();const step=event.shiftKey?10:1,scale=this.snapshot!.project.canvas.width/this.surface.getBoundingClientRect().width;void this.instanceOperation(this.t('调整组件尺寸','Resize component','サイズを変更'),{kind:'component.update',pageId:this.currentPage().id,componentId:id,changes:{layout:{width:{unit:'px',value:Math.max(1,bounds.width*scale+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0))},height:{unit:'px',value:Math.max(1,bounds.height*scale+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0))}}}});};
      }
    }
  }
  private resizeInstance(event:PointerEvent,direction:string) {
    const component=findComponent(this.template,[...this.selected][0]??'');if(!component||component.locked)return;
    const element=this.surface.querySelector<HTMLElement>(`[data-gc-component="${component.id}"]`);if(!element)return;
    this.canvas.focus({preventScroll:true});const bounds=element.getBoundingClientRect(),canvasScale=this.snapshot!.project.canvas.width/this.surface.getBoundingClientRect().width;
    const scale=component.layout.width.unit==='px'&&component.layout.width.value>0?component.layout.width.value/bounds.width:canvasScale;
    const original={width:element.style.width,height:element.style.height,translate:element.style.translate},start={x:event.clientX,y:event.clientY};let dx=0,dy=0,width=bounds.width*scale,height=bounds.height*scale;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.onpointermove=move=>{dx=(move.clientX-start.x)*scale;dy=(move.clientY-start.y)*scale;width=Math.max(1,bounds.width*scale+(direction.includes('w')?-dx:direction.includes('e')?dx:0));height=Math.max(1,bounds.height*scale+(direction.includes('n')?-dy:direction.includes('s')?dy:0));element.style.width=`${width}px`;element.style.height=`${height}px`;if(direction.includes('w')||direction.includes('n'))element.style.translate=`${direction.includes('w')?bounds.width*scale-width:0}px ${direction.includes('n')?bounds.height*scale-height:0}px`;this.selectionBounds();};
    const finish=(commit:boolean)=>{this.cancelDrag=null;this.canvas.onpointermove=this.canvas.onpointerup=this.canvas.onpointercancel=null;if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);Object.assign(element.style,original);this.selectionBounds();if(commit&&(dx||dy)){const layout:Record<string,unknown>={width:{unit:'px',value:width},height:{unit:'px',value:height}};if((component.layout.position??(component.layout.mode==='absolute'?'free':'flow'))==='free'){if(direction.includes('w'))layout.x={unit:'px',value:(component.layout.x.unit==='px'?component.layout.x.value:element.offsetLeft)+bounds.width*scale-width};if(direction.includes('n'))layout.y={unit:'px',value:(component.layout.y.unit==='px'?component.layout.y.value:element.offsetTop)+bounds.height*scale-height};}void this.instanceOperation(this.t('调整组件尺寸','Resize component','サイズを変更'),{kind:'component.update',pageId:this.currentPage().id,componentId:component.id,changes:ComponentChangesSchema.parse({layout})});}};
    this.cancelDrag=()=>finish(false);this.canvas.onpointerup=()=>finish(true);this.canvas.onpointercancel=()=>finish(false);
  }
  private scheduleFit() { if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>this.fitPreview()); }
  private fitPreview() {
    if(!this.snapshot)return;
    const center=this.root?.querySelector<HTMLElement>('.designer-center'),canvas=this.snapshot.project.canvas;
    const style=center?.querySelector<HTMLElement>('.designer-style-workspace:not([hidden])');
    const toolbar=center?.querySelector<HTMLElement>('.designer-toolbar');
    const availableWidth=center?center.clientWidth-24:this.canvas.clientWidth;
    const availableHeight=center?Math.max(140,center.clientHeight-(toolbar?.offsetHeight??40)-(style&&center.classList.contains('has-style')?style.offsetHeight+24:0)-72):Infinity;
    this.canvas.style.width=this.zoom==='100'?`${canvas.width}px`:`${Math.max(100,Math.min(availableWidth,availableHeight*canvas.width/canvas.height))}px`;
    this.surface.style.transform=`scale(${this.canvas.clientWidth/this.snapshot.project.canvas.width})`;
    this.selectionBounds();
  }
  private preview(template = this.template): Promise<void> {
    const generation = ++this.generation;
    const next = structuredClone(template), page = this.page, sample = this.sample, state = this.state;
    this.previewQueue = this.previewQueue.catch(() => {}).then(() => this.renderPreview(next, page, sample, state, generation));
    return this.previewQueue;
  }
  private async renderPreview(template: RuntimeTemplate, page: PageKey, sample: string, state: State, generation: number) {
    if(this.galleryEditor)return;
    const stale=()=>this.disposed||generation!==this.generation;
    if (stale()) return;
    const started = performance.now();
    if (!this.snapshot) { this.notice.textContent = '需要有效剧情快照才能启动页面预览'; return; }
    this.surface.dataset.previewStatus='loading';this.surface.setAttribute('aria-busy','true');for(const button of this.inspector.querySelectorAll<HTMLButtonElement>('[data-preview-animation]'))button.disabled=true;
    const snapshot = pagePreviewSample(this.snapshot,template,page,sample,this.previewLocale??this.snapshot.project.languages.menuDefault);
    if(['cg','music'].includes(page))prepareGallerySample(snapshot,sample);
    if (state !== 'normal') for (const page of snapshot.template.pages) for (const component of components(page.root))
      component.normal = { ...component.normal, ...component.states[state] };
    const styles = Object.assign({}, ...this.documents.map(doc => doc.files)) as Record<string,string>;
    this.surface.style.width=`${snapshot.project.canvas.width}px`;this.surface.style.height=`${snapshot.project.canvas.height}px`;this.surface.style.transformOrigin='top left';
    this.canvas.style.aspectRatio = `${snapshot.project.canvas.width} / ${snapshot.project.canvas.height}`;
    if(!this.resize){this.resize=new ResizeObserver(()=>this.fitPreview());this.resize.observe(this.canvas.parentElement!);this.resize.observe(this.canvas);}this.fitPreview();
    let player:StudioPlayer|null=this.player;
    let mount=this.surface.querySelector<HTMLElement>('.designer-preview-mount');
    let created=false;
    const retire=()=>{if(created){player?.dispose();mount?.remove();}};
    try {
      const updated=player?.updatePreview(snapshot,styles,template.styles.map(style=>style.id));
      if(!player||!updated?.ok){
        mount=this.node('div','','designer-preview-mount');Object.assign(mount.style,{width:'100%',height:'100%',position:'absolute',visibility:'hidden'});this.surface.append(mount);
        player=await openPlayerPreview(mount,this.services,snapshot,'sample',styles,template.styles.map(style=>style.id));created=true;this.previewMounts++;
      }
      if(stale()){retire();return;}
      player.setPreviewMuted(true);
      const preferences=player.data.current()!.preferences;
      if(preferences.menuLocale!==(this.previewLocale??snapshot.project.languages.menuDefault)){
        const localized=await player.data.savePreferences({...preferences,menuLocale:this.previewLocale??snapshot.project.languages.menuDefault},preferences.revision);
        if(!localized.ok)throw new Error(localized.error.message);if(stale()){retire();return;}player.view.render();
      }
      if (['story','choice','input','history','save','load'].includes(page) && (sample !== 'empty'||['choice','input'].includes(page))) {
        await player.view.newGame();if(stale()){retire();return;}
      }
      const current=player.session.inspect();
      if(page==='story'&&sample.startsWith('reading:')&&current?.state.wait?.kind==='say'){
        const profile=player.data.current()!,read=sample==='reading:read'||sample==='reading:nvl-read';
        const ids=current.state.presentation.text.parts.map(part=>part.statementId),longTerm={...profile.longTerm,readStatements:[...profile.longTerm.readStatements.filter(id=>!ids.includes(id)),...(read?ids:[])]};
        const saved=await player.data.saveLongTerm(longTerm,profile.longTerm.revision);if(!saved.ok)throw new Error(saved.error.message);player.longTerm.syncFromDisk();
      }
      if(current?.token&&current.state.wait?.kind==='say'){const revealed=await player.session.updateTextProgress({token:current.token,textShown:Number.MAX_SAFE_INTEGER});if(stale()){retire();return;}if(!revealed.ok)throw new Error(revealed.error.message);}
      if(['save','load'].includes(page)&&['full','partial','missing','longText'].includes(sample)){
        const inspection=player.session.inspect();if(inspection)await prepareSaveSample(player.data,snapshot,inspection,player.stage.captureFrame(),sample);
        if(stale()){retire();return;}
      }
      if (['cg','music'].includes(page)) { const profile=player.data.current()!;
        const next=gallerySampleLongTerm(snapshot,profile.longTerm,sample);const saved=await player.data.saveLongTerm(next,profile.longTerm.revision);if(!saved.ok)throw new Error(saved.error.message);
        player.longTerm.syncFromDisk();player.view.configureGallerySample(sample);
        if(stale()){retire();return;}
      }
      if (page === 'characters') {
        const profile = player.data.current()!, entries = snapshot.characters.filter(character => character.narrativeRole === 'main' && character.afterstory);
        const shown = sample === 'locked' || sample === 'empty' ? [] : sample === 'full' ? entries : entries.slice(0, 1);
        const saved = await player.data.saveLongTerm({ ...profile.longTerm, endings: shown.flatMap(character => character.afterstory!.unlockEndingIds) }, profile.longTerm.revision);
        if (!saved.ok) throw new Error(saved.error.message); player.longTerm.syncFromDisk();
        if(stale()){retire();return;}
      }
      player.view.navigation.replace(page);if(stale()){retire();return;}
      if(created){this.player?.dispose();mount!.style.position='';mount!.style.visibility='';this.surface.replaceChildren(mount!);}
      this.player=player;this.surface.dataset.previewStatus='ready';this.surface.setAttribute('aria-busy','false');this.surface.dataset.previewMounts=String(this.previewMounts);this.surface.dataset.previewDurationMs=String(performance.now()-started);for(const button of this.inspector.querySelectorAll<HTMLButtonElement>('[data-preview-animation]'))button.disabled=false;
      this.geometry?.dispose();
      this.geometry = new PreviewGeometry(createId([this.documents, this.template]), mount!, player.view.stageElement,
        this.documents.map(doc => ({ ref: { kind: 'document', id: doc.documentId }, revision: doc.revision })));
      this.geometry.subscribe(value => { if (value.status === 'ready' && generation === this.generation) this.selectionBounds(); });
    } catch (error) { retire();if (!stale()) {this.surface.dataset.previewStatus='error';this.surface.setAttribute('aria-busy','false');this.notice.textContent = String(error);} }
  }
}

