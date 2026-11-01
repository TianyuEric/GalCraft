import { editorText as translate } from './editor-text.js';
import './editor-fields.css';
import { useEffect, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Pipette } from 'lucide-react';
import { Button, Choice } from '../controls.js';
import { ColorPicker, ColorPickerArea, ColorPickerHueSlider, ColorPickerAlphaSlider,
  parseColorString, rgbToHex, colorToString } from './vendor/dice-color-picker.js';

type Format = 'hex' | 'rgb' | 'hsl';
export type ColorInputDraft = { baseline:string;draft:string;text:string;format:Format };
export function StudioColorField({ value, allowAlpha, disabled, label, locale = 'zh-CN', onPreview, onCommit, onSession,inputDraft,onInputDraftChange }: {
  locale?: string; label?: string; value: string; allowAlpha: boolean; disabled?: boolean;
  onPreview(value: string): void; onCommit(value: string): void | Promise<void>; onSession(active: boolean): void;
  inputDraft?:ColorInputDraft|null;onInputDraftChange?(draft:ColorInputDraft|null):void;
}) {
  const t = (text: string) => translate(text, locale);
  const [open, setOpen] = useState(!!inputDraft), [draft, setDraft] = useState(inputDraft?.draft??value), [accepted, setAccepted] = useState(value);
  useEffect(() => setAccepted(value), [value]);
  const [format, setFormat] = useState<Format>(inputDraft?.format??'hex'), [text, setText] = useState(inputDraft?.text??value), [error, setError] = useState(inputDraft&&!parseColorString(inputDraft.text)?t('请输入完整的 HEX、RGB 或 HSL 色值。'):'');
  const [sampling, setSampling] = useState(false), [sampleMessage, setSampleMessage] = useState('');
  const committing = useRef(false);
  const [pending, setPending] = useState(false);
  const start = useRef(inputDraft?.baseline??value), current = useRef(inputDraft?.draft??value), composing = useRef(false);
  useEffect(()=>{onInputDraftChange?.(open?{baseline:start.current,draft,text,format}:null);},[open,draft,text,format,onInputDraftChange]);
  const input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const native = useRef<AbortController | null>(null);
  useEffect(() => () => native.current?.abort(), []);
  const display = (color: string, nextFormat = format) => colorToString(parseColorString(color)!, nextFormat);
  const preview = (next: string, updateText = true) => {
    if (committing.current) return;
    const parsed = parseColorString(next);
    if (!parsed) return;
    const normalized = rgbToHex({ ...parsed, a: allowAlpha ? parsed.a : 1 });
    current.current = normalized; setDraft(normalized); onPreview(normalized);
    if (updateText) { setText(display(normalized)); setError(''); }
  };
  const close = async (cancel: boolean) => {
    if (committing.current) return false;
    if (!cancel && error) { input.current?.focus(); return false; }
    committing.current = true; setPending(true);
    try { if (cancel) onPreview(start.current); else if (current.current !== start.current) await onCommit(current.current); }
    catch (reason) { setError(String(reason instanceof Error ? reason.message : reason)); return false; }
    finally { committing.current = false; setPending(false); }
    setAccepted(cancel ? start.current : current.current); setOpen(false); onSession(false); return true;
  };
  const sample = async () => {
    if (!window.EyeDropper) return;
    native.current = new AbortController(); setSampling(true); setSampleMessage(t("正在屏幕取色…"));
    try {
      const result = await new window.EyeDropper().open({ signal: native.current.signal });
      const alpha = parseColorString(current.current)!.a;
      preview(rgbToHex({ ...parseColorString(result.sRGBHex)!, a: alpha }));
      setSampleMessage(t("已取色，可继续调整或确认。"));
    } catch (reason) {
      setSampleMessage(reason instanceof DOMException && reason.name === 'AbortError' ? t("已取消取色，面板内的调整仍保留。") : t("取色未完成，请重试或输入色值。"));
    } finally { setSampling(false); native.current = null; }
  };
  return <Popover.Root open={open} onOpenChange={(next, details) => {
    if (next) {
      start.current = accepted; current.current = accepted; setDraft(accepted); setText(display(accepted)); setError(''); setSampleMessage('');
      setOpen(true); onSession(true);
    } else {
      if (sampling || committing.current || composing.current) { details.cancel(); return; }
      details.cancel(); const escape = details.reason === 'escape-key';
      void close(escape).then(closed => { if (closed && escape) trigger.current?.focus(); });
    }
  }}>
    <Popover.Trigger data-slot="studio-editor-control" ref={trigger} disabled={disabled} className="candidate-color-trigger" aria-label={label ?? t("编辑颜色")}>
      <span className="candidate-checker"><i style={{ background: open ? draft : accepted }} /></span><span>{(open ? draft : accepted).toUpperCase()}</span>
    </Popover.Trigger>
    <Popover.Portal container={document.getElementById('studio-portals')}>
      <Popover.Positioner align="end" sideOffset={4} collisionPadding={12} className="candidate-positioner">
        <Popover.Popup className="candidate-color-popup" initialFocus={input} finalFocus={(type) => type === 'keyboard' ? trigger.current : false}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={event => {
            if (composing.current || event.nativeEvent.isComposing || sampling) return;
            // A portaled format list owns its Enter/Escape; only this panel handles its own keys.
            if (!event.currentTarget.contains(event.target as Node) || (event.target as Element).closest('[role="listbox"]')) return;
            if (event.key === 'Enter' && event.target === input.current) { event.preventDefault(); void close(false).then(ok => { if (ok) trigger.current?.focus(); }); }
          }}>
          <header><Popover.Title>{t("调整颜色")}</Popover.Title><span>{allowAlpha ? t("含透明度") : t("RGB · 不含透明度")}</span></header>
          <ColorPicker inline value={draft} onValueChange={preview} className="candidate-dice">
            <ColorPickerArea aria-label={t("饱和度与明度色板；也可在色值输入框精确输入")} />
            <label>{t("色相")}<ColorPickerHueSlider /></label>
            {allowAlpha && <label>{t('不透明度')} · {Math.round(parseColorString(draft)!.a * 100)}%<ColorPickerAlphaSlider /></label>}
          </ColorPicker>
          <div className="candidate-format-row">
            <Choice label={t("颜色格式")} value={format} options={['hex','rgb','hsl'].map(value => ({value,label:value.toUpperCase()}))}
              onChange={next => { setFormat(next as Format); setText(display(current.current, next as Format)); setError(''); }} />
            <Button aria-label={t("屏幕取色")} title={window.EyeDropper ? t("从屏幕选择颜色") : t("当前环境不支持屏幕取色")} disabled={!window.EyeDropper || sampling || pending} onClick={() => void sample()}><Pipette size={16}/></Button>
          </div>
          <label className="candidate-color-value">色值
            <input data-slot="studio-editor-control" ref={input} disabled={pending} aria-label={t("颜色值")} aria-invalid={!!error} aria-describedby="candidate-color-help" value={text}
              onChange={event => {
                setText(event.target.value);
                const parsed = parseColorString(event.target.value);
                if (!parsed) setError(t("请输入完整的 HEX、RGB 或 HSL 色值。"));
                else if (!allowAlpha && parsed.a !== 1) setError(t("此字段只接受不透明颜色。"));
                else { setError(''); preview(event.target.value, false); }
              }} />
          </label>
          <p id="candidate-color-help" className={error ? 'candidate-error' : 'candidate-hint'} role={error ? 'alert' : undefined}>{error || t("实时预览 · Enter 或外点确认 · Esc 还原")}</p>
          {sampleMessage && <p className="candidate-hint" role="status">{sampleMessage}</p>}
          {!window.EyeDropper && <p className="candidate-hint">{t("当前环境不支持屏幕取色，可直接输入色值。")}</p>}
          <footer><Button disabled={sampling || pending} onClick={() => { void close(true).then(() => trigger.current?.focus()); }}>{t("取消")}</Button><Button tone="primary" disabled={sampling || pending || !!error} onClick={() => { void close(false).then(ok => { if (ok) trigger.current?.focus(); }); }}>{t("确认颜色")}</Button></footer>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>;
}
