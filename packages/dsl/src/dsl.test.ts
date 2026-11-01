import { describe, expect, it } from 'vitest';
import { FixtureAsset, FixtureCharacters, FixtureIds, FixtureLock, FixtureProject, FixtureScenes, FixtureTemplate, FixtureVariables, FixtureVoiceAssets } from '@galcraft/contracts/fixtures';
import { CommandSpecSchema, PatchSchema, SnapshotSchema } from '@galcraft/contracts';
import { CoreCommandSpecs, createCommandRegistry } from './catalog.js';
import { compile } from './compiler.js';
import type { CompileInput } from './compiler.js';
import { applyTextEdits, duplicateStatements, explainField, outerQuotePatch, patchFields, toDocumentPatch } from './editing.js';
import { evaluateExpression, expressionType, parseExpression } from './expression.js';
import { completions, hover, languageId, markers, semanticTokens, type ConditionMetadata } from './monaco.js';
import { parse } from './parser.js';
import { rewriteCommandReferences, rewriteScriptReferences, scriptOwnedIds } from './identity.js';
import { printExpression } from './expression.js';
import { LanguageService } from './service.js';

const id = (suffix: number) => `00000000-0000-4000-8000-${suffix.toString(16).padStart(12, '0')}`;
const documentId = id(0xa10);
const firstId = id(0xa11);
const secondId = id(0xa12);
const say = (statementId: string, text = '明天见。') => `say { speaker:{kind:"character",id:"${FixtureIds.an}"}, text:${JSON.stringify(text)}, voice:null } @${statementId};`;
const input = (text: string): CompileInput => ({
  projectId: FixtureProject.projectId, engineVersion: FixtureProject.engineVersion, lock: FixtureLock, project: FixtureProject,
  documents: [{ documentId, revision: 1, kind: 'scene', sceneId: FixtureIds.street, text }],
  scenes: [FixtureScenes[0]!], characters: FixtureCharacters, variables: FixtureVariables,
  assets: [FixtureAsset], gallery: [], flows: [], template: FixtureTemplate, cancelOperationId: id(0xa13),
});

describe('M03 language', () => {
  it('freezes inline composite lifecycle data and rejects ambiguous animation sources', () => {
    const animation = { type: 'galcraft.animation', version: 1, durationMs: 500, tracks: [
      { path: '/x', mode: 'add', keyframes: [{ timeMs: 0, value: -50, easing: { family: 'quad', direction: 'inOut' } }, { timeMs: 500, value: 0, easing: { family: 'quad', direction: 'inOut' } }] },
    ] };
    const transition = { preset: 'custom', animation, durationMs: 500, easing: { family: 'linear', direction: 'in' } };
    const source = (value: unknown) => `changeFigure {objectId:"Obj001",characterId:"${FixtureIds.an}",assetId:"${FixtureAsset.id}",transition:{enter:${JSON.stringify(value)}}} @${firstId};`;
    const result = compile(input(source(transition)));
    expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    expect(JSON.stringify(result.snapshot)).toContain('/x');
    expect(compile(input(source({ ...transition, resourceId: FixtureAsset.id }))).issues.some(issue => issue.code === 'TRANSITION_ANIMATION')).toBe(true);
    expect(compile(input(source({ ...transition, animation: { ...animation, durationMs: -1 } }))).issues.some(issue => issue.code === 'TRANSITION_ANIMATION')).toBe(true);
    expect(compile(input(`changeFigure {objectId:"Obj001",characterId:"${FixtureIds.an}",assetId:"${FixtureAsset.id}"} @${firstId};`)).snapshot).not.toBeNull();
  });
  it('freezes custom active and fixed variant data without coercing the kind or provider version', () => {
    const candidate = input(say(firstId)), asset = structuredClone(FixtureAsset);
    asset.kind = 'org.test.geometry/shape';
    const old = asset.variants[0]!;
    old.typeData = { typeVersion: 1, provider: { id: 'org.test.geometry', version: '0.1.0' }, value: { color: '#123456' } };
    const active = { ...structuredClone(old), id: id(0xa30), parentId: old.id,
      typeData: { typeVersion: 2, provider: { id: 'org.test.geometry', version: '2.0.0' }, value: { color: '#aabbcc' } } };
    asset.variants.push(active); asset.activeVariantId = active.id; candidate.assets = [asset];
    candidate.assetReferences = [{ assetId: asset.id, variantId: old.id, owner: { kind: 'document', id: documentId }, usage: 'fixed', required: true }];
    const result = compile(candidate);
    expect(result.snapshot).not.toBeNull();
    expect(result.snapshot!.assets.map(value => [value.kind, value.typeData])).toEqual([[asset.kind, active.typeData], [asset.kind, old.typeData]]);
    expect(SnapshotSchema.parse(result.snapshot).schemaVersion).toBe(1);
  });
  it('freezes namespaced plugin messages with the authored template translations', () => {
    const candidate = input(say(firstId));
    candidate.template = structuredClone(candidate.template);
    candidate.template.locales.en ??= {};
    candidate.template.locales.en['org.example.complete/dialog.title'] = 'Authored interaction';
    candidate.pluginMessages = [{ pluginId: 'org.example.complete', messages: {
      en: { 'org.example.complete/dialog.title': 'Counter interaction', 'nav.back': 'Override core' },
      'zh-CN': { 'org.example.complete/dialog.title': '计数交互' },
    } }];
    const result = compile(candidate);
    expect(result.snapshot).not.toBeNull();
    expect(result.snapshot!.template.locales.en!['org.example.complete/dialog.title']).toBe('Authored interaction');
    expect(result.snapshot!.template.locales['zh-CN']!['org.example.complete/dialog.title']).toBe('计数交互');
    expect(result.snapshot!.template.locales.en!['nav.back']).not.toBe('Override core');
    expect(candidate.template.locales['zh-CN']!['org.example.complete/dialog.title']).toBeUndefined();
  });
  it('completes a plugin condition inside an expression string and exposes its same-source signature', () => {
    const registry = createCommandRegistry('0.1.0'), source = `${say(firstId).replace('voice:null', 'voice:null, when:expr("org.exa")')}`;
    const parsed = parse({documentId,revision:1,text:source}), offset = source.indexOf('org.exa') + 'org.exa'.length;
    const condition:ConditionMetadata = {key:'org.example/ready',fields:[{path:'locale',label:'Language',description:'Selected language',type:'string',default:'zh-CN',required:true,nullable:false,unit:'none',group:'basic',summary:true,keywords:[]}]};
    const suggestion = completions(parsed,offset,registry,[],[],()=>id(0xf10),[condition]).find(item=>item.label===condition.key)!;
    expect(suggestion.detail).toBe('org.example/ready(locale: string): boolean');
    const completed=source.slice(0,suggestion.start)+suggestion.insertText+source.slice(suggestion.end);
    const checked=parse({documentId,revision:1,text:completed});expect(checked.issues).toEqual([]);
    expect(hover(checked,completed.indexOf(condition.key)+5,registry,[condition])).toMatchObject({type:'boolean',source:'org.example',default:{locale:'zh-CN'}});
  });
  it('compiles multiple plugin documents with their identity, purpose and saved revision', () => {
    const source = input(say(firstId));
    source.lock = structuredClone(source.lock);
    source.lock.plugins.push({ kind: 'plugin', id: 'example.game', version: '0.1.0', required: true, targets: ['web', 'windows'] });
    source.pluginConfigMappings = { 'example.game/config': { purpose: 'rules', mode: 'multiple', required: true } };
    source.pluginDocuments = { 'example.game': { schemaVersion: 1, documents: [{ contribution: 'example.game/removed', documentId: id(0xf00), revision: 1, purpose: 'removed', data: {} }] } };
    source.pluginConfigDocuments = [
      { contribution: 'example.game/config', documentId: id(0xf01), revision: 3, data: { name: 'first' } },
      { contribution: 'example.game/config', documentId: id(0xf02), revision: 7, data: { name: 'second' } },
    ];
    const result = compile(source);
    expect(result.issues).toEqual([]);
    expect(result.snapshot?.pluginDocuments['example.game']).toEqual({ schemaVersion: 1, documents: source.pluginConfigDocuments.map(item => ({ ...item, purpose: 'rules' })) });
    expect(result.snapshot?.documents).toContainEqual({ documentId: id(0xf02), revision: 7 });
    source.pluginConfigDocuments[0]!.data = { name: 'changed' };
    expect((result.snapshot?.pluginDocuments['example.game'] as any).documents[0].data).toEqual({ name: 'first' });
    source.assetReferences = [{assetId:id(0xf03),variantId:null,owner:{kind:'document',id:id(0xf02)},source:{documentId:id(0xf02),revision:7},usage:'release',required:true}];
    expect(compile(source).issues.find(item=>item.code==='PLUGIN_CONFIG_ASSET_MISSING')?.source).toEqual({documentId:id(0xf02),revision:7});
    source.assetReferences = [];
    source.pluginConfigMappings['example.game/config']!.mode = 'fixed';
    expect(compile(source).issues.some(item => item.code === 'PLUGIN_CONFIG_FIXED')).toBe(true);
    source.pluginConfigDocuments = [];
    expect(compile(source).issues.some(item => item.code === 'PLUGIN_CONFIG_REQUIRED')).toBe(true);
  });
  it('round-trips and copies six-character statement, object and variable references', () => {
    const text = 'changeFigure {objectId:"Obj001",assetId:"Ast001"} @123AbC;\nsay {speaker:{kind:"narrator"},text:"Obj001 stays in dialogue",when:expr("progress[\\\"Var001\\\"] > 0")} @Line01;';
    const source = { documentId: 'Doc001', revision: 1, text };
    const parsed = parse(source);
    expect(parsed.issues).toEqual([]);
    expect(parsed.cst.map(node => node.id)).toEqual(['123AbC', 'Line01']);
    const rewritten = rewriteScriptReferences(source, { '123AbC': 'Stmt02', Line01: 'Line02', Obj001: 'Obj002', Ast001: 'Ast002', Var001: 'Var002' }, '0.1.0');
    const copy = parse({ ...source, text: rewritten });
    expect(copy.issues).toEqual([]);
    expect(copy.cst.map(node => node.id)).toEqual(['Stmt02', 'Line02']);
    expect(copy.statements[0]!.args).toMatchObject({ objectId: 'Obj002', assetId: 'Ast002' });
    expect(copy.statements[1]!.args.text).toBe('Obj001 stays in dialogue');
    const expression = parseExpression('progress["Var002"] > 0');
    expect(expression.ok).toBe(true);
    if (expression.ok) expect(parseExpression(printExpression(expression.expr))).toEqual(expression);
  });
  it('copies shared character difference references while retaining matching dialogue and comments', () => {
    const mapping = { Char01: 'Char02', Diff01: 'Diff02', Stmt01: 'Stmt02' }, registry = createCommandRegistry('0.1.0');
    expect(rewriteCommandReferences('characterDifference', { characterId: 'Char01', differenceId: 'Diff01' }, mapping, registry))
      .toEqual({ characterId: 'Char02', differenceId: 'Diff02' });
    expect(rewriteCommandReferences('characterDifference', { characterId: 'Char01', differenceId: 'Other1' }, mapping, registry))
      .toEqual({ characterId: 'Char02', differenceId: 'Other1' });
    expect(rewriteCommandReferences('say', { speaker: { kind: 'narrator' }, text: 'Diff01' }, mapping, registry).text).toBe('Diff01');
    const source = { documentId, revision: 1, text: '// Diff01 stays in this comment\ncharacterDifference {characterId:"Char01",differenceId:"Diff01"} @Stmt01;\nsay {speaker:{kind:"narrator"},text:"Diff01"} @Line01;' };
    const rewritten = rewriteScriptReferences(source, mapping, '0.1.0'), parsed = parse({ ...source, text: rewritten });
    expect(parsed.issues).toEqual([]);
    expect(parsed.statements[0]!.args).toEqual({ characterId: 'Char02', differenceId: 'Diff02' });
    expect(parsed.statements[1]!.args.text).toBe('Diff01');
    expect(rewritten).toContain('// Diff01 stays in this comment');
    expect(parsed.cst[0]!.id).toBe('Stmt02');
  });
  it('includes project and template saved revisions in the immutable snapshot', () => {
    const source = input(say(firstId));
    source.entityVersions = [{ ref: { kind: 'document', id: id(0xafa) }, revision: 7 }];
    const result = compile(source);
    expect(result.snapshot?.documents).toContainEqual({ documentId: id(0xafa), revision: 7 });
    source.entityVersions[0]!.revision = 8;
    expect(result.snapshot?.documents).toContainEqual({ documentId: id(0xafa), revision: 7 });
  });
  it('retains comments, unknown command and unknown field while patching one value', () => {
    const raw = `// 前缀 😀\n${say(firstId)}\n/* keep */\norg.galcraft.affection/add { x:[0,false,"中文"] } @${secondId};\n`;
    const parsed = parse({ documentId, revision: 3, text: raw });
    expect(parsed.cst).toHaveLength(2);
    expect(parsed.cst[1]!.raw).toContain('x:[0,false,"中文"]');
    const patched = patchFields(parsed, { documentId, revision: 3, statementIds: [firstId], changes: [{ field: 'text', op: 'set', value: '再见。' }] });
    expect(patched.ok).toBe(true);
    if (!patched.ok) return;
    expect(applyTextEdits(raw, patched.value)).toBe(raw.replace('明天见。', '再见。'));
    expect(PatchSchema.safeParse(toDocumentPatch(documentId, patched.value)).success).toBe(true);
  });
  it('keeps malformed source and diagnoses duplicate IDs at UTF16 spans', () => {
    const raw = `// 😀\n${say(firstId)}\n${say(firstId)}\nsay { text:"bad" @${secondId};`;
    const parsed = parse({ documentId, revision: 1, text: raw });
    expect(parsed.issues.filter(issue => issue.code === 'STATEMENT_DUPLICATE')).toHaveLength(2);
    expect(parsed.issues.some(issue => issue.code === 'DSL_SYNTAX')).toBe(true);
    expect(parsed.cst.at(-1)!.raw).toContain('text:"bad"');
    expect(parsed.issues[0]!.source?.range?.start).toBeGreaterThan(5);
  });
  it('recognizes trivia around the explicit statement identity', () => {
    const raw = `wait {durationMs:0} @${firstId} /* id note; */ ;`;
    const parsed = parse({ documentId, revision: 1, text: raw });
    expect(parsed.issues).toEqual([]);
    expect(parsed.cst[0]?.id).toBe(firstId);
    expect(parsed.cst[0]?.raw).toBe(raw);
  });
  it('parses precedence, scopes and grapheme length without JavaScript execution', () => {
    const parsed = parseExpression(`local["${FixtureIds.relation}"] + 2 * 3 >= 8 && len("春é") == 2`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(expressionType(parsed.expr, { variables: FixtureVariables, locals: [{ ...FixtureVariables[0]!, scope: 'local' }] })).toBe('boolean');
    expect(evaluateExpression(parsed.expr, { local: { [FixtureIds.relation]: 2 } })).toBe(true);
    const forbidden = parseExpression('globalThis.alert(1)');
    expect(forbidden.ok).toBe(true);
    if (forbidden.ok) expect(() => expressionType(forbidden.expr, { variables: [] })).toThrow('Unknown');
    const zero = parseExpression('1 / 0');
    expect(zero.ok).toBe(true);
    if (zero.ok) expect(() => evaluateExpression(zero.expr, {})).toThrow('Division by zero');
  });
  it('provides one field directory for all public commands and comment', () => {
    expect(CoreCommandSpecs).toHaveLength(40);
    expect(new Set(CoreCommandSpecs.map(spec => spec.key)).size).toBe(40);
    expect(CoreCommandSpecs.find(spec => spec.key === 'setTransform')?.fields.some(field => field.path === 'effects' && field.children?.some(child => child.path === 'gamma' && child.exclusiveMin === 0))).toBe(true);
    expect(CoreCommandSpecs.filter(spec => spec.key !== 'comment').every(spec => spec.fields.some(field => field.path === 'when'))).toBe(true);
    expect(CoreCommandSpecs.every(spec => CommandSpecSchema.safeParse(spec).success)).toBe(true);
  });
  it('accepts a minimal statement of every defined command', () => {
    const target = `{kind:"station",station:"center"}`;
    const segment = `{effects:{x:1},durationMs:300,easing:{family:"linear",direction:"in"}}`;
    const samples: Record<string, string> = {
      say: `speaker:{kind:"narrator"},text:"Hello"`, changeBg: `op:"clear"`,
      changeFigure: `op:"exit",objectId:"${id(0xa41)}"`, bgm: `op:"stop"`,
      characterDifference: `characterId:"${FixtureIds.an}"`,
      changeIllustration: `op:"exit",objectId:"${id(0xa41)}"`,
      changeIllustrationDiff: `objectId:"${id(0xa41)}",assetId:"${FixtureAsset.id}"`,
      video: `assetId:"${id(0xa42)}"`, playEffect: `op:"stop",all:true`,
      setAnimation: `animationId:"${id(0xa4e)}",presetId:"${id(0xa43)}",target:${target}`,
      stopAnimation: `animationId:"${id(0xa4e)}",target:${target}`,
      setComplexAnimation: `target:${target},segments:[${segment}]`, setTransform: `target:${target},effects:{x:1}`,
      setTempAnimation: `target:${target},segments:[${segment}]`, setTransition: `target:${target}`,
      pixi: `effectId:"${id(0xa44)}",type:"snow"`, pixiInit: `scope:"all"`,
      intro: `op:"clear"`, miniAvatar: `op:"clear"`, setTextbox: ``, filmMode: ``,
      callScene: `sceneId:"${FixtureIds.street}"`, changeScene: `sceneId:"${FixtureIds.street}"`,
      choose: `options:[{id:"${id(0xa45)}",text:"Yes",target:{sceneId:"${FixtureIds.street}",labelId:null}}]`,
      label: `labelId:"${id(0xa46)}",name:"起点"`, jumpLabel: `labelId:"${id(0xa46)}"`,
      return: ``, unlockCg: `entryId:"${id(0xa47)}",differenceIds:["${id(0xa4d)}"]`, unlockBgm: `entryId:"${id(0xa48)}"`, unlockVideo: `entryId:"${id(0xa4c)}"`,
      getUserInput: `variableId:"${id(0xa49)}"`, setVar: `variableId:"${FixtureIds.relation}",value:1`,
      showVars: ``, wait: ``, applyStyle: `op:"reset",target:{kind:"page",id:"${id(0xa4a)}"}`,
      callSteam: `achievement:"first"`, end: ``, comment: ``, readingMode: `mode:"nvl"`, clearPage: ``,
    };
    expect(Object.keys(samples).sort()).toEqual(CoreCommandSpecs.map(spec => spec.key).sort());
    const video = { ...FixtureAsset, id: id(0xa42), kind: 'video' as const };
    const animation = { ...FixtureAsset, id: id(0xa43), kind: 'animation' as const };
    const source = Object.entries(samples).map(([name, args], index) => `${name} {${args}} @${id(0xb00 + index)};`).join('\n');
    const candidate = input(source);
    candidate.assets = [FixtureAsset, FixtureVoiceAssets[0]!, video, animation];
    candidate.gallery = ['cg', 'music', 'video'].map((kind, index) => ({ id: id(kind==='video'?0xa4c:0xa47 + index), kind: kind as 'cg' | 'music' | 'video', name: kind, series: '', order: index, cover: null, assets: kind==='cg'?[]:[kind==='music'?FixtureVoiceAssets[0]!.id:video.id], lockedView: 'hidden', ...(kind==='cg'?{differences:[{id:id(0xa4d),assetId:FixtureAsset.id,name:'First',order:0}]}:{}) }));
    candidate.variables = [...FixtureVariables, { id: id(0xa49), name: 'input', type: 'string', scope: 'progress', initial: '' }];
    const compiled = compile(candidate);
    expect(compiled.issues.filter(issue => issue.severity === 'error').map(issue => `${issue.code}: ${issue.message}`)).toEqual([]);
    expect(compiled.snapshot?.scenes[0]?.instructions).toHaveLength(39);
    const complex = compiled.snapshot?.scenes[0]?.instructions.find(item => item.opcode === 'setComplexAnimation');
    expect(JSON.stringify(complex?.args)).not.toContain('scaleX');
  });
  it('validates authored animation references and their target without rewriting the source', () => {
    const start = `setComplexAnimation {animationId:"Anim01",target:{kind:"object",id:"Object"},animation:{type:"galcraft.animation",version:1,durationMs:100,tracks:[{path:"/x",mode:"add",keyframes:[{timeMs:100,value:20}]}]},keepFinal:false,cross:true} @${firstId};`;
    const stop = (animationId: string, objectId = 'Object') => `stopAnimation {animationId:"${animationId}",target:{kind:"object",id:"${objectId}"}} @${secondId};`;
    expect(compile(input(`${start}\n${stop('Anim01')}`)).snapshot).not.toBeNull();
    expect(compile(input(`${start}\n${stop('Absent')}`)).issues.some(issue => issue.code === 'ANIMATION_REFERENCE_MISSING')).toBe(true);
    expect(compile(input(`${start}\n${stop('Anim01', 'Other1')}`)).issues.some(issue => issue.code === 'ANIMATION_REFERENCE_TARGET')).toBe(true);
    expect(compile(input(`${start}\n${stop('bad')}`)).issues.some(issue => issue.code === 'FIELD_REF')).toBe(true);
  });
  it('indexes authored background objects and rewrites owned animation uses with their stops', () => {
    const text = `changeBg {objectId:"BgMain",assetId:"${FixtureAsset.id}"} @${firstId};\nsetComplexAnimation {animationId:"Anim01",target:{kind:"object",id:"BgMain"},segments:[{effects:{x:10},durationMs:100,easing:{family:"linear",direction:"in"}}],cross:true} @${secondId};\nstopAnimation {animationId:"Anim01",target:{kind:"object",id:"BgMain"}} @${id(0xa18)};`;
    const source = { documentId, revision: 1, text }, compiled = compile(input(text));
    expect(compiled.snapshot).not.toBeNull(); expect(compiled.symbols.objects.BgMain?.field).toBe('objectId');
    expect(scriptOwnedIds(source)).toContain('BgMain'); expect(scriptOwnedIds(source)).toContain('Anim01');
    const rewritten = rewriteScriptReferences(source, { BgMain: 'BgNext', Anim01: 'Anim02' }, FixtureProject.engineVersion);
    expect(rewritten.match(/"Anim02"/g)).toHaveLength(2); expect(rewritten.match(/"BgNext"/g)).toHaveLength(3);
  });
  it('compiles an immutable snapshot with source map and exact versions', () => {
    const result = compile(input(`${say(firstId)}\nchangeBg { op:"show", assetId:"${FixtureAsset.id}", positionX:0 } @${secondId};`));
    expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    expect(result.snapshot).not.toBeNull();
    expect(SnapshotSchema.safeParse(result.snapshot).success).toBe(true);
    expect((result.snapshot!.scenes[0]!.instructions[1]!.args as Record<string, unknown>).positionX).toBe(0);
    expect(result.snapshot!.sourceMap.find(item => item.statementId === secondId && item.field === 'positionX')?.source.range).toBeDefined();
    expect(Object.isFrozen(result.snapshot!.scenes[0]!.instructions[0])).toBe(true);
  });
  it('retains unknown fields in source while excluding their runtime behavior', () => {
    const raw = `say {speaker:{kind:"narrator"},text:"Hello",x:[0,false,"中文"]} @${firstId};`;
    const result = compile(input(raw));
    expect(result.snapshot).not.toBeNull();
    expect(result.issues.some(issue => issue.code === 'FIELD_UNKNOWN' && issue.severity === 'warning')).toBe(true);
    expect(result.parses[0]!.text).toBe(raw);
    expect(result.snapshot!.scenes[0]!.instructions[0]!.args).not.toHaveProperty('x');
  });
  it('keeps replacement inheritance distinct from creation defaults and fills target labels', () => {
    const choiceId = id(0xa65);
    const source = `changeFigure {op:"replace",objectId:"${id(0xa66)}",assetId:"${FixtureAsset.id}"} @${firstId};\nchoose {options:[{id:"${choiceId}",text:"继续",target:{sceneId:"${FixtureIds.street}"}}]} @${secondId};`;
    const result = compile(input(source));
    expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    const figure = result.snapshot!.scenes[0]!.instructions[0]!.args as Record<string, unknown>;
    expect(figure).not.toHaveProperty('station');
    expect(figure).not.toHaveProperty('z');
    const choice = result.snapshot!.scenes[0]!.instructions[1]!.args as { options: { target: { labelId: unknown } }[] };
    expect(choice.options[0]!.target.labelId).toBeNull();
  });
  it('blocks invalid fields and missing plugins while retaining the last valid snapshot', async () => {
    const service = new LanguageService();
    const valid = await service.compile(input(say(firstId)));
    expect(valid.snapshot).not.toBeNull();
    const invalidInput = input(`${say(firstId)}\norg.galcraft.affection/add { x:0 } @${secondId};`);
    invalidInput.documents[0]!.revision = 2;
    service.parse(invalidInput.documents[0]!);
    const invalid = await service.compile(invalidInput);
    expect(invalid.snapshot).toBeNull();
    expect(invalid.lastValid?.snapshotId).toBe(valid.snapshot?.snapshotId);
    expect(invalid.issues.some(issue => issue.code === 'PLUGIN_MISSING')).toBe(true);
    const gamma = compile(input(`setTransform { target:{kind:"station",station:"center"}, effects:{gamma:0} } @${firstId};`));
    expect(gamma.issues.some(issue => issue.code === 'FIELD_RANGE' && issue.source?.field === 'effects.gamma')).toBe(true);
  });
  it('resolves plugin commands only from the matching locked provider version', () => {
    const spec = { ...CoreCommandSpecs.find(item => item.key === 'wait')!, key: 'org.galcraft.affection/add', executor: 'org.galcraft.affection' };
    const source = `org.galcraft.affection/add {durationMs:1} @${firstId};`;
    const current = input(source);
    current.pluginCommands = [spec];
    expect(compile(current).snapshot?.scenes[0]?.instructions[0]?.opcode).toBe(spec.key);
    current.pluginCommands = [{ ...spec, version: '2.0.0' }];
    expect(compile(current).issues.some(issue => issue.code === 'PLUGIN_VERSION')).toBe(true);
  });
  it('indexes current semantic references with explicit coverage and channel stops', async () => {
    const service = new LanguageService();
    const bgmId = id(0xa20);
    const raw = `${say(firstId, `值{{progress["${FixtureIds.relation}"]}}`)}\nbgm { op:"stop" } @${secondId};`;
    const compiled = await service.compile(input(raw));
    expect(compiled.current).toBe(true);
    const expected = [{ ref: { kind: 'document' as const, id: documentId }, revision: 1 }];
    const common = { projectId: FixtureProject.projectId, requestId: id(0xa30), expected, expectedLock: FixtureLock, sceneIds: [], offset: 0 };
    const reads = service.querySemantic({ ...common, filter: { kind: 'variable', id: FixtureIds.relation, scope: 'progress', declaringSceneId: null, access: 'read' } });
    expect(reads.ok && reads.value.items[0]?.uses).toContain('read');
    const stops = service.querySemantic({ ...common, filter: { kind: 'bgm', assetId: bgmId, includeChannelStops: true } });
    expect(stops.ok && stops.value.items[0]?.binding).toBe('channel');
    expect(service.querySemantic({ ...common, expected: [], filter: { kind: 'bgm', assetId: null, includeChannelStops: true } }).ok).toBe(false);
    expect(service.querySemantic({ ...common, expectedLock: { ...FixtureLock, selectedProviders: { test: 'other' } }, filter: { kind: 'bgm', assetId: null, includeChannelStops: true } }).ok).toBe(false);
  });
  it('separates local identities and records read-modify-write, parameter and receiver uses', async () => {
    const streetLocal = id(0xaa1); const shopLocal = id(0xaa2); const shopDocument = id(0xaa3);
    const street = { ...FixtureScenes[0]!, locals: [{ id: streetLocal, name: 'x', type: 'number' as const, scope: 'local' as const, initial: 0 }] };
    const shop = { ...FixtureScenes[1]!, returns: 'number' as const, locals: [{ id: shopLocal, name: 'x', type: 'number' as const, scope: 'local' as const, initial: 0 }], parameters: [{ variableId: shopLocal, required: true, defaultValue: null }] };
    const current = input(`setVar {variableId:"${streetLocal}",op:"add",value:1} @${firstId};\ncallScene {sceneId:"${shop.id}",parameters:{"${shopLocal}":2},receiver:{scope:"progress",variableId:"${FixtureIds.relation}"}} @${secondId};`);
    current.scenes = [street, shop];
    current.documents.push({ documentId: shopDocument, revision: 1, kind: 'scene', sceneId: shop.id, text: `return {value:expr("local[\\"${shopLocal}\\"]")} @${id(0xaa4)};` });
    const service = new LanguageService();
    const compiled = await service.compile(current);
    expect(compiled.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    const common = { projectId: FixtureProject.projectId, requestId: id(0xaa5), expectedLock: FixtureLock, expected: current.documents.map(item => ({ ref: { kind: 'document' as const, id: item.documentId }, revision: item.revision })), sceneIds: [], offset: 0 };
    const local = service.querySemantic({ ...common, filter: { kind: 'variable', id: streetLocal, scope: 'local', declaringSceneId: street.id, access: 'both' } });
    expect(local.ok && local.value.items[0]?.uses.sort()).toEqual(['read', 'write']);
    const parameter = service.querySemantic({ ...common, filter: { kind: 'variable', id: shopLocal, scope: 'local', declaringSceneId: shop.id, access: 'write' } });
    expect(parameter.ok && parameter.value.items[0]?.source.statementId).toBe(secondId);
    const receiver = service.querySemantic({ ...common, filter: { kind: 'variable', id: FixtureIds.relation, scope: 'progress', declaringSceneId: null, access: 'write' } });
    expect(receiver.ok && receiver.value.items[0]?.source.statementId).toBe(secondId);
  });
  it('offers a one-field outer quote correction and preserves its cancellation path', () => {
    const raw = say(firstId, '「内有『引用』」');
    const parsed = parse({ documentId, revision: 1, text: raw });
    const correction = outerQuotePatch(parsed, firstId);
    expect(correction.ok && correction.value?.changes[0]?.value).toBe('内有『引用』');
    if (!correction.ok || !correction.value) return;
    const edits = patchFields(parsed, correction.value);
    expect(edits.ok && applyTextEdits(raw, edits.value)).toContain('"内有『引用』"');
    expect(raw).toContain('「内有『引用』」');
  });
  it('edits insertions and inherited fields without touching independent comments', () => {
    const raw = `setTransform {\n  target:{kind:"station",station:"center"},\n  effects:{x:0, /* note */ gamma:1}\n} @${firstId};`;
    const parsed = parse({ documentId, revision: 1, text: raw });
    const change = patchFields(parsed, { documentId, revision: 1, statementIds: [firstId], changes: [
      { field: 'effects.gamma', op: 'inherit', value: null }, { field: 'effects.opacity', op: 'set', value: 0 },
    ] });
    expect(change.ok).toBe(true);
    if (!change.ok) return;
    const updated = applyTextEdits(raw, change.value);
    expect(updated).toContain('/* note */');
    expect(updated).toContain('opacity: 0');
    expect(parse({ documentId, revision: 2, text: updated }).issues).toEqual([]);
  });
  it('patches one nested choice field and locates its UTF16 source span', () => {
    const raw = `choose {options:[{id:"${id(0xa81)}",text:"春😀",target:{sceneId:"${FixtureIds.street}",labelId:null}},{id:"${id(0xa82)}",text:"夏",target:{sceneId:"${FixtureIds.street}",labelId:null}}]} @${firstId};`;
    const parsed = parse({ documentId, revision: 1, text: raw });
    const edits = patchFields(parsed, { documentId, revision: 1, statementIds: [firstId], changes: [{ field: 'options.1.text', op: 'set', value: '秋' }] });
    expect(edits.ok).toBe(true);
    if (!edits.ok) return;
    const changed = applyTextEdits(raw, edits.value);
    expect(changed).toContain('text:"春😀"');
    expect(changed).toContain('text:"秋"');
    expect(changed.replace('text:"秋"', 'text:"夏"')).toBe(raw);
  });
  it('writes expression fields in DSL syntax', () => {
    const raw = `${say(firstId)}`;
    const parsed = parse({ documentId, revision: 1, text: raw });
    const expression = parseExpression(`progress["${FixtureIds.relation}"] >= 20`);
    expect(expression.ok).toBe(true);
    if (!expression.ok) return;
    const edits = patchFields(parsed, { documentId, revision: 1, statementIds: [firstId], changes: [{ field: 'when', op: 'set', value: expression.expr }] });
    expect(edits.ok).toBe(true);
    if (!edits.ok) return;
    const updated = applyTextEdits(raw, edits.value);
    expect(updated).toContain('when: expr(');
    expect(parse({ documentId, revision: 2, text: updated }).issues).toEqual([]);
  });
  it('explains explicit zero without inventing inherited effects', () => {
    const raw = `setTransform {target:{kind:"station",station:"center"},effects:{opacity:0}} @${firstId};`;
    const parsed = parse({ documentId, revision: 1, text: raw });
    const source = { documentId, revision: 1, statementId: firstId };
    const registry = createCommandRegistry('0.1.0');
    const zero = explainField(parsed, source, 'effects.opacity', registry, null);
    const inherited = explainField(parsed, source, 'effects.gamma', registry, null);
    expect(zero.ok && zero.value.effective).toBe(0);
    expect(zero.ok && zero.value.configured.present).toBe(true);
    expect(inherited.ok && inherited.value.effectiveKnown).toBe(false);
    expect(inherited.ok && inherited.value.effective).toBeNull();
  });
  it('uses document revisions for Monaco markers and suggestions', () => {
    const raw = `${say(firstId)}\nunknown {x:1} @${secondId};`;
    const parsed = parse({ documentId, revision: 4, text: raw });
    const registry = createCommandRegistry('0.1.0');
    const tokens = semanticTokens(parsed, registry, [], [], 4);
    expect(languageId).toBe('galcraft');
    expect(tokens.map(token => token.type)).toContain('unknownCommand');
    expect(semanticTokens(parsed, registry, [], [], 3)).toEqual([]);
    const missing = compile(input(raw));
    const issues = missing.issues.map(issue => ({ ...issue, source: issue.source ? { ...issue.source, revision: 4 } : undefined }));
    expect(markers(parsed, issues, 3)).toEqual([]);
    expect(markers(parsed, issues, 4).some(marker => marker.code === 'COMMAND_UNKNOWN')).toBe(true);
    expect(completions(parsed, parsed.cst[0]!.object!.start + 1, registry, [], [], () => id(0xccc)).some(item => item.label === 'keepName')).toBe(true);
    expect(hover(parsed, parsed.cst[0]!.commandStart, registry)?.type).toBe('command');
  });
  it('uses nested field specifications for Monaco help', () => {
    const raw = `choose {options:[{target:{sceneId:"${id(0xa90)}"}}]} @${firstId};`;
    const parsed = parse({ documentId, revision: 1, text: raw });
    const registry = createCommandRegistry('0.1.0');
    expect(completions(parsed, raw.indexOf('target:{') + 'target:{'.length, registry, [], [], () => id(0xccc)).some(item => item.label === 'labelId')).toBe(true);
    expect(hover(parsed, raw.indexOf('sceneId'), registry)?.type).toBe('ref');
  });
  it('remaps only known internal identities when duplicating source', () => {
    const raw = `jumpLabel {labelId:"${id(0xa90)}", extra:"${id(0xa90)}"} @${firstId};`;
    const parsed = parse({ documentId, revision: 1, text: raw });
    const copied = duplicateStatements(parsed, [firstId], { [firstId]: secondId, [id(0xa90)]: id(0xa91) });
    expect(copied.ok).toBe(false);
    const known = parse({ documentId, revision: 1, text: raw.replace(`, extra:"${id(0xa90)}"`, '') });
    const safe = duplicateStatements(known, [firstId], { [firstId]: secondId, [id(0xa90)]: id(0xa91) });
    expect(safe.ok && safe.value).toContain(id(0xa91));
  });
  it('discards superseded compilation results', async () => {
    const service = new LanguageService();
    const old = service.compile(input(say(firstId)));
    const newer = service.compile(input(say(secondId)));
    expect((await old).current).toBe(false);
    expect((await newer).current).toBe(true);
  });
  it('rejects missing character and gallery references before producing a snapshot', () => {
    const source = `changeFigure {op:"show",objectId:"${id(0xd01)}",characterId:"${id(0xd02)}",assetId:"${FixtureAsset.id}"} @${firstId};\nunlockCg {entryId:"${id(0xd03)}"} @${secondId};`;
    const result = compile(input(source));
    expect(result.snapshot).toBeNull();
    expect(result.issues.map(issue => [issue.code, issue.source?.field])).toEqual(expect.arrayContaining([
      ['CHARACTER_MISSING', 'characterId'], ['GALLERY_MISSING', 'entryId'],
    ]));
  });
  it('resolves Flow unlock locals from their declaration rather than the configured node scene', () => {
    const local = { id: id(0xd11), name: 'flag', type: 'boolean' as const, scope: 'local' as const, initial: false };
    const other = { id: id(0xd12), name: 'other', type: 'boolean' as const, scope: 'local' as const, initial: false };
    const expression = parseExpression(`local["${local.id}"] && true`);
    const mixed = parseExpression(`local["${local.id}"] && local["${other.id}"]`);
    expect(expression.ok && mixed.ok).toBe(true);
    if (!expression.ok || !mixed.ok) return;
    const candidate = input(`wait {} @${firstId};`);
    candidate.scenes = [FixtureScenes[0]!, { ...FixtureScenes[1]!, locals: [local] }];
    candidate.documents.push({ documentId: id(0xd13), revision: 1, kind: 'scene', sceneId: FixtureIds.bookshop, text: `wait {} @${secondId};` });
    candidate.flows = [{ id: id(0xd14), name: 'flow', roots: [id(0xd15)], nodes: [{ id: id(0xd15), name: 'node', x: 0, y: 0, sceneId: FixtureIds.street, statementId: null, unlock: expression.expr, lockedView: 'hidden', entry: { kind: 'firstUnlock' } }], edges: [] }];
    expect(compile(candidate).issues.filter(issue => issue.code.startsWith('FLOW_UNLOCK'))).toEqual([]);
    candidate.scenes[0] = { ...candidate.scenes[0]!, locals: [other] };
    candidate.flows[0]!.nodes[0]!.unlock = mixed.expr;
    expect(compile(candidate).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'FLOW_UNLOCK_SCOPE', source: expect.objectContaining({ field: 'nodes.0.unlock' }) })]));
  });
  it('joins multiple insertions into empty and missing nested objects', () => {
    const raw = `setTransform {target:{kind:"station",station:"center"},effects:{}} @${firstId};`;
    const parsed = parse({ documentId, revision: 1, text: raw });
    const changes = [{ field: 'effects.x', op: 'set' as const, value: 1 }, { field: 'effects.y', op: 'set' as const, value: 2 },
      { field: 'effects.bloom.intensity', op: 'set' as const, value: 0.5 }, { field: 'effects.bloom.brightness', op: 'set' as const, value: 1 }];
    const patch = patchFields(parsed, { documentId, revision: 1, statementIds: [firstId], changes });
    expect(patch.ok).toBe(true);
    if (!patch.ok) return;
    const updated = parse({ documentId, revision: 2, text: applyTextEdits(raw, patch.value) });
    expect(updated.issues).toEqual([]);
    expect(updated.statements[0]?.args).toMatchObject({ effects: { x: 1, y: 2, bloom: { intensity: 0.5, brightness: 1 } } });
  });
  it('keeps last valid and revision state within one active project', async () => {
    const service = new LanguageService();
    expect((await service.compile(input(say(firstId)))).snapshot).not.toBeNull();
    const projectB = input(`unknown {} @${secondId};`);
    projectB.projectId = FixtureIds.projectB;
    projectB.project = { ...FixtureProject, projectId: FixtureIds.projectB };
    const failed = await service.compile(projectB);
    expect(failed.current).toBe(true);
    expect(failed.lastValid).toBeNull();
    expect(service.lastValidSnapshot()).toBeNull();
    const oldQuery = service.querySemantic({ projectId: FixtureIds.projectA, requestId: id(0xd41), expected: [{ ref: { kind: 'document', id: documentId }, revision: 1 }], expectedLock: FixtureLock, sceneIds: [], offset: 0, filter: { kind: 'asset', id: FixtureAsset.id } });
    expect(oldQuery.ok ? null : oldQuery.error.code).toBe('QUERY_STALE');
    const old = service.compile(input(say(firstId)));
    const newer = service.compile(projectB);
    expect((await old).lastValid).toBeNull();
    expect((await newer).lastValid).toBeNull();
  });
  it('indexes nested assets and rejects external references from older revisions', async () => {
    const external = id(0xd21);
    const candidate = input(`changeFigure {op:"show",objectId:"${id(0xd22)}",characterId:"${FixtureIds.an}",assetId:"${FixtureAsset.id}",model:{imageMouth:{closed:"${FixtureAsset.id}",open:"${FixtureAsset.id}"}}} @${firstId};`);
    candidate.documents.push({ documentId: external, revision: 2, kind: 'page', text: '' });
    candidate.assetReferences = [{ assetId: FixtureAsset.id, owner: { kind: 'document', id: external }, source: { documentId: external, revision: 1 }, usage: 'old', required: true, variantId: null }];
    const service = new LanguageService();
    await service.compile(candidate);
    const found = service.querySemantic({ projectId: candidate.projectId, requestId: id(0xd23), expected: candidate.documents.map(item => ({ ref: { kind: 'document' as const, id: item.documentId }, revision: item.revision })), expectedLock: candidate.lock, sceneIds: [], offset: 0, filter: { kind: 'asset', id: FixtureAsset.id } });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.items.map(item => item.source.field)).toEqual(expect.arrayContaining(['model.imageMouth.closed', 'model.imageMouth.open']));
    expect(found.value.items.some(item => item.label === 'old')).toBe(false);
    expect(found.value.coverage.find(item => item.documentId === external)?.state).toBe('partial');
  });
  it('rejects lip modes absent from a declared Live2D model group', () => {
    const candidate = input('');
    candidate.assets = [{ ...FixtureAsset, kind: 'live2d', variants: FixtureAsset.variants.map(variant => ({ ...variant,
      groupCapabilities: { resolver: 'galcraft.live2d', resolverVersion: '0.1.0', format: 'live2d-model3', formatVersion: '3',
        capabilities: ['motionSync'], parameters: [], motions: [], expressions: [], missingFiles: [] } })) }];
    const command = (mode: string) => `changeFigure {op:"show",objectId:"${id(0xd24)}",characterId:"${FixtureIds.an}",assetId:"${FixtureAsset.id}",model:{lip:{mode:"${mode}",gain:1}}} @${firstId};`;
    candidate.documents[0]!.text = command('basic');
    expect(compile(candidate).issues.map(issue => issue.code)).toContain('MODEL_LIP');
    candidate.documents[0]!.text = command('motionSync');
    expect(compile(candidate).issues.map(issue => issue.code)).not.toContain('MODEL_LIP');
  });
  it('highlights each scope in nested expressions and dialogue interpolation', () => {
    const raw = `choose {options:[{visible:expr("progress[\\"${FixtureIds.relation}\\"] > 0 && local[\\"${id(0xd31)}\\"] > 0") }]} @${firstId};\n${say(secondId, `{{longTerm["${id(0xd32)}"]}}`)}`;
    const tokens = semanticTokens(parse({ documentId, revision: 1, text: raw }), createCommandRegistry('0.1.0'), [], [], 1);
    for (const scope of ['progress', 'local', 'longTerm']) expect(tokens.some(token => raw.slice(token.start, token.end) === scope)).toBe(true);
  });
  it('lets a started compilation process cancellation between statement batches', async () => {
    const controller = new AbortController();
    const source = Array.from({ length: 256 }, (_, index) => `wait {} @${id(0xe00 + index)};`).join('\n');
    const candidate = { ...input(source), signal: controller.signal };
    const service = new LanguageService();
    const pending = service.compile(candidate);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    controller.abort();
    const result = await pending;
    expect(result.current).toBe(false);
    expect(result.snapshot).toBeNull();
    expect(result.issues.some(issue => issue.code === 'COMPILE_CANCELLED')).toBe(true);
    expect(result.parses).toEqual([]);
  });
});
