import { createId } from '@galcraft/contracts';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PluginDocuments } from './plugin-documents.mjs';

const unwrap = result => { if (!result.ok) throw new Error(result.error.message); return result.value; };
const envelope = (documentId, data) => JSON.stringify({ schemaVersion: 1, documentId, revision: 1, data }, null, 2) + '\n';
const pluginId = 'org.galcraft.music-composition', contributionKey = `${pluginId}/score`;
export const PracticeSourceDependency = { kind: 'plugin', id: pluginId, version: '0.1.0', required: true, targets: ['web', 'windows'] };
export const PracticeSourceDependencies = [PracticeSourceDependency,
  { ...PracticeSourceDependency, id: 'org.galcraft.motion-canvas' }];

/** Carry attribution with a real imported asset so saved backups and M11 both retain it. */
export async function attachPracticeSourceNotices(index, projectRoot, directory) {
  const wall = index.assets.find(item => item.sourceName === 'memory-wall.png' || item.name === 'memory-wall.png');
  if (!wall) throw new Error('The memory-wall asset is required for the sample source notices.');
  const variant = wall.variants.find(item => item.id === wall.activeVariantId);
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  const sources = ['README.md', 'source-index.md', 'sources/textures/source-index.json', 'sources/images/home-generation.json', 'sources/voice/README.md', `${manifest.voiceSources}/production-summary.json`, `${manifest.voiceSources}/license-provenance.json`,
    `${manifest.videoSources}/README.md`, `${manifest.videoSources}/image-generation.json`, `${manifest.videoSources}/fonts/OFL.txt`, `${manifest.videoSources}/fonts/UPSTREAM.md`,
    ...(await readdir(join(directory, 'licenses'))).map(file => `licenses/${file}`),
    ...(await readdir(join(directory, 'sources/music'))).filter(file => /\.(txt|md)$/i.test(file)).map(file => `sources/music/${file}`)];
  const text = (await Promise.all(sources.map(async file => `\n\n===== ${file} =====\n${await readFile(join(directory, file), 'utf8')}`))).join('');
  const path = 'SAMPLE-MEDIA-NOTICES.txt';
  await writeFile(join(projectRoot, 'assets/files', wall.id, variant.id, path), text);
  variant.files = [...variant.files.filter(file => file.path !== path), { path, bytes: Buffer.byteLength(text), mime: 'text/plain', role: 'license' }];
  const voiceLines = JSON.parse(await readFile(join(directory, manifest.voiceSources, 'lines.json'), 'utf8'));
  const voiceSource = JSON.parse(await readFile(join(directory, manifest.voiceSources, 'production-summary.json'), 'utf8'));
  for (const filename of Object.values(manifest.voices).flat()) {
    const name = filename.split('/').at(-1), audio = index.assets.find(item => item.name === name || item.sourceName === name);
    if (!audio) throw new Error(`The adopted Japanese voice is missing: ${name}`);
    const line = voiceLines.lines.find(line => `${line.key}.mp3` === name);
    if (!line) throw new Error(`The adopted Japanese voice line is missing: ${name}`);
    const source = Buffer.from(JSON.stringify({ schemaVersion: 1, producedAt: voiceSource.producedAt, tool: voiceSource.tool, model: voiceSource.model, locale: voiceSource.locale, textLocale: voiceSource.textLocale, ...line }, null, 2) + '\n');
    const sourcePath = 'VOICE-SOURCE.json';
    for (const variant of audio.variants) {
      await writeFile(join(projectRoot, 'assets/files', audio.id, variant.id, sourcePath), source);
      variant.files = [...variant.files.filter(file => !['VOICE-PRODUCTION.json', sourcePath].includes(file.path)), { path: sourcePath, bytes: source.length, mime: 'application/json', role: 'source' }];
    }
  }
  const attach = async (name, files) => {
    const item = index.assets.find(asset => asset.name === name || asset.sourceName === name);
    if (!item) throw new Error(`The adopted Motion Canvas dependency is missing: ${name}`);
    const active = item.variants.find(candidate => candidate.id === item.activeVariantId);
    for (const { path, bytes, mime, role } of files) {
      const destination = join(projectRoot, 'assets/files', item.id, active.id, path);
      await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes);
      active.files = [...active.files.filter(file => file.path !== path), { path, bytes: bytes.length, mime, role }];
    }
  };
  const motion = join(directory, manifest.videoSources);
  const images = JSON.parse(await readFile(join(motion, 'image-generation.json'), 'utf8'));
  for (const image of images.images) await attach(image.adopted.split('/').at(-1), [
    { path: 'IMAGE-GENERATION.json', bytes: Buffer.from(JSON.stringify({ tool: images.tool, purpose: images.purpose, createdAt: images.createdAt, ...image }, null, 2)), mime: 'application/json', role: 'source' },
    { path: `originals/${image.original.split('/').at(-1)}`, bytes: await readFile(join(motion, image.original)), mime: 'image/png', role: 'source' },
  ]);
  await attach('NotoSansCJKsc-Regular.otf', await Promise.all(['OFL.txt', 'UPSTREAM.md'].map(async path => ({
    path, bytes: await readFile(join(motion, 'fonts', path)), mime: 'text/plain', role: 'license',
  }))));
  for (const [key, filename] of Object.entries(manifest.videos)) await attach(filename.split('/').at(-1), await Promise.all([
    ['MOTION-PRODUCTION.json', 'production.json'], ['TIMELINE.json', 'timeline.json'],
  ].map(async ([path, original]) => ({ path, bytes: await readFile(join(motion, key, original)), mime: 'application/json', role: 'source' }))));
  wall.source = { kind: 'generation', usage: 'redistributable', description: 'Built-in ImageGen; spring memory wall. Full sample provenance and third-party license notices are carried in SAMPLE-MEDIA-NOTICES.txt alongside this image.' };
}

export async function preparePracticeSources(documents, plugins) {
  if (!plugins) throw new Error('示例音乐与影片作者源需要精确插件文档提供方');
  const session = documents.currentSession, document = [...session.documents.values()].find(doc => doc.files['dependencies.lock.json']);
  const before = JSON.parse(document.files['dependencies.lock.json']).data;
  const missing = PracticeSourceDependencies.filter(required => !before.plugins.some(dependency => dependency.id === required.id && dependency.version === required.version));
  if (!missing.length) return;
  const after = structuredClone(before);
  after.plugins.push(...structuredClone(missing));
  const expected = [{ ref: { kind: 'document', id: document.documentId }, revision: document.revision }];
  const plan = unwrap(session.planEdit({ label: '启用样例音乐与影片制作源', origin: 'batch', expected, preparedAssets: [], requiredRefs: [],
    patches: [{ kind: 'json', documentId: document.documentId, changes: [{ path: '/data', op: 'set', before, after }] }] }));
  unwrap(session.applyEdit(plan.planId, expected));
}

export async function practiceExpansion({ documents, plugins, directory, manifest, asset, characters, project, command }) {
  const patches = [], gallery = new Map();
  const add = (path, data) => { const documentId = createId(); patches.push({ kind: 'document', documentId, op: 'create', before: null,
    after: { format: 'json', files: { [path]: envelope(documentId, data) } } }); return documentId; };
  const galleryEntry = (filename, kind, name, series, order) => {
    const id = createId(), differenceId = kind === 'cg' ? createId() : null;
    const entry = { id, kind, name, series, order, seriesOrder: series === '背景' ? 0 : 1, cover: kind === 'cg' ? asset(filename) : null,
      assets: kind === 'cg' ? [] : [asset(filename)], lockedView: 'placeholder',
      ...(differenceId ? { differences: [{ id: differenceId, assetId: asset(filename), name, order: 0 }], coverDifferenceId: differenceId } : {}) };
    add(`gallery/${id}.json`, entry); gallery.set(filename, entry);
  };
  const backgroundNames = { street: '旧街的春风', shop: '春灯放映馆', town: '渐暖的街区', station: '下一班列车', sky: '放晴之后', sunset: '留在眼里的光' };
  Object.entries(manifest.backgrounds).forEach(([key, filename], i) => galleryEntry(filename, 'cg', backgroundNames[key], '背景', i));
  characters.forEach((person, i) => galleryEntry(manifest.cg[person.key], 'cg', person.route, '春灯的约定', i));
  const indexDocument = [...documents.currentSession.documents.values()].find(document => document.files['assets/index.json']);
  const before = JSON.parse(indexDocument.files['assets/index.json']).data, after = structuredClone(before);
  await attachPracticeSourceNotices(after, documents.currentRoot, directory);
  const pluginDocuments = new PluginDocuments(documents, plugins);
  for (let i = 0; i < manifest.music.length; i++) {
    const score = JSON.parse(await readFile(join(directory, `sources/music/spring-0${i + 1}.score.json`), 'utf8'));
    galleryEntry(manifest.music[i], 'music', score.title, '春灯原声', i);
    const edit = unwrap(await pluginDocuments.create({ pluginId, contributionKey, stateVersion: 1, name: score.title, data: { score } }));
    patches.push(...edit.patches);
    const documentId = edit.patches.find(patch => patch.kind === 'document').documentId;
    const item = after.assets.find(item => item.id === asset(manifest.music[i])), variant = item.variants.find(variant => variant.id === item.activeVariantId);
    const production = JSON.parse(await readFile(join(directory, `sources/music/spring-0${i + 1}.production.json`), 'utf8'));
    variant.metadata.authorDocument = { documentId, pluginId, contributionKey, stateVersion: 1 };
    variant.metadata.loop = production.artifact.metadata.loop;
  }
  const dependencies = JSON.parse(await readFile(join(directory, manifest.videoSources, 'dependencies.json'), 'utf8'));
  for (const [key, filename] of Object.entries(manifest.videos)) {
    const project = JSON.parse(await readFile(join(directory, manifest.videoSources, key, 'motion-project.json'), 'utf8'));
    const clip = dependencies.clips.find(clip => clip.key === key);
    project.bindings = project.bindings.map(binding => {
      const file = binding.alias === 'audio' ? `${manifest.videoSources}/${clip.mix}` : dependencies.media[binding.alias];
      if (!file) throw new Error(`Missing sample film dependency: ${key}/${binding.alias}`);
      const assetId = asset(file), owner = after.assets.find(item => item.id === assetId);
      return { ...binding, assetId, variantId: owner.activeVariantId };
    });
    const pluginId = 'org.galcraft.motion-canvas', contributionKey = `${pluginId}/project`, stateVersion = 1;
    const edit = unwrap(await pluginDocuments.create({ pluginId, contributionKey, stateVersion, name: project.title, data: { project } }));
    patches.push(...edit.patches);
    const documentId = edit.patches.find(patch => patch.kind === 'document').documentId;
    const video = after.assets.find(item => item.id === asset(filename)), variant = video.variants.find(item => item.id === video.activeVariantId);
    variant.metadata.authorDocument = { documentId, pluginId, contributionKey, stateVersion };
  }
  patches.push({ kind: 'json', documentId: indexDocument.documentId, changes: [{ path: '/data', op: 'set', before, after }] });
  Object.entries(manifest.videos).forEach(([key, filename], i) => galleryEntry(filename, 'video', key === 'opening' ? '今晚，让春天亮起来 · OP' : `${characters.find(person => person.key === key).route} · ED`, '春灯影像', i));
  for (const person of characters) {
    add(`variables/${person.flagId}.json`, { id: person.flagId, name: `已进入${person.name}路线`, type: 'boolean', scope: 'progress', initial: false });
  }
  const flowId = createId(), rootId = createId(), nodes = [], edges = [];
  const lock = JSON.parse([...documents.currentSession.documents.values()].find(document => document.files['dependencies.lock.json']).files['dependencies.lock.json']).data;
  const scenario = (id, name, sceneId) => add(`authoring/debug/${id}.json`, { schemaVersion: 1, id, name, projectId: project.projectId,
    entry: { sceneId, statementId: null }, target: { sceneId, statementId: null }, initialProgress: Object.fromEntries(characters.map(person => [person.flagId, false])),
    pluginInitial: {}, route: [], playerInputs: [], externalPolicy: 'simulate', engineVersion: project.engineVersion, pluginVersions: [lock.engine, ...lock.plugins, lock.template] });
  nodes.push({ id: rootId, name: '春灯的最后一晚', x: 0, y: 170, sceneId: project.entry.sceneId, statementId: null, unlock: { kind: 'literal', value: true }, lockedView: 'locked', entry: { kind: 'firstUnlock' } });
  characters.forEach((person, i) => {
    const id = createId(), recallId = createId(), debugScenarioId = createId();
    nodes.push({ id, name: person.route, x: 280, y: i * 170, sceneId: person.sceneId, statementId: null,
      unlock: { kind: 'variable', scope: 'progress', id: person.flagId }, lockedView: 'locked', entry: { kind: 'firstUnlock' } });
    nodes.push({ id: recallId, name: `${person.name} · 独立回想`, x: 580, y: i * 170, sceneId: person.sceneId, statementId: null,
      unlock: { kind: 'variable', scope: 'progress', id: person.flagId }, lockedView: 'locked', entry: { kind: 'initial', debugScenarioId } });
    scenario(debugScenarioId, `${person.name}路线回想初值`, person.sceneId);
    edges.push({ id: createId(), from: rootId, to: id, label: `选择${person.name}` }, { id: createId(), from: id, to: recallId, label: '从初值回想' });
  });
  add(`flows/${flowId}.json`, { id: flowId, name: '春灯的三份约定', roots: [rootId], nodes, edges });
  const afterTitles = { deepseek: '澜汐 · 第一盏新灯', chatgpt: '绮白 · 旅行的第一站', claude: '绯书 · 把我们录下来' };
  const afterTexts = {
    deepseek: ['一周后，我按约定来到旧街。春灯的招牌已经取下，旁边活动室的门却开着。澜汐蹲在门边，把一枚旧灯泡擦得很亮。', '她递给我一把钥匙。钥匙串上挂着那晚的灯笼提手，弯了一小段，摸起来仍有熟悉的温度。', '屋里没有银幕，只有刚收来的工具、几排还没装好的书架，以及一张写到一半的值班表。她把“明天再说”那一栏划掉，认真写上我们两个人的名字。', '我问她，第一天开门会不会没人来。澜汐想了想，说，没人来也很好，我们就先把坏椅子修完。', '窗外传来敲门声。卖面包的阿姨带来一台不肯转动的小风扇，说它陪着自己过了好多夏天，实在舍不得扔。', '澜汐没急着拆机器。她搬出椅子，请阿姨先讲讲风扇的故事。我忽然发现，她的计划表里，第一次给“慢慢聊”留了一整格。', '我把插线板拖到桌边，她把工作灯拧亮。灯下的灰尘轻轻浮起来，像很久以前电影院里那束光。', '我们没有留住一座放映馆，却学会了让一间新的屋子，认真等候需要它的人。她回头望着我，眼睛比那晚轻松。', '门外又来了两个孩子。他们抱着坏掉的手电筒，问这里能不能修星星。澜汐给我递来一支笔。', '我在申请表上写下第一行：星星两颗，今晚取回。她把灯调亮一点，与我一起为新来的小客人腾出位置。'],
    chatgpt: ['初夏的第一班慢车，把我们送到一座只有一条主街的小镇。绮白背着折叠银幕，我提着电源，行李里最轻的是那颗歪歪的星星。', '学校借给我们一块空地。孩子们问龙族是不是能把电影放到云上。绮白想了想，说，今天先试着放到墙上。', '金线又缠在一起。她笑着让我别急，像那晚一样，一根一根慢慢解。风经过她的银发，把星星吹到我的鼻尖。', '午后的阳光太亮，什么也看不清。我们索性坐在树下，教孩子们用手掌在白布上做影子。鲸鱼、龙和一只认真的小鸟，轮流飞过银幕。', '一个孩子问，电影是不是只能讲已经发生的事。绮白把空白画纸摊开，说，也可以先把想去的地方画出来。', '纸上出现了海、雪山和比校舍还高的面包店。我画了一扇开着的门，她在门边加了一盏灯。那一刻，我知道旅程已经开始。', '黄昏时，孩子们把画钉在幕布旁。星星仍然不对称，却被每个人指认了一遍，像一枚谁也不会认错的路标。', '放映结束后，我们没有立即收拾。绮白把下一张车票摊在我掌心，问我要不要给这趟旅行取个名字。', '我说，就叫“下一幕”。她认真点头，又在后面补上两个字：一起。列车时刻表上，还有那么多没去过的小站。', '回车站的路上，我们背后的空地已经暗下来。只有孩子们画的门旁，还留着一小块金色。她轻轻牵住我的衣袖，带我走进温暖的晚风。'],
    claude: ['第二天清晨，绯书带着录音机等在街口。册子里夹着新的一页，标题写得端端正正：春灯街，今天。', '面包店的阿姨说自己不会讲故事，手上却一直没停，从第一炉面包讲到儿子搬去远方，最后连烤箱的铃声都成了故事的一部分。', '绯书认真记下名字，又请阿姨确认了一遍。她说，有些字看起来很像，可每个人都值得被写对。', '修理铺的师傅拿出一张旧照片。年轻时的他站在银幕边，头发比现在多，笑容却一点没变。绯书笑得差点忘记按录音。', '中午，我们坐在关了门的放映馆前。门缝里没有光，街上的声音却更清楚：自行车铃、开门声，还有隔壁孩子断断续续的口琴。', '我问她，要不要也录一段自己的话。她下意识把册子举起来挡住脸，过了一会儿，又轻轻放下。', '她把录音机交到我手里。第一句有点抖，第二句慢慢稳下来。她说自己是绯书，在这条街放过很多场电影。', '最喜欢的那场没有固定座位，最后一个镜头里，还有一个愿意留下来的人。我看着红灯，没有提醒她录音还在继续。', '她讲完后松了一口气，问刚才是不是太啰嗦。我说，正好，连停顿都想留下。她笑了，把镜头轻轻转向我们两个人。', '回去时，她在册子最后一页写下我们的名字，紧接着又翻开一本新的。封面上仍是四个字：故事继续。'],
  };
  const afterstories = ({ bg, music, show, say, narration, playerSay }) => characters.map(person => {
    const paragraph = (text, index) => {
      if (person.key === 'deepseek' && index === 3) return [playerSay('第一天开门，会不会没人来？'), narration('澜汐想了想，说，没人来也很好，我们就先把坏椅子修完。')];
      if (person.key === 'chatgpt' && index === 8) return [playerSay('就叫“下一幕”吧。'), narration('她认真点头，又在后面补上两个字：一起。我望着列车时刻表，上面还有那么多没去过的小站。')];
      if (person.key === 'claude' && index === 5) return [playerSay('要不要也录一段你自己的话？'), narration('她下意识把册子举起来挡住脸，过了一会儿，又轻轻放下。')];
      if (person.key === 'claude' && index === 8) return [narration('她讲完后松了一口气，问刚才是不是太啰嗦。'), playerSay('正好。连停顿我都想留下。'), narration('她笑了，把镜头轻轻转向我们两个人。')];
      return [narration(text)];
    };
    return [person.afterSceneId, afterTitles[person.key], [bg(person.key === 'chatgpt' ? 'town' : 'shop'), music(person.key === 'chatgpt' ? 1 : 4), show(person, 'neutral', true),
      ...afterTexts[person.key].slice(0, 4).flatMap(paragraph), show(person, 'smile', true), say(person, 13, ''),
      ...afterTexts[person.key].slice(4, 7).flatMap((text, index) => paragraph(text, index + 4)), show(person, 'shy', true), ...afterTexts[person.key].slice(7).flatMap((text, index) => paragraph(text, index + 7)),
      narration('我把今天的故事记到这里。明天的那一页，还想和她一起翻开。'), command('end', { target: { kind: 'title' } })]];
  });
  const filterText = { oldFilm: '银幕上留下胶片的细纹。年轻时的街坊们，正搬进第一台放映机。', dot: '孩子们画的动画开始了。小小的网点拼成太阳，有人喊出自己当年的名字。', reflection: '雨后街面倒映着招牌，像另一条春灯街从脚下经过。', glitch: '接片处闪过一瞬断续的光。绯书稳住机器，影像终于找回下一帧。', rgbSplit: '褪色彩片的边缘散开红与蓝。年轻的摄影师正笨拙地向镜头挥手。', godray: '屋顶透进一束光，像穿过很多年的尘埃，恰好落到今晚。' };
  const filters = narration => Object.entries(filterText).flatMap(([type, text]) => { const effectId = createId(); return [command('pixi', { effectId, type, target: { kind: 'stage' }, enabled: true }), narration(text), command('pixiInit', { scope: 'instance', effectId })]; });
  return { patches, gallery, afterTitles, afterstories, filters };
}
