import { it, expect } from 'vitest';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';

it('rejects edits to the actual Studio and Player processing and exposed bridge implementations', async () => {
  const workspace = resolve(import.meta.dirname, '../../..');
  const compiler = join(workspace, 'node_modules/typescript/bin/tsc');
  for (const app of ['studio', 'player-windows']) {
    const root = join(workspace, 'apps', app), main = join(root, 'main');
    const preload = await readFile(join(main, 'preload.cjs'), 'utf8');
    const processing = await readFile(join(main, app === 'studio' ? 'ipc-handlers.mjs' : 'host.mjs'), 'utf8');
    const replace = (source, before, after) => {
      expect(source).toContain(before);
      return source.replace(before, after);
    };
    const cases = app === 'studio' ? [
      replace(preload, "call('connections', 'test', selection)", "call('connections', 'tesst', selection)"),
      replace(preload, "call('connections', 'test', selection)", "call('connections', 'test')"),
      replace(preload, "    test: selection => call('connections', 'test', selection),", ''),
      replace(processing, 'test: async (...args) => {', "test: async (...args) => { return ok('wrong result');"),
    ] : [
      replace(preload, "invoke('resources', 'resolve', assetId, variantId)", "invoke('resources', 'resovle', assetId, variantId)"),
      replace(preload, "invoke('resources', 'resolve', assetId, variantId)", "invoke('resources', 'resolve', assetId)"),
      replace(preload, "    read: key => invoke('storage', 'read', key),", ''),
      replace(processing, 'return ok({ uri: location.uri, mime: item.mime, bytes, rangeSupported: true, token });', "return ok('wrong result');"),
    ];
    const id = randomUUID(), temporary = cases.map((_, index) => join(main, `.ipc-${id}-${index}.${index === 3 ? 'mjs' : 'cjs'}`));
    const config = join(root, `.ipc-${id}.json`);
    try {
      await Promise.all(cases.map((source, index) => writeFile(temporary[index], source)));
      await writeFile(config, JSON.stringify({ extends: './tsconfig.main.json', include: [], files: temporary }));
      const result = spawnSync(process.execPath, [compiler, '--noEmit', '-p', config], { cwd: workspace, encoding: 'utf8' });
      expect(result.status, result.stdout + result.stderr).toBe(1);
      const codes = [2345, 2554, 2741, 2322];
      for (let index = 0; index < cases.length; index++) {
        const diagnostics = (result.stdout + result.stderr).split('\n').filter(line => line.includes(`.ipc-${id}-${index}.`));
        expect(diagnostics.join('\n')).toContain(`error TS${codes[index]}`);
      }
    } finally {
      await Promise.all([...temporary, config].map(file => unlink(file).catch(() => {})));
    }
  }
}, 30000);
