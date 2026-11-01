/** New business identities are six ASCII letters/digits; old v4 UUIDs stay readable. */
export const shortIdPattern = /^[A-Za-z0-9]{6}$/;
export const legacyIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isId = (value: string): boolean => shortIdPattern.test(value) || legacyIdPattern.test(value);

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const allocated = new Set<string>();
const identityToken = /(?:^|[^A-Za-z0-9])([A-Za-z0-9]{6}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?=$|[^A-Za-z0-9])/g;

/** Reserve loaded identities, including JSON/DSL document images and path segments. */
export function reserveIds(namespace: unknown): void {
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(identityToken)) allocated.add(match[1]!.toLowerCase());
    } else if (value && typeof value === 'object' && !seen.has(value)) {
      seen.add(value);
      if (value instanceof Map) for (const [key, item] of value) { visit(key); visit(item); }
      else if (value instanceof Set) for (const item of value) visit(item);
      else for (const [key, item] of Object.entries(value)) { visit(key); visit(item); }
    }
  };
  visit(namespace);
}

/** Check the live namespace and reserve each result before returning it. */
export function createId(namespace: unknown = [], fill: (bytes: Uint8Array<ArrayBuffer>) => void = bytes => { globalThis.crypto.getRandomValues(bytes); }): string {
  reserveIds(namespace);
  for (;;) {
    let id = '';
    while (id.length < 6) {
      const bytes = new Uint8Array(12); fill(bytes);
      for (const byte of bytes) {
        // Rejection sampling avoids bias from 256 not being divisible by 62.
        if (byte < 248) id += alphabet[byte % 62];
        if (id.length === 6) break;
      }
    }
    const key = id.toLowerCase();
    // Windows paths compare case-insensitively; reserve that same namespace everywhere.
    if (allocated.has(key)) continue;
    allocated.add(key);
    return id;
  }
}
