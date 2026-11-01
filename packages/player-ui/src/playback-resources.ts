import type { Id, PlayerHost, Snapshot } from '@galcraft/contracts';

/** Read a small authored prefix, without evaluating conditions or advancing the session. */
export function upcomingPlaybackAssets(snapshot: Snapshot, statementId: Id, voiceLocale: string,
  includeCurrent = false, dialogueLimit = 3, voiceEnabled = true): Id[] {
  let scene = snapshot.scenes.find(item => item.instructions.some(instruction => instruction.statementId === statementId));
  if (!scene) return [];
  let index = scene.instructions.findIndex(item => item.statementId === statementId) + (includeCurrent ? 0 : 1);
  const assets = new Set<Id>(); let dialogues = 0;
  const add = (id: unknown) => { if (typeof id === 'string' && snapshot.assets.some(asset => asset.assetId === id &&
    ['image', 'audio', 'video'].includes(asset.kind))) assets.add(id); };
  for (let visited = 0; visited < 32 && assets.size < 12; visited++) {
    const instruction = scene.instructions[index++]; if (!instruction || instruction.condition) break;
    const args = instruction.args as Record<string, unknown>;
    if (['choose', 'getUserInput', 'if', 'call', 'return', 'end'].includes(instruction.opcode)) break;
    add(args.assetId);
    if (instruction.opcode === 'characterDifference') {
      const character = snapshot.characters.find(item => item.id === args.characterId);
      const difference = character?.differences?.find(item => item.id === args.differenceId);
      add(difference?.figure.assetId); if (difference?.avatar?.kind === 'image') add(difference.avatar.assetId);
    }
    if (instruction.opcode === 'say') {
      const voices = args.voiceByLocale as Record<string, unknown> | undefined;
      if (voiceEnabled) add([voices?.[voiceLocale], voices?.[snapshot.project.languages.voiceDefault], args.voice]
        .find(value => typeof value === 'string' && value));
      add(args.avatar);
      if (++dialogues >= dialogueLimit) break;
    }
    if (instruction.opcode === 'video') break;
    if (instruction.opcode === 'jump') {
      const target = args.target as { sceneId?: Id; labelId?: Id | null } | undefined;
      const next = snapshot.scenes.find(item => item.scene.id === target?.sceneId);
      if (!next) break;
      scene = next;
      index = target?.labelId ? scene.instructions.findIndex(item => item.statementId === scene!.labels[target.labelId!]) : 0;
      if (index < 0) break;
    }
  }
  return [...assets].slice(0, 12);
}

/** Keep only the nearest idle clip plus active playback, within a bounded byte budget. */
export function createVideoBufferLoader(resources: PlayerHost['resources'], maximumBytes = 64 * 1024 * 1024) {
  type Entry = { promise: Promise<string>; controller: AbortController; uri: string | null; mime: string; bytes: number; leases: number };
  const entries = new Map<string, Entry>(); let disposed = false;
  const remove = (key: string, entry: Entry) => {
    entries.delete(key); entry.controller.abort(); if (entry.uri) URL.revokeObjectURL(entry.uri);
  };
  const trim = () => {
    const idle = [...entries].filter(([, entry]) => !entry.leases);
    let bytes = [...entries.values()].reduce((total, entry) => total + entry.bytes, 0);
    while (idle.length > 1 || bytes > maximumBytes) {
      const oldest = idle.shift(); if (!oldest) break;
      bytes -= oldest[1].bytes; remove(...oldest);
    }
  };
  const entryFor = (assetId: Id, variantId: Id, pin: boolean) => {
    if (disposed) throw new Error('Player media loader is disposed');
    const key = JSON.stringify([assetId, variantId]); let entry = entries.get(key);
    if (entry) { entries.delete(key); entries.set(key, entry); if (pin) entry.leases++; return { key, entry }; }
    entry = { promise: null as unknown as Promise<string>, controller: new AbortController(), uri: null, mime: 'video/mp4', bytes: 0, leases: pin ? 1 : 0 };
    const current = entry;
    entries.set(key, current);
    current.promise = (async () => {
      const resolved = await resources.resolve(assetId, variantId);
      if (!resolved.ok) throw new Error(resolved.error.message);
      try {
        const response = await fetch(resolved.value.uri, { signal: current.controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (disposed || entries.get(key) !== current) throw new Error('Player video preparation ended');
        current.bytes = blob.size; current.mime = blob.type || resolved.value.mime;
        current.uri = URL.createObjectURL(blob); trim();
        return current.uri;
      } finally { resolved.value.release(); }
    })().catch(error => { if (entries.get(key) === current) remove(key, current); throw error; });
    return { key, entry: current };
  };
  return {
    maximumBytes,
    ready: (assetId: Id, variantId: Id) => !!entries.get(JSON.stringify([assetId, variantId]))?.uri,
    warm: async (assetId: Id, variantId: Id) => { await entryFor(assetId, variantId, false).entry.promise; },
    load: async (assetId: Id, variantId: Id) => {
      const { entry } = entryFor(assetId, variantId, true);
      try {
        const uri = await entry.promise; let released = false;
        return { uri, mime: entry.mime, bytes: entry.bytes, rangeSupported: true,
          release: () => { if (released) return; released = true; entry.leases--; trim(); } };
      } catch (error) { entry.leases--; throw error; }
    },
    clear: () => { disposed = true; for (const [key, entry] of entries) remove(key, entry); },
  };
}
