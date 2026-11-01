import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { AssetVariantSchema, AssetReferenceSchema, createId, IdSchema, RelativePathSchema, ResourceCapabilitiesSchema, fieldSpecsInputSchema, validateJsonData, RevisionSchema, VersionSchema, JsonSchema } from '@galcraft/contracts';
import type { AssetReference, AssetVariant, Id, Json, Result } from '@galcraft/contracts';
import type { ResourceProcessorContribution } from '@galcraft/plugins/contracts';
import { assetFilePath, indexEdit } from '../core/catalog.js';
import { inspectFile } from '../core/import.js';
import { resourceSource } from '../core/source.js';
import { fail, ok } from '../core/result.js';
import type { AssetIndex, PreparedIndexEdit } from '../core/types.js';

export type ProcessorCandidate = { preparationId: Id; assetId: Id; sourceVariantId: Id; assetRevision: number;
  processorKey: string; packageVersion: string; variant: AssetVariant; metadata: Json; referenceScope?: AssetReference[] };
export const ProcessorCandidateSchema = AssetVariantSchema.pick({}).extend({ preparationId: IdSchema, assetId: IdSchema, sourceVariantId: IdSchema, assetRevision: RevisionSchema,
  processorKey: AssetReferenceSchema.shape.usage, packageVersion: VersionSchema, variant: AssetVariantSchema, metadata: JsonSchema,
  referenceScope: AssetReferenceSchema.extend({ label: AssetReferenceSchema.shape.usage.optional() }).array().optional() });
export class PluginResourceProcessor {
  private pending = new Map<Id, ProcessorCandidate>();
  constructor(readonly root: string, readonly tools: string, private index: () => AssetIndex) {}
  private record(id: Id) { return join(this.root, '.galcraft', 'asset-processing', `${IdSchema.parse(id)}.json`); }
  async open(): Promise<void> {
    const directory = dirname(this.record(createId()));
    let names: string[];
    try { names = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    for (const name of names.filter(name => name.endsWith('.json'))) {
      const candidate = JSON.parse(await readFile(join(directory, name), 'utf8')) as ProcessorCandidate;
      IdSchema.parse(candidate.preparationId); AssetVariantSchema.parse(candidate.variant);
      const asset = this.index().data.assets.find(asset => asset.id === candidate.assetId);
      if (asset?.variants.some(variant => variant.id === candidate.variant.id)) { await rm(this.record(candidate.preparationId)); continue; }
      this.pending.set(candidate.preparationId, candidate);
    }
  }
  candidates(): ProcessorCandidate[] { return structuredClone([...this.pending.values()]); }
  async prepare(input: { assetId: Id; sourceVariantId: Id; settings: Json; references?: AssetReference[]; expectedRevision?: number }, processor: ResourceProcessorContribution,
    packageVersion: string, signal = new AbortController().signal): Promise<Result<ProcessorCandidate>> {
    const asset = this.index().data.assets.find(asset => asset.id === input.assetId), source = asset?.variants.find(variant => variant.id === input.sourceVariantId);
    if (!asset || !source) return fail('RESOURCE_SOURCE_MISSING', '资源源版本不存在');
    if (input.expectedRevision !== undefined && asset.revision !== input.expectedRevision) return fail('RESOURCE_SOURCE_CHANGED', 'The source asset revision changed. Read the asset and prepare again.', ['compare']);
    if (!processor.inputKinds.includes(asset.kind) || !processor.outputKinds.includes(asset.kind)) return fail('PROCESSOR_KIND', '处理器不支持此资源类别的输入与派生版本');
    const settings = validateJsonData(fieldSpecsInputSchema(processor.fields), input.settings);
    if (!settings.ok) return { ok: false, error: { ...settings.error, owner: 'M04', code: 'PROCESSOR_SETTINGS' }, issues: settings.issues.map(issue => ({ ...issue, owner: 'M04', code: 'PROCESSOR_SETTINGS' })) };
    const preparationId = createId(this.index()), variantId = createId(this.index());
    const staging = join(this.root, 'assets', 'prepared', preparationId), destination = join(this.root, 'assets', 'files', asset.id, variantId);
    let moved = false;
    try {
      signal.throwIfAborted(); await mkdir(staging, { recursive: true });
      const sourceDirectory = join(this.root, ...assetFilePath(asset.id, source.id, '').split('/'));
      const response = await processor.process({ source: resourceSource(sourceDirectory, source.entry, source.files.map(file => file.path), source.metadata),
        settings: structuredClone(input.settings), outputDirectory: staging }, processor.supportsCancel ? signal : new AbortController().signal);
      signal.throwIfAborted(); if (!response.ok) return response;
      const output = response.value;
      if (output.derivedFrom && (output.derivedFrom.assetId !== asset.id || output.derivedFrom.variantId !== source.id)) throw new Error('处理器返回的派生源与本次输入不一致');
      RelativePathSchema.parse(output.rootFile);
      const files: AssetVariant['files'] = [], paths = new Set<string>();
      for (const file of output.files) {
        RelativePathSchema.parse(file.path); if (paths.has(file.path)) throw new Error(`处理器产物重复：${file.path}`); paths.add(file.path);
        const path = resolve(staging, ...file.path.split('/'));
        if (!path.startsWith(resolve(staging) + sep)) throw new Error('处理器产物超出输出目录');
        const info = await stat(path); if (!info.isFile() || info.size !== file.bytes) throw new Error(`处理器产物不存在或大小不符：${file.path}`);
        files.push({ ...file, role: file.path === output.rootFile ? 'entry' : 'dependency' });
      }
      if (!paths.has(output.rootFile)) throw new Error('处理器产物集合缺少入口');
      if (output.kind && output.kind !== asset.kind) throw new Error('跨类别产物需要通过普通导入创建新素材');
      const inspected = await inspectFile(join(staging, ...output.rootFile.split('/')), this.tools, signal);
      if (!inspected.ok && (inspected.error.code !== 'UNSUPPORTED_FORMAT' || !output.capabilities)) return inspected;
      const metadata = AssetVariantSchema.shape.metadata.safeParse(output.metadata);
      const probe = inspected.ok ? inspected.value : { kind: asset.kind, mime: files.find(file => file.path === output.rootFile)!.mime,
        metadata: metadata.success ? metadata.data : source.metadata, targets: { web: 'unverified' as const, windows: 'unverified' as const } };
      if (probe.kind !== asset.kind) throw new Error('处理器产物类别与源素材不一致');
      const variant: AssetVariant = { id: variantId, parentId: source.id, role: files.length > 1 ? 'group' : 'compatible', files, entry: output.rootFile,
        metadata: probe.metadata, canvas: probe.metadata.width && probe.metadata.height ? { width: probe.metadata.width, height: probe.metadata.height, offsetX: 0, offsetY: 0 } : null,
        processing: { toolId: processor.key, toolVersion: packageVersion, inputVariantId: source.id, settings: { kind: 'plugin', settings: structuredClone(input.settings) } },
        targets: probe.targets, groupCapabilities: output.capabilities ? ResourceCapabilitiesSchema.parse(output.capabilities) : null,
        ...(source.typeData ? { typeData: structuredClone(source.typeData) } : {}) };
      AssetVariantSchema.parse(variant);
      await mkdir(destination, { recursive: true }); moved = true;
      for (const file of files) { const to = join(destination, ...file.path.split('/')); await mkdir(dirname(to), { recursive: true }); await copyFile(join(staging, ...file.path.split('/')), to); }
      const candidate: ProcessorCandidate = { preparationId, assetId: asset.id, sourceVariantId: source.id, assetRevision: asset.revision, processorKey: processor.key, packageVersion, variant,
        metadata: structuredClone(output.metadata), referenceScope: structuredClone(input.references ?? []) };
      await mkdir(dirname(this.record(preparationId)), { recursive: true }); await writeFile(this.record(preparationId), JSON.stringify(candidate, null, 2) + '\n');
      this.pending.set(preparationId, candidate); moved = false; return ok(structuredClone(candidate));
    } catch (error) { return fail(signal.aborted ? 'CANCELLED' : 'RESOURCE_PROCESS_FAILED', String(error), ['retry']); }
    finally { await rm(staging, { recursive: true, force: true }); if (moved) await rm(destination, { recursive: true, force: true }); }
  }
  prepareIndexEdit(preparationId: Id, activate = true): Result<PreparedIndexEdit> {
    const candidate = this.pending.get(preparationId), index = this.index(), asset = index.data.assets.find(asset => asset.id === candidate?.assetId);
    if (!candidate || !asset) return fail('PREPARATION_MISSING', '资源处理候选不存在');
    if (asset.revision !== candidate.assetRevision) return fail('RESOURCE_SOURCE_CHANGED', '源素材已变化，请重新审阅或处理', ['compare']);
    const next = structuredClone(index.data.assets), updated = next.find(asset => asset.id === candidate.assetId)!;
    updated.variants.push(structuredClone(candidate.variant)); if (activate) updated.activeVariantId = candidate.variant.id;
    updated.revision++; updated.modifiedAt = new Date().toISOString(); return indexEdit(index, next, [asset.id]);
  }
  async confirm(preparationId: Id): Promise<void> { this.pending.delete(preparationId); await rm(this.record(preparationId), { force: true }); }
  async discard(preparationId: Id): Promise<void> {
    const candidate = this.pending.get(preparationId); if (!candidate) return;
    const indexed = this.index().data.assets.some(asset => asset.variants.some(variant => variant.id === candidate.variant.id));
    if (!indexed) await rm(join(this.root, 'assets', 'files', candidate.assetId, candidate.variant.id), { recursive: true, force: true });
    await this.confirm(preparationId);
  }
}
