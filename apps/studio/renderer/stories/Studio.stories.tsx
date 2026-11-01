import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { mountAuthoring } from '../authoring/view.js';
import { studioFixture, type ProductState } from './studio-fixture.js';
import { componentSceneRequest } from './page-component-fixture.js';
import { productSnapshot } from './product-fixture.js';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';

type Page = 'projects' | 'editor' | 'assets' | 'pages' | 'production' | 'plugins' | 'publish';

function StudioPage({ page, state='normal', locale='zh-CN', theme='light',components=false }: { page: Page; state?:ProductState; locale?:'zh-CN'|'en'|'ja';theme?:'light'|'dark';components?:boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    if (!root.current) return;
    let active = true;
    // Enter the requested workspace before injecting a refresh failure/loading state.
    // These routes await their first query before making the page active.
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
        // Production's mounted session polls; assets refreshes through the same route.
        if (page === 'assets') void workspace.navigate(page);
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
export const PageDesigner:Story={args:{page:'pages'}};
export const PageDesignerDark:Story={args:{page:'pages',theme:'dark'}};
export const PageComponents:Story={args:{page:'pages',components:true},play:async({canvas,canvasElement})=>{
  await canvas.findByRole('button',{name:'展开 基础组件工作页'},{timeout:60000});
  await userEvent.click(canvas.getByRole('button',{name:'展开 基础组件工作页'}));
  const tree=()=>within(canvas.getByRole('tree',{name:'页面组件'}));
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
  await userEvent.click(canvas.getByRole('button',{name:'导航预览'}));
  const player=canvasElement.querySelector('.designer-player')!;
  await waitFor(()=>expect(player.querySelector('[data-gc-page="component-workspace"]')).toBeTruthy());
  await userEvent.click(within(player as HTMLElement).getByRole('button',{name:'打开标题页'}));
  await waitFor(()=>expect(player.querySelector('[data-gc-page="character-intro"]')).toBeTruthy());
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
export const EnglishPages:Story={args:{page:'pages',locale:'en'}};
export const JapanesePages:Story={args:{page:'pages',locale:'ja',theme:'dark'}};
