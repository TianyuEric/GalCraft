import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Id } from '@galcraft/contracts';
import { FixtureAsset, FixtureCharacters, FixtureIds, FixtureProject, FixtureScenes, fixtureId } from '@galcraft/contracts/fixtures';
import type { AuthoringSource, StudioLocale } from '../controller.js';
import { CharacterDirectory } from './CharacterDirectory.js';
import { CharacterManager, type CharacterGuiDraft } from './CharacterManager.js';
import { neutralCharacter, newCharacterName } from './model.js';
import { Button, Modal } from '../../components/controls.js';
import '../shell.css';

const initial = (many = false): AuthoringSource => ({ projectDocumentId: FixtureIds.projectA, projectRevision: 1, projectSavedRevision: 1, projectDirty: false, project: FixtureProject,
  characters: (many ? Array.from({length:80},(_,index)=>({...structuredClone(FixtureCharacters[0]!),id:fixtureId(0xc00+index),name:`角色 ${String(index+1).padStart(2,'0')}`})) : FixtureCharacters).map((character, index) => ({ ...structuredClone(character), narrativeRole: index === 2 ? 'viewpoint' : index === 1 ? 'supporting' : 'character' })),
  scenes: FixtureScenes.map((scene, index) => ({ sceneId: scene.id, documentId: index ? FixtureIds.bookshopDocument : FixtureIds.streetDocument, chapterId: scene.chapterId, name: scene.name,
    revision: 1, savedRevision: 1, dirty: false, text: index ? '' : `end {endingId:"spring-whale"} @${FixtureIds.statements[0]};` })) });
function Characters({ locale = 'zh-CN', theme = 'light', embedded = false, figures = false, many = false, formal = false }: { locale?: StudioLocale; theme?: 'light' | 'dark'; embedded?: boolean; figures?: boolean; many?: boolean; formal?: boolean }) {
  const [preview,setPreview]=useState<string|null>(null);
  const [explorer,setExplorer]=useState<HTMLDivElement|null>(null);
  const [fixture] = useState(() => {
    const source = initial(many), first = source.characters[0]!;
    const assets = ['neutral','smile','serious','surprised','shy','sad'].map((expression,index) => ({ ...structuredClone(FixtureAsset), id:fixtureId(0xb20 + index), name:`chatgpt-${expression}.png`, characterId:first.id }));
    if (figures) first.groups = [{id:fixtureId(0xb30),name:'春日常服 · 站立',assetIds:assets.map(asset=>asset.id)}];
    if (formal && figures) {
      const image = assets[0]!;
      first.differences = [{ id: 'DiffAA', name: '春日常服 · 平静', figure: { assetId: image.id, variantId: image.activeVariantId }, avatar: { kind: 'crop', crop: { x: .25, y: 0, width: .5, height: .35 } } }];
      first.initialDifferenceId = 'DiffAA';
    }
    return { source, assets };
  });
  const [opened, setOpened] = useState(true), source = useRef(fixture.source), undo = useRef<AuthoringSource[]>([]), redo = useRef<AuthoringSource[]>([]);
  const assets = useRef(fixture.assets);
  const [selectedId, setSelectedId] = useState<Id>(source.current.characters[0]!.id), [search, setSearch] = useState('');
  const forms = useRef(new Map<Id, CharacterGuiDraft>());
  const [, setRevision] = useState(0);
  const resources = useRef({resolveRuntime:async(id:string)=>({ok:true as const,value:{leaseId:id,uri:`/practice/figures/${assets.current.find(asset=>asset.id===id)!.name}`,mime:'image/png',bytes:1},warnings:[]}),releaseRuntime:async()=>({ok:true as const,value:undefined,warnings:[]})});
  const receipt = () => { if (formal) setRevision(revision => revision + 1); return { ok: true as const, value: structuredClone(source.current), warnings: [] }; };
  return <div data-theme={theme}><div className="authoring-shell" style={{ display: embedded?'grid':'block', gridTemplateColumns:'240px minmax(0,1fr)', gap:12, padding: 30 }}><div id="studio-portals" lang={locale} data-theme={theme} />
    {formal ? <CharacterDirectory characters={source.current.characters} locale={locale} selectedId={selectedId} search={search} onSearchChange={setSearch} onOpen={id => { setSelectedId(id); setOpened(true); }} onCreate={async () => {
      const characters = source.current.characters, character = neutralCharacter(fixtureId(0xd00 + characters.length), newCharacterName(characters, locale), source.current.project);
      source.current.characters = [...characters, character]; setSearch(''); setSelectedId(character.id); setOpened(true);
    }} /> : <>{embedded&&<div className="gc-wb-explorer" ref={setExplorer} style={{width:240,gridColumn:1,gridRow:'1 / 4'}}/>}<Button onClick={() => setOpened(true)}>角色与路线</Button></>}
    {opened && <CharacterManager key={formal ? selectedId : 'manager'} objectId={formal ? selectedId : undefined} guiDraft={formal ? forms.current.get(selectedId) : undefined} onGuiDraftChange={formal ? draft => { forms.current.set(selectedId, draft); } : undefined}
      embedded={embedded} explorerContainer={explorer??undefined} source={source.current} locale={locale} close={() => setOpened(false)}
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
export const CharacterObject: Story = { args: { embedded: true, formal: true, figures: true } };
