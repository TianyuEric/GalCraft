import type { Json, Result } from '@galcraft/contracts';

export type FieldCommit = (value: Json) => void | Result<unknown> | Promise<void | Result<unknown>>;
export function renderPortraitModel(kind: 'image' | 'live2d', locale: string): HTMLElement {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const root = document.createElement('section'); root.className = 'portrait-model-controls'; root.dataset.modelKind = kind;
  const hint = document.createElement('p'); hint.className = 'field-help';
  hint.textContent = kind === 'image'
    ? t('用共同差分切换整张立绘。', 'Use shared variations to swap the full figure image.', '共通差分で立ち絵全体を切り替えます。')
    : t('请启用此素材类型的精确插件以编辑模型参数。', 'Enable the exact asset type plugin to edit model parameters.', 'モデルパラメーターの編集には固定済みプラグインを有効にしてください。');
  root.append(hint);
  return root;
}
