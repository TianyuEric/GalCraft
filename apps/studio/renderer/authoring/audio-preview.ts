export type PreviewPlayback = { loopStartSec: number | null; loopEndSec: number | null };

export function configureAudioPreview(audio: HTMLAudioElement, playback: PreviewPlayback): () => void {
  const { loopStartSec, loopEndSec } = playback;
  if (loopStartSec === null || loopEndSec === null) return () => undefined;
  let timer: ReturnType<typeof setInterval> | null = null;
  const repeat = (ended: boolean) => {
    if (!ended && (audio.paused || audio.currentTime < loopEndSec)) return;
    audio.currentTime = loopStartSec;
    if (ended) void audio.play().catch(() => undefined);
  };
  const onTime = () => repeat(false);
  const onPlay = () => { if (timer === null) timer = setInterval(onTime, 25); };
  const onPause = () => { if (timer !== null) clearInterval(timer); timer = null; };
  const onEnded = () => { onPause(); repeat(true); };
  audio.addEventListener('timeupdate', onTime);
  audio.addEventListener('play', onPlay);
  audio.addEventListener('pause', onPause);
  audio.addEventListener('ended', onEnded);
  return () => {
    onPause(); audio.removeEventListener('timeupdate', onTime); audio.removeEventListener('play', onPlay);
    audio.removeEventListener('pause', onPause); audio.removeEventListener('ended', onEnded);
  };
}
