/** User-visible filenames are independent from stable asset and variant identities. */
export function assetNameParts(name: string): { stem: string; extension: string } {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { stem: name.slice(0, dot), extension: name.slice(dot) } : { stem: name, extension: '' };
}
/** Renaming keeps the imported name's suffix, including its original case. */
export function retainsAssetExtension(before: string, after: string): boolean {
  return assetNameParts(before).extension === assetNameParts(after).extension;
}
export function availableAssetName(name: string, existing: readonly string[]): string {
  const names = new Set(existing.map(value => value.toLocaleLowerCase()));
  if (!names.has(name.toLocaleLowerCase())) return name;
  const dot = name.lastIndexOf('.'), ext = dot > 0 ? name.slice(dot) : '';
  const stem = (dot > 0 ? name.slice(0, dot) : name).replace(/_\d{3,}$/, '');
  let n = 1; while (names.has(`${stem}_${String(n).padStart(3, '0')}${ext}`.toLocaleLowerCase())) n++;
  return `${stem}_${String(n).padStart(3, '0')}${ext}`;
}
export function validAssetFileName(name: string): boolean {
  return Boolean(name.trim()) && name.length <= 120 && !/[<>:"/\\|?*\x00-\x1f]/.test(name) && !/[. ]$/.test(name)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}
export function suggestedAssetName(input: { usage: string; sceneName?: string; characterName?: string; extension: string }, existing: readonly string[] = []): string {
  const usage: Record<string,string> = { background:'背景',figure:'立绘',difference:'差分',voice:'配音',bgm:'音乐',ui:'界面',image:'图片' };
  const clean = (value: string) => value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 36);
  const parts = [input.sceneName, input.characterName, usage[input.usage] ?? '素材'].filter(Boolean).map(value => clean(value!)).filter(Boolean);
  const ext = input.extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
  return availableAssetName(`${parts.join('_')}_001.${ext}`, existing);
}
