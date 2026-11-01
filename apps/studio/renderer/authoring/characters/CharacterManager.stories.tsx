import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FixtureAsset, FixtureCharacters, FixtureIds, FixtureProject, FixtureScenes, fixtureId } from '@galcraft/contracts/fixtures';
import type { AuthoringSource, StudioLocale } from '../controller.js';
import { CharacterManager } from './CharacterManager.js';
import { neutralCharacter } from './model.js';
import { Button, Modal } from '../../components/controls.js';
import '../shell.css';

const initial = (many = false): AuthoringSource => ({ projectDocumentId: FixtureIds.projectA, projectRevision: 1, projectSavedRevision: 1, projectDirty: false, project: FixtureProject,
  characters: (many ? Array.from({length:80},(_,index)=>({...structuredClone(FixtureCharacters[0]!),id:fixtureId(0xc00+index),name:`角色 ${String(index+1).padStart(2,'0')}`})) : FixtureCharacters).map((character, index) => ({ ...structuredClone(character), narrativeRole: index === 2 ? 'viewpoint' : index === 1 ? 'supporting' : 'character' })),
  scenes: FixtureScenes.map((scene, index) => ({ sceneId: scene.id, documentId: index ? FixtureIds.bookshopDocument : FixtureIds.streetDocument, chapterId: scene.chapterId, name: scene.name,
    revision: 1, savedRevision: 1, dirty: false, text: index ? '' : `end {endingId:"spring-whale"} @${FixtureIds.statements[0]};` })) });
function Characters({ locale = 'zh-CN', theme = 'light', embedded = false, figures = false, many = false }: { locale?: StudioLocale; theme?: 'light' | 'dark'; embedded?: boolean; figures?: boolean; many?: boolean }) {
  const [preview,setPreview]=useState<string|null>(null);
  const [explorer,setExplorer]=useState<HTMLDivElement|null>(null);
  const [opened, setOpened] = useState(true), source = useRef(initial(many)), undo = useRef<AuthoringSource[]>([]), redo = useRef<AuthoringSource[]>([]);
  const assets = useRef(['neutral','smile','serious','surprised','shy','sad'].map((expression,index) => ({ ...structuredClone(FixtureAsset), id:fixtureId(0xb20 + index), name:`chatgpt-${expression}.png`, characterId:source.current.characters[0]!.id })));
  if (figures) source.current.characters[0]!.groups = [{id:fixtureId(0xb30),name:'春日常服 · 站立',assetIds:assets.current.map(asset=>asset.id)}];
  const resources = useRef({resolveRuntime:async(id:string)=>({ok:true as const,value:{leaseId:id,uri:`/practice/figures/${assets.current.find(asset=>asset.id===id)!.name}`,mime:'image/png',bytes:1},warnings:[]}),releaseRuntime:async()=>({ok:true as const,value:undefined,warnings:[]})});
  const receipt = () => ({ ok: true as const, value: structuredClone(source.current), warnings: [] });
  return <div data-theme={theme}><div className="authoring-shell" style={{ display: embedded?'grid':'block', gridTemplateColumns:'240px minmax(0,1fr)', gap:12, padding: 30 }}><div id="studio-portals" lang={locale} data-theme={theme} />
    {embedded&&<div className="gc-wb-explorer" ref={setExplorer} style={{width:240,gridColumn:1,gridRow:'1 / 4'}}/>}<Button onClick={() => setOpened(true)}>角色与路线</Button>{opened && <CharacterManager embedded={embedded} explorerContainer={explorer??undefined} source={source.current} locale={locale} close={() => setOpened(false)}
      assets={figures?assets.current:[]} runtimeAssets={resources.current} previewAsset={setPreview}
      apply={async drafts => { undo.current.push(structuredClone(source.current)); redo.current = [];
        for (const draft of drafts) { const original = source.current.characters.find(character => character.id === draft.id), next = { ...(original ?? neutralCharacter(draft.id, draft.name, source.current.project)), ...draft };
          if (next.narrativeRole !== 'main') delete next.personalRoute;
          source.current.characters = [...source.current.characters.filter(character => character.id !== draft.id), next]; }
        return receipt(); }}
      remove={async id => { undo.current.push(structuredClone(source.current)); redo.current = []; source.current.characters = source.current.characters.filter(character => character.id !== id); return receipt(); }}
      history={async action => { const from = action === 'undo' ? undo : redo, to = action === 'undo' ? redo : undo; const previous = from.current.pop(); if (previous) { to.current.push(structuredClone(source.current)); source.current = previous; } return receipt(); }} />}
    {preview&&<Modal title={assets.current.find(asset=>asset.id===preview)!.name} close={()=>setPreview(null)}><img alt="Figure preview" src={`/practice/figures/${assets.current.find(asset=>asset.id===preview)!.name}`} style={{maxWidth:'100%',maxHeight:'70vh',objectFit:'contain'}}/></Modal>}
  </div></div>;
}
const meta = { title: 'Product/Studio/Authoring/Characters', component: Characters, args: { locale: 'zh-CN', theme: 'light' },
  argTypes: { locale: { control: 'select', options: ['zh-CN', 'en', 'ja'] }, theme: { control: 'select', options: ['light', 'dark'] } }, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof Characters>;
export default meta;
type Story = StoryObj<typeof meta>;
export const GlobalRoles: Story = {};
export const JapaneseDark: Story = { args: { locale: 'ja', theme: 'dark' } };

export const Round2Workbench: Story = { args: { embedded: true } };
export const SixFigures: Story = { args: { embedded: true, figures:true } };

export const LongCharacterList: Story = { args: { embedded:true, many:true } };
