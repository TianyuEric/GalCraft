import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Clean generated syntax before manifest sizes are measured; keep literal contents intact. */
export async function normalizeGeneratedCode(directory: string, parse: typeof import('vite').parseAst): Promise<void> {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) { await normalizeGeneratedCode(path, parse); continue; }
    if (!item.name.endsWith('.js')) continue;
    const code = await readFile(path, 'utf8');
    if (!/[\t ]+(?=\r?$)/m.test(code)) continue;
    const literals: { start: number; end: number }[] = [];
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const node = value as { type?: string; start: number; end: number };
      if (node.type === 'TemplateElement' || node.type === 'Literal') {
        literals.push({ start: node.start, end: node.end });
        return;
      }
      Object.values(value).forEach(visit);
    };
    visit(parse(code));
    const cleaned = code.replace(/[\t ]+(?=\r?$)/gm, (space, offset: number) =>
      literals.some(({ start, end }) => offset >= start && offset < end) ? space : '');
    if (cleaned !== code) await writeFile(path, cleaned);
  }
}
