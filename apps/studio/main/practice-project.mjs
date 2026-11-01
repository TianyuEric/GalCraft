import { createId, reserveIds, StageWeatherPresets, StartupSequenceSchema, ReleaseIdentitySchema } from '@galcraft/contracts';
import { createAnimationPreset } from '@galcraft/stage';
import { presentationArgs, presentationValue } from '@galcraft/dsl';

import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { CharacterSchema } from '@galcraft/contracts';
import { practiceTheme, configurePracticeVideoError } from './practice-theme.mjs';
import { preparePracticeSources, practiceExpansion, attachPracticeSourceNotices } from './practice-expansion.mjs';
import { practiceMediaFiles } from '../../../tools/practice-distribution.mjs';

const unwrap = result => { if (!result.ok) throw new Error(result.error.message); return result.value; };
const envelope = (documentId, data) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data }, null, 2) + '\n';
const command = (opcode, args) => `${opcode} ${JSON.stringify(presentationArgs(opcode, args))} @${createId()};`;
const script = lines => lines.join('\n') + '\n';
const cast = [
  { key: 'deepseek', name: '澜汐', station: 'leftQuarter', description: 'DeepSeek娘，成年鲸尾姑娘。可靠理性，总把心事藏在周密安排里。', ending: 'spring-whale', route: '澜汐 · 留给明天的灯' },
  { key: 'chatgpt', name: '绮白', station: 'center', description: 'ChatGPT娘，成年银发龙族。温柔而富有想象力，擅长把旧物变成新的约定。', ending: 'spring-dragon', route: '绮白 · 春天的下一幕' },
  { key: 'claude', name: '绯书', station: 'rightQuarter', description: 'Claude娘，成年橙发放映员。认真记录街区故事，也在学习留下自己的声音。', ending: 'spring-letter', route: '绯书 · 故事还没有完' },
];
const expressionNames = { neutral: '日常', smile: '微笑', serious: '认真', surprised: '惊讶', shy: '害羞', sad: '低落' };
const defaults = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, opacity: 1, blur: 0,
  brightness: 1, contrast: 1, saturation: 1, gamma: 1, rgb: [255, 255, 255],
  bloom: { intensity: 0, brightness: 1, blur: 0, threshold: 0 },
  bevel: { opacity: 0, thickness: 0, rotationDeg: 0, softness: 0, rgb: [255, 255, 255] },
  filters: { oldFilm: false, dot: false, reflection: false, glitch: false, rgbSplit: false, godray: false }, blend: 'normal', z: 0 };

/** Clean an explicitly selected saved sample through M02 edits and M04 removal.
 * Export and restore its saved backup to obtain an independent physical closure.
 */
export async function cleanPracticeVoiceSources(documents, assets, directory = join(import.meta.dirname, '../resources/practice')) {
  const session = documents.currentSession;
  if (!session) throw new Error('请先打开要整改的样例作品。');
  const characterPatches = [], expected = [];
  for (const document of session.documents.values()) {
    const path = Object.keys(document.files).find(path => path.startsWith('characters/') && path.endsWith('.json'));
    if (!path) continue;
    const before = JSON.parse(document.files[path]).data;
    if (!Object.keys(before.voicePresets ?? {}).length) continue;
    characterPatches.push({ kind: 'json', documentId: document.documentId, changes: [{ path: '/data/voicePresets', op: 'set', before: before.voicePresets, after: {} }] });
    expected.push({ ref: { kind: 'document', id: document.documentId }, revision: document.revision });
  }
  if (characterPatches.length) {
    const plan = unwrap(session.planEdit({ label: '清除样例语音制作预设', origin: 'batch', expected, patches: characterPatches, preparedAssets: [], requiredRefs: [] }));
    unwrap(session.applyEdit(plan.planId, expected));
  }
  const indexDocument = () => [...session.documents.values()].find(document => document.files['assets/index.json']);
  const index = JSON.parse(indexDocument().files['assets/index.json']).data;
  const referenceNames = new Set(['deepseek-ja-reference.ogg', 'chatgpt-ja-reference.ogg', 'claude-ja-reference.ogg', 'anj_207_0038.ogg', 'ena_002_0078.ogg', 'rir_000_0021.ogg']);
  const oldReferenceIds = new Set(['EptGxr', '5VaEPt', 'v4zYRv', 'BDIJHH']);
  const removed = index.assets.filter(asset => referenceNames.has(asset.name) || referenceNames.has(asset.sourceName) || oldReferenceIds.has(asset.id));
  if (removed.length) unwrap(await assets.remove(removed.map(asset => asset.id)));
  const document = indexDocument(), before = JSON.parse(document.files['assets/index.json']).data, after = structuredClone(before);
  const productionAttachments = after.assets.flatMap(asset => asset.variants.flatMap(variant => variant.files.filter(file => file.path === 'VOICE-PRODUCTION.json'))).length;
  await attachPracticeSourceNotices(after, documents.currentRoot, directory);
  const versions = [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }];
  const edit = unwrap(session.planEdit({ label: '采用样例成品来源摘要', origin: 'batch', expected: versions, preparedAssets: [], requiredRefs: [],
    patches: [{ kind: 'json', documentId: document.documentId, changes: [{ path: '/data', op: 'set', before, after }] }] }));
  unwrap(session.applyEdit(edit.planId, versions));
  unwrap(await session.save(unwrap(session.planSave({ kind: 'all' })).planId));
  return { removedAssets: removed.map(({ id, name, sourceName }) => ({ id, name, sourceName })), clearedCharacterPresets: characterPatches.length, replacedProductionAttachments: productionAttachments };
}

export async function populatePracticeProject(documents, assets, directory = join(import.meta.dirname, '../resources/practice'), plugins) {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  const avatarCrops = JSON.parse(await readFile(join(directory, 'sources/images/avatar-crops.json'), 'utf8'));
  const frozen = JSON.parse(await readFile(join(directory, manifest.voiceSources, 'lines.json'), 'utf8'));
  const filenames = practiceMediaFiles(manifest);
  const imported = unwrap(await assets.import(filenames.map(name => join(directory, name))));
  if (imported.failed.length) throw new Error(`示例素材导入失败：${imported.failed.map(item => item.issue.message).join('；')}`);
  const namedAnimations = new Map();
  for (const [preset, name, parameters] of [['sway', '背景轻摇', { durationMs: 6000, amplitude: 14, cycles: 1 }], ['breath', '角色呼吸', { durationMs: 2600 }]]) {
    namedAnimations.set(preset, unwrap(await assets.saveAnimation({ name, animation: createAnimationPreset(preset, parameters).animation })));
  }
  const media = new Map(imported.succeeded.map(asset => [asset.name, asset.id]));
  const asset = filename => { const id = media.get(basename(filename)); if (!id) throw new Error(`示例素材未导入：${filename}`); return id; };
  const session = documents.currentSession;
  await preparePracticeSources(documents, plugins);
  const views = [...session.documents.values()];
  const projectDocument = views.find(doc => doc.files['project.json']);
  const project = JSON.parse(projectDocument.files['project.json']).data;
  const indexDocument = views.find(doc => doc.files['assets/index.json']);
  const variants = new Map(JSON.parse(indexDocument.files['assets/index.json']).data.assets.map(value => [value.id, value.activeVariantId]));
  reserveIds(views);
  const openingId = project.entry.sceneId, preparationId = createId(), screeningId = createId(), afterChapterId = createId();
  const playerId = createId(), playerNameId = createId();
  const crop = key => { const source = avatarCrops[key]; return presentationValue('changeFigure', 'portrait.crop', { x: source.x / source.sourceWidth, y: source.y / source.sourceHeight,
    width: source.size / source.sourceWidth, height: source.size / source.sourceHeight }); };
  const characters = cast.map(person => ({ ...person, id: createId(), objectId: createId(), sceneId: createId(), afterSceneId: createId(), afterId: createId(), flagId: createId(),
    differences: Object.fromEntries(Object.entries(manifest.figures[person.key]).map(([expression, filename]) => [expression,
      { id: createId(), name: expressionNames[expression], figure: { assetId: asset(filename), variantId: variants.get(asset(filename)) },
        avatar: { kind: 'crop', crop: crop(person.key) } }])) }));
  const expansion = await practiceExpansion({ documents, plugins, directory, manifest, asset, characters, project, command });
  const narration = text => command('say', { speaker: { kind: 'narrator' }, text });
  const playerSay = text => command('say', { speaker: { kind: 'character', id: playerId }, text, avatarMode: 'hidden' });
  const say = (person, number, text) => {
    const line = frozen.lines.find(line => line.key === `${person.key}-ja-${String(number).padStart(2, '0')}`);
    if (!line || text && text !== line.zh) throw new Error(`日语样例对白映射与冻结清单不一致：${person.key}/${number}`);
    return command('say', { speaker: { kind: 'character', id: person.id }, text: line.zh,
      textLocale: 'zh-CN', avatarMode: 'auto', voiceByLocale: { ja: asset(manifest.voices[person.key][number - 1]) }, voiceVolume: 90 });
  };
  const fade = { preset: 'fade', resourceId: null, durationMs: 500, easing: { family: 'linear', direction: 'in' }, direction: 'left' };
  const backgroundId = createId();
  const background = filename => { const gallery = expansion.gallery.get(filename); return command('changeBg', { objectId: backgroundId, op: 'show', assetId: asset(filename), galleryId: gallery.id, differenceId: gallery.differences[0].id, fit: 'cover', transition: { enter: fade, exit: fade } }); };
  const bg = key => background(manifest.backgrounds[key]);
  const music = index => command('bgm', { op: 'play', assetId: asset(manifest.music[index]), galleryId: expansion.gallery.get(manifest.music[index]).id, volume: 65, loop: true, fadeInMs: 600, fadeOutMs: 800 });
  const difference = (person, expression) => command('characterDifference', { characterId: person.id, differenceId: person.differences[expression].id });
  const show = (person, expression, solo = false) => script([difference(person, expression), command('changeFigure', { op: 'show', objectId: person.objectId,
    transition: {enter:{preset:'fade',durationMs:200,resourceId:null,easing:{family:'cubic',direction:'out'},direction:'left'},exit:{preset:'fade',durationMs:160,resourceId:null,easing:{family:'cubic',direction:'in'},direction:'left'}},
    characterId: person.id, difference: true, station: solo ? 'center' : person.station,
    portrait: { enabled: true, crop: crop(person.key) },
    framing: { mode: 'upper', scale: project.canvas.height * .95 / (1536 * .6), offsetX: 0, offsetY: project.canvas.height * .6333333333, crop: null } })]);
  const exit = person => command('changeFigure', { op: 'exit', objectId: person.objectId });
  const weatherIds = Object.fromEntries(['petals', 'rain', 'snow'].map(key => [key, createId()]));
  const decoration = key => { const type = key === 'petals' ? 'cherryBlossoms' : key, preset = StageWeatherPresets[type];
    return command('pixi', { effectId: weatherIds[key], type, target: { kind: 'stage' }, enabled: true, resourceId: asset(manifest.textures[key]), density: preset.density, speed: preset.speed, directionDeg: preset.directionDeg, parameters: preset.parameters }); };
  const clearDecoration = key => command('pixiInit', { scope: 'instance', effectId: weatherIds[key] });
  const video = key => command('video', { assetId: asset(manifest.videos[key]), galleryId: expansion.gallery.get(manifest.videos[key]).id, volume: 45, skippable: true, skipFadeMs: 250 });
  const target = person => ({ kind: 'object', id: person.objectId });
  const animate = (id, target, preset, parameters = {}) => { const applied = createAnimationPreset(preset, parameters), named = namedAnimations.get(preset); return command('setComplexAnimation', { animationId: id, target, ...(named ? { resourceId: named.assetId } : { animation: applied.animation }), keepFinal: applied.keepFinal, loop: parameters.loop ?? applied.loop, cross: true }); };
  const stop = (animationId, target) => command('stopAnimation', { animationId, target });
  const backgroundAnimationId = createId(), breathId = createId(), moveId = createId(), rainSoundId = createId(), bellSoundId = createId();
  const wait = durationMs => command('wait', { durationMs });
  const [deepseek, chatgpt, claude] = characters;

  const opening = [video('opening'), bg('street'), music(0), decoration('petals'), animate(backgroundAnimationId, { kind: 'object', id: backgroundId }, 'sway', { durationMs: 6000, amplitude: 14, cycles: 1, loop: true }),
    narration('我回到旧城时，春风正把花瓣吹进巷口。春灯放映馆门前贴着一张通知：明日起，停止营业。'),
    narration('二十七岁这一年，我才发现，有些从小以为会一直亮着的灯，也会等不到下一个春天。'),
    stop(backgroundAnimationId, { kind: 'object', id: backgroundId }), show(deepseek, 'neutral'), animate(breathId, target(deepseek), 'breath', { durationMs: 2600, loop: false }), say(deepseek, 1, ''),
    show(deepseek, 'smile'), say(deepseek, 2, '先别急着难过。要是你愿意，我们可以给它安排一次像样的告别。'),
    show(chatgpt, 'neutral'), say(chatgpt, 1),
    show(chatgpt, 'smile'), say(chatgpt, 2, '龙族也不总是守着宝藏。我更喜欢把藏起来的光，分一点给路过的人。'),
    show(claude, 'neutral'), say(claude, 1),
    show(claude, 'smile'), say(claude, 2, '他们都在这条街上生活过。我想让今晚的银幕，记得他们的名字。'),
    narration('澜汐收起计算表，绮白把翅膀拢到肩后，绯书抱紧了胶片盒。三个人都在看我，像等一句迟到了许多年的回答。'),
    say(deepseek, 3, '场地和电源交给我。你只需要回答，要不要一起留下来？'),
    say(chatgpt, 3, '我已经想好灯笼的颜色了。你来的话，正好有人帮我把最高的一盏挂起来。'),
    say(claude, 3, '那么，今晚的故事也把你写进去。你愿意吗？'),
    playerSay('愿意。最高的那盏灯交给我，今晚也把我写进去吧。'),
    narration({ segments: [{ text: '我接过最旧的那只灯笼，试着把它举过头顶。' }, { text: '今晚，让春天亮起来。', color: '#e8ab65', bold: true, ruby: '春灯的约定' }] }),
    clearDecoration('petals'), command('changeScene', { sceneId: preparationId, labelId: null })];
  const preparation = [bg('shop'), music(1),
    narration('店前的空地很快堆满椅子和线轴。隔壁的店主送来延长线，卖面包的阿姨答应晚一点关门。'),
    show(deepseek, 'serious'), say(deepseek, 4, '这里不能挡住人行道。电缆从檐下走，椅子再往里收半米，大家进出才安全。'),
    show(chatgpt, 'serious'), say(chatgpt, 4, '旧幕布还有一块破角。让我补成一颗星星吧，正好给我们的天空添个位置。'),
    show(claude, 'serious'), say(claude, 4, '胶片顺序还缺最后一段。我去找当年拍下第一场放映的人，看看他肯不肯回来。'),
    playerSay('我来搬椅子。通道空出来以后，再帮你们挂灯。'),
    decoration('rain'), narration('刚挂起第一排灯，雨就追着风落下来。我抓住幕布的一角，和她们一起把它往檐下收，街那头的灯也跟着暗了一下。'),
    show(deepseek, 'surprised'), say(deepseek, 5, '备用电源不在馆里。没关系，我知道哪里还能借到，我们不能让这一阵雨替今晚做决定。'),
    show(chatgpt, 'surprised'), say(chatgpt, 5, '哎，星星还没缝好呢。先把它带进檐下，等雨停了再挂上去。'),
    show(claude, 'surprised'), say(claude, 5, '那位老先生去了车站，可能是今晚最后一班车。我要赶在他离开前把邀请送到。'),
    playerSay('胶片先放到我这边，檐下还干着。幕布我来按住，别让星星淋湿了。'),
    music(1), command('playEffect', { op: 'play', soundId: rainSoundId, assetId: asset(manifest.effects.rain), volume: 38, loop: true, fadeInMs: 300 }),
    command('playEffect', { op: 'play', soundId: bellSoundId, assetId: asset(manifest.effects.bell), volume: 60, loop: false }), wait(1500),
    command('playEffect', { op: 'stop', soundId: rainSoundId, fadeOutMs: 350 }), wait(6000),
    clearDecoration('rain'), bg('sky'), narration('雨声停了，檐下的铃还在轻响。夕阳从云缝里照出来，而距离开场，只剩最后一个小时。'),
    bg('shop'), ...characters.map((person, i) => command('setTransform', { target: target(person), effects: { x: i === 0 ? 290 : i === 2 ? -290 : 0, z: i }, durationMs: 400, cross: true })),
    narration('我们挤在檐下，护住最后一卷胶片。绯书从身后探出头，又抱着盒子绕到前面。'), command('setTransform', { target: target(claude), effects: { z: 5 }, durationMs: 0 }),
    animate(moveId, target(chatgpt), 'moveBy', { durationMs: 500, amplitude: 150 }), wait(200),
    difference(chatgpt, 'smile'), wait(300),
    narration('绮白一边挪开椅子，一边笑了起来。大家终于在狭窄的檐下找到了各自的位置。'),
    ...characters.map(person => command('setTransform', { target: target(person), effects: { x: 0, z: 0 }, durationMs: 400, cross: true })),
    show(deepseek, 'serious'), say(deepseek, 6, '我去借电源。有个人帮忙抬回来，事情会快很多。'),
    show(chatgpt, 'serious'), say(chatgpt, 6, '我得把散开的灯笼重新串起来。和我走一段吧，我想听听你记得的春灯。'),
    show(claude, 'serious'), say(claude, 6, '我去把最后一位观众找回来。你愿意和我一起去吗？'),
    narration('三条路都通向今晚的银幕。我伸出手，接住其中一份邀请。'),
    command('choose', { options: characters.map(person => ({ id: createId(),
      text: person.key === 'deepseek' ? '和澜汐去借回一束光' : person.key === 'chatgpt' ? '和绮白重新挂起星星' : '和绯书去寻找最后一位观众',
      target: { sceneId: person.sceneId, labelId: null }, lockedReason: '' })), previewDefault: null })];
  const routeTexts = {
    deepseek: ['我小时候总坐在最后一排。那里够暗，就算看到分别的地方，也不用担心被人发现我哭了。',
      '今天我想坐前面一点。电源拿到了，接下来……我们一起把它搬回去吧。',
      '我原本以为，安排好每件事，就能让告别不那么难。现在看来，有人陪着更有用。',
      '你明天还会经过这条街吗？我想把剩下的灯笼收好，也许明年还用得上。'],
    chatgpt: ['大家都说龙族有很长很长的时间。我却还是舍不得这家小放映馆，它让我知道一百分钟也能装下整个世界。',
      '所以我想把它的星星带走。以后走到哪里，都能给那里的夜晚缝上一点光。',
      '那颗歪歪的星星，你看见了吗？是我们一起补上的。我觉得它比完美的那颗更漂亮。',
      '下次我想去更远一点的地方。你不用现在回答，只要别忘了，我给你留着同行的位置。'],
    claude: ['我记录了那么多人的故事，却把自己的那一页一直空着。好像不写，就不会有结束。',
      '老先生答应回来了。这次我也想试一试，把“我们”写在第一行。',
      '刚才大家笑的时候，我没有举起相机。我想，有些时刻可以先好好活在里面。',
      '这本册子的最后一页还没写。你愿意明天陪我再走一遍旧街，把遗漏的名字补上吗？'],
  };
  const routeNarration = {
    deepseek: ['我们穿过渐渐热闹起来的街道，从修理铺借到一台备用电源。澜汐把重量较重的那一端留给自己，我握住另一边，和她走成一样的步子。', '回程时，她的鲸尾轻轻碰了一下我的手腕。她没有回头，我也没有松开。', '散场后，我们一起走到车站。灯光映在澜汐的发梢上，像海面终于肯收下夜里的星星。'],
    chatgpt: ['绮白带着我绕过繁华街的小摊，把摔皱的灯笼一只只补好。她的银发沾着花瓣，龙角上还挂着一小截没剪断的金线。', '最后一颗星星不太对称。我们望着它笑了很久，才想起还有一群人在等这片小小的天空。', '散场后，绮白陪我走到车站。她把那颗补过的星星交到我手里，说它暂时需要一个不会把它弄丢的人。'],
    claude: ['我们从繁华街追到车站口。老先生已经把行李提起来，听见“春灯”两个字，却慢慢停下脚步，问今晚是不是还来得及。', '老先生把车票收进衣袋。他说，有些路可以明天再走，今晚的这场电影却只有一次。', '散场后，绯书和我把老先生送回车站。列车远去，册子还摊在她掌心，最后一页被晚风轻轻翻开。'],
  };
  const routeReplies = {
    deepseek: ['那就慢慢说。我在听，也不会先走。', '小时候我也以为，藏在暗处就能把难过藏好。今晚我们坐前面吧。', '一起搬。重的这边也分我一点，回去的路不用你一个人撑着。', '会。明天我来找你收灯笼，再一起想想下一盏灯挂在哪里。'],
    chatgpt: ['愿意。先从眼前这一盏开始，我替你扶着。', '我记得每次散场，都要等眼睛适应外面的光。那一百分钟，好像真的去过很远的地方。', '那就把它带走吧。线头我来收，下一次挂星星的时候也叫上我。', '我记住了。下一幕在哪里，我们一起去看。'],
    claude: ['好。那一页也留个位置给我。', '空白的一页也可以从今天开始写。先写下我们去把老先生请回来的这段，怎么样？', '就从“我们”开始。剩下的，今晚一起往下写。', '愿意。明天我陪你慢慢走，这次连我们自己的名字也别漏下。'],
  };
  const routes = characters.map(person => {
    const lines = routeTexts[person.key], prose = routeNarration[person.key], replies = routeReplies[person.key];
    return [person.sceneId, person.route, [bg('town'), music(2), ...characters.filter(other => other !== person).map(exit),
      command('setVar', { variableId: person.flagId, op: 'assign', value: { kind: 'literal', value: true } }),
      show(person, 'shy', true), narration(prose[0]), say(person, 7), playerSay(replies[0]),
      show(person, 'sad', true), say(person, 8, lines[0]), playerSay(replies[1]), show(person, 'smile', true), say(person, 9, lines[1]), playerSay(replies[2]),
      narration(prose[1]), command('callScene', { sceneId: screeningId, labelId: null, parameters: {}, receiver: null }),
      bg('sunset'), narration('散场后，夕光把最后一排空椅子照得很暖。我们收起灯串，沿着街道慢慢走向车站。'), bg('station'), music(4), ...characters.filter(other => other !== person).map(exit),
      show(person, 'sad', true), narration(prose[2]), say(person, 10, lines[2]),
      show(person, 'shy', true), say(person, 11, lines[3]), playerSay(replies[3]), show(person, 'smile', true), exit(person), background(manifest.cg[person.key]), say(person, 12),
      narration('车站的钟又走过一分钟。我没有急着离开。身旁的人，也没有催我。'),
      video(person.key), command('end', { endingId: person.ending, target: { kind: 'title' } })]];
  });
  const screening = [bg('shop'), music(3), ...characters.map(person => show(person, 'smile')),
    narration('开场前的最后一分钟，我又沿着电线检查了一遍。电源接好了，星星挂好了，最后一位观众也坐进了第一排。我从幕布旁望过去，旧街的椅子一张都没有空着。'),
    playerSay('都赶上了。今晚这场电影，我们一起看到最后吧。'),
    decoration('snow'), narration('银幕先亮起一个冬天。许多年前落在街上的雪，被旧胶片留了下来。前排的孩子指着画面，喊出了父母的名字，我也跟着向银幕凑近了一点。'),
    clearDecoration('snow'), decoration('petals'),
    narration('画面转到春天，檐下的灯也一盏盏亮起来。卖面包的阿姨认出了自己，老先生笑着摘下眼镜，身后的年轻人替他接住了快要掉下来的泪。'),
    narration('我看见澜汐悄悄放松了肩膀，绮白把补过的星星指给孩子们看，绯书合上册子，认真望向银幕。'),
    narration('最后一个镜头里，放映馆还是初开时的样子。散场的铃声响起，整条街却没有立刻起身。人们把掌声留得很长，像想让那扇门再开一会儿。'),
    ...expansion.filters(narration), command('readingMode', { mode: 'nvl', retainIllustrations: true }),
    narration('门明天会关上。我望着身旁被银幕照亮的脸，忽然觉得，今晚的光已经走出了那扇门。'),
    narration('我曾借它照亮回家的路。现在，也想试着把它递给别人。也许我能学着告别，带上这束光，和她们一起走进明天。'),
    command('clearPage', {}), command('readingMode', { mode: 'adv' }),
    clearDecoration('petals'), command('return', {})];

  const patches = [...practiceTheme(views, manifest, asset, variants), ...expansion.patches], requiredRefs = imported.succeeded.map(value => ({ kind: 'asset', id: value.id }));
  const openingDocument = views.find(doc => doc.files[`scenes/${openingId}/script.gal`] !== undefined);
  const scenePath = `scenes/${openingId}/scene.json`, oldScene = JSON.parse(openingDocument.files[scenePath]).data;
  patches.push({ kind: 'text', documentId: openingDocument.documentId, edits: [{ start: 0,
    end: openingDocument.files[`scenes/${openingId}/script.gal`].length,
    before: openingDocument.files[`scenes/${openingId}/script.gal`], after: script(opening) }] });
  patches.push({ kind: 'json', documentId: openingDocument.documentId, changes: [{ path: '/data/name', before: oldScene.name, after: '街道 · 春灯的最后一晚', op: 'set' }] });
  for (const [path, data] of [
    [`characters/${playerId}.json`, CharacterSchema.parse({ id: playerId, name: '玩家', narrativeRole: 'viewpoint', description: '回到旧街的二十七岁玩家，与三位朋友一起筹备春灯放映馆最后一晚的露天放映。', avatar: null,
      appearance: { referenceAssets: [], notes: '' }, groups: [], differences: [], initialDifferenceId: null, defaultEffects: structuredClone(defaults), voicePresets: {}, defaultVoicing: 'intentionalSilent', afterstory: null })],
    [`variables/${playerNameId}.json`, { id: playerNameId, name: '主角姓名', type: 'string', scope: 'progress', initial: '玩家' }],
  ]) {
    const documentId = createId();
    patches.push({ kind: 'document', documentId, op: 'create', before: null, after: { format: 'json', files: { [path]: envelope(documentId, data) } } });
  }
  for (const person of characters) {
    const figures = Object.values(manifest.figures[person.key]).map(asset), documentId = createId();
    const character = CharacterSchema.parse({ id: person.id, name: person.name, narrativeRole: 'main', description: person.description,
      personalRoute: { sceneIds: [person.sceneId], endingIds: [person.ending] },
      avatar: asset(manifest.avatars[person.key]), appearance: { referenceAssets: figures, notes: '春日常服；成年角色；日常、微笑、认真、惊讶、害羞与低落六种表情。' },
      groups: [{ id: createId(), name: '春日常服 · 站立', assetIds: figures }],
      differences: Object.values(person.differences), initialDifferenceId: person.differences.neutral.id,
      defaultEffects: structuredClone(defaults), voicePresets: {}, defaultVoicing: 'required',
      afterstory: { id: person.afterId, title: expansion.afterTitles[person.key], entry: { sceneId: person.afterSceneId, labelId: null }, unlockEndingIds: [person.ending], initialProgress: {}, lockedView: 'locked',
        presentation: { figure: { assetId: asset(manifest.figures[person.key].neutral), variantId: variants.get(asset(manifest.figures[person.key].neutral)) }, crop: { x: .1, y: 0, width: .8, height: .6 }, order: characters.indexOf(person) } } });
    patches.push({ kind: 'document', documentId, op: 'create', before: null,
      after: { format: 'json', files: { [`characters/${person.id}.json`]: envelope(documentId, character) } } });
  }
  for (const [id, name, lines] of [[preparationId, '店前 · 把星星挂起来', preparation], ...routes, [screeningId, '春灯 · 今晚的银幕', screening], ...expansion.afterstories({ bg, music, show, say, narration, playerSay })]) {
    const documentId = createId();
    patches.push({ kind: 'document', documentId, op: 'create', before: null, after: { format: 'dsl', files: {
      [`scenes/${id}/scene.json`]: envelope(documentId, { ...oldScene, id, name, chapterId: characters.some(person => person.afterSceneId === id) ? afterChapterId : oldScene.chapterId }), [`scenes/${id}/script.gal`]: script(lines) } } });
  }
  const next = structuredClone(project);
  next.player.name = { characterId: playerId, defaultName: '玩家', allowCustom: true, variableId: playerNameId, maxLength: 8, promptPolicy: 'firstAndAfterCompletion' };
  next.description = `${manifest.title}：春灯放映馆明天关闭，你与澜汐、绮白、绯书赶在今晚完成旧街的最后一场露天放映。`;
  next.chapters[0].name = manifest.title;
  next.chapters[0].sceneIds.push(preparationId, ...characters.map(person => person.sceneId), screeningId);
  next.chapters.push({ id: afterChapterId, name: '后日谈', sceneIds: characters.map(person => person.afterSceneId) });
  next.display.titleBackground = asset(manifest.home.wall); next.display.titleMusic = asset(manifest.music[0]);
  next.display.icon = asset(manifest.branding.icon);
  next.release = ReleaseIdentitySchema.parse({ executableName: 'example.exe', publisher: '', windowsSigning: 'unsigned' });
  next.display.startupSequence = StartupSequenceSchema.parse({ background: '#000000', revealMode: 'withLastClip', revealMs: 1200, clips: [
    { id: createId(), kind: 'text', name: '作品标题', text: { 'zh-CN': next.name, en: next.name, ja: next.name }, color: '#ffffff', background: 'transparent',
      fadeInMs: 0, holdMs: 600, fadeOutMs: 1200, volume: 0 },
  ] });
  next.languages = { menus: ['zh-CN', 'en', 'ja'], menuDefault: 'zh-CN', textDefault: 'zh-CN', voices: ['ja'], voiceDefault: 'ja' };
  patches.push({ kind: 'json', documentId: projectDocument.documentId, changes: [{ path: '/data', op: 'set', before: project, after: next }] });
  const expected = views.map(doc => ({ ref: { kind: 'document', id: doc.documentId }, revision: doc.revision }));
  const plan = unwrap(session.planEdit({ label: '创建春灯示例作品', origin: 'batch', expected, patches, preparedAssets: [], requiredRefs }));
  unwrap(session.applyEdit(plan.planId, expected));
  const save = unwrap(session.planSave({ kind: 'all' })); unwrap(await session.save(save.planId));
}

/** Update the distributed saved work through M04 import and M02 edit/save. */
export async function refreshPracticePresentation(documents, assets, directory = join(import.meta.dirname, '../resources/practice')) {
  const session = documents.currentSession, manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  const views = [...session.documents.values()], projectDocument = views.find(document => document.files['project.json']);
  const index = JSON.parse(views.find(document => document.files['assets/index.json']).files['assets/index.json']).data;
  let icon = index.assets.find(item => item.name === basename(manifest.branding.icon));
  if (!icon) {
    const imported = unwrap(await assets.import([join(directory, manifest.branding.icon)]));
    if (imported.failed.length) throw new Error(imported.failed[0].issue.message);
    icon = imported.succeeded[0];
  }
  const before = JSON.parse(projectDocument.files['project.json']).data, after = structuredClone(before);
  after.display.icon = icon.id;
  after.release = ReleaseIdentitySchema.parse({ executableName: 'example.exe', publisher: '', windowsSigning: 'unsigned' });
  const pageDocument = views.find(document => Object.keys(document.files).some(path => path.startsWith('ui/pages/') && JSON.parse(document.files[path]).data.key === 'videoError'));
  const path = Object.keys(pageDocument.files).find(path => path.startsWith('ui/pages/'));
  const beforePage = JSON.parse(pageDocument.files[path]).data, afterPage = configurePracticeVideoError(structuredClone(beforePage));
  const expected = [projectDocument, pageDocument].map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision }));
  const plan = unwrap(session.planEdit({ label: '更新春灯样例图标与视频恢复页', origin: 'batch', expected, preparedAssets: [], requiredRefs: [{ kind: 'asset', id: icon.id }],
    patches: [{ kind: 'json', documentId: projectDocument.documentId, changes: [{ path: '/data', op: 'set', before, after }] },
      { kind: 'json', documentId: pageDocument.documentId, changes: [{ path: '/data', op: 'set', before: beforePage, after: afterPage }] }] }));
  return unwrap(session.applyEdit(plan.planId, expected));
}
