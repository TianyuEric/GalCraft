import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DocumentView, FieldSpec } from '@galcraft/contracts';
import { FixtureAsset } from '@galcraft/contracts/fixtures';
import { validatePluginData } from '@galcraft/plugins/contracts';
import { fieldInitialValue, pluginReferencesFromDocuments, PluginFields } from './plugin-fields.js';

it('offers stored resource versions to public variant fields', () => {
  const files = { 'assets/index.json': JSON.stringify({ data: { assets: [FixtureAsset] } }) };
  const document: DocumentView = { documentId: 'ABC123', revision: 1, savedRevision: 1, format: 'json', files, savedFiles: files, dirty: false };
  const references = pluginReferencesFromDocuments([document]);
  expect(references).toEqual(expect.arrayContaining(FixtureAsset.variants.map(variant => expect.objectContaining({
    kind: 'variant', id: variant.id, assetKind: FixtureAsset.kind }))));
});

it('renders an explicitly cleared nullable number as empty and uses its default only for a missing value', () => {
  const field: FieldSpec = { path: 'count', label: '数量', description: '', type: 'number', required: false, nullable: true, default: 10, unit: 'none', group: 'basic', summary: false, keywords: [] };
  const render = (value: Record<string, number | null>) => renderToStaticMarkup(createElement(PluginFields, { fields: [field], value, change: () => {}, locale: 'zh-CN' }));
  vi.stubGlobal('document', { getElementById: () => null });
  try {
    expect(render({ count: null })).toContain('value=""');
    expect(render({})).toContain('value="10"');
  } finally { vi.unstubAllGlobals(); }
});

it('creates an array object item that retains the displayed child defaults when the author fills its identity', () => {
  const item: FieldSpec = { path: 'character', label: '角色', description: '', type: 'object', required: true, nullable: false, default: {}, unit: 'none', group: 'basic', summary: false, keywords: [], children: [
    { path: 'name', label: '名称', description: '', type: 'string', required: true, nullable: false, default: '', unit: 'none', group: 'basic', summary: false, keywords: [] },
    { path: 'visible', label: '显示', description: '', type: 'boolean', required: true, nullable: false, default: true, unit: 'none', group: 'basic', summary: false, keywords: [] },
    { path: 'initial', label: '初值', description: '', type: 'number', required: true, nullable: false, default: 0, unit: 'none', group: 'basic', summary: false, keywords: [] },
  ] };
  const draft = { ...fieldInitialValue(item) as Record<string, unknown>, name: '杏' };
  expect(validatePluginData({ type: 'object', required: ['name', 'visible', 'initial'], properties: { name: { type: 'string' }, visible: { type: 'boolean' }, initial: { type: 'number' } } }, draft as never).ok).toBe(true);
});
