/** Bundled facades preserve the host's rendering instances without bare browser imports. */
export async function sharedRuntimePlugin() {
  const react = await import('react'), pixi = await import('pixi.js'), reactDom = await import('react-dom'), reactDomClient = await import('react-dom/client');
  const bindings: Record<string, { global: string; exports: string[]; alias?: string }> = {
    react: { global: '__GalCraftReact__', exports: Object.keys(react).filter(key => key !== 'default') },
    '@galcraft/plugins/react': { global: '__GalCraftReact__', exports: [], alias: 'React' },
    'react/jsx-runtime': { global: '__GalCraftReactJsxRuntime__', exports: ['Fragment', 'jsx', 'jsxs'] },
    'react/jsx-dev-runtime': { global: '__GalCraftReactJsxDevRuntime__', exports: ['Fragment', 'jsxDEV'] },
    'pixi.js': { global: '__GalCraftPixi__', exports: Object.keys(pixi) },
    '@galcraft/plugins/pixi': { global: '__GalCraftPixi__', exports: [], alias: 'Pixi' },
    'react-dom': { global: '__GalCraftReactDom__', exports: Object.keys(reactDom).filter(key => key !== 'default') },
    'react-dom/client': { global: '__GalCraftReactDomClient__', exports: Object.keys(reactDomClient).filter(key => key !== 'default') },
  };
  return { name: 'galcraft-shared-runtime', enforce: 'pre' as const,
    resolveId(id: string) { return Object.hasOwn(bindings, id) ? `\0galcraft-shared:${id}` : undefined; },
    load(id: string) {
      const specifier = id.replace(/^\0galcraft-shared:/, ''), entry = bindings[specifier];
      if (!entry) return undefined;
      const names = entry.exports.filter(key => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) && key !== 'default');
      return `const shared=globalThis.${entry.global};if(!shared)throw new Error('GalCraft shared runtime unavailable: ${specifier}');\n`
        + (entry.alias ? `export {shared as ${entry.alias}};${entry.alias === 'Pixi' ? 'export {shared as PIXI};' : ''}` : `export default shared;${names.length ? `export const {${names.join(',')}}=shared;` : ''}`);
    },
  };
}
