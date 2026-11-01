import { useLayoutEffect, useRef } from 'react';
/** Preserve the DOM editor's owned subtree when a registry component supplies its surface. */
export function OwnedDom({ node }: { node: HTMLElement }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { host.current?.append(node); return () => { node.remove(); }; }, [node]);
  return <div ref={host} className="gc-owned-dom"/>;
}
