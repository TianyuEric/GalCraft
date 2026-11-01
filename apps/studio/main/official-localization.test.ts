import { expect, it, vi } from 'vitest';
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDefinition as animation } from '../../../plugins/animation-generation/src/definition.js';
import { createDefinition as voice } from '../../../plugins/official-voice-comfy/src/definition.js';
import { createDefinition as studio } from '../../../plugins/official-voicestudio/src/definition.js';
import { createDefinition as novelai } from '../../../plugins/official-novelai/src/definition.js';
import { createDefinition as music } from '../../../plugins/music-composition/src/definition.js';
import { createDefinition as motion } from '../../../plugins/motion-canvas/src/definition.js';
import { createDefinition as affection } from '../../../plugins/official-affection/src/definition.js';
import { createDefinition as epilogue } from '../../../plugins/ai-epilogue/src/definition.js';
import { definition as live2d } from '../../../plugins/official-live2d/src/definition.js';
import { createDefinition as comfy } from '../../../plugins/official-comfyui/src/definition.js';
import { createDefinition as generation } from '../../../plugins/official-generation-services/src/definition.js';
import { OfficialRecipes } from '@galcraft/authoring/recipes/official';
import { localizeRecipe } from '@galcraft/authoring/recipes/operations';
import type { FieldSpec } from '@galcraft/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PluginFields } from '../renderer/pages/Plugins/plugin-fields.js';
import { displayMessage } from '@galcraft/plugins/contracts';

const definitions = { 'animation-generation': animation(), 'official-voice-comfy': voice(), 'official-voicestudio': studio(), 'official-novelai': novelai(), 'music-composition': music(), 'motion-canvas': motion(), 'official-affection': affection(), 'ai-epilogue': epilogue(), 'official-live2d': live2d, 'official-comfyui': comfy(), 'official-generation-services': generation() };
it('covers the complete official contribution directory and every recursive public display key in all three languages', () => {
  const root = fileURLToPath(new URL('../../../plugins/', import.meta.url));
  const actual = readdirSync(root).filter(name => existsSync(`${root}/${name}/src/definition.ts`));
  expect(Object.keys(definitions).sort()).toEqual(actual.sort());
  const coverage = [];
  for (const [name, definition] of Object.entries(definitions)) {
    const messages = definition.messages ?? {}, keys = Object.keys(messages.en ?? {}).sort();
    for (const locale of ['zh-CN','en','ja']) {
      expect(Object.keys(messages[locale] ?? {}).sort(), `${name}/${locale}`).toEqual(keys);
      for (const key of keys) {
        const source = messages.en![key]!, translated = messages[locale]![key]!;
        expect(translated.trim(), `${name}/${locale}/${key}`).not.toBe('');
        const placeholders = (text: string) => [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match => match[1]).sort();
        expect(placeholders(translated), `${name}/${locale}/${key}`).toEqual(placeholders(source));
      }
    }
    const key = (value: string | undefined) => { expect(value, name).toBeTruthy(); expect(keys, `${name}/${value}`).toContain(value); };
    const fields = (entries: FieldSpec[]) => entries.forEach(field => {
      key(field.labelKey); if (field.description) key(field.descriptionKey); if (field.placeholder) key(field.placeholderKey);
      field.enumValues?.forEach(option => key(field.enumLabelKeys?.[option]));
      if (field.children) fields(field.children); if (field.item) fields([field.item]);
    });
    for (const operation of definition.productionOperations ?? []) {
      key(operation.titleKey); key(operation.descriptionKey); fields(operation.fields);
      for (const preset of operation.presets ?? []) { key(preset.nameKey); key(preset.descriptionKey); }
    }
    for (const item of definition.documents ?? []) { key(item.titleKey); fields(item.fields); }
    for (const item of definition.commands ?? []) { key(item.nameKey); key(item.descriptionKey); fields(item.fields); }
    for (const item of definition.conditions ?? []) fields(item.fields);
    for (const item of definition.components ?? []) fields(item.fields ?? []);
    for (const item of definition.assetTypes ?? []) { key(item.titleKey); key(item.descriptionKey); fields(item.fields); }
    coverage.push({ directory: name, operations: (definition.productionOperations ?? []).map(operation => ({ id: operation.id, presets: operation.presets?.map(preset => preset.id) ?? [] })), documents: definition.documents?.map(item => item.key) ?? [], commands: definition.commands?.map(item => item.key) ?? [], assetTypes: definition.assetTypes?.map(item => item.key) ?? [], messageKeys: keys });
  }
  const evidence = new URL('../../../test-results/latest/d28-localization/', import.meta.url); mkdirSync(evidence, { recursive: true });
  writeFileSync(new URL('coverage.json', evidence), JSON.stringify({ languages: ['zh-CN','en','ja'], definitionDirectories: actual, coverage, coreRecipes: OfficialRecipes.map(recipe => ({ id: recipe.id, name: recipe.name })) }, null, 2));
});

it('localizes every core official recipe while preserving executable and author content', () => {
  for (const recipe of OfficialRecipes) for (const locale of ['zh-CN','en','ja']) {
    const display = localizeRecipe(recipe, locale);
    expect(display.name.trim()).not.toBe(''); expect(display.description.trim()).not.toBe('');
    if (locale !== 'zh-CN') expect(display.name, recipe.name).not.toBe(recipe.name);
    for (const field of ['systemPrompt','taskTemplate','outputGuidance','examples'] as const) expect(display[field]).toEqual(recipe[field]);
    expect(display.production?.defaults).toEqual(recipe.production?.defaults);
    expect(localizeRecipe({ ...display, scope: 'personal' }, 'ja')).toEqual({ ...display, scope: 'personal' });
  }
});

it('renders actual GCA nested labels, enum names, defaults and limits without changing execution values', () => {
  const definition = definitions['animation-generation'], operation = definition.productionOperations![0]!;
  const values = Object.fromEntries(operation.fields.map(field => [field.path, structuredClone(field.default)]));
  const before = structuredClone(values);
  vi.stubGlobal('document', { getElementById: () => null });
  try { for (const locale of ['zh-CN','en','ja']) {
    const html = renderToStaticMarkup(createElement(PluginFields, { fields: operation.fields, value: values, change: () => {}, locale, translate: key => displayMessage(definition.messages, locale, key, key) }));
    expect(html).not.toContain('org.galcraft.animation-generation/generateGca/fields');
    expect(html).toContain(locale === 'ja' ? '時間範囲' : locale === 'en' ? 'Time range' : '时间范围');
    expect(html).toContain(locale === 'ja' ? '開始（ミリ秒）' : locale === 'en' ? 'Start (ms)' : '开始（毫秒）');
    expect(html).toContain('≥ 0');
  }
  expect(values).toEqual(before); } finally { vi.unstubAllGlobals(); }
});

