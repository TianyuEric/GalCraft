import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { init, parse } from 'es-module-lexer';

export async function collectEngineConversions(engine) {
  await init;
  const declared = new Map(engine.manifest.files.map(file => [file.path, file])), found = new Map();
  async function collect(path) {
    if (found.has(path)) return;
    const file = declared.get(path);
    if (!file) throw new Error(`引擎转换依赖未声明：${path}`);
    found.set(path, { path: `runtime/engine-upgrade/${path}`, size: file.size,
      source: join(engine.directory, path), role: 'runtime' });
    if (!/\.m?js$/.test(path)) return;
    const source = await readFile(join(engine.directory, path), 'utf8');
    const references = [];
    for (const item of parse(source, path)[0]) {
      if (item.d === -2) {
        const url = source.slice(0, item.s).match(/new\s+URL\s*\(\s*(['"])([^'"\r\n]+)\1\s*,\s*$/);
        if (url) references.push(url[2]);
      } else references.push(item.n);
    }
    for (const reference of references) {
      if (!reference) throw new Error(`引擎转换入口需要静态依赖路径：${path}`);
      if (reference.startsWith('node:')) continue;
      if (!reference.startsWith('.')) throw new Error(`引擎转换运行依赖必须打包为相对路径：${reference}`);
      await collect(posix.normalize(posix.join(posix.dirname(path), reference)));
    }
  }
  for (const conversion of engine.manifest.conversions) await collect(conversion.entry);
  return [...found.values()];
}
