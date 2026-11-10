import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FixtureCharacters, FixtureProject, fixtureId } from '@galcraft/contracts/fixtures';
import { CharacterDirectory } from './CharacterDirectory.js';
import { neutralCharacter, newCharacterName } from './model.js';
import '../shell.css';

function Directory({ empty = false, dark = false }: { empty?: boolean; dark?: boolean }) {
  const [characters, setCharacters] = useState(() => empty ? [] : [...FixtureCharacters, neutralCharacter('CharAA', '林舟与潮间信使剧团的长名称角色', FixtureProject, 'main')]);
  const [selectedId, setSelectedId] = useState(characters[0]?.id);
  const [search, setSearch] = useState('');
  return <div data-theme={dark ? 'dark' : 'light'} className="authoring-shell" style={{ display: 'block', minHeight: 320, width: 240 }}>
    <CharacterDirectory characters={characters} locale="zh-CN" selectedId={selectedId} pendingIds={new Set(characters[1] ? [characters[1].id] : [])}
      search={search} onSearchChange={setSearch} onOpen={setSelectedId} onCreate={async () => {
        const next = neutralCharacter(fixtureId(0xa90 + characters.length), newCharacterName(characters, 'zh-CN'), FixtureProject);
        setCharacters([...characters, next]); setSelectedId(next.id); setSearch('');
      }} />
  </div>;
}

const meta = { title: 'Components/Authoring/Character Directory', component: Directory } satisfies Meta<typeof Directory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DirectorySelection: Story = {};
export const DarkLongName: Story = { args: { dark: true } };
export const Empty: Story = { args: { empty: true } };
