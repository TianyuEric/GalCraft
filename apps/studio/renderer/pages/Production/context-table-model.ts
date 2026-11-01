import type { ContextPart } from '@galcraft/authoring/production';

/** Context blocks keep their M10 identities and payloads when the visible table is filtered. */
export function updateContextPart(parts: ContextPart[], id: string, patch: { included?: boolean; text?: string }): ContextPart[] {
  return parts.map(part => part.id === id ? { ...part, ...patch, ...(patch.text !== undefined ? { authorEdited: true } : {}) } : part);
}
