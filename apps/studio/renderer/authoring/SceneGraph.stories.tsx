import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FixtureProject } from '@galcraft/contracts/fixtures';
import type { AuthoringSource } from './controller.js';
import { SceneGraph } from './scene-graph.js';
import { BackgroundTransition } from './background-transition.js';
import './workspace.css';

const source: AuthoringSource = { projectDocumentId: 'PrjDoc', projectRevision: 1, projectSavedRevision: 1, projectDirty: false,
  project: { ...structuredClone(FixtureProject), entry: { sceneId: 'SceneA', labelId: null } }, characters: [], scenes: [
    ['SceneA', '清晨', 'choose {options:[{id:"OptAAA",text:"去车站",target:{sceneId:"SceneB",labelId:null}},{id:"OptBBB",text:"去书店",target:{sceneId:"SceneC",labelId:null}}]} @StmtAA;'],
    ['SceneB', '车站', 'callScene {sceneId:"SceneD"} @StmtBB;\nend {target:{kind:"title"}} @EndBBB;'], ['SceneC', '书店', 'callScene {sceneId:"SceneD"} @StmtCC;\nend {target:{kind:"title"}} @EndCCC;'],
    ['SceneD', '共同回忆', 'return {} @Return;'],
  ].map(([sceneId, name, text]) => ({ sceneId: sceneId!, name: name!, text: text!, documentId: sceneId!, chapterId: FixtureProject.chapters[0]!.id, revision: 1, savedRevision: 1, dirty: false })) };
function GraphStory({ theme = 'light', locale = 'zh-CN', graphSource = source }: { theme?: 'light' | 'dark'; locale?: string; graphSource?: AuthoringSource }) { const [selected, select] = useState('SceneA'); return <div data-theme={theme}><div className="authoring-shell" style={{ height: '100vh', padding: 24, display: 'flex', boxSizing: 'border-box' }}><SceneGraph source={graphSource} activeSceneId={selected} locale={locale} onNavigate={select}/></div></div>; }
function TransitionStory() {
  const [enter, setEnter] = useState<Record<string, unknown>>({ preset: 'blinds', durationMs: 500 });
  return <div className="authoring-shell" style={{ width: 320, padding: 24, display: 'block', minHeight: '100vh' }}><BackgroundTransition value={{ enter }} locale="zh-CN" onCommit={changes => setEnter(old => ({ ...old, ...Object.fromEntries(changes.map(change => [change.field.split('.').at(-1)!, change.value])) }))}/></div>;
}
const meta = { title: 'Product/Studio/Authoring/SceneRelationships', component: GraphStory, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof GraphStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const BranchesAndTitleEndings: Story = {};
export const Dark: Story = { args: { theme: 'dark' } };
export const English: Story = { args: { locale: 'en' } };
export const Japanese: Story = { args: { locale: 'ja', theme: 'dark' } };
export const Unconnected: Story = { args: { graphSource: { ...source, scenes: source.scenes.map(scene => ({ ...scene, text: '' })) } } };
export const InvalidSourceAndMissingTarget: Story = { args: { graphSource: { ...source, scenes: [{ ...source.scenes[0]!, name: '有未完成源码的场景 · 仍可检查已有跳转', text: 'changeScene {sceneId:"GoneAA"} @StmtAA;\nchoose {' }] } } };
export const BackgroundControls: Story = { render: () => <TransitionStory/> };
