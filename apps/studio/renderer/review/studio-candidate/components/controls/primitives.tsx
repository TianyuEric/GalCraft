import { useId, useImperativeHandle, useLayoutEffect, useRef, type ComponentPropsWithRef, type KeyboardEvent } from 'react';

type Density = 'compact' | 'standard';
type Variant = 'ghost' | 'secondary' | 'outline' | 'primary' | 'danger';

type CandidateButtonProps = ComponentPropsWithRef<'button'> & {
  density?: Density;
  variant?: Variant;
  disabledReason?: string;
};

export function CandidateButton({
  density, variant = 'ghost', type = 'button', className, disabled, disabledReason, title,
  onClick, 'aria-describedby': describedBy, ...props
}: CandidateButtonProps) {
  const reasonId = useId();
  const blocked = Boolean(disabled || disabledReason || props['aria-disabled'] === true || props['aria-disabled'] === 'true');

  return (
    <>
      <button
        {...props}
        type={type}
        className={['gc-candidate-button', className].filter(Boolean).join(' ')}
        data-density={density}
        data-variant={variant}
        disabled={blocked && !disabledReason && !props['aria-disabled']}
        aria-disabled={blocked || undefined}
        aria-describedby={[describedBy, disabledReason && reasonId].filter(Boolean).join(' ') || undefined}
        title={disabledReason ?? title}
        onClick={event => {
          if (blocked) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          onClick?.(event);
        }}
      />
      {disabledReason && <span id={reasonId} hidden>{disabledReason}</span>}
    </>
  );
}

export function CandidateIconButton({ label, title, className, density, ...props }: Omit<CandidateButtonProps, 'density'> & {
  label: string;
  density?: Density | 'toolbar' | 'large';
}) {
  return (
    <CandidateButton
      {...props}
      density={density === 'toolbar' || density === 'large' ? undefined : density}
      data-icon-density={density}
      aria-label={label}
      title={title ?? label}
      className={['gc-candidate-icon-button', className].filter(Boolean).join(' ')}
    />
  );
}

function inputKeys<T extends HTMLInputElement | HTMLTextAreaElement>(handler?: (event: KeyboardEvent<T>) => void) {
  return (event: KeyboardEvent<T>) => {
    if ((event.nativeEvent.isComposing || event.keyCode === 229) && ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.stopPropagation();
      return;
    }
    handler?.(event);
  };
}

export function CandidateInput({ density, className, onKeyDown, ...props }: ComponentPropsWithRef<'input'> & { density?: Density }) {
  return <input {...props} onKeyDown={inputKeys(onKeyDown)} data-density={density} className={['gc-candidate-input', className].filter(Boolean).join(' ')} />;
}

export function CandidateTextarea({ density, className, onKeyDown, rows = 3, ...props }: ComponentPropsWithRef<'textarea'> & { density?: Density }) {
  return <textarea {...props} rows={rows} onKeyDown={inputKeys(onKeyDown)} data-density={density} className={['gc-candidate-input', 'gc-candidate-textarea', className].filter(Boolean).join(' ')} />;
}

export function CandidateCheckbox({ mixed = false, className, ref, ...props }: Omit<ComponentPropsWithRef<'input'>, 'type'> & { mixed?: boolean }) {
  const element = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => element.current!, []);
  useLayoutEffect(() => {
    if (element.current) element.current.indeterminate = mixed;
  });

  return <input {...props} type="checkbox" ref={element} className={['gc-candidate-checkbox', className].filter(Boolean).join(' ')} />;
}

export function CandidateRadio({ className, ...props }: Omit<ComponentPropsWithRef<'input'>, 'type'>) {
  return <input {...props} type="radio" className={['gc-candidate-radio', className].filter(Boolean).join(' ')} />;
}
