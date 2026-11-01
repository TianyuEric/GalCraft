import { useId, useMemo, useRef, useState } from 'react';
import type { ContextPart } from '@galcraft/authoring/production';
import { compactContextParts, textCharacters, type InputTextSummary } from '@galcraft/authoring/production/preview';
import { Button, Choice } from '../../components/controls.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { CodeBlock } from '../../components/code-block.js';
import { TextPreview } from '../../components/text-preview.js';
import { updateContextPart } from './context-table-model.js';
import './workflow.css';

const kinds: Record<ContextPart['kind'], [string, string, string]> = {
  instruction: ['创作要求', 'Request', '制作の要望'], setting: ['作品设定', 'Setting', '作品設定'], character: ['角色', 'Character', 'キャラクター'],
  script: ['剧本', 'Script', 'シナリオ'], media: ['参考素材', 'Reference media', '参照素材'], ui: ['页面', 'Pages', 'ページ'], style: ['样式', 'Style', 'スタイル'], assetCatalog: ['素材目录', 'Asset catalog', '素材一覧'],
};
function readableContext(text: string, locale = 'zh-CN'): string {
  const items=(count:number)=>locale==='en'?`${count} items`:locale==='ja'?`${count} 件`:`${count} 项`;
  let value: unknown; try { value=JSON.parse(text); } catch { return text; }
  const describe=(item:unknown):string=>{
    if(typeof item==='string')return item;
    if(Array.isArray(item))return item.map(describe).filter(Boolean).join(' · ');
    if(item&&typeof item==='object'){const record=item as Record<string,unknown>;return ['name','label','title','description','text','setting','style','audienceNotes','summary','specification','notes'].flatMap(key=>typeof record[key]==='string'&&record[key]?[String(record[key])]:[]).join(' · ');}
    return '';
  };
  if(Array.isArray(value))return value.map(describe).filter(Boolean).join('\n')||items(value.length);
  return describe(value)|| (value&&typeof value==='object'?Object.entries(value).map(([key,child])=>`${key}: ${Array.isArray(child)?items(child.length):describe(child)||(locale==='en'?'Structured content':locale==='ja'?'構造化された内容':'结构化内容')}`).join('\n'):String(value));
}
export function ContextTable({ parts, change, locale, removable = false, requestSummary, estimated = false, pendingStep = false, requestSteps = [] }: {
  parts: ContextPart[]; change(parts: ContextPart[]): void; locale: string; removable?: boolean; requestSummary?: InputTextSummary | null; estimated?: boolean; pendingStep?: boolean; requestSteps?: {label:string;characters:number}[];
}) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [search, setSearch] = useState(''), [kind, setKind] = useState('all'), [selection, setSelection] = useState('all'), [editing, setEditing] = useState<string | null>(null), [opened, setOpened] = useState<string | null>(parts[0]?.id ?? null);
  const sourceButtons = useRef(new Map<string, HTMLButtonElement>());
  const detailId=useId(), projected=useMemo(()=>compactContextParts(parts).context,[parts]);
  const selected=projected.filter(part=>part.included), characters=selected.reduce((sum,part)=>sum+textCharacters(part.text??''),0), attachments=selected.filter(part=>part.attachment).length;
  const expanded=parts.find(part=>part.id===opened), sentText=projected.find(part=>part.id===opened)?.text??'';
  const rows = parts.filter(part => (kind === 'all' || part.kind === kind) && (selection === 'all' || part.included === (selection === 'included')) && `${part.label} ${part.text ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const included = parts.filter(part => part.included).length, hidden = parts.filter(part => part.included && !rows.some(row => row.id === part.id)).length;
  const sourceStatus = (part: ContextPart) => part.sourceRemoved ? t('来源已移除','Source removed','出典削除済み') : part.sourceText !== undefined ? t('来源已变化','Source changed','出典変更あり') : part.authorEdited ? t('本次改写','Edited input','今回の編集') : !part.source ? t('独立输入','Independent input','独立した入力') : t('来源同步','Source current','出典と同期');
  return <section className="context-table"><div className="context-send-summary" role="status" aria-label={t('发送统计','Send statistics','送信統計')}>
    <span>{t('已选上下文','Selected context','選択した資料')}: {selected.length} / {parts.length} · <strong>{characters.toLocaleString(locale)} {t('字符','characters','文字')}</strong></span>
    <span>{t('上下文附件','Context attachments','資料の添付')}: {attachments}</span>
    {requestSteps.length>1&&<small>{requestSteps.map(step=>`${step.label}: ${step.characters.toLocaleString(locale)} ${t('字符','characters','文字')}`).join(' · ')}</small>}
    {requestSummary!==undefined && <><span>{t('本次文本合计','Request text total','今回の送信テキスト')}: <strong>{requestSummary?`${estimated?t('预估 ','Estimated ','推定 '):''}${requestSummary.textCharacters.toLocaleString(locale)} ${t('字符','characters','文字')}`:t('待参数齐备后计算','Complete parameters to calculate','パラメーターの入力後に計算')}</strong></span>{requestSummary&&<span>{t('系统规则','System rules','システムルール')}: {requestSummary.systemCharacters.toLocaleString(locale)} · {t('消息文本','Message text','メッセージ')}: {requestSummary.messageCharacters.toLocaleString(locale)}</span>}</>}
    <small>{t('字符数包含文本中的空格与换行；附件单列，字符数不等于 token。','Characters include spaces and newlines; attachments are separate. Characters are not tokens.','空白と改行を含む文字数です。添付は別集計で、トークン数ではありません。')}{pendingStep&&t(' 后续步骤的输入待上一准备结果确定。',' Later inputs depend on the preparation result.',' 後続の入力は準備結果の確定後に集計します。')}</small>
  </div><div className="workflow-table-tools"><Input aria-label={t('搜索上下文', 'Search context', '作品情報を検索')} placeholder={t('搜索名称或内容…', 'Search name or content…', '名前・内容を検索…')} value={search} onChange={e => setSearch(e.target.value)}/>
      <Choice label={t('上下文类型', 'Context type', '作品情報の種類')} value={kind} onChange={setKind} options={[{ value: 'all', label: t('全部类型', 'All types', 'すべての種類') }, ...[...new Set(parts.map(part => part.kind))].map(value => ({ value, label: t(...kinds[value]) }))]}/>
      <Choice label={t('发送状态', 'Send status', '送信状態')} value={selection} onChange={setSelection} options={[{ value: 'all', label: t('全部状态', 'All states', 'すべての状態') }, { value: 'included', label: t('已选择发送', 'Included', '送信対象') }, { value: 'excluded', label: t('不发送', 'Excluded', '送信しない') }]}/>
      <span role="status">{t('已选择', 'Selected', '選択済み')} {included} / {parts.length}{hidden > 0 && ` · ${hidden} ${t('项被筛选隐藏', 'hidden by filters', '件がフィルターで非表示')}`}</span></div>
    <p className="context-keyboard-help">{t('清单内用 ↑↓ 浏览，Enter 进入详情；详情中可返回清单。','Use ↑↓ to browse the list and Enter for details. Return to the list from details.','↑↓で一覧を移動し、Enterで詳細へ。詳細から一覧に戻れます。')}</p><div className="context-workspace"><ul className="context-source-list" aria-label={t('上下文发送范围', 'Context request scope', '作品情報の送信範囲')}>
      {rows.map(part => <li key={part.id} data-selected={opened === part.id}>
        <input type="checkbox" aria-label={`${t('发送', 'Send', '送信')} ${part.label}`} checked={part.included} onChange={event => change(updateContextPart(parts, part.id, { included: event.target.checked }))}/>
        <button ref={node => { if (node) sourceButtons.current.set(part.id, node); else sourceButtons.current.delete(part.id); }} type="button" className="context-source-open" aria-label={`${part.label} · ${t(...kinds[part.kind])} · ${sourceStatus(part)}`} aria-pressed={opened === part.id} aria-controls={detailId} onClick={() => { setOpened(part.id); setEditing(null); requestAnimationFrame(() => document.getElementById(detailId)?.focus()); }} onKeyDown={event => {
          const buttons = [...sourceButtons.current.values()].filter(button => button.isConnected), index = buttons.indexOf(event.currentTarget);
          const next = event.key === 'ArrowDown' ? buttons[index + 1] : event.key === 'ArrowUp' ? buttons[index - 1] : event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons.at(-1) : null;
          if (next) { event.preventDefault(); next.focus(); }
        }}>
          <strong>{part.label}</strong><small>{t(...kinds[part.kind])} · {sourceStatus(part)}</small>
          <span className="context-preview">{part.text === null ? part.attachment?.mime ?? part.media?.mime ?? t('参考素材','Reference media','参照素材') : readableContext(part.text, locale) || t('空内容','Empty content','内容なし')}</span>
        </button>
      </li>)}
      {!rows.length && <li className="context-list-empty"><p>{parts.length ? t('没有符合筛选的上下文。','No context matches these filters.','条件に一致する情報はありません。') : t('还没有上下文。','No context yet.','作品情報はまだありません。')}</p>{parts.length > 0 && <Button tone="quiet" onClick={() => {setSearch('');setKind('all');setSelection('all');}}>{t('清除筛选','Clear filters','絞り込みを解除')}</Button>}</li>}
    </ul>
    <section className="context-text-editor" id={detailId} tabIndex={-1} aria-label={t('上下文详情','Context details','資料の詳細')}>
      {expanded ? <><header><strong>{expanded.label}</strong><div className="gc-actions"><Button tone="quiet" onClick={() => sourceButtons.current.get(expanded.id)?.focus()}>{t('返回清单','Back to list','一覧へ戻る')}</Button>{expanded.text !== null && <Button tone="quiet" aria-pressed={editing === expanded.id} onClick={() => setEditing(editing === expanded.id ? null : expanded.id)}>{editing === expanded.id ? t('查看发送预览','Preview sent text','送信内容を確認') : t('编辑本次发送文本','Edit this input','今回の入力を編集')}</Button>}{removable && <Button tone="danger" onClick={() => {change(parts.filter(part => part.id !== expanded.id));setOpened(null);setEditing(null);}}>{t('移除','Remove','削除')}</Button>}</div></header>
        {(expanded.sourceText !== undefined || expanded.sourceRemoved) && <div className="context-source-change" role="status"><strong>{expanded.sourceRemoved ? t('来源已移除','Source removed','出典削除済み') : t('来源已变化','Source changed','出典変更あり')}</strong>{expanded.sourceText !== undefined && <><p>{readableContext(expanded.sourceText ?? '',locale)}</p><Button tone="quiet" onClick={() => change(parts.map(part => part.id === expanded.id ? {...part,text:part.sourceText ?? '',authorEdited:false,sourceText:undefined} : part))}>{t('更新输入','Update input','入力を更新')}</Button></>}<Button tone="quiet" onClick={() => change(parts.map(part => part.id === expanded.id ? {...part,source:part.sourceRemoved ? null : part.source,sourceText:undefined,sourceRemoved:false} : part))}>{t('保留改写','Keep edit','編集を保持')}</Button></div>}
        {expanded.text !== null ? editing === expanded.id ? <Textarea autoFocus rows={10} aria-label={`${t('编辑','Edit','編集')} ${expanded.label}`} value={expanded.text} onChange={event => change(updateContextPart(parts, expanded.id, {text:event.target.value}))}/> : /^[\[{]/.test(sentText.trim()) || expanded.kind === 'script' || expanded.kind === 'style' ? <CodeBlock code={sentText} language={expanded.kind === 'style' ? 'css' : /^[\[{]/.test(sentText.trim()) ? 'json' : 'text'} locale={locale}/> : <TextPreview text={sentText} locale={locale}/> : <p>{expanded.attachment ? `${expanded.attachment.mime} · ${expanded.attachment.width} × ${expanded.attachment.height}` : expanded.media?.mime ?? t('参考素材','Reference media','参照素材')}</p>}
      </> : <p>{t('选择上下文，查看完整发送内容或编辑本次输入。','Select context to read the complete sent content or edit this input.','作品情報を選択して送信内容の確認・編集を行います。')}</p>}
    </section></div>
  </section>;
}
