import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FixtureAsset, fixtureId } from '@galcraft/contracts/fixtures';
import { createAssetInspector } from '../authoring/asset-inspector.js';
import '../authoring/shell.css';
import '../authoring/workbench-production.css';

function Inspector({ missing = false, locale = 'zh-CN', theme = 'light' }: { missing?: boolean; locale?: string; theme?: string }) {
  const root = useRef<HTMLDivElement>(null), [message, setMessage] = useState('');
  useEffect(() => {
    const asset = structuredClone(FixtureAsset); asset.name = '雨站 · 原图与透明版本';
    asset.variants = [0, 1].map(index => ({ ...structuredClone(asset.variants[0]!), id: fixtureId(0xea0 + index), metadata: { width: index ? 720 : 1440, height: index ? 1080 : 2160 } })); asset.activeVariantId = asset.variants[0]!.id;
    const node = createAssetInspector(asset, { locale, reference: { variantId: missing ? fixtureId(0xeb0) : asset.variants[1]!.id }, rename: async name => { if (name === '冲突') throw new Error('名称已存在，请修改后重试'); setMessage(`改名:${name}`); }, preview: id => setMessage(`预览:${id}`), reveal: () => {}, transparent: () => {} });
    for (const image of node.querySelectorAll('img')) image.src = '/practice/figures/chatgpt-neutral.png';
    root.current?.replaceChildren(node); return () => node.remove();
  }, [missing, locale]);
  return <div data-theme={theme} lang={locale} className="authoring-shell" style={{ display: 'block', width: 360, height: '100vh', overflow: 'auto' }}><output data-testid="action">{message}</output><div ref={root}/></div>;
}
const meta = { title: 'Product/Studio/Assets/Inspector', component: Inspector, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Inspector>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Referenced: Story = {};
export const Missing: Story = { args: { missing: true } };
export const JapaneseDusk: Story = { args: { locale: 'ja', theme: 'dark' } };
