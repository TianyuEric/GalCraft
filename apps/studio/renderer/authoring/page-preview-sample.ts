import { createId } from '@galcraft/contracts';
import type { Instruction, PageKey, RuntimeTemplate, Snapshot } from '@galcraft/contracts';

const copy = {
  'zh-CN': { text: '雨停了。我们沿着安静的街道，终于找到了那封信的主人。', options: ['打开信封，读一读未说出口的话', '留在站台，等待下一班列车', '沿着街道寻找来信的人'], prompt: '你想在回信上写下什么？', input: '愿我们再次相遇', reason: '完成另一条路线后解锁' },
  en: { text: 'The rain had stopped. We walked along the quiet street and finally found the person who had written the letter.', options: ['Open the letter and read the words left unsaid', 'Stay at the platform and wait for the next train', 'Follow the street to find the person who wrote the letter'], prompt: 'What would you write in your reply?', input: 'May we meet again', reason: 'Complete another route to unlock' },
  ja: { text: '雨がやみました。静かな道を歩いて、ようやく手紙を書いた人に出会いました。', options: ['封筒を開けて、伝えられなかった言葉を読む', 'ホームに残り、次の列車を待つ', '道を歩いて、手紙を書いた人を探す'], prompt: '返事の手紙に何を書きますか？', input: 'また会えますように', reason: '別のルートを完了すると解放' },
};

/** Page samples run real instructions without depending on the author's opening route. */
export function pagePreviewSample(original: Snapshot, template: RuntimeTemplate, page: PageKey, sample: string, menuLocale?: string): Snapshot {
  const snapshot = structuredClone(original);
  snapshot.template = structuredClone(template);
  snapshot.lock.template = { ...snapshot.lock.template, id: template.id, version: template.version };
  const language = sample in copy ? sample : snapshot.project.languages.menuDefault;
  snapshot.project.languages.menuDefault = menuLocale ?? language;
  snapshot.project.languages.menus = menuLocale ? [...new Set([...original.project.languages.menus, menuLocale])] : [language];
  snapshot.project.languages.textDefault = language;
  const text = copy[language as keyof typeof copy] ?? copy['zh-CN'];
  const scene = snapshot.scenes.find(item => item.scene.id === snapshot.project.entry.sceneId) ?? snapshot.scenes[0];
  if (!scene) return snapshot;
  const instruction = (opcode: string, args: Instruction['args']): Instruction => {
    const statementId = createId();
    return { statementId, opcode, args, specVersion: '0.1.0', condition: null, continuation: 'wait', skippable: false,
      source: { documentId: scene.instructions[0]?.source.documentId ?? snapshot.documents[0]!.documentId, statementId,
        revision: scene.instructions[0]?.source.revision ?? snapshot.documents[0]!.revision } };
  };
  const say = () => instruction('say', { speaker: snapshot.characters[0] ? { kind: 'character', id: snapshot.characters[0].id } : { kind: 'narrator' }, text: sample in copy ? text.text.repeat(8) : text.text, voice: null, voiceByLocale: {} });
  const ending = instruction('say', { speaker: { kind: 'narrator' }, text: text.text, voice: null });
  const destination = createId();
  const choice = instruction('choose', { options: sample === 'empty' ? [] : text.options.map((label, index) => ({ id: createId(), text: label,
    target: { sceneId: scene.scene.id, labelId: destination }, enabled: { kind: 'literal', value: sample !== 'locked' || index !== 1 }, lockedReason: text.reason })), previewDefault: null });
  let main = page === 'choice' ? choice : say();
  if (page === 'input') {
    const variableId = createId();
    snapshot.variables.push({ id: variableId, name: 'Page preview input', type: 'string', scope: 'progress', initial: '' });
    main = instruction('getUserInput', { prompt: text.prompt, defaultText: text.input, maxLength: 32, allowEmpty: false, variableId });
  }
  // Keep the project's opening still background as a visual reference, with no media or waits.
  const background = original.scenes.flatMap(item => item.instructions).find(item => item.opcode === 'changeBg' && (item.args as Record<string, unknown>).op === 'show');
  const prefix = background ? [{ ...structuredClone(background), statementId: createId(), condition: null, continuation: 'continue' as const }] : [];
  const nvl = sample.startsWith('reading:nvl') ? [{ ...instruction('readingMode', { mode: 'nvl' }), continuation: 'continue' as const }] : [];
  scene.instructions = [...prefix, ...nvl, main, ending];
  scene.labels = { [destination]: ending.statementId };
  snapshot.project.entry = { sceneId: scene.scene.id, labelId: null };
  // A page sample starts directly at its selected state, including projects that ask for a protagonist name.
  if (snapshot.project.player.name) snapshot.project.player.name.allowCustom = false;
  return snapshot;
}
