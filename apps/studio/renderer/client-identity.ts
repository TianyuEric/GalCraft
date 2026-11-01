export const studioEntry = (): 'desktop' | 'browser' => new URLSearchParams(location.search).get('entry') === 'desktop' ? 'desktop' : 'browser';
export function studioClientId(): string {
  const key = `galcraft.studio.client.${studioEntry()}`;
  let id = sessionStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
  return id;
}
