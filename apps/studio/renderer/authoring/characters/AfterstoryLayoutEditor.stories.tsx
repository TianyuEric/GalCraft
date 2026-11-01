import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Character } from '@galcraft/contracts';
import { FixtureCharacters, FixtureIds } from '@galcraft/contracts/fixtures';
import { AfterstoryLayoutEditor, upperBodyCrop } from './AfterstoryLayoutEditor.js';
import { productAssets, productMedia } from '../../stories/product-fixture.js';
import '../shell.css';
import '../workspace.css';
function Editor({ theme = 'light', empty = false }: { theme?: 'light' | 'dark'; empty?: boolean }) {
  const assets = productAssets(), image = assets.find(item => item.characterId)!;
  const [characters, setCharacters] = useState<Character[]>(empty ? [] : ['澜汐', '绮白', '绯书'].map((name, index) => ({ ...FixtureCharacters[0]!, id: `Hero0${index}`, name, narrativeRole: 'main', afterstory: {
    id: `Entry${index}`, title: `${name} · 后日谈`, cover: null, entry: { sceneId: FixtureIds.street, labelId: null }, initialProgress: {}, unlockEndingIds: ['route'], lockedView: 'locked',
    presentation: { figure: { assetId: image.id, variantId: image.activeVariantId }, crop: { ...upperBodyCrop }, order: index },
  } })));
  const resources = { resolveRuntime: async (assetId: string) => ({ ok: true as const, value: { leaseId: 'Story1', uri: productMedia[assetId]!, mime: 'image/png', bytes: 1 }, warnings: [] }), releaseRuntime: async () => ({ ok: true as const, value: undefined, warnings: [] }) };
  return <div data-theme={theme}><div className="authoring-shell" style={{ display: 'block', padding: 16, minHeight: '100vh', height: 'auto', background: 'var(--workbench-inspector)' }}><div style={{ maxWidth: 420, margin: 'auto' }}><AfterstoryLayoutEditor characters={characters} assets={assets} resources={resources} locale="zh-CN" commit={async values => setCharacters(previous => previous.map(item => ({ ...item, afterstory: { ...item.afterstory!, presentation: values.find(value => value.characterId === item.id)?.presentation ?? item.afterstory!.presentation } })))}/><output data-testid="afterstory-layout-value">{JSON.stringify(characters.map(item => ({ id: item.id, presentation: item.afterstory?.presentation })))}</output></div></div></div>;
}
export default { title: 'Product/Studio/Authoring/Afterstory Layout', component: Editor, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Editor>;
type Story = StoryObj<typeof Editor>;
export const Configure: Story = {};
export const Dusk: Story = { args: { theme: 'dark' } };
export const Empty: Story = { args: { empty: true } };
