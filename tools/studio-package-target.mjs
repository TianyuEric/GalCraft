export const studioPlatforms = ['win32', 'linux', 'darwin'];
export const studioArchitectures = ['x64', 'arm64'];

export function studioPackageTarget(argv = process.argv.slice(2), host = process) {
  const value = name => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1]; };
  const platform = value('--platform') ?? host.platform, arch = value('--arch') ?? host.arch;
  if (!studioPlatforms.includes(platform) || !studioArchitectures.includes(arch)) throw new Error(`Unsupported Studio target: ${platform}/${arch}`);
  const format = value('--format') ?? ({ win32: 'nsis', linux: 'AppImage', darwin: 'dmg' })[platform];
  const formats = { win32: ['dir', 'nsis', 'zip'], linux: ['dir', 'AppImage', 'tar.gz'], darwin: ['dir', 'dmg', 'zip'] };
  if (!formats[platform].includes(format)) throw new Error(`Unsupported Studio format: ${platform}/${format}`);
  return { platform, arch, format, stageOnly: argv.includes('--stage-only'), reuseBuild: argv.includes('--reuse-build') || argv.includes('--resume-staging'), nativeSource: value('--native-source'), mediaDirectory: value('--media-tools') };
}

export function mediaToolNames(platform = process.platform) {
  return ['ffmpeg', 'ffprobe'].map(name => `${name}${platform === 'win32' ? '.exe' : ''}`);
}
