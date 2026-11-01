import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioProduction } from './production-providers.mjs';
import { StudioCollaboration } from './collaboration-providers.mjs';
import { compileCollaborationProject } from './collaboration-compile.mjs';

vi.mock('./collaboration-compile.mjs', () => ({ compileCollaborationProject: vi.fn() }));

const ok = value => ({ ok: true, value, warnings: [] });

describe('MCP production without a renderer compilation', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['prepare', 'prepareDraft', 'planContinuation'])('prepares current exact plugin context for %s and refreshes changed inputs', async action => {
    const project = { projectId: 'Prj001' }, context = { projectId: project.projectId, sessionId: 'Ses001' };
    let current = { lock: { plugins: [{ id: 'org.example.voice', version: '0.1.0' }] }, pluginDocuments: { 'org.example.voice': { voice: 'first' } } };
    let compiled = null;
    const source = { compileInput: () => structuredClone(current), language: { currentInput: () => compiled } };
    const readSource = () => StudioProduction.prototype.scriptCompileInput.call(source, project);
    const task = { id: 'Tsk001', items: [] };
    const draft = { projectId: project.projectId, variants: { voice: { sourceVersions: [], operation: 'org.example.voice/clone', connectionId: 'Cnn001', model: 'first' } } };
    const seen = [];
    const makePlan = () => { seen.push(readSource()); return ok({ planId: 'Pln001', task }); };
    const owner = {
      project: () => project,
      taskInScope: () => true,
      itemConstraint: () => ({}),
      production: {
        current: async () => ({ service: { listTasks: () => [task] } }),
        prepareOperation: async () => makePlan(),
        call: async method => method === 'readDraft' ? ok(draft) : makePlan(),
      },
    };
    compileCollaborationProject.mockImplementation(async (actualOwner, actualProject, options) => {
      expect(actualOwner).toBe(owner); expect(actualProject).toBe(project); expect(options).toEqual({ publish: true });
      compiled = { ...structuredClone(current), pluginCommands: [{ opcode: current.pluginDocuments['org.example.voice'].voice }], pluginConditions: {} };
      return { current: true, snapshot: null, issues: [{ code: 'UNRELATED_SCRIPT_DIAGNOSTIC' }] };
    });
    const input = action === 'prepare' ? { action, operation: 'org.example.voice/clone', fields: {} }
      : action === 'prepareDraft' ? { action, draftId: 'Drf001', name: 'voice' }
      : { action, taskId: task.id, candidateId: 'Can001', mode: 'write', instruction: 'Continue' };
    await StudioCollaboration.prototype.productionCall.call(owner, input, context, () => {});
    current = { lock: { plugins: [{ id: 'org.example.voice', version: '0.1.0' }, { id: 'org.example.scene', version: '0.1.0' }] }, pluginDocuments: { 'org.example.voice': { voice: 'second' } } };
    await StudioCollaboration.prototype.productionCall.call(owner, input, context, () => {});
    expect(seen.map(input => input.pluginCommands[0].opcode)).toEqual(['first', 'second']);
    expect(seen[1].lock).toEqual(current.lock);
    expect(seen[1].pluginDocuments).toEqual(current.pluginDocuments);
    expect(compileCollaborationProject).toHaveBeenCalledTimes(2);
  });
});
