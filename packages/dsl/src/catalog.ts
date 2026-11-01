import { z } from 'zod';
import { ExprSchema, NativeAnimationSchema, EffectPatchSchema, type CommandSpec, type EntityKind, type FieldSpec, type Json, type Version } from '@galcraft/contracts';

type FieldOptions = Partial<Omit<FieldSpec, 'path' | 'label' | 'description' | 'type' | 'required' | 'nullable' | 'default' | 'unit' | 'group' | 'summary' | 'keywords'>> & {
  required?: boolean; nullable?: boolean; default?: Json; unit?: FieldSpec['unit']; group?: FieldSpec['group']; summary?: boolean; description?: string;
};
function field(path: string, type: FieldSpec['type'], options: FieldOptions = {}): FieldSpec {
  return { path, label: path, description: options.description ?? path, type, required: options.required ?? false,
    nullable: options.nullable ?? false, default: options.default ?? null, unit: options.unit ?? 'none',
    group: options.group ?? 'basic', summary: options.summary ?? true, keywords: [], ...options };
}
const s = (path: string, options?: FieldOptions) => field(path, 'string', options);
const n = (path: string, options?: FieldOptions) => field(path, 'number', options);
const i = (path: string, options?: FieldOptions) => field(path, 'integer', options);
const b = (path: string, options?: FieldOptions) => field(path, 'boolean', options);
const e = (path: string, values: string[], options?: FieldOptions) => field(path, 'enum', { enumValues: values, ...options });
const r = (path: string, kind: EntityKind, options?: FieldOptions) => field(path, 'ref', { refKind: kind, ...options });
const x = (path: string, options?: FieldOptions) => field(path, 'expression', options);
const o = (path: string, children: FieldSpec[], options?: FieldOptions) => field(path, 'object', { children, ...options });
const a = (path: string, item: FieldSpec, options?: FieldOptions) => field(path, 'array', { item, ...options });
const req = { required: true } as const;
const effects: FieldSpec[] = [
  o('shockwave', [n('time', { default: 0 }), n('amplitude', { default: 30 }), n('wavelength', { default: 160, exclusiveMin: 0 }), n('speed', { default: 500 }), n('radius', { default: -1 }), n('centerX', { default: .5 }), n('centerY', { default: .5 })], { group: 'effect' }),
  o('circle', [n('radius', { default: 2 }), n('softness', { default: 0, min: 0 }), n('centerX', { default: .5 }), n('centerY', { default: .5 }), b('invert', { default: false })], { group: 'effect' }),
  n('x', { default: 0, unit: 'px' }), n('y', { default: 0, unit: 'px' }), n('scaleX', { default: 1 }), n('scaleY', { default: 1 }),
  n('rotationDeg', { default: 0, unit: 'deg' }), n('opacity', { default: 1, min: 0, max: 1 }), n('blur', { default: 0, min: 0, unit: 'px' }),
  n('brightness', { default: 1, min: 0 }), n('contrast', { default: 1, min: 0 }), n('saturation', { default: 1, min: 0 }),
  n('gamma', { default: 1, exclusiveMin: 0 }), a('rgb', i('channel', { min: 0, max: 255 }), { default: [255, 255, 255], minItems: 3 }),
  o('bloom', [n('intensity', { default: 0, min: 0, max: 1 }), n('brightness', { default: 1, min: 0 }), n('blur', { default: 0, min: 0 }), n('threshold', { default: 0, min: 0, max: 1 })], { group: 'effect' }),
  o('bevel', [n('opacity', { default: 0, min: 0, max: 1 }), n('thickness', { default: 0, min: 0 }), n('rotationDeg', { default: 0 }), n('softness', { default: 0, min: 0, max: 1 }), a('rgb', i('channel', { min: 0, max: 255 }), { minItems: 3 })], { group: 'effect' }),
  o('filters', ['oldFilm', 'dot', 'reflection', 'glitch', 'rgbSplit', 'godray'].map(key => b(key, { default: false })), { group: 'effect' }),
  e('blend', ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'add'], { default: 'normal' }),
  i('z', { default: 0 }), e('station', ['left', 'leftQuarter', 'leftThird', 'center', 'rightThird', 'rightQuarter', 'right'], { default: 'center' }),
];
const effect = (path = 'effects', options?: FieldOptions) => o(path, effects, { group: 'effect', ...options });
const easing = (path = 'easing', options?: FieldOptions) => o(path, [
  e('family', ['linear', 'sine', 'quad', 'cubic', 'quart', 'quint', 'expo', 'circ', 'back', 'elastic', 'bounce'], { default: 'linear' }),
  e('direction', ['in', 'out', 'inOut'], { default: 'in' }),
], { group: 'animation', default: { family: 'linear', direction: 'in' }, ...options });
const transition = (path: string) => o(path, [
  e('preset', ['cut', 'fade', 'dissolve', 'slide', 'wipe', 'blinds', 'gridFlip', 'diagonalReveal', 'custom'], { default: 'cut' }), r('resourceId', 'asset', { nullable: true, default: null, assetKinds: ['animation'] }),
  n('durationMs', { default: 0, min: 0, unit: 'ms' }), easing(), e('direction', ['left', 'right', 'up', 'down'], { default: 'left' }),
  o('grid', [i('columns', { default: 12, min: 1, max: 64 }), i('rows', { default: 8, min: 1, max: 36 })]),
  o('animation', []),
], { group: 'animation', default: { preset: 'cut', resourceId: null, durationMs: 0, easing: { family: 'linear', direction: 'in' }, direction: 'left' } });
const target = (path = 'target', required = true, allowStage = false) => o(path, [e('kind', allowStage ? ['object', 'station', 'stage'] : ['object', 'station'], req), r('id', 'object'), e('station', ['left', 'leftQuarter', 'leftThird', 'center', 'rightThird', 'rightQuarter', 'right'])], { required });
const targetRef = (path: string, options?: FieldOptions) => o(path, [r('sceneId', 'scene', req), r('labelId', 'label', { nullable: true, default: null })], options);
const segment = () => o('segment', [effect('effects', req), n('durationMs', { default: 300, min: 0, unit: 'ms' }), easing()], { group: 'animation' });
const model = () => o('model', [
  o('imageMouth', [b('enabled', { default: false }), r('closed', 'asset', { assetKinds: ['image'] }), r('half', 'asset', { nullable: true, default: null, assetKinds: ['image'] }), r('open', 'asset', { assetKinds: ['image'] })]),
  o('imageBlink', [b('enabled', { default: false }), r('open', 'asset', { assetKinds: ['image'] }), r('closed', 'asset', { assetKinds: ['image'] }), n('intervalMs', { default: 4000, min: 0 }), n('randomMs', { default: 1000, min: 0 }), n('closeMs', { default: 100, min: 0 }), n('holdMs', { default: 100, min: 0 }), n('openMs', { default: 100, min: 0 })]),
  o('imageFaceCombinations', [r('closedOpen', 'asset', { assetKinds: ['image'] }), r('halfOpen', 'asset', { assetKinds: ['image'] }), r('openOpen', 'asset', { assetKinds: ['image'] }),
    r('closedClosed', 'asset', { assetKinds: ['image'] }), r('halfClosed', 'asset', { assetKinds: ['image'] }), r('openClosed', 'asset', { assetKinds: ['image'] })]),
  o('motion', [e('op', ['play', 'stop'], { default: 'play' }), s('group', req), i('index', { min: 0, ...req }), b('loop', { default: false }), n('fadeInMs', { nullable: true, default: null, min: 0 }), n('fadeOutMs', { nullable: true, default: null, min: 0 })]),
  o('expression', [e('op', ['set', 'reset'], { default: 'set' }), s('name', { nullable: true, default: null })]),
  b('blink'), b('breath'), b('physics'), b('autoMotion'),
  o('gaze', [e('follow', ['none', 'pointer', 'fixed'], { default: 'none' }), n('x', { default: 0, min: -1, max: 1 }), n('y', { default: 0, min: -1, max: 1 }), b('smooth', { default: true }), n('durationMs', { default: 300, min: 0 })]),
  o('lip', [e('mode', ['off', 'basic', 'motionSync'], { default: 'off' }), n('gain', { default: 1, min: 0 })]),
  o('parameters', [], { default: {} }),
  o('crop', [n('x', req), n('y', req), n('width', { exclusiveMin: 0, ...req }), n('height', { exclusiveMin: 0, ...req })], { nullable: true }),
], { group: 'model' });

type CatalogRow = [string, string, CommandSpec['continuation'], boolean, string, FieldSpec[]];
const volume = (path = 'volume') => n(path, { default: 100, min: 0, max: 100, unit: 'percent' });
const loopAudio = [n('startSec', { default: 0, min: 0, unit: 's' }), n('loopStartSec', { min: 0, unit: 's' }), n('loopEndSec', { min: 0, unit: 's' }), n('fadeInMs', { default: 0, min: 0, unit: 'ms' }), n('fadeOutMs', { default: 0, min: 0, unit: 'ms' })];
const rows: CatalogRow[] = [
  ['characterDifference', '角色共同差分', 'continue', false, 'M06', [r('characterId', 'character', req), s('differenceId'),
    b('figureVisible'), b('avatarVisible'), transition('transition')]],
  ['readingMode', '阅读模式', 'continue', false, 'M05', [e('mode', ['adv', 'nvl'], { default: 'adv' }), b('retainIllustrations', { default: false })]],
  ['clearPage', '提前清页', 'continue', false, 'M05', []],
  ['changeIllustration', '演出插图', 'continue', false, 'M06', [e('op', ['show', 'replace', 'exit'], { default: 'show' }), r('objectId', 'object', req), r('characterId', 'character'), r('assetId', 'asset', { assetKinds: ['image', 'live2d'] }), effect(), o('illustrationFrame', [n('widthRatio', { default: .5, exclusiveMin: 0 }), n('heightRatio', { default: .5, exclusiveMin: 0 }), e('fit', ['contain', 'cover', 'native'], { default: 'contain' })]), a('states', o('state', [s('name', req), r('assetId', 'asset', { ...req, assetKinds: ['image', 'live2d'] })])), o('transition', [transition('enter'), transition('exit')])]],
  ['changeIllustrationDiff', '插图差分', 'continue', false, 'M06', [r('objectId', 'object', req), s('stateName'), r('assetId', 'asset', { assetKinds: ['image', 'live2d'] }), transition('transition')]],
  ['say', '对白与旁白', 'wait', true, 'M05', [o('speaker', [e('kind', ['character', 'narrator'], req), r('id', 'character')], req), s('text', req), s('textLocale', { nullable: true, default: null }), b('keepName', { default: true }), b('append', { default: false }), target('target', false), r('voice', 'asset', { nullable: true, default: null, assetKinds: ['audio'] }), o('voiceByLocale', [], { default: {} }), volume('voiceVolume'), n('fontSize', { nullable: true, default: null, exclusiveMin: 0 }), e('avatarMode', ['auto', 'image', 'hidden']), r('avatar', 'asset', { nullable: true, assetKinds: ['image'] })]],
  ['changeBg', '背景', 'continue', false, 'M06', [e('op', ['show', 'clear'], { default: 'show' }), r('objectId', 'object'), r('assetId', 'asset', { assetKinds: ['image', 'video'] }), e('fit', ['cover', 'contain', 'native'], { default: 'cover' }), n('positionX', { default: 0.5, min: 0, max: 1 }), n('positionY', { default: 0.5, min: 0, max: 1 }), effect(), o('transition', [transition('enter'), transition('exit')]), r('galleryId', 'gallery'), r('differenceId', 'galleryDifference')]],
  ['changeFigure', '立绘', 'continue', false, 'M06', [e('op', ['show', 'replace', 'exit'], { default: 'show' }), r('objectId', 'object', req), r('characterId', 'character'), r('assetId', 'asset', { assetKinds: ['image', 'live2d'] }), e('station', ['left', 'leftQuarter', 'leftThird', 'center', 'rightThird', 'rightQuarter', 'right'], { default: 'center' }), i('z', { default: 0 }), effect(), o('portrait', [b('enabled', { default: false }), o('crop', [n('x', { default: .25, min: 0, max: 1 }), n('y', { default: 0, min: 0, max: 1 }), n('width', { default: .5, exclusiveMin: 0, max: 1 }), n('height', { default: .35, exclusiveMin: 0, max: 1 })])], { description: '从当前立绘取景的说话头像；坐标为原始角色画布的比例，与舞台位置无关。' }), b('reset', { default: false }), o('transition', [transition('enter'), transition('exit')]), model(), o('framing', [e('mode', ['full', 'upper', 'custom'], req), n('scale', req), n('offsetX', req), n('offsetY', req), o('crop', [n('x', req), n('y', req), n('width', req), n('height', req)], { nullable: true, default: null })])]],
  ['bgm', '背景音乐', 'continue', false, 'M06', [e('op', ['play', 'stop'], { default: 'play' }), r('assetId', 'asset', { assetKinds: ['audio'] }), volume(), ...loopAudio.slice(0, 1), b('loop', { default: true }), ...loopAudio.slice(1), r('galleryId', 'gallery')]],
  ['video', '全屏视频', 'wait', false, 'M06', [r('assetId', 'asset', { ...req, assetKinds: ['video'] }), volume(), n('skipFadeMs', { default: 300, min: 0, unit: 'ms' }), r('galleryId', 'gallery')]],
  ['playEffect', '音效与环境音', 'continue', false, 'M06', [e('op', ['play', 'stop'], { default: 'play' }), r('soundId', 'effect'), b('all', { default: false }), r('assetId', 'asset', { assetKinds: ['audio'] }), volume(), b('loop', { default: false }), ...loopAudio]],
  ['setAnimation', '演出预设', 'wait', true, 'M06', [field('animationId', 'ref'), r('presetId', 'asset', { ...req, assetKinds: ['animation'] }), target('target', true, true), o('parameters', [], { default: {} }), n('durationMs', { min: 0, unit: 'ms' }), easing('easing', { default: null }), b('keepFinal', { default: true }), b('completeDefaults', { default: false }), b('cross', { default: false }), b('parallel', { default: false })]],
  ['setComplexAnimation', '复合动画', 'wait', true, 'M06', [field('animationId', 'ref'), target('target', true, true), r('resourceId', 'asset', { assetKinds: ['animation'] }), a('segments', segment()), o('animation', []), o('parameters', [], { default: {} }), b('inherit', { default: true }), i('repeat', { default: 1, min: 1 }), b('loop', { default: false }), b('keepFinal', { default: true }), b('cross', { default: false }), b('parallel', { default: false })]],
  ['stopAnimation', '停止动画实例', 'continue', false, 'M06', [field('animationId', 'ref', req), target('target', true, true)]],
  ['setTransform', '变换', 'wait', true, 'M06', [target('target', true, true), effect('effects', req), n('durationMs', { default: 0, min: 0, unit: 'ms' }), easing(), b('inherit', { default: true }), b('cross', { default: false }), b('parallel', { default: false })]],
  ['setTempAnimation', '临时动画', 'wait', true, 'M06', [target('target', true, true), a('segments', segment(), { ...req, minItems: 1 }), b('cross', { default: false }), b('parallel', { default: false }), b('keepFinal', { default: true }), b('writeDefault', { default: false }), b('ignoreDefault', { default: false })]],
  ['setTransition', '对象切换', 'continue', false, 'M06', [target(), transition('enter'), transition('exit')]],
  ['pixi', '舞台特效', 'continue', false, 'M06', [r('effectId', 'effect', req), e('type', ['cherryBlossoms', 'petals', 'snow', 'rain', 'oldFilm', 'dot', 'reflection', 'glitch', 'rgbSplit', 'godray'], req), o('target', [e('kind', ['stage', 'object', 'station'], { default: 'stage' }), r('id', 'object'), e('station', ['left', 'leftQuarter', 'leftThird', 'center', 'rightThird', 'rightQuarter', 'right'])], { default: { kind: 'stage' } }), b('enabled', { default: true }), n('density', { default: 100, min: 0 }), n('speed', { default: 100, min: 0 }), n('directionDeg', { default: 90 }), r('resourceId', 'asset'), o('parameters', [], { default: {} })]],
  ['pixiInit', '清除舞台特效', 'continue', false, 'M06', [e('scope', ['instance', 'target', 'all'], { default: 'instance' }), r('effectId', 'effect'), target('target', false, true), n('fadeOutMs', { default: 0, min: 0, unit: 'ms' })]],
  ['intro', '序幕文字', 'wait', true, 'M07', [e('op', ['show', 'clear'], { default: 'show' }), a('paragraphs', s('paragraph'), { ...req, minItems: 1 }), s('backgroundColor', { default: '#000000' }), r('backgroundImage', 'asset', { nullable: true, default: null, assetKinds: ['image'] }), s('textColor', { default: '#ffffff' }), n('fontSize', { nullable: true, default: null, exclusiveMin: 0 }), e('animation', ['fade', 'slide', 'typewriter', 'pixel', 'reveal'], { default: 'fade' }), n('durationMs', { default: 300, min: 0, unit: 'ms' }), n('holdMs', { default: 1500, min: 0, unit: 'ms' }), b('manual', { default: true }), b('keepFinal', { default: false })]],
  ['miniAvatar', '头像', 'continue', false, 'M07', [e('op', ['set', 'clear', 'auto'], { default: 'set' }), r('assetId', 'asset', { assetKinds: ['image'] }), r('characterId', 'character', { nullable: true, default: null })]],
  ['setTextbox', '文本框', 'continue', false, 'M07', [b('visible', { default: true }), n('durationMs', { default: 0, min: 0, unit: 'ms' })]],
  ['filmMode', '电影遮幅', 'continue', false, 'M07', [b('enabled', { default: true }), n('top', { default: 0.1, min: 0, max: 0.4 }), n('bottom', { default: 0.1, min: 0, max: 0.4 }), n('durationMs', { default: 300, min: 0, unit: 'ms' })]],
  ['callScene', '调用场景', 'continue', false, 'M05', [r('sceneId', 'scene', req), r('labelId', 'label', { nullable: true, default: null }), o('parameters', [], { default: {} }), o('receiver', [e('scope', ['progress', 'local'], req), r('variableId', 'variable', req)], { nullable: true, default: null })]],
  ['changeScene', '切换场景', 'continue', false, 'M05', [r('sceneId', 'scene', req), r('labelId', 'label', { nullable: true, default: null })]],
  ['choose', '选择', 'wait', false, 'M05', [a('options', o('option', [r('id', 'statement', req), s('text', req), targetRef('target', req), x('visible'), x('enabled'), s('lockedReason', { default: '' })]), { ...req, minItems: 1 }), r('previewDefault', 'statement', { nullable: true, default: null })]],
  ['label', '标签', 'continue', false, 'M05', [r('labelId', 'label', req), s('name', req)]],
  ['jumpLabel', '跳转标签', 'continue', false, 'M05', [r('labelId', 'label', req)]],
  ['return', '返回调用处', 'continue', false, 'M05', [x('value')]],
  ['unlockCg', '解锁CG', 'continue', false, 'M05', [r('entryId', 'gallery', req), a('differenceIds', r('differenceId', 'galleryDifference', req), { ...req, minItems: 1 })]],
  ['unlockVideo', '解锁影片', 'continue', false, 'M05', [r('entryId', 'gallery', req)]],
  ['unlockBgm', '解锁音乐', 'continue', false, 'M05', [r('entryId', 'gallery', req)]],
  ['getUserInput', '玩家输入', 'wait', false, 'M05', [r('variableId', 'variable', req), s('prompt', { default: '请输入' }), s('defaultText', { default: '' }), b('allowEmpty', { default: false }), i('maxLength', { default: 100, min: 1, max: 1000 }), s('pattern', { nullable: true, default: null }), x('validation', { nullable: true, default: null }), s('errorText', { default: '请检查输入' }), targetRef('cancelTarget', { nullable: true, default: null })]],
  ['setVar', '变量写入', 'continue', false, 'M05', [r('variableId', 'variable', req), e('op', ['assign', 'add', 'subtract', 'multiply', 'divide'], { default: 'assign' }), x('value', req)]],
  ['showVars', '变量观察', 'continue', false, 'M05', [e('scope', ['selected', 'progress', 'allPublic'], { default: 'selected' }), a('variableIds', r('variableId', 'variable'), { default: [] }), b('visible', { default: true })]],
  ['wait', '等待', 'wait', true, 'M05', [n('durationMs', { default: 1000, min: 0, unit: 'ms' })]],
  ['applyStyle', '页面样式', 'continue', false, 'M07', [e('op', ['apply', 'reset'], { default: 'apply' }), o('target', [e('kind', ['page', 'component'], req), r('id', 'page', req)], req), r('styleId', 'style')]],
  ['callSteam', 'Steam成就', 'continue', false, 'org.galcraft.steam', [s('achievement', req), e('unavailable', ['skip', 'required'], { default: 'skip' })]],
  ['end', '结束剧情', 'continue', false, 'M05', [s('endingId', { nullable: true, default: null }), o('target', [e('kind', ['title', 'page', 'scene'], { default: 'title' }), r('pageId', 'page'), r('sceneId', 'scene'), r('labelId', 'label', { nullable: true, default: null })], { default: { kind: 'title' } }), n('durationMs', { default: 300, min: 0, unit: 'ms' })]],
  ['comment', '注释卡', 'continue', false, 'M03', [s('text', { default: '' })]],
];

const common: FieldSpec[] = [x('when'), b('continue'), b('skippable'), s('note', { default: '' })];
for (const row of rows) if (['changeBg', 'changeFigure', 'changeIllustration', 'changeIllustrationDiff'].includes(row[0]))
  row[5].push(o('playback', [e('mode', ['loop', 'once'], { default: 'loop' }), b('wait', { default: false })]));
rows.find(row => row[0] === 'pixi')![5].push(e('layer', ['back', 'front'], { default: 'front' }));
rows.find(row => row[0] === 'changeFigure')![5].push(b('difference', { description: '绑定角色共同差分；立绘与阅读头像共用角色当前差分。' }), r('variantId','variant'));
rows.find(row => row[0] === 'characterDifference')![5].find(field=>field.path==='transition')!.default=null;
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}
export const CoreCommandSpecs: readonly CommandSpec[] = freeze(rows.map(([key, name, continuation, skippable, executor, fields]) => ({
  key, version: '0.1.0', name, description: key === 'return' ? '结束被调用的场景，返回调用处并继续调用后的语句。' : key === 'end' ? '结束当前剧情流程，前往标题页、指定页面或新的顶层场景。' : name, icon: key, category: executor, keywords: [key, name], fields: key === 'comment' ? fields : [...fields, ...common],
  continuation, skippable, executor, targetCapabilities: [], constraints: [],
})));
const englishNames: Record<string,string>={characterDifference:'Character shared variation',readingMode:'Reading mode',clearPage:'Clear the reading page',changeIllustration:'Stage illustration',changeIllustrationDiff:'Illustration variation',say:'Dialogue and narration',changeBg:'Scene background',changeFigure:'Character figure',bgm:'Background music',video:'Fullscreen video',playEffect:'Sound effect and ambience',setAnimation:'Animation preset',setComplexAnimation:'Composite animation',stopAnimation:'Stop an animation instance',setTransform:'Transform a stage target',setTempAnimation:'Temporary animation',setTransition:'Object transition',pixi:'Stage effect',pixiInit:'Clear stage effects',intro:'Intro text',miniAvatar:'Speaking portrait',setTextbox:'Reading panel',filmMode:'Letterbox',callScene:'Call a scene',changeScene:'Change scene',choose:'Choice',label:'Label',jumpLabel:'Jump to label',return:'Return to caller',unlockCg:'Unlock gallery image',unlockVideo:'Unlock gallery video',unlockBgm:'Unlock gallery music',getUserInput:'Player text input',setVar:'Write a variable',showVars:'Variable inspection',wait:'Wait',applyStyle:'Page style',callSteam:'Steam achievement',end:'End the story',comment:'Comment'};
const englishField=(field:FieldSpec):FieldSpec=>({...field,description:field.path==='portrait'?'Speaking portrait cropped from the original character canvas; coordinates are ratios independent of stage position.':field.path==='difference'?'Bind the shared character variation used by both the figure and reading portrait.':field.description,...(field.children?{children:field.children.map(englishField)}:{}),...(field.item?{item:englishField(field.item)}:{})});
/** Public English system metadata; authored defaults and the editor locale remain intact. */
export const CoreCommandSpecsEnglish:readonly CommandSpec[]=freeze(CoreCommandSpecs.map(spec=>({...spec,name:englishNames[spec.key]!,description:spec.key==='return'?'Finish the called scene and continue after the calling statement.':spec.key==='end'?'Finish the current story flow and open the title, a page or a new top-level scene.':englishNames[spec.key]!,keywords:[spec.key,englishNames[spec.key]!],fields:spec.fields.map(englishField)})));
export function createCommandRegistry(engineVersion: Version, plugins: readonly CommandSpec[] = []): ReadonlyMap<string, CommandSpec> {
  const result = new Map<string, CommandSpec>();
  for (const spec of CoreCommandSpecs) result.set(spec.key, freeze({ ...spec, version: engineVersion }));
  for (const spec of plugins) {
    if (result.has(spec.key)) throw new Error(`CONTRIBUTION_CONFLICT ${spec.key}`);
    result.set(spec.key, freeze(structuredClone(spec)));
  }
  return result;
}
export function commandSpec(key: string, registry: ReadonlyMap<string, CommandSpec>): CommandSpec | undefined { return registry.get(key); }
export function fieldSpec(spec: CommandSpec, path: string): FieldSpec | undefined {
  let fields = spec.fields;
  let found: FieldSpec | undefined;
  for (const part of path.split('.')) {
    if (/^\d+$/.test(part) && found?.item) { found = found.item; fields = found.children ?? []; continue; }
    found = fields.find(field => field.path === part);
    if (!found) return undefined;
    fields = found.children ?? (found.item ? [found.item] : []);
  }
  return found;
}

/** Public discovery uses the executable models for complex values and open parameter maps. */
export function commandInputSchema(spec: CommandSpec): Json {
  const { $defs, $schema: _version, ...expression } = z.toJSONSchema(ExprSchema, { io: 'input' });
  const schemaFor = (field: FieldSpec): Record<string, unknown> => {
    let schema: Record<string, unknown> = field.type === 'object' ? object(field.children ?? []) : field.type === 'array'
      ? { type: 'array', items: field.item ? schemaFor(field.item) : {}, ...(field.minItems !== undefined ? { minItems: field.minItems } : {}) }
      : field.type === 'expression' ? expression : field.type === 'enum' ? { enum: field.enumValues ?? [] }
      : { type: field.type === 'ref' ? 'string' : field.type };
    if (field.path === 'animation' && field.type === 'object') schema = z.toJSONSchema(NativeAnimationSchema, { io: 'input' });
    if (field.path === 'parameters' && ['setAnimation', 'setComplexAnimation'].includes(spec.key))
      schema = { type: 'object', additionalProperties: { anyOf: [{type:'number'},{type:'string'},{type:'boolean'}] }, description: 'Values keyed by parameter names declared in the selected animation resource. Parameter leaves use {parameter:"name"}.' };
    if (field.path === 'parameters' && spec.key === 'pixi') schema = { type: 'object', properties: {
      columns:{type:'integer',minimum:1},size:{type:'number',exclusiveMinimum:0},density:{type:'number',minimum:0},speed:{type:'number',minimum:0},directionDeg:{type:'number'},z:{type:'number'},
    }, additionalProperties: true, description: 'Weather atlas columns, particle size and motion. Filter-specific parameters remain owned by the selected effect.' };
    if (field.path === 'effects') schema = z.toJSONSchema(EffectPatchSchema, { io: 'input' });
    if (field.path === 'voiceByLocale') schema = { type: 'object', additionalProperties: {type:'string'}, description:'Audio asset IDs keyed by dialogue language.' };
    for (const [from,to] of [['min','minimum'],['max','maximum'],['exclusiveMin','exclusiveMinimum']] as const) if(field[from]!==undefined)schema[to]=field[from];
    if (field.nullable) schema = {anyOf:[schema,{type:'null'}]};
    return {...schema, description:schema.description??field.description,...(field.default!==null||field.nullable?{default:field.default}:{})};
  };
  const object = (fields: readonly FieldSpec[]): Record<string, unknown> => ({type:'object',properties:Object.fromEntries(fields.map(field=>[field.path,schemaFor(field)])),required:fields.filter(field=>field.required).map(field=>field.path),additionalProperties:false});
  return {...object(spec.fields),...($defs?{$defs}:{})} as Json;
}
