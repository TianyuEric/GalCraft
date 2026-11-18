import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FixtureCharacters } from '@galcraft/contracts/fixtures';
import { Button } from '../../components/controls.js';
import { productAssets, productMedia } from '../../stories/product-fixture.js';
import { BindCharacterDifference } from './BindCharacterDifference.js';
import '../shell.css';

const source = productAssets().find(asset => asset.kind === 'image' && asset.characterId)!;
const pinned = source.variants[0]!;
const asset = { ...source, activeVariantId: 'Active', variants: [pinned, { ...pinned, id: 'Active' }] };
const resources = {
  resolveRuntime: async (id: string, variantId?: string | null) => ({ ok: true as const, value: { leaseId: variantId ?? 'LeaseA', uri: productMedia[id]!, mime: 'image/png', bytes: 1 }, warnings: [] }),
  releaseRuntime: async () => ({ ok: true as const, value: undefined, warnings: [] }),
};

function Binding({ dark = false }: { dark?: boolean }) {
  const [open, setOpen] = useState(true), [status, setStatus] = useState('');
  const theme = dark ? 'dark' : 'light';
  return <div className="authoring-shell" data-theme={theme} style={{ display: 'block', padding: 16 }}>
    <div id="studio-portals" lang="en" data-theme={theme} />
    <Button onClick={() => setOpen(true)}>Bind image version</Button>
    {status && <p role="status">{status}</p>}
    {open && <BindCharacterDifference asset={asset} variantId={pinned.id} characters={FixtureCharacters} locale="en" resources={resources} close={() => setOpen(false)}
      apply={async operation => { setStatus(`Bound ${operation.name} to version ${operation.figure.variantId}.`); return { ok: true, value: undefined, warnings: [] }; }} />}
  </div>;
}

const meta = { title: 'Product/Studio/Authoring/Bind Shared Difference', component: Binding, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Binding>;
export default meta;
type Story = StoryObj<typeof meta>;
export const OlderImageVersion: Story = {};
export const Dark: Story = { args: { dark: true } };
