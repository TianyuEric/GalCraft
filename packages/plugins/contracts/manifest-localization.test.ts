import { expect, it } from 'vitest';
import { PluginManifestSchema, pluginDisplayMetadata } from './manifest.js';

const metadata = { name: '原始名称', description: '原始说明', localizations: {
  en: { name: 'Plugin', description: 'Plugin description' },
  'en-GB': { name: 'British plugin', description: 'British description' },
  ja: { name: 'プラグイン', description: '' },
} };

it('uses exact locale text before the language translation and retains an intentional empty description', () => {
  expect(pluginDisplayMetadata(metadata, 'en-GB')).toEqual(metadata.localizations['en-GB']);
  expect(pluginDisplayMetadata(metadata, 'en-US')).toEqual(metadata.localizations.en);
  expect(pluginDisplayMetadata(metadata, 'ja')).toEqual(metadata.localizations.ja);
});

it('keeps author-provided source text for untranslated and single-language packages', () => {
  const original = { name: metadata.name, description: metadata.description };
  expect(pluginDisplayMetadata(metadata, 'fr')).toEqual(original);
  expect(pluginDisplayMetadata(original, 'en')).toEqual(original);
  expect(metadata.name).toBe('原始名称');
});

it('validates complete localized metadata through the public manifest contract', () => {
  const schema = PluginManifestSchema.shape.localizations;
  expect(schema.safeParse(metadata.localizations).success).toBe(true);
  expect(schema.safeParse({ en: { name: '', description: 'Description' } }).success).toBe(false);
  expect(schema.safeParse({ en: { name: 'Name' } }).success).toBe(false);
});
