import type { HTMLAttributes } from 'react';

export function Separator({ orientation = 'horizontal', className = '', ...props }: HTMLAttributes<HTMLDivElement> & { orientation?: 'horizontal' | 'vertical' }) {
  return <div role="separator" aria-orientation={orientation} data-slot="separator" className={`gc-separator ${className}`} {...props} />;
}
