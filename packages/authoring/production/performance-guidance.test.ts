import { expect, it } from 'vitest';
import { PerformanceGuidance, validateJsonData, JsonSchema } from '@galcraft/contracts';
import { parse, CoreCommandSpecsEnglish, commandInputSchema } from '@galcraft/dsl';
import { FixtureProject, FixtureLock } from '@galcraft/contracts/fixtures';
import { createOfficialTemplate } from '@galcraft/templates';
import { baseTextInput } from './recipe-preparer.js';
import { productionContext } from './context.js';
import type { CompileInput } from '@galcraft/dsl';

it('keeps the complete short scene inside the real current command contracts', () => {
  const source = PerformanceGuidance.shortScene.split('\n').filter(line => /^[a-zA-Z]+ \{/.test(line)).join('\n');
  const parsed = parse({ documentId: 'Doc001', revision: 1, text: source });
  expect(parsed.issues).toEqual([]); expect(parsed.cst).toHaveLength(13);
  for (const node of parsed.cst) {
    const spec = CoreCommandSpecsEnglish.find(spec => spec.key === node.command)!;
    expect(spec, node.command).toBeTruthy();
    const result = validateJsonData(commandInputSchema(spec), JsonSchema.parse(node.object!.value));
    expect(result.ok, `${node.command}: ${JSON.stringify(result)}`).toBe(true);
  }
});

it('includes staging guidance and full nested transition/difference/reaction fields for a staging task while retaining the script', () => {
  const text = 'say {speaker:{kind:"narrator"},text:"保留原句。"} @Say001;';
  const current: CompileInput = { projectId: FixtureProject.projectId, engineVersion: FixtureProject.engineVersion, project: FixtureProject, lock: FixtureLock, template: createOfficialTemplate(), documents: [], scenes: [], characters: [], variables: [], assets: [], gallery: [], flows: [], cancelOperationId: 'Cancel' };
  const documents = [{ documentId: 'Doc001', revision: 2, files: { 'scenes/Scene1/script.gal': text } }];
  const parts = productionContext(documents, current, { usage: 'script', sceneId: 'Scene1', performance: true });
  expect(parts.find(part => part.kind === 'script')!.text).toBe(text);
  expect(parts.find(part => part.text?.includes(PerformanceGuidance.shortScene))!.included).toBe(true);
  const extended = parts.find(part => part.label.startsWith('演出扩展字段'))!;
  expect(extended.included).toBe(true);
  const commands = JSON.parse(extended.text!);
  expect(commands.find((row: { key: string }) => row.key === 'characterDifference').fields.some((field: { path: string }) => field.path === 'transition')).toBe(true);
  expect(commands.find((row: { key: string }) => row.key === 'setAnimation').fields.some((field: { path: string }) => field.path === 'parallel')).toBe(true);
  const ordinary = productionContext(documents, current, { usage: 'script', sceneId: 'Scene1' });
  expect(ordinary.some(part => part.text?.includes(PerformanceGuidance.shortScene))).toBe(false);
});

it('adds the same recipe to direct M10 performance requests once and preserves explicit author wording', () => {
  const input = baseTextInput('performance', 'script', [], 'Keep all original dialogue; no jump in this scene.');
  expect(input.system).toContain(PerformanceGuidance.shortScene);
  expect(input.messages[0]!.text).toBe('Keep all original dialogue; no jump in this scene.');
  const context = [{ id: 'Guide1', kind: 'instruction' as const, label: 'Staging recipe', included: true, text: `${PerformanceGuidance.principles}\n${PerformanceGuidance.shortScene}`, source: null, media: null, attachment: null, authorEdited: false }];
  const assembled = baseTextInput('performance', 'script', context, 'Keep the original dialogue.');
  expect(assembled.system).not.toContain(PerformanceGuidance.shortScene);
  expect(assembled.messages[0]!.text).toContain(PerformanceGuidance.shortScene);
});
