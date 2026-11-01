import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CreationRecipe } from '@galcraft/authoring/recipes';
import { RecipeEditor, presetIcon, presetSource } from './RecipeEditor.js';
import { OfficialRecipes } from '@galcraft/authoring/recipes/official';
import { operationRecipes } from '@galcraft/authoring/recipes/operations';
import { musicRenderOperation, musicDefinition } from '@galcraft/music-composition';
import { Button, Badge } from '../../components/controls.js';
import { useModalState } from '../../components/motion.js';
import { StudioToaster, studioToasts } from '../../components/toast.js';
import './production.css';
import '../../authoring/shell.css';

function Example({ official = false, project = false, theme = 'light', locale = 'zh-CN' }: { official?: boolean; project?: boolean; theme?: 'light'|'dark'; locale?: string }) {
  const [opened, setOpened] = useModalState(true);
  const [recipe, setRecipe] = useState<CreationRecipe>({ schemaVersion: 1, id: 'preset', revision: 1, scope: official ? 'official' : project ? 'project' : 'personal', projectId: project ? 'story1' : null,
    name: '温柔日常 · 延续角色的语气', description: '扩写日常对白，让动作和环境帮助表达情绪，保持已有角色性格。', purposes: ['script'], uses: ['script'],
    systemPrompt: '保留已确认的事实与人物设定。使用自然对白，以细节表现情绪。', taskTemplate: '创作资料：\n{{context}}\n本轮要求：\n{{instruction}}', outputGuidance: '',
    contextDefaults: ['setting','character','script'], parameters: [], examples: [], createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' });
  const [savedRecipe, setSavedRecipe] = useState(recipe);
  return <div data-theme={theme}><div id="studio-portals" data-theme={theme} lang={locale}/><div id="app" className="authoring-shell" data-theme={theme} style={{padding:32}}>
    <StudioToaster locale={locale}/><Button onClick={() => { setRecipe(savedRecipe); setOpened(true); }}>编辑创作预设</Button>
    {opened && <RecipeEditor recipe={recipe} savedRecipe={savedRecipe} onChange={setRecipe} locale={locale} persisted busy={false} projectId="story1" close={() => setOpened(false)}
      save={useAfter => { setSavedRecipe(recipe); studioToasts.add({ title: useAfter ? '已保存，可填写本轮创作要求' : '创作预设已保存' }); if (useAfter) setOpened(false); }}
      use={() => { setOpened(false); studioToasts.add({title:'可填写本轮创作要求'}); }} manage={action => studioToasts.add({title:action})}/>}
  </div></div>;
}
const meta = { title: 'Product/Studio/Production/Creation preset', component: Example, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Example>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Personal: Story = {};
export const Official: Story = {args:{official:true}};
export const Project: Story = {args:{project:true}};
export const Dark: Story = {args:{theme:'dark'}};
export const English: Story = {args:{locale:'en'}};

function PurposeCatalog({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const recipes: CreationRecipe[] = [...OfficialRecipes, ...(['personal', 'project'] as const).map((scope, index) => ({ ...OfficialRecipes[index + 1]!, id: `copy-${scope}`, scope, projectId: scope === 'project' ? 'story1' : null, name: `${scope === 'personal' ? '个人' : '作品'} · ${OfficialRecipes[index + 1]!.name}` }))];
  return <div id="app" className="authoring-shell" data-theme={theme} style={{ display: 'block', minHeight: '100vh', overflow: 'auto' }}><section className="recipe-grid">{recipes.map(recipe => {
    const PurposeIcon = presetIcon(recipe);
    return <article className="recipe-card" key={recipe.id}><span className="recipe-symbol" aria-hidden="true"><PurposeIcon size={21}/></span><Badge source={recipe.scope}>{presetSource(recipe.scope, 'zh-CN')}</Badge><h2>{recipe.name}</h2><p>{recipe.description}</p></article>;
  })}</section></div>;
}
export const AllPurposesAndSources: Story = { render: () => <PurposeCatalog/> };
export const DarkPurposesAndSources: Story = { render: () => <PurposeCatalog theme="dark"/> };

function PluginScheme({ theme = 'light', locale = 'zh-CN' }: { theme?: 'light'|'dark'; locale?: string }) {
  const initial = operationRecipes([{ id: musicRenderOperation.id, version: 1, provider: { id: 'org.galcraft.music-composition', version: '0.1.0' }, definition: musicRenderOperation, messages: musicDefinition.messages }])[0]!;
  const [recipe, setRecipe] = useState(initial);
  return <div id="app" data-theme={theme} lang={locale} className="authoring-shell" style={{ display: 'block', height: '100vh', overflow: 'auto', padding: 20 }}>
    <RecipeEditor inline recipe={recipe} onChange={setRecipe} locale={locale} persisted busy={false} projectId="StoryA" close={() => {}} save={() => {}} use={() => {}} manage={() => {}}/>
  </div>;
}
export const PluginComposition: Story = { render: () => <PluginScheme/> };
export const DarkPluginComposition: Story = { render: () => <PluginScheme theme="dark"/> };
export const EnglishPluginComposition: Story = { render: () => <PluginScheme locale="en"/> };
export const JapanesePluginComposition: Story = { render: () => <PluginScheme locale="ja"/> };

function OfficialScheme({ locale = 'zh-CN' }: { locale?: string }) {
  const [recipe, setRecipe] = useState(OfficialRecipes.find(recipe => recipe.production?.operation === 'image')!);
  return <div id="app" className="authoring-shell" data-theme="light" style={{ display: 'block', height: '100vh', overflow: 'auto', padding: 20 }}><RecipeEditor inline recipe={recipe} onChange={setRecipe} locale={locale} persisted busy={false} projectId="StoryA" close={() => {}} save={() => {}} use={() => {}} manage={() => {}}/></div>;
}
export const OfficialDirectJapanese: Story = { render: () => <OfficialScheme locale="ja"/> };
export const OfficialDirectEnglish: Story = { render: () => <OfficialScheme locale="en"/> };
