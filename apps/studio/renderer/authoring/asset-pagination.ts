export function assetPagination(total: number, offset: number, limit: number) {
  const pages = Math.max(1, Math.ceil(total / limit)), current = Math.min(pages, Math.floor(offset / limit) + 1);
  const visible = [...new Set([1, ...Array.from({ length: 5 }, (_, index) => current - 2 + index), pages])].filter(page => page > 0 && page <= pages).sort((a, b) => a - b);
  return { pages, current, visible, previous: current > 1, next: current < pages, offset: (current - 1) * limit };
}
