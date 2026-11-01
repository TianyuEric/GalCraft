import { editorText as translate } from '../components/editor-fields/editor-text.js';
import { useEffect } from 'react';
import type { FieldSpec, Json } from '@galcraft/contracts';
import { StudioNumberField } from '../components/editor-fields/StudioNumberField.js';
import { StudioColorField } from '../components/editor-fields/StudioColorField.js';
import { parseColorString, rgbToHex } from '../components/editor-fields/vendor/dice-color-picker.js';

export function SceneVisualFields({ value, fields, disabled, locale, preview, commit, end }: {
  value: Record<string, Json>; fields: FieldSpec[]; disabled: boolean; locale: string;
  preview(field: string, value: Json): void; commit(field: string, value: Json): Promise<void>; end(): void;
}) {
  const t = (text: string) => translate(text, locale);
  useEffect(() => () => end(), []);
  const x = fields.find(field => field.path === 'x');
  const rgb = Array.isArray(value.rgb) ? value.rgb : [255, 255, 255];
  const color = rgbToHex({ r: Number(rgb[0]), g: Number(rgb[1]), b: Number(rgb[2]), a: 1 });
  const parse = (text: string) => { const color = parseColorString(text)!; return [Math.round(color.r), Math.round(color.g), Math.round(color.b)]; };
  return <section className="scene-visual-fields" aria-label={t("常用视觉属性")}>
    {x && <StudioNumberField label={t("横向偏移")} value={typeof value.x === 'number' ? value.x : 0} min={x.min} max={x.max} step={1} unit="px" locale={locale} disabled={disabled}
      onPreview={next => preview('effects.x', next)} onCommit={next => commit('effects.x', next)}/>}
    <span>{t("颜色")}</span><StudioColorField locale={locale} value={color} allowAlpha={false} disabled={disabled} onPreview={next => preview('effects.rgb', parse(next))}
      onCommit={next => commit('effects.rgb', parse(next))} onSession={active => { if (!active) end(); }}/>
  </section>;
}
