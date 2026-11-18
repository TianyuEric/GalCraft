import { RuleImageTransitionSchema, type CommandSpec, type FieldSpec, type Json } from '@galcraft/contracts';
import { CoreCommandSpecs } from './catalog.js';
import { presentationArgs } from './presentation.js';

type CreationContext = {
  textLocale: string;
};

const isObject = (value: Json): value is Record<string, Json> => value !== null && typeof value === 'object' && !Array.isArray(value);
const coreCommands = new Set(CoreCommandSpecs.map(spec => spec.key));
const fade = (durationMs: number, family = 'linear', direction = 'in'): Json =>
  ({ preset: 'fade', resourceId: null, durationMs, easing: { family, direction }, direction: 'left' });

// Each mode owns its initial values. Explicit caller input is retained and goes
// through the usual validation, including fields that the mode does not seed.
export function isCommandCreationField(command: string, field: string, args: Record<string, unknown>): boolean {
  switch (command) {
    case 'changeBg':
      return args.op !== 'clear' || ['op', 'transition', 'objectId', 'when', 'continue', 'skippable', 'note'].includes(field);
    case 'changeFigure': case 'changeIllustration':
      return args.op !== 'exit' || ['op', 'transition', 'objectId', 'when', 'continue', 'skippable', 'note'].includes(field);
    case 'bgm': case 'playEffect':
      if (field === 'all') return args.op === 'stop';
      return args.op !== 'stop' || ['op', 'soundId', 'fadeOutMs', 'when', 'continue', 'skippable', 'note'].includes(field);
    case 'intro':
      return args.op !== 'clear' || ['op', 'animation', 'durationMs', 'when', 'continue', 'skippable', 'note'].includes(field);
    case 'miniAvatar':
      return field !== 'assetId' || args.op === 'set';
    case 'applyStyle':
      return field !== 'styleId' || args.op === 'apply';
    case 'pixiInit':
      return field !== 'effectId' && field !== 'target' || field === 'effectId' && args.scope === 'instance' || field === 'target' && args.scope === 'target';
    default:
      return true;
  }
}

function defaultsForFields(fields: readonly FieldSpec[], args: Record<string, Json>): Record<string, Json> {
  const result = { ...args };
  for (const field of fields) {
    if (Object.hasOwn(result, field.path)) {
      result[field.path] = fillSelectedStructure(field, result[field.path]!);
      continue;
    }
    // A null default is also the catalog sentinel for missing author input.
    if (field.default === null) continue;
    if (Array.isArray(field.default) && field.minItems !== undefined && field.default.length < field.minItems) continue;
    result[field.path] = fillSelectedStructure(field, structuredClone(field.default));
  }
  return result;
}

function fillSelectedStructure(field: FieldSpec, value: Json): Json {
  if (isObject(value) && field.children?.length) return defaultsForFields(field.children, value);
  if (Array.isArray(value) && field.item) return value.map(item => fillSelectedStructure(field.item!, item));
  return value;
}

/** Initial values for structured creation only. The compiler owns legacy omission and runtime inheritance. */
export function commandCreationDefaults(spec: CommandSpec, input: Record<string, Json>, context: CreationContext): Record<string, Json> {
  if (!coreCommands.has(spec.key)) return defaultsForFields(spec.fields, input);

  const command = spec.key;
  const mode = { op: spec.fields.find(field => field.path === 'op')?.default, scope: spec.fields.find(field => field.path === 'scope')?.default, ...input };
  const fields = spec.fields.filter(field =>
    isCommandCreationField(command, field.path, mode) &&
    // These fields are resolved from the operation, object or resource.
    !['effects', 'model', 'playback', 'parameters', 'when', 'continue', 'skippable', 'note', 'ruleImage', 'events', 'transition'].includes(field.path) &&
    !(command === 'changeFigure' && (['z', 'framing'].includes(field.path) || field.path === 'station' && mode.op !== 'show')));
  const args = { ...input };
  for (const field of fields) {
    if (Object.hasOwn(input, field.path)) {
      if (field.path === 'segments' && Array.isArray(input[field.path]) && field.item?.children) {
        const timing = field.item.children.filter(child => child.path === 'durationMs' || child.path === 'easing');
        args[field.path] = (input[field.path] as Json[]).map(segment => isObject(segment) ? defaultsForFields(timing, segment) : segment);
      } else if (field.path === 'options' || field.path === 'illustrationFrame') {
        args[field.path] = fillSelectedStructure(field, input[field.path]!);
      }
      continue;
    }
    if (field.default !== null) args[field.path] = structuredClone(field.default);
  }
  if ((command === 'changeBg' || command === 'changeScene') && Object.hasOwn(input, 'ruleImage')) {
    const rule = RuleImageTransitionSchema.safeParse(input.ruleImage);
    if (rule.success) args.ruleImage = rule.data;
  }

  const initial = (path: string, value: Json) => {
    if (!Object.hasOwn(input, path)) args[path] = value;
  };
  if (command === 'say') initial('speaker', { kind: 'narrator' });
  if (command === 'getUserInput') {
    const language = context.textLocale.split('-')[0]?.toLowerCase();
    const [prompt, error] = language === 'zh' ? ['请输入', '请检查输入'] :
      language === 'ja' ? ['入力してください', '入力内容を確認してください'] : ['Enter your response', 'Check your response'];
    initial('prompt', prompt);
    initial('errorText', error);
  }
  if (command === 'changeBg') {
    initial('transition', mode.op === 'clear' ? { exit: fade(400) } : { enter: fade(400), exit: fade(400) });
  } else if (command === 'changeFigure') {
    if (mode.op === 'show') {
      initial('transition', { enter: fade(300, 'cubic', 'out'), exit: fade(250, 'cubic') });
    } else if (mode.op === 'exit') initial('transition', { exit: fade(250, 'cubic') });
  } else if (command === 'characterDifference' || command === 'changeIllustrationDiff') {
    initial('transition', fade(180));
  } else if (command === 'changeIllustration' && mode.op === 'show') {
    const frame = spec.fields.find(field => field.path === 'illustrationFrame');
    if (frame?.children) initial('illustrationFrame', defaultsForFields(frame.children, {}));
  }
  return args;
}

/** Materialize a new command using the transaction owner's identity namespace. */
export function createCommandArgs(spec: CommandSpec, input: Record<string, Json>, context: CreationContext, allocate: () => string): Record<string, Json> {
  const args = commandCreationDefaults(spec, input, context);
  const assign = (key: string) => { if (!Object.hasOwn(args, key)) args[key] = allocate(); };
  if (spec.key === 'label') assign('labelId');
  if (['changeBg', 'changeFigure', 'changeIllustration'].includes(spec.key) && args.op === 'show') assign('objectId');
  if (['setAnimation', 'setComplexAnimation'].includes(spec.key)) assign('animationId');
  if (spec.key === 'pixi') assign('effectId');
  if (spec.key === 'playEffect' && args.op === 'play') assign('soundId');
  const members = spec.key === 'choose' ? 'options' : spec.key === 'say' ? 'events' : null;
  if (members && Array.isArray(args[members])) {
    args[members] = args[members].map(item => isObject(item) && !Object.hasOwn(item, 'id') ? { ...item, id: allocate() } : item);
  }
  return presentationArgs(spec.key, args);
}
