import { useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { AlertCircle, ChevronRight, Link2, LoaderCircle, Pin } from 'lucide-react';
import { CandidateButton } from './primitives.js';

export function CandidateToolbar({ label, className, ...props }: ComponentPropsWithoutRef<'div'> & { label: string }) {
  return <div {...props} role="group" aria-label={label} className={['gc-candidate-tools', className].filter(Boolean).join(' ')} />;
}

export function CandidateSection({ title, children, actions, collapsible, initiallyOpen = true, scroll, className, ...props }: Omit<ComponentPropsWithoutRef<'section'>, 'title'> & {
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  collapsible?: boolean;
  initiallyOpen?: boolean;
  scroll?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <section {...props} aria-labelledby={id} data-scroll={scroll || undefined} className={['gc-candidate-section', className].filter(Boolean).join(' ')}>
      {collapsible ? (
        <details open={initiallyOpen}>
          <summary className="gc-candidate-section-heading">
            <ChevronRight size={16} aria-hidden="true" /><span id={id}>{title}</span>
          </summary>
          <div className="gc-candidate-section-content">
            {actions && <div className="gc-candidate-section-actions">{actions}</div>}
            {children}
          </div>
        </details>
      ) : (
        <>
          <header className="gc-candidate-section-heading"><h2 id={id}>{title}</h2>{actions}</header>
          <div className="gc-candidate-section-content">{children}</div>
        </>
      )}
    </section>
  );
}

export function CandidateObjectRow({
  icon, title, description, metadata, active, selection, actions, onActivate, onRename, className, disabled, activationLabel, ...props
}: Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'title'> & {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  disabled?: boolean;
  activationLabel?: string;
  metadata?: ReactNode;
  active?: boolean;
  selection?: ReactNode;
  actions?: ReactNode;
  onActivate: () => void;
  onRename?: () => void;
}) {
  return (
    <div {...props} className={['gc-candidate-object-row', className].filter(Boolean).join(' ')} data-current={active || undefined}>
      {selection}
      <CandidateButton
        className="gc-candidate-object-open"
        aria-current={active || undefined}
        aria-label={activationLabel}
        disabled={disabled}
        title={title}
        onClick={onActivate}
        onKeyDown={event => {
          if (event.key === 'F2' && onRename) {
            event.preventDefault();
            onRename();
          }
        }}
      >
        {icon && <span className="gc-candidate-object-icon" aria-hidden="true">{icon}</span>}
        <span className="gc-candidate-object-label" data-description={description ? true : undefined}>{description ? <><span>{title}</span><small>{description}</small></> : title}</span>
        {metadata && <span className="gc-candidate-object-meta">{metadata}</span>}
      </CandidateButton>
      {actions}
    </div>
  );
}

export function CandidateSourceStatus({ label, name, mode, diagnostic, modeLabel, locate, changeMode }: {
  label: string;
  name: string;
  mode: 'following' | 'fixed' | 'missing';
  diagnostic?: string;
  modeLabel?: string;
  locate?: { label: string; run: () => void };
  changeMode?: { label: string; run: () => void };
}) {
  const Icon = mode === 'fixed' ? Pin : mode === 'missing' ? AlertCircle : Link2;
  return (
    <div className="gc-candidate-source-status" data-mode={mode} role="group" aria-label={label} aria-description={modeLabel}>
      <div className="gc-candidate-source-details">
        <span className="gc-candidate-source-label" title={modeLabel}><Icon size={14} aria-hidden="true" />{label}{modeLabel&&<small>{mode==='following'?'跟随':mode==='fixed'?'固定':'失效'}</small>}</span>
        <span className="gc-candidate-source-name" title={name}>{name}</span>
        {diagnostic && <span className="gc-candidate-source-diagnostic" role="status">{diagnostic}</span>}
      </div>
      {(locate || changeMode) && <div className="gc-candidate-source-actions">
        {locate && <CandidateButton onClick={locate.run}>{locate.label}</CandidateButton>}
        {changeMode && <CandidateButton aria-pressed={mode==='fixed'} onClick={changeMode.run}>{changeMode.label}</CandidateButton>}
      </div>}
    </div>
  );
}

export function CandidateState({ kind, title, description, action }: {
  kind: 'empty' | 'loading' | 'error' | 'running';
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = kind === 'error' ? AlertCircle : kind === 'loading' || kind === 'running' ? LoaderCircle : null;
  return (
    <div className="gc-candidate-state" data-kind={kind}>
      <div role={kind === 'error' ? 'alert' : 'status'}>
        <p className="gc-candidate-state-title">{Icon && <Icon size={16} aria-hidden="true" />}{title}</p>
        {description && <div className="gc-candidate-state-description">{description}</div>}
      </div>
      {action && <div className="gc-candidate-state-action">{action}</div>}
    </div>
  );
}
