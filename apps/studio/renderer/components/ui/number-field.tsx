import type { ComponentProps } from 'react';
import { NumberField as BaseNumberField } from '@base-ui/react/number-field';
import { Minus, Plus } from 'lucide-react';
import { cn } from '../../lib/utils.js';

// Adapted from the MIT-licensed 9ui Number Field registry component.
export function NumberField({ className, inputLabel, decreaseLabel, increaseLabel, unit, ...props }:
  ComponentProps<typeof BaseNumberField.Root> & {
    inputLabel: string; decreaseLabel: string; increaseLabel: string; unit?: string;
  }) {
  const control = 'flex size-8 shrink-0 items-center justify-center border border-border bg-muted text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-disabled:pointer-events-none data-disabled:opacity-50';
  return <BaseNumberField.Root data-slot="number-field" className={cn('flex items-center gap-2', className)} {...props}>
    <BaseNumberField.Group className="flex min-w-0 rounded-md">
      <BaseNumberField.Decrement className={cn(control, 'rounded-l-md')} aria-label={decreaseLabel}><Minus size={14}/></BaseNumberField.Decrement>
      <BaseNumberField.Input className="h-8 min-w-0 w-24 border-y border-border bg-background text-center text-sm tabular-nums text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label={inputLabel}/>
      <BaseNumberField.Increment className={cn(control, 'rounded-r-md')} aria-label={increaseLabel}><Plus size={14}/></BaseNumberField.Increment>
    </BaseNumberField.Group>
    {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
  </BaseNumberField.Root>;
}
