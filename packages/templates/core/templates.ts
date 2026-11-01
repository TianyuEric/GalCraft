import { createUIAnimationPreset, UIAnimationPresets } from './ui-animations.js';
import { createId } from '@galcraft/contracts';
import { RuntimeTemplateSchema } from '@galcraft/contracts';
import type { Background, ComponentConfig, Dependency, Id, Layout, PageConfig, RuntimeTemplate, Target, UIAnimation, Variable, Visual } from '@galcraft/contracts';
import { componentDefinition, officialParts } from './catalog.js';
import { officialLocaleResources, validateLocaleResources } from './locales.js';

export type OfficialTemplateKind = 'light' | 'standard' | 'rich';
export type Appearance = 'paper' | 'night';
export type RichRelation = 'plugin' | 'reading' | 'variables';
export type CoreRelationVariable = Pick<Variable, 'id' | 'name' | 'scope'>;
export type TemplateChoice = { kind: OfficialTemplateKind; appearance?: Appearance; richRelation?: RichRelation; relationVariables?: CoreRelationVariable[] };
export type TemplateSummary = { kind: OfficialTemplateKind; default: boolean; features: readonly string[]; pages: readonly string[] };

const commonPages = ['title', 'story', 'choice', 'input', 'save', 'load', 'history', 'settings',
  'confirm', 'error', 'dataImport', 'dataClear', 'emergency', 'videoError', 'characters'] as const;
const standardPages = [...commonPages, 'cg', 'music'] as const;
const richPages = [...standardPages, 'flow'] as const;
const features: Record<OfficialTemplateKind, readonly string[]> = {
  light: ['manualSaves', 'history', 'auto', 'skip', 'afterstory'],
  standard: ['manualSaves', 'history', 'auto', 'skip', 'quickSaves', 'autoSaves', 'continue', 'cg', 'music', 'afterstory'],
  rich: ['manualSaves', 'history', 'auto', 'skip', 'quickSaves', 'autoSaves', 'continue', 'cg', 'music', 'flow', 'characters', 'pluginPages', 'status', 'afterstory'],
};
const pageSets: Record<OfficialTemplateKind, readonly string[]> = { light: commonPages, standard: standardPages, rich: richPages };

export const DEFAULT_TEMPLATE: OfficialTemplateKind = 'standard';
export const OfficialTemplates: readonly TemplateSummary[] = (['light', 'standard', 'rich'] as const).map(kind =>
  ({ kind, default: kind === DEFAULT_TEMPLATE, features: features[kind], pages: pageSets[kind] }));

const inset = (value = 0) => ({ top: value, right: value, bottom: value, left: value });
const px = (value: number) => ({ unit: 'px' as const, value });
const pct = (value: number) => ({ unit: 'percent' as const, value });
const auto = { unit: 'auto' as const };

function layout(override: Partial<Layout> = {}): Layout {
  return { mode: 'column', anchorX: 0, anchorY: 0, x: px(0), y: px(0), width: pct(100), height: px(48),
    minWidth: 0, minHeight: 0, maxWidth: null, maxHeight: null, margin: inset(), padding: inset(),
    gap: 8, align: 'start', justify: 'start', columns: 1, z: 0, overflow: 'visible', safeArea: true, ...override };
}

function background(color: string): Background {
  return { fit: 'cover', positionX: 0.5, positionY: 0.5, imageId: null, imageOpacity: 1,
    color, colorOpacity: 1 };
}

function visual(appearance: Appearance): Visual {
  const night = appearance === 'night';
  return { background: background(night ? '#141B30' : '#F3F8FD'), images: {}, fontId: null, fontSize: 26,
    color: night ? '#E7E8F2' : '#29465F', lineHeight: 1.5, textAlign: 'start', wrap: true,
    borderColor: night ? '#364361' : '#D6E4F0', borderWidth: 0, radius: 8, opacity: 1, shadow: null };
}

const buttonLabels: Record<string, string> = {
  'title.menu.start': 'title.start', 'title.menu.continue': 'title.continue', 'title.menu.load': 'title.load',
  'title.menu.settings': 'title.settings', 'title.menu.cg': 'nav.cg', 'title.menu.music': 'nav.music',
  'title.menu.flow': 'nav.flow', 'title.menu.characters': 'nav.characters', 'title.menu.exit': 'nav.exit',
  'story.toolbar.save': 'nav.save', 'story.toolbar.load': 'title.load',
  'story.toolbar.quickSave': 'toolbar.quickSave', 'story.toolbar.quickLoad': 'toolbar.quickLoad',
  'story.toolbar.history': 'nav.history', 'story.toolbar.flow': 'nav.flow', 'story.toolbar.settings': 'title.settings',
  'story.toolbar.auto': 'toolbar.auto', 'story.toolbar.skip': 'toolbar.skip',
  'story.toolbar.hideUI': 'toolbar.hideUI', 'story.toolbar.replayVoice': 'toolbar.replayVoice',
  'story.toolbar.title': 'nav.title', 'story.toolbar.lock': 'toolbar.lock',
  'story.toolbar.trigger': 'toolbar.reveal',
  'input.confirm': 'action.confirm', 'input.cancel': 'action.cancel',
  'save.primary': 'nav.save', 'load.primary': 'title.load',
  'save.categoryTabs.manual': 'save.manual', 'save.categoryTabs.quick': 'save.quick', 'save.categoryTabs.auto': 'save.auto',
  'load.categoryTabs.manual': 'save.manual', 'load.categoryTabs.quick': 'save.quick', 'load.categoryTabs.auto': 'save.auto',
  'save.pagination.previous': 'action.previous', 'save.pagination.next': 'action.next',
  'save.pagination.add': 'save.addPage', 'load.pagination.previous': 'action.previous',
  'load.pagination.next': 'action.next', 'load.pagination.add': 'save.addPage',
  'save.back': 'nav.back', 'load.back': 'nav.back',
  'history.list.row.voice': 'action.play', 'history.list.row.jump': 'history.jump',
  'history.back': 'nav.back',
  'settings.reset': 'action.reset', 'settings.dataExport': 'action.export',
  'settings.dataImport': 'action.import', 'settings.dataClear': 'action.clear',
  'settings.exit': 'nav.exit', 'confirm.confirm': 'action.confirm', 'confirm.cancel': 'action.cancel',
  'settings.back': 'nav.back', 'settings.titleAction': 'nav.title', 'settings.select.trigger': 'action.select',
  'settings.categories.item': 'page.settings',
  'video.viewer.back':'nav.back','video.viewer.play':'action.play','video.viewer.stop':'action.stop','video.viewer.fullscreen':'settings.fullscreen',
  'cg.music.player.play':'action.play','cg.music.player.pause':'action.pause','cg.music.player.stop':'action.stop',
  'cg.viewer.previous': 'action.previous', 'cg.viewer.next': 'action.next',
  'cg.viewer.auxiliary': 'gallery.auxiliary',
  'music.player.play': 'action.play', 'music.player.pause': 'action.pause', 'music.player.stop': 'action.stop',
  'dataImport.apply': 'action.apply', 'dataImport.cancel': 'action.cancel',
  'dataClear.confirm': 'action.clear', 'dataClear.cancel': 'action.cancel',
  'cg.viewer.back': 'nav.back', 'cg.back': 'nav.back', 'music.back': 'nav.back',
  'flow.back': 'nav.back', 'characters.back': 'nav.back',
  'flow.zoomIn': 'flow.zoomIn', 'flow.zoomOut': 'flow.zoomOut', 'flow.fit': 'flow.fit',
  'emergency.restore': 'emergency.restore', 'videoError.retry': 'action.retry',
  'videoError.titleAction': 'nav.title', 'error.retry': 'action.retry',
  'error.load': 'title.load', 'error.cancel': 'action.cancel',
  'error.titleAction': 'nav.title', 'flow.enter': 'action.confirm',
};

function componentLayout(part: string, isButton: boolean): Layout {
  if (part.endsWith('.background') || part.endsWith('.scrim'))
    return layout({ mode: 'absolute', width: pct(100), height: pct(100), z: -1 });
  if (/^(cg|video|music)\./.test(part)) {
    if(/^(cg|music)\.back$/.test(part))return layout({position:'free',mode:'row',anchorX:1,anchorY:1,x:px(-48),y:px(-32),width:px(220),height:px(48)});
    if (/^(cg|music)\.header$/.test(part)) return layout({position:'free',mode:'row',x:px(48),y:px(48),width:pct(86),height:px(72),gap:24});
    if (/^(cg|music)\.footer$/.test(part)) return layout({position:'free',mode:'row',x:px(48),anchorY:1,y:px(-32),width:pct(92),height:px(64),gap:24,justify:'spaceBetween'});
    if (part==='cg.viewer') return layout({mode:'column',width:pct(100),height:pct(100),z:30,padding:inset(24),gap:16,overflow:'clip',align:'stretch'});
    if (part==='video.viewer') return layout({width:pct(100),height:pct(100),z:30});
    if (part==='cg.types'||part==='cg.seriesTabs') return layout({position:'free',mode:'row',x:px(48),y:px(part==='cg.types'?144:224),width:pct(62),height:px(64),gap:12,overflow:'scroll'});
    if (part==='cg.grid'||part==='video.grid') return layout({position:'free',mode:'grid',x:px(48),y:px(312),width:pct(62),height:pct(58),columns:part==='cg.grid'?4:3,gap:12,overflow:'scroll'});
    if (part==='cg.grid.item'||part==='video.grid.item') return layout({width:auto,height:auto,minHeight:126,gap:5});
    if(part==='cg.grid.item.cover'||part==='video.grid.item.cover')return layout({position:'flow',mode:'absolute',width:pct(100),height:px(112),overflow:'clip'});
    if(part==='cg.grid.item.title'||part==='video.grid.item.title')return layout({position:'flow',width:pct(100),height:auto,overflow:'clip'});
    if(part==='cg.music')return layout({position:'free',mode:'column',x:pct(68),y:px(144),width:pct(29),height:pct(76),gap:16});
    if(part==='music.list')return layout({position:'free',mode:'column',x:px(48),y:px(160),width:pct(55),height:pct(76),gap:12,overflow:'scroll'});
    if(part==='music.player')return layout({position:'free',mode:'column',x:pct(64),y:px(160),width:pct(32),height:pct(76),gap:24});
    if(part==='cg.music.list')return layout({mode:'column',width:pct(100),height:px(432),minHeight:432,gap:0,overflow:'scroll'});
    if(part==='cg.music.player')return layout({mode:'column',width:pct(100),height:auto,gap:8});
    if(/^(cg\.)?music\.list\.item$/.test(part))return layout({mode:'row',width:pct(100),height:auto,minHeight:72,gap:16,align:'center'});
    if(/^(cg\.)?music\.(player\.(progress|volume)|list\.item\.title)$/.test(part))return layout({width:pct(100),height:auto,minHeight:40});
    if(part==='cg.viewer.header')return layout({mode:'row',width:pct(100),height:px(64),gap:24,align:'center'});
    if(part==='cg.viewer.title')return layout({width:pct(64),height:auto});
    if(part==='cg.viewer.entries')return layout({mode:'row',width:pct(100),height:px(128),gap:12,overflow:'scroll'});
    if(part==='cg.viewer.content')return layout({mode:'row',width:pct(100),height:auto,gap:16,align:'stretch'});
    if(part==='cg.viewer.footer')return layout({mode:'row',width:pct(100),height:px(56),gap:24,align:'center',justify:'center'});
    if(part==='cg.viewer.differences')return layout({mode:'column',width:px(260),height:pct(100),gap:12,overflow:'scroll'});
    if(part==='cg.viewer.image')return layout({width:pct(100),height:pct(100)});
    if(part==='cg.viewer.image.content')return layout({width:pct(100),height:pct(100)});
    if(part==='cg.viewer.entry'||part==='cg.viewer.difference')return layout({mode:'column',width:px(220),height:auto,minHeight:96,gap:8,align:'stretch'});
    if(part==='cg.viewer.entry.cover'||part==='cg.viewer.difference.cover')return layout({width:pct(100),height:px(80),overflow:'clip'});
    if(part==='cg.viewer.entry.title'||part==='cg.viewer.difference.title')return layout({width:pct(100),height:auto});
    if(/^cg\.viewer\.(previous|next|counter|back|auxiliary)$/.test(part))return layout({mode:'row',width:px(220),height:px(56)});
    return layout({width:auto,height:auto,minWidth:isButton?120:0,minHeight:isButton?48:0,gap:8});
  }
  if (/^(save|load)\.detail\./.test(part))return layout({width:auto,height:auto,gap:8});
  if (/^(save|load)\.grid\.slot$/.test(part)) return layout({position:'flow',mode:'grid',width:pct(100),height:pct(100),columns:1,padding:inset(12),gap:8,align:'stretch',overflow:'clip'});
  if (/^(save|load)\.grid\.slot\.thumbnail$/.test(part)) return layout({position:'flow',mode:'absolute',width:pct(100),height:pct(100),overflow:'clip'});
  if (/^(save|load)\.grid\.slot\./.test(part)) return layout({position:'flow',width:pct(100),height:auto,gap:8});
  if (part === 'title.logo') return layout({ mode: 'absolute', x: px(48), y: px(48), width: px(180), height: px(180) });
  if (part === 'title.workTitle') return layout({ mode: 'absolute', x: px(48), y: px(280), width: pct(55), height: px(96) });
  if (part === 'title.description') return layout({ mode: 'absolute', x: px(48), y: px(392), width: pct(55), height: px(200) });
  if (part === 'title.menu') return layout({ mode: 'column', anchorX: 1, anchorY: 0.5, x: px(-48),
    width: px(360), height: auto, minHeight: 560, gap: 12 });
  if (part.startsWith('title.menu.')) return layout({width:pct(100),height:auto,minHeight:48});
  if (part === 'story.stageFrame') return layout({ mode: 'absolute', width: pct(100), height: pct(100) });
  if (part === 'story.textBox') return layout({ mode: 'column', anchorY: 1, x: pct(5), y: px(-76),
    width: pct(90), height: auto, minHeight: 200, maxHeight: 340, padding: inset(30), z: 10 });
  if (part === 'story.bodyText') return layout({ mode: 'column', height: pct(100), overflow: 'scroll' });
  if (part === 'story.nameBox') return layout({ mode: 'row', anchorY: 1, x: pct(5), y: px(-286),
    width: px(260), height: px(58), z: 11 });
  if (part === 'story.toolbar') return layout({ mode: 'row', anchorY: 1, y: px(0),
    width: pct(100), height: px(64), gap: 8, padding: inset(8), justify: 'end', z: 12 });
  if (['story.toolbar.progress','story.toolbar.tools','story.toolbar.pace','story.toolbar.more'].includes(part)) return layout({position:'flow',mode:'row',width:auto,height:auto,gap:8});
  if (part === 'story.toolbar.trigger') return layout({ mode: 'absolute', anchorY: 1,
    y: px(0), width: pct(100), height: px(80), z: 9 });
  if (part.startsWith('story.toolbar.')) return layout({ width: auto, height: px(48), minWidth: ['story.toolbar.lock','story.toolbar.replayVoice'].includes(part)?48:96 });
  if (part === 'choice.list') return layout({ mode: 'column', x: pct(22), y: pct(18),
    width: pct(56), height: pct(52), gap: 20, overflow: 'scroll' });
  if (part === 'choice.list.item') return layout({width:pct(100),height:auto,minHeight:84});
  if (part.startsWith('choice.list.item.')) return layout({width:auto,height:auto});
  if (part === 'input.prompt') return layout({ mode: 'absolute', x: pct(20), y: pct(30), width: pct(60), height: px(72) });
  if (part === 'input.field') return layout({ mode: 'absolute', x: pct(20), y: pct(40), width: pct(60), height: px(64) });
  if (part === 'input.counter') return layout({position:'free',mode:'absolute',x:pct(20),y:pct(47),width:pct(60),height:px(40)});
  if (part === 'input.validation') return layout({position:'free',mode:'absolute',x:pct(20),y:pct(62),width:pct(60),height:auto});
  if (part === 'input.confirm') return layout({ mode: 'absolute', x: pct(56), y: pct(52), width: px(180), height: px(56) });
  if (part === 'input.cancel') return layout({ mode: 'absolute', x: pct(44), y: pct(52), width: px(180), height: px(56) });
  if (/^(save|load)\.categoryTabs$/.test(part)) return layout({ mode: 'row', x: px(48), y: px(140),
    width: pct(80), height: px(64), gap: 16 });
  if (/^(save|load)\.categoryTabs\./.test(part)) return layout({ width: px(160), height: px(48), minWidth: 120 });
  if (/^(save|load)\.detail$/.test(part)) return layout({ mode: 'column', x: px(48), y: px(228),
    width: pct(27), height: pct(66), gap: 16, overflow:'scroll' });
  if (/^(save|load)\.grid$/.test(part)) return layout({ mode: 'grid', x: pct(32), y: px(228),
    width: pct(64), height: pct(66), columns: 4, gap: 24, overflow: 'scroll' });
  if (/^(save|load)\.pagination$/.test(part)) return layout({ mode: 'row', x: pct(32), y: pct(91),
    width: pct(64), height: px(64), gap: 16 });
  if (/^(save|load)\.pagination\./.test(part)) return layout({ width: px(160), height: px(48), minWidth: 120 });
  if (/^(save|load)\.(primary|back)$/.test(part)) return layout({ mode: 'absolute',
    anchorX: 1, anchorY: 1, x: px(part.endsWith('primary') ? -232 : -48), y: px(-32),
    width: px(160), height: px(48) });
  if (part === 'history.list') return layout({ mode: 'column', x: px(48), y: px(144),
    width: pct(94), height: pct(75), gap: 8, overflow: 'scroll' });
  if (part === 'history.list.row') return layout({mode:'column',height:auto,gap:16,padding:inset(24)});
  if (part === 'settings.categories') return layout({ mode: 'column', x: px(48), y: px(144),
    width: px(240), height: pct(75), gap: 8, overflow: 'scroll' });
  if (part === 'settings.content') return layout({ mode: 'column', x: px(312), y: px(144),
    width: pct(78), height: pct(75), gap: 24, padding:inset(32), overflow: 'scroll' });
  if (part === 'settings.categories.item') return layout({position:'flow',width:pct(100),height:auto,minHeight:56});
  if (part === 'settings.field') return layout({position:'flow',mode:'row',width:pct(100),height:auto,minHeight:56,gap:16,align:'center'});
  if (part === 'settings.fieldLabel') return layout({position:'flow',width:px(200),height:auto});
  if (part === 'settings.fieldHelp') return layout({position:'flow',width:auto,height:auto});
  if (part === 'settings.slider') return layout({position:'flow',mode:'absolute',width:px(280),height:px(48),margin:{...inset(),right:88}});
  if (part === 'settings.slider.track') return layout({position:'free',mode:'absolute',anchorY:.5,y: px(0),width:pct(100),height:px(4)});
  if (part === 'settings.slider.thumb') return layout({position:'free',mode:'absolute',anchorX:.5,anchorY:.5,width:px(20),height:px(20)});
  if (part === 'settings.slider.value') return layout({position:'free',mode:'absolute',x:pct(100),y:px(8),margin:{...inset(),left:16},width:px(72),height:auto});
  if (part === 'settings.toggle') return layout({position:'flow',mode:'absolute',width:px(56),height:px(32)});
  if (part === 'settings.toggle.track') return layout({position:'free',mode:'absolute',width:px(56),height:px(32)});
  if (part === 'settings.toggle.thumb') return layout({position:'free',mode:'absolute',x:px(4),y:px(4),width:px(24),height:px(24)});
  if (part === 'settings.select') return layout({position:'flow',mode:'column',width:px(340),height:px(48)});
  if (part === 'settings.select.trigger') return layout({position:'flow',width:pct(100),height:px(48)});
  if (part === 'settings.preview') return layout({position:'free',mode:'absolute',x:px(312),y:px(688),width:pct(78),height:px(280)});
  if(['settings.dataExport','settings.dataImport','settings.dataClear'].includes(part))return layout({position:'free',mode:'row',x:px(part.endsWith('dataExport')?312:part.endsWith('dataImport')?600:888),y:px(144),width:px(240),height:px(64),align:'center',justify:'center'});
  if (part === 'settings.footer') return layout({mode:'row',position:'free',x:px(48),anchorY:1,y:px(-48),width:pct(92),height:px(64),gap:24,justify:'end'});
  if (/^(cg|music)\.(grid|list)$/.test(part)) return layout({ mode: part.startsWith('cg.') ? 'grid' : 'column',
    x: px(48), y: px(144), width: pct(92), height: pct(75), columns: part.startsWith('cg.') ? 4 : 1,
    gap: 24, overflow: 'scroll' });
  if (part === 'flow.viewport') return layout({ mode: 'absolute', x: px(48), y: px(260), width: pct(78), height: pct(64) });
  if(part==='flow.nodes'||part==='flow.edges')return layout({position:'free',mode:'absolute',width:pct(100),height:pct(100)});
  if(part==='flow.mapSelect')return layout({position:'free',x:px(48),y:px(152),width:px(360),height:px(56)});
  if(part==='flow.zoomOut'||part==='flow.zoomIn'||part==='flow.fit')return layout({position:'free',x:px(part.endsWith('zoomOut')?440:part.endsWith('zoomIn')?620:800),y:px(152),width:px(160),height:px(56)});
  if(part==='flow.entryDescription'||part==='flow.enter'||part==='flow.minimap')return layout({position:'free',x:pct(84),y:px(part.endsWith('minimap')?260:part.endsWith('enter')?600:460),width:pct(13),height:px(part.endsWith('minimap')?160:part.endsWith('enter')?56:120)});
  if (part === 'flow.minimap') return layout({ mode: 'column', width: pct(100), height: px(160) });
  if (part === 'flow.node') return layout({position:'free',width:px(220),height:auto,minHeight:64});
  if (part === 'history.list.row.voice') return layout({width:px(48),height:px(48),minWidth:48,minHeight:48});
  if (part === 'characters.list') return layout({ mode: 'row', x: pct(6), y: pct(16), width: pct(88), height: pct(70), gap: 24, align: 'stretch', justify: 'start', overflow: 'scroll' });
  if (part === 'characters.afterstory') return layout({ mode: 'row', height: auto, gap: 12 });
  if (part === 'characters.card') return layout({mode:'column',width:px(520),height:pct(100),minWidth:420,gap:0,overflow:'clip'});
  if (part === 'characters.card.portrait') return layout({width:pct(100),height:px(380),minHeight:380});
  if (part === 'confirm.remember') return layout({mode:'row',width:pct(100),height:auto,minHeight:48,gap:12,align:'center'});
  if (/^characters\.(card\.|afterstory\.)/.test(part)) return layout({width:auto,height:auto,minWidth:isButton?120:0,minHeight:isButton?48:0});
  if (part === 'characters.details') return layout({ mode: 'column', x: pct(45), y: px(144), width: pct(50), height: pct(75) });
  if (/^(confirm|error|dataImport|dataClear)\.(title|message)$/.test(part)) return layout({mode:'column',height:auto,minHeight:48});
  if(part==='dataImport.records')return layout({mode:'column',width:pct(100),height:auto,maxHeight:480,overflow:'scroll',gap:24});
  if(part==='dataImport.records.record'||part==='dataImport.longTerm'||part==='dataImport.preferences'||part==='dataClear.scope')return layout({mode:'column',width:pct(100),height:auto,gap:16});
  if (/^(confirm|error|dataImport|dataClear)\.(confirm|cancel|titleAction|apply)$/.test(part)) return layout({width:px(180),height:px(56),minWidth:120});
  if (part.endsWith('.header')) return layout({ mode: 'row', x: px(48), y: px(48), width: pct(92), height: px(72), gap: 24 });
  if (part.endsWith('.footer')) return layout({ mode: 'row', x: px(48), anchorY: 1, y: px(-48), width: pct(92), height: px(64), gap: 24 });
  if (/^(cg|video|music)\.(viewer\.)?back$/.test(part))return layout({mode:'row',width:auto,height:auto,minWidth:120,minHeight:40});
  if (part.endsWith('.back')) return layout({ mode: 'absolute', anchorX: 1, anchorY: 1,
    x: px(-48), y: px(-48), width: px(220), height: px(48), minWidth: 120 });
  if (part.endsWith('.grid')) return layout({ mode: 'grid', width: pct(70), height: pct(75), columns: 3, gap: 24, overflow: 'scroll' });
  if (part.endsWith('.list') || part.endsWith('.records')) return layout({ mode: 'column', height: pct(70), overflow: 'scroll' });
  if (part.endsWith('.detail')) return layout({ mode: 'column', width: pct(30), height: pct(75) });
  if (part.endsWith('.panel')) return layout({ mode: 'column', anchorX: 0.5, anchorY: 0.5,
    width: pct(70), height: part.startsWith('data')?pct(88):auto, minWidth: 560, minHeight: 240, maxWidth: 1100,maxHeight:972,overflow:'scroll', padding: inset(24) });
  return layout({ width:isButton?auto:pct(100), minWidth: isButton ? 120 : 0, minHeight: isButton ? 48 : 0, height:auto });
}

function includePart(part: string, kind: OfficialTemplateKind): boolean {
  if(/^characters\.afterstory\.(start|continue|replay)$/.test(part))return false;
  if (kind === 'rich') return true;
  if (/^(title\.menu|story\.toolbar)\.flow$/.test(part)) return false;
  if (kind === 'standard') return true;
  return !/^title\.menu\.(continue|cg|music)$/.test(part)
    && !/^story\.toolbar\.quick(Save|Load)$/.test(part)
    && !/^(save|load)\.categoryTabs\.(quick|auto)$/.test(part);
}

function makePage(key: string, kind: OfficialTemplateKind, appearance: Appearance, nextId: () => Id): PageConfig {
  const root: ComponentConfig = { id: nextId(), part: `${key}.root`,
    layout: layout({ mode: 'absolute', width: pct(100), height: pct(100) }),
    visible: true, locked: false, content: {}, normal: {}, states: {}, children: [], animations: {} };
  const components = new Map<string, ComponentConfig>([[root.part, root]]);
  const parents=new Map<ComponentConfig,string>();
  for (const entry of officialParts(key).filter(item => includePart(item.part, kind))) {
    const component: ComponentConfig = { id: nextId(), part: entry.part,
      layout: componentLayout(entry.part, entry.kind === 'button'||entry.kind==='tab'), visible: true, locked: false,
      content: buttonLabels[entry.part] ? { labelKey: buttonLabels[entry.part]! } : {},
      normal: {}, states: {}, children: [], animations: {} };
    if((entry.kind==='button'||entry.kind==='tab'||entry.part==='choice.list.item')&&!/^cg\.viewer\.(entry|difference)$/.test(entry.part)){component.layout.mode='row';component.layout.align='center';component.layout.justify='center';}
    if(/^(save|load)\.grid\.slot\.(number|summary|time|empty)$/.test(entry.part))component.normal={fontSize:18,lineHeight:4/3};
    if(/^(save|load)\.grid\.slot$/.test(entry.part)||entry.part==='characters.card'){
      const ink=appearance==='night'?'#E7E8F2':'#29465F',surface=appearance==='night'?'#1E2943':'#F3F8FD',line=appearance==='night'?'#364361':'#D6E4F0';
      component.normal={background:background(surface),color:ink,borderColor:line,borderWidth:1,radius:8};
      component.states={hover:{background:background(appearance==='night'?'#2B3B5A':'#E0EDF8'),color:ink,borderColor:ink},selected:{background:background(ink),color:appearance==='night'?'#141B30':'#FFFFFF',borderColor:ink},locked:{background:background(surface),color:ink,borderColor:line,opacity:.6}};
    }
    if(entry.part==='settings.slider.value')component.normal={fontSize:22,lineHeight:1.4,wrap:false};
    if (entry.part === 'title.menu') component.layout.position = 'free';
    if (entry.part === 'settings.categories') { component.layout.position='free';component.repeat={source:{source:'data',path:'settingsCategories'},key:'id'}; }
    if (entry.part === 'settings.content') { component.layout.position='free';component.layout.mode='grid';component.layout.columns=2;component.layout.height=px(512);component.repeat={source:{source:'data',path:'settingsFields'},key:'id'}; }
    if (entry.part === 'choice.list' || entry.part === 'history.list' || /^(save|load)\.grid$/.test(entry.part)) {
      component.layout.position = 'free'; component.repeat = { source: { source: 'data', path: entry.part === 'choice.list' ? 'choices' : entry.part === 'history.list' ? 'history' : 'saves' }, key: 'id' };
    }
    const repeatSources:Record<string,string>={'cg.grid':'galleryEntries','video.grid':'galleryEntries','cg.music.list':'musicEntries','music.list':'musicEntries','cg.viewer.entries':'viewerEntries','cg.viewer.differences':'galleryDifferences','characters.list':'afterstoryCharacters','flow.nodes':'flowNodes','flow.edges':'flowEdges','dataImport.records':'importRecords'};
    if(repeatSources[entry.part])component.repeat={source:{source:'data',path:repeatSources[entry.part]!},key:'id'};
    components.set(entry.part, component);
    const parentPart = entry.part==='flow.node'?'flow.nodes':entry.part==='flow.edge'?'flow.edges':entry.part==='flow.nodes'||entry.part==='flow.edges'?'flow.viewport'
      :entry.part==='characters.card'?'characters.list':entry.part==='characters.afterstory'?'characters.card':entry.part==='characters.afterstory.title'?'characters.card'
      :entry.part==='cg.viewer.entry'?'cg.viewer.entries':entry.part==='cg.viewer.difference'?'cg.viewer.differences'
      :/^cg\.viewer\.(title|auxiliary|back)$/.test(entry.part)?'cg.viewer.header':/^cg\.viewer\.(differences|image)$/.test(entry.part)?'cg.viewer.content':/^cg\.viewer\.(previous|next|counter)$/.test(entry.part)?'cg.viewer.footer'
      :key==='story'&&['save','load','quickSave','quickLoad'].some(name=>entry.part===`story.toolbar.${name}`)?'story.toolbar.progress'
      :key==='story'&&['history','settings'].some(name=>entry.part===`story.toolbar.${name}`)?'story.toolbar.tools'
      :key==='story'&&['auto','skip'].some(name=>entry.part===`story.toolbar.${name}`)?'story.toolbar.pace'
      :key==='story'&&['hideUI','title','flow'].some(name=>entry.part===`story.toolbar.${name}`)?'story.toolbar.more'
      :key==='settings'&&['groupHeading','fieldLabel','fieldHelp','slider','toggle','select'].some(name=>entry.part===`settings.${name}`)?'settings.field'
      : entry.part==='settings.field'?'settings.content':key==='settings'&&['reset','back','titleAction','exit'].some(name=>entry.part===`settings.${name}`)?'settings.footer'
      : entry.part === `${key}.title` && components.has(`${key}.header`) ? `${key}.header` : entry.part === 'story.bodyText' || entry.part === 'story.advanceIndicator'
      ? 'story.textBox' : entry.part === 'story.nameText' ? 'story.nameBox'
        : entry.part === 'story.toolbar.trigger' ? root.part
          : entry.part.slice(0, entry.part.lastIndexOf('.'));
    const modalParent=['confirm','error','dataImport','dataClear'].includes(key)&&!['scrim','panel'].some(name=>entry.part===`${key}.${name}`)&&parentPart===key?`${key}.panel`:parentPart;
    if(parentPart==='settings.footer'||modalParent===`${key}.panel`)Object.assign(component.layout,{position:'flow',anchorX:0,anchorY:0,x:px(0),y:px(0)});
    parents.set(component,modalParent);
  }
  for(const [component,parentPart] of parents)(components.get(parentPart)??root).children.push(component);
  const group = (parent: ComponentConfig, selected: string[], mode: 'row'|'column', name: string, padding = 0) => {
    const children=selected.flatMap(part=>parent.children.filter(child=>child.part===part));
    if(!children.length)return;
    parent.children=parent.children.filter(child=>!children.includes(child));
    parent.children.push({id:nextId(),part:'basic.container',name,layout:layout({position:'flow',mode,width:pct(100),height:auto,gap:mode==='row'?16:12,padding:inset(padding),align:mode==='row'?'center':'stretch',justify:mode==='row'?'end':'start'}),visible:true,locked:false,content:{},normal:{},states:{},children,animations:{}});
  };
  if(key==='confirm'){
    const panel=components.get('confirm.panel')!;
    panel.children.sort((a,b)=>['confirm.title','confirm.message','confirm.remember','confirm.confirm','confirm.cancel'].indexOf(a.part)-['confirm.title','confirm.message','confirm.remember','confirm.confirm','confirm.cancel'].indexOf(b.part));
    group(panel,['confirm.confirm','confirm.cancel'],'row','Confirmation actions');
  }
  if(key==='videoError'){
    group(root,['videoError.message','videoError.retry','videoError.titleAction'],'column','Video recovery',48);
    const panel=root.children.at(-1)!;
    Object.assign(panel.layout,{position:'free',anchorX:.5,anchorY:.5,width:pct(70),height:auto,minWidth:560,maxWidth:1100,gap:24,align:'stretch'});
    panel.normal={background:background(appearance==='night'?'#1E2943':'#F3F8FD'),radius:12};
    const message=components.get('videoError.message')!;
    Object.assign(message.layout,{position:'flow',height:auto,maxHeight:540,overflow:'scroll'});
    for(const part of ['videoError.retry','videoError.titleAction'])Object.assign(components.get(part)!.layout,{position:'flow',height:auto,minHeight:56});
    group(panel,['videoError.retry','videoError.titleAction'],'row','Video recovery actions');
  }
  if(key==='characters')group(components.get('characters.card')!,['characters.card.name','characters.card.description','characters.afterstory.title','characters.afterstory'],'column','Afterstory caption',24);
  if(key==='cg')components.get('cg.viewer.footer')!.children.sort((a,b)=>['cg.viewer.previous','cg.viewer.counter','cg.viewer.next'].indexOf(a.part)-['cg.viewer.previous','cg.viewer.counter','cg.viewer.next'].indexOf(b.part));
  if(key==='history')group(components.get('history.list.row')!,['history.list.row.voice','history.list.row.jump'],'row','History actions');
  if(key==='cg'||key==='music'){
    const prefix=key==='cg'?'cg.music.player':'music.player',player=components.get(prefix)!;
    const time=components.get(`${prefix}.time`),progress=components.get(`${prefix}.progress`);
    if(time&&progress){player.children=player.children.filter(component=>component!==time);progress.children.push(time);}
    player.children.sort((a,b)=>['volume','progress','play','pause','stop'].indexOf(a.part.split('.').at(-1)!)-['volume','progress','play','pause','stop'].indexOf(b.part.split('.').at(-1)!));
    group(player,[`${prefix}.play`,`${prefix}.pause`,`${prefix}.stop`],'row','Music playback');
  }
  for(const part of [`${key}.grid.slot`]){const slot=components.get(part);if(slot)slot.children.sort((left,right)=>['number','thumbnail','summary','empty','time'].indexOf(left.part.split('.').at(-1)!)-['number','thumbnail','summary','empty','time'].indexOf(right.part.split('.').at(-1)!));}
  const pageBackground = background(appearance === 'night' ? '#141B30' : key === 'history' ? '#F3F8FD' : '#FFFFFF');
  if (key === 'history') pageBackground.colorOpacity = 0.85;
  if (['story','choice','input'].includes(key)) pageBackground.colorOpacity = 0;
  if (['confirm','error','dataImport','dataClear'].includes(key)) {pageBackground.color='#0C162B';pageBackground.colorOpacity=.35;}
  const toolbar = key === 'story' ? { anchor: 'bottom' as const, orientation: 'row' as const,
    enterFrom: 'down' as const, exitTo: 'down' as const, triggerSize: 80, offset: 0,
    showMs: 220, hideMs: 220, easing: { family: 'cubic' as const, direction: 'out' as const } } : null;
  return { id: nextId(), key, titleKey: `page.${key}`,
    layout: layout({ mode: 'absolute', width: pct(100), height: pct(100) }),
    background: pageBackground, root, portalRootId: nextId(), toolbar };
}


export function createOfficialTemplate(choice: TemplateChoice = { kind: DEFAULT_TEMPLATE }, nextId: () => Id = () => createId()): RuntimeTemplate {
  const { kind } = choice;
  const appearance = choice.appearance ?? 'paper';
  const relation = choice.richRelation ?? 'variables';
  const id = `org.galcraft.${kind}.${appearance}`;
  const dependency: Dependency = { kind: 'template', id, version: '0.1.0', targets: ['web', 'windows', 'android', 'ios'], required: true };
  const dependencies: Dependency[] = [dependency];
  if (kind === 'rich' && relation === 'plugin') dependencies.push({ kind: 'plugin', id: 'org.galcraft.affection',
    version: '0.1.0', targets: ['web', 'windows'], required: true });
  const resources = officialLocaleResources();
  const resourceErrors = validateLocaleResources(resources);
  if (resourceErrors.length) throw new Error(`Official locale resources invalid: ${resourceErrors.join('; ')}`);
  const template: RuntimeTemplate = {
    id, version: '0.1.0', instanceId: nextId(),
    features: kind === 'rich' && relation === 'plugin' ? [...features[kind], 'affection'] : [...features[kind]],
    defaultVisual: visual(appearance), pages: pageSets[kind].map(key => makePage(key, kind, appearance, nextId)),
    styles: [], animations: UIAnimationPresets.map(preset=>createUIAnimationPreset(preset.key,nextId())),
    locales: Object.fromEntries(Object.entries(resources).map(([locale, resource]) => [locale, resource.strings])),
    menuDefault: 'zh-CN', dependencies,
  };
  const animation = template.animations[3]!,hideAnimation=template.animations[7]!;
  if (kind === 'rich' && relation !== 'plugin' && (choice.richRelation==='variables'||choice.relationVariables?.length)) {
    template.features.push('coreRelations');
    const page = makePage('relations',kind,appearance,nextId);
    configureCoreVariablePage(page,choice.relationVariables??[],nextId); template.pages.push(page);
    const title=template.pages.find(page=>page.key==='title')!,menu=title.root.children.find(component=>component.part==='title.menu')??title.root;
    const entrance:ComponentConfig={id:nextId(),part:'basic.button',name:'Relationships',layout:layout({position:'flow',width:pct(100),height:auto,minHeight:56,align:'center',justify:'center'}),visible:true,locked:false,content:{labelKey:'page.relations'},normal:{},states:{},children:[],animations:{},interactions:[{event:'click',actions:[{kind:'open',page:'relations'}]}]};
    menu.children.push(entrance);
    const story=template.pages.find(page=>page.key==='story');if(story)configureCoreVariablePage(story,choice.relationVariables??[],nextId);
  }
  for (const page of template.pages) if (page.key === 'story') {
    const toolbar = page.root.children.find(component => component.part === 'story.toolbar');
    if (toolbar) {toolbar.animations.show = animation.id;toolbar.animations.hide=hideAnimation.id;}
  }
  applyBasicPageAnimations(template, template.pages.map(page=>page.id), nextId);
  applyReadingPreset(template, 'portrait', nextId);
  return RuntimeTemplateSchema.parse(template);
}

/** Official relation pages and HUDs use the same authored scalar bindings. */
export function configureCoreVariablePage(page: PageConfig, variables: readonly CoreRelationVariable[], nextId: () => Id = () => createId(page)): void {
  if (!['relations','story'].includes(page.key)) return;
  const component=(kind:'container'|'text'|'button',content:ComponentConfig['content']={},overrides:Partial<Layout>={}):ComponentConfig=>({id:nextId(),part:`basic.${kind}`,layout:layout({position:'flow',width:pct(100),height:auto,...overrides}),visible:true,locked:false,content,normal:{},states:{},children:[],animations:{}});
  const rows=(compact=false)=>variables.map(variable=>{const row=component('container',{}, {mode:'row',gap:compact?16:24,justify:'spaceBetween',align:'center',padding:inset(12)}),name=component('text',{text:variable.name},{width:pct(compact?40:70)}),value=component('text',{}, {width:pct(compact?55:20)});value.bindings={text:{source:'variable',scope:variable.scope,variableId:variable.id}};value.normal={textAlign:'end'};row.children=[name,value];return row;});
  if(page.key==='relations'){
    const heading=component('text',{labelKey:'page.relations'});heading.normal={fontSize:42};
    const list=component('container',{}, {overflow:'scroll',height:pct(70),gap:8});list.children=rows();
    if(!variables.length)list.children=[component('text',{text:'—'})];
    const back=component('button',{labelKey:'nav.back'},{width:px(160),minHeight:56,align:'center',justify:'center'});back.interactions=[{event:'click',actions:[{kind:'official',action:{kind:'back'}}]}];
    page.root.layout={...page.root.layout,mode:'column',padding:inset(64),gap:24};page.root.children=[heading,list,back];
  } else if(variables.length){
    const hud=component('container',{}, {position:'free',anchorX:1,x:pct(-2),y:pct(3),width:px(400),gap:0});hud.name='Relationships';hud.normal={background:{...page.background,colorOpacity:.88},radius:8};hud.children=rows(true);page.root.children.push(hud);
  }
}

/** An explicit author action also upgrades an older independent text/toolbar layout. */
export function applyReadingPreset(template: RuntimeTemplate, preset: 'portrait' | 'clear', nextId: () => Id = () => createId(template)): void {
  const page = template.pages.find(item => item.key === 'story'); if (!page) return;
  const all = new Map<string, ComponentConfig>();
  const visit = (item: ComponentConfig) => { all.set(item.part, item); item.children.forEach(visit); }; visit(page.root);
  let panel = all.get('story.readingPanel');
  if (!panel) panel = { id: nextId(), part: 'story.readingPanel', layout: layout(), visible: true, locked: false,
    content: {}, normal: {}, states: {}, children: [], animations: {} };
  const reading = ['story.nameBox', 'story.textBox', 'story.avatar', 'story.toolbar'];
  const detach = (parent: ComponentConfig) => { parent.children = parent.children.filter(child => child !== panel && !reading.includes(child.part)); parent.children.forEach(detach); };
  detach(page.root);
  panel.children = reading.map(part => all.get(part)).filter((item): item is ComponentConfig => !!item);
  panel.layout = layout({ position:'free',mode: 'grid',columns:preset==='portrait'?2:1, anchorY: 1, width: pct(100), height: auto, padding: { top: 24, right: 64, bottom: 16, left: 64 }, gap: 12, z: 10 });
  panel.content = { ...panel.content, portrait: preset === 'portrait', nameAbove: false, gradient: true, portraitWidth: 220,
    nvlPadding: 72, nvlScrimColor: '#000000', nvlScrimOpacity: .65, nvlLineHeight: 1.8, nvlParagraphGap: 16, nvlNameColor: '#ffffff', nvlNameBold: true };
  panel.normal = { ...panel.normal, color: '#FFFFFF', radius: 0, background: { ...background('#182338'), colorOpacity: preset === 'portrait' ? .84 : .76 } };
  panel.visible = true;
  for (const part of panel.children) {
    part.normal.background = { ...background('#000000'), colorOpacity: 0 }; part.normal.color = '#FFFFFF';
    if (part.part === 'story.textBox') part.layout = layout({ mode: 'column', height: auto, minHeight: 138, maxHeight: 290, overflow: 'scroll' });
    if (part.part === 'story.nameBox') part.layout = layout({ mode: 'row', height: auto });
    if (part.part === 'story.avatar') part.layout = layout({ mode: 'column', width: px(220), height: px(220) });
    if (part.part === 'story.toolbar') part.layout = layout({ mode: 'row', width:auto, minWidth:0, height: auto, gap: 8, justify: 'end' });
  }
  page.root.children.push(panel);
}

export function missingRequiredEntrances(template: RuntimeTemplate, target: Target = 'web'): string[] {
  const pages = new Map(template.pages.map(page => [page.key, page]));
  const missing = new Set<string>();
  for (const key of commonPages) {
    if(key==='characters'&&!pages.has(key))continue;
    if (!pages.get(key)?.root.visible) missing.add(key);
  }
  const parts = new Set<string>();
  const visit = (component: ComponentConfig, inheritedVisible = true) => {
    const visible = inheritedVisible && component.visible;
    if (visible) parts.add(component.part);
    for (const child of component.children) visit(child, visible);
  };
  for (const page of template.pages) visit(page.root);
  const requirePart = (part: string, action = true) => {
    if (!parts.has(part) || (action && !componentDefinition(part)?.action)) missing.add(part);
  };
  const requiredActions: Record<string, readonly string[]> = {
    title: ['title.menu.start', 'title.menu.load', 'title.menu.settings'],
    story: ['story.toolbar.trigger', 'story.toolbar.save', 'story.toolbar.load', 'story.toolbar.history',
      'story.toolbar.settings', 'story.toolbar.auto', 'story.toolbar.skip', 'story.toolbar.title'],
    choice: ['choice.list.item'], input: ['input.confirm', 'input.cancel'],
    save: ['save.categoryTabs.manual', 'save.primary', 'save.back'],
    load: ['load.categoryTabs.manual', 'load.primary', 'load.back'],
    history: ['history.back'], settings: ['settings.back'],
    cg: ['cg.grid.item', 'cg.viewer.previous', 'cg.viewer.next', 'cg.viewer.back', 'cg.back'],
    music: ['music.player.play', 'music.player.pause', 'music.player.stop', 'music.back'],
    flow: ['flow.enter', 'flow.back'], characters: ['characters.back'],
    confirm: ['confirm.confirm', 'confirm.cancel'],
    error: ['error.cancel', 'error.titleAction'],
    dataImport: ['dataImport.apply', 'dataImport.cancel'],
    dataClear: ['dataClear.confirm', 'dataClear.cancel'],
    emergency: ['emergency.restore'], videoError: ['videoError.retry', 'videoError.titleAction'],
  };
  for (const [page, actions] of Object.entries(requiredActions)) {
    if (pages.get(page)?.root.visible) for (const action of actions) requirePart(action);
  }
  if (target === 'windows') for (const part of ['title.menu.exit', 'settings.exit']) requirePart(part);
  if (template.features.includes('continue')) requirePart('title.menu.continue');
  if (template.features.includes('quickSaves')) for (const part of [
    'story.toolbar.quickSave', 'story.toolbar.quickLoad', 'save.categoryTabs.quick', 'load.categoryTabs.quick']) {
    requirePart(part);
  }
  if (template.features.includes('autoSaves')) for (const part of ['save.categoryTabs.auto', 'load.categoryTabs.auto']) {
    requirePart(part);
  }
  for (const feature of ['cg', 'music', 'flow', 'characters']) {
    if (template.features.includes(feature) && !pages.get(feature)?.root.visible) missing.add(feature);
    if (pages.get(feature)?.root.visible) requirePart(`title.menu.${feature}`);
  }
  if (pages.get('dataImport')?.root.visible) requirePart('settings.dataImport');
  if (pages.get('dataClear')?.root.visible) requirePart('settings.dataClear');
  return [...missing];
}

/** Fill only missing plugin pages/parts; authored IDs, layouts and states remain authoritative. */
export function completeAfterstoryPage(template:RuntimeTemplate) {
  if(template.pages.some(page=>page.key==='characters'))return;
  template.pages.push(makePage('characters','light','paper',()=>createId(template)));
}
export function completePluginPages(template: RuntimeTemplate, pages: readonly {key:string;titleKey:string;publicParts:string[]}[], nextId:()=>Id=()=>createId(template)): void {
  for(const contribution of pages){
    let page=template.pages.find(item=>item.key===contribution.key);
    if(!page){page=makePage(contribution.key,'rich',template.defaultVisual.background.color==='#141B30'?'night':'paper',nextId);page.titleKey=contribution.titleKey;template.pages.push(page);}
    const parts=new Map<string,ComponentConfig>();
    const visit=(component:ComponentConfig)=>{parts.set(component.part,component);component.children.forEach(visit);};visit(page.root);
    for(const part of contribution.publicParts){
      if(parts.has(part))continue;
      const component:ComponentConfig={id:nextId(),part,layout:layout({height:auto}),visible:true,locked:false,content:{},normal:{},states:{},children:[],animations:{}};
      const parent=parts.get(part.slice(0,part.lastIndexOf('.')))??page.root;
      parent.children.push(component);parts.set(part,component);
    }
  }
}

/** Explicit, undoable for existing work; official new templates use the same definitions. */
export function applyBasicPageAnimations(template: RuntimeTemplate, pageIds: Id[], nextId:()=>Id=()=>createId(template)): void {
  const make=(name:string,from:number,to:number,durationMs:number):UIAnimation=>({id:nextId(),name,version:1,reduced:'finish',segments:[{durationMs:0,opacity:from,easing:{family:'linear',direction:'in'}},{durationMs,opacity:to,easing:{family:'sine',direction:'out'}}]});
  const enter=make('页面进入 / Page enter',0,1,120),exit=make('页面退出 / Page exit',1,0,120),content=make('内容进入 / Content enter',0,1,80),contentExit=make('内容退出 / Content exit',1,0,80);
  template.animations.push(enter,exit,content,contentExit);
  for(const page of template.pages.filter(page=>pageIds.includes(page.id))){page.root.animations.enter=enter.id;page.root.animations.exit=exit.id;
    const all=(node:ComponentConfig):ComponentConfig[]=>[node,...node.children.flatMap(all)]; const types=all(page.root).find(component=>component.part==='cg.types');if(types){types.animations.show=content.id;types.animations.hide=contentExit.id;}}
}
