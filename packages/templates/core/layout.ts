import type { ComponentConfig, Layout } from '@galcraft/contracts';

export type Rect = { x: number; y: number; width: number; height: number };
export type ResolvedComponent = { id: string; part: string; rect: Rect; children: ResolvedComponent[] };

const length = (value: Layout['width'], base: number, intrinsic = 0): number =>
  value.unit === 'px' ? value.value : value.unit === 'percent' ? base * value.value / 100 : intrinsic;

function size(layout: Layout, parent: Rect, intrinsic: { width: number; height: number }): { width: number; height: number } {
  const contentWidth = Math.max(0, parent.width - layout.margin.left - layout.margin.right);
  const contentHeight = Math.max(0, parent.height - layout.margin.top - layout.margin.bottom);
  const width = Math.max(layout.minWidth, Math.min(layout.maxWidth ?? Infinity, length(layout.width, contentWidth, intrinsic.width)));
  const height = Math.max(layout.minHeight, Math.min(layout.maxHeight ?? Infinity, length(layout.height, contentHeight, intrinsic.height)));
  return { width, height };
}

export function resolveLayout(layout: Layout, parent: Rect, intrinsic = { width: 0, height: 0 }): Rect {
  const dimensions = size(layout, parent, intrinsic);
  const offsetX = length(layout.x, parent.width);
  const offsetY = length(layout.y, parent.height);
  return {
    x: parent.x + parent.width * layout.anchorX + offsetX - dimensions.width * layout.anchorX + layout.margin.left - layout.margin.right,
    y: parent.y + parent.height * layout.anchorY + offsetY - dimensions.height * layout.anchorY + layout.margin.top - layout.margin.bottom,
    ...dimensions,
  };
}

function contentRect(parent: Rect, layout: Layout): Rect {
  return { x: parent.x + layout.padding.left, y: parent.y + layout.padding.top,
    width: Math.max(0, parent.width - layout.padding.left - layout.padding.right),
    height: Math.max(0, parent.height - layout.padding.top - layout.padding.bottom) };
}

export function resolveComponentTree(root: ComponentConfig, safeRect: Rect): ResolvedComponent {
  function visit(component: ComponentConfig, parent: Rect, fixed?: Rect): ResolvedComponent {
    const rect = fixed ?? resolveLayout(component.layout, parent);
    const inner = contentRect(rect, component.layout);
    const flow = component.children.filter(child => child.layout.position ? child.layout.position === 'flow' : child.layout.mode !== 'absolute');
    const mode = component.layout.mode;
    const positioned = new Map<ComponentConfig, Rect>();
    const gap = component.layout.gap;
    const columns = component.layout.columns;
    const cellWidth = mode === 'grid' ? Math.max(0, (inner.width - gap * (columns - 1)) / columns) : inner.width;
    const measured = flow.map(child => {
      const dimensions = size(child.layout, { ...inner, width: cellWidth }, { width: 0, height: 0 });
      return { child, ...dimensions };
    });
    const leading = (free: number) => component.layout.justify === 'center' ? free / 2
      : component.layout.justify === 'end' ? free : 0;
    const spacing = (free: number, count: number) => component.layout.justify === 'spaceBetween' && count > 1
      ? gap + free / (count - 1) : gap;
    const crossSize = (value: number, available: number, min: number, max: number | null) =>
      component.layout.align === 'stretch' ? Math.max(min, Math.min(max ?? Infinity, available)) : value;
    const crossOffset = (available: number, actual: number) => component.layout.align === 'center'
      ? Math.max(0, available - actual) / 2 : component.layout.align === 'end' ? Math.max(0, available - actual) : 0;
    if (mode === 'row' || mode === 'column') {
      const row = mode === 'row';
      const extent = measured.reduce((total, item) => total + (row
        ? item.width + item.child.layout.margin.left + item.child.layout.margin.right
        : item.height + item.child.layout.margin.top + item.child.layout.margin.bottom), 0) + gap * Math.max(0, measured.length - 1);
      const free = Math.max(0, (row ? inner.width : inner.height) - extent);
      let cursor = leading(free);
      const between = spacing(free, measured.length);
      for (const item of measured) {
        const margin = item.child.layout.margin;
        if (row) {
          const available = Math.max(0, inner.height - margin.top - margin.bottom);
          const height = crossSize(item.height, available, item.child.layout.minHeight, item.child.layout.maxHeight);
          positioned.set(item.child, { x: inner.x + cursor + margin.left,
            y: inner.y + margin.top + crossOffset(available, height), width: item.width, height });
          cursor += margin.left + item.width + margin.right + between;
        } else {
          const available = Math.max(0, inner.width - margin.left - margin.right);
          const width = crossSize(item.width, available, item.child.layout.minWidth, item.child.layout.maxWidth);
          positioned.set(item.child, { x: inner.x + margin.left + crossOffset(available, width),
            y: inner.y + cursor + margin.top, width, height: item.height });
          cursor += margin.top + item.height + margin.bottom + between;
        }
      }
    } else if (mode === 'grid') {
      const rowHeights: number[] = [];
      for (const [index, item] of measured.entries()) {
        const row = Math.floor(index / columns);
        rowHeights[row] = Math.max(rowHeights[row] ?? 0,
          item.height + item.child.layout.margin.top + item.child.layout.margin.bottom);
      }
      const extent = rowHeights.reduce((sum, height) => sum + height, 0) + gap * Math.max(0, rowHeights.length - 1);
      const free = Math.max(0, inner.height - extent);
      const between = spacing(free, rowHeights.length);
      const rowStarts: number[] = [];
      let cursor = leading(free);
      for (const height of rowHeights) { rowStarts.push(cursor); cursor += height + between; }
      for (const [index, item] of measured.entries()) {
        const margin = item.child.layout.margin;
        const available = Math.max(0, cellWidth - margin.left - margin.right);
        const width = crossSize(item.width, available, item.child.layout.minWidth, item.child.layout.maxWidth);
        positioned.set(item.child, { x: inner.x + (index % columns) * (cellWidth + gap)
          + margin.left + crossOffset(available, width),
        y: inner.y + rowStarts[Math.floor(index / columns)]! + margin.top, width, height: item.height });
      }
    }
    const children = component.children.map(child => visit(child, inner, positioned.get(child)));
    return { id: component.id, part: component.part, rect, children };
  }
  return visit(root, safeRect);
}
