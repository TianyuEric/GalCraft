import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FixtureProject } from '@galcraft/contracts/fixtures';
import { Projects, type ProjectDraft } from './Projects.js';
import { projectLibraryFixture } from './project-library-fixture.js';
import type { StudioLocale } from '../../authoring/controller.js';
import '../../authoring/shell.css';
import { WorkbenchShell } from '../../components/workbench/WorkbenchShell.js';

function ProjectCenter({ locale = 'zh-CN', theme = 'light', empty = false, workbench = false, delayMs = 0, creationFailure = false, createDelayMs = 0, createError = false }: { locale?: StudioLocale; theme?: 'light' | 'dark'; empty?: boolean; workbench?: boolean; delayMs?: number; creationFailure?: boolean; createDelayMs?: number; createError?: boolean }) {
  const library = useMemo(() => projectLibraryFixture(empty), [empty]);
  const [draft, setDraft] = useState<ProjectDraft>({ name: '', template: 'standard', width: 1920, height: 1080, engineVersion: '0.1.0' });
  const [notice, setNotice] = useState('');
  const [explorer, setExplorer] = useState<HTMLDivElement | null>(null), [inspector, setInspector] = useState<HTMLDivElement | null>(null);
  const page = <Projects explorerContainer={workbench ? explorer ?? undefined : undefined} inspectorContainer={workbench ? inspector ?? undefined : undefined} locale={locale} source={empty ? null : { projectDocumentId: FixtureProject.projectId, projectRevision: 1, projectSavedRevision: 1, projectDirty: false,
      project: FixtureProject, scenes: [], characters: [] }} library={library} draft={draft} updateDraft={setDraft}
      open={async () => setNotice('Storybook：选择本地目录需要桌面宿主。')} openRecent={async directory => setNotice(directory)}
      copy={async () => setNotice('Storybook：复制作品需要桌面宿主。')} backup={async () => setNotice('Storybook：备份需要桌面宿主。')}
      reveal={async () => setNotice('D:\\GalCraft\\春日来信')} navigate={page => setNotice(page)}
      create={async () => {await new Promise(resolve=>setTimeout(resolve,createDelayMs));if(createError)throw Error('创建失败：无法写入所选目录。请更换目录后重试。');return false;}} listCreationVersions={async () => { await new Promise(resolve => setTimeout(resolve, delayMs)); return creationFailure ? {ok:false,error:{code:'ENGINE_UNAVAILABLE',severity:'error',owner:'M11',message:'Engine catalog unavailable',related:[],actions:['retry']},issues:[]} : { ok: true, value: ['0.1.0'], warnings: [] }; }} />;
  return <div data-theme={theme}><div className="authoring-shell" data-locale={locale} style={{ display: 'block', height: '100vh', overflow: 'auto', background: 'var(--background)' }}>
    <div id="studio-portals" lang={locale} data-theme={theme} />
    {workbench ? <WorkbenchShell title="作品库" activity={null} documents={null} toolbar={null} explorerTitle="作品库" explorer={<div ref={setExplorer}/>} inspector={<div ref={setInspector}/>} panels={[]} status={notice} layout={{left:240,right:320,bottom:160,diagnosticsVisible:false}}>{page}</WorkbenchShell> : <>{notice && <p role="status">{notice}</p>}{page}</>}
  </div></div>;
}
const meta = { title: 'Product/Studio/Projects/Project center', component: ProjectCenter, args: { locale: 'zh-CN', theme: 'light', empty: false },
  argTypes: { locale: { control: 'select', options: ['zh-CN', 'en', 'ja'] }, theme: { control: 'select', options: ['light', 'dark'] } }, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof ProjectCenter>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Library: Story = {};
export const Empty: Story = { args: { empty: true } };
export const DarkJapanese: Story = { args: { locale: 'ja', theme: 'dark' } };
export const Workbench: Story = { args: { workbench: true } };
export const WorkbenchDark: Story = { args: { workbench: true, theme: 'dark' } };
export const WorkbenchEmpty: Story = { args: { workbench: true, empty: true } };

export const DelayedCreation: Story = { args: { delayMs: 2000 } };
export const CreationFailure: Story = { args: { creationFailure: true } };

export const CreationImmediate: Story = { args: { delayMs:0 } };
export const Creation300ms: Story = { args: { delayMs:300 } };
export const PendingCreate: Story = { args:{createDelayMs:4000} };
export const FailedCreate: Story = { args:{createDelayMs:400,createError:true} };
