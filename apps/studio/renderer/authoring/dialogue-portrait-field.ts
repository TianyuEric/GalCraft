import { createId } from '@galcraft/contracts';
import type { Asset, DialoguePortrait, Json } from '@galcraft/contracts';
import type { FieldCommit } from './portrait-model.js';
import { constrainPortraitCrop, defaultPortraitCrop, movePortraitCrop, resizePortraitCrop, type CropCorner, type PortraitCrop } from './portrait-crop.js';
import './dialogue-portrait-field.css';

export function dialoguePortraitField(value: unknown, asset: Asset | undefined, locale: string, commit: FieldCommit, showPreview?: () => void): HTMLElement {
  const t = (zh: string, en: string, ja: string) => locale === 'en' ? en : locale === 'ja' ? ja : zh;
  const current = value as Partial<DialoguePortrait> | null;
  const draft: DialoguePortrait = { enabled: current?.enabled ?? false, crop: { ...defaultPortraitCrop, ...current?.crop } };
  const initial = structuredClone(draft);
  const root = document.createElement('section'); root.className = 'dialogue-portrait-editor';
  const makeButton = (label: string, action: () => void) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.onclick = action; return button; };
  const label = document.createElement('label'), enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = draft.enabled;
  label.append(enabled, t('显示当前立绘的说话头像', 'Show speaking portrait from this figure', 'この立ち絵の話者ポートレートを表示')); root.append(label);
  const detail = document.createElement('div'); detail.className = 'dialogue-portrait-detail'; detail.hidden = !draft.enabled; root.append(detail);
  const hint = document.createElement('p'); hint.className = 'field-help'; hint.id = `portrait-hint-${createId()}`;
  hint.textContent = t('拖动选框移动，拖动四角调整大小。方向键微调，Shift 加快；角点方向键调整大小，Esc 取消本次拖动。', 'Drag the frame to move; drag its corners to resize. Arrow keys fine-tune, Shift moves faster; corner arrow keys resize. Esc cancels a drag.', '枠をドラッグして移動、四隅でサイズを調整。矢印キーで微調整、Shift で大きく調整。隅の矢印キーでサイズ変更、Esc でドラッグを取消。'); detail.append(hint);
  const preview = document.createElement('div'); preview.className = 'dialogue-portrait-crop';
  const image = document.createElement('img'); image.alt = t('头像取景参考', 'Portrait framing reference', 'ポートレート構図の参照'); image.draggable = false;
  const rect = document.createElement('div'); rect.className = 'dialogue-portrait-crop-rect'; rect.tabIndex = 0; rect.setAttribute('role', 'group');
  rect.ariaLabel = t('头像选框：使用方向键移动', 'Portrait frame: use arrow keys to move', 'ポートレート枠：矢印キーで移動'); rect.setAttribute('aria-describedby', hint.id);
  if (asset?.kind === 'image') { image.dataset.assetId = asset.id; image.dataset.variantId = asset.activeVariantId; preview.append(image, rect); detail.append(preview); }
  else { const note = document.createElement('p'); note.className = 'field-help'; note.textContent = t('Live2D 头像复用舞台实例；用下方数值调整并在试玩中查看取景。', 'Live2D reuses the stage instance. Adjust the values below and check the crop in playtest.', 'Live2D は舞台のインスタンスを再利用します。下の数値で調整し、テストプレイで構図を確認してください。'); detail.append(note); }
  const inputs = new Map<keyof PortraitCrop, HTMLInputElement>();
  const summary = document.createElement('output'); summary.className = 'dialogue-portrait-summary';
  const draw = () => {
    const crop = draft.crop; rect.style.cssText = `left:${crop.x * 100}%;top:${crop.y * 100}%;width:${crop.width * 100}%;height:${crop.height * 100}%`;
    for (const [key, input] of inputs) input.value = String(Math.round(crop[key] * 1000) / 10);
    summary.textContent = t(`取景 ${Math.round(crop.width * 100)}% × ${Math.round(crop.height * 100)}%`, `Crop ${Math.round(crop.width * 100)}% × ${Math.round(crop.height * 100)}%`, `範囲 ${Math.round(crop.width * 100)}% × ${Math.round(crop.height * 100)}%`);
  };
  const setCrop = (crop: PortraitCrop) => { draft.crop = constrainPortraitCrop(crop); draw(); };
  const keys = (event: KeyboardEvent, corner?: CropCorner) => {
    const step = event.shiftKey ? .05 : .01, dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return; event.preventDefault(); event.stopPropagation();
    setCrop(corner ? resizePortraitCrop(draft.crop, corner, dx, dy) : movePortraitCrop(draft.crop, dx, dy));
  };
  let cancelDrag: (() => void) | null = null;
  const drag = (event: PointerEvent, corner?: CropCorner) => {
    if (event.button !== 0) return; event.preventDefault(); event.stopPropagation();
    const target = event.currentTarget as HTMLElement, bounds = preview.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
    cancelDrag?.();
    const start = { x: event.clientX, y: event.clientY, crop: { ...draft.crop } }; target.focus(); target.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => { if (next.pointerId !== event.pointerId) return;
      const dx = (next.clientX - start.x) / bounds.width, dy = (next.clientY - start.y) / bounds.height;
      setCrop(corner ? resizePortraitCrop(start.crop, corner, dx, dy) : movePortraitCrop(start.crop, dx, dy)); };
    const finish = (restore = false) => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', cancel); target.removeEventListener('lostpointercapture', cancel); root.removeEventListener('keydown', escape);
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      cancelDrag = null; if (restore) setCrop(start.crop);
    };
    const end = (next: PointerEvent) => { if (next.pointerId === event.pointerId) finish(); };
    const cancel = () => finish(true);
    const escape = (next: KeyboardEvent) => { if (next.key === 'Escape') { next.preventDefault(); next.stopPropagation(); cancel(); } };
    cancelDrag = cancel;
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', cancel); target.addEventListener('lostpointercapture', cancel); root.addEventListener('keydown', escape);
  };
  rect.onpointerdown = event => drag(event); rect.onkeydown = event => keys(event);
  for (const [corner, name] of [['nw', t('左上角', 'Top left', '左上')], ['ne', t('右上角', 'Top right', '右上')], ['sw', t('左下角', 'Bottom left', '左下')], ['se', t('右下角', 'Bottom right', '右下')]] as const) {
    const handle = makeButton(name, () => {}); handle.className = `dialogue-portrait-handle handle-${corner}`; handle.ariaLabel = t(`${name}：方向键调整大小`, `${name}: arrow keys resize`, `${name}：矢印キーでサイズ変更`); handle.title = handle.ariaLabel;
    handle.onpointerdown = event => drag(event, corner); handle.onkeydown = event => keys(event, corner); rect.append(handle);
  }
  const controls = document.createElement('div'); controls.className = 'dialogue-portrait-values';
  for (const [key, title] of [['x',t('左侧 %','Left %','左 %')],['y',t('顶部 %','Top %','上 %')],['width',t('宽度 %','Width %','幅 %')],['height',t('高度 %','Height %','高さ %')]] as const) {
    const row = document.createElement('label'), input = document.createElement('input'); row.textContent = title; input.ariaLabel = title; input.type = 'number'; input.min = ['width', 'height'].includes(key) ? '1' : '0'; input.max = '100'; input.step = '.1';
    input.onchange = () => setCrop({ ...draft.crop, [key]: Number(input.value) / 100 }); inputs.set(key, input); row.append(input); controls.append(row);
  }
  detail.append(controls, summary);
  const actions = document.createElement('div'); actions.className = 'dialogue-portrait-actions';
  actions.append(makeButton(t('居中取景', 'Center crop', '中央に配置'), () => setCrop({ ...draft.crop, x: (1 - draft.crop.width) / 2, y: (1 - draft.crop.height) / 2 })),
    makeButton(t('恢复默认范围', 'Default crop', '既定の範囲'), () => setCrop({ ...defaultPortraitCrop })));
  detail.append(actions);
  const rule = document.createElement('p'); rule.className = 'field-help'; rule.textContent = t('范围基于原角色画布，沿用当前表情。旁白不显示；同一角色有多个实例时，请指定对白目标。', 'The crop uses the original character canvas and follows the current expression. Narration has no portrait; select a dialogue target for multiple instances.', '元のキャラクターキャンバスを基準に、現在の表情に追従います。ナレーションは非表示。複数ある場合は台詞の対象を指定してください。'); detail.append(rule);
  enabled.onchange=()=>{draft.enabled=enabled.checked;detail.hidden=!draft.enabled;if(draft.enabled)showPreview?.();};
  const footer = document.createElement('div'); footer.className = 'dialogue-portrait-actions';
  footer.append(makeButton(t('还原修改', 'Revert edits', '変更を戻す'), () => { cancelDrag?.(); draft.enabled = initial.enabled; draft.crop = { ...initial.crop }; enabled.checked = draft.enabled; detail.hidden = !draft.enabled; draw(); }));
  const apply = makeButton(t('应用头像设置', 'Apply portrait settings', 'ポートレート設定を適用'), () => void commit(structuredClone(draft) as unknown as Json)); apply.className = 'portrait-apply'; footer.append(apply);
  root.append(footer); draw(); return root;
}
