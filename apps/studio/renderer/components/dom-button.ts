import { buttonVariants } from './ui/button.js';
/** DOM editors adapt the same 9ui Button variants while retaining their native element API. */
export function domButton(label: string, run: () => void | Promise<void>, className = ''): HTMLButtonElement {
  const node = document.createElement('button');
  node.type='button';node.dataset.slot='button';node.dataset.variant=className.includes('authoring-primary')?'default':className.includes('authoring-copy-action')?'ghost':'outline';
  node.className=buttonVariants({variant:node.dataset.variant as 'default'|'outline'|'ghost',size:'sm',className:`gc-button studio-button ${className}`});
  node.textContent=label;node.addEventListener('click',()=>{void run();});return node;
}
