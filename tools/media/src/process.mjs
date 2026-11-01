import { spawn } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { access, mkdir } from 'node:fs/promises';

export function mediaExecutables(toolDirectory, platform = process.platform) {
  const suffix = platform === 'win32' ? '.exe' : '';
  return { ffmpeg: join(toolDirectory, `ffmpeg${suffix}`), ffprobe: join(toolDirectory, `ffprobe${suffix}`) };
}

export function selectVideoEncoder(encoders, platform = process.platform) {
  const preferred = platform === 'win32' ? ['h264_mf', 'libopenh264', 'libx264'] : platform === 'darwin' ? ['h264_videotoolbox', 'libopenh264', 'libx264'] : ['libopenh264', 'libx264'];
  return preferred.find(name => new RegExp(`\\b${name}\\b`).test(encoders)) ?? null;
}

export async function inspectToolPair(toolDirectory) {
  const paths = mediaExecutables(toolDirectory);
  await Promise.all(Object.values(paths).map(path => access(path)));
  const [ffmpeg, ffprobe, encoders] = await Promise.all([
    runProcess(paths.ffmpeg, ['-version']),
    runProcess(paths.ffprobe, ['-version']),
    runProcess(paths.ffmpeg, ['-hide_banner', '-encoders']),
  ]);
  return {
    paths,
    ffmpegVersion: ffmpeg.stdout.split(/\r?\n/, 1)[0],
    ffprobeVersion: ffprobe.stdout.split(/\r?\n/, 1)[0],
    h264Mf: /\bh264_mf\b/.test(encoders.stdout),
    videoEncoder: selectVideoEncoder(encoders.stdout),
    aac: /\baac\b/.test(encoders.stdout),
  };
}

export async function probeMedia(toolDirectory, inputPath, signal) {
  const { ffprobe } = mediaExecutables(toolDirectory);
  const result = await runProcess(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', inputPath], { signal });
  return JSON.parse(result.stdout);
}

export function windowsMp4Args(inputPath, outputPath, hasAudio = true, videoEncoder = 'h264_mf') {
  return [
    '-hide_banner', '-y', '-i', inputPath,
    '-map', '0:v:0', ...(hasAudio ? ['-map', '0:a:0'] : ['-an']),
    '-c:v', videoEncoder, '-pix_fmt', 'yuv420p',
    ...(hasAudio ? ['-c:a', 'aac'] : []), '-movflags', '+faststart', outputPath,
  ];
}

export async function transcodeWindowsMp4(toolDirectory, inputPath, outputPath, hasAudio, options = {}) {
  await mkdir(dirname(outputPath), { recursive: true });
  const tools = await inspectToolPair(toolDirectory);
  if (!tools.videoEncoder || hasAudio && !tools.aac) throw new Error('FFmpeg must provide an H.264 video encoder and required AAC audio encoder.');
  return runProcess(tools.paths.ffmpeg, windowsMp4Args(inputPath, outputPath, hasAudio, tools.videoEncoder), options);
}

export function runProcess(executable, args, { signal, onProgress, onSpawn, cancelWaitMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('Cancelled'), { code: 'CANCELLED' }));
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    onSpawn?.(child.pid);
    let stdout = '';
    let stderr = '';
    let stopped = false;
    let timer;
    const cancel = () => {
      if (stopped) return;
      stopped = true;
      child.stdin.write('q\n');
      child.stdin.end();
      timer = setTimeout(() => {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        } else child.kill('SIGKILL');
      }, cancelWaitMs);
    };
    signal?.addEventListener('abort', cancel, { once: true });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdin.on('error', () => {});
    child.stdout.on('data', chunk => { stdout += chunk; onProgress?.({ stream: 'stdout', text: chunk }); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8192); onProgress?.({ stream: 'stderr', text: chunk }); });
    child.on('error', error => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      if (stopped) reject(Object.assign(new Error('Cancelled'), { code: 'CANCELLED' }));
      else if (code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(new Error(`${basename(executable)} exited with ${code}: ${stderr.slice(-2000)}`), { code: 'TOOL_EXIT' }));
    });
  });
}
