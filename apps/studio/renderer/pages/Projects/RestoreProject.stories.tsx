import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { RestorePlanSummary, Result } from '@galcraft/contracts';
import { FixtureLock, FixtureProject, fixtureId } from '@galcraft/contracts/fixtures';
import { RestoreProject, type RestoreProjectPort } from './RestoreProject.js';
import '../../authoring/shell.css';
import './projects.css';
const ok = <T,>(value: T): Result<T> => ({ ok: true, value, warnings: [] });
function RestoreExample({ missing = false, theme = 'light', locale = 'zh-CN' }: { missing?: boolean; theme?: 'light' | 'dark'; locale?: 'zh-CN' | 'en' | 'ja' }) {
  const [notice, setNotice] = useState('');
  const bridge = useMemo<RestoreProjectPort>(() => {
    let unresolved = missing, current: RestorePlanSummary;
    const checked = () => ({ ...current, missing: unresolved ? [{ code: 'ENGINE_MISSING', message: '引擎 galcraft@0.1.0 尚未安装。请导入对应版本的引擎目录。', owner: 'M11' as const, severity: 'error' as const, related: [], actions: ['supplyDependency' as const] }] : [], readiness: unresolved ? null : { projectId: current.resultProjectId, editing: 'editable' as const, playtest: 'unchecked' as const, publish: 'unchecked' as const, generation: [{ usage: 'voice', state: 'needsConnection' as const, issues: [] }], issues: [] } });
    return { projects: { chooseBackupFile: async () => ok('D:/作品备份/春日来信.galproject'), chooseDirectory: async () => ok('D:/GalCraft'), supplyRestoreDependency: async () => { unresolved = false; return ok(checked()); } },
      documents: { prepareRestore: async options => { current = { planId: fixtureId(0xe100), packageId: fixtureId(0xe101), sourceProjectId: FixtureProject.projectId, resultProjectId: options.identity === 'copyNew' ? fixtureId(0xe102) : FixtureProject.projectId, destination: options.destination, stagingDirectory: '', operationDirectory: 'D:/GalCraft/.galcraft-restores/plan', previousDirectory: null, idMap: {}, missing: [], projectName: '春日来信', options,
        manifest: { format: 'galcraft-project', schemaVersion: 1, packageId: fixtureId(0xe101), projectId: FixtureProject.projectId, releaseVersion: '0.1.0', engineVersion: '0.1.0', createdAt: '2026-10-23T12:00:00Z', documents: [], dependencies: FixtureLock, files: [], externalDependencies: [{ dependency: FixtureLock.engine, included: false, reason: '安装精确引擎版本', sourceUrl: null, instructions: '需要 galcraft@0.1.0' }] }, readiness: null }; return ok(checked()); }, checkRestore: async () => ok(checked()), cancelRestore: async () => ok(undefined), commitRestore: async () => ok({ projectId: current.resultProjectId, directory: current.destination, identity: current.options.identity, readiness: checked().readiness! }) } };
  }, [missing]);
  return <div className="authoring-shell" data-theme={theme} style={{ display: 'block', height: '100vh', overflow: 'auto', background: 'var(--background)' }}><div id="studio-portals" lang={locale} data-theme={theme}/><main className="project-workbench"><RestoreProject locale={locale} bridge={bridge} open={async () => { setNotice('作品已打开，可继续创作。'); return true; }} close={() => setNotice('已返回作品库。')}/>{notice && <p role="status">{notice}</p>}</main></div>;
}
const meta = { title: 'Product/Studio/Projects/Restore project', component: RestoreExample, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof RestoreExample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Prepare: Story = {};
export const MissingDependency: Story = { args: { missing: true } };
export const DarkEnglish: Story = { args: { theme: 'dark', locale: 'en' } };
