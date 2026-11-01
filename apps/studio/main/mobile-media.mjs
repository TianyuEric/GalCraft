/** Common formats declared by the shipped WebView hosts. Decoder checks still run against the selected source. */
const formats = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], texture: ['image/png', 'image/jpeg', 'image/webp'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav'],
  font: ['font/ttf', 'font/otf', 'font/woff', 'font/woff2', 'application/font-sfnt', 'application/font-woff'],
};
export function mobileMediaIssue(asset, variant, target) {
  if (!['android', 'ios'].includes(target) || variant.groupCapabilities?.resolver) return null;
  if (['animation', 'effect'].includes(asset.kind)) return null;
  const mime = variant.files.find(file => file.path === variant.entry)?.mime;
  if (formats[asset.kind]?.includes(mime)) return null;
  return { code: 'ASSET_MOBILE_FORMAT', owner: 'M04', severity: 'error', message: `${asset.name}: ${target} 宿主尚未声明 ${mime ?? asset.kind} 的媒体能力，请采用 PNG/JPEG/WebP、标准字体或 MP3/AAC/WAV 兼容版本。设备解码与性能由实际设备检查。`, related: [{ kind: 'asset', id: asset.id }], actions: ['convert'] };
}
