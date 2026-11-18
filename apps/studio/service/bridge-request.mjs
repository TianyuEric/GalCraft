// @ts-check

/** @typedef {import('../desktop-bridge.js').StudioBridgeRequest} StudioBridgeRequest */

/** @param {unknown} value @returns {StudioBridgeRequest | null} */
export function readBridgeRequest(value) {
  if (!value || typeof value !== 'object') return null;
  const { group, method, args, clientId, entry } = /** @type {Partial<Record<keyof StudioBridgeRequest, unknown>>} */ (value);
  if (typeof group !== 'string' || typeof method !== 'string' || !Array.isArray(args)) return null;
  return { group, method, args, clientId: typeof clientId === 'string' ? clientId : undefined,
    entry: entry === 'browser' ? 'browser' : 'desktop' };
}
