/** Preserve anchors through separate source edits by matching complete graphemes. */
export function sourceAnchorMap(before: string, after: string): (offset: number) => number {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const left = [...segmenter.segment(before)], right = [...segmenter.segment(after)];
  let prefix = 0, suffix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix]!.segment === right[prefix]!.segment) prefix++;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left.at(-1 - suffix)!.segment === right.at(-1 - suffix)!.segment) suffix++;
  const n = left.length - prefix - suffix, m = right.length - prefix - suffix;
  // A large unrelated replacement has no reliable author intent. Keep the source draft intact.
  if (n * m > 4_000_000) throw new Error('这次源码替换范围过大，无法可靠保留句内事件位置。请分段应用，或先在文稿中调整事件。');
  const width = m + 1, lcs = new Uint32Array((n + 1) * width), pairs: [number, number][] = [];
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    lcs[i * width + j] = left[prefix + i]!.segment === right[prefix + j]!.segment
      ? 1 + lcs[(i + 1) * width + j + 1]!
      : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
  }
  for (let i = 0; i < prefix; i++) pairs.push([left[i]!.index, right[i]!.index]);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (left[prefix + i]!.segment === right[prefix + j]!.segment) { pairs.push([left[prefix + i++]!.index, right[prefix + j++]!.index]); }
    else if (lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!) i++;
    else j++;
  }
  for (let k = suffix; k > 0; k--) pairs.push([left.at(-k)!.index, right.at(-k)!.index]);
  return offset => pairs.find(([old]) => old >= offset)?.[1] ?? after.length;
}
