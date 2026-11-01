import { expect, it } from 'vitest';
import type { PluginManifest } from '@galcraft/plugins/contracts';
import { contributionStatus } from './contribution-status.js';

it('distinguishes static definitions and editor implementations from unobserved services and runtime', () => {
  const manifest = { id: 'org.example.model', version: '0.1.0' } as PluginManifest;
  const inspection = { manifest, definedKeys: ['org.example.model/model'], activeKeys: ['org.example.model/preview'] };
  const state = (key: string, kind: string) => contributionStatus(manifest, { key: `${manifest.id}/${key}`, kind }, true, inspection);
  expect(state('model', 'assetType')).toBe('definition');
  expect(state('preview', 'assetPreview')).toBe('active');
  expect(state('resource', 'resource')).toBe('services');
  expect(contributionStatus({ ...manifest, externalTools: [`${manifest.id}/catalog`] }, { key: `${manifest.id}/catalog`, kind: 'tool' }, true, inspection)).toBe('services');
  expect(state('stage', 'stage')).toBe('runtime');
  expect(state('inspector', 'assetEditor')).toBe('missing');
  expect(contributionStatus({ ...manifest, version: '1.1.0' }, { key: `${manifest.id}/preview`, kind: 'assetPreview' }, false, inspection)).toBe('disabled');
  expect(contributionStatus({ ...manifest, version: '1.1.0' }, { key: `${manifest.id}/preview`, kind: 'assetPreview' }, true, inspection)).toBe('missing');
});
