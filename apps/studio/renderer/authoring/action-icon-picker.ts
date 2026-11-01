import type { ActionIconPreset } from '@galcraft/contracts';
import { domButton } from '../components/dom-button.js';
import { prepareNativeDialog } from '../components/motion.js';

export function openActionIconPicker({ root, presets, locale, origin, select }: {
  root: HTMLElement; presets: ActionIconPreset[]; locale: string; origin: HTMLElement;
  select(key: string): Promise<void>;
}) {
  const dialog = document.createElement('dialog'); dialog.className = 'action-icon-picker';
  const theme=root.closest<HTMLElement>('[data-theme]')?.dataset.theme;if(theme)dialog.dataset.theme=theme;
  dialog.setAttribute('aria-label', locale === 'en' ? 'Common icons' : locale === 'ja' ? 'よく使うアイコン' : '常用图标');
  const title = document.createElement('h2'); title.textContent = dialog.ariaLabel;
  const grid = document.createElement('div'); grid.className = 'action-icon-picker-grid';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  let pending = false;
  const controls = presets.map(preset => {
    const button = domButton(preset.names[locale] ?? preset.names['zh-CN'] ?? preset.key, async () => {
      if (pending) return; pending = true; controls.forEach(button => button.disabled = true);
      try { await select(preset.key); dialog.close(); }
      catch (error) { status.textContent = String(error); }
      finally { pending = false; controls.forEach(button => button.disabled = false); }
    });
    const image = document.createElement('span'); image.className = 'action-icon-picker-preview'; image.ariaHidden = 'true'; image.style.maskImage = `url("${preset.previewUri}")`;
    button.prepend(image); grid.append(button); return button;
  });
  const close = domButton(locale === 'en' ? 'Cancel' : locale === 'ja' ? 'キャンセル' : '取消', () => dialog.close());
  dialog.append(title, grid, status, close); root.append(dialog); prepareNativeDialog(dialog);
  dialog.addEventListener('close', () => { dialog.remove(); if (origin.isConnected) origin.focus(); }, { once: true });
  dialog.showModal(); controls[0]?.focus();
}
