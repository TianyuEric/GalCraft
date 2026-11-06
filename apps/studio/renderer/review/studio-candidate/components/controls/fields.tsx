import { cloneElement, isValidElement, useId, type ReactNode, type ComponentPropsWithoutRef } from 'react';
import { CandidateButton, CandidateInput } from './primitives.js';

type FieldControlProps = {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
};

type FieldProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  label: ReactNode;
  children: ReactNode | ((control: FieldControlProps) => ReactNode);
  id?: string;
  hint?: ReactNode;
  error?: ReactNode;
  unit?: string;
  className?: string;
  layout?: 'row' | 'stack';
};

export function CandidateField({ label, id, hint, error, unit, children, className, layout = 'stack', ...props }: FieldProps) {
  const generatedId = useId();
  const suppliedId = isValidElement<Partial<FieldControlProps>>(children) ? children.props.id : undefined;
  const controlId = id ?? suppliedId ?? generatedId;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const unitId = `${controlId}-unit`;
  const describedBy = [hint && hintId, error && errorId, unit && unitId].filter(Boolean).join(' ') || undefined;
  const control: FieldControlProps = { id: controlId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined };
  const field = typeof children === 'function'
    ? children(control)
    : isValidElement<Partial<FieldControlProps>>(children)
      ? cloneElement(children, {
        ...control,
        'aria-describedby': [children.props['aria-describedby'], describedBy].filter(Boolean).join(' ') || undefined,
        'aria-invalid': control['aria-invalid'] ?? children.props['aria-invalid'],
      })
      : children;

  return (
    <div {...props} className={['gc-candidate-field', className].filter(Boolean).join(' ')} data-layout={layout}>
      <label id={`${controlId}-label`} className="gc-candidate-field-label" htmlFor={controlId}>{label}</label>
      <div className="gc-candidate-field-value">
        {field}
        {unit && <span className="gc-candidate-field-unit" id={unitId}>{unit}</span>}
      </div>
      {hint && <div className="gc-candidate-field-hint" id={hintId}>{hint}</div>}
      {error && <div className="gc-candidate-field-error" id={errorId}>{error}</div>}
    </div>
  );
}

export function CandidateFieldGroup({ title, description, children, className, ...props }: Omit<ComponentPropsWithoutRef<'fieldset'>, 'title'> & { title?: ReactNode; description?: ReactNode }) {
  return <fieldset {...props} className={['gc-candidate-field-group', className].filter(Boolean).join(' ')}>
    {title && <legend>{title}</legend>}
    {description && <p className="gc-candidate-field-group-description">{description}</p>}
    <div className="gc-candidate-field-group-fields">{children}</div>
  </fieldset>;
}

export function CandidateResourceField({ label, value, actionLabel, onChoose, disabledReason, hint, error }: {
  label: string;
  value: string;
  actionLabel: string;
  onChoose: () => void;
  disabledReason?: string;
  hint?: ReactNode;
  error?: ReactNode;
}) {
  return (
    <CandidateField label={label} hint={hint} error={error}>
      {control => (
        <>
          <CandidateInput {...control} value={value} title={value} readOnly />
          <CandidateButton variant="outline" disabledReason={disabledReason} onClick={onChoose}>{actionLabel}</CandidateButton>
        </>
      )}
    </CandidateField>
  );
}

export function CandidateRangeField({ label, value, min, max, step, unit, onChange, onCommit, disabled }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <CandidateField label={label}>
      {control => (
        <>
          <input
            {...control}
            className="gc-candidate-range"
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-valuetext={unit ? `${value} ${unit}` : undefined}
            disabled={disabled}
            onChange={event => onChange(event.currentTarget.valueAsNumber)}
            ref={onCommit ? element => {
              if (!element) return;
              const commit = () => onCommit(element.valueAsNumber);
              element.addEventListener('change', commit);
              return () => element.removeEventListener('change', commit);
            } : undefined}
          />
          <output className="gc-candidate-field-unit" htmlFor={control.id} aria-live="off">{value}{unit && ` ${unit}`}</output>
        </>
      )}
    </CandidateField>
  );
}
