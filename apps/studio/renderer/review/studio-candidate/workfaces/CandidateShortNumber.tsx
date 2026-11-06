import { useState, type ComponentProps } from 'react';
import { CandidateInput } from '../components/controls/index.js';

type Props = Omit<ComponentProps<typeof CandidateInput>, 'type' | 'value' | 'onChange'> & {
  value: number;
  onValueChange(value: number): void;
};

/** Keep a short live property editable while its text is temporarily incomplete. */
export function CandidateShortNumber({ value, onValueChange, onBlur, onKeyDown, ...props }: Props) {
  const [draft, setDraft] = useState<{ text: string; invalid: boolean } | null>(null);
  return <CandidateInput {...props} density="compact" type="number" value={draft?.text ?? value}
    aria-invalid={draft?.invalid || props['aria-invalid']} onChange={event => {
      const input = event.currentTarget, next = input.valueAsNumber;
      const invalid = !Number.isFinite(next) || input.validity.rangeUnderflow || input.validity.rangeOverflow;
      setDraft({ text: input.value, invalid });
      if (!invalid) onValueChange(next);
    }} onBlur={event => {
      if (!draft?.invalid) setDraft(null);
      onBlur?.(event);
    }} onKeyDown={event => {
      if (event.key === 'Escape' && draft?.invalid) {
        event.preventDefault();
        event.stopPropagation();
        setDraft(null);
        // A number input can show invalid text while exposing an empty value.
        event.currentTarget.value = String(value);
      }
      onKeyDown?.(event);
    }}/>;
}
