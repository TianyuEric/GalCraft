import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Id } from '@galcraft/contracts';
import { Button, Choice, Field, Modal } from '../components/controls.js';
import { showContentPopover } from '../components/workbench/content-popover.js';
import { exitDialog } from '../components/motion.js';
import { resolveMovePosition, type MoveInstructionsModel, type MovePosition } from './move-instructions-model.js';
import './move-instructions-dialog.css';

export type MoveInstructionsDialogProps = { model: MoveInstructionsModel; locale: string; initialTargetId?: string; close(): void;
  move(targetSceneId: Id, position: MovePosition, beforeId: Id | null): Promise<string | null> };

export function MoveInstructionsDialog({ model, locale, close, move, initialTargetId = "" }: MoveInstructionsDialogProps) {
  const [targetId, setTargetId] = useState(initialTargetId), [position, setPosition] = useState<MovePosition>('end'), [beforeId, setBeforeId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const target = model.scenes.find(scene => scene.id === targetId), resolved = target ? resolveMovePosition(target, position, beforeId || null, locale) : null;
  const before = target?.instructions.find(instruction => instruction.id === beforeId);
  const confirmLabel = !target ? t('移动所选指令', 'Move selected instructions', '選択した命令を移動') : position === 'before' ?
    t(`移动到「${target.name}」指定指令前`, `Move to “${target.name}” before the chosen instruction`, `「${target.name}」の指定命令の前へ移動`) : position === 'start' ?
      t(`移动到「${target.name}」开头`, `Move to the start of “${target.name}”`, `「${target.name}」の先頭へ移動`) :
      t(`移动到「${target.name}」末尾`, `Move to the end of “${target.name}”`, `「${target.name}」の末尾へ移動`);
  const blocker = model.error || error;
  return <Modal title={t('移动所选指令', 'Move selected instructions', '選択した命令を移動')} className="move-instructions-dialog" close={() => { if (!busy) close(); }}>
    <form onSubmit={event => {
      event.preventDefault(); if (!target || !resolved || resolved.error || blocker || busy) return;
      setBusy(true); void move(target.id, position, resolved.beforeId).then(reason => { if (reason) { setError(reason); setBusy(false); } })
        .catch(reason => { setError(String(reason)); setBusy(false); });
    }}>
      <p className="move-instructions-summary">{t(`从「${model.sourceName}」移动 ${model.instructions.length} 条指令`,
        `Move ${model.instructions.length} instructions from “${model.sourceName}”`, `「${model.sourceName}」から ${model.instructions.length} 件の命令を移動`)}</p>
      <ol className="move-instructions-preview" aria-label={t('所选指令预览', 'Selected instruction preview', '選択した命令のプレビュー')}>
        {model.instructions.slice(0, 3).map(instruction => <li key={instruction.id}><strong>{instruction.name}</strong>{instruction.preview && <span>{instruction.preview}</span>}</li>)}
      </ol>
      {model.instructions.length > 3 && <p className="move-instructions-more">{t(`另有 ${model.instructions.length - 3} 条指令`, `${model.instructions.length - 3} more instructions`, `ほか ${model.instructions.length - 3} 件`)}</p>}
      <Field label={t('目标场景', 'Target scene', '移動先のシーン')} required error={target?.error} help={!model.scenes.length ? t('作品中还没有其他场景。请先创建目标场景。', 'There are no other scenes. Create a target scene first.', 'ほかのシーンがありません。先に移動先を作成してください。') : undefined}>
        <Choice label={t('请选择目标场景', 'Choose a target scene', '移動先のシーンを選択')} value={targetId} disabled={busy || !!model.error || !model.scenes.length}
          options={[{ value: '', label: t('请选择目标场景', 'Choose a target scene', '移動先のシーンを選択') }, ...model.scenes.map(scene => ({ value: scene.id, label: scene.label }))]}
          onChange={value => { setTargetId(value); setBeforeId(''); setError(''); }}/>
      </Field>
      <Field label={t('插入位置', 'Insert position', '挿入位置')}>
        <Choice label={t('插入位置', 'Insert position', '挿入位置')} value={position} disabled={busy || !target || !!target.error || !!model.error}
          options={[{ value: 'end', label: t('末尾', 'End', '末尾') }, { value: 'start', label: t('开头', 'Start', '先頭') }, { value: 'before', label: t('指定指令前', 'Before an instruction', '指定命令の前') }]}
          onChange={value => { setPosition(value as MovePosition); setError(''); }}/>
      </Field>
      {position === 'before' && target && <Field label={t('指定指令', 'Instruction', '指定命令')} required error={resolved?.error}>
        <Choice label={t('请选择指令', 'Choose an instruction', '命令を選択')} value={beforeId} disabled={busy || !!target.error || !target.instructions.length}
          options={[{ value: '', label: t('请选择指令', 'Choose an instruction', '命令を選択') }, ...target.instructions.map((instruction, index) => ({ value: instruction.id, label: `${index + 1}. ${instruction.name}${instruction.preview ? ` · ${instruction.preview}` : ''}` }))]}
          onChange={value => { setBeforeId(value); setError(''); }}/>
      </Field>}
      {before && position === 'before' && <p className="move-instructions-position">{t(`插入到「${before.name}${before.preview ? ` · ${before.preview}` : ''}」之前。`,
        `Insert before “${before.name}${before.preview ? ` · ${before.preview}` : ''}”.`, `「${before.name}${before.preview ? ` · ${before.preview}` : ''}」の前に挿入します。`)}</p>}
      <p className="move-instructions-help">{t('移动后进入目标场景并选中这些指令。整批移动可一次撤销；保存时包含关联场景。',
        'After moving, open the target scene with these instructions selected. Undo restores the whole move; saving includes the linked scenes.',
        '移動後は移動先を開き、これらの命令を選択します。一度の操作で元に戻せます。保存には関連シーンを含みます。')}</p>
      {blocker && <p className="field-error" role="alert">{blocker}</p>}
      <footer className="dialog-actions"><Button disabled={busy} onClick={close}>{t('取消', 'Cancel', 'キャンセル')}</Button>
        <Button type="submit" tone="primary" disabled={busy || !target || !!resolved?.error || !!blocker}>{busy ? t('正在移动…', 'Moving…', '移動中…') : confirmLabel}</Button></footer>
    </form>
  </Modal>;
}

function mountDetailedMoveInstructions(options: Omit<MoveInstructionsDialogProps, 'close'> & { moved(): void }) {
  const node = document.createElement('div'); (document.getElementById('studio-portals') ?? document.body).append(node);
  const root = createRoot(node); let closing = false;
  const close = async (moved = false) => { if (closing) return; closing = true;
    await exitDialog(node.querySelector('[data-slot="dialog-content"]')); root.unmount(); node.remove(); if (moved) options.moved(); };
  root.render(<MoveInstructionsDialog {...options} close={() => { void close(); }} move={async (...args) => {
    const error = await options.move(...args); if (!error) await close(true); return error;
  }}/>);
}

/** Keep the common destination choice anchored; open one detailed review only for an exact insertion point. */
export function mountMoveInstructionsDialog(options: Omit<MoveInstructionsDialogProps, 'close'> & { moved(): void }) {
  const {model, locale} = options, t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const form = document.createElement('form'); form.className = 'move-instructions-popover';
  const summary = document.createElement('p'); summary.textContent = t(`从「${model.sourceName}」移动所选 ${model.instructions.length} 条指令`, `Move ${model.instructions.length} selected instructions from “${model.sourceName}”`, `「${model.sourceName}」から選択した ${model.instructions.length} 件の命令を移動`);
  const search = document.createElement('input'); search.type = 'search'; search.placeholder = t('搜索目标场景', 'Search target scenes', '移動先のシーンを検索'); search.setAttribute('aria-label', search.placeholder);
  const choices = document.createElement('div'); choices.className = 'move-target-options'; choices.setAttribute('role','listbox'); choices.setAttribute('aria-label',t('目标场景','Target scene','移動先のシーン'));
  const position = document.createElement('select'); position.setAttribute('aria-label',t('插入位置','Insert position','挿入位置'));
  for(const [value, label] of [['end',t('末尾','End','末尾')],['start',t('开头','Start','先頭')]]) { const option = document.createElement('option'); option.value=value!;option.textContent=label!;position.append(option); }
  const error = document.createElement('p'); error.setAttribute('role','alert'); error.className = 'field-error'; error.textContent=model.error;
  const actions = document.createElement('footer'); actions.className = 'dialog-actions';
  const cancel=document.createElement('button'), advanced=document.createElement('button'), apply=document.createElement('button');
  cancel.type=advanced.type='button';apply.type='submit'; for(const button of [cancel,advanced,apply])button.className='studio-button';
  cancel.textContent=t('取消','Cancel','キャンセル');advanced.textContent=t('指定指令前…','Before an instruction…','指定命令の前…');apply.textContent=t('移动所选指令','Move selected instructions','選択した命令を移動');
  let targetId='', busy=false;
  const render=()=>{choices.replaceChildren();for(const scene of model.scenes.filter(scene=>scene.label.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()))){const button=document.createElement('button');button.type='button';button.className='studio-button';button.setAttribute('role','option');button.setAttribute('aria-selected',String(targetId===scene.id));button.textContent=scene.label;button.disabled=busy||!!model.error;button.onclick=()=>{targetId=scene.id;error.textContent=scene.error;render();};choices.append(button);}if(!choices.childElementCount){const empty=document.createElement('p');empty.textContent=t('没有匹配场景','No matching scenes','一致するシーンがありません');choices.append(empty);}apply.disabled=advanced.disabled=busy||!targetId||!!model.error||!!model.scenes.find(scene=>scene.id===targetId)?.error;};
  form.append(summary,search,choices,position,error,actions);actions.append(cancel,advanced,apply);
  const popover=showContentPopover(form,document.activeElement instanceof HTMLElement?document.activeElement:null,t('移动所选指令','Move selected instructions','選択した命令を移動'));
  cancel.onclick=()=>popover.close();search.oninput=render;
  advanced.onclick=()=>{popover.close();mountDetailedMoveInstructions({...options,initialTargetId:targetId});};
  form.addEventListener('keydown',event=>{if(event.isComposing&&event.key==='Enter')event.preventDefault();});
  form.onsubmit=event=>{event.preventDefault();if(apply.disabled)return;const target=model.scenes.find(scene=>scene.id===targetId)!;const resolved=resolveMovePosition(target,position.value as MovePosition,null,locale);if(resolved.error){error.textContent=resolved.error;return;}busy=true;render();search.disabled=position.disabled=cancel.disabled=true;void options.move(target.id,position.value as MovePosition,resolved.beforeId).then(reason=>{if(reason)error.textContent=reason;else{popover.close();options.moved();}}).catch(reason=>{error.textContent=String(reason);}).finally(()=>{busy=false;search.disabled=position.disabled=cancel.disabled=false;render();});};
  render();
}
