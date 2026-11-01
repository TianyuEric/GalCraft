const utf8 = new TextEncoder();
const decode = new TextDecoder();
const u16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true);
const u32 = (view: DataView, at: number, value: number) => view.setUint32(at, value, true);
function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) { value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}
export function writeArchive(files: Record<string, Uint8Array>): Uint8Array {
  const chunks: Uint8Array[] = [], directory: Uint8Array[] = [];
  let offset = 0;
  for (const [path, contents] of Object.entries(files)) {
    const name = utf8.encode(path), checksum = crc32(contents);
    const local = new Uint8Array(30 + name.length + contents.length), view = new DataView(local.buffer);
    u32(view, 0, 0x04034b50); u16(view, 4, 20); u16(view, 8, 0);
    u32(view, 14, checksum); u32(view, 18, contents.length); u32(view, 22, contents.length);
    u16(view, 26, name.length); local.set(name, 30); local.set(contents, 30 + name.length);
    chunks.push(local);
    const central = new Uint8Array(46 + name.length), centralView = new DataView(central.buffer);
    u32(centralView, 0, 0x02014b50); u16(centralView, 4, 20); u16(centralView, 6, 20);
    u32(centralView, 16, checksum); u32(centralView, 20, contents.length); u32(centralView, 24, contents.length);
    u16(centralView, 28, name.length); u32(centralView, 42, offset); central.set(name, 46);
    directory.push(central); offset += local.length;
  }
  const directoryLength = directory.reduce((sum, chunk) => sum + chunk.length, 0);
  const footer = new Uint8Array(22), footerView = new DataView(footer.buffer);
  u32(footerView, 0, 0x06054b50); u16(footerView, 8, directory.length);
  u16(footerView, 10, directory.length); u32(footerView, 12, directoryLength); u32(footerView, 16, offset);
  const result = new Uint8Array(offset + directoryLength + footer.length);
  let cursor = 0;
  for (const chunk of [...chunks, ...directory, footer]) { result.set(chunk, cursor); cursor += chunk.length; }
  return result;
}
export function readArchive(bytes: Uint8Array): Record<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let footer = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--)
    if (view.getUint32(at, true) === 0x06054b50) { footer = at; break; }
  if (footer < 0) throw new Error('不是有效的玩家资料 ZIP');
  const count = view.getUint16(footer + 10, true), files: Record<string, Uint8Array> = {};
  let cursor = view.getUint32(footer + 16, true);
  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50 || view.getUint16(cursor + 10, true) !== 0)
      throw new Error('资料 ZIP 使用了不支持的压缩格式');
    const checksum = view.getUint32(cursor + 16, true), length = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true),
      commentLength = view.getUint16(cursor + 32, true), localAt = view.getUint32(cursor + 42, true);
    const name = decode.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (view.getUint32(localAt, true) !== 0x04034b50) throw new Error('资料 ZIP 文件目录无效');
    const start = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    const content = bytes.slice(start, start + length);
    if (content.length !== length || crc32(content) !== checksum) throw new Error(`资料 ZIP 内容损坏：${name}`);
    files[name] = content; cursor += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
export const archiveText = (value: unknown) => utf8.encode(JSON.stringify(value));
