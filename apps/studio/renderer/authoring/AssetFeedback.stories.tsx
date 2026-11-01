import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AssetListIdentity } from '@galcraft/contracts';
import { Button } from '../components/controls.js';
import { AssetImportSummary } from './asset-import-result.js';
import type { AssetImportResult } from './asset-import-model.js';
import { mountSelectedAssetsSheet } from './selected-assets-sheet.js';
import './workspace.css';

function FeedbackStory({ theme = 'light', state = 'mixed', locale = 'zh-CN' }: {
  theme?: 'light' | 'dark'; state?: 'mixed' | 'success' | 'failed' | 'empty' | 'long'; locale?: string;
}) {
  const [report, setReport] = useState<AssetImportResult | null>({ succeeded: state === 'failed' ? 0 : 3,
    failed: state === 'success' ? [] : [
      { path: 'D:\\素材\\背景\\雨中的站台.png', reason: '文件暂时无法读取，请确认文件存在后重试。' },
      { path: `D:\\素材\\角色\\${state === 'long' ? '来自遥远星球的旅人'.repeat(10) : '旅人'}.model3.json`, reason: '模型缺少纹理文件。请补齐纹理后重试。' },
    ] });
  const [removed, setRemoved] = useState(false), [retryCount, setRetryCount] = useState(0);
  useEffect(() => { let portals = document.getElementById('studio-portals'); const owns = !portals;
    if (!portals) { portals = document.createElement('div'); portals.id = 'studio-portals'; document.body.append(portals); }
    portals.dataset.theme = theme; portals.lang = locale; return () => { if (owns) portals.remove(); }; }, [theme, locale]);
  const items: AssetListIdentity[] = state === 'empty' ? [] : Array.from({ length: state === 'long' ? 60 : 3 }, (_, index) => ({
    assetId: `Asset${index}`, revision: 1, name: `${index + 1}. ${state === 'long' ? '在世界尽头等待重逢的故事'.repeat(7) : ['春日街角', '午后书店', '夜雨'][index]}`,
    kind: index % 2 ? 'audio' : 'image', folder: ['作品', '素材', index % 2 ? '音乐' : '背景'], character: null, sameNameCount: 1,
    sourceName: index % 2 ? '午后书店.ogg' : '春日街角.png', createdAt: '2026-10-11T00:00:00.000Z', shownVariant: null, currentBindingMissing: false,
  }));
  return <div data-theme={theme}><main className="authoring-shell authoring-assets" style={{ minHeight: '100vh', padding: 24, display: 'block' }}>
    <h1>素材库 · 导入与所选项</h1>
    {report && <AssetImportSummary result={report} locale={locale} dismiss={() => setReport(null)} retry={() => {
      setRetryCount(count => count + 1); setReport({ succeeded: report.succeeded + report.failed.length, failed: [] });
    }}/>}
    <div className="gc-actions"><Button onClick={() => mountSelectedAssetsSheet({ items, visibleIds: items.slice(0, 1).map(item => item.assetId),
      missing: state === 'empty' || removed ? [] : [{ id: 'MissingAsset', name: '已移除的片尾曲' }], locale,
      removeMissing: () => setRemoved(true), closed: () => {} })}>查看所选</Button></div>
    <p role="status">{removed ? '已移除失效选择' : '保留跨页选择'} · 重试 {retryCount} 次</p>
    <p>当前筛选：背景 · 第 2 页。关闭详情后继续从当前位置工作。</p>
  </main></div>;
}
const meta = { title: 'Product/Studio/Assets/Feedback', component: FeedbackStory, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof FeedbackStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Mixed: Story = {};
export const Dark: Story = { args: { theme: 'dark' } };
export const Failed: Story = { args: { state: 'failed' } };
export const Success: Story = { args: { state: 'success' } };
export const Empty: Story = { args: { state: 'empty' } };
export const LongNames: Story = { args: { state: 'long' } };
export const English: Story = { args: { locale: 'en' } };
