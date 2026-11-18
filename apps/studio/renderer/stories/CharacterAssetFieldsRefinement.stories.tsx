import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { CharacterManager, type CharacterGuiDraft, type CharacterManagerProps } from '../authoring/characters/CharacterManager.js';
import { openAssetPicker } from '../authoring/asset-picker.js';
import { characterAssetFieldsFixture } from './character-asset-fields-refinement-fixture.js';
import { pickerImportedId, pickerPinnedVersion } from './asset-picker-refinement-fixture.js';
import '../authoring/shell.css';
import '../authoring/workspace.css';

function CharacterAssetFieldsReview({ theme = 'light', section = 'basics', emptyDifferences = false }: { theme?: 'light' | 'dark'; section?: 'basics' | 'figures'; emptyDifferences?: boolean }) {
  const [fixture] = useState(() => characterAssetFieldsFixture(emptyDifferences)), [source, setSource] = useState(fixture.source), [assets, setAssets] = useState([...fixture.assets]);
  const [draft, setDraft] = useState<CharacterGuiDraft | null>(null), scope = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const portals = document.createElement('div'); portals.id = 'studio-portals'; portals.dataset.theme = theme; portals.dataset.locale = 'zh-CN'; document.body.append(portals);
    return () => { for (const dialog of portals.querySelectorAll('dialog')) dialog.close(); portals.remove(); };
  }, [theme]);
  const ok = <T,>(value: T) => ({ ok: true as const, value, warnings: [] });
  const chooseAsset: NonNullable<CharacterManagerProps['chooseAsset']> = request => openAssetPicker({
    services: fixture.services, projectId: source.project.projectId, allowedKinds: request.allowedKinds, characterId: request.characterId,
    currentAssetId: request.currentAssetId, currentVariantId: request.currentVariantId, scope: scope.current!,
    purpose: request.purpose === 'reference' ? '人物参考图' : request.purpose === 'difference-figure' ? '共同差分立绘源图' : '共同差分头像图片',
    onApply: async choice => { setAssets([...fixture.assets, ...(!fixture.assets.some(asset => asset.id === choice.assetId) ? [choice.asset] : [])]); return ok(undefined); },
  });
  const current = draft?.drafts[fixture.character.id] ?? fixture.character;
  return <div ref={scope} data-character-asset-fields data-theme={theme} data-locale="zh-CN" className="authoring-shell"
    data-reference-ids={current.appearance?.referenceAssets.join(',')} data-figure-variant={current.differences?.[0]?.figure.variantId ?? ''} data-difference-count={current.differences?.length ?? 0}
    style={{ display: 'block', minHeight: '100vh', height: 'auto', padding: 24, background: 'var(--workbench-editor)' }}>
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <p style={{ color: 'var(--muted-foreground)', margin: '0 0 16px', fontSize: 12 }}>Review 候选 · 真实人物字段与素材选择器；文件选择、导入及应用使用内存夹具。</p>
      <CharacterManager source={source} locale="zh-CN" embedded objectId={fixture.character.id} close={() => {}}
        assets={assets} chooseAsset={chooseAsset} runtimeAssets={fixture.resources} sectionRequest={{ section, request: 1 }}
        onGuiDraftChange={setDraft} apply={async drafts => { const next = { ...source, characters: source.characters.map(character => ({ ...character, ...drafts.find(draft => draft.id === character.id) })) }; setSource(next); return ok(next); }}
        remove={async () => ok(source)} history={async () => ok(source)} />
    </div>
  </div>;
}
const meta = { id: 'review-studio-uxf04-character-asset-fields', title: 'Product/Studio/Workbench/Character Asset Fields', component: CharacterAssetFieldsReview,
  args: { theme: 'light', section: 'basics' }, parameters: { layout: 'fullscreen', docs: { description: { component: '人物简介参考图与共同差分的就地选择/导入候选。使用真实 CharacterManager、SharedDifferencesEditor 与 openAssetPicker；复用素材回执服务夹具，不验证磁盘导入或真实宿主。原人物草稿事务保留资料与版本引用，选择器取消不会写回。' } } },
} satisfies Meta<typeof CharacterAssetFieldsReview>;
export default meta;
type Story = StoryObj<typeof meta>;
const state = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-character-asset-fields]')!;

export const ReferenceImages: Story = {
  play: async ({ canvas, canvasElement }) => {
    const description = canvas.getByRole('textbox', { name: '角色简介与创作设定' }), notes = canvas.getByRole('textbox', { name: '外观说明' });
    await userEvent.type(description, ' 保留尚未应用的创作设定。'); await userEvent.type(notes, ' 袖口微湿。');
    const trigger = canvas.getByRole('button', { name: '选择或导入参考图' }), screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(trigger); let dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(trigger).toHaveFocus()); await expect((notes as HTMLTextAreaElement).value).toContain('袖口微湿。');
    await userEvent.click(trigger); dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: '导入素材' }));
    const imported = await dialog.findByRole('option', { name: /新导入 · 雨后站台/ });
    await expect(state(canvasElement).dataset.referenceIds).not.toContain(pickerImportedId);
    await userEvent.click(imported); await userEvent.click(dialog.getByRole('button', { name: '应用' }));
    await waitFor(() => expect(state(canvasElement).dataset.referenceIds).toContain(pickerImportedId));
    await expect(canvas.getByText('新导入 · 雨后站台', { selector: '.character-asset-row span' })).toBeVisible(); await expect((description as HTMLTextAreaElement).value).toContain('保留尚未应用的创作设定。');
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const ReferenceImagesDusk: Story = { ...ReferenceImages, args: { theme: 'dark' } };
export const SharedDifferenceVersion: Story = {
  args: { section: 'figures' },
  play: async ({ canvas, canvasElement }) => {
    const name = canvas.getByRole('textbox', { name: /差分名称/ }); await userEvent.type(name, ' · 未应用');
    const trigger = canvas.getByRole('button', { name: '选择或导入立绘' }), screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(trigger); let dialog = within(await screen.findByRole('dialog'));
    await waitFor(() => expect(canvasElement.ownerDocument.querySelector('.asset-picker-current [data-variant]')).toHaveAttribute('data-variant', pickerPinnedVersion));
    await userEvent.click(dialog.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(trigger).toHaveFocus()); await expect(name).toHaveValue('站台 · 平静 · 未应用');
    await expect(state(canvasElement)).toHaveAttribute('data-figure-variant', pickerPinnedVersion);
    await userEvent.click(trigger); dialog = within(await screen.findByRole('dialog'));
    const fixed = canvasElement.ownerDocument.querySelector<HTMLElement>('.asset-picker-current [role="option"]')!;
    await waitFor(() => expect(fixed).toBeVisible()); await userEvent.click(fixed);
    await userEvent.click(dialog.getByRole('button', { name: '应用' }));
    await waitFor(() => expect(trigger).toHaveFocus()); await expect(state(canvasElement)).toHaveAttribute('data-figure-variant', pickerPinnedVersion);
    await expect(canvas.getByRole('combobox', { name: '立绘版本' })).toBeVisible();
  },
};
export const SharedDifferenceVersionDusk: Story = { ...SharedDifferenceVersion, args: { section: 'figures', theme: 'dark' } };
export const EmptyDifferenceImport: Story = {
  args: { section: 'figures', emptyDifferences: true },
  play: async ({ canvas, canvasElement }) => {
    const trigger = canvas.getByRole('button', { name: '添加共同差分' }), screen = within(canvasElement.ownerDocument.body);
    await userEvent.click(trigger); let dialog = within(await screen.findByRole('dialog'));
    await dialog.findByText('素材库为空，先导入素材。'); await userEvent.click(dialog.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(trigger).toHaveFocus()); await expect(state(canvasElement)).toHaveAttribute('data-difference-count', '0');
    await userEvent.click(trigger); dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: '导入素材' }));
    const imported = await dialog.findByRole('option', { name: /新导入 · 雨后站台/ });
    await expect(state(canvasElement)).toHaveAttribute('data-difference-count', '0');
    await userEvent.click(imported); await userEvent.click(dialog.getByRole('button', { name: '应用' }));
    await waitFor(() => expect(state(canvasElement)).toHaveAttribute('data-difference-count', '1'));
    await expect(canvas.getByRole('textbox', { name: /差分名称/ })).toHaveValue('新差分');
    await expect(canvas.getByText('新导入 · 雨后站台', { selector: '.character-asset-row span' })).toBeVisible();
    await expect(state(canvasElement)).toHaveAttribute('data-figure-variant', '');
  },
};
