import { createId } from '@galcraft/contracts';
import { FlowEntryRecordSchema, IdSchema, LongTermSchema, SaveIndexSchema, SaveRecordSchema } from '@galcraft/contracts';
import type { CompatibilityReport, EntryMapping, Issue, LongTerm, Snapshot, Target } from '@galcraft/contracts';
import type { Contributions, PluginManifest } from '@galcraft/plugins/contracts';
import { readArchive } from './archive.js';
import { dataReleaseVersions } from './import.js';
import { defaultPreferences, validatePreferences, effectivePlayerLanguages, normalizeLanguagePreferences } from './preferences.js';
import type { RestoreCoordinator, RestoreSource } from './restore.js';

export type CompatibilityFile = { file: string; bytes: Uint8Array };
const issue = (code: string, message: string): Issue => ({ code, message, severity: 'error', owner: 'M11', related: [], actions: ['compare'] });
const json = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));
export function parseCompatibilityFile(input: CompatibilityFile, projectId: string): { sources: RestoreSource[]; longTerm: LongTerm | null } {
  if (input.bytes[0] !== 0x50 || input.bytes[1] !== 0x4b) {
    const record = SaveRecordSchema.parse(json(input.bytes));
    if (record.projectId !== projectId) throw new Error('Save belongs to another project');
    return { sources: [{ kind: 'save', record }], longTerm: null };
  }
  const files = readArchive(input.bytes);
  if (!files['manifest.json']) throw new Error('Player data manifest is missing');
  const manifest = json(files['manifest.json']);
  if (manifest.format !== 'galcraft-player-data' || manifest.schemaVersion !== 1 || manifest.projectId !== projectId)
    throw new Error('Player data format or project identity differs');
  SaveIndexSchema.parse(manifest.index);
  if (manifest.preferences && !validatePreferences(manifest.preferences).ok) throw new Error('Invalid player preferences');
  const ids = IdSchema.array().parse(manifest.records);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate record identity');
  const records = ids.map(id => {
    const bytes = files[`records/${id}.json`]; if (!bytes) throw new Error(`Missing record: ${id}`);
    const record = SaveRecordSchema.parse(json(bytes));
    if (record.recordId !== id || record.projectId !== projectId) throw new Error(`Record identity differs: ${id}`);
    return record;
  });
  const longTerm = manifest.longTerm === null ? null : LongTermSchema.parse(manifest.longTerm);
  const entries = Object.values(longTerm?.flowEntries ?? {}).map(value => FlowEntryRecordSchema.parse(value));
  if (entries.some(entry => entry.projectId !== projectId)) throw new Error('Flow entry belongs to another project');
  if (!Array.isArray(manifest.releaseVersions) || dataReleaseVersions(records, longTerm).some(version => !manifest.releaseVersions.includes(version)))
    throw new Error('Player data manifest omits a record origin version');
  return { sources: [...records.map(record => ({ kind: 'save' as const, record })), ...entries.map(record => ({ kind: 'flowEntry' as const, record }))], longTerm };
}

export function compatibilityLongTerm(snapshot: Snapshot, contributions: Contributions, manifests: PluginManifest[], provided: LongTerm | null) {
  const initial: LongTerm = { schemaVersion: 2, revision: 0, readStatements: [], endings: [], cg: {}, music: [], video: [], flowEntries: {}, variables: {}, plugins: {} };
  const conversions: { provider: string; from: string; to: string }[] = [];
  for (const variable of snapshot.variables) if (variable.scope === 'longTerm')
    initial.variables[variable.id] = { value: variable.initial, updatedAt: new Date(0).toISOString() };
  for (const dependency of snapshot.lock.plugins) {
    const manifest = manifests.find(item => item.id === dependency.id && item.version === dependency.version);
    const system = contributions.systems.find(item => item.key === dependency.id || item.key.startsWith(`${dependency.id}/`));
    if (!manifest || !system) continue;
    let data = system.initialLongTerm(snapshot.pluginDocuments[dependency.id] ?? null);
    const incoming = provided?.plugins[dependency.id];
    if (incoming) {
      let converted = structuredClone(incoming.data);
      if (incoming.stateVersion !== manifest.stateVersions.longTerm) {
        const result = system.convert(incoming.stateVersion, manifest.stateVersions.longTerm, converted);
        if (!result.ok) throw new Error(result.error.message);
        converted = result.value;
        conversions.push({ provider: dependency.id, from: `${incoming.version}/${incoming.stateVersion}`, to: `${manifest.version}/${manifest.stateVersions.longTerm}` });
      } else if (incoming.version !== manifest.version) throw new Error(`Undeclared long-term conversion: ${dependency.id}`);
      const checked = system.validate(converted, 'longTerm'); if (!checked.ok) throw new Error(checked.error.message);
      const merged = system.mergeLongTerm(data, checked.value); if (!merged.ok) throw new Error(merged.error.message); data = merged.value;
    }
    const checked = system.validate(data, 'longTerm'); if (!checked.ok) throw new Error(checked.error.message);
    initial.plugins[dependency.id] = { version: manifest.version, stateVersion: manifest.stateVersions.longTerm, data: checked.value };
  }
  if (provided) {
    for (const [id, value] of Object.entries(provided.variables)) {
      const definition = snapshot.variables.find(variable => variable.id === id && variable.scope === 'longTerm');
      if (!definition || typeof definition.initial !== typeof value.value) throw new Error(`Incompatible long-term variable: ${id}`);
      initial.variables[id] = structuredClone(value);
    }
    for (const id of Object.keys(provided.plugins)) if (!initial.plugins[id]) throw new Error(`Missing long-term plugin: ${id}`);
    for (const key of ['readStatements', 'endings', 'cg', 'music', 'video', 'flowEntries'] as const) Object.assign(initial, { [key]: structuredClone(provided[key]) });
  }
  return { longTerm: LongTermSchema.parse(initial), conversions };
}

export async function reportCompatibility(input: { snapshot: Snapshot; target: Target; files: CompatibilityFile[];
  restore: RestoreCoordinator; contributions: Contributions; manifests: PluginManifest[]; entryMappings: EntryMapping[]; signal?: AbortSignal }): Promise<CompatibilityReport> {
  const { snapshot } = input;
  const report: CompatibilityReport = { projectId: snapshot.projectId, release: snapshot.releaseVersion, samples: [],
    testedAt: new Date().toISOString(), target: input.target, fileIssues: [], missingSamples: input.files.length ? [] : ['No representative saves selected'] };
  for (const file of input.files) {
    if (input.signal?.aborted) { report.missingSamples.push(file.file); continue; }
    let parsed: ReturnType<typeof parseCompatibilityFile>;
    try { parsed = parseCompatibilityFile(file, snapshot.projectId); }
    catch (error) { report.fileIssues.push({ file: file.file, issues: [issue('COMPATIBILITY_FILE', String(error))] }); continue; }
    if (!parsed.sources.length) report.missingSamples.push(file.file);
    for (const source of parsed.sources) {
      if (input.signal && !input.signal.aborted) await new Promise<void>(resolve => setTimeout(resolve, 0));
      const requestId = createId(), sample: CompatibilityReport['samples'][number] = {
        source: { file: file.file, kind: source.kind, id: source.kind === 'save' ? source.record.recordId : source.record.nodeId },
        fromRelease: source.record.releaseVersion, toRelease: snapshot.releaseVersion, result: 'incompatible',
        position: structuredClone(source.record.state.position), issues: [], conversions: [], longTermBasis: parsed.longTerm ? 'provided' : 'projectInitial' };
      if (input.signal?.aborted) { report.missingSamples.push(`${file.file}/${sample.source.kind}/${sample.source.id}`); continue; }
      try {
        const basis = compatibilityLongTerm(snapshot, input.contributions, input.manifests, parsed.longTerm);
        const prepared = await input.restore.prepareRestore({ requestId, purpose: 'validate', source,
          context: { snapshot, target: input.target, domain: { projectId: snapshot.projectId, kind: 'sample', instance: requestId },
            expectedActiveSessionId: null, longTerm: basis.longTerm,
            preferences: normalizeLanguagePreferences(defaultPreferences(snapshot.project.languages.menuDefault, snapshot.project.languages.voiceDefault), effectivePlayerLanguages(snapshot.project.languages)), entryMappings: input.entryMappings } });
        if (input.signal?.aborted) { report.missingSamples.push(`${file.file}/${sample.source.kind}/${sample.source.id}`); continue; }
        if (prepared.ok) { sample.result = prepared.value.compatibility; sample.position = prepared.value.position;
          sample.conversions = [...basis.conversions, ...prepared.value.conversions]; sample.issues = prepared.value.issues; }
        else sample.issues = prepared.issues;
      } catch (error) { sample.issues = [issue('COMPATIBILITY_PREPARE', String(error))]; }
      finally { input.restore.disposePreparedRestore(requestId); }
      report.samples.push(sample);
    }
  }
  return report;
}
