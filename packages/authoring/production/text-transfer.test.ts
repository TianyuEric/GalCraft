import { expect, it } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DefaultTimeoutSecByPurpose } from '@galcraft/contracts';
import type { ConnectionConfig, GenerationAdapter, ProductionOperationSnapshot } from '@galcraft/contracts';
import type { ProjectSession } from '@galcraft/documents';
import { ProductionService } from './service.js';
import { ProductionOperationCatalog } from './operations.js';
import type { TaskItem } from './types.js';
import { requireValue } from './validation.js';

it('transfers an edited plain-text candidate and its recording into the declared next-stage draft without another request', async () => {
  const base = resolve(import.meta.dirname, '../../../tmp/testing'); await mkdir(base, { recursive: true }); const directory = await mkdtemp(join(base, 'text-transfer-'));
  const source: ProductionOperationSnapshot = { ...new ProductionOperationCatalog().resolve('discuss'), id: 'org.test.voice/transcribe', provider: { id: 'org.test.voice', version: '0.1.0' },
    definition: { ...new ProductionOperationCatalog().resolve('discuss').definition, id: 'org.test.voice/transcribe', purpose: 'org.test.voice/transcribe', providerKey: 'org.test.voice/provider',
      fields: [], inputSchema: { type: 'object', properties: {}, additionalProperties: false }, inputs: [{ key: 'referenceAudio', type: 'audio', required: true, multiple: false, mimeTypes: ['audio/wav'] }],
      outputs: [{ key: 'transcript', type: 'text', required: true, multiple: false, mimeTypes: ['text/plain'] }], textTransfer: { operation: 'org.test.voice/clone', field: 'referenceText' } } };
  const target: ProductionOperationSnapshot = { ...structuredClone(source), id: 'org.test.voice/clone', definition: { ...structuredClone(source.definition), id: 'org.test.voice/clone', purpose: 'org.test.voice/clone',
    textTransfer: undefined, fields: [{ path: 'referenceText', label: 'Reference text', type: 'string', default: '', required: false, nullable: false, description: '', unit: 'none', group: 'basic', summary: true, keywords: [] }], inputSchema: { type: 'object', properties: { referenceText: { type: 'string' } }, additionalProperties: false },
    outputs: [{ key: 'audio', type: 'audio', required: true, multiple: false, mimeTypes: ['audio/wav'] }], adoption: { kind: 'asset', assetKind: 'audio', usages: ['voice'] } } };
  delete target.definition.textTransfer;
  const config: ConnectionConfig = { id: 'Conn01', revision: 1, name: 'Explicit test provider', providerKey: 'org.test.voice/provider', protocol: 'plugin', baseUrl: '', auth: 'none', credentialId: null, apiKeyHeader: null, model: 'actual-asr', purposes: [source.id as 'org.test.voice/transcribe'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null };
  let sends = 0;
  const adapter: GenerationAdapter = { inspect: async () => { throw new Error('unused'); }, query: async () => { throw new Error('unused'); }, fetch: async () => { throw new Error('unused'); }, cancel: async () => ({ local: 'stopped', remote: 'unsupported' }),
    async *submit(_input, context) { sends++; await mkdir(context.directory, { recursive: true }); const path = join(context.directory, 'transcript.txt'); await writeFile(path, 'original transcript'); yield { kind: 'output', artifacts: [{ kind: 'text', port: 'transcript', localPath: path, bytes: 19, mime: 'text/plain', metadata: {}, groupId: context.requestId, role: 'primary', background: null }], usage: null }; } };
  const service = new ProductionService({ userData: directory, project: { projectId: 'Work01', documents: new Map(), readDocument: () => null } as unknown as ProjectSession, adapter: () => adapter, acquireAdapter: async () => ({ adapter, release() {} }),
    freezeProvider: async config => ({ providerKey: config.providerKey!, packageVersion: '0.1.0', capabilities: source.definition.capabilities, capability: { connectionId: config.id, connectionRevision: 1, checkedAt: new Date().toISOString(), serviceVersion: null, purpose: source.id as 'org.test.voice/transcribe', status: 'unverified', inputs: [{ port: 'fields', required: true, supported: true, limits: {} }, { port: 'references', required: true, supported: true, limits: {} }], output: 'text', models: null, promptFormat: null, textVision: null, remote: { query: false, cancelQueued: false, cancelRunning: 'none' }, issues: [] } }), review: async () => { throw new Error('unused'); } });
  try {
    const recording = join(directory, 'recording.wav'); await writeFile(recording, 'reference fixture');
    const reference = { assetId: 'Audio1', variantId: 'Var001', candidateId: null, artifactIndex: null, localPath: recording, mime: 'audio/wav', port: 'referenceAudio' };
    const item: TaskItem = { id: 'Item01', operation: source.id, operationSnapshot: source, purpose: source.id as 'org.test.voice/transcribe', target: { sceneId: null, statementId: null, characterId: null, locale: null, usage: 'script', uiScope: null }, backgroundRemoval: null, backgroundPreview: null, dependencies: [], input: { purpose: source.id as 'org.test.voice/transcribe', fields: {}, references: [reference] }, sourceVersions: [], configSnapshot: config, workflowSnapshot: null, recipeSnapshot: null, state: 'draft', remote: null, progress: { phase: '', completed: null, total: null }, attempts: [], candidateIds: [], selectedCandidateId: null, needsReview: false, issues: [] };
    const plan = requireValue(await service.planTask({ projectId: 'Work01', name: 'reference transcript', context: [], items: [item], policy: 'waitForSelection', selectionRule: null }));
    requireValue(await service.submit(plan.planId)); await service.drain(); const task = service.listTasks()[0]!, candidateId = task.items[0]!.candidateIds[0]!;
    const edited = requireValue(await service.editCandidate(candidateId, '作者修正的准确逐字稿。'));
    const draft = requireValue(await service.saveFormDraft({ schemaVersion: 1, id: 'Draft1', projectId: 'Work01', revision: 0, activeUse: 'voice', variants: { voice: { operation: target.id, operationSnapshot: target, target: { ...item.target, usage: 'voice' }, fields: { referenceText: '' }, context: [], connectionId: 'Conn01', model: 'omnivoice', workflowBindingId: null, recipe: null, promptPreparation: null, sourceVersions: [], backgroundRemoval: null, backgroundPreview: null } }, updatedAt: new Date().toISOString(), submittedTaskId: null }, null));
    const result = requireValue(await service.applyPromptTransfer({ candidateId: edited.id, draftId: draft.id, usage: 'voice', expectedDraftRevision: draft.revision, acceptedFields: [], omittedPorts: [] }));
    expect(result.variants.voice?.fields).toMatchObject({ referenceText: '作者修正的准确逐字稿。', references: [expect.objectContaining({ assetId: 'Audio1', variantId: 'Var001', port: 'referenceAudio' })] });
    expect(requireValue(await service.loadFormDraft(draft.id))?.variants.voice?.fields.referenceText).toBe('作者修正的准确逐字稿。'); expect(sends).toBe(1);
    expect((await service.applyPromptTransfer({ candidateId: edited.id, draftId: draft.id, usage: 'voice', expectedDraftRevision: draft.revision, acceptedFields: [], omittedPorts: [] })).ok).toBe(false);
  } finally { await service.close(); await rm(directory, { recursive: true, force: true }); }
});
