import { expect, it } from 'vitest';
import { BasicSoundBank } from 'spessasynth_core';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GenerationInput, Json } from '@galcraft/contracts';
import type { PluginContext } from '@galcraft/plugins/contracts';
import { createPlugin } from './services.js';
import { resolveMusicWritingInput, prepareMusicWritingInput } from './writing-input.js';
import { writingOperationId } from './metadata.js';
import { createMusicScore } from './score.js';
const reader = async (url:string) => { const bytes=await readFile(new URL(url));return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength); };
it('reads a real SF2 file to freeze no-reference writing inputs, validates supplied catalogs and reports missing sources', async () => {
  const directory=await mkdtemp(join(tmpdir(),'galcraft-writing-'));
  try {
    const file=join(directory,'actual.sf2'); await writeFile(file,new Uint8Array(BasicSoundBank.getSampleSoundBankFile()));
    const soundbank={id:'fixture-actual',version:'0.1.0' as const};
    const context={soundbanks:{resolve:async()=>({ok:true as const,warnings:[],value:{url:pathToFileURL(file).href,expected:soundbank}})}} as unknown as PluginContext;
    const input:GenerationInput={purpose:writingOperationId,fields:{description:'A fresh cue',soundbank},references:[]};
    await resolveMusicWritingInput(context,input,reader);
    expect(input.fields).not.toHaveProperty('score'); expect(input.fields.instruments).toEqual(expect.arrayContaining([expect.objectContaining({id:expect.any(String),minPitch:expect.any(Number)})]));
    const prompt=prepareMusicWritingInput(input);expect(prompt.messages[0]!.text).toContain('No initial score');expect(prompt.system).not.toContain('Write restrained');
    const wrong={...input,fields:{...input.fields,instruments:[{...(input.fields.instruments as Json[])[0] as object,program:127}]}} as GenerationInput;
    await expect(resolveMusicWritingInput(context,wrong,reader)).rejects.toThrow('does not match');
    await expect(resolveMusicWritingInput(context,{...input,fields:{description:'Cue'}},reader)).rejects.toThrow('no soundbank is selected');
    await rm(file); await expect(resolveMusicWritingInput(context,input,reader)).rejects.toThrow('ENOENT');
  } finally {await rm(directory,{recursive:true,force:true});}
});
it('rejects a complete but constraint-violating result before rendering, preserving exact frozen source and constraints', async () => {
  const plugin=createPlugin(), contributions=await plugin.activate({} as PluginContext);
  try {
    const score=createMusicScore(),input:GenerationInput={purpose:writingOperationId,fields:{description:'Cue',score:score as unknown as Json,soundbank:score.soundbank,render:score.render,instruments:[],musicConstraints:{fixedBpm:120}},references:[]};
    await expect(contributions.textPreparations![0]!.process(JSON.stringify(score),input,{} as never)).rejects.toThrow('musicConstraints.fixedBpm');
    expect(input.fields.musicConstraints).toEqual({fixedBpm:120});expect(score.tempo[0]!.bpm).toBe(96);
  } finally {await plugin.deactivate();}
});
