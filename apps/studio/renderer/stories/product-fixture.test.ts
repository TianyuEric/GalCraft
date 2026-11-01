import { describe, expect, it } from 'vitest';
import { SnapshotSchema } from '@galcraft/contracts';
import { AuthoringController } from '../authoring/controller.js';
import { productSnapshot } from './product-fixture.js';
import { studioFixture } from './studio-fixture.js';
import { componentSceneRequest } from './page-component-fixture.js';

describe('product Storybook contracts', () => {
  it('prepares and compiles the eleven component workspace through the real M08 edit service',async()=>{
    const {services}=studioFixture('normal','zh-CN','light');
    const planned=await services.bridge.templates.preparePageEdit(componentSceneRequest(productSnapshot()));expect(planned.ok).toBe(true);if(!planned.ok)return;
    const plan=await services.bridge.documents.planEdit(planned.value.edit);expect(plan.ok).toBe(true);if(!plan.ok)return;
    expect((await services.bridge.documents.applyEdit(plan.value.planId,planned.value.edit.expected)).ok).toBe(true);
    const compiled=await services.compilePreview();expect(compiled.ok).toBe(true);if(!compiled.ok)return;
    expect(compiled.value.issues.filter(issue=>issue.severity==='error')).toEqual([]);
    const page=compiled.value.snapshot!.template.pages.find(item=>item.key==='component-workspace')!;
    expect(new Set(page.root.children.map(item=>item.part)).size).toBe(11);
    expect(page.root.children.find(item=>item.part==='basic.button')!.interactions?.[0]?.actions).toEqual([{kind:'open',page:'title'}]);
    expect(page.root.children.find(item=>item.part==='basic.list')!.repeat?.source).toEqual({source:'data',path:'characters'});
  });
  it('uses valid snapshots with real background and figure stage instructions across all template tiers', () => {
    for (const kind of ['light', 'standard', 'rich'] as const) for (const appearance of ['paper', 'night'] as const) {
      const snapshot = SnapshotSchema.parse(productSnapshot(kind, appearance));
      expect(snapshot.scenes[0]!.instructions.slice(0, 2).map(instruction => instruction.opcode)).toEqual(['changeBg', 'changeFigure']);
      expect(snapshot.template.pages.find(page => page.key === 'story')!.background.colorOpacity).toBe(0);
    }
  });
  it('compiles current authored documents including automatically created protagonist name variables', async () => {
    const { services } = studioFixture('normal', 'zh-CN', 'light');
    const controller = new AuthoringController(services);
    await controller.open();
    const source = controller.source!;
    const edit = await controller.setPlayerName({ characterId: source.characters.find(character => character.narrativeRole === 'viewpoint')!.id, defaultName: '晨光', allowCustom: true, variableId: null, maxLength: 24, promptPolicy: 'always' });
    expect(edit.ok).toBe(true);
    const current = await services.read();
    expect(current.ok && current.value.variables!.some(variable => variable.id === current.value.project.player.name?.variableId)).toBe(true);
    const compiled = await services.compilePreview();
    expect(compiled.ok && compiled.value.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    expect(compiled.ok && compiled.value.snapshot?.project.player.name?.defaultName).toBe('晨光');
  });
});
