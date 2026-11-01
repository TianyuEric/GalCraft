import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReadingSurface, readingBackground } from './reading-surface.js';

describe('shared reading surface',()=>{
  it('keeps portrait, speaker, measuring text and rich visible runs in the same formal structure',()=>{
    const html=renderToStaticMarkup(<ReadingSurface speaker="澜汐" portrait={<img className="gc-dialogue-portrait" src="portrait.png" alt=""/>} runs={[{text:'星空',ruby:'ほしぞら',bold:true},{text:'继续阅读'}]} shown={3} scale={1.2}/>);
    expect(html).toContain('gc-reading-panel');expect(html).toContain('gc-dialogue-portrait');expect(html).toContain('gc-speaker');expect(html).toContain('<ruby>');expect(html).toContain('gc-dialogue-measure');expect(html).toContain('gc-dialogue-visible');expect(html).toContain('澜汐');
  });
  it('uses the authored reading background and one opacity rule for every consumer',()=>{
    expect(readingBackground({color:'#243b61',colorOpacity:.8},.5,false)).toEqual({backgroundColor:'color-mix(in srgb, #243b61 40%, transparent)',backgroundImage:'none'});
    expect(readingBackground({color:'#243b61',colorOpacity:.8},.5,true).backgroundImage).toContain('#243b61 40%');
  });
  it('hides the standalone name and portrait for the NVL structure',()=>{
    const html=renderToStaticMarkup(<ReadingSurface nvl speaker="澜汐" portrait={<img src="portrait.png" alt=""/>} runs={[{text:'澜汐\n台词'}]} shown={5} scale={1}/>);
    expect(html).toContain('gc-nvl');expect(html).not.toContain('<img');expect(html).not.toContain('gc-dialogue-measure');expect(html).toContain('hidden=""');
  });
});
