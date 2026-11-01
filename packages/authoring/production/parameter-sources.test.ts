import { expect, it } from 'vitest';
import { resolveProductionFields, resolveProductionParameters } from './draft.js';
import type { FormVariant } from './types.js';
import type { CreationRecipe } from '../recipes/schema.js';

const scheme = { operationSnapshot: { provider: { id: 'org.test.music', version: '0.1.0' } }, production: {
  defaults: { speed: .8, score: { title: 'Scheme', tracks: [{ notes: [60] }] } }, parameters: [{ key: 'speed', defaultValue: 1 }],
} } as unknown as CreationRecipe;
const preset = { parameterPreset: { values: { speed: .9 } } } as unknown as CreationRecipe;
it('keeps explicit direct inputs above defaults and keeps parameterOverrides above direct inputs', () => {
  const variant = { fields: { speed: 1.2, score: { title: 'Author', tracks: [{ notes: [72] }] } }, explicitFields: ['speed', 'score'], parameterOverrides: { speed: 1.4 } } as unknown as FormVariant;
  expect(resolveProductionParameters(variant, scheme, preset)).toEqual({ fields: { speed: 1.4, score: variant.fields.score }, sources: { speed: 'override', score: 'input' } });
  const result = resolveProductionFields(variant, scheme, preset); expect(result.score).not.toBe(variant.fields.score);
});
it('treats filled Studio defaults as defaults and preserves edited scores as a whole value', () => {
  const variant = { fields: { speed: 1, score: { title: 'Auto-filled' } }, parameterOverrides: {} } as unknown as FormVariant;
  expect(resolveProductionParameters(variant, scheme, preset)).toMatchObject({ fields: { ...scheme.production!.defaults, speed: .9 }, sources: { speed: 'preset', score: 'scheme' } });
  const score = { title: 'One edited note', tracks: [{ notes: [73] }] };
  expect(resolveProductionFields({ ...variant, parameterOverrides: { score } }, scheme).score).toEqual(score);
  expect(resolveProductionFields(variant, scheme).score).toEqual(scheme.production!.defaults.score);
});
