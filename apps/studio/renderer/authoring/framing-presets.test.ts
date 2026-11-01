import { describe, expect, it } from 'vitest';
import { portraitFraming } from './framing-presets.js';

describe('portrait framing presets',()=>{
  it('keeps the source portrait head inside the canvas at each closer framing',()=>{
    for(const preset of ['upper','medium','near'] as const){
      const framing=portraitFraming(preset,1536,1080);
      expect(1080+framing.offsetY-1536*framing.scale).toBeCloseTo(54);
    }
    expect(portraitFraming('upper',1536,1080)).toMatchObject({scale:1.1133,offsetY:684.03});
  });
  it('fits the complete source height for full-body and long shots across canvas sizes',()=>{
    for(const canvasHeight of [720,1080,1440]){
      expect(Math.abs(portraitFraming('full',2000,canvasHeight).scale*2000-canvasHeight*.95)).toBeLessThanOrEqual(.11);
      expect(Math.abs(portraitFraming('far',2000,canvasHeight).scale*2000-canvasHeight*.72)).toBeLessThanOrEqual(.11);
    }
  });
});
