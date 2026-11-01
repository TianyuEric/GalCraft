import { useState } from 'react';
import { Copy } from 'lucide-react';
import { Button } from './controls.js';

/** A labelled technical identifier, kept subordinate to the object's display name. */
export function Identity({label,value,locale='zh-CN'}:{label:string;value:string;locale?:string}){
  const [status,setStatus]=useState('');
  const t=(zh:string,en:string,ja:string)=>locale==='en'?en:locale==='ja'?ja:zh;
  return <div className="gc-identity"><span>{label}: <code>{value}</code></span><Button tone="quiet" aria-label={`${t('复制','Copy','コピー')} ${label}`} onClick={()=>void navigator.clipboard.writeText(value).then(()=>setStatus(t('已复制','Copied','コピー済み')),()=>setStatus(t('请选中标识后复制','Select the ID to copy','IDを選択してコピーしてください')))}><Copy size={14}/></Button><small role="status">{status}</small></div>;
}
