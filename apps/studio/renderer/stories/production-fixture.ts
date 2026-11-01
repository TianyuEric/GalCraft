import type { Candidate, ProductionFormDraft, Task, Target } from '@galcraft/authoring/production';
import { fixtureId } from '@galcraft/contracts/fixtures';
import type { Snapshot } from '@galcraft/contracts';

export function productionRecords(snapshot: Snapshot) {
  const createdAt = '2026-09-30T04:00:00.000Z';
  const target: Target = { sceneId: snapshot.project.entry.sceneId, statementId: snapshot.scenes[0]!.instructions[2]!.statementId,
    characterId: null, locale: 'zh-CN', usage: 'script', uiScope: null };
  const tasks: Task[] = ['running', 'review', 'failed'].map((state, index) => ({
    schemaVersion: 1, id: fixtureId(0xe30 + index), projectId: snapshot.projectId, revision: 1,
    name: ['雨站对白续写', '来信正文 · 待审阅', '站台描写 · 请求失败'][index]!, createdAt, updatedAt: createdAt,
    presetId: null, sourceDraftId: null, context: [], policy: 'waitForSelection', selectionRule: null,
    items: [{ id: fixtureId(0xe40 + index), purpose: 'text', target, backgroundRemoval: null, backgroundPreview: null,
      dependencies: [], input: { purpose: 'text', system: '创作雨站场景对白', messages: [{ role: 'user', text: '保留人物语气，继续写下这封信的故事。', attachments: [] }], maxOutputTokens: 512, temperature: null, seed: null },
      sourceVersions: [], configSnapshot: null, workflowSnapshot: null, recipeSnapshot: null,
      state: state === 'running' ? 'running' : state === 'review' ? 'review' : 'failed', remote: null,
      progress: { phase: state === 'running' ? '生成文本' : state === 'review' ? '等待审阅' : '连接失败', completed: state === 'running' ? 1 : null, total: state === 'running' ? 3 : null },
      attempts: [], candidateIds: state === 'review' ? [fixtureId(0xe50)] : [], selectedCandidateId: null, needsReview: state === 'review',
      issues: state === 'failed' ? [{ code: 'GENERATION_CONNECTION_FAILED', message: '连接中断，输入已保留。', severity: 'error', owner: 'M10', related: [], actions: ['retry'] }] : [] }],
  }));
  const candidate: Candidate = { schemaVersion: 1, id: fixtureId(0xe50), taskId: tasks[1]!.id, itemId: tasks[1]!.items[0]!.id,
    createdAt, artifacts: [], partial: false, backgroundPreview: null, parentCandidateIds: [], input: {},
    provenance: { connectionName: 'Storybook · 文本候选', protocol: null, model: null, workflowVersion: null, seed: null, usage: null, serviceRequestId: null },
    editedText: '雨声渐渐小了。林舟把信折好，抬头望向站台尽头。', sourceVersions: [], recipeSnapshot: null, uiCompositionId: null, checks: [], adoption: [] };
  const draft: ProductionFormDraft = { schemaVersion: 1, id: fixtureId(0xe60), projectId: snapshot.projectId, revision: 1,
    activeUse: 'script', updatedAt: createdAt, submittedTaskId: null,
    variants: { script: { target, fields: { instruction: '继续写下雨站场景' }, context: [], connectionId: null, workflowBindingId: null,
      model: null, recipe: null, promptPreparation: null, backgroundRemoval: null, backgroundPreview: null, sourceVersions: [] } } };
  return { tasks, candidates: [{ candidate, adoption: 'unadopted' as const }], drafts: [draft] };
}
