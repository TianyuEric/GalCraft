import {expect,it,vi} from 'vitest';
import {BasicSoundBank,BasicPreset,BasicPresetZone,BasicInstrument,BasicZone,SoundBankLoader} from 'spessasynth_core';
import type {BasicInstrumentZone} from 'spessasynth_core';
import {readSoundBank,musicInstrumentSchema} from './catalog.js';
import {validateJsonData} from '@galcraft/contracts';

it('reports MIDI ranges from inherited zones and local overrides without exposing unset sentinels',async()=>{
  const bank=new BasicSoundBank(),preset=new BasicPreset(bank),instrument=new BasicInstrument(),child=new BasicZone();
  const zone=new BasicPresetZone(preset,instrument);instrument.zones.push(child as BasicInstrumentZone);preset.zones.push(zone);bank.presets.push(preset);
  const loader=vi.spyOn(SoundBankLoader,'fromArrayBuffer').mockReturnValue(bank);
  try{
    const read=async()=>{const result=(await readSoundBank(new ArrayBuffer(0))).instruments[0]!;expect(validateJsonData(musicInstrumentSchema,result).ok).toBe(true);return result;};
    expect(await read()).toMatchObject({minPitch:0,maxPitch:127});
    preset.globalZone.keyRange={min:30,max:90};instrument.globalZone.keyRange={min:40,max:100};
    expect(await read()).toMatchObject({minPitch:40,maxPitch:90});
    zone.keyRange={min:10,max:120};child.keyRange={min:20,max:110};
    expect(await read()).toMatchObject({minPitch:20,maxPitch:110});
  }finally{loader.mockRestore();}
});
