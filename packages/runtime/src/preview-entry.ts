import type { DebugScenario, Position, RuntimeState, Snapshot } from '@galcraft/contracts';
export type PreviewEntry = { key: string; title: string; entry: Position; initialProgress: DebugScenario['initialProgress']; story: RuntimeState['story'] };
export function previewEntries(snapshot: Snapshot): PreviewEntry[] {
  const position = (entry: Snapshot['project']['entry']): Position => {
    const scene = snapshot.scenes.find(item => item.scene.id === entry.sceneId);
    return { sceneId: entry.sceneId, statementId: entry.labelId ? scene?.labels[entry.labelId] ?? null : scene?.instructions[0]?.statementId ?? null };
  };
  return [{ key: 'main', title: snapshot.project.name, entry: position(snapshot.project.entry), initialProgress: {}, story: { kind: 'main' } },
    ...snapshot.characters.flatMap(character => character.afterstory ? [{ key: character.afterstory.id, title: character.afterstory.title,
      entry: position(character.afterstory.entry), initialProgress: structuredClone(character.afterstory.initialProgress),
      story: { kind: 'afterstory' as const, entryId: character.afterstory.id, characterId: character.id, title: character.afterstory.title } }] : [])];
}
export function resolvePreviewEntry(snapshot: Snapshot, target: Position | null, preferred?: string, explicit = false): PreviewEntry {
  const entries = previewEntries(snapshot), direct = entries.filter(item => item.key !== 'main' && item.entry.sceneId === target?.sceneId);
  if (explicit && entries.some(item => item.key === preferred)) return entries.find(item => item.key === preferred)!;
  if (!target) return entries.find(item => item.key === preferred) ?? entries[0]!;
  // Authored edges suggest an entry; the runtime still proves the actual route and conditions.
  const reaches = (entry: PreviewEntry) => {
    const pending = [entry.entry.sceneId], visited = new Set<string>();
    while (pending.length) {
      const id = pending.pop()!; if (id === target.sceneId) return true; if (visited.has(id)) continue; visited.add(id);
      for (const instruction of snapshot.scenes.find(item => item.scene.id === id)?.instructions ?? []) {
        const args = instruction.args as Record<string, unknown>;
        if (['changeScene', 'callScene'].includes(instruction.opcode) && typeof args.sceneId === 'string') pending.push(args.sceneId);
        if (instruction.opcode === 'choose') for (const option of (args.options ?? []) as { target?: { sceneId?: string } }[]) if (option.target?.sceneId) pending.push(option.target.sceneId);
        if (instruction.opcode === 'end' && (args.target as { kind?: string })?.kind === 'scene') pending.push((args.target as { sceneId: string }).sceneId);
      }
    }
    return false;
  };
  const candidates = entries.filter(reaches);
  return candidates.find(item => item.key === preferred) ?? (direct.length === 1 ? direct[0]! : candidates[0]) ?? entries.find(item => item.key === preferred) ?? entries[0]!;
}
