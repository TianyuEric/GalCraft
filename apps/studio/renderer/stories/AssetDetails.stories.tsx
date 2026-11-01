import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FixtureAsset, fixtureId } from '@galcraft/contracts/fixtures';
import { createAssetDetails } from '../authoring/asset-details.js';

function AssetDetails({ locale = 'zh-CN', versions = 3, longName = false }: { locale?: 'zh-CN' | 'en' | 'ja'; versions?: number; longName?: boolean }) {
  const root = useRef<HTMLDivElement>(null), [message, setMessage] = useState('');
  useEffect(() => {
    const asset = structuredClone(FixtureAsset);
    asset.name = longName ? '杏 · 雨站重逢 / 私服立绘 / 长名称与多个表情版本'.repeat(3) : '杏 · 雨站重逢';
    asset.folder = ['角色', '杏', '春日私服']; asset.tags = ['立绘', '雨站'];
    asset.variants = Array.from({length:versions}, (_, index) => ({ ...structuredClone(asset.variants[0]!), id: fixtureId(0xda0 + index), files: [{path:`figures/an/spring-costume/character-expression-${index + 1}.png`,mime:'image/png',role:'primary',bytes:2418200}], metadata:{width:720,height:1080} }));
    asset.activeVariantId = asset.variants[0]!.id;
    const dialog = createAssetDetails(asset, locale, {preview: () => { setMessage(locale === 'en' ? 'Preview selected' : locale === 'ja' ? 'プレビュー選択済み' : '已选择预览'); }, transparent: () => { setMessage(locale === 'en' ? 'Transparent version requested' : locale === 'ja' ? '透過バージョンを選択' : '已选择透明版本'); }});
    for (const image of dialog.querySelectorAll('img')) image.src = '/practice/figures/chatgpt-neutral.png';
    root.current?.append(dialog); dialog.showModal();
    return () => { dialog.close(); dialog.remove(); };
  }, [locale, versions, longName]);
  return <><p role="status">{message}</p><div ref={root} /></>;
}
const meta = { title: 'Product/Studio/Authoring/Asset details', component: AssetDetails, args: {locale:'zh-CN',versions:3,longName:false},
  argTypes: {locale:{control:'select',options:['zh-CN','en','ja']},versions:{control:{type:'range',min:1,max:12,step:1}}}, parameters:{layout:'fullscreen'} } satisfies Meta<typeof AssetDetails>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Image: Story = {};
export const ManyVersions: Story = {args:{versions:10}};
export const LongName: Story = {args:{longName:true,versions:8}};
export const English: Story = {args:{locale:'en'}};
export const Japanese: Story = {args:{locale:'ja'}};
