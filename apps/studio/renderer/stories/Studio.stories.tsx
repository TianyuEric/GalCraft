import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { mountAuthoring } from '../authoring/view.js';
import { studioFixture, type ProductState } from './studio-fixture.js';
import { componentSceneRequest } from './page-component-fixture.js';
import { figureId, figureVariantId, productSnapshot } from './product-fixture.js';
import { FixtureIds } from '@galcraft/contracts/fixtures';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';

type Page = 'projects' | 'editor' | 'assets' | 'pages' | 'production' | 'plugins' | 'publish';

function StudioPage({ page, state='normal', locale='zh-CN', theme='light',components=false }: { page: Page; state?:ProductState; locale?:'zh-CN'|'en'|'ja';theme?:'light'|'dark';components?:boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    if (!root.current) return;
    let active = true;
    // Mount the requested tools before injecting a refresh failure/loading state.
    const deferredState = ['assets', 'production'].includes(page) && (state === 'failed' || state === 'loading');
    const fixture=studioFixture(deferredState ? 'normal' : state,locale,theme);
    const {services}=fixture;
    const container=document.createElement('div');container.id='app';container.dataset.locale=locale;container.dataset.theme=theme;root.current.append(container);
    let portals=document.getElementById('studio-portals');const ownsPortals=!portals;
    if(!portals){portals=document.createElement('div');portals.id='studio-portals';document.body.append(portals);}
    portals.dataset.locale=locale;portals.dataset.theme=theme;
    let mounted:Awaited<ReturnType<typeof mountAuthoring>>|null=null;
    void (async()=>{if(components){const plan=await services.bridge.templates.preparePageEdit(componentSceneRequest(productSnapshot()));if(!plan.ok)throw new Error(plan.error.message);const edit=await services.bridge.documents.planEdit(plan.value.edit);if(!edit.ok)throw new Error(edit.error.message);const applied=await services.bridge.documents.applyEdit(edit.value.planId,plan.value.edit.expected);if(!applied.ok)throw new Error(applied.error.message);}return mountAuthoring(container,services);})().then(async workspace => {
      mounted=workspace;
      if (!active) { workspace.dispose();container.remove();return; }
      if (page !== 'editor') await workspace.navigate(page);
      if(components)await workspace.openDocument({kind:'page',objectId:'component-workspace',title:'基础组件'});
      if (deferredState && active) {
        fixture.setState(state);
        // Production's mounted session polls; asset refresh is independent of navigation.
        if (page === 'assets') void workspace.showAssets();
      }
    }).catch(reason => { if (active) setError(String(reason)); });
    return () => {
      active = false;
      mounted?.dispose();container.remove();
      if(ownsPortals)portals.remove();else portals.replaceChildren();
    };
  }, [page,state,locale,theme,components]);
  return <>{error && <div className="product-story-error" role="alert">{error}</div>}<div ref={root} className="product-story" /></>;
}

const meta = { title: 'Product/Studio/Authoring/Pages', component: StudioPage,args:{state:'normal',locale:'zh-CN',theme:'light'},argTypes:{state:{control:'select',options:['normal','empty','failed','loading']},locale:{control:'select',options:['zh-CN','en','ja']},theme:{control:'select',options:['light','dark']}}, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof StudioPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Projects: Story = { args: { page: 'projects' } };
export const Editor: Story = { args: { page: 'editor' } };
export const Assets: Story = { args: { page: 'assets' } };
export const AssetsDark: Story = { args: { page: 'assets', theme: 'dark' } };
export const AssetToCharacter: Story = {
  args: { page: 'editor' },
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const library = () => canvasElement.querySelector<HTMLElement>('[data-view="studio-assets"]');
    const directory = () => canvasElement.querySelector<HTMLElement>('[data-view="studio-asset-directory"]');
    const row = () => library()?.querySelector<HTMLElement>(`[data-plugin-asset-id="${figureId}"]`);
    const scene = () => canvasElement.querySelector<HTMLElement>('.authoring-scene-views');
    await waitFor(() => expect(scene()).toBeVisible());
    await userEvent.click(await canvas.findByRole('button', { name: '素材库' }));
    await waitFor(() => expect(row()).toBeVisible(), { timeout: 30000 });
    await userEvent.click(row()!.querySelector<HTMLElement>('.asset-row-name')!);
    const preview = () => canvasElement.querySelector<HTMLElement>(`[data-view="asset:${figureId}"] [data-asset-preview]`);
    await expect(scene()).toBeVisible();
    await expect(preview()).toBeNull();
    await expect(directory()).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: '工作面' }));
    await userEvent.click(await body.findByRole('menuitem', { name: '素材管理' }));
    await waitFor(() => expect(preview()).toHaveAttribute('data-preview-variant', figureVariantId));
    await userEvent.click(within(preview()!).getByRole('button', { name: '绑定角色差分' }));
    const dialog = within(await body.findByRole('dialog', { name: '绑定共同差分' }));
    const name = dialog.getByRole('textbox');
    await userEvent.clear(name);
    await userEvent.type(name, '长中文名角色差分·夜色里重新抬起头的林舟');
    await userEvent.click(dialog.getByRole('button', { name: '绑定差分' }));
    const character = () => canvasElement.querySelector<HTMLElement>(`[data-view="character:${FixtureIds.an}"]`);
    await waitFor(() => expect(character()).toBeVisible());
    await waitFor(() => expect(character()).toHaveTextContent('长中文名角色差分·夜色里重新抬起头的林舟'));
    await expect(library()).toBeVisible();
    canvasElement.dataset.assetCharacterAcceptance = 'passed';
  },
};
export const AssetToCharacterDusk: Story = { ...AssetToCharacter, args: { page: 'editor', theme: 'dark' } };
export const MixedSceneGroups: Story = {
  args: { page: 'editor', locale: 'en' },
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const bookshop = productSnapshot().scenes[1]!.scene;
    const pane = (id: string) => canvasElement.querySelector<HTMLElement>(`[data-view="scene:${id}"]`)!;
    await waitFor(() => expect(pane(FixtureIds.street)).toBeVisible());
    await userEvent.dblClick(canvasElement.querySelector<HTMLElement>(`[data-node-id="${bookshop.id}"]`)!);
    const tab = await canvas.findByRole('tab', { name: bookshop.name });
    await userEvent.click(canvas.getByRole('button', { name: 'Plot outline' }));
    tab.focus(); await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await userEvent.click(await body.findByRole('menuitem', { name: 'Split right' }));
    await waitFor(() => expect(pane(FixtureIds.street)).toBeVisible());
    await expect(pane(bookshop.id)).toBeVisible();
    for (const [id, docId] of [[FixtureIds.street, FixtureIds.streetDocument], [bookshop.id, FixtureIds.bookshopDocument]]) {
      const group = pane(id!);
      await userEvent.click(within(group).getByRole('button', { name: 'Writing' }));
      await waitFor(() => expect(group.querySelector(`[data-scene-document="${docId}"] [data-scene-view="writing"]`)).toBeVisible());
    }
    await expect(pane(FixtureIds.street).querySelector('[data-scene-view="writing"]')).toBeVisible();
    await expect(pane(bookshop.id).querySelector('[data-scene-view="writing"]')).toBeVisible();
    canvasElement.dataset.mixedSceneGroups = 'passed';
  },
};
export const PageDesigner:Story={args:{page:'pages'}};
export const PageDesignerDark:Story={args:{page:'pages',theme:'dark'}};
export const PageComponents:Story={args:{page:'pages',components:true},play:async({canvas,canvasElement})=>{
  const target = () => canvasElement.querySelector<HTMLElement>('[data-view="page:component-workspace"]');
  await waitFor(() => expect(target()).toBeVisible());
  const document = within(target()!);
  await userEvent.click(await document.findByText('当前文档工具', { exact: true }));
  const tree=()=>within(canvas.getByRole('tree',{name:'页面组件'}));
  await waitFor(() => expect(tree().getByText('基础组件工作页')).toBeVisible());
  const expand = tree().queryByRole('button', { name: '展开 基础组件工作页' });
  if (expand) await userEvent.click(expand);
  await userEvent.click(tree().getByText('页面数值滑杆',{exact:true}));
  await userEvent.selectOptions(canvas.getByLabelText('控件值 · 来源'),'data');
  await userEvent.selectOptions(canvas.getByLabelText('控件值 · 属性'),'preferences.volumes.master');
  const previousBinding=canvas.getByLabelText('控件值 · 属性');
  await userEvent.click(canvas.getByRole('button',{name:'应用数据配置'}));
  await waitFor(()=>expect(previousBinding.isConnected).toBe(false));
  await waitFor(()=>expect(canvas.getByLabelText('控件值 · 属性')).toHaveValue('preferences.volumes.master'));
  await userEvent.click(tree().getByText('标题页导航',{exact:true}));
  await userEvent.click(canvas.getByText('交互',{exact:true}));
  await userEvent.selectOptions(canvas.getByLabelText('触发事件'),'click');
  await userEvent.selectOptions(canvas.getByLabelText('条件类型'),'equals');
  await userEvent.selectOptions(canvas.getByLabelText('条件左值 · 局部键'),'toggle');
  await userEvent.selectOptions(canvas.getByLabelText('条件右值 · 固定值'),'true');
  await userEvent.click(canvas.getByRole('button',{name:'添加动作'}));
  const second=within(canvasElement.querySelector('[data-action-index="1"]')! as HTMLElement);
  await userEvent.selectOptions(second.getByLabelText('动作类型'),'setLocal');
  await userEvent.selectOptions(second.getByLabelText('目标局部键'),'input');
  fireEvent.change(second.getByLabelText('写入值 · 固定值'),{target:{value:'导航已执行'}});
  await userEvent.click(second.getByRole('button',{name:'动作上移'}));
  const last=within(canvasElement.querySelector('[data-action-index="1"]')! as HTMLElement);
  await userEvent.selectOptions(last.getByLabelText('目标页面'),'character-intro');
  const previousAction=last.getByLabelText('目标页面');
  await userEvent.click(canvas.getByRole('button',{name:'应用交互'}));
  await waitFor(()=>expect(previousAction.isConnected).toBe(false));
  await waitFor(()=>expect(canvasElement.querySelector('[data-action-index="0"] select[aria-label="动作类型"]')).toHaveValue('setLocal'));
  await userEvent.click(document.getByText('当前文档工具', { exact: true }));
  await userEvent.click(canvas.getByRole('button',{name:'导航预览'}));
  await waitFor(() => {
    const player = canvasElement.querySelector<HTMLElement>('.designer-player[aria-hidden="false"][data-preview-status="ready"]');
    expect(player).toBeTruthy();
    expect(player!.querySelector('[data-gc-page="component-workspace"]')).toBeTruthy();
    expect(within(player!).getByRole('button', { name: '打开标题页' })).toBeVisible();
  });
  canvasElement.dataset.bindingAcceptance='passed';
}};
export const PageComponentsDark:Story={args:{page:'pages',components:true,theme:'dark'}};
export const Production:Story={args:{page:'production'}};
export const Plugins:Story={args:{page:'plugins'}};
export const PluginFailure:Story={args:{page:'plugins',state:'failed'}};
export const Publish:Story={args:{page:'publish'}};
export const PublishFailure:Story={args:{page:'publish',state:'failed'}};
export const EmptyAssets:Story={args:{page:'assets',state:'empty'}};
export const AssetFailure:Story={args:{page:'assets',state:'failed'}};
export const ProductionFailure:Story={args:{page:'production',state:'failed'}};
export const PluginLoading:Story={args:{page:'plugins',state:'loading'}};
export const AssetsLoading:Story={args:{page:'assets',state:'loading'}};
export const ProductionLoading:Story={args:{page:'production',state:'loading'}};
export const JapaneseEditor:Story={args:{page:'editor',locale:'ja',theme:'dark'}};
export const EnglishEditor:Story={args:{page:'editor',locale:'en'}};
export const PinnedSceneProperties: Story = {
  args: { page: 'editor', locale: 'en' },
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const stage = () => canvasElement.querySelector<HTMLElement>('[data-source-panel="stage"]');
    const properties = () => canvasElement.querySelector<HTMLElement>('[data-source-panel="inspector"]');
    const sceneCard = (id: string) => canvasElement.querySelector<HTMLElement>(`.authoring-center[data-scene-view="cards"] [data-statement-id="${id}"]`)!;
    const bookshop = productSnapshot().scenes[1]!.scene;
    await userEvent.click(await canvas.findByRole('button', { name: /^Writing$/ }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Side-by-side editor views' }));
    await userEvent.click(await body.findByRole('menuitem', { name: 'Open Direction beside' }));
    const companion = await canvas.findByRole('tab', { name: /^Direction$/ });
    const primary = canvasElement.querySelector('.authoring-scene-views');
    const alongside = canvasElement.querySelector('.authoring-scene-beside');
    await expect(primary).toHaveAttribute('data-scene-document', FixtureIds.streetDocument);
    await expect(alongside).toHaveAttribute('data-scene-document', FixtureIds.streetDocument);
    await expect(alongside).toHaveAttribute('data-scene-revision', primary?.getAttribute('data-scene-revision'));
    await userEvent.click(companion);
    await waitFor(() => expect(canvas.getByRole('button', { name: /^Direction$/ })).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.click(canvas.getByRole('button', { name: /^Close Direction$/ }));
    await userEvent.click(await canvas.findByRole('button', { name: /^Workfaces$/ }));
    await userEvent.click(await body.findByRole('menuitem', { name: 'Writing and stage' }));
    await userEvent.click(await canvas.findByRole('button', { name: /^Direction$/ }));
    await waitFor(() => expect(sceneCard(FixtureIds.statements[0]!)).toBeVisible());
    await userEvent.click(sceneCard(FixtureIds.statements[0]!));
    await userEvent.click(await canvas.findByRole('button', { name: 'Pin stage source' }));
    await userEvent.click(sceneCard(FixtureIds.statements[1]!));
    await userEvent.click(await canvas.findByRole('button', { name: 'Pin properties source' }));
    await expect(stage()).toHaveAttribute('data-source-statement', FixtureIds.statements[0]);
    await expect(properties()).toHaveAttribute('data-source-statement', FixtureIds.statements[1]);

    await userEvent.dblClick(canvasElement.querySelector<HTMLElement>(`[data-node-id="${bookshop.id}"]`)!);
    await waitFor(() => expect(canvas.getByRole('tab', { name: bookshop.name })).toHaveAttribute('aria-selected', 'true'));
    await expect(stage()).toHaveAttribute('data-source-document', FixtureIds.streetDocument);
    await expect(properties()).toHaveAttribute('data-source-document', FixtureIds.streetDocument);
    const speaker = canvasElement.querySelector<HTMLSelectElement>('.authoring-inspector-fields [data-field="speaker"] select')!;
    await userEvent.selectOptions(speaker, speaker.value ? '' : FixtureIds.an);
    await waitFor(() => expect(properties()).toHaveAttribute('data-source-revision', '2'));
    const activeBookshop = canvasElement.querySelector(`[data-view="scene:${bookshop.id}"] .authoring-scene-views`);
    await expect(activeBookshop).toHaveAttribute('data-scene-revision', '1');
    await expect(activeBookshop).toHaveAttribute('data-scene-document', FixtureIds.bookshopDocument);
    await userEvent.click(canvas.getByRole('button', { name: 'Resume stage following' }));
    await waitFor(() => expect(stage()).toHaveAttribute('data-source-document', FixtureIds.bookshopDocument));
    await userEvent.click(canvas.getByRole('button', { name: /^Workbench preferences$/ }));
    await waitFor(() => expect(stage()).toHaveTextContent('Open a scene document to resume following.'));
    await expect(within(stage()!).getByRole('button', { name: 'Pin stage source' })).toBeDisabled();
    await expect(properties()).toHaveAttribute('data-source-document', FixtureIds.streetDocument);
    await userEvent.click(canvas.getByRole('tab', { name: bookshop.name }));
    await waitFor(() => expect(stage()).toHaveAttribute('data-source-document', FixtureIds.bookshopDocument));
    canvasElement.dataset.pinnedSceneProperties = 'passed';
  },
};
export const PinnedInlineEvent: Story = {
  args: { page: 'editor', locale: 'en', theme: 'dark' },
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const properties = () => canvasElement.querySelector<HTMLElement>('[data-source-panel="inspector"]');
    await userEvent.click(await canvas.findByRole('button', { name: /^Writing$/ }));
    await userEvent.click(await canvas.findByRole('button', { name: /^Inspector$/ }));
    const line = () => canvasElement.querySelector<HTMLElement>(`.authoring-center[data-scene-view="writing"] [data-statement-id="${FixtureIds.statements[0]}"]`)!;
    await waitFor(() => expect(line()).toBeVisible());
    await userEvent.click(within(line()).getByRole('button', { name: 'More command actions' }));
    await userEvent.click(await body.findByRole('menuitem', { name: 'Insert inline wait' }));
    const insert = within(await body.findByRole('dialog', { name: 'Insert inline wait' }));
    await userEvent.type(insert.getByRole('spinbutton', { name: /^Duration in milliseconds/ }), '125');
    await userEvent.click(insert.getByRole('button', { name: /^Confirm$/ }));
    await waitFor(() => expect(properties()?.dataset.sourceEvent).toBeTruthy());
    const eventId = properties()!.dataset.sourceEvent;
    await userEvent.click(await canvas.findByRole('button', { name: 'Pin properties source' }));
    await userEvent.dblClick(canvasElement.querySelector<HTMLElement>(`[data-node-id="${FixtureIds.bookshop}"]`)!);
    const bookshop = () => canvasElement.querySelector(`[data-view="scene:${FixtureIds.bookshop}"] .authoring-scene-views`);
    await waitFor(() => expect(bookshop()).toHaveAttribute('data-scene-document', FixtureIds.bookshopDocument));
    await expect(properties()).toHaveAttribute('data-source-event', eventId);
    await userEvent.click(await canvas.findByRole('button', { name: 'Edit inline event' }));
    const edit = within(await body.findByRole('dialog', { name: /^Inline wait$/ }));
    const duration = edit.getByRole('spinbutton', { name: /^Duration in milliseconds/ });
    await expect(duration).toHaveValue(125);
    await userEvent.clear(duration);
    await userEvent.type(duration, '250');
    await userEvent.click(edit.getByRole('button', { name: /^Confirm$/ }));
    await waitFor(() => expect(properties()).toHaveAttribute('data-source-revision', '3'));
    await expect(properties()).toHaveAttribute('data-source-event', eventId);
    await expect(bookshop()).toHaveAttribute('data-scene-revision', '1');
    await userEvent.click(await canvas.findByRole('button', { name: 'Edit inline event' }));
    const clickWait = within(await body.findByRole('dialog', { name: /^Inline wait$/ }));
    const automatic = clickWait.getByRole('spinbutton', { name: /^Wait in auto mode \(ms\)/ });
    await expect(automatic).toBeDisabled();
    await userEvent.clear(clickWait.getByRole('spinbutton', { name: /^Duration in milliseconds/ }));
    await userEvent.type(automatic, '0');
    await userEvent.click(clickWait.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(properties()).toHaveAttribute('data-source-revision', '4'));
    await expect(properties()).toHaveAttribute('data-source-event', eventId);
    await userEvent.click(await canvas.findByRole('button', { name: 'Edit inline event' }));
    const persisted = within(await body.findByRole('dialog', { name: /^Inline wait$/ }));
    await expect(persisted.getByRole('spinbutton', { name: /^Wait in auto mode \(ms\)/ })).toHaveValue(0);
    await userEvent.click(persisted.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(body.queryByRole('dialog', { name: /^Inline wait$/ })).toBeNull());
  },
};
export const SceneDecor: Story = {
  args: { page: 'editor', locale: 'en' },
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole('button', { name: 'Layout' }));
    await userEvent.click(await body.findByRole('menuitem', { name: 'Writing and stage' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Scene decor' }));
    const decor = within(await canvas.findByRole('region', { name: 'Scene decor' }));
    for (const assetId of [FixtureIds.background, figureId]) {
      await userEvent.click(await decor.findByRole('button', { name: 'Add decor layer' }));
      const dialog = await body.findByRole('dialog', { name: /Decor image$/ });
      const picker = within(dialog);
      await userEvent.click(picker.getByRole('button', { name: /^All$/ }));
      const option = () => dialog.querySelector<HTMLButtonElement>(`[data-asset-option="${assetId}"]`);
      await waitFor(() => expect(option()).toBeVisible());
      await userEvent.click(option()!);
      await userEvent.click(picker.getByRole('button', { name: /^Apply$/ }));
      await waitFor(() => expect(body.queryByRole('dialog', { name: /Decor image$/ })).toBeNull());
    }
    await userEvent.click(await decor.findByRole('button', { name: 'Move up' }));
    await expect(decor.getByRole('button', { name: 'Move up' })).toBeDisabled();
    await expect(decor.getByRole('button', { name: 'Move down' })).toBeEnabled();
    await userEvent.click(decor.getByRole('checkbox', { name: 'Show layer' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Apply changes' }));
    await canvas.findByText(/^Applied · Unsaved/);
    await expect(decor.getByRole('checkbox', { name: 'Show layer' })).not.toBeChecked();
  },
};
export const EnglishPages:Story={args:{page:'pages',locale:'en'}};
export const JapanesePages:Story={args:{page:'pages',locale:'ja',theme:'dark'}};
