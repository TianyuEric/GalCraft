import { describe, expect, it } from 'vitest';
import { mediaExecutables, selectVideoEncoder, runProcess, windowsMp4Args } from './process.mjs';

describe('media process', () => {
  it('resolves native tool names and chooses an available H.264 encoder for the host', () => {
    expect(mediaExecutables('/tools', 'linux').ffmpeg).toMatch(/ffmpeg$/);
    expect(mediaExecutables('/tools', 'darwin').ffprobe).toMatch(/ffprobe$/);
    expect(mediaExecutables('/tools', 'win32').ffmpeg).toMatch(/ffmpeg\.exe$/);
    expect(selectVideoEncoder('h264_mf libopenh264 libx264', 'win32')).toBe('h264_mf');
    expect(selectVideoEncoder('h264_videotoolbox libx264', 'darwin')).toBe('h264_videotoolbox');
    expect(selectVideoEncoder('h264_mf libopenh264', 'linux')).toBe('libopenh264');
    expect(selectVideoEncoder('h264_mf', 'linux')).toBeNull();
  });
  it('keeps Chinese paths as single arguments and uses the specified encoders', () => {
    const args = windowsMp4Args('D:\\作品 目录\\源 视频.mp4', 'D:\\输出 目录\\结果.mp4', true);
    expect(args[args.indexOf('-i') + 1]).toBe('D:\\作品 目录\\源 视频.mp4');
    expect(args).toContain('h264_mf');
    expect(args).toContain('aac');
    expect(args).toContain('+faststart');
  });

  it('passes arguments without a shell and cancels its own child', async () => {
    const result = await runProcess(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', '中文 空格']);
    expect(JSON.parse(result.stdout)).toEqual(['中文 空格']);
    const abort = new AbortController();
    const running = runProcess(process.execPath, ['-e', 'process.stdin.on("data",()=>process.exit(0));setInterval(()=>{},1000)'], { signal: abort.signal, cancelWaitMs: 500 });
    abort.abort();
    await expect(running).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});
