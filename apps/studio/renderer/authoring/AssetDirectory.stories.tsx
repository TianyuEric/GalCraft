import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AssetTypeCatalogEntry } from '@galcraft/contracts';
import { createAssetDirectory } from './asset-directory.js';
import type { AssetQuery } from './controller.js';
import './shell.css';

const catalog: AssetTypeCatalogEntry[] = (['image', 'audio', 'animation'] as const).map((kind, index) => ({
  descriptor: { key: kind, contractVersion: 1, typeVersion: 1, title: kind, description: '', icon: kind,
    schema: true, fields: [], extensions: [], targets: ['web', 'windows'], resourceProviderKey: null, capabilities: [] },
  provider: null, count: [38, 12, 2][index],
}));
const folders = [['背景'], ['背景', '雨站'], ['角色'], ['角色', '雨站重逢与深夜车站场景立绘'], ['配音']];

function AssetDirectory({ theme = 'light', locale = 'zh-CN' }: { theme?: 'light' | 'dark'; locale?: string }) {
  const slot = useRef<HTMLDivElement>(null), directory = useRef<ReturnType<typeof createAssetDirectory>>(null);
  const [query, setQuery] = useState<AssetQuery>({ kind: 'image', folder: ['背景', '雨站'], offset: 0, limit: 40, text: '' });
  useEffect(() => {
    const view = createAssetDirectory(); directory.current = view;
    slot.current?.replaceChildren(view.node);
    return view.dispose;
  }, []);
  useEffect(() => {
    directory.current?.render({ locale, catalog, query, folders, onScopeChange: scope => setQuery(current => ({ ...current, ...scope })) });
  }, [locale, query]);
  return <div ref={slot} lang={locale} data-theme={theme} className="authoring-shell" style={{ display: 'block', width: 240, minHeight: 520, background: 'var(--workbench-explorer)' }}/>;
}

const meta = { title: 'Components/Workbench/Asset Directory', component: AssetDirectory, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof AssetDirectory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Scoped: Story = {};
export const Dusk: Story = { args: { theme: 'dark' } };
