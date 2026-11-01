import type { FieldSpec } from '@galcraft/contracts';

export type FieldError = { path: string; message: string };
export function validateFields(fields: readonly FieldSpec[], values: Record<string, unknown>, label: (field: FieldSpec) => string, locale = 'zh-CN', prefix = ''): FieldError[] {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  return fields.flatMap(field => {
    const path = prefix + field.path, value = values[field.path], name = label(field);
    const issue = (message: string): FieldError[] => [{ path, message }];
    const empty = value === undefined || value === null || typeof value === 'string' && !value.trim();
    if (empty) return field.required ? issue(t(`请填写${name}`, `Enter ${name}`, `${name}を入力してください`)) : [];
    if (field.type === 'object' && typeof value === 'object' && !Array.isArray(value)) {
      const object = value as Record<string, unknown>;
      const imageAnimation = ['imageMouth', 'imageBlink'].includes(field.path);
      const children = (field.children ?? []).map(child => imageAnimation && ['open', 'closed'].includes(child.path)
        ? { ...child, required: object.enabled === true } : field.path === 'motion' && object.op === 'stop' ? { ...child, required: false } :
          field.path === 'target' && (object.kind === 'scene' && child.path === 'sceneId' || object.kind === 'page' && child.path === 'pageId') ? { ...child, required: true } : child);
      return validateFields(children, object, label, locale, path + '.');
    }
    if (field.type === 'array' && Array.isArray(value)) {
      if (field.minItems !== undefined && value.length < field.minItems) return issue(t(`${name}至少需要 ${field.minItems} 项`, `${name} needs at least ${field.minItems} items`, `${name}は${field.minItems}件以上必要です`));
      return field.item ? value.flatMap((item, i) => validateFields([{ ...field.item!, path: String(i) }], { [i]: item }, label, locale, path + '.')) : [];
    }
    if (field.type === 'number' || field.type === 'integer') {
      if (typeof value !== 'number' || !Number.isFinite(value) || field.type === 'integer' && !Number.isSafeInteger(value))
        return issue(t(`${name}需要有效${field.type === 'integer' ? '整数' : '数字'}`, `Enter a valid ${field.type === 'integer' ? 'integer' : 'number'} for ${name}`, `${name}に有効な数値を入力してください`));
      if (field.min !== undefined && value < field.min || field.max !== undefined && value > field.max || field.exclusiveMin !== undefined && value <= field.exclusiveMin)
        return issue(t(`${name}超出允许范围`, `${name} is out of range`, `${name}が範囲外です`));
    }
    return [];
  });
}

/** Conditional requirements match the command compiler's supported operations. */
export function commandFields(command: string, fields: readonly FieldSpec[], args: Record<string, unknown>): FieldSpec[] {
  const op = args.op ?? fields.find(field => field.path === 'op')?.default;
  const required = new Set<string>();
  if (command === 'changeBg' && op !== 'clear' || command === 'bgm' && op === 'play' || command === 'miniAvatar' && op === 'set') required.add('assetId');
  if (command === 'changeFigure' && op === 'show') { if(args.difference!==true)required.add('assetId'); required.add('characterId'); }
  if (command === 'changeIllustration' && op !== 'exit' || command === 'changeIllustrationDiff' && !args.stateName) required.add('assetId');
  if (command === 'playEffect') { if (op === 'play') { required.add('assetId'); required.add('soundId'); } else if (args.all !== true) required.add('soundId'); }
  if (command === 'pixiInit' && args.scope === 'instance') required.add('effectId');
  if (command === 'pixiInit' && args.scope === 'target') required.add('target');
  if (command === 'applyStyle' && op !== 'reset') required.add('styleId');
  return fields.map(field => ({ ...field, required: command === 'intro' && op === 'clear' && field.path === 'paragraphs' ? false : field.required || required.has(field.path) }));
}
