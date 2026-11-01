import { BasicComponentKinds } from '@galcraft/contracts';
import type { BasicComponentKind, PageKey, Target } from '@galcraft/contracts';

export type ComponentKind = 'container' | 'text' | 'button' | 'tab' | 'input' | 'slider' | 'toggle' | 'select' | 'list' | 'image' | 'decoration';
export type ImageSlot = 'icon' | 'frame' | 'decoration';
export type CatalogEntry = {
  part: string;
  page: PageKey;
  kind: ComponentKind;
  contentKeys: readonly string[];
  imageSlots: readonly ImageSlot[];
  states: readonly ('hover' | 'pressed' | 'focus' | 'disabled' | 'selected' | 'locked' | 'empty')[];
  action: string | null;
  targets: readonly Target[];
};

const pages: Record<string, string> = {
  title: 'background logo workTitle description menu menu.start menu.continue menu.load menu.settings menu.cg menu.music menu.flow menu.characters menu.exit',
  story: 'stageFrame readingPanel nameBox nameText textBox bodyText avatar advanceIndicator chapterNotice entryTitle bgmNotice statusIcons toolbar toolbar.trigger toolbar.progress toolbar.tools toolbar.pace toolbar.more toolbar.save toolbar.load toolbar.quickSave toolbar.quickLoad toolbar.history toolbar.flow toolbar.settings toolbar.auto toolbar.skip toolbar.hideUI toolbar.replayVoice toolbar.title toolbar.lock',
  choice: 'background list list.item list.item.text list.item.lockReason list.item.focusMark',
  input: 'background prompt field counter validation confirm cancel',
  save: 'background header title categoryTabs categoryTabs.manual categoryTabs.quick categoryTabs.auto detail detail.thumbnail detail.scene detail.text detail.time detail.playTime detail.version grid grid.slot grid.slot.thumbnail grid.slot.number grid.slot.summary grid.slot.time grid.slot.empty pagination pagination.previous pagination.next pagination.add footer primary back',
  load: 'background header title categoryTabs categoryTabs.manual categoryTabs.quick categoryTabs.auto detail detail.thumbnail detail.scene detail.text detail.time detail.playTime detail.version grid grid.slot grid.slot.thumbnail grid.slot.number grid.slot.summary grid.slot.time grid.slot.empty pagination pagination.previous pagination.next pagination.add footer primary back',
  history: 'background header title list list.row list.row.speaker list.row.text list.row.voice list.row.jump list.row.location scrollbar back',
  settings: 'background header title categories categories.item content field groupHeading fieldLabel fieldHelp slider slider.track slider.thumb slider.value toggle toggle.track toggle.thumb select select.trigger select.list select.item preview footer reset dataExport dataImport dataClear back titleAction exit',
  cg: 'types types.cg types.video music music.list music.list.item music.list.item.cover music.list.item.title music.list.item.locked music.player music.player.play music.player.stop music.player.progress music.player.time music.player.volume music.player.pause video.grid video.grid.item video.grid.item.cover video.grid.item.title video.grid.item.locked video.grid.item.empty video.viewer video.viewer.back video.viewer.play video.viewer.stop video.viewer.progress video.viewer.volume video.viewer.time video.viewer.fullscreen grid.item.empty viewer.header viewer.title viewer.auxiliary viewer.entries viewer.content viewer.footer viewer.differences viewer.entry viewer.entry.cover viewer.entry.title viewer.difference viewer.difference.cover viewer.difference.title viewer.image.content empty footer background header seriesTabs grid grid.item grid.item.cover grid.item.title grid.item.locked viewer viewer.image viewer.previous viewer.next viewer.counter viewer.back back',
  music: 'background header seriesTabs list list.item list.item.cover list.item.title list.item.locked player player.play player.pause player.stop player.progress player.time player.volume back',
  flow: 'background header mapSelect viewport nodes node node.title node.lock node.current edges edge edge.label zoomIn zoomOut fit minimap entryDescription enter back',
  characters: 'background header list card card.portrait card.name card.description card.relationship details afterstory afterstory.cover afterstory.title afterstory.lock afterstory.start afterstory.continue afterstory.replay back',
  confirm: 'scrim panel title message scopeList remember confirm cancel',
  error: 'scrim panel title message location details retry load titleAction cancel',
  dataImport: 'scrim panel workInfo versionInfo records records.record records.record.source records.record.local records.record.action longTerm preferences apply cancel',
  dataClear: 'scrim panel scope scope.saves scope.longTerm scope.preferences impact confirm cancel',
  emergency: 'background image restore',
  videoError: 'background message retry titleAction',
};

const actions: Record<string, string> = {
  'title.menu.start': 'start', 'title.menu.continue': 'continue', 'title.menu.load': 'open:load',
  'title.menu.settings': 'open:settings', 'title.menu.cg': 'open:cg', 'title.menu.music': 'open:music',
  'title.menu.flow': 'open:flow', 'title.menu.characters': 'open:characters', 'title.menu.exit': 'exit',
  'story.toolbar.trigger': 'toolbarReveal', 'story.toolbar.save': 'open:save', 'story.toolbar.load': 'open:load',
  'story.toolbar.quickSave': 'quickSave', 'story.toolbar.quickLoad': 'quickLoad',
  'story.toolbar.history': 'open:history', 'story.toolbar.flow': 'open:flow', 'story.toolbar.settings': 'open:settings',
  'story.toolbar.auto': 'toggleAuto', 'story.toolbar.skip': 'toggleSkip', 'story.toolbar.hideUI': 'toggleUI',
  'story.toolbar.replayVoice': 'replayVoice', 'story.toolbar.title': 'returnTitle',
  'story.toolbar.lock': 'toolbarLock', 'choice.list.item': 'selectOption',
  'input.confirm': 'submitInput', 'input.cancel': 'cancelInput',
  'save.primary': 'saveSlot', 'load.primary': 'loadSlot',
  'history.list.row.voice': 'playHistoryVoice', 'history.list.row.jump': 'jumpHistory',
  'cg.grid.item': 'openCg', 'cg.viewer.previous': 'nextDifference:-1', 'cg.viewer.next': 'nextDifference:1',
  'music.player.play': 'music:play', 'music.player.pause': 'music:pause', 'music.player.stop': 'music:stop',
  'music.player.progress': 'music:seek', 'flow.enter': 'enterFlow',
  'settings.reset': 'resetPreferences', 'settings.dataExport': 'exportData',
  'settings.titleAction': 'returnTitle', 'characters.card': 'startAfterstory', 'cg.viewer.auxiliary': 'toggleAuxiliary',
  'settings.select.trigger': 'selectOpen',
  'settings.dataImport': 'open:dataImport', 'settings.dataClear': 'open:dataClear', 'settings.exit': 'exit',
  'confirm.confirm': 'confirm:accept', 'confirm.cancel': 'confirm:reject',
  'dataImport.apply': 'importData', 'dataClear.confirm': 'clearData',
  'emergency.restore': 'emergency:false', 'videoError.retry': 'videoRetry',
  'error.retry': 'retry', 'error.load': 'open:load', 'error.titleAction': 'returnTitle',
};
for (const page of ['save', 'load', 'history', 'settings', 'cg', 'music', 'flow', 'characters', 'error', 'dataImport', 'dataClear']) {
  actions[`${page}.back`] = 'back';
  actions[`${page}.cancel`] = 'back';
}
actions['cg.viewer.back'] = 'closeViewer';
actions['videoError.titleAction'] = 'returnTitle';
for (const page of ['save', 'load']) for (const category of ['manual', 'quick', 'auto']) {
  actions[`${page}.categoryTabs.${category}`] = `selectCategory:${category}`;
}

const textNames = /(?:^|\.)(?:title|workTitle|description|text|bodyText|nameText|prompt|counter|validation|message|summary|time|number|empty|scene|playTime|version|speaker|location|fieldLabel|fieldHelp|groupHeading|entryDescription|impact|details|name|relationship|locked|lockReason)$/;
const listNames = /(?:^|\.)(?:menu|list|grid|categories|categoryTabs|seriesTabs|records|scopeList)$/;
const imageNames = /(?:^|\.)(?:logo|avatar|thumbnail|cover|portrait|image)$/;
const containerNames = /(?:^|\.)(?:background|stageFrame|nameBox|textBox|toolbar|header|footer|detail|pagination|viewer|player|panel|scrim|content|viewport|card|node|edge|scope|longTerm|preferences)$/;
const decorationNames = /(?:^|\.)(?:advanceIndicator|focusMark|statusIcons|scrollbar|minimap)$/;
const controls = ['slider', 'toggle', 'select', 'field'];

function kindOf(part: string): ComponentKind {
  if(part==='characters.card')return 'container';
  if(/^(cg\.)?music\.player\.(play|pause|stop)$/.test(part)||/^video\.viewer\.(back|play|stop|fullscreen)$/.test(part)||/^cg\.viewer\.(entry|difference)$/.test(part))return 'button';
  if(/^(cg\.)?music\.player\.(progress|volume)$/.test(part)||/^video\.viewer\.(progress|volume)$/.test(part))return 'slider';
  if (part === 'settings.field') return 'container';
  if (part === 'settings.categories.item') return 'button';
  if(part==='confirm.remember'||/^dataClear\.scope\.(saves|longTerm|preferences)$/.test(part))return 'toggle';
  const last = part.split('.').at(-1)!;
  if (/^(save|load)\.categoryTabs\.(manual|quick|auto)$/.test(part)) return 'tab';
  if (/^cg\.types\.(cg|video)$/.test(part)) return 'tab';
  if (part === 'settings.select.trigger') return 'select';
  if (part === 'music.player.progress') return 'slider';
  if (controls.includes(last)) return last === 'field' ? 'input' : last as ComponentKind;
  if (last === 'track' || last === 'thumb') return 'decoration';
  if (last === 'item' || last === 'row' || last === 'slot' || listNames.test(part)) return 'list';
  if (actions[part] || /(?:^|\.)(?:back|confirm|cancel|primary|reset|apply|add|next|previous|fit|zoomIn|zoomOut|restore)$/.test(part)) return 'button';
  if (imageNames.test(part)) return 'image';
  if (decorationNames.test(part)) return 'decoration';
  if (containerNames.test(part)) return 'container';
  if (textNames.test(part)) return 'text';
  return 'container';
}

function imageSlots(part: string, kind: ComponentKind): readonly ImageSlot[] {
  if (part.endsWith('.background') || part.endsWith('.scrim')) return [];
  if (part === 'story.stageFrame' || part === 'story.avatar' || part === 'cg.viewer.image' || part === 'emergency.image') return [];
  if (part === 'title.logo' || part === 'story.advanceIndicator' || part === 'choice.list.item.focusMark') return ['decoration'];
  if (kind === 'button' || kind === 'tab' || part === 'settings.select.trigger') return ['icon', 'frame'];
  if (kind === 'container' || kind === 'list') return ['frame', 'decoration'];
  return [];
}

function makeCatalog(): CatalogEntry[] {
  return Object.entries(pages).flatMap(([page, names]) => names.split(' ').map(name => {
    const part = page==='cg'&&/^video\./.test(name)?name:`${page}.${name}`;
    const kind = kindOf(part);
    return {
      part, page, kind,
      contentKeys: kind === 'button' || kind === 'tab' || part === 'settings.select.trigger' ? ['labelKey'] : kind === 'text' ? ['sourceKey'] : [],
      imageSlots: imageSlots(part, kind),
      states: part==='characters.card'||kind === 'button' || kind === 'tab' || kind === 'input' || kind === 'slider' || kind === 'toggle' || kind === 'select'
        || (kind === 'list' && /\.(item|row|slot)$/.test(part))
        ? (page==='cg'||page==='music'||part==='characters.card'?['hover', 'pressed', 'focus', 'disabled', 'selected', 'locked', 'empty'] as const:/^(save|load)\.grid\.slot$/.test(part)?['hover', 'pressed', 'focus', 'disabled', 'selected'] as const:['hover', 'pressed', 'focus', 'disabled'] as const) : [],
      action: actions[part] ?? null,
      targets: part === 'title.menu.exit' || part === 'settings.exit' ? ['windows'] : ['web', 'windows'],
    };
  }));
}

export const BasicComponentCatalog: readonly (CatalogEntry & { componentKind: BasicComponentKind })[] = BasicComponentKinds.map(componentKind => ({
  componentKind, part: `basic.${componentKind}`, page: '*', kind: componentKind === 'tabs' ? 'tab' : componentKind,
  contentKeys: componentKind === 'text' ? ['text'] : componentKind === 'button' ? ['text', 'labelKey']
    : componentKind === 'input' ? ['value', 'placeholder', 'inputType', 'required', 'min', 'max', 'minLength', 'maxLength']
    : componentKind === 'slider' ? ['value', 'min', 'max', 'step'] : ['value', 'text'],
  imageSlots: componentKind === 'image' ? ['decoration'] : componentKind === 'button' ? ['icon', 'frame', 'decoration']
    : componentKind === 'container' || componentKind === 'list' ? ['frame', 'decoration'] : [],
  states: ['hover', 'pressed', 'focus', 'disabled', 'selected', 'locked', 'empty'], action: null, targets: ['web', 'windows'],
}));
export const ComponentCatalog: readonly CatalogEntry[] = [...makeCatalog(), ...BasicComponentCatalog];
const byPart = new Map(ComponentCatalog.map(entry => [entry.part, entry]));
export function componentDefinition(part: string): CatalogEntry | null { return byPart.get(part) ?? null; }
export function officialParts(page: PageKey): readonly CatalogEntry[] { return ComponentCatalog.filter(entry => entry.page === page); }
