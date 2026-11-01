import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DataTable, type DataTableColumn } from './data-table.js';
import { Choice, Button } from './controls.js';
import { Input } from './ui/input.js';
import './controls.css';

type ReferenceRow = { id:string; name:string; selected:boolean; mode:string; note:string };
function Example({ theme='light' }: { theme?:'light'|'dark' }) {
  const [rows,setRows] = useState<ReferenceRow[]>(Array.from({length:18},(_,i)=>({id:`item-${i}`,name:`${String(i+1).padStart(2,'0')} · ${i%2?'关联角色与长名称参考资料':'章节与剧情资料'}`,selected:i<3,mode:'summary',note:''})));
  const [search,setSearch] = useState(''),[last,setLast]=useState('');
  const update=(id:string,patch:Partial<ReferenceRow>)=>setRows(values=>values.map(row=>row.id===id?{...row,...patch}:row));
  const columns:DataTableColumn<ReferenceRow>[]=[
    {id:'selected',header:'发送',width:'60px',cell:row=><input type="checkbox" aria-label={`发送 ${row.name}`} checked={row.selected} onChange={e=>update(row.id,{selected:e.target.checked})}/>},
    {id:'name',header:'资料',sortValue:row=>row.name,cell:row=><strong>{row.name}</strong>},
    {id:'mode',header:'内容范围',width:'180px',cell:row=><Choice label={`${row.name} 内容范围`} value={row.mode} options={[{value:'summary',label:'摘要'},{value:'full',label:'完整内容'}]} onChange={mode=>update(row.id,{mode})}/>},
    {id:'note',header:'备注',cell:row=><Input aria-label={`${row.name} 备注`} value={row.note} onChange={e=>update(row.id,{note:e.target.value})}/>},
    {id:'action',header:'操作',width:'80px',cell:row=><Button onClick={()=>setLast(row.id)}>查看</Button>},
  ];
  return <div id="app" data-theme={theme} style={{padding:24}}><div id="studio-portals" data-theme={theme} lang="zh-CN"/><DataTable rows={rows.filter(row=>row.name.includes(search))} columns={columns} getRowId={row=>row.id} label="上下文资料交互表格" empty="没有匹配资料" toolbar={<><Input aria-label="搜索资料" value={search} onChange={e=>setSearch(e.target.value)} style={{width:220}}/><span>已选 {rows.filter(row=>row.selected).length} 项</span></>}/><p role="status">{last && `当前查看 ${last}`}</p></div>;
}
const meta={title:'Components/Interactive table',component:Example,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Example>;
export default meta;
export const Light:StoryObj<typeof meta>={};
export const Dark:StoryObj<typeof meta>={args:{theme:'dark'}};
