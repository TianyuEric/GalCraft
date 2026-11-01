type ReleaseFace = { family: string; fullPath: string; language: string | null; assetId: string | null;
  subset?: { family: string; path: string } };
export async function loadReleaseFonts(root: HTMLElement, base: URL) {
  const response = await fetch(new URL('runtime/font-policy.json', base));
  if (!response.ok) throw new Error('Release font policy is missing');
  const policy = await response.json() as { faces: ReleaseFace[]; fallbackAssetId: string | null };
  const loaded: FontFace[] = [];
  try {
    for (const face of policy.faces) {
      for (const source of [{ family: face.family, path: face.fullPath }, ...face.subset ? [face.subset] : []]) {
        const font = await new FontFace(source.family, `url(${JSON.stringify(new URL(source.path, base).href)})`).load();
        document.fonts.add(font); loaded.push(font);
      }
    }
    const family = (face: ReleaseFace) => [face.subset?.family, face.family].filter(Boolean).map(name => JSON.stringify(name)).join(', ');
    const fallback = policy.faces.find(face => face.assetId === policy.fallbackAssetId && face.assetId !== null);
    const defaults = policy.faces.filter(face => !face.assetId);
    const chain = (locale: string) => [...fallback ? [fallback] : [], ...defaults.filter(face => face.language === locale), ...defaults.filter(face => face.language !== locale)].map(family).join(', ');
    for (const face of policy.faces.filter(face => face.assetId)) root.style.setProperty(`--gc-font-${face.assetId}`, `${family(face)}, ${chain('zh-CN')}`);
    root.style.setProperty('--gc-font-default', chain('zh-CN'));
    root.style.setProperty('--gc-font-japanese', chain('ja'));
    root.style.fontFamily = 'var(--gc-font-default)';
    return () => { for (const font of loaded) document.fonts.delete(font); };
  } catch (error) { for (const font of loaded) document.fonts.delete(font); throw error; }
}
