import { useEffect, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Pipette } from 'lucide-react';
import { editorText } from '../../../../components/editor-fields/editor-text.js';
import { ColorPicker, ColorPickerArea, ColorPickerHueSlider, ColorPickerAlphaSlider,
  parseColorString, rgbToHex, colorToString } from '../../../../components/editor-fields/vendor/dice-color-picker.js';
import { CandidateButton, CandidateIconButton, CandidateInput } from './primitives.js';
import { CandidateField } from './fields.js';
import './color.css';

const formats = ['hex', 'rgb', 'hsl'] as const;
type Format = typeof formats[number];
export type ColorInputDraft = { baseline: string; draft: string; text: string; format: Format };

export function CandidateColorField({ value, allowAlpha, disabled, label, locale = 'zh-CN', onPreview, onCommit, onSession, inputDraft, onInputDraftChange }: {
  locale?: string;
  label?: string;
  value: string;
  allowAlpha: boolean;
  disabled?: boolean;
  onPreview(value: string): void;
  onCommit(value: string): void | Promise<void>;
  onSession(active: boolean): void;
  inputDraft?: ColorInputDraft | null;
  onInputDraftChange?(draft: ColorInputDraft | null): void;
}) {
  const t = (text: string) => editorText(text, locale);
  const [open, setOpen] = useState(!!inputDraft);
  const [draft, setDraft] = useState(inputDraft?.draft ?? value);
  const [accepted, setAccepted] = useState(value);
  const [format, setFormat] = useState<Format>(inputDraft?.format ?? 'hex');
  const [text, setText] = useState(inputDraft?.text ?? value);
  const [error, setError] = useState(inputDraft && !parseColorString(inputDraft.text) ? t('请输入完整的 HEX、RGB 或 HSL 色值。') : '');
  const [commitError, setCommitError] = useState('');
  const [pending, setPending] = useState(false);
  const [sampling, setSampling] = useState(false);
  const [sampleMessage, setSampleMessage] = useState('');
  const committing = useRef(false);
  const composing = useRef(false);
  const start = useRef(inputDraft?.baseline ?? value);
  const current = useRef(inputDraft?.draft ?? value);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const native = useRef<AbortController | null>(null);
  useEffect(() => setAccepted(value), [value]);
  useEffect(() => () => native.current?.abort(), []);
  useEffect(() => {
    onInputDraftChange?.(open ? { baseline: start.current, draft, text, format } : null);
  }, [open, draft, text, format, onInputDraftChange]);

  const display = (color: string, nextFormat = format) => {
    const parsed = parseColorString(color);
    return parsed ? colorToString(parsed, nextFormat) : color;
  };
  const preview = (next: string, updateText = true) => {
    const parsed = parseColorString(next);
    if (committing.current || !parsed) return;
    const normalized = rgbToHex({ ...parsed, a: allowAlpha ? parsed.a : 1 });
    current.current = normalized;
    setDraft(normalized);
    setCommitError('');
    onPreview(normalized);
    if (updateText) { setText(display(normalized)); setError(''); }
  };
  const close = async (cancel: boolean) => {
    if (committing.current) return false;
    if (!cancel && error) { input.current?.focus(); return false; }
    committing.current = true;
    setPending(true);
    try {
      if (cancel) onPreview(start.current);
      else if (current.current !== start.current) await onCommit(current.current);
    } catch (reason) {
      setCommitError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      committing.current = false;
      setPending(false);
    }
    setAccepted(cancel ? start.current : current.current);
    setOpen(false);
    onSession(false);
    return true;
  };
  const closeAndFocus = (cancel: boolean) => {
    void close(cancel).then(closed => { if (closed) trigger.current?.focus(); });
  };
  const sample = async () => {
    if (!window.EyeDropper) return;
    native.current = new AbortController();
    setSampling(true);
    setSampleMessage(t('正在屏幕取色…'));
    try {
      const result = await new window.EyeDropper().open({ signal: native.current.signal });
      const picked = parseColorString(result.sRGBHex);
      if (picked) preview(rgbToHex({ ...picked, a: parseColorString(current.current)?.a ?? 1 }));
      setSampleMessage(t('已取色，可继续调整或确认。'));
    } catch (reason) {
      setSampleMessage(reason instanceof DOMException && reason.name === 'AbortError'
        ? t('已取消取色，面板内的调整仍保留。') : t('取色未完成，请重试或输入色值。'));
    } finally { setSampling(false); native.current = null; }
  };

  const triggerColor = open ? draft : accepted;
  return <Popover.Root open={open} onOpenChange={(next, details) => {
    if (next) {
      start.current = accepted;
      current.current = accepted;
      setDraft(accepted);
      setText(display(accepted));
      setError('');
      setCommitError('');
      setSampleMessage('');
      setOpen(true);
      onSession(true);
    } else {
      details.cancel();
      if (sampling || committing.current || composing.current) return;
      if (details.reason === 'escape-key') closeAndFocus(true);
      else void close(false);
    }
  }}>
    <Popover.Trigger ref={trigger} disabled={disabled} aria-label={label ?? t('编辑颜色')}
      render={<CandidateButton density="compact" variant="outline" className="gc-candidate-color-trigger"/>}>
      <span className="gc-candidate-color-swatch" aria-hidden="true"><i style={{ background: triggerColor }}/></span>
      <span>{triggerColor.toUpperCase()}</span>
    </Popover.Trigger>
    <Popover.Portal container={document.getElementById('studio-portals')}>
      <Popover.Positioner align="end" sideOffset={4} collisionPadding={12} className="gc-candidate-color-positioner">
        <Popover.Popup className="gc-candidate-color-popup" initialFocus={input} finalFocus={false}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={event => {
            if (composing.current || event.nativeEvent.isComposing || sampling) return;
            if (event.key === 'Enter' && event.target === input.current) { event.preventDefault(); closeAndFocus(false); }
          }}>
          <header><Popover.Title>{t('调整颜色')}</Popover.Title><span>{allowAlpha ? t('含透明度') : t('RGB · 不含透明度')}</span></header>
          <ColorPicker inline value={draft} onValueChange={preview} className="gc-candidate-color-picker">
            <ColorPickerArea aria-label={t('饱和度与明度色板；也可在色值输入框精确输入')}/>
            <label>{t('色相')}<ColorPickerHueSlider/></label>
            {allowAlpha && <label>{t('不透明度')} · {Math.round((parseColorString(draft)?.a ?? 1) * 100)}%<ColorPickerAlphaSlider/></label>}
          </ColorPicker>
          <div className="gc-candidate-color-formats" role="group" aria-label={t('颜色格式')}>
            {formats.map(option => <CandidateButton key={option} variant={option === format ? 'secondary' : 'outline'} aria-pressed={option === format}
              disabled={sampling || pending} onClick={() => {
                setFormat(option); setText(display(current.current, option)); setError(''); setCommitError('');
              }}>{option.toUpperCase()}</CandidateButton>)}
            <CandidateIconButton label={t('屏幕取色')} title={window.EyeDropper ? t('从屏幕选择颜色') : t('当前环境不支持屏幕取色')}
              disabled={!window.EyeDropper || sampling || pending} onClick={() => void sample()}><Pipette size={16}/></CandidateIconButton>
          </div>
          <CandidateField label={t('颜色值')} error={error && <span role="alert">{error}</span>}
            hint={!error && t('实时预览 · Enter 或外点确认 · Esc 还原')}>
            <CandidateInput ref={input} disabled={pending || sampling} value={text}
              onChange={event => {
                const next = event.currentTarget.value;
                setText(next);
                setCommitError('');
                const parsed = parseColorString(next);
                if (!parsed) setError(t('请输入完整的 HEX、RGB 或 HSL 色值。'));
                else if (!allowAlpha && parsed.a !== 1) setError(t('此字段只接受不透明颜色。'));
                else { setError(''); preview(next, false); }
              }}/>
          </CandidateField>
          {commitError && <p className="gc-candidate-field-error" role="alert">{commitError}</p>}
          {sampleMessage && <p className="gc-candidate-field-hint" role="status">{sampleMessage}</p>}
          {!window.EyeDropper && <p className="gc-candidate-field-hint">{t('当前环境不支持屏幕取色，可直接输入色值。')}</p>}
          <footer>
            <CandidateButton variant="secondary" disabled={sampling || pending} onClick={() => closeAndFocus(true)}>{t('取消')}</CandidateButton>
            <CandidateButton variant="primary" disabled={sampling || pending || !!error} onClick={() => closeAndFocus(false)}>{t('确认颜色')}</CandidateButton>
          </footer>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>;
}
