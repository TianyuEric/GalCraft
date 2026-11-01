import type { AssetKind, AssetTypeCatalogEntry, Json } from '@galcraft/contracts';

/** Only scalar fields explicitly offered by the selected type become exact-match filters. */
export function createAssetTypeFilters(catalog: readonly AssetTypeCatalogEntry[], kind: AssetKind | null, values: Record<string, Json> | undefined,
  locale: string, change: (values: Record<string, Json>) => void): HTMLElement {
  const root = document.createElement('div'); root.className = 'asset-type-filters';
  const type = catalog.find(item => item.descriptor.key === kind && !item.unavailable)?.descriptor;
  for (const path of type?.filterFields ?? []) {
    const field = type!.fields.find(item => item.path === path); if (!field) continue;
    const label = document.createElement('label'), input = field.type === 'boolean' || field.enumValues ? document.createElement('select') : document.createElement('input');
    input.ariaLabel = field.label; label.append(field.label, input);
    if (input instanceof HTMLSelectElement) {
      input.append(new Option(locale === 'en' ? 'Any value' : locale === 'ja' ? 'すべての値' : '全部值', ''));
      for (const value of field.type === 'boolean' ? ['true', 'false'] : field.enumValues ?? []) input.append(new Option(value, value));
    } else { input.type = field.type === 'number' ? 'number' : 'search'; if (field.type === 'number') input.step = 'any'; }
    input.value = values?.[path] === undefined ? '' : String(values[path]);
    input.onchange = () => {
      const next = { ...values }; if (!input.value) delete next[path];
      else next[path] = field.type === 'number' ? Number(input.value) : field.type === 'boolean' ? input.value === 'true' : input.value;
      change(next);
    };
    root.append(label);
  }
  return root;
}
