import type { DocumentView, EditInput, Json, Result } from '@galcraft/contracts';
import { FixtureIds, fixtureId } from '@galcraft/contracts/fixtures';
import { prepareAuthoringEdit } from '@galcraft/documents/authoring';
import { parse } from '@galcraft/dsl';
import { figureId, musicId } from './product-fixture.js';
import { studioFixture } from './studio-fixture.js';

export type CommandDefaultsScenario = 'visual' | 'audio';
export type ReviewedCommand = { id: string; command: string; args: Record<string, Json> };
type AuthorComparison = { id: string; command: string; matches: boolean; message: string | null };
export const reviewAnchor = FixtureIds.statements[0]!;
export const reviewExitAnchor = FixtureIds.statements[1]!;
export const reviewIllustration = fixtureId(0xfa51);
const illustrationStatement = fixtureId(0xfa52);
const existingBackground = fixtureId(0xfa53);
const existingWait = fixtureId(0xfa54);
const scriptPath = (sceneId: string) => `scenes/${sceneId}/script.gal`;

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function commands(documentId: string, revision: number, text: string): ReviewedCommand[] {
  return parse({ documentId, revision, text }).cst.flatMap(node =>
    node.valid && node.id && node.object ? [{ id: node.id, command: node.command, args: node.object.value as Record<string, Json> }] : []);
}

function normalize(command: ReviewedCommand): Record<string, Json> {
  const keys = Object.keys(command.args).sort();
  return Object.fromEntries(keys
    .filter(key => !(key === 'objectId' && (command.command === 'changeBg' || command.command === 'changeFigure' && command.args.op === 'show'))
      && !(key === 'soundId' && command.command === 'playEffect' && command.args.op === 'play'))
    .map(key => [key, command.args[key]!]));
}

function authorInput(item: ReviewedCommand): Record<string, Json> | undefined {
  switch (item.command) {
    case 'changeBg': return { assetId: FixtureIds.background };
    case 'changeFigure': return item.args.op === 'exit'
      ? { op: 'exit', objectId: item.args.objectId! } : { characterId: FixtureIds.an, assetId: figureId };
    case 'changeIllustrationDiff': return { objectId: reviewIllustration, assetId: figureId };
    case 'bgm': return item.args.volume === 0
      ? { assetId: musicId, volume: 0, loop: false } : { assetId: musicId };
    case 'playEffect': return { assetId: musicId };
    case 'wait': return item.args.durationMs === 0 ? { durationMs: 0 } : {};
    case 'comment': return { text: '' };
    default: return undefined;
  }
}

/** Real compiler and Player preview, with the existing in-memory document bridge. */
export async function commandDefaultsFixture(
  scenario: CommandDefaultsScenario, theme: 'light' | 'dark', changed: (commands: ReviewedCommand[]) => void,
) {
  const { services } = studioFixture('normal', 'zh-CN', theme);
  const bridge = services.bridge.documents;
  const initial = value(await bridge.list());
  const street = initial.find(document => document.documentId === FixtureIds.streetDocument)!;
  const bookshop = initial.find(document => document.documentId === FixtureIds.bookshopDocument)!;
  const actor = initial.find(document => document.documentId === FixtureIds.an)!;
  const actorPath = `characters/${FixtureIds.an}.json`;
  const character = JSON.parse(actor.files[actorPath]!);
  character.data.defaultEffects = { ...character.data.defaultEffects, x: -340, scaleX: .64, scaleY: .64, opacity: .86, z: 4 };
  const statement = (command: string, args: Record<string, Json>, id: string) => `${command} ${JSON.stringify(args)} @${id};`;
  const line = (id: string, text: string) => statement('say', { speaker: { kind: 'narrator' }, text }, id);
  const before = [
    ...(scenario === 'visual' ? [statement('changeIllustration', {
      op: 'show', objectId: reviewIllustration, assetId: FixtureIds.background,
      illustrationFrame: { widthRatio: .25, heightRatio: .32, fit: 'cover' }, effects: { x: 420, y: -140, opacity: .85 },
    }, illustrationStatement)] : []),
    line(reviewAnchor, scenario === 'visual' ? '她把那张褪色的照片翻了过来。' : '雨声减弱，站台的广播响了起来。'),
    line(reviewExitAnchor, '夜班列车驶过了站台。'),
  ].join('\n');
  const baseline = [
    statement('changeBg', { assetId: FixtureIds.background }, existingBackground),
    statement('wait', {}, existingWait),
    line(FixtureIds.statements[4]!, '这段旧脚本省略了背景转场和等待时长。'),
  ].join('\n');
  const setup: EditInput = {
    label: '命令初值审核夹具', origin: 'template', requiredRefs: [], preparedAssets: [],
    expected: [street, bookshop, actor].map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })),
    patches: [
      { kind: 'file', documentId: street.documentId, path: scriptPath(FixtureIds.street), before: street.files[scriptPath(FixtureIds.street)]!, after: before },
      { kind: 'file', documentId: bookshop.documentId, path: scriptPath(FixtureIds.bookshop), before: bookshop.files[scriptPath(FixtureIds.bookshop)]!, after: baseline },
      { kind: 'file', documentId: actor.documentId, path: actorPath, before: actor.files[actorPath]!, after: JSON.stringify(character) },
    ],
  };
  const plan = value(await bridge.planEdit(setup));
  value(await bridge.applyEdit(plan.planId, setup.expected));
  value(await bridge.save(value(await bridge.planSave({ kind: 'all' })).planId));
  async function compiledLegacyArgs() {
    const compiled = value(await services.compilePreview());
    const scene = compiled.snapshot?.scenes.find(scene => scene.scene.id === FixtureIds.bookshop);
    return scene?.instructions.filter(item => item.statementId === existingBackground || item.statementId === existingWait).map(item => item.args);
  }
  const legacyArgs = await compiledLegacyArgs();
  if (legacyArgs?.length !== 2) throw new Error('无法编译审核夹具的旧场景。');

  const seeded = new Set([reviewAnchor, reviewExitAnchor, illustrationStatement]);
  function readScene(documents: DocumentView[]) {
    const scene = documents.find(document => document.documentId === street.documentId)!;
    return commands(scene.documentId, scene.revision, scene.files[scriptPath(FixtureIds.street)]!);
  }
  const emit = async () => changed(readScene(value(await bridge.list())).filter(item => !seeded.has(item.id)));
  const apply = bridge.applyEdit.bind(bridge), undo = bridge.undo.bind(bridge), redo = bridge.redo.bind(bridge);
  let edits = 0;
  bridge.applyEdit = async (...args) => { const result = await apply(...args); if (result.ok) { edits++; await emit(); } return result; };
  bridge.undo = async (...args) => {
    if (!edits) return { ok: false, error: { code: 'STORY_HISTORY_START', severity: 'info', owner: 'M02', message: '已到初始场景。', actions: [], related: [] }, issues: [] };
    const result = await undo(...args);
    if (result.ok) { edits--; await emit(); }
    return result;
  };
  bridge.redo = async (...args) => { const result = await redo(...args); if (result.ok) { edits++; await emit(); } return result; };
  await emit();

  return {
    services,
    async compare() {
      const documents = value(await bridge.list());
      const scene = readScene(documents);
      const results = scene.flatMap<AuthorComparison>((item, index) => {
        if (seeded.has(item.id)) return [];
        const args = authorInput(item);
        if (!args) return [];
        const planned = prepareAuthoringEdit(documents, {
          op: 'commands.insert', sceneId: FixtureIds.street, beforeId: scene[index + 1]?.id ?? null, commands: [{ command: item.command, args }],
        });
        if (!planned.ok) return [{ id: item.id, command: item.command, matches: false, message: planned.error.message }];
        const text = planned.value.patches.flatMap(patch => patch.kind === 'text' ? patch.edits.map(edit => edit.after) : []).join('');
        const inserted = commands(street.documentId, street.revision, text)[0];
        return [{ id: item.id, command: item.command, matches: !!inserted && JSON.stringify(normalize(item)) === JSON.stringify(normalize(inserted)), message: null }];
      });
      const missing = prepareAuthoringEdit(documents, {
        op: 'commands.insert', sceneId: FixtureIds.street, beforeId: reviewAnchor, commands: [{ command: scenario === 'visual' ? 'changeBg' : 'bgm', args: {} }],
      });
      const oldSource = documents.find(document => document.documentId === bookshop.documentId)?.files[scriptPath(FixtureIds.bookshop)];
      const legacyKept = oldSource === baseline && JSON.stringify(await compiledLegacyArgs()) === JSON.stringify(legacyArgs);
      return { results, missingRejected: !missing.ok, legacyKept };
    },
  };
}
