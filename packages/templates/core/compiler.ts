import { hostViewportStyleLocations } from './canvas-style.js';
import * as sass from 'sass';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import type { Id, Issue, NamedStyle } from '@galcraft/contracts';
import { ComponentCatalog } from './catalog.js';
export type CompiledStyle = { style: NamedStyle; css: string | null; source: string; sourceMap: string | null;
  declarations: { selector: string; property: string; value: string; line: number; column: number }[] };

function moduleImporter(sourcePath: string, modules: Record<string, string>, used?: Set<string>): sass.Importer {
  return { canonicalize(url, context) { const resolved = new URL(url, context.containingUrl ?? `galcraft-style:/${sourcePath}`);
    if (resolved.protocol !== 'galcraft-style:') throw new Error('样式模块必须位于当前作品');
    for (const candidate of [resolved.pathname.slice(1), `${resolved.pathname.slice(1)}.scss`, resolved.pathname.slice(1).replace(/([^/]+)$/, '_$1.scss')])
      if (modules[candidate] !== undefined) return new URL(`galcraft-style:/${candidate}`);
    return null; }, load(url) { const path = url.pathname.slice(1), contents = modules[path];
    if (contents === undefined) return null;
    used?.add(path); return { contents, syntax: 'scss' }; } };
}

export function collectStyleModules(sourcePath: string, source: string, modules: Record<string, string>): string[] {
  const used = new Set<string>();
  sass.compileString(source, { url: new URL(`galcraft-style:/${sourcePath}`), importers: [moduleImporter(sourcePath, modules, used)] });
  return [...used];
}

export function compileStyle(input: { style: NamedStyle; source: string; instanceId: Id; modules?: Record<string, string>;
  lastValidCss?: string; resolveAsset?: (id: Id) => string }): CompiledStyle {
  const style = structuredClone(input.style); style.issues = hostViewportStyleLocations(input.source).map(location=>({code:'STYLE_HOST_VIEWPORT',severity:'warning',owner:'M08',message:`${style.sourcePath}:${location.line} 使用宿主视口规则：${location.rule}。采用画布单位后可统一缩放。`,source:{documentId:style.id,revision:style.sourceRevision,range:{start:location.start,end:location.end}},related:[],actions:['edit','locate']}));
  const declarations: CompiledStyle['declarations'] = [], assets = new Set<Id>();
  try {
    let css = input.source, sourceMap: string | null = null;
    if (style.language === 'scss') {
      const compiled = sass.compileString(css, { url: new URL(`galcraft-style:/${style.sourcePath}`), sourceMap: true,
        importers: [moduleImporter(style.sourcePath, input.modules ?? {})] });
      css = compiled.css; sourceMap = JSON.stringify(compiled.sourceMap);
    }
    const root = postcss.parse(css, { from: style.sourcePath });
    const scope = `[data-gc-player="${input.instanceId}"] [data-gc-page-id="${style.scope.pageId}"]`;
    const componentScope = style.scope.componentId ? `:where([data-gc-component="${style.scope.componentId}"], [data-gc-component="${style.scope.componentId}"] *)` : '';
    const animations = new Map<string, string>();
    root.walkAtRules(rule => {
      if (rule.name === 'import') throw rule.error('样式不允许外部 @import');
      if (/keyframes$/i.test(rule.name)) { const name = `gc-${input.instanceId}-${style.id}-${rule.params}`; animations.set(rule.params, name); rule.params = name; }
    });
    root.walkRules(rule => {
      if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
      const parsed = selectorParser().astSync(rule.selector);
      parsed.walk(node => {
        if (node.type === 'tag' || node.type === 'id' || node.type === 'universal') throw rule.error('选择器应使用公开部件、状态或 --gc 变量');
        if (node.type === 'attribute') {
          if (!['data-gc-part', 'data-gc-state', 'data-gc-page', 'data-gc-component'].includes(node.attribute)) throw rule.error(`未公开的属性选择器 ${node.attribute}`);
          if (node.attribute === 'data-gc-part' && node.value && !ComponentCatalog.some(item => item.part === node.value)) throw rule.error(`未知部件 ${node.value}`);
        }
        if (node.type === 'class' && !ComponentCatalog.some(item => `gc-${item.part.replaceAll('.', '-')}` === node.value)) throw rule.error(`未公开的类 ${node.value}`);
      });
      const original = rule.selector;
      rule.selector = parsed.nodes.map(selector => `${scope} ${selector.toString()}${componentScope}`).join(', ');
      rule.walkDecls(decl => { declarations.push({ selector: original, property: decl.prop, value: decl.value,
        line: decl.source?.start?.line ?? 1, column: decl.source?.start?.column ?? 1 }); });
    });
    root.walkDecls(decl => {
      if (['display', 'visibility', 'pointer-events', 'content'].includes(decl.prop.toLowerCase())) throw decl.error('功能显隐和内容通过公开配置编辑');
      if (decl.parent?.type === 'rule' && !(decl.parent.parent?.type === 'atrule' && /keyframes$/i.test(decl.parent.parent.name))) decl.important = true;
      decl.value = decl.value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/g, (_, _quote: string, uri: string) => {
        const match = /^asset:([0-9a-f-]{36}|[A-Za-z0-9]{6})$/i.exec(uri); if (!match) throw decl.error('资源 URL 必须是 asset:<assetId>');
        assets.add(match[1]!); return `url("${input.resolveAsset?.(match[1]!) ?? uri}")`;
      });
      if (decl.prop === 'animation' || decl.prop === 'animation-name') for (const [before, after] of animations)
        decl.value = decl.value.replace(new RegExp(`(^|[\\s,])${before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s,])`, 'g'), `$1${after}`);
    });
    style.assets = [...assets]; style.compiledSourceRevision = style.sourceRevision;
    if (!style.compiledPath || style.compiledPath === style.sourcePath) style.compiledPath = `ui/styles/${style.id}.compiled.css`;
    return { style, css: root.toString(), source: input.source, sourceMap, declarations };
  } catch (error) {
    const detail = error as { message?: string; line?: number; column?: number; span?: { start: { line: number; column: number } } };
    const issue: Issue = { code: 'STYLE_COMPILE', severity: 'error', owner: 'M08',
      message: `${style.sourcePath}:${detail.line ?? (detail.span ? detail.span.start.line + 1 : 1)}:${detail.column ?? (detail.span ? detail.span.start.column + 1 : 1)} ${detail.message ?? String(error)}`,
      related: [], actions: ['edit', 'locate'] };
    style.issues = [issue]; return { style, css: input.lastValidCss ?? null, source: input.source, sourceMap: null, declarations: [] };
  }
}
