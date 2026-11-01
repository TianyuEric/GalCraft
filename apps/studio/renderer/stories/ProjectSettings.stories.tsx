import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { FixtureCharacters, FixtureProject, FixtureIds } from '@galcraft/contracts/fixtures';
import type { EditReceipt, PlayerName, StudioPreferences } from '@galcraft/contracts';
import { createPlayerNameEditor } from '../authoring/player-name.js';
import { AuthoringController, type AuthoringServices } from '../authoring/controller.js';
import { Button } from '../components/controls.js';
import { mountAuthoring } from '../authoring/view.js';
import { studioFixture } from './studio-fixture.js';
import '../authoring/shell.css';

function Settings({policy='firstAndAfterCompletion',locale='zh-CN',allowCustom=true}:{policy?:PlayerName['promptPolicy'];locale?:StudioPreferences['locale'];allowCustom?:boolean}) {
  const root = useRef<HTMLDivElement>(null), [active, setActive] = useState(true), [state, setState] = useState('');
  useEffect(() => {
    const controller = new AuthoringController({} as AuthoringServices);
    controller.preferences.locale=locale;
    controller.source = { projectDocumentId: FixtureIds.projectA, projectRevision: 1, projectSavedRevision: 1, projectDirty: false, project: structuredClone(FixtureProject), characters: structuredClone(FixtureCharacters).map((item, index) => ({ ...item, narrativeRole: index === 0 ? 'viewpoint' : 'supporting' })), scenes: [] };
    controller.source.project.player.name={characterId:controller.source.characters[0]!.id,defaultName:'玩家',allowCustom,variableId:allowCustom?FixtureIds.relation:null,maxLength:8,promptPolicy:policy};
    controller.source.variables=[{id:FixtureIds.relation,name:'主角姓名',type:'string',scope:'progress',initial:'玩家',declaringSceneId:null}];
    controller.setPlayerName = async input => { if (input?.defaultName === '错误') throw new Error('保存失败'); setState(input?.defaultName ?? '关闭'); return { ok: true, value: {} as EditReceipt, warnings: [] }; };
    const editor = createPlayerNameEditor(controller, () => {}, dirty => setState(dirty ? '待应用' : '清洁'))!; root.current?.append(editor.root); return () => {editor.dispose();editor.root.remove();};
  }, [policy,locale,allowCustom]);
  return <div id="app" className="authoring-shell" style={{ display: 'block', padding: 20 }}><Button onClick={() => setActive(!active)}>切换文档</Button><output>{state}</output><div ref={root} hidden={!active}/>{!active && <p>场景文档</p>}</div>;
}
const meta = { title: 'Product/Studio/Project/Settings', component: Settings, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Settings>;
export default meta;
export const NameSettings: StoryObj<typeof meta> = {};
export const EveryNewGame: StoryObj<typeof meta> = {args:{policy:'always'}};
export const FixedName: StoryObj<typeof meta> = {args:{allowCustom:false}};
export const Japanese: StoryObj<typeof meta> = {args:{locale:'ja'}};

function DelayedApplyWorkspace() {
  const host=useRef<HTMLDivElement>(null),release=useRef<(()=>void)|null>(null);
  const [ready,setReady]=useState(false),[waiting,setWaiting]=useState(false),[saveChecks,setSaveChecks]=useState(0),[error,setError]=useState('');
  useEffect(()=>{
    let active=true,workspace:Awaited<ReturnType<typeof mountAuthoring>>|null=null;
    const {services}=studioFixture('normal','zh-CN','light'),container=document.createElement('div');container.id='app';host.current?.append(container);
    let gate:Promise<void>|null=null;
    void(async()=>{
      const controller=new AuthoringController(services);await controller.open();
      await controller.setPlayerName({characterId:controller.source!.characters.find(character=>character.narrativeRole==='viewpoint')!.id,defaultName:'玩家',allowCustom:true,variableId:null,maxLength:8,promptPolicy:'firstAndAfterCompletion'});
      workspace=await mountAuthoring(container,services);if(!active){workspace.dispose();return;}
      await workspace.openDocument({kind:'project',title:'作品设置'});
      const read=services.read,apply=services.bridge.documents.applyEdit,planSave=services.bridge.documents.planSave;
      services.read=async()=>{if(gate)await gate;return read();};
      services.bridge.documents.applyEdit=async(...args)=>{const result=await apply(...args);if(result.ok){gate=new Promise<void>(resolve=>{release.current=()=>{gate=null;release.current=null;setWaiting(false);resolve();};});setWaiting(true);}return result;};
      services.bridge.documents.planSave=async(...args)=>{setSaveChecks(count=>count+1);return planSave(...args);};
      setReady(true);
    })().catch(reason=>setError(String(reason)));
    return()=>{active=false;release.current?.();workspace?.dispose();container.remove();};
  },[]);
  return <><div className="authoring-shell" style={{display:'block',padding:12}}><Button disabled={!waiting} onClick={()=>release.current?.()}>完成宿主响应</Button><output aria-label="保存检查次数">{saveChecks}</output><span>{ready?'工作区已就绪':'正在打开工作区'}</span>{error&&<p role="alert">{error}</p>}</div><div ref={host}/></>;
}
export const SaveDuringNameApply: StoryObj<typeof meta> = {
  render:()=> <DelayedApplyWorkspace/>,
  play:async({canvas})=>{
    await canvas.findByText('工作区已就绪',{}, {timeout:60000});
    await userEvent.click(canvas.getByRole('button',{name:'增加姓名长度上限'}));
    await userEvent.click(canvas.getByRole('button',{name:'应用姓名设置'}));
    await canvas.findByRole('button',{name:'正在应用姓名设置…'});
    await expect(canvas.getByLabelText('默认姓名',{exact:true})).toBeDisabled();
    await expect(canvas.getByLabelText('姓名长度上限',{exact:true})).toBeDisabled();
    await userEvent.click(canvas.getByRole('button',{name:'保存全部'}));
    await expect(canvas.getByLabelText('保存检查次数')).toHaveTextContent('0');
    await expect(canvas.queryByText(/主角姓名仍有未应用输入/)).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button',{name:'完成宿主响应'}));
    await waitFor(()=>expect(canvas.getByLabelText('保存检查次数')).toHaveTextContent('1'));
    await expect(canvas.getByRole('button',{name:'应用姓名设置'})).toBeDisabled();
    await expect(canvas.getByLabelText('姓名长度上限',{exact:true})).toHaveValue('9');
  },
};
export const ApplyFailureRetainsInput: StoryObj<typeof meta> = {
  play:async({canvas})=>{
    const name=await canvas.findByLabelText('默认姓名',{exact:true});
    await userEvent.clear(name);await userEvent.type(name,'错误');
    await userEvent.click(canvas.getByRole('button',{name:'应用姓名设置'}));
    await canvas.findByText('保存失败');
    await expect(name).toHaveValue('错误');
    await expect(canvas.getByRole('button',{name:'应用姓名设置'})).toBeEnabled();
    await expect(canvas.getByRole('button',{name:'还原未应用输入'})).toBeEnabled();
  },
};
