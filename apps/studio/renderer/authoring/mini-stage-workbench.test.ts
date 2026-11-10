import { afterEach, expect, test, vi } from 'vitest';
import { MiniStage, type MiniStageWorkbenchState } from './mini-stage.js';

vi.mock('./player-preview.js', () => ({ openPlayerPreview: vi.fn() }));
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: vi.fn(), unmount: vi.fn() }) }));

class Element {
  children: Element[] = []; parentElement: Element | null = null; dataset: Record<string, string> = {};
  className = ''; textContent = ''; ariaPressed = ''; disabled = false; hidden = false; onclick?: () => void;
  constructor(readonly tag: string) {}
  append(...items: Element[]) { items.forEach(item => { item.parentElement = this; this.children.push(item); }); }
  querySelectorAll(tag: string): Element[] { return this.children.flatMap(item => [...(item.tag === tag ? [item] : []), ...item.querySelectorAll(tag)]); }
  setAttribute() {}
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(item => item !== this); this.parentElement = null; }
  replaceChildren(...items: Element[]) { this.children.forEach(item => { item.parentElement = null; }); this.children = []; this.append(...items); }
}
function setup() {
  vi.useFakeTimers();
  vi.stubGlobal('document', { createElement: (tag: string) => new Element(tag) });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  return new MiniStage({} as ConstructorParameters<typeof MiniStage>[0]);
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test('formal buttons and workbench controls select the same runtime modes without starting a second Player', () => {
  const stage = setup(), target = { sceneId: 'scene', statementId: 'statement' };
  const controls = (stage.root as unknown as Element).children.find(item => item.className.includes('mini-stage-controls'))!;
  stage.update('document:1', target);
  controls.children[2]!.onclick!();
  const observations: MiniStageWorkbenchState[] = [];
  const release = stage.useWorkbenchControls(state => observations.push(state));
  expect(observations.at(-1)).toMatchObject({ mode: 'playtest', hasTarget: true, ready: false, muted: true });
  expect(controls.parentElement).toBeNull();
  expect((stage.root as unknown as Element).children.some(item => item.className === 'studio-mini-player')).toBe(true);
  stage.stop();
  expect(observations.at(-1)?.mode).toBe('inspection');
  stage.setMuted(false);
  expect(observations.at(-1)?.muted).toBe(false);
  stage.run('current');
  expect(observations.at(-1)?.mode).toBe('current');
  stage.update('hidden', null);
  expect(controls.children[2]!.disabled).toBe(true);
  stage.run('playtest');
  expect(observations.at(-1)).toMatchObject({ mode: 'inspection', hasTarget: false });
  const count = observations.length;
  release(); stage.setMuted(true);
  expect(observations).toHaveLength(count);
  stage.dispose();
});

test('workbench pause and sound address the existing preview session and preserve inspection silence', () => {
  const stage = setup(); let paused = false;
  const player = {
    session: { inspect: () => ({ status: paused ? 'paused' : 'running' }), setPreviewPaused: vi.fn((next: boolean) => { paused = next; }) },
    view: { render: vi.fn() }, setPreviewMuted: vi.fn(), dispose: vi.fn(),
  };
  Object.assign(stage, { player, mode: 'current' });
  const observations: MiniStageWorkbenchState[] = [];
  stage.useWorkbenchControls(state => observations.push(state));
  stage.pauseOrResume(); expect(observations.at(-1)?.paused).toBe(true);
  stage.pauseOrResume(); expect(observations.at(-1)?.paused).toBe(false);
  stage.setMuted(false); expect(player.setPreviewMuted).toHaveBeenLastCalledWith(false);
  Object.assign(stage, { mode: 'inspection' });
  stage.setMuted(false); expect(player.setPreviewMuted).toHaveBeenLastCalledWith(true);
  stage.pauseOrResume(); expect(player.session.setPreviewPaused).toHaveBeenCalledTimes(2);
  stage.dispose(); expect(player.dispose).toHaveBeenCalledOnce();
});
