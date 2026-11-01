import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip.js';

/** Keep the unsaved indicator outside the measured, animated title viewport. */
export function ProjectTitle({ name, dirty, unsavedLabel }: { name: string; dirty: boolean; unsavedLabel: string }) {
  const viewport = useRef<HTMLSpanElement>(null), text = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setDistance(Math.max(0, (text.current?.scrollWidth ?? 0) - (viewport.current?.clientWidth ?? 0)));
    measure();
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    if (text.current) observer.observe(text.current);
    return () => observer.disconnect();
  }, [name]);
  return <span className="shell-project-name">
    <TooltipProvider><Tooltip><TooltipTrigger render={<span ref={viewport} tabIndex={0} className="shell-project-viewport"/>} aria-label={name}>
      <span ref={text} className="shell-project-text" data-overflow={distance > 0} style={{ '--title-travel': `${-distance}px`, '--title-duration': `${Math.max(12, distance / 18 + 8)}s` } as CSSProperties}>{name}</span>
    </TooltipTrigger><TooltipContent side="bottom" className="shell-project-full-title">{name}</TooltipContent></Tooltip></TooltipProvider>
    {dirty && <i aria-label={unsavedLabel} role="img"/>}
  </span>;
}
