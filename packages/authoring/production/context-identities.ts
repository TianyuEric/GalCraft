import { createId, legacyIdPattern, reserveIds, type CommandSpec, type Id } from '@galcraft/contracts';
import { compactPresentationScript, parse, rewriteScriptReferences } from '@galcraft/dsl';
import type { ContextPart } from './types.js';

const uuidTokens = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;
const token = '(?:[0-9a-f-]{36}|[A-Za-z0-9]{6})';
const cssAsset = new RegExp(`asset:(${token})(?![A-Za-z0-9-])`, 'g');
const cssIdentity = new RegExp(`(data-gc-(?:player|page-id|component)\\s*=\\s*["'])(${token})(["'])`, 'g');
const referenceField = /^(?:id|.*Id|.*Ids|assets|fallbackFonts|reuseAssets)$/;

function rewriteCss(text: string, mapping: Record<Id, Id>): string {
  return text.replace(cssAsset, (_match, id: string) => `asset:${mapping[id] ?? id}`)
    .replace(cssIdentity, (_match, prefix: string, id: string, suffix: string) => prefix + (mapping[id] ?? id) + suffix);
}

/** Only identity/reference fields, DSL reference nodes and CSS resource tokens are rewritten. */
export function rewriteContextText(text: string, mapping: Record<Id, Id>, kind: ContextPart['kind'],
  engineVersion = '0.1.0', plugins: CommandSpec[] = []): string {
  if (kind === 'script') {
    const parsed = parse({ documentId: 'CtxDoc', revision: 0, text });
    let result = text;
    // Nearby context can begin/end inside a statement. Preserve those slices as supplied.
    for (const node of [...parsed.cst].reverse()) if (node.valid) {
      const raw = text.slice(node.start, node.end);
      const rewritten = rewriteScriptReferences({ documentId: 'CtxDoc', revision: 0, text: raw }, mapping, engineVersion, plugins);
      result = result.slice(0, node.start) + rewritten + result.slice(node.end);
    }
    return compactPresentationScript(result);
  }
  if (kind === 'style') return rewriteCss(text, mapping);
  let json: unknown;
  try { json = JSON.parse(text); } catch { return text; }
  const visit = (value: unknown, key = ''): unknown => {
    if (typeof value === 'string') {
      if (referenceField.test(key)) return mapping[value] ?? value;
      if (key === 'value' && /^asset:/.test(value)) return rewriteCss(value, mapping);
      if (key === 'source') return rewriteCss(value, mapping);
      if (key === 'sourcePath' || key === 'compiledPath') return value.split('/').map(part => {
        const [id, ...extension] = part.split('.'); return (mapping[id!] ?? id!) + (extension.length ? `.${extension.join('.')}` : '');
      }).join('/');
      return value;
    }
    if (Array.isArray(value)) return value.map(item => visit(item, key));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, visit(item, name)]));
    return value;
  };
  return JSON.stringify(visit(json));
}

/** Keep this reverse mapping local with the task/candidate, never send it to the model. */
export function compactContextParts(parts: ContextPart[], engineVersion = '0.1.0', plugins: CommandSpec[] = []):
  { context: ContextPart[]; idAliases: Record<Id, Id> } {
  reserveIds(parts);
  const mapping: Record<Id, Id> = {};
  for (const part of parts) if (part.text) for (const match of part.text.matchAll(uuidTokens)) {
    if (legacyIdPattern.test(match[0])) mapping[match[0]] ??= createId();
  }
  const context = parts.map(part => ({ ...structuredClone(part), text: part.text === null ? null : rewriteContextText(part.text, mapping, part.kind, engineVersion, plugins) }));
  return { context, idAliases: Object.fromEntries(Object.entries(mapping).map(([real, alias]) => [alias, real])) };
}

export function restoreCandidateIdentities(text: string, aliases: Record<Id, Id> | undefined, purpose: string | undefined, plugins: CommandSpec[] = []): string {
  if (!aliases || !Object.keys(aliases).length) return text;
  return rewriteContextText(text, aliases, purpose === 'script' ? 'script' : 'ui', '0.1.0', plugins);
}
