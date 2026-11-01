import { countNameCharacters, type CurrentMainStory, type PlayerName, type RuntimeState } from '@galcraft/contracts';

export function matchingMainStory(name: PlayerName | null | undefined, current: CurrentMainStory | null): CurrentMainStory | null {
  return name && current?.characterId === name.characterId && current.variableId === name.variableId &&
    !!current.effectiveName.trim() && countNameCharacters(current.effectiveName) <= name.maxLength ? current : null;
}

export function shouldConfirmPlayerName(name: PlayerName | null | undefined, current: CurrentMainStory | null): boolean {
  const matching = matchingMainStory(name, current);
  return !!name?.allowCustom && (name.promptPolicy === 'always' || !matching || matching.completed);
}

export function mainStoryName(name: PlayerName | null | undefined, current: CurrentMainStory | null): string | null {
  return name ? matchingMainStory(name, current)?.effectiveName ?? name.defaultName : null;
}

export function currentMainStory(name: PlayerName | null | undefined, state: RuntimeState): CurrentMainStory | null {
  if (!name) return null;
  const value = name.allowCustom && name.variableId ? state.progress[name.variableId] : null;
  return { characterId: name.characterId, variableId: name.variableId,
    effectiveName: typeof value === 'string' && value.trim() ? value.trim() : name.defaultName, completed: state.phase === 'completed' };
}

export function initialNameProgress(name: PlayerName | null | undefined, current: CurrentMainStory | null): Record<string, string> {
  return name?.allowCustom && name.variableId ? { [name.variableId]: mainStoryName(name, current)! } : {};
}
