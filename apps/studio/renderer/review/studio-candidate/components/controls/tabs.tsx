import type { ComponentPropsWithoutRef } from 'react';
import { CandidateButton } from './primitives.js';

export function CandidateTabList({ label, className, onKeyDown, ...props }: ComponentPropsWithoutRef<'div'> & { label: string }) {
  return (
    <div
      {...props}
      role="tablist"
      aria-label={label}
      className={['gc-candidate-tab-list', className].filter(Boolean).join(' ')}
      onKeyDown={event => {
        onKeyDown?.(event);
        if (event.defaultPrevented || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]:not([disabled], [aria-disabled=true])'));
        const index = tabs.findIndex(tab => tab === event.target);
        if (index === -1) return;
        const step = event.key === 'ArrowLeft' ? -1 : 1;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + step + tabs.length) % tabs.length;
        event.preventDefault();
        tabs[next]?.focus();
      }}
    />
  );
}

/** Baseline inspector sub-tabs use a text label and underline, without document chrome. */
export function CandidateTab({ title, tabId, controls, active, onActivate }: {
  title: string;
  tabId: string;
  controls: string;
  active: boolean;
  onActivate: () => void;
}) {
  return (
    <CandidateButton className="gc-candidate-section-tab" id={tabId} role="tab" aria-selected={active}
      aria-controls={controls} tabIndex={active ? 0 : -1} onClick={onActivate}>{title}</CandidateButton>
  );
}
