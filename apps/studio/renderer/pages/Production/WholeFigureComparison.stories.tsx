import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import type { Candidate, GenerationInput } from '@galcraft/authoring/production';
import type { Artifact, Asset, Issue } from '@galcraft/contracts';
import { FixtureAsset, fixtureId } from '@galcraft/contracts/fixtures';
import referenceUri from '../../../resources/practice/figures/deepseek-neutral.png?url';
import resultUri from '../../../resources/practice/figures/deepseek-smile.png?url';
import type { AuthoringServices } from '../../authoring/controller.js';
import { studioFixture } from '../../stories/studio-fixture.js';
import { CandidateMediaPreview } from './CandidateMediaPreview.js';
import { WholeFigureComparison } from './WholeFigureComparison.js';
import '../../authoring/shell.css';
import './production.css';

const assetId = fixtureId(0xf41);
const frozenId = fixtureId(0xf42);
const activeId = fixtureId(0xf43);
const mime = 'image/png';
const dimensions = { width: 1024, height: 1536 };
const referenceName = 'deepseek-neutral.png';
const resultName = 'deepseek-smile.png';
const frozenVariant: Asset['variants'][number] = {
  ...FixtureAsset.variants[0]!, id: frozenId, entry: referenceName,
  files: [{ path: referenceName, bytes: 1875011, mime, role: 'primary' }],
  metadata: { ...dimensions, hasAlpha: true, hasTransparency: true },
};
const activeVariant: Asset['variants'][number] = {
  ...frozenVariant, id: activeId, parentId: frozenId, role: 'compatible', entry: resultName,
  files: [{ path: resultName, bytes: 2091159, mime, role: 'primary' }],
};
const asset: Asset = {
  ...FixtureAsset, id: assetId, name: '林舟 · 平静', sourceName: referenceName,
  originalVariantId: frozenId, activeVariantId: activeId, variants: [frozenVariant, activeVariant],
};
const goal = '让林舟轻轻微笑，保留原立绘的服装、发型、姿势和透明背景。';
const input: Extract<GenerationInput, { purpose: 'image' }> = {
  purpose: 'image', usage: 'figure', positive: goal, negative: '', ...dimensions, count: 1, seed: null,
  references: [{ assetId, variantId: frozenId, candidateId: null, artifactIndex: null, localPath: referenceName, mime }],
};
const output: Artifact = {
  kind: 'image', localPath: resultName, mime, bytes: 2091159, metadata: dimensions,
  groupId: 'storybook/figure', role: 'primary', background: { declared: 'unchanged', hasAlpha: true, hasTransparency: true },
};
const candidate: Candidate = {
  schemaVersion: 1, id: fixtureId(0xf45), taskId: fixtureId(0xf46), itemId: fixtureId(0xf47),
  createdAt: FixtureAsset.createdAt, artifacts: [output], partial: false, backgroundPreview: null,
  parentCandidateIds: [], input,
  provenance: { connectionName: 'Storybook', protocol: null, model: null, workflowVersion: null, seed: null, usage: null, serviceRequestId: null },
  editedText: null, sourceVersions: [], recipeSnapshot: null, uiCompositionId: null, checks: [], adoption: [],
};
const media = [{ uri: resultUri, mime }];
const { services } = studioFixture('normal', 'zh-CN', 'light');

type Resources = NonNullable<AuthoringServices['runtimeAssets']>;
function comparisonResources(frozenAvailable: boolean) {
  const error: Issue = { code: 'STORY_VERSION_UNAVAILABLE', severity: 'error', owner: 'M04', message: '冻结版本的预览不可用', related: [], actions: [] };
  const resolve: Resources['resolveRuntime'] = async (requestedAsset, requestedVersion) => {
    const version = requestedAsset === assetId && asset.variants.find(variant => variant.id === requestedVersion);
    if (!version || (!frozenAvailable && requestedVersion === frozenId)) return { ok: false, error, issues: [error] };
    const uri = version.id === frozenId ? referenceUri : resultUri;
    return { ok: true, value: { leaseId: fixtureId(0xf44), uri, mime, bytes: version.files[0]!.bytes }, warnings: [] };
  };
  const releaseRuntime: Resources['releaseRuntime'] = async () => ({ ok: true, value: undefined, warnings: [] });
  return { resolveRuntime: fn(resolve), releaseRuntime };
}
const available = comparisonResources(true);
const unavailable = comparisonResources(false);

function ComparisonExample({ theme = 'light', frozenAvailable = true }: { theme?: 'light' | 'dark'; frozenAvailable?: boolean }) {
  return <main className="authoring-shell" data-theme={theme} lang="zh-CN"
    style={{ padding: 16, overflow: 'auto', background: 'var(--background)', color: 'var(--foreground)' }}>
    <div className="candidate-grid" style={{ maxWidth: 960, marginInline: 'auto' }}>
      <article className="candidate-card">
        <WholeFigureComparison input={input} asset={asset} output={output} resources={frozenAvailable ? available : unavailable} locale="zh-CN">
          <CandidateMediaPreview candidate={candidate} index={0} media={media} services={services} label="生成候选"/>
        </WholeFigureComparison>
      </article>
    </div>
  </main>;
}

const meta = {
  title: 'Product/Studio/Production/Whole figure comparison', component: ComparisonExample,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ComparisonExample>;
export default meta;
type Story = StoryObj<typeof meta>;

const verifyComparison: NonNullable<Story['play']> = async ({ canvas, canvasElement }) => {
  const reference = await canvas.findByRole<HTMLImageElement>('img', { name: '主参考图' });
  const result = canvas.getByRole<HTMLImageElement>('img', { name: '生成候选' });
  await waitFor(() => {
    expect(reference.naturalWidth).toBe(dimensions.width);
    expect(result.naturalWidth).toBe(dimensions.width);
  });
  await expect(available.resolveRuntime).toHaveBeenCalledWith(assetId, frozenId);
  await expect(available.resolveRuntime).not.toHaveBeenCalledWith(assetId, activeId);
  await expect(reference).toHaveAttribute('src', referenceUri);
  await expect(result).toHaveAttribute('src', resultUri);
  await expect(canvas.getByText(frozenId, { exact: false })).toBeVisible();
  await expect(canvas.getByText(/image\/png/)).toBeVisible();
  await expect(canvas.getByText('含透明像素')).toBeVisible();
  const summary = canvas.getByText('本次目标');
  await expect(canvas.getByText(goal)).not.toBeVisible();
  await userEvent.tab();
  await expect(summary).toHaveFocus();
  await userEvent.click(summary);
  await expect(canvas.getByText(goal)).toBeVisible();
  await userEvent.click(summary);
  await expect(canvas.getByText(goal)).not.toBeVisible();
  canvasElement.dataset.figureComparisonVerified = 'true';
};

export const Ready: Story = { play: verifyComparison };
export const Dark: Story = { args: { theme: 'dark' }, play: verifyComparison };
export const FrozenVersionUnavailable: Story = { args: { frozenAvailable: false }, play: async ({ canvas, canvasElement }) => {
  await expect(await canvas.findByRole('alert')).toHaveTextContent('冻结版本的预览不可用');
  await expect(canvas.queryByRole('img', { name: '主参考图' })).not.toBeInTheDocument();
  await expect(canvas.getByRole('img', { name: '生成候选' })).toBeVisible();
  await expect(unavailable.resolveRuntime).toHaveBeenCalledWith(assetId, frozenId);
  await expect(unavailable.resolveRuntime).not.toHaveBeenCalledWith(assetId, activeId);
  canvasElement.dataset.figureComparisonVerified = 'true';
} };
