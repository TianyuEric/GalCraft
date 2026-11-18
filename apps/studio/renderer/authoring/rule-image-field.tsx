import { RuleImageTransitionSchema } from '@galcraft/contracts';
import type { Asset, Id } from '@galcraft/contracts';
import { resolveStaticStageImage } from '@galcraft/dsl';
import { domButton } from '../components/dom-button.js';
import { Field } from '../components/controls.js';
import { Input } from '../components/ui/input.js';
import { requestDialog } from '../components/request-dialog.js';
import { openAssetPicker } from './asset-picker.js';
import type { AuthoringServices, StudioLocale } from './controller.js';
import type { FieldCommit } from './portrait-model.js';

export function ruleImageField(value: unknown, commit: FieldCommit, assets: readonly Asset[], locale: StudioLocale, context: {
  services: AuthoringServices; projectId: Id; sceneId?: Id; scope: HTMLElement; cache(asset: Asset): void;
}): HTMLElement {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const root = document.createElement('section');
  root.className = 'rule-image-field';
  const current = RuleImageTransitionSchema.safeParse(value).data;
  const asset = assets.find(item => item.id === current?.assetId);
  const help = document.createElement('p');
  help.className = 'field-help';
  help.textContent = current
    ? `${asset?.name ?? t('规则图片不可用', 'Rule image unavailable', 'ルール画像なし')} · ${current.durationMs} ms · ${Math.round(current.softness * 100)}%`
    : t('按静态灰度图片逐步显示。默认暗部先换。', 'Reveal using a static grayscale image. Dark areas change first by default.', '静止グレースケール画像で切り替えます。既定では暗い部分が先に変わります。');
  const feedback = document.createElement('p'); feedback.className = 'field-error'; feedback.setAttribute('role', 'alert');
  const pick = domButton(current ? t('替换规则图', 'Replace rule image', 'ルール画像を置換') : t('选择规则图', 'Choose rule image', 'ルール画像を選択'), async () => {
    await openAssetPicker({ ...context, allowedKinds: ['image'], locale, currentAssetId: current?.assetId, currentVariantId: current?.variantId,
      purpose: t('静态灰度规则图', 'Static grayscale rule image', '静止グレースケールのルール画像'),
      mode: 'compact', returnFocus: pick, remember: false,
      onApply: async choice => {
        const variantId = choice.variantId ?? choice.asset.activeVariantId;
        if (!resolveStaticStageImage([choice.asset], choice.assetId, variantId).variant)
          throw new Error(t('请选择静态图片版本。', 'Choose a static image version.', '静止画像のバージョンを選択してください。'));
        const next = RuleImageTransitionSchema.parse({ durationMs: 600, ...current, assetId: choice.assetId, variantId });
        context.cache(choice.asset);
        const result = await commit(next);
        return result ?? { ok: true, value: undefined, warnings: [] };
      },
    });
  });
  root.append(help, pick);
  if (current) {
    const timing = domButton(t('规则图时序', 'Rule image timing', 'ルール画像のタイミング'), async () => {
      let duration = String(current.durationMs), softness = String(current.softness * 100), reverse = current.reverse;
      let easing = current.easing;
      await requestDialog({ locale, title: t('规则图时序', 'Rule image timing', 'ルール画像のタイミング'),
        content: <>
          <Field label={t('时长（毫秒）', 'Duration (ms)', '時間（ミリ秒）')}>
            <Input type="number" min={1} step="any" required defaultValue={duration} onChange={event => { duration = event.target.value; }}/>
          </Field>
          <Field label={t('柔边（%）', 'Soft edge (%)', '境界の柔らかさ（%）')}>
            <Input type="number" min={0} max={100} step="any" required defaultValue={softness} onChange={event => { softness = event.target.value; }}/>
          </Field>
          <label className="authoring-field"><input type="checkbox" defaultChecked={reverse} onChange={event => { reverse = event.target.checked; }}/>
            {t('亮部先换', 'Change light areas first', '明るい部分を先に切り替え')}</label>
          <Field label={t('缓动', 'Easing', 'イージング')}>
            <select defaultValue={easing.family} onChange={event => { easing = { ...easing, family: event.target.value as typeof easing.family }; }}>
              {['linear', 'sine', 'quad', 'cubic', 'quart', 'quint', 'expo', 'circ', 'back', 'elastic', 'bounce'].map(name => <option key={name}>{name}</option>)}
            </select>
          </Field>
          <Field label={t('缓动方向', 'Easing direction', 'イージング方向')}>
            <select defaultValue={easing.direction} onChange={event => { easing = { ...easing, direction: event.target.value as typeof easing.direction }; }}>
              <option value="in">{t('渐入', 'Ease in', 'イーズイン')}</option>
              <option value="out">{t('渐出', 'Ease out', 'イーズアウト')}</option>
              <option value="inOut">{t('渐入渐出', 'Ease in and out', 'イーズインアウト')}</option>
            </select>
          </Field>
        </>,
        confirm: async () => {
          const next = RuleImageTransitionSchema.parse({ ...current, durationMs: Number(duration), softness: Number(softness) / 100, reverse, easing });
          const result = await commit(next);
          if (result && !result.ok) throw new Error(result.error.message);
        },
      });
    });
    root.append(timing);
  }
  if (value != null) root.append(domButton(t('移除规则图', 'Remove rule image', 'ルール画像を削除'), async () => {
    const result = await commit(null);
    if (result && !result.ok) feedback.textContent = result.error.message;
  }));
  root.append(feedback);
  return root;
}
