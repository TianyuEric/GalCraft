import type { ReactNode } from 'react';
import { Popover as Root, PopoverTrigger as Trigger, PopoverContent as Content } from './popover-base.js';

export const Popover = Root;
export const PopoverTrigger = Trigger;
export function PopoverContent({ children, container }: { children: ReactNode; container?: HTMLElement | null }) {
  return <Content container={container} className="w-auto">{children}</Content>;
}
