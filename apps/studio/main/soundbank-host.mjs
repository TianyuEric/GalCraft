import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import { ok } from './result.mjs';

/** Installed soundbanks keep an application-lifetime resource lease for browser audition. */
export function soundBankBrowserPort(soundbanks, resources, chooseFile) {
  const leases = new Map();
  return {
    list: () => soundbanks.list(), install: input => soundbanks.install(input),
    import: input => soundbanks.import(input), chooseFile,
    resolve: async input => {
      const resolved = await soundbanks.resolve(input); if (!resolved.ok) return resolved;
      const { expected } = resolved.value, key = `${expected.id}/${expected.version}`;
      let location = leases.get(key);
      if (!location) { const path = fileURLToPath(resolved.value.url); location = resources.register({ projectId: 'authoring-soundbanks', assetId: expected.id,
        variantId: expected.version, relative: basename(path), path, mime: 'application/octet-stream' }); leases.set(key, location); }
      return ok({ url: location.uri, expected });
    },
  };
}
