import { describe, expect, it } from 'vitest';
import { FixtureProject } from '@galcraft/contracts/fixtures';
import type { AuthoringSource, SceneSource } from './controller.js';
import { sceneGraph } from './scene-graph-model.js';

const scene = (sceneId: string, text: string): SceneSource => ({ sceneId, documentId: sceneId, name: sceneId, chapterId: FixtureProject.chapters[0]!.id,
  text, revision: 1, savedRevision: 1, dirty: false });
const source = (scenes: SceneSource[]): AuthoringSource => ({ projectDocumentId: 'PrjDoc', projectRevision: 1, projectSavedRevision: 1, projectDirty: false,
  project: { ...structuredClone(FixtureProject), entry: { sceneId: scenes[0]!.sceneId, labelId: null } }, characters: [], scenes });

describe('scene relationships from authoring scripts', () => {
  it('keeps branches, merges and a back edge without treating them as a tree', () => {
    const model = sceneGraph(source([
      scene('SceneA', 'choose {options:[{id:"OptAAA",text:"Left",target:{sceneId:"SceneB",labelId:null}},{id:"OptBBB",text:"Right",target:{sceneId:"SceneC",labelId:null}}]} @StmtAA;'),
      scene('SceneB', 'changeScene {sceneId:"SceneD"} @StmtBB;'),
      scene('SceneC', 'changeScene {sceneId:"SceneD"} @StmtCC;'),
      scene('SceneD', 'changeScene {sceneId:"SceneA"} @StmtDD;'),
    ]), 'en');
    expect(model.edges.map(edge => [edge.from, edge.to, edge.label])).toEqual([
      ['SceneA', 'SceneB', 'Left'], ['SceneA', 'SceneC', 'Right'], ['SceneB', 'SceneD', 'Jump'], ['SceneC', 'SceneD', 'Jump'], ['SceneD', 'SceneA', 'Jump'],
    ]);
    expect(model.nodes.every(node => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true);
    expect(new Set(model.nodes.map(node => `${node.position.x},${node.position.y}`)).size).toBe(4);
  });
  it('keeps calls without inferred return connections', () => {
    const model = sceneGraph(source([
      scene('SceneA', 'callScene {sceneId:"SceneB"} @CallAA;'),
      scene('SceneC', 'callScene {sceneId:"SceneB"} @CallCC;'),
      scene('SceneB', 'return {} @Return;'),
    ]), 'en');
    expect(model.edges.map(edge => [edge.from, edge.to, edge.statementId, edge.kind])).toEqual([
      ['SceneA', 'SceneB', 'CallAA', 'call'], ['SceneC', 'SceneB', 'CallCC', 'call'],
    ]);
    expect(new Set(model.edges.map(edge => edge.id)).size).toBe(model.edges.length);
  });
  it('keeps parseable references and exposes removed destinations and local jumps', () => {
    const model = sceneGraph(source([scene('SceneA', 'label {labelId:"LabelA",name:"Again"} @Define;\njumpLabel {labelId:"LabelA"} @JumpAA;\nchangeScene {sceneId:"LostAA"} @Change;\nsay {text:')]), 'en');
    expect(model.nodes.find(node => node.id === 'SceneA')?.partial).toBe(true);
    expect(model.nodes.find(node => node.id === 'LostAA')?.missing).toBe(true);
    expect(model.edges.some(edge => edge.kind === 'label' && edge.from === edge.to && edge.label.includes('Again'))).toBe(true);
    expect(model.edges.some(edge => edge.statementId === 'Change' && edge.to === 'LostAA')).toBe(true);
  });
  it('keeps explicit jumps, nested calls and scene endings without inferring return edges', () => {
    const model = sceneGraph(source([
      scene('SceneA', 'callScene {sceneId:"SceneB"} @CallAA;'),
      scene('SceneB', 'choose {options:[{id:"OptAAA",text:"Continue",target:{sceneId:"SceneC",labelId:null}}]} @Choose;\ncallScene {sceneId:"SceneD"} @CallBB;\nend {endingId:"EndAAA",target:{kind:"scene",sceneId:"SceneE",labelId:null}} @EndBBB;'),
      scene('SceneC', 'changeScene {sceneId:"SceneB"} @Change;\nreturn {} @Return;'),
      scene('SceneD', 'return {} @RetDDD;'),
      scene('SceneE', 'return {} @RetEEE;'),
    ]), 'en');
    expect(model.edges.map(edge => [edge.from, edge.to, edge.kind])).toEqual([
      ['SceneA', 'SceneB', 'call'], ['SceneB', 'SceneC', 'choice'], ['SceneB', 'SceneD', 'call'], ['SceneB', 'SceneE', 'end'], ['SceneC', 'SceneB', 'change'],
    ]);
    expect(model.nodes.every(node => !node.partial)).toBe(true);
  });
  it('marks explicit and default title endings without adding title nodes or connections', () => {
    const model = sceneGraph(source([
      scene('SceneA', 'end {target:{kind:"title"},when:false} @EndAAA;'),
      scene('SceneB', 'end {} @EndBBB;'),
      scene('SceneC', 'end {target:{kind:"page",pageId:"PageAA"}} @EndCCC;'),
      scene('SceneD', 'return {} @Return;'),
    ]), 'zh-CN');
    expect(model.nodes.map(node => [node.id, node.returnsToTitle])).toEqual([
      ['SceneA', true], ['SceneB', true], ['SceneC', false], ['SceneD', false],
    ]);
    expect(model.edges).toEqual([]);
  });
});
