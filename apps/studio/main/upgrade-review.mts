import type { DocumentView, Issue, Lock, Target, UpgradePlan, UpgradeValidation } from '@galcraft/contracts';

type UpgradeCheck = UpgradeValidation['checks'][number];
const staticKinds = ['dsl', 'template', 'plugin', 'resource'] as const;
const checkKinds = [...staticKinds, 'save', 'playtest'] as const;

export function upgradeImpact(
  beforeFiles: Record<string, string>, afterFiles: Record<string, string>,
  beforePlugins: Lock['plugins'], afterPlugins: Lock['plugins'],
  documents: readonly Pick<DocumentView, 'documentId' | 'files'>[], representativeSaves: string[],
): Pick<UpgradePlan, 'changes' | 'dependencyChanges'> {
  const changes = [...new Set([...Object.keys(beforeFiles), ...Object.keys(afterFiles)])]
    .filter(file => beforeFiles[file] !== afterFiles[file])
    .map(file => ({ file, description: beforeFiles[file] === undefined ? 'added' : afterFiles[file] === undefined ? 'removed' : 'modified', converted: true }));
  const dependencyChanges = [...new Set([...beforePlugins, ...afterPlugins].map(plugin => plugin.id))]
    .flatMap<UpgradePlan['dependencyChanges'][number]>(pluginId => {
      const from = beforePlugins.find(plugin => plugin.id === pluginId)?.version ?? null;
      const to = afterPlugins.find(plugin => plugin.id === pluginId)?.version ?? null;
      if (from === to) return [];
      const affected = documents.filter(document => Object.keys(document.files).some(path => path.startsWith(`plugins/${pluginId}/`)))
        .map(document => ({ kind: 'document' as const, id: document.documentId }));
      return [{ pluginId, from, to, affected, savedData: representativeSaves,
        dependencies: afterPlugins.filter(plugin => plugin.id === pluginId), conversions: [], issues: [] }];
    });
  return { changes, dependencyChanges };
}

export function staticUpgradeChecks(target: Target, snapshotAvailable: boolean,
  compilerIssues: Issue[], dependencyIssues: Issue[], structuralIssues: Issue[]): UpgradeCheck[] {
  const isTemplateIssue = (issue: Issue) => /TEMPLATE|STYLE|UI_ASSET/.test(issue.code);
  const issuesByKind = {
    dsl: compilerIssues,
    template: [...dependencyIssues, ...structuralIssues].filter(isTemplateIssue),
    plugin: dependencyIssues.filter(issue => !isTemplateIssue(issue)),
    resource: structuralIssues.filter(issue => !isTemplateIssue(issue)),
  };
  return staticKinds.map(kind => ({ kind, target,
    result: issuesByKind[kind].some(issue => issue.severity === 'error') || (kind === 'dsl' && !snapshotAvailable) ? 'fail' : 'pass',
    issues: issuesByKind[kind],
  }));
}

export function isUpgradeValidationComplete(validation: UpgradeValidation | null, targets: readonly Target[]): boolean {
  return !!validation && targets.every(target => checkKinds.every(kind =>
    validation.checks.some(check => check.target === target && check.kind === kind && check.result === 'pass')));
}
