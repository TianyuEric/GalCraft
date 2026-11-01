import { expect, it } from 'vitest';
import { DefaultTimeoutSecByPurpose, type ConnectionConfig, type GenerationInput, type WorkflowBinding } from '@galcraft/contracts';
import { HttpGenerationAdapter } from './adapter.js';
import { validateWorkflow, workflowSupportsPurpose } from './validation.js';

const workflow = (): WorkflowBinding => ({
  id: 'FlowS4', revision: 3, name: 'Character workflow', purpose: 'image', imageUsages: ['figure', 'cg'],
  graphVersion: '1', editorWorkflowPath: null, apiGraph: { '1': { class_type: 'SaveImage', inputs: {} } },
  inputs: [], uploads: [], requiredNodes: [], modelNotes: [],
  outputs: [{ nodeId: '1', key: 'images', kind: 'image', decoder: 'comfyFileList', group: 'main', role: 'primary', background: 'unknown' }],
  usageGuidance: { description: 'A full figure with a clear silhouette.', scenarios: ['Character introductions'],
    inputs: [{ port: 'positive', description: 'Appearance and pose' }], promptTips: ['Describe one character.'],
    limitations: ['Use the declared image sizes.'], examples: [{ title: 'Introduction', input: 'One character, standing', notes: 'Review the preview before adoption.' }] },
});

it('requires an explicit purpose and accepts only declared image uses for production', () => {
  const binding = workflow();
  expect(() => validateWorkflow(binding)).not.toThrow();
  expect(() => validateWorkflow({ ...binding, purpose: null } as unknown as WorkflowBinding)).toThrow('Choose a purpose');
  expect(() => validateWorkflow({ ...binding, imageUsages: [] })).toThrow('Select at least one image use');
  expect(workflowSupportsPurpose({ ...binding, imageUsages: [] }, 'image', 'figure')).toBe(false);
  expect(() => validateWorkflow({ ...binding, imageUsages: ['poster'] } as unknown as WorkflowBinding)).toThrow('Declare valid image uses');
  expect(() => validateWorkflow({ ...binding, purpose: 'speech' })).toThrow('Image uses belong to image workflows');
  expect(workflowSupportsPurpose(binding, 'image', 'figure')).toBe(true);
  expect(workflowSupportsPurpose(binding, 'image', 'cg')).toBe(true);
  expect(workflowSupportsPurpose(binding, 'image', 'background')).toBe(false);
  expect(workflowSupportsPurpose(binding, 'image')).toBe(false);
  expect(workflowSupportsPurpose(binding, 'speech')).toBe(false);
});

it('validates usage guidance without requiring legacy bindings to invent instructions', () => {
  const binding = workflow(); delete binding.usageGuidance;
  expect(() => validateWorkflow(binding)).not.toThrow();
  expect(() => validateWorkflow({ ...binding, usageGuidance: { description: 12 } } as unknown as WorkflowBinding)).toThrow();
});
it('discovers outputs without generation and treats output_node metadata as unconfirmed', async () => {
  const requests: string[] = [], binding = workflow(); binding.apiGraph['2'] = { class_type: 'CustomOutput', inputs: {} };
  const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }), fetch: async (url, init) => {
    requests.push(`${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`);
    return String(url).includes('/history/') ? Response.json({ original: { outputs: { '2': { custom_audio: [{ filename: 'voice.wav', subfolder: 'voices', type: 'output' }] } } } }) : Response.json({ CustomOutput: { output_node: true } });
  } });
  const config = { id: 'ConnS4', revision: 1, name: 'Discovery', protocol: 'comfyUI', baseUrl: 'http://local.invalid', credentialId: null, auth: 'none', apiKeyHeader: null, model: '', purposes: ['image'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose, concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null } as ConnectionConfig;
  const result = await adapter.discoverWorkflowOutputs(config, binding, 'original');
  expect(result).toMatchObject({ ok: true, value: expect.arrayContaining([{ nodeId: '2', classType: 'CustomOutput', key: null, kind: null, source: 'metadata', confirmed: false }, { nodeId: '2', classType: 'CustomOutput', key: 'custom_audio', kind: null, source: 'history', confirmed: true }]) });
  expect(requests).toEqual(['GET /object_info', 'GET /history/original']);
  expect(() => validateWorkflow({ ...binding, outputs: [{ ...binding.outputs[0]!, key: '' }] })).toThrow('file-list field');
  expect(() => validateWorkflow({ ...binding, outputs: [{ ...binding.outputs[0]!, key: 'author_custom_field' }] })).not.toThrow();
});

it('rejects an explicit incompatible binding before uploading media or sending a generation request', async () => {
  let requests = 0;
  const adapter = new HttpGenerationAdapter({ credential: async () => null, probe: async () => ({ metadata: {} }),
    fetch: async () => { requests++; throw new Error('A mismatched workflow must never contact the service'); } });
  const config: ConnectionConfig = { id: 'ConnS4', revision: 1, name: 'Comfy', protocol: 'comfyUI', baseUrl: 'http://local.invalid',
    credentialId: null, auth: 'none', apiKeyHeader: null, model: '', purposes: ['image'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose,
    concurrency: 1, parameters: {}, workflowBindingId: 'FlowS4', serverFileRoot: null };
  const input: GenerationInput = { purpose: 'image', usage: 'background', positive: 'A room', negative: '', width: 128, height: 64, count: 1, seed: 1, references: [] };
  const events = [];
  for await (const event of adapter.submit(input, { requestId: 'ReqSH4', config, workflow: workflow(), directory: '', signal: new AbortController().signal })) events.push(event);
  expect(events).toMatchObject([{ kind: 'error', remoteStatus: 'failed', issue: { code: 'WORKFLOW_PURPOSE', message: expect.stringContaining('workflow') } }]);
  expect(requests).toBe(0);
});
