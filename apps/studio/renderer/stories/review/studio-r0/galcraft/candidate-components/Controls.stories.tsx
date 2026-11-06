import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText, Music, Plus, Search } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { expect, userEvent } from 'storybook/test';
import {
  CandidateActionMenu, CandidateButton, CandidateCheckbox, CandidateField, CandidateIconButton, CandidateInput,
  CandidateObjectRow, CandidateRangeField, CandidateResourceField, CandidateReviewDialog, CandidateSection,
  CandidateSelect, CandidateSourceStatus, CandidateState, CandidateDockTab, CandidateDockTabList, CandidateToolbar,
  type CandidateMenuTarget,
} from '../../../../../review/studio-candidate/components/controls/index.js';
import '../../../../../review/studio-candidate/styles/studio.css';
import './controls-specimen.css';

const scenes = [
  { id: 'street', title: '街道 · 春灯的最后一晚', count: '36 句' },
  { id: 'shop', title: '店前 · 把星星挂起来', count: '28 句' },
  { id: 'bridge', title: '石桥 · 春灯节结束后写给三年后的我们', count: '18 句' },
] as const;
type Scene = typeof scenes[number];

function ControlsSpecimen({ theme = 'light', initialReview = false }: { theme?: 'light' | 'dark'; initialReview?: boolean }) {
  const prefix = useId();
  const dismissReview = useRef<HTMLButtonElement>(null);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const [active, setActive] = useState<Scene>(scenes[0]);
  const [checked, setChecked] = useState<string[]>([scenes[0].id]);
  const [search, setSearch] = useState('');
  const [renaming, setRenaming] = useState<Scene | null>(null);
  const [duration, setDuration] = useState('0.6');
  const [committedDuration, setCommittedDuration] = useState('0.6');
  const [range, setRange] = useState(60);
  const [sound, setSound] = useState('第一声春雷');
  const [fixed, setFixed] = useState<Scene | null>(null);
  const [previewRetained, setPreviewRetained] = useState(false);
  const [menu, setMenu] = useState<{ scene: Scene; target: CandidateMenuTarget } | null>(null);
  const [review, setReview] = useState<'selection' | 'resource' | null>(initialReview ? 'selection' : null);
  const [task, setTask] = useState<'running' | 'error' | 'empty'>('error');
  const visible = scenes.filter(scene => scene.title.includes(search));
  const tabs = scenes.filter((scene, index) => index < 2 || scene.id === active.id);
  const durationValid = duration.trim() !== '' && Number.isFinite(Number(duration)) && Number(duration) >= 0;
  const tabId = (scene: Scene) => `${prefix}-tab-${scene.id}`;
  const panelId = (scene: Scene) => `${prefix}-panel-${scene.id}`;
  const toggleChecked = (id: string, select: boolean) => setChecked(previous =>
    select ? [...previous, id] : previous.filter(key => key !== id));

  return (
    <div className="gc-candidate authoring-shell" data-theme={theme} style={{ height: 'auto', minHeight: '100vh' }}>
      <main style={{ width: 'min(1040px, 100%)', margin: '0 auto', padding: '24px 16px' }}>
        <header style={{ paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <h1 style={{ margin: 0, font: 'var(--candidate-type-dialog)', fontWeight: 600 }}>场景编辑控件</h1>
          <p style={{ margin: '4px 0 0', font: 'var(--candidate-type-compact)', color: 'var(--muted-foreground)' }}>春灯之夜 · 场景目录、指令属性与审阅</p>
        </header>
        <div className="candidate-controls-specimen">
          <div className="candidate-controls-specimen-directory">
            <CandidateSection title="场景目录" actions={<CandidateIconButton label="显示全部场景" onClick={() => setSearch('')}><Search size={14} aria-hidden="true" /></CandidateIconButton>}>
              <CandidateField label="搜索场景">
                <CandidateInput type="search" density="compact" placeholder="按场景名称搜索" value={search} onChange={event => setSearch(event.target.value)} />
              </CandidateField>
              <CandidateToolbar label="场景批量选择">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CandidateCheckbox
                    checked={scenes.length === checked.length}
                    mixed={checked.length > 0 && checked.length < scenes.length}
                    onChange={event => setChecked(event.target.checked ? scenes.map(scene => scene.id) : [])}
                  />
                  <span style={{ font: 'var(--candidate-type-compact)' }}>选择全部场景</span>
                </label>
                <span style={{ marginInlineStart: 'auto', font: 'var(--candidate-type-meta)' }}>已选 {checked.length} 项</span>
              </CandidateToolbar>
              <ul style={{ display: 'grid', gap: 4, listStyle: 'none', margin: 0, padding: 0 }}>
                {visible.map(scene => (
                  <li key={scene.id}>
                    <CandidateObjectRow
                      icon={<FileText size={14} />}
                      title={scene.title}
                      metadata={scene.count}
                      active={active.id === scene.id}
                      selection={<CandidateCheckbox aria-label={`选择 ${scene.title}`} checked={checked.includes(scene.id)} onChange={event => toggleChecked(scene.id, event.target.checked)} />}
                      onActivate={() => setActive(scene)}
                      onRename={() => setRenaming(scene)}
                    />
                  </li>
                ))}
              </ul>
              {!visible.length && <CandidateState kind="empty" title="没有匹配的场景" description="请缩短搜索词或查看全部场景。" />}
              {renaming && <CandidateField label="场景名称草稿"><CandidateInput autoFocus defaultValue={renaming.title} key={renaming.id} /></CandidateField>}
              <CandidateToolbar label="场景目录操作">
                <CandidateButton variant="outline" onClick={() => setReview('selection')}>审阅选择</CandidateButton>
                <CandidateButton disabledReason="场景受开场入口引用，请先调整开场入口。">删除所选</CandidateButton>
              </CandidateToolbar>
            </CandidateSection>
          </div>
          <div className="candidate-controls-specimen-editor">
            <CandidateDockTabList label="场景标签" activeView={active.id} views={tabs.map(scene => scene.id)}>
              {tabs.map(scene => (
                <CandidateDockTab
                  key={scene.id}
                  viewId={scene.id}
                  title={scene.title}
                  tabId={tabId(scene)}
                  controls={panelId(scene)}
                  active={active.id === scene.id}
                  preview={scene.id === 'shop' && !previewRetained}
                  dirty={scene.id === 'street'}
                  description={scene.id === 'street' ? '有未保存修改' : previewRetained ? '已保留' : '临时预览'}
                  menuOpen={menu?.scene === scene}
                  onActivate={() => setActive(scene)}
                  onMenu={target => setMenu({ scene, target })}
                />
              ))}
            </CandidateDockTabList>
            <div role="tabpanel" aria-label={active.title} id={panelId(active)}>
              <CandidateSourceStatus
                label={fixed ? '固定来源' : '跟随编辑位置'}
                name={(fixed ?? active).title}
                mode={fixed ? 'fixed' : 'following'}
                changeMode={{ label: fixed ? '恢复跟随' : '固定来源', run: () => setFixed(fixed ? null : active) }}
              />
              <CandidateSection title="背景指令" collapsible>
                <CandidateField label="进入时长" unit="秒" error={durationValid ? undefined : '输入大于或等于 0 的时长。'}>
                  <CandidateInput inputMode="decimal" value={duration} onChange={event => setDuration(event.target.value)} />
                </CandidateField>
                <CandidateField label="背景过渡">
                  <CandidateSelect defaultValue="fade" density="compact">
                    <option value="fade">淡入淡出</option><option value="cut">直接切换</option>
                  </CandidateSelect>
                </CandidateField>
                <CandidateResourceField label="背景音效" value={sound} actionLabel="选择音效" onChoose={() => setReview('resource')} />
                <CandidateRangeField label="音量预览" min={0} max={100} value={range} unit="%" onChange={setRange} />
                <CandidateToolbar label="指令操作">
                  <CandidateButton variant="primary" disabledReason={durationValid ? undefined : '请先修正进入时长。'} onClick={() => setCommittedDuration(duration)}>应用属性</CandidateButton>
                  <output aria-label="已应用时长" style={{ font: 'var(--candidate-type-meta)' }}>已应用 {committedDuration} 秒</output>
                </CandidateToolbar>
              </CandidateSection>
            </div>
          </div>
          <div className="candidate-controls-specimen-state">
            <CandidateSection title="预览状态">
              <CandidateState
                kind={task}
                title={task === 'running' ? '正在读取场景音效' : task === 'empty' ? '没有运行中的预览' : '预览音效读取失败'}
                description={task === 'error' ? '素材仍在索引中。可保留当前指令参数并重试。' : undefined}
                action={task === 'error'
                  ? <CandidateButton variant="outline" onClick={() => setTask('running')}>重试预览</CandidateButton>
                  : task === 'running'
                    ? <CandidateButton variant="outline" onClick={() => setTask('empty')}>取消预览</CandidateButton>
                    : <CandidateButton onClick={() => setTask('running')}><Plus size={14} aria-hidden="true" />开始预览</CandidateButton>}
              />
              <CandidateState kind="loading" title="正在检查场景引用" description="检查期间可继续修改指令。" />
            </CandidateSection>
          </div>
        </div>
      </main>
      <div ref={setPortal} />
      <CandidateActionMenu
        label={menu ? `${menu.scene.title}的标签操作` : '标签操作'}
        portal={portal}
        target={menu?.target ?? null}
        onDismiss={() => setMenu(null)}
        actions={[
          { id: 'retain', label: '保留标签', disabledReason: menu?.scene.id === 'shop' && !previewRetained ? undefined : '标签已保留。', run: () => setPreviewRetained(true) },
          { id: 'open', label: '激活此场景', run: () => { if (menu) setActive(menu.scene); } },
          { id: 'find', label: '在场景目录中查找', separatorBefore: true, run: () => { if (menu) setSearch(menu.scene.title); } },
        ]}
      />
      <CandidateReviewDialog
        open={review !== null}
        portal={portal}
        title={review === 'resource' ? '选择背景音效' : '审阅场景选择'}
        description={review === 'resource' ? '从作品素材中选择一个用于当前背景指令的音效。' : `当前批量选择包含 ${checked.length} 个场景。`}
        onDismiss={() => setReview(null)}
        initialFocus={dismissReview}
        actions={<CandidateButton ref={dismissReview} variant="outline" density="standard" onClick={() => setReview(null)}>关闭审阅</CandidateButton>}
      >
        {review === 'resource'
          ? <CandidateObjectRow title="雨落在玻璃上" icon={<Music size={14} />} onActivate={() => { setSound('雨落在玻璃上'); setReview(null); }} />
          : <ul>{scenes.filter(scene => checked.includes(scene.id)).map(scene => <li key={scene.id}>{scene.title}</li>)}</ul>}
      </CandidateReviewDialog>
    </div>
  );
}

const meta = {
  title: 'Review/Studio/R0/GalCraft R0/候选组件/控件与排版',
  component: ControlsSpecimen,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ControlsSpecimen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = {};
export const Dark: Story = { args: { theme: 'dark' } };
export const Review: Story = { args: { initialReview: true } };

export const Interaction: Story = {
  play: async ({ canvas }) => {
    const batch = canvas.getByRole('checkbox', { name: '选择全部场景' });
    await expect(batch).toBePartiallyChecked();
    await userEvent.click(batch);
    await expect(batch).toBeChecked();
    await expect(canvas.getByText('已选 3 项')).toBeVisible();

    const duration = canvas.getByRole('textbox', { name: '进入时长' });
    await userEvent.clear(duration);
    await userEvent.type(duration, '0.');
    await userEvent.click(canvas.getByRole('button', { name: '应用属性' }));
    await expect(canvas.getByLabelText('已应用时长')).toHaveTextContent('已应用 0. 秒');
    await userEvent.clear(duration);
    await userEvent.type(duration, '无效');
    await expect(duration).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByRole('button', { name: '应用属性' })).toHaveAccessibleDescription('请先修正进入时长。');

    const firstTab = canvas.getByRole('tab', { name: /街道/ });
    const secondTab = canvas.getByRole('tab', { name: /店前/ });
    canvas.getByRole('button', { name: /街道.*36 句/ }).focus();
    await userEvent.keyboard('{F2}');
    await expect(canvas.getByRole('textbox', { name: '场景名称草稿' })).toHaveFocus();
    firstTab.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(secondTab).toHaveFocus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await expect(canvas.getByRole('menuitem', { name: '保留标签' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(secondTab).toHaveAccessibleDescription(expect.stringContaining('已保留'));
    await expect(firstTab).toHaveAttribute('aria-selected', 'true');
    await expect(duration).toHaveValue('无效');

    await userEvent.pointer({ keys: '[MouseRight]', target: secondTab });
    await expect(canvas.getByRole('menuitem', { name: '保留标签' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('menuitem', { name: '激活此场景' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect(secondTab).toHaveFocus();

    const choose = canvas.getByRole('button', { name: '选择音效' });
    await userEvent.click(choose);
    await expect(canvas.getByRole('dialog', { name: '选择背景音效' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '关闭审阅' }));
    await expect(choose).toHaveFocus();
    await userEvent.click(choose);
    await userEvent.click(canvas.getByRole('button', { name: '雨落在玻璃上' }));
    await expect(canvas.getByRole('textbox', { name: '背景音效' })).toHaveValue('雨落在玻璃上');

    await userEvent.click(canvas.getByRole('button', { name: '固定来源' }));
    await userEvent.click(secondTab);
    await expect(canvas.getByRole('group', { name: '固定来源' })).toHaveTextContent('街道 · 春灯的最后一晚');
    await userEvent.click(canvas.getByRole('button', { name: '恢复跟随' }));
    await expect(canvas.getByRole('group', { name: '跟随编辑位置' })).toHaveTextContent('店前 · 把星星挂起来');

    await userEvent.click(canvas.getByRole('button', { name: '重试预览' }));
    await expect(canvas.getByText('正在读取场景音效')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '取消预览' }));
    await expect(canvas.getByText('没有运行中的预览')).toBeVisible();
  },
};
