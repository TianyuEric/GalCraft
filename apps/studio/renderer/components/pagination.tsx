import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from './controls.js';
import './pagination.css';

/** A bounded page, including direct access to the first and last page. */
export function Pagination({ total, page, pageSize, onPageChange, locale, label, disabled = false }: {
  total: number; page: number; pageSize: number; onPageChange(page: number): void; locale: string; label: string; disabled?: boolean;
}) {
  const pages = Math.ceil(total / pageSize), current = Math.max(0, Math.min(page, pages - 1));
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  if (pages <= 1) return null;
  return <nav className="gc-pagination" aria-label={label}>
    <span className="gc-pagination-count">{current * pageSize + 1}–{Math.min(total, (current + 1) * pageSize)} / {total}</span>
    <div className="gc-pagination-actions">
      <Button tone="quiet" aria-label={t('首页', 'First page', '最初のページ')} disabled={disabled || current === 0} onClick={() => onPageChange(0)}><ChevronsLeft size={15}/></Button>
      <Button tone="quiet" aria-label={t('上一页', 'Previous page', '前のページ')} disabled={disabled || current === 0} onClick={() => onPageChange(current - 1)}><ChevronLeft size={15}/></Button>
      <span aria-live="polite">{current + 1} / {pages}</span>
      <Button tone="quiet" aria-label={t('下一页', 'Next page', '次のページ')} disabled={disabled || current === pages - 1} onClick={() => onPageChange(current + 1)}><ChevronRight size={15}/></Button>
      <Button tone="quiet" aria-label={t('末页', 'Last page', '最後のページ')} disabled={disabled || current === pages - 1} onClick={() => onPageChange(pages - 1)}><ChevronsRight size={15}/></Button>
    </div>
  </nav>;
}
