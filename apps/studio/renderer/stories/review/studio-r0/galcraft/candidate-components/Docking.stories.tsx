import {useRef,useState} from 'react';
import type {Meta,StoryObj} from '@storybook/react-vite';
import {expect,userEvent,waitFor,within} from 'storybook/test';
import {CandidateDockWorkspace,type DockHandle,type LayoutPreset} from '../../../../../review/studio-candidate/components/CandidateDockWorkspace.js';
import {CandidateButton,CandidateToolbar} from '../../../../../review/studio-candidate/components/controls/index.js';
import '../../../../../styles/studio-theme.css';
import '../../../../../review/studio-candidate/styles/studio.css';
const initialText={street:'绮白：等一下……你听，灯亮起来了。',station:'澜汐：末班车进站了。'};
const titles:Record<string,string>={'writing:street':'街道文稿','source:street':'街道源码','writing:station':'车站文稿',outline:'剧情目录',inspector:'属性',assets:'素材',stage:'舞台'};
function Example({initial='balanced',theme='light'}:{initial?:LayoutPreset;theme?:'light'|'dark'}){
  const dock=useRef<DockHandle>(null),[draft,setDraft]=useState(initialText),[saved,setSaved]=useState(initialText),[notice,setNotice]=useState('');
  const dirty=(id:string)=>{const key=id.split(':')[1] as keyof typeof draft;return !!key&&draft[key]!==saved[key];};
  return <div className="gc-candidate authoring-shell" data-theme={theme} style={{display:'flex',flexDirection:'column',height:'100vh'}}>
    <CandidateToolbar label="组件检查"><CandidateButton onClick={()=>dock.current?.open('writing:station',{preview:true})}>预览车站文稿</CandidateButton><CandidateButton onClick={()=>dock.current?.open('source:street')}>切换街道源码</CandidateButton><CandidateButton onClick={()=>dock.current?.open('stage')}>打开舞台</CandidateButton><CandidateButton onClick={()=>{setSaved(draft);setNotice('草稿已保存');}}>保存草稿</CandidateButton></CandidateToolbar>
    <CandidateDockWorkspace ref={dock} initial={initial} sceneId="street" sceneIds={['street','station']} viewIds={Object.keys(titles)} storageKey={`zoned-story:${initial}:${theme}`}
      title={id=>titles[id]??id} onActivate={()=>{}} notice={setNotice} status={id=>({dirty:dirty(id)})}
      onClose={id=>{if(dirty(id)){setNotice('请先保存此文稿的草稿');return false;}return true;}}
      renderView={id=>{const key=id.split(':')[1] as keyof typeof draft;return key?<label style={{display:'flex',flexDirection:'column',padding:12,height:'100%'}}>{titles[id]}内容<textarea aria-label={titles[id]+'内容'} style={{flex:1,resize:'none'}} value={draft[key]} onChange={event=>setDraft({...draft,[key]:event.target.value})}/></label>:<div style={{padding:12}}>{titles[id]}工作面</div>;}}/>
    <footer role="status">{notice}</footer>
  </div>;
}
const meta={title:'Review/Studio/R0/GalCraft R0/候选组件/分区工作台',component:Example,parameters:{layout:'fullscreen',controls:{disable:true}},beforeEach:({args})=>{
  const key=`galcraft-studio-candidate:zoned-story:${args.initial??'balanced'}:${args.theme??'light'}:layout`;
  for(const suffix of ['','：v2',':v2',':legacy-backup'])localStorage.removeItem(key+suffix);
}} satisfies Meta<typeof Example>;
export default meta;type Story=StoryObj<typeof meta>;
export const Zones:Story={name:'侧栏、中央与底栏'};
export const Documents:Story={name:'两个对象并排',args:{initial:'documents',theme:'dark'},play:async({canvas})=>{
  const street=canvas.getByRole('textbox',{name:'街道文稿内容'}),station=canvas.getByRole('textbox',{name:'车站文稿内容'});
  await userEvent.type(station,' 请上车。');await expect(street).toHaveValue(initialText.street);await expect(station).toHaveValue(initialText.station+' 请上车。');
}};
export const TabActions:Story={name:'标签目标、预览保留与脏输入守卫',play:async({canvas,canvasElement})=>{
  await userEvent.click(canvas.getByRole('button',{name:'预览车站文稿'}));
  const station=canvas.getByRole('textbox',{name:'车站文稿内容'});await userEvent.type(station,' 未保存');
  await userEvent.click(canvas.getByRole('button',{name:'关闭 车站文稿'}));await expect(canvas.getByRole('status')).toHaveTextContent('请先保存');await expect(station).toBeVisible();
  await userEvent.click(canvas.getByRole('button',{name:'保存草稿'}));
  const street=canvas.getByRole('tab',{name:'街道文稿'});street.focus();await userEvent.keyboard('{Shift>}{F10}{/Shift}');
  const menu=await within(canvasElement.ownerDocument.body).findByRole('menu');
  await userEvent.click(within(menu).getByRole('menuitem',{name:/关闭右侧/}));
  await waitFor(()=>expect(canvas.queryByRole('tab',{name:'车站文稿'})).not.toBeInTheDocument());
  await expect(street).toBeVisible();await expect(canvas.getByRole('region',{name:'属性'})).toBeVisible();
  await userEvent.click(canvas.getByRole('button',{name:'切换街道源码'}));
  await expect(canvas.queryByRole('tab',{name:'街道文稿'})).not.toBeInTheDocument();await expect(canvas.getByRole('textbox',{name:'街道源码内容'})).toHaveValue(initialText.street);
}};
