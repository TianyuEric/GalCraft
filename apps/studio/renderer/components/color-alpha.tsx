import { useEffect, useState } from 'react';
import { Field } from './controls.js';
import { Input } from './ui/input.js';
import './color-alpha.css';

const parts = (value: string) => {
  const hex = /^#([\da-f]{6})([\da-f]{2})?$/i.exec(value);
  if (!hex && value !== 'transparent' && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context) { context.fillStyle = value; context.fillRect(0, 0, 1, 1); const rgba = context.getImageData(0, 0, 1, 1).data;
      return { color: `#${[...rgba.slice(0, 3)].map(channel => channel.toString(16).padStart(2, '0')).join('')}`, alpha: Math.round(rgba[3] / 255 * 100) }; }
  }
  return { color: hex ? `#${hex[1]}` : '#000000', alpha: value === 'transparent' ? 0 : hex?.[2] ? Math.round(parseInt(hex[2], 16) / 255 * 100) : 100 };
};
export function colorAlphaValue(color: string, opacity = 1) { const value = parts(color); return `${value.color}${Math.round(value.alpha / 100 * Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0')}`; }
/** A continuous gesture becomes one authored change when the author releases it. */
export function ColorAlpha({ label, value, locale = 'zh-CN', onChange }: { label: string; value: string; locale?: string; onChange(value: string): void }) {
  const [draft, setDraft] = useState(() => parts(value));
  useEffect(() => setDraft(parts(value)), [value]);
  const opacity = locale === 'en' ? 'Opacity' : locale === 'ja' ? '不透明度' : '不透明度';
  const commit = (next = draft) => { const original = parts(value); const result = `${next.color}${Math.round(next.alpha / 100 * 255).toString(16).padStart(2, '0')}`; if (original.color.toLowerCase() !== next.color.toLowerCase() || original.alpha !== next.alpha) onChange(result); };
  return <Field label={label}><div className="gc-color-alpha">
    <span className="gc-color-alpha-swatch"><i style={{ background: value }}/><Input type="color" aria-label={label} value={draft.color} onChange={event => setDraft({ ...draft, color: event.target.value })} onBlur={() => commit()}/></span>
    <input type="range" style={{width:0,flex:'1 1 40px'}} min={0} max={100} aria-label={`${label} · ${opacity}`} value={draft.alpha} onChange={event => setDraft({ ...draft, alpha: Number(event.target.value) })} onPointerUp={() => commit()} onKeyUp={event => { if (['ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key)) commit(); }}/>
    <Input type="number" inputContainerClassName="gc-color-alpha-number" min={0} max={100} step={1} aria-label={`${label} · ${opacity} %`} value={draft.alpha} onChange={event => { const alpha = event.target.valueAsNumber; if (Number.isFinite(alpha)) setDraft({ ...draft, alpha: Math.max(0, Math.min(100, alpha)) }); }} onBlur={() => commit()}/><span>%</span>
  </div></Field>;
}
