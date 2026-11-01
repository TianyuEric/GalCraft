export type DialogueInterpolation = { start: number; end: number; source: string | null; closed: boolean };

/** Offsets refer to decoded dialogue text. A null source is the escaped opening \{{. */
export function dialogueInterpolations(text: string): DialogueInterpolation[] {
  const result: DialogueInterpolation[] = [];
  for (let i = 0; i < text.length;) {
    if (text.startsWith('\\{{', i)) {
      result.push({ start: i, end: i + 3, source: null, closed: true }); i += 3; continue;
    }
    if (!text.startsWith('{{', i)) { i++; continue; }
    const start = i; i += 2; const body = i; let quoted = false;
    while (i < text.length) {
      if (quoted && text[i] === '\\') { i += 2; continue; }
      if (text[i] === '"') quoted = !quoted;
      if (!quoted && text.startsWith('}}', i)) break;
      i++;
    }
    const closed = i < text.length;
    result.push({ start, end: closed ? i + 2 : text.length, source: text.slice(body, i), closed });
    i = closed ? i + 2 : text.length;
  }
  return result;
}
