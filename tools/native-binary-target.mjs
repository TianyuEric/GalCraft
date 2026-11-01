import { open } from 'node:fs/promises';

/** Read the actual native target, including when staging on another build machine. */
export async function nativeBinaryTarget(path) {
  const file = await open(path, 'r');
  try {
    const header = Buffer.alloc(4096); await file.read(header, 0, header.length, 0);
    if (header.toString('ascii', 0, 2) === 'MZ') {
      const offset = header.readUInt32LE(0x3c), pe = Buffer.alloc(6); await file.read(pe, 0, pe.length, offset);
      if (pe.toString('ascii', 0, 4) !== 'PE\0\0') throw new Error(`Invalid PE executable: ${path}`);
      return { platform: 'win32', architectures: [{ 0x8664: 'x64', 0xaa64: 'arm64' }[pe.readUInt16LE(4)]].filter(Boolean) };
    }
    if (header.toString('hex', 0, 4) === '7f454c46') {
      const machine = header[5] === 1 ? header.readUInt16LE(18) : header.readUInt16BE(18);
      return { platform: 'linux', architectures: [{ 62: 'x64', 183: 'arm64' }[machine]].filter(Boolean) };
    }
    const magic = header.readUInt32BE(0), cpu = value => ({ 0x1000007: 'x64', 0x100000c: 'arm64' })[value];
    if (magic === 0xcffaedfe || magic === 0xfeedfacf) return { platform: 'darwin', architectures: [cpu(magic === 0xcffaedfe ? header.readUInt32LE(4) : header.readUInt32BE(4))].filter(Boolean) };
    if (magic === 0xcafebabe || magic === 0xcafebabf) {
      const count = header.readUInt32BE(4), stride = magic === 0xcafebabe ? 20 : 32;
      return { platform: 'darwin', architectures: Array.from({ length: count }, (_, i) => cpu(header.readUInt32BE(8 + i * stride))).filter(Boolean) };
    }
    throw new Error(`Unsupported native executable: ${path}`);
  } finally { await file.close(); }
}

export async function assertNativeBinaryTarget(path, { platform, arch }) {
  const actual = await nativeBinaryTarget(path);
  if (actual.platform !== platform || !actual.architectures.includes(arch)) throw new Error(`Native binary ${path} is ${actual.platform}/${actual.architectures.join(',')}; expected ${platform}/${arch}`);
  return actual;
}
