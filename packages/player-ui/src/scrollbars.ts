/** Keeps a scrolling region visible briefly after wheel, keyboard or touch scrolling. */
export function installTransientScrollbars(root: HTMLElement): () => void {
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  const onScroll = (event: Event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const surface = event.target;
    surface.dataset.scrolling = "true";
    clearTimeout(timers.get(surface));
    timers.set(
      surface,
      setTimeout(() => {
        delete surface.dataset.scrolling;
        timers.delete(surface);
      }, 900),
    );
  };
  root.addEventListener("scroll", onScroll, true);
  return () => {
    root.removeEventListener("scroll", onScroll, true);
    for (const [surface, timer] of timers) {
      clearTimeout(timer);
      delete surface.dataset.scrolling;
    }
    timers.clear();
  };
}
