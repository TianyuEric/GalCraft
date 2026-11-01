import { afterEach, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { GenerationConnections } from './connections.js';
import { HttpGenerationAdapter } from '@galcraft/generation-services';
import type { WorkflowBinding } from './types.js';
let root: string;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });
const workflow: WorkflowBinding = { id: 'FlowCF', revision: 3, name: 'Personal speech', purpose: 'speech', imageUsages: null, graphVersion: '1', editorWorkflowPath: null,
  apiGraph: { '1': { class_type: 'SaveAudio', inputs: {} } }, inputs: [], uploads: [], outputs: [{ nodeId: '1', key: 'custom_audio', kind: 'audio', decoder: 'comfyFileList', group: 'main', role: 'primary', background: 'unknown' }], requiredNodes: [], modelNotes: [] };
const open = () => new GenerationConnections(root, new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }) }));
it('persists personal configuration drafts across project sessions while retaining the available version', async () => {
  const parent = resolve(import.meta.dirname, '../../../tmp/testing/user-data'); await mkdir(parent, { recursive: true }); root = await mkdtemp(join(parent, 'workflow-configuration-'));
  const first = open(); expect(await first.saveWorkflow(workflow, null)).toMatchObject({ ok: true, value: { revision: 1 } });
  const draft = { schemaVersion: 1 as const, id: workflow.id, revision: 0, name: 'Unfinished edit', workflow: { ...workflow, purpose: null, outputs: [] }, paste: '{ unfinished source', availableRevision: 1, updatedAt: new Date().toISOString() };
  expect(await first.saveWorkflowDraft(draft, null)).toMatchObject({ ok: true, value: { revision: 1 } });
  const second = open(), drafts = await second.listWorkflowDrafts(); expect(drafts).toMatchObject({ ok: true, value: [{ paste: draft.paste, availableRevision: 1, workflow: { purpose: null } }] });
  const availablePath = join(root, 'connections/workflows', `${workflow.id}.json`);
  expect(JSON.parse(await readFile(availablePath, 'utf8'))).toMatchObject({ revision: 1, outputs: [{ key: 'custom_audio' }] });
  expect(await second.saveWorkflow({ ...workflow, outputs: [] }, 1)).toMatchObject({ ok: false });
  expect(await second.saveWorkflow(workflow, 3)).toMatchObject({ ok: false, error: { code: 'WORKFLOW_CONFLICT' } });
  expect(await second.saveWorkflow({ ...workflow, name: 'Reviewed local update' }, 1)).toMatchObject({ ok: true, value: { revision: 2 } });
  expect(await first.saveWorkflow(workflow, 1)).toMatchObject({ ok: false, error: { code: 'WORKFLOW_CONFLICT' } });
  expect(await second.saveWorkflowDraft(draft, null)).toMatchObject({ ok: false, error: { code: 'WORKFLOW_DRAFT_CONFLICT' } });
});
