import type { GenerationInput } from './types.js';

export const textCharacters = (text: string): number => { let count=0; for(const _character of text) count++; return count; };
export type InputTextSummary = { textCharacters: number; systemCharacters: number; messageCharacters: number; attachments: number };

/** Count model text, not transport JSON keys, local filenames or encoded media. */
export function inputTextSummary(value: GenerationInput): InputTextSummary {
  const count = (text: unknown) => typeof text === 'string' ? textCharacters(text) : 0;
  const systemCharacters = value.purpose === 'text' ? count(value.system) : 0;
  const messageCharacters = value.purpose === 'text' ? value.messages.reduce((sum, message)=>sum+count(message.text),0)
    : value.purpose === 'image' ? count(value.positive)+count(value.negative)
    : value.purpose === 'difference' ? count(value.instruction)+count(value.negative)
    : value.purpose === 'speech' ? count(value.text)+count(value.referenceText)
    : value.purpose === 'music' ? count(value.prompt)+count(value.lyrics) : 'fields' in value ? Object.values(value.fields).reduce<number>((sum, item) => sum + count(item), 0) : 0;
  const attachments = value.purpose === 'text' ? value.messages.reduce((sum,message)=>sum+(message.attachments??[]).length,0)
    : value.purpose === 'image' ? (value.references??[]).length : value.purpose === 'difference' || value.purpose === 'matting' ? 1
    : value.purpose === 'speech' && value.referenceAudio ? 1 : 'fields' in value ? value.references.length : 0;
  return {textCharacters:systemCharacters+messageCharacters,systemCharacters,messageCharacters,attachments};
}
