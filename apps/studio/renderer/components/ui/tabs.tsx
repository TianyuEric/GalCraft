import type { ComponentProps } from 'react';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { cn } from '@/lib/utils';

/** Base UI tab navigation, adapted from 9ui to the Studio Nova tokens. */
export function Tabs({ className, variant = 'capsule', ...props }: ComponentProps<typeof BaseTabs.Root> & { variant?: 'capsule' | 'underline' }) {
  return <BaseTabs.Root data-slot="tabs" data-variant={variant} className={cn('gc-tabs', className)} {...props}/>;
}
export function TabsList({ className, children, ...props }: ComponentProps<typeof BaseTabs.List>) {
  return <BaseTabs.List data-slot="tabs-list" className={cn('gc-tabs-list', className)} {...props}>
    {children}<BaseTabs.Indicator className="gc-tabs-indicator"/>
  </BaseTabs.List>;
}
export function TabsTrigger({ className, ...props }: ComponentProps<typeof BaseTabs.Tab>) {
  return <BaseTabs.Tab data-slot="tabs-trigger" className={cn('gc-tabs-trigger', className)} {...props}/>;
}
export function TabsContent({ className, ...props }: ComponentProps<typeof BaseTabs.Panel>) {
  return <BaseTabs.Panel data-slot="tabs-content" className={cn('gc-tabs-panel', className)} {...props}/>;
}
