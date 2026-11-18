import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SceneEntryPresentation } from '@galcraft/contracts';
import { SceneEntryEditor } from './../authoring/scene-entry-editor.js';
import structureStories from './../authoring/StoryStructureEditor.stories.js';
import { productAssets } from './product-fixture.js';
import '../authoring/shell.css';

const Structure = structureStories.component;

function AuthoringForms({ surface = 'opening', theme = 'light', empty = false }: {
  surface?: 'opening' | 'structure';
  theme?: 'light' | 'dark';
  empty?: boolean;
}) {
  const [opening, setOpening] = useState<SceneEntryPresentation>({ title: null, interlude: null });
  return <div data-theme={theme}>
    <div id="studio-portals" lang="zh-CN" data-theme={theme}/>
    {surface === 'structure' ? <Structure theme={theme} parameterDefaults/> : <section className="authoring-shell" style={{ display: 'block', height: 'auto', minHeight: '100vh', padding: 16 }}>
      <div className="scene-entry-document">
        <SceneEntryEditor value={opening} change={setOpening} assets={empty ? [] : productAssets()} locale="zh-CN"/>
      </div>
    </section>}
  </div>;
}

const meta = {
  id: 'review-studio-uxf06-authoring-forms',
  title: 'Product/Studio/Workbench/Authoring Forms',
  component: AuthoringForms,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AuthoringForms>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Opening: Story = {};
export const OpeningWithoutImages: Story = { args: { empty: true, theme: 'dark' } };
export const SceneDeclarations: Story = { args: { surface: 'structure' } };
export const SceneDeclarationsDark: Story = { args: { surface: 'structure', theme: 'dark' } };
