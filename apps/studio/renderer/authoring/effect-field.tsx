import { useState } from 'react';
import type { FieldSpec, Json } from '@galcraft/contracts';
import { StudioNumberField } from '../components/editor-fields/StudioNumberField.js';
import { StudioColorField } from '../components/editor-fields/StudioColorField.js';
import { parseColorString, rgbToHex } from '../components/editor-fields/vendor/dice-color-picker.js';
import { Button } from '../components/controls.js';
import { extendedFieldLabel, fieldHint } from './field-help.js';
import './effect-field.css';

/** Values stay in the enclosing visual-effects draft until its Apply action. */
export function EffectField({ spec, value, change, locale }: { spec: FieldSpec; value: unknown; change(value: Json): void; locale: string }) {
  const label = extendedFieldLabel(spec, locale);
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const [number, setNumber] = useState<number | null>(typeof value === 'number' ? value : null);
  const [rgb, setRgb] = useState(Array.isArray(value) ? value.map(Number) : [255, 255, 255]);
  const [enabled, setEnabled] = useState(Array.isArray(value));
  if (spec.path === 'rgb') {
    const update = (text: string) => { const parsed = parseColorString(text)!; const next = [Math.round(parsed.r), Math.round(parsed.g), Math.round(parsed.b)]; setRgb(next); if (enabled) change(next); };
    return <div className="effect-color-field"><label className="check-row"><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); change(event.target.checked ? rgb : null); }}/>{t('启用颜色叠加','Enable tint','色調を有効にする')}</label>
      <div className="effect-color-actions"><StudioColorField label={t('编辑颜色叠加','Edit tint','色調を編集')} locale={locale} value={rgbToHex({ r: rgb[0]!, g: rgb[1]!, b: rgb[2]!, a: 1 })} allowAlpha={false} disabled={!enabled} onPreview={update} onCommit={update} onSession={() => {}}/>
        <Button tone="quiet" disabled={!enabled} onClick={() => update('#ffffff')}>{t('重置','Reset','リセット')}</Button></div></div>;
  }
  const unit = spec.path === 'rotationDeg' ? '°' : ['x','y','blur','thickness'].includes(spec.path) ? 'px' : '';
  const sliders: Record<string, [number, number, number]> = { x: [-1920,1920,1], y: [-1080,1080,1], rotationDeg: [-180,180,1], opacity: [0,1,.01], scaleX: [0,3,.01], scaleY: [0,3,.01], blur: [0,40,.1], brightness: [0,3,.01], contrast: [0,3,.01], saturation: [0,3,.01], gamma: [.01,3,.01] };
  const range = sliders[spec.path], step = spec.type === 'integer' ? 1 : range?.[2] ?? .01;
  const preview = (next: number | null) => { setNumber(next); change(next); };
  return <div className="effect-number-field"><StudioNumberField allowEmpty label={label} value={number} min={spec.min} max={spec.max} step={step} unit={unit} locale={locale} onPreview={preview} onCommit={preview}/>
    {range && <input data-slot="studio-editor-control" type="range" aria-label={`${label} · ${t('滑块','slider','スライダー')}`} min={spec.min ?? range[0]} max={spec.max ?? range[1]} step={step} value={number ?? Number(spec.default ?? range[0])} onChange={event => preview(Number(event.target.value))}/>}
    <p className="field-help">{fieldHint(spec, label, locale)} · {t('留空沿用当前状态','Leave blank to keep the current state','空欄は現在の状態を継承')}</p></div>;
}
