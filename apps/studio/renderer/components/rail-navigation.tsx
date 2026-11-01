import { FolderOpen, PencilLine, Image, Sparkles, PanelsTopLeft, Package, Upload, Workflow } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.js';

export type RailItem = { key: string; label: string; icon: string; current: boolean; disabled?: boolean; extension?: boolean };
const icons = { folder: FolderOpen, edit: PencilLine, image: Image, spark: Sparkles, layout: PanelsTopLeft, package: Package, publish: Upload, collaboration: Workflow };

export function RailNavigation({ items, locale, navigate }: { items: RailItem[]; locale: string; navigate(key: string): void }) {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  return <TooltipProvider delay={300}>
    <span className="studio-rail-label">{t('工作空间', 'WORKSPACE', 'ワークスペース')}</span>
    {items.map((item, index) => {
      const Icon = icons[item.icon as keyof typeof icons] ?? Package;
      return <span className="studio-rail-item" key={item.key}>
        {item.extension && !items[index - 1]?.extension && <span className="studio-rail-label studio-extension-nav">{t('扩展', 'EXTENSIONS', '拡張')}</span>}
        <Tooltip>
          <TooltipTrigger render={<button type="button" className="studio-button" aria-label={item.label} aria-current={item.current ? 'page' : undefined} disabled={item.disabled} data-focus-key={`route:${item.key}`} onClick={() => navigate(item.key)} />}>
            <Icon size={21} aria-hidden="true"/><small>{item.label}</small>
          </TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      </span>;
    })}
    <div className="studio-rail-foot"><span>GalCraft Studio</span><small>{t('故事由你书写', 'Your story starts here', 'あなたが紡ぐ物語')}</small></div>
  </TooltipProvider>;
}
