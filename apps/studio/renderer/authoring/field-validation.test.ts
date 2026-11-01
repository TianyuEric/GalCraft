import { describe, expect, it } from 'vitest';
import { createCommandRegistry } from '@galcraft/dsl';
import { validateFields, commandFields } from './field-validation.js';
const registry = createCommandRegistry('0.1.0');
const label = (field: {path: string}) => ({ text: '正文', sceneId: '目标场景' }[field.path] ?? field.path);
describe('authoring field feedback', () => {
  it('reports all missing fields, including a nested target, without rejecting false or zero', () => {
    const fields = registry.get('say')!.fields;
    expect(validateFields(fields, { speaker: { kind: 'narrator' }, text: '', voiceVolume: 0, keepName: false }, label)).toEqual([{ path: 'text', message: '请填写正文' }]);
    expect(validateFields(fields, { text: 'ok', speaker: { kind: 'narrator' }, voiceVolume: 0, keepName: false }, label)).toEqual([]);
    expect(validateFields(fields, { text: 'ok', speaker: {} }, label).some(error => error.path === 'speaker.kind')).toBe(true);
  });
  it('explains numeric limits before committing the command', () => {
    const fields = registry.get('say')!.fields;
    expect(validateFields(fields, { speaker: { kind: 'narrator' }, text: 'ok', voiceVolume: -1 }, label)[0]?.path).toBe('voiceVolume');
  });
  it('requires only the destination that the ending uses', () => {
    const fields = registry.get('end')!.fields;
    expect(validateFields(fields, { target: { kind: 'title' } }, label)).toEqual([]);
    expect(validateFields(fields, { target: { kind: 'page' } }, label).map(error => error.path)).toEqual(['target.pageId']);
    expect(validateFields(fields, { target: { kind: 'scene' } }, label).map(error => error.path)).toEqual(['target.sceneId']);
    expect(validateFields(fields, { target: { kind: 'scene', sceneId: 'SceneA', labelId: null } }, label)).toEqual([]);
  });
  it('only requires image animation frames when enabled and restricts all frames to images', () => {
    const model = registry.get('changeFigure')!.fields.find(field => field.path === 'model')!;
    expect(validateFields([model], { model: { imageMouth: { enabled: false }, imageBlink: { enabled: false } } }, label)).toEqual([]);
    const errors = validateFields([model], { model: { imageMouth: { enabled: true }, imageBlink: { enabled: true } } }, label);
    expect(errors.map(error => error.path)).toEqual(['model.imageMouth.closed', 'model.imageMouth.open', 'model.imageBlink.open', 'model.imageBlink.closed']);
    for (const group of model.children!.filter(field => field.path.startsWith('image'))) {
      for (const frame of group.children!.filter(field => field.refKind === 'asset')) expect(frame.assetKinds).toEqual(['image']);
    }
  });
});

it('requires assets when showing or playing, and permits clearing or stopping', () => {
  for (const [key,on,off] of [['changeBg','show','clear'],['bgm','play','stop']]) {
    const spec=registry.get(key!)!;
    expect(validateFields(commandFields(key!,spec.fields,{op:on}),{op:on},label).some(error=>error.path==='assetId')).toBe(true);
    expect(validateFields(commandFields(key!,spec.fields,{op:off}),{op:off},label)).toEqual([]);
  }
});
