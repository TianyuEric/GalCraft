import { useState } from 'react';
import type { Json } from '@galcraft/contracts';
import { Button } from '../components/controls.js';
import { CodeBlock } from '../components/code-block.js';
import { MessageBox } from '../components/workbench/MessageBox.js';
import './recovered-input.css';

export type RecoveredInputGroup = { title: string; fields: {label:string;value:string}[]; open?():void };
export function RecoveredInput({ locale, groups, raw, close, discard }: {locale:string;groups:RecoveredInputGroup[];raw:Json|null;close():void;discard():void}) {
  const t = (zh:string,en:string,ja:string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [confirm, setConfirm] = useState(false);
  return <section className="recovered-input">
    <header><h2>{t('保留的未应用输入','Retained unapplied input','保持した未適用の入力')}</h2><Button onClick={close}>{t('保留并关闭','Keep and close','保持して閉じる')}</Button></header>
    <p>{t('这些输入来自先前的编辑会话。选择原编辑器复核后应用，或放弃已不需要的输入。作品中已保存的内容保持可用。','These inputs came from an earlier editing session. Review them in the original editor or discard inputs you no longer need. Saved work remains available.','以前の編集セッションの入力です。元の編集画面で確認・適用するか、不要な入力を破棄してください。保存済みの作品は引き続き利用できます。')}</p>
    {groups.map((group,index)=><section className="recovered-input-group" key={index}><header><h3>{group.title}</h3>{group.open&&<Button onClick={group.open}>{t('返回编辑器复核','Review in editor','編集画面で確認')}</Button>}</header>
      <dl>{group.fields.map((field,at)=><div key={at}><dt>{field.label}</dt><dd><div>{field.value}</div><Button tone="quiet" onClick={()=>void navigator.clipboard.writeText(field.value)}>{t('复制','Copy','コピー')}</Button></dd></div>)}</dl>
    </section>)}
    {raw!==null&&<details className="recovered-input-details"><summary>{t('完整输入与技术详情','Complete input and technical details','全入力と技術情報')}</summary><CodeBlock code={JSON.stringify(raw,null,2)} locale={locale}/></details>}
    <footer><Button tone="danger" onClick={()=>setConfirm(true)}>{t('放弃保留输入','Discard retained input','保持した入力を破棄')}</Button></footer>
    {confirm&&<MessageBox title={t('放弃这些未应用输入？','Discard this unapplied input?','未適用の入力を破棄しますか？')} description={t('只移除这里保留的输入。作品中已应用和保存的内容会保留。','This removes only the inputs retained here. Applied and saved work is preserved.','ここに保持した入力のみを削除します。適用・保存済みの作品は保持します。')} cancelLabel={t('取消','Cancel','キャンセル')} onClose={()=>setConfirm(false)} actions={[{label:t('放弃输入','Discard input','入力を破棄'),tone:'danger',run:discard}]}/>}
  </section>;
}
