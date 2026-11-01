import { AssetTypeDataSchema, BuiltinAssetKindSchema, RefSchema } from '@galcraft/contracts';
import type { Asset, AssetKind, AssetTypeData, AssetVariant, Id, Json, Ref, Result, Target } from '@galcraft/contracts';
import { validateAssetTypeDefinition, validatePluginData } from '@galcraft/plugins/contracts';
import type { AssetTypeDefinition, AssetTypeDescriptor, RegisteredAssetType } from '@galcraft/plugins/contracts';
import { fail, ok } from './result.js';

const builtinNames = { image: 'Image', audio: 'Audio', video: 'Video', font: 'Font', live2d: 'Live2D', texture: 'Texture', animation: 'Animation', effect: 'Effect' };
/** A project-scoped catalog. No process-global registration or automatic provider upgrades. */
export class AssetTypeRegistry {
  private readonly registrations: RegisteredAssetType[] = [];
  constructor(registrations: readonly RegisteredAssetType[] = []) {
    for (const key of BuiltinAssetKindSchema.options) this.registrations.push({ provider: null, definition: {
      contractVersion: 1, key, typeVersion: 1, title: builtinNames[key], description: '', icon: key,
      schema: true, fields: [], extensions: [], targets: ['web', 'windows', 'android', 'ios'], resourceProviderKey: null,
      capabilities: [], collectReferences: () => [], rewriteReferences: value => ok(value),
    } });
    for (const registration of registrations) this.register(registration);
  }
  register(registration: RegisteredAssetType): void {
    if (!registration.provider) throw new Error('Plugin asset type requires an exact provider');
    validateAssetTypeDefinition(registration.definition, registration.provider);
    const kind = registration.definition.builtinKind ?? registration.definition.key;
    if (registration.definition.builtinKind && this.registrations.some(item => item.provider && (item.definition.builtinKind ?? item.definition.key) === kind))
      throw new Error(`Duplicate builtin asset type association: ${kind}`);
    const resolverKeys = [registration.definition.resourceProviderKey, ...registration.definition.resourceProviderAliases ?? []].filter(Boolean);
    if (resolverKeys.some(key => this.registrations.some(item => item.provider && [item.definition.resourceProviderKey, ...item.definition.resourceProviderAliases ?? []].includes(key))))
      throw new Error(`Duplicate resource provider association: ${kind}`);
    if (this.registrations.some(item => item.definition.key === registration.definition.key && item.definition.typeVersion === registration.definition.typeVersion
      && item.provider?.id === registration.provider!.id && item.provider?.version === registration.provider!.version)) throw new Error(`Duplicate asset type: ${registration.definition.key}`);
    this.registrations.push(registration);
  }
  list(): { descriptor: AssetTypeDescriptor; provider: AssetTypeData['provider'] | null }[] {
    return this.registrations.filter(item => item.provider || !this.registrations.some(other => other.provider && other.definition.builtinKind === item.definition.key)).map(({ definition, provider }) => {
      const { validate, collectReferences, rewriteReferences, rewriteFile, ...descriptor } = definition;
      return { descriptor: structuredClone({ ...descriptor, key: definition.builtinKind ?? definition.key }), provider: structuredClone(provider) };
    });
  }
  definition(kind: AssetKind, data?: AssetTypeData): Result<RegisteredAssetType> {
    const candidates = this.registrations.filter(item => (item.definition.builtinKind ?? item.definition.key) === kind && item.definition.typeVersion === (data?.typeVersion ?? 1));
    const registration = data ? candidates.find(item => item.provider?.id === data.provider.id && item.provider.version === data.provider.version)
      : candidates.find(item => item.provider && item.definition.builtinKind) ?? candidates.find(item => item.provider === null);
    return registration ? ok(registration) : fail('ASSET_TYPE_UNAVAILABLE', `缺少素材类型 ${kind} v${data?.typeVersion ?? 1} / ${data ? `${data.provider.id}@${data.provider.version}` : 'builtin'}`, ['supplyDependency']);
  }
  resolveResourceProviderKey(key: string): string {
    return this.registrations.find(item => item.definition.resourceProviderAliases?.includes(key))?.definition.resourceProviderKey ?? key;
  }
  validate(kind: AssetKind, data?: AssetTypeData, target?: Target): Result<RegisteredAssetType> {
    const found = this.definition(kind, data); if (!found.ok) return found;
    if (target && !found.value.definition.targets.includes(target)) return fail('ASSET_TYPE_TARGET', `${kind} 不支持 ${target}`, ['supplyDependency']);
    if (data) {
      const checked = AssetTypeDataSchema.safeParse(data); if (!checked.success) return fail('ASSET_TYPE_DATA', checked.error.message);
      const schema = validatePluginData(found.value.definition.schema, data.value); if (!schema.ok) return schema;
      try { const valid = found.value.definition.validate?.(structuredClone(data.value)); if (valid && !valid.ok) return valid; }
      catch (error) { return fail('ASSET_TYPE_DATA', `${kind}: ${String(error)}`); }
    }
    return found;
  }
  references(kind: AssetKind, data?: AssetTypeData): Result<Ref[]> {
    const found = this.validate(kind, data); if (!found.ok) return found;
    try { return ok(data ? found.value.definition.collectReferences(structuredClone(data.value)).map(ref => RefSchema.parse(ref)) : []); }
    catch (error) { return fail('ASSET_TYPE_REFERENCES', `${kind}: ${String(error)}`); }
  }
  rewrite(kind: AssetKind, data: AssetTypeData | undefined, mapping: Record<Id, Id>): Result<AssetTypeData | undefined> {
    const found = this.validate(kind, data); if (!found.ok) return found;
    if (!data) return ok(undefined);
    const rewritten = found.value.definition.rewriteReferences(structuredClone(data.value), mapping); if (!rewritten.ok) return rewritten;
    const next = { ...structuredClone(data), value: rewritten.value };
    const valid = this.validate(kind, next); if (!valid.ok) return valid;
    return ok(next);
  }
  rewriteAsset(asset: Asset, mapping: Record<Id, Id>): Result<Asset> {
    const next = structuredClone(asset);
    for (const variant of next.variants) {
      const rewritten = this.rewrite(asset.kind, variant.typeData, mapping); if (!rewritten.ok) return rewritten;
      if (rewritten.value) variant.typeData = rewritten.value;
    }
    return ok(next);
  }
  rewriteFile(kind: AssetKind, variant: AssetVariant, path: string, bytes: Uint8Array, mapping: Record<Id, Id>): Result<Uint8Array> {
    const found = this.validate(kind, variant.typeData); if (!found.ok) return found;
    return found.value.definition.rewriteFile?.(path, bytes, mapping) ?? ok(bytes);
  }
}
