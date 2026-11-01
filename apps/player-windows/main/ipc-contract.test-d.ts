import type { WindowsPlayerHost } from './host.mjs';
declare const host: WindowsPlayerHost;
// @ts-expect-error The actual resource processing map has no misspelled method.
host.handlers.resources.resovle('asset', 'variant');
// @ts-expect-error Resolving a resource requires its variant.
host.handlers.resources.resolve('asset');
// @ts-expect-error Resource resolution returns a wire location Result.
host.handlers.resources.resolve = async () => ({ ok: true, value: 12, warnings: [] });
// @ts-expect-error Storage commits return a revision Result.
host.handlers.storage.commit = async () => ({ ok: true, value: {}, warnings: [] });
