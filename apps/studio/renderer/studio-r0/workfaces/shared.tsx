import type { CSSProperties, ReactNode } from 'react';
import { AudioLines, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { expressionNames, type Character, type Expression, type Part } from '../model.js';
import { figureUrl, sampleLayers, sampleLayerStyle } from './sample-composition.js';

export type WorkfaceProps = { onOpen?: (viewId: string) => void };
export { practice, figureUrl } from './sample-composition.js';
export const expressions = Object.keys(expressionNames) as Expression[];
export const outfitNames: Record<string, string> = { casual: '便服', school: '衣装色差样例', alternate: '衣装色差样例', formal: '衣装色差样例' };
export const outfitName = (outfit: string) => outfitNames[outfit] ?? outfit;

export function PaneHeader({ title, icon, children }: { title: ReactNode; icon?: ReactNode; children?: ReactNode }) {
  return <header className="gc-r0-wf-header"><h3>{icon}{title}</h3>{children && <div className="gc-r0-wf-actions">{children}</div>}</header>;
}

export function NumberField({ label, value, onChange, min, max, unit = 'px' }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; unit?: string }) {
  return <label className="gc-r0-wf-number"><span>{label}</span><span className="gc-r0-wf-number-input"><input type="number" aria-label={label} value={value} min={min} max={max} onChange={event => { const next = event.currentTarget.valueAsNumber; if (Number.isFinite(next)) onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, next))); }} />{unit && <span aria-hidden="true">{unit}</span>}</span></label>;
}

export function Visibility({ visible, label, onChange }: { visible: boolean; label: string; onChange: (visible: boolean) => void }) {
  return <button type="button" className="gc-r0-wf-icon" title={label} aria-label={label} aria-pressed={visible} onClick={() => onChange(!visible)}>{visible ? <Eye /> : <EyeOff />}</button>;
}

export function OffsetFields({ x, y, onChange, label = '偏移' }: { x: number; y: number; onChange: (patch: { x?: number; y?: number }) => void; label?: string }) {
  return <div className="gc-r0-wf-offset"><NumberField label={`${label} X`} value={x} onChange={x => onChange({ x })} /><NumberField label={`${label} Y`} value={y} onChange={y => onChange({ y })} /><button type="button" className="gc-r0-wf-icon" aria-label={`重置${label}`} title={`重置${label}`} onClick={() => onChange({ x: 0, y: 0 })}><RotateCcw /></button></div>;
}

export function selectCharacter(characters: Character[], source: { kind: string; id: string; characterId?: string }, preferred?: string) {
  const id = source.characterId ?? (source.kind === 'character' ? source.id : undefined);
  return characters.find(c => c.id === id) ?? characters.find(c => c.id === preferred) ?? characters[1] ?? characters[0];
}

export function Face({ src, name }: { src: string; name: string }) {
  return <span className="gc-r0-wf-face"><img src={src} alt={name} draggable={false} /></span>;
}

export function Figure({ character, expression, outfit, parts, override, className = '', moving = false, blink = false, playing = false }: {
  character: Pick<Character, 'name' | 'prefix'>; expression: Expression; outfit: string; parts: Part[]; override?: string; className?: string; moving?: boolean; blink?: boolean; playing?: boolean;
}) {
  const layers = sampleLayers(character, outfit, expression, parts, override);
  const face = layers.find(layer => layer.crop === 'face');
  const style: CSSProperties = face ? { transform: sampleLayerStyle(face).transform } : {};
  return <div className={`gc-r0-wf-figure ${className}`} data-blink={blink && playing} data-mouth={moving && playing} role="img" aria-label={`${character.name} · ${outfitName(outfit)} · ${expressionNames[expression]}`}>
    {layers.map((layer, index) => <img key={`${layer.crop}-${index}`} src={layer.image} alt="" style={sampleLayerStyle(layer)} draggable={false} />)}
    {playing && moving && face && <img className="gc-r0-wf-figure-mouth" src={figureUrl(character.prefix, 'smile')} alt="" style={style} draggable={false} />}
    {playing && blink && face && <img className="gc-r0-wf-figure-blink" src={figureUrl(character.prefix, 'smile')} alt="" style={style} draggable={false} />}
  </div>;
}

export function AudioSample({ playing, onPlaying }: { playing: boolean; onPlaying: (value: boolean) => void }) {
  return <button type="button" aria-pressed={playing} onClick={() => onPlaying(!playing)}><AudioLines />{playing ? '暂停口型／眨眼预览' : '预览口型／眨眼'}</button>;
}
