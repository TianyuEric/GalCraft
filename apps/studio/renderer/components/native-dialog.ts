import { createId } from '@galcraft/contracts';
/** Give the legacy authoring dialogs the same chrome as the React dialogs. */
export function layoutNativeDialog(dialog: HTMLDialogElement, locale: string): void {
  if (dialog.dataset.dialogLayout || !dialog.matches('.authoring-command-dialog,.designer-dialog')) return;
  dialog.dataset.dialogLayout = 'true';
  dialog.classList.add('studio-native-dialog');
  const title = dialog.querySelector('h2');
  const header = document.createElement('header'); header.className = 'studio-dialog-header';
  if (title) {
    title.id ||= `dialog-title-${createId()}`;
    dialog.setAttribute('aria-labelledby', title.id); header.append(title);
  }
  const body = document.createElement('div'); body.className = 'studio-dialog-body';
  const footer = document.createElement('footer'); footer.className = 'studio-dialog-footer dialog-actions';
  const isCommit = /^(应用|Apply|適用|确认|Confirm|確認|插入|Insert|追加|编译并应用|Compile and apply|コンパイルして適用|应用此模板|Apply template|テンプレートを適用)$/;
  const place = (child: Element) => {
    // React owns portal placement and removes it from its original parent.
    if (child.matches('.studio-popover-portal,[data-base-ui-portal],[data-portal]')) return;
    if (child.matches('footer,.authoring-toolbar')) { footer.append(...child.childNodes); child.remove(); }
    else if (child instanceof HTMLButtonElement && (/^(关闭|Close|閉じる|取消|Cancel|キャンセル)$/.test(child.textContent?.trim() ?? '') || isCommit.test(child.textContent?.trim() ?? ''))) footer.append(child);
    else body.append(child);
  };
  for (const child of [...dialog.children]) place(child);
  if (!footer.querySelector('button')) {
    const close=document.createElement('button');close.type='button';close.textContent=locale==='en'?'Close':locale==='ja'?'閉じる':'关闭';
    close.addEventListener('click',()=>dialog.close());footer.append(close);
  }
  // Creation dialogs identify their committing action with Apply; auxiliary actions stay quiet.
  const styleActions = () => { for (const button of footer.querySelectorAll('button')) {
    const text = button.textContent?.trim() ?? '';
    if (isCommit.test(text)) button.classList.add('authoring-primary');
    if (/^(关闭|Close|閉じる)$/.test(text)) button.classList.add('studio-button-quiet');
  } };
  styleActions();
  dialog.prepend(header);dialog.append(body,...(footer.childNodes.length ? [footer] : []));
  // The page designer loads asset choices and template details after opening.
  const observer = new MutationObserver(() => {
    for (const child of [...dialog.children]) if (child !== header && child !== body && child !== footer) place(child);
    styleActions();
    if (footer.childNodes.length && footer.parentElement !== dialog) dialog.append(footer);
  });
  observer.observe(dialog, { childList: true });
  dialog.addEventListener('close', () => observer.disconnect(), { once: true });
}
