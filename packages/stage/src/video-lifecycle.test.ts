import { describe, expect, it, vi } from 'vitest';
import { FixtureIds } from '@galcraft/contracts/fixtures';
import { VideoController } from './video.js';

function setup() {
  const video = { src: '', currentTime: 0, style: { opacity: '1' }, onended: null as null | (() => void),
    onerror: null as null | (() => void), pause: vi.fn(), play: vi.fn(async () => {}), removeAttribute() {}, load() {} };
  const completed = vi.fn();
  const controller = new VideoController(video as unknown as HTMLVideoElement, completed);
  const input = { token: { sessionId: FixtureIds.session, occurrence: 1, statementId: FixtureIds.statements[0]! }, url: 'movie.mp4', skipFadeMs: 100 };
  return { video, completed, controller, input };
}

describe('foreground video pause lifecycle', () => {
  it('holds playback until the paused player resumes and preserves the media cursor', async () => {
    const { video, controller, input } = setup();
    await controller.setPause(true); expect((await controller.start(input)).ok).toBe(true);
    expect(video.play).not.toHaveBeenCalled();
    await controller.setPause(false); expect(video.play).toHaveBeenCalledTimes(1);
    video.currentTime = 4; await controller.setPause(true); controller.tick(1000);
    await controller.setPause(false); expect(video.currentTime).toBe(4);
    expect(video.play).toHaveBeenCalledTimes(2); controller.dispose();
  });

  it('freezes a skip fade and completes it once after resuming', async () => {
    const { video, completed, controller, input } = setup();
    await controller.start(input); expect(controller.input('mouseRight')).toBe(true);
    controller.tick(25); expect(video.style.opacity).toBe('0.75');
    await controller.setPause(true); controller.tick(5000);
    expect(video.style.opacity).toBe('0.75'); expect(completed).not.toHaveBeenCalled();
    expect(controller.input('mouseRight')).toBe(false);
    await controller.setPause(false); controller.tick(75);
    expect(completed).toHaveBeenCalledTimes(1); expect(completed.mock.calls[0]![0].outcome).toBe('skipped');
    controller.tick(1000); expect(completed).toHaveBeenCalledTimes(1); controller.dispose();
  });

  it('defers an already queued end callback while paused and delivers it on resume', async () => {
    const { video, completed, controller, input } = setup();
    await controller.start(input); await controller.setPause(true); video.onended?.();
    expect(completed).not.toHaveBeenCalled();
    await controller.setPause(false); expect(completed).toHaveBeenCalledTimes(1);
    expect(controller.state).toBe('finished'); expect(video.play).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it('treats a pending play aborted by a pause as a prepared video', async () => {
    const { video, controller, input } = setup();
    let reject!: (error: Error) => void;
    video.play.mockImplementationOnce(() => new Promise<void>((_resolve, rejectPlay) => { reject = rejectPlay; }));
    const pending = controller.start(input); await controller.setPause(true);
    reject(new DOMException('Paused before play completed', 'AbortError'));
    expect((await pending).ok).toBe(true); expect(controller.state).toBe('playing');
    expect((await controller.setPause(false)).ok).toBe(true); expect(video.play).toHaveBeenCalledTimes(2);
    controller.dispose();
  });
});
