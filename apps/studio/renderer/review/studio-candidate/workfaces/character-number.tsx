import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import { CandidateField, CandidateInput } from '../components/controls/index.js';

export type CharacterNumberBuffers = Record<string, { raw: string; invalid: boolean }>;
export const CharacterNumberDrafts = createContext<{ values: CharacterNumberBuffers; set: Dispatch<SetStateAction<CharacterNumberBuffers>> } | null>(null);

export function useClearCharacterNumbers() {
  const { set } = useContext(CharacterNumberDrafts)!;
  return (prefix: string) => set(previous => {
    const keys = Object.keys(previous).filter(key => key === prefix || key.startsWith(prefix + '/'));
    if (!keys.length) return previous;
    const next = { ...previous };
    for (const key of keys) delete next[key];
    return next;
  });
}

export function CharacterNumber({ field, label, value, min, max, integer, unit, disabled, change }: {
  field: string; label: string; value: number; min?: number; max?: number; integer?: boolean; unit?: string;
  disabled?: boolean; change(value: number): void;
}) {
  const buffers = useContext(CharacterNumberDrafts)!;
  const draft = buffers.values[field];
  const reset = () => buffers.set(previous => {
    if (!Object.hasOwn(previous, field)) return previous;
    const next = { ...previous }; delete next[field]; return next;
  });
  return <CandidateField label={label} unit={unit} className="candidate-character-number" error={draft?.invalid ? '请输入有效数值。' : undefined}>
    <CandidateInput inputMode={integer ? 'numeric' : 'decimal'} value={draft?.raw ?? String(value)} disabled={disabled} onChange={event => {
      const raw = event.target.value, next = Number(raw);
      const valid = !!raw.trim() && Number.isFinite(next) && (!integer || Number.isInteger(next)) && (min === undefined || next >= min) && (max === undefined || next <= max);
      buffers.set(previous => ({ ...previous, [field]: { raw, invalid: !valid } }));
      if (valid) change(next);
    }} onBlur={() => { if (!draft?.invalid) reset(); }}/>
  </CandidateField>;
}
