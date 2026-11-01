import { useState, useRef, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { RgbColorPicker } from 'react-colorful';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.js';
import { Button } from './controls.js';

type RGB = [number, number, number];
export function ColorField({ value, onChange, locale }: { value: RGB | null; onChange(value: RGB | null): void; locale: string }) {
  const [enabled, setEnabled] = useState(value !== null), [rgb, setRgb] = useState<RGB>(value ?? [255,255,255]);
  const field=useRef<HTMLDivElement>(null), [container,setContainer]=useState<HTMLElement|null>(null);
  useLayoutEffect(()=>{setContainer(field.current?.closest('dialog') ?? document.getElementById('studio-portals'));},[]);
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const update = (next: RGB) => { setRgb(next); if (enabled) onChange(next); };
  const css = `rgb(${rgb.join(',')})`;
  return <div className="gc-color-field" ref={field}>
    <label className="check-row"><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); onChange(event.target.checked ? rgb : null); }} />{t('启用颜色叠加','Enable tint','色調を有効にする')}</label>
    <div className="gc-color-controls">
      <Popover><PopoverTrigger disabled={!enabled} className="gc-color-swatch" aria-label={t('选择颜色','Choose color','色を選択')} style={{ background: css }} />
        <PopoverContent container={container}><RgbColorPicker color={{ r:rgb[0],g:rgb[1],b:rgb[2] }} onChange={color => update([color.r,color.g,color.b])} /><p>{t('拖动选择颜色，也可以在下方输入 RGB。','Drag to choose a color, or enter RGB below.','ドラッグで色を選択、または RGB を入力。')}</p></PopoverContent>
      </Popover>
      {(['R','G','B'] as const).map((channel,index) => <label key={channel}><span>{channel}</span><input type="number" min={0} max={255} step={1} disabled={!enabled} value={rgb[index]} aria-label={`${channel} (0–255)`} placeholder="0–255" onChange={event => { if (!event.target.value || !event.target.validity.valid) return; const next = [...rgb] as RGB; next[index]=Number(event.target.value); update(next); }} /></label>)}
      <Button tone="quiet" onClick={() => update([255,255,255])}>{t('重置','Reset','リセット')}</Button>
    </div>
  </div>;
}

/** Legacy field forms mount the same React color control used by Studio pages. */
export function mountColorField(value: unknown, onChange: (value: RGB | null) => void, locale: string): HTMLElement {
  const node = document.createElement('div'); node.className='authoring-color';
  const root = createRoot(node); root.render(<ColorField value={Array.isArray(value) && value.length===3 ? value as RGB : null} onChange={onChange} locale={locale} />);
  let mounted=false;
  const observer=new MutationObserver(() => {
    if(node.isConnected) mounted=true;
    else if(mounted) { observer.disconnect(); root.unmount(); }
  });
  observer.observe(document.body,{childList:true,subtree:true});
  return node;
}
