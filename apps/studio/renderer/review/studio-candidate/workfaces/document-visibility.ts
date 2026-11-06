import { useLayoutEffect, useState, type RefObject } from 'react';

/** Dock can show several panes while only one receives workbench commands. */
export function useDocumentVisibility(root: RefObject<HTMLElement | null>, projectActive: boolean) {
  const [visible, setVisible] = useState(false);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const update = () => setVisible(projectActive && element.offsetWidth > 0 && element.offsetHeight > 0);
    const observer = new ResizeObserver(update);
    update();
    observer.observe(element);
    return () => observer.disconnect();
  }, [root, projectActive]);
  return projectActive && visible;
}
