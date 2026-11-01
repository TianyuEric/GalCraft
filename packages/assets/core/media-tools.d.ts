declare module '@galcraft/media-tools/process' {
  export function probeMedia(toolDirectory: string, inputPath: string, signal?: AbortSignal): Promise<{
    format?: { format_name?: string; duration?: string };
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; pix_fmt?: string;
      duration?: string; duration_ts?: number; time_base?: string; sample_rate?: string; channels?: number }[];
  }>;
  export function runProcess(executable: string, args: string[], options?: { signal?: AbortSignal }): Promise<{ stdout: string; stderr: string }>;
  export function mediaExecutables(toolDirectory: string, platform?: string): { ffmpeg: string; ffprobe: string };
  export function transcodeWindowsMp4(toolDirectory: string, inputPath: string, outputPath: string, hasAudio: boolean, options?: { signal?: AbortSignal }): Promise<{ stdout: string; stderr: string }>;
}
