import { exitDialog } from './motion.js';
import { useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Field, Modal } from './controls.js';
import { Input } from './ui/input.js';
import { Textarea } from './ui/textarea.js';
import { MessageBox } from './workbench/MessageBox.js';

export function requestDialog(options: { title: string; description?: string; content?: ReactNode; confirmLabel?: string; initialValue?: string; input?: boolean; multiline?: boolean; locale: string; destructive?: boolean; review?: boolean; pin?(): void; confirm?(): Promise<void> }): Promise<string | null> {
  const origin = document.activeElement as HTMLElement | null;
  const node = document.createElement('div');
  (document.getElementById('studio-portals') ?? document.body).append(node);
  const root = createRoot(node);
  return new Promise(resolve => {
    let finishing = false, ownDialog: HTMLElement | null = null;
    const finish = async (value: string | null) => { if (finishing) return; finishing = true; await exitDialog(ownDialog); root.unmount(); node.remove(); if (origin?.isConnected) origin.focus(); resolve(value); };
    function Request() {
      const [value, setValue] = useState(options.initialValue ?? ''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
      const t = (zh: string, en: string, ja: string) => options.locale === 'en' ? en : options.locale === 'ja' ? ja : zh;
      if (options.destructive && !options.input) return <MessageBox title={options.title} description={<>{options.description}{options.content}</>} cancelLabel={t('取消', 'Cancel', 'キャンセル')} onClose={() => void finish(null)} actions={[{ label: options.confirmLabel ?? t('确认', 'Confirm', '確認'), tone: 'danger', run: () => void finish('confirmed') }]}/>;
      return <Modal title={options.title} className={options.review ? 'gc-save-review' : ''} close={() => { if(!busy) void finish(null); }}>
        <form ref={node => { ownDialog = node?.closest<HTMLElement>('[data-slot=dialog-content]') ?? null; }} onKeyDown={event => { if(event.nativeEvent.isComposing && event.key==='Enter')event.preventDefault(); }} onSubmit={event => { event.preventDefault(); if(busy)return; if (options.input && !value.trim()) { setError(t('请填写此必填项', 'Complete this required field', '必須項目を入力してください')); return; } void (async()=>{setBusy(true);setError('');try{await options.confirm?.();await finish(options.input ? value : 'confirmed');}catch(reason){setError(reason instanceof Error?reason.message:String(reason));setBusy(false);}})(); }}>
          {options.description && <p className="request-description">{options.description}</p>}
          {options.content}
          {options.input && <Field label={options.title} required error={error}>{options.multiline
            ? <Textarea required autoFocus value={value} onChange={event => { setValue(event.target.value); setError(''); }} className="min-h-40" />
            : <Input required autoFocus value={value} onChange={event => { setValue(event.target.value); setError(''); }} />}</Field>}
          {!options.input && error && <p role="alert" className="workbench-error">{error}</p>}
          <footer className="dialog-actions">{options.pin && <Button disabled={busy} onClick={() => { void finish(null).then(() => options.pin!()); }}>{t('固定到工作区', 'Pin to workspace', 'ワークスペースに固定')}</Button>}<Button disabled={busy} onClick={() => finish(null)}>{t('取消', 'Cancel', 'キャンセル')}</Button>
            <Button type="submit" disabled={busy} tone={options.destructive ? 'danger' : 'primary'}>{options.confirmLabel ?? t('确认', 'Confirm', '確認')}</Button></footer>
        </form>
      </Modal>;
    }
    root.render(<Request />);
  });
}
