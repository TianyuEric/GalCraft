import type { Asset, FieldSpec, Json, Result } from '@galcraft/contracts';

export type FieldCommit = (value: Json) => void | Result<unknown> | Promise<void | Result<unknown>>;
type FieldRenderer = (field: FieldSpec, value: unknown, commit: FieldCommit) => HTMLElement;
const object = (value: unknown): Record<string, Json> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Json> : {};

/** The saved model object stays the existing DSL contract; only the applicable controls change. */
export function portraitModelFields(spec: FieldSpec, kind: 'image' | 'live2d'): FieldSpec[] {
  return (spec.children ?? []).filter(field => kind === 'image' ? field.path.startsWith('image') : !field.path.startsWith('image'));
}

export function renderPortraitModel(spec: FieldSpec, value: unknown, asset: Asset | undefined, kind: 'image' | 'live2d',
  locale: string, render: FieldRenderer, commit: FieldCommit, inspect?: () => Promise<Result<Asset | null>>): HTMLElement {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const root = document.createElement('section'); root.className = 'portrait-model-controls'; root.dataset.modelKind = kind;
  let current = { ...object(value) };
  const update = (path: string, next: Json) => { current = { ...current, [path]: next }; return commit(current); };
  const hint = (text: string) => { const node = document.createElement('p'); node.className = 'field-help'; node.textContent = text; return node; };
  const fields = portraitModelFields(spec, kind);
  if (kind === 'image') {
    root.append(hint(t('用角色差分设置口型与眨眼；开启后选择对应图片。', 'Use character variations for mouth shapes and blinking.', '差分画像で口形やまばたきを設定します。')));
    for (const field of fields) {
      const control=render(field,current[field.path],next=>update(field.path,next));
      if(field.path==='imageFaceCombinations'){
        const details=document.createElement('details'),summary=document.createElement('summary');details.className='portrait-parameters';
        summary.textContent=t('组合差分（可选）','Combined variations (optional)','組み合わせ差分（任意）');details.append(summary,control);root.append(details);
      }else root.append(control);
    }
    return root;
  }
  root.append(hint(t('请启用此素材类型的精确插件以编辑模型参数。', 'Enable the exact asset type plugin to edit model parameters.', 'モデルパラメーターの編集には固定済みプラグインを有効にしてください。')));
  return root;
}
