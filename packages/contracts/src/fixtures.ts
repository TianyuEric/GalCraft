import type {
  Asset, Character, ConnectionConfig, Domain, FlowEntryRecord, Lock, Project, RuntimeState,
  RuntimeTemplate, SaveRecord, Scene, Snapshot, Variable, Instruction, CompiledScene,
} from './index.js';
import { DefaultTimeoutSecByPurpose, OfficialPageKeys } from './index.js';

export function fixtureId(suffix: number): string {
  return suffix.toString(36).padStart(6, '0');
}

export const FixtureIds = {
  projectA: fixtureId(1), projectB: fixtureId(2), chapter: fixtureId(0x100),
  street: fixtureId(0x101), bookshop: fixtureId(0x102),
  an: fixtureId(0x201), protagonist: fixtureId(0x202), friend: fixtureId(0x203),
  background: fixtureId(0x301), variant: fixtureId(0x302),
  templateDocument: fixtureId(0x401),
  streetDocument: fixtureId(0x402), bookshopDocument: fixtureId(0x403),
  relation: fixtureId(0x501),
  choice: fixtureId(0x502), streetLabelStatement: fixtureId(0x503), streetLabel: fixtureId(0x504),
  chooseStreet: fixtureId(0x505), chooseBookshop: fixtureId(0x506),
  snapshot: fixtureId(0x601), session: fixtureId(0x602), request: fixtureId(0x603),
  save: fixtureId(0x604), flowNode: fixtureId(0x605),
  connection: fixtureId(0x701),
  statements: Array.from({ length: 8 }, (_, index) => fixtureId(0x801 + index)),
  voices: Array.from({ length: 8 }, (_, index) => fixtureId(0x901 + index)),
} as const;

export const FixtureLock: Lock = {
  engine: { kind: 'engine', id: 'galcraft', version: '0.1.0', targets: ['web', 'windows'], required: true },
  plugins: [{ kind: 'plugin', id: 'org.galcraft.affection', version: '0.1.0', targets: ['web', 'windows'], required: true }],
  template: { kind: 'template', id: 'org.galcraft.standard', version: '0.1.0', targets: ['web', 'windows'], required: true },
  selectedProviders: {},
};

export const FixtureProject: Project = {
  projectId: FixtureIds.projectA, name: '春日来信', description: '共同契约固定样例',
  releaseVersion: '0.1.0', engineVersion: '0.1.0',
  canvas: { width: 1920, height: 1080, stageColor: '#000000' },
  entry: { sceneId: FixtureIds.street, labelId: null },
  chapters: [{ id: FixtureIds.chapter, name: '第一章', sceneIds: [FixtureIds.street, FixtureIds.bookshop] }],
  display: { icon: null, splash: null, titleBackground: null, titleMusic: null, titleVideo: null },
  languages: { menus: ['zh-CN', 'en', 'ja'], menuDefault: 'zh-CN', textDefault: 'zh-CN', voiceDefault: 'zh-CN', voices: ['zh-CN', 'en', 'ja'] },
  dynamicAssets: [],
  player: { autosave: true, emergencyKey: 'F8' },
  platform: { steamAppId: null }, createdAt: '2026-09-23T00:00:00Z',
};

export const FixtureScenes: Scene[] = [
  { id: FixtureIds.street, name: '街角', chapterId: FixtureIds.chapter, parameters: [], locals: [], returns: 'void', script: 'script.gal' },
  { id: FixtureIds.bookshop, name: '书店', chapterId: FixtureIds.chapter, parameters: [], locals: [], returns: 'void', script: 'script.gal' },
];
export const FixtureVariables: Variable[] = [
  { id: FixtureIds.relation, name: '好感度', type: 'number', scope: 'progress', initial: 0 },
];
export const FixtureEffects = {
  x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1, blur: 0, brightness: 1,
  contrast: 1, saturation: 1, gamma: 1, rgb: [255, 255, 255],
  bloom: { intensity: 0, brightness: 1, blur: 0, threshold: 0 },
  bevel: { opacity: 0, thickness: 0, rotationDeg: 0, softness: 0, rgb: [255, 255, 255] },
  filters: { oldFilm: false, dot: false, reflection: false, glitch: false, rgbSplit: false, godray: false },
  blend: 'normal', z: 0,
} as const;
export const FixtureCharacters: Character[] = [
  { id: FixtureIds.an, name: '杏', narrativeRole: 'character', description: '', avatar: null,
    appearance: { referenceAssets: [], notes: '' }, groups: [], defaultEffects: { ...FixtureEffects, rgb: [255, 255, 255], bevel: { ...FixtureEffects.bevel, rgb: [255, 255, 255] } },
    voicePresets: {}, defaultVoicing: 'required' },
  { id: FixtureIds.friend, name: '友人', narrativeRole: 'supporting', description: '', avatar: null,
    appearance: { referenceAssets: [], notes: '' }, groups: [], defaultEffects: { ...FixtureEffects, rgb: [255, 255, 255], bevel: { ...FixtureEffects.bevel, rgb: [255, 255, 255] } },
    voicePresets: {}, defaultVoicing: 'required' },
  { id: FixtureIds.protagonist, name: '我', narrativeRole: 'viewpoint', description: '', avatar: null,
    appearance: { referenceAssets: [], notes: '' }, groups: [], defaultEffects: { ...FixtureEffects, rgb: [255, 255, 255], bevel: { ...FixtureEffects.bevel, rgb: [255, 255, 255] } },
    voicePresets: {}, defaultVoicing: 'intentionalSilent' },
];
export const FixtureAsset: Asset = {
  id: FixtureIds.background, revision: 1, name: '街角背景', kind: 'image', folder: [], tags: [], locales: [],
  characterId: null, sceneIds: [FixtureIds.street], groupId: null,
  originalVariantId: FixtureIds.variant, activeVariantId: FixtureIds.variant,
  variants: [{
    id: FixtureIds.variant, parentId: null, role: 'original',
    files: [{ path: 'background.png', bytes: 1, mime: 'image/png', role: 'primary' }], entry: 'background.png',
    metadata: { width: 1920, height: 1080 }, canvas: null, processing: null,
    targets: { web: 'unverified', windows: 'unverified' }, groupCapabilities: null,
  }],
  sourceName: 'background.png', source: { kind: 'import', description: '契约样例', usage: 'localReview' },
  createdAt: '2026-09-23T00:00:00Z', modifiedAt: '2026-09-23T00:00:00Z',
};
export const FixtureVoiceAssets: Asset[] = FixtureIds.voices.flatMap((assetId, index) => index === 2 ? [] : [{
  id: assetId, revision: 1, name: `语音 ${index + 1}`, kind: 'audio' as const,
  folder: [], tags: [], locales: ['zh-CN'], characterId: null,
  sceneIds: [index < 4 ? FixtureIds.street : FixtureIds.bookshop], groupId: null,
  originalVariantId: fixtureId(0xd01 + index), activeVariantId: fixtureId(0xd01 + index),
  variants: [{
    id: fixtureId(0xd01 + index), parentId: null, role: 'original' as const,
    files: [{ path: `voice-${index + 1}.wav`, bytes: 1, mime: 'audio/wav', role: 'primary' }],
    entry: `voice-${index + 1}.wav`, metadata: { durationSec: 1, sampleRate: 48000, channels: 1 },
    canvas: null, processing: null, targets: { web: 'unverified' as const, windows: 'unverified' as const },
    groupCapabilities: null,
  }],
  sourceName: `voice-${index + 1}.wav`, source: { kind: 'import' as const, description: '契约样例', usage: 'localReview' as const },
  createdAt: '2026-09-23T00:00:00Z', modifiedAt: '2026-09-23T00:00:00Z',
}]);

const insets = { top: 0, right: 0, bottom: 0, left: 0 };
const layout = {
  mode: 'absolute', anchorX: 0.5, anchorY: 0.5,
  x: { unit: 'px', value: 0 }, y: { unit: 'px', value: 0 },
  width: { unit: 'px', value: 1920 }, height: { unit: 'px', value: 1080 },
  minWidth: 0, minHeight: 0, maxWidth: null, maxHeight: null,
  margin: insets, padding: insets, gap: 0, align: 'start', justify: 'start', columns: 1,
  z: 0, overflow: 'clip', safeArea: true,
} as const;
const background = { fit: 'cover', positionX: 0.5, positionY: 0.5, imageId: null, imageOpacity: 1, color: '#000000', colorOpacity: 1 } as const;
export const FixtureTemplate: RuntimeTemplate = {
  id: 'org.galcraft.standard', version: '0.1.0', instanceId: FixtureIds.templateDocument,
  features: [],
  defaultVisual: {
    background, images: {}, fontId: null, fontSize: 32, color: '#ffffff', lineHeight: 1.5,
    textAlign: 'start', wrap: true, borderColor: '#ffffff', borderWidth: 0, radius: 0, opacity: 1, shadow: null,
  },
  pages: OfficialPageKeys.map((key, index) => ({
    id: fixtureId(0xa01 + index), key, titleKey: `page.${key}`,
    layout, background,
    root: { id: fixtureId(0xb01 + index), part: `${key}.root`, layout, visible: true, locked: false,
      content: {}, normal: {}, states: {}, children: [], animations: {} },
    portalRootId: fixtureId(0xc01 + index), toolbar: null,
  })),
  styles: [], animations: [], locales: { 'zh-CN': {}, en: {}, ja: {} }, menuDefault: 'zh-CN',
  dependencies: [FixtureLock.template],
};

const texts = ['杏，明天见。', '雨停了。', '去街角看看。', '街角的灯亮了。', '书店还开着。', '翻开第一页。', '友人走了进来。', '明天再见。'];
const speakers: ({ kind: 'character'; id: string } | { kind: 'narrator' })[] = [
  { kind: 'character', id: FixtureIds.an }, { kind: 'narrator' },
  { kind: 'character', id: FixtureIds.protagonist }, { kind: 'character', id: FixtureIds.an },
  { kind: 'character', id: FixtureIds.friend }, { kind: 'narrator' },
  { kind: 'character', id: FixtureIds.friend }, { kind: 'character', id: FixtureIds.an },
];
const voiceAt = (index: number) => index === 2 ? null : FixtureIds.voices[index]!;
export const FixtureDsl = {
  street: [
    ...texts.slice(0, 2).map((text, index) =>
    `say { speaker:${JSON.stringify(speakers[index])}, text:"${text}", voice:${JSON.stringify(voiceAt(index))} } @${FixtureIds.statements[index]};`,
    ),
    `choose { options:[{id:"${FixtureIds.chooseStreet}",text:"留在街角",target:{sceneId:"${FixtureIds.street}",labelId:"${FixtureIds.streetLabel}"},lockedReason:""},{id:"${FixtureIds.chooseBookshop}",text:"去书店",target:{sceneId:"${FixtureIds.bookshop}",labelId:null},lockedReason:""}], previewDefault:null } @${FixtureIds.choice};`,
    `label { labelId:"${FixtureIds.streetLabel}", name:"街角后续" } @${FixtureIds.streetLabelStatement};`,
    ...texts.slice(2, 4).map((text, index) =>
      `say { speaker:${JSON.stringify(speakers[index + 2])}, text:"${text}", voice:${JSON.stringify(voiceAt(index + 2))} } @${FixtureIds.statements[index + 2]};`,
    ),
  ].join('\n'),
  bookshop: texts.slice(4).map((text, index) =>
    `say { speaker:${JSON.stringify(speakers[index + 4])}, text:"${text}", voice:${JSON.stringify(voiceAt(index + 4))} } @${FixtureIds.statements[index + 4]};`,
  ).join('\n'),
};
const compiledSay = (index: number, documentId: string): Instruction => ({
  statementId: FixtureIds.statements[index]!, opcode: 'say', specVersion: '0.1.0',
  condition: null, continuation: 'wait', skippable: true,
  args: { speaker: speakers[index]!, text: texts[index]!, voice: voiceAt(index) },
  source: { documentId, statementId: FixtureIds.statements[index]!, revision: 1 },
});
const choiceInstruction: Instruction = {
  statementId: FixtureIds.choice, opcode: 'choose', specVersion: '0.1.0', condition: null,
  continuation: 'wait', skippable: false,
  args: { options: [
    { id: FixtureIds.chooseStreet, text: '留在街角', target: { sceneId: FixtureIds.street, labelId: FixtureIds.streetLabel }, lockedReason: '' },
    { id: FixtureIds.chooseBookshop, text: '去书店', target: { sceneId: FixtureIds.bookshop, labelId: null }, lockedReason: '' },
  ], previewDefault: null },
  source: { documentId: FixtureIds.streetDocument, statementId: FixtureIds.choice, revision: 1 },
};
const labelInstruction: Instruction = {
  statementId: FixtureIds.streetLabelStatement, opcode: 'label', specVersion: '0.1.0',
  condition: null, continuation: 'continue', skippable: false,
  args: { labelId: FixtureIds.streetLabel, name: '街角后续' },
  source: { documentId: FixtureIds.streetDocument, statementId: FixtureIds.streetLabelStatement, revision: 1 },
};
export const FixtureCompiledScenes: CompiledScene[] = [
  { scene: FixtureScenes[0]!, labels: { [FixtureIds.streetLabel]: FixtureIds.streetLabelStatement },
    instructions: [compiledSay(0, FixtureIds.streetDocument), compiledSay(1, FixtureIds.streetDocument),
      choiceInstruction, labelInstruction, compiledSay(2, FixtureIds.streetDocument), compiledSay(3, FixtureIds.streetDocument)] },
  { scene: FixtureScenes[1]!, labels: {},
    instructions: [4, 5, 6, 7].map(index => compiledSay(index, FixtureIds.bookshopDocument)) },
];
export const FixtureSnapshot: Snapshot = {
  schemaVersion: 1, snapshotId: FixtureIds.snapshot, projectId: FixtureIds.projectA,
  releaseVersion: '0.1.0', engineVersion: '0.1.0', lock: FixtureLock,
  documents: [{ documentId: FixtureIds.streetDocument, revision: 1 }, { documentId: FixtureIds.bookshopDocument, revision: 1 }],
  project: FixtureProject,
  scenes: FixtureCompiledScenes,
  characters: FixtureCharacters, variables: FixtureVariables,
  assets: [{ assetId: FixtureIds.background, variantId: FixtureIds.variant, kind: 'image', entry: 'background.png',
    files: [{ path: 'background.png', bytes: 1, mime: 'image/png' }], metadata: { width: 1920, height: 1080 }, canvas: null, provider: null },
    ...FixtureVoiceAssets.map(asset => ({ assetId: asset.id, variantId: asset.activeVariantId, kind: 'audio' as const,
      entry: asset.variants[0]!.entry,
      files: asset.variants[0]!.files.map(file => ({ path: file.path, bytes: file.bytes, mime: file.mime })),
      metadata: asset.variants[0]!.metadata, canvas: null, provider: null })),
  ],
  gallery: [], flows: [], template: FixtureTemplate, pluginDocuments: {}, sourceMap: [],
};

const silentAudio = { assetId: null, variantId: null, stopped: true, volume: 1, startSec: 0,
  loop: false, loopStartSec: 0, loopEndSec: null, fadeInMs: 0, fadeOutMs: 0 } as const;
export const FixtureRuntimeState: RuntimeState = {
  position: { sceneId: FixtureIds.street, statementId: FixtureIds.statements[0]! }, phase: 'waiting', occurrence: 1,
  frames: [], progress: { [FixtureIds.relation]: 0 }, route: [],
  presentation: {
    objects: [], nextEntranceOrder: 0, transitions: [], effects: [], bgm: silentAudio, ambience: {},
    voice: null, currentSfx: [],
    text: { speakerId: FixtureIds.an, speakerName: '杏',
      parts: [{ statementId: FixtureIds.statements[0]!, speakerKind: 'character', characterId: FixtureIds.an, body: texts[0]!, locale: 'zh-CN' }],
      text: `「${texts[0]}」`, append: false, avatarId: null, fontSize: null, textboxVisible: true },
    film: { enabled: false, top: 0, bottom: 0 }, intro: null, styles: {}, backgroundVideo: null,
  },
  wait: { kind: 'say', textShown: 0, textComplete: false, textAnchor: 0 }, plugins: {}, playTimeMs: 0,
};
export const FixtureSaveRecord: SaveRecord = {
  schemaVersion: 1, recordId: FixtureIds.save, projectId: FixtureIds.projectA,
  releaseVersion: '0.1.0', engineVersion: '0.1.0',
  dependencyVersions: [FixtureLock.engine, ...FixtureLock.plugins, FixtureLock.template],
  createdAt: '2026-09-23T00:00:00Z', kind: 'manual',
  summary: { sceneName: '街角', speaker: '杏', text: `「${texts[0]}」`, playTimeMs: 0 },
  thumbnail: null, state: FixtureRuntimeState, history: [],
};
export const FixtureFlowEntry: FlowEntryRecord = {
  schemaVersion: 1, projectId: FixtureIds.projectA, nodeId: FixtureIds.flowNode,
  releaseVersion: '0.1.0', engineVersion: '0.1.0',
  dependencyVersions: [FixtureLock.engine, ...FixtureLock.plugins, FixtureLock.template],
  unlockedAt: '2026-09-23T00:00:00Z', state: FixtureRuntimeState,
};
export const FixtureDomains: Domain[] = [FixtureIds.projectA, FixtureIds.projectB].flatMap(projectId => [
  { projectId, kind: 'player', instance: 'default' },
  { projectId, kind: 'playtest', instance: 'studio-1' },
  { projectId, kind: 'candidate', instance: 'task-1' },
  { projectId, kind: 'sample', instance: 'preview-1' },
]);
export const FixtureConnection: ConnectionConfig = {
  id: FixtureIds.connection, revision: 1, name: '本地样例', protocol: 'comfyUI', baseUrl: 'http://127.0.0.1:8188',
  credentialId: null, auth: 'none', apiKeyHeader: null, model: 'fixture-model',
  purposes: ['image', 'difference', 'speech', 'music'], timeoutSecByPurpose: DefaultTimeoutSecByPurpose,
  concurrency: 1, parameters: {}, workflowBindingId: null, serverFileRoot: null,
};
