import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Issue, Result, UpgradePlan } from '@galcraft/contracts';
import { FixtureProject } from '@galcraft/contracts/fixtures';
import { ProjectMaintenance } from './ProjectMaintenance.js';
import type { DesktopBridge } from '../../../desktop-bridge.js';
import '../../authoring/shell.css';

const ok = <T,>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
function MaintenanceExample({ theme = 'light', blocked = false, missingEngine = false }: { theme?: 'light' | 'dark'; blocked?: boolean; missingEngine?: boolean }) {
  const [version, setVersion] = useState('0.1.0');
  const engineRepair = useMemo(() => {
    if (!missingEngine) return undefined;
    const issue: Issue = { code: 'ENGINE_MISSING', message: 'Engine galcraft@0.1.0 is missing', severity: 'error', owner: 'M11', related: [], actions: ['supplyDependency'] };
    let available = false;
    const health = () => ok({ version: '0.1.0', issues: available ? [] : [issue] });
    return { health: async () => health(), repair: async () => { available = true; return health(); } };
  }, [missingEngine]);
  const upgrades = useMemo<DesktopBridge['upgrades']>(() => {
    let state: 'prepared' | 'committed' | 'restored' | null = null;
    const path = 'D:/GalCraft/upgrades/春日来信/original';
    const id = 'plan01';
    return {
      list: async () => ok([{ version: '0.1.1', targets: ['windows'], conversions: [{ from: '0.1.0', to: '0.1.1', entry: 'upgrade.mjs' }] }]),
      history: async () => ok(state ? [{ id, from: '0.1.0', to: '0.1.1', originalCopy: path, state }] : []),
      plan: async input => {
        state = 'prepared';
        const plan: UpgradePlan = {
          id, from: '0.1.0', to: input.toVersion, base: input.expected, originalCopy: path, workingCopy: 'D:/GalCraft/upgrades/春日来信/working',
          changes: [{ file: 'project.json', description: 'modified', converted: true }, { file: 'dependencies.lock.json', description: 'modified', converted: true }],
          dependencyChanges: [], validation: { validatedAt: '2026-11-10T07:30:00Z', sourceVersions: input.expected,
            checks: (['dsl', 'template', 'plugin', 'resource', 'save', 'playtest'] as const).map(kind => ({ kind, target: 'windows', result: blocked && kind === 'save' ? 'fail' : 'pass', issues: [] })) },
        };
        return ok(plan);
      },
      commit: async () => { state = 'committed'; setVersion('0.1.1'); return ok(undefined); },
      restore: async () => { state = 'restored'; setVersion('0.1.0'); return ok(undefined); },
      cancel: async () => ok({ local: 'stopped', remote: 'notApplicable' }),
    };
  }, [blocked]);
  const project = { ...FixtureProject, engineVersion: version };
  return <div id="app" className="authoring-shell" data-theme={theme} style={{ display: 'block', height: '100vh', overflow: 'auto', background: 'var(--background)', color: 'var(--foreground)' }}>
    <div id="studio-portals" data-theme={theme} lang="zh-CN"/>
    <ProjectMaintenance locale="zh-CN" source={{ project, projectDocumentId: project.projectId, projectRevision: 3, projectSavedRevision: 3, projectDirty: false, scenes: [], characters: [] }}
      upgrades={upgrades} readDocuments={async () => ok([{ documentId: project.projectId, revision: 3, savedRevision: 3, dirty: false, format: 'json', files: {}, savedFiles: {} }])}
      chooseOldSaves={async () => ok(['D:/GalCraft/saves/station-save.json'])} engineRepair={engineRepair} onProjectChanged={() => {}}/>
  </div>;
}

const meta = { title: 'Product/Studio/Projects/Project maintenance', component: MaintenanceExample, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof MaintenanceExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Migration: Story = {};
export const FailedValidation: Story = { args: { theme: 'dark', blocked: true } };
export const ExactEngineRepair: Story = { args: { theme: 'dark', missingEngine: true } };
