const paths: Record<string, string> = {
  grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  route: 'M6 3v12a4 4 0 0 0 4 4h8M6 7h7a4 4 0 0 1 4 4v4m-3-3 3 3 3-3',
  refresh: 'M20 7A9 9 0 1 0 21 14M20 3v5h-5',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8',
  undo: 'M3 10h11a7 7 0 0 1 0 14M3 10l5-5M3 10l5 5',
  redo: 'M21 10H10a7 7 0 0 0 0 14M21 10l-5-5M21 10l-5 5',
  plus: 'M12 5v14M5 12h14', play: 'm8 4 12 8-12 8Z',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
  pause: 'M8 5v14M16 5v14', step: 'm5 5 10 7-10 7ZM19 5v14',
  back: 'M20 12H4m6-6-6 6 6 6', download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
  debug: 'M8 9h8v10H8ZM10 9V6h4v3M3 12h5m8 0h5M3 17h5m8 0h5M6 4l4 3m8-3-4 3',
  copy: 'M9 9h12v12H9ZM15 9V3H3v12h6',
  paste: 'M9 4H5v17h14V4h-4M9 2h6v5H9ZM8 12h8M8 16h6',
  search: 'M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  folder: 'M3 7h7l2-3h9v16H3Z',
  check: 'm5 12 4 4L19 6', trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  close: 'm6 6 12 12M6 18 18 6', edit: 'm4 16 12-12 4 4L8 20H4ZM3 22h18',
  cards: 'M3 3h7v18H3ZM14 3h7v18h-7', code: 'm8 6-6 6 6 6M16 6l6 6-6 6m-3-16-2 20',
  dialogue: 'M21 11a8 8 0 0 1-8 8H7l-4 3 1-7a8 8 0 1 1 17-4ZM8 9h8M8 13h5',
  info: 'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  shapes: 'm3 3 7 0-3.5 6ZM14 3h7v7h-7ZM10 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM14 14h7v7h-7Z',
  image: 'M3 3h18v18H3ZM3 17l6-6 4 4 3-3 5 5M8 7h.01', audio: 'M9 18V5l11-2v13M9 5l11-2M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  video: 'M3 5h13v14H3ZM16 10l5-4v12l-5-4', font: 'M4 4h16M12 4v16M8 20h8',
  file: 'M4 2h10l6 6v14H4ZM14 2v6h6',
  texture: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  animation: 'M3 10h18v11H3ZM3 10l-1-5 18-3 1 5ZM7 4l3 4M13 3l3 4',
  effect: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM21 2v4M19 4h4M3 18v4M1 20h4',
  'person-standing': 'M14 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM6 8l6 2 6-2M12 10v5m0 0-4 7m4-7 4 7',
  package: 'm12 3 9 5v9l-9 5-9-5V8ZM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5',
};
paths.music = paths.audio!; paths['grid-2x2'] = paths.texture!; paths.clapperboard = paths.animation!; paths.sparkles = paths.effect!;
paths.live2d = paths['person-standing']!;
export function actionIcon(kind: string): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) icon.setAttribute(key, value);
  const path = document.createElementNS(icon.namespaceURI, 'path'); path.setAttribute('d', paths[kind] ?? paths.file!); icon.append(path); return icon;
}
