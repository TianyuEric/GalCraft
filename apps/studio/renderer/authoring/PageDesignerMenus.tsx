import { ChevronDown } from 'lucide-react';
import { Button } from '../components/controls.js';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu.js';

export type PageDesignerMenuAction = { label: string; run(): void; disabled?: boolean; title?: string };

export function PageDesignerMenu({ label, kind, items }: {
  label: string;
  kind: 'tools' | 'actions';
  items: readonly PageDesignerMenuAction[];
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button tone="quiet" className="designer-menu-trigger" data-designer-menu={kind}/>}>
      {label}<ChevronDown aria-hidden="true" size={14}/>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" aria-label={label}>
      {items.map(item => <DropdownMenuItem key={item.label} disabled={item.disabled} title={item.title} onClick={item.run}>
        {item.label}
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}
