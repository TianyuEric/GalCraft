import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { RelativePathSchema } from '@galcraft/contracts';
import type { Json } from '@galcraft/contracts';
import type { PluginResourceSource } from '@galcraft/plugins/contracts';

/** A reader belongs to one import or processing call and its actual source collection. */
export function resourceSource(directory: string, rootFile: string, files: string[], metadata: Json = {}): PluginResourceSource {
  const allowed = new Set(files.map(path => RelativePathSchema.parse(path)));
  if (!allowed.has(rootFile)) throw new Error(`资源入口未在文件集合中：${rootFile}`);
  const location = (path: string) => {
    RelativePathSchema.parse(path);
    if (!allowed.has(path)) throw new Error(`资源文件未在本次源集合中：${path}`);
    const base = resolve(directory), file = resolve(base, ...path.split('/'));
    if (!file.startsWith(base + sep)) throw new Error(`资源路径超出源目录：${path}`);
    return file;
  };
  return { rootFile, files: [...allowed], metadata: structuredClone(metadata),
    readBytes: async path => new Uint8Array(await readFile(location(path))),
    readText: path => readFile(location(path), 'utf8') };
}
