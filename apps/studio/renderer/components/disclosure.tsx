import { Collapsible } from '@base-ui/react/collapsible';
import { ChevronRight } from 'lucide-react';
import { Children, type ReactNode } from 'react';
export function Disclosure({ children, open, onOpenChange }: { children: ReactNode; open?: boolean; onOpenChange?(open: boolean): void }) {
 const [title, ...body] = Children.toArray(children);
 return <Collapsible.Root open={open} onOpenChange={onOpenChange}><Collapsible.Trigger className="gc-disclosure-trigger"><ChevronRight size={16}/>{title}</Collapsible.Trigger><Collapsible.Panel>{body}</Collapsible.Panel></Collapsible.Root>;
}
