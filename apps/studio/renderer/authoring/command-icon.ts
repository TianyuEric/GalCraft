const paths: Record<string, string> = {
  dialogue: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/><path d="M8 10h8M8 14h5"/>',
  voice: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  figure: '<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',
  music: '<path d="M9 18V5l12-2v13M9 9l12-2"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  sound: '<path d="M12 3v18M8 7v10M16 7v10M4 10v4M20 10v4"/>',
  video: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4m-4 8h4m10-8h4m-4 8h4"/>',
  motion: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/><path d="m19 18 1 3m-3-1 3-1"/>',
  transform: '<path d="M12 2v20M2 12h20m-7-7-3-3-3 3m6 14-3 3-3-3m10-4 3-3-3-3M5 9l-3 3 3 3"/>',
  branch: '<circle cx="6" cy="3" r="2"/><circle cx="6" cy="21" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 5v14M18 8a6 6 0 0 1-6 6H6"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  variable: '<path d="M4 5h16M4 12h10M4 19h16"/><circle cx="17" cy="12" r="2"/>',
  puzzle: '<path d="M8 3H3v5a2 2 0 1 1 0 4v5h5a2 2 0 1 0 4 0h5v-5a2 2 0 1 0 0-4V3h-5a2 2 0 1 0-4 0Z"/>',
};

export function commandIcon(kind: string, voiced: boolean, label: string): HTMLElement {
  const key = kind === 'say' ? voiced ? 'voice' : 'dialogue' :
    ['changeBg', 'unlockCg'].includes(kind) ? 'image' :
      ['changeFigure', 'miniAvatar'].includes(kind) ? 'figure' :
        ['bgm', 'unlockBgm'].includes(kind) ? 'music' :
          kind === 'playEffect' ? 'sound' : kind === 'video' ? 'video' :
            ['setAnimation', 'setComplexAnimation', 'setTempAnimation', 'pixi', 'pixiInit'].includes(kind) ? 'motion' :
              ['setTransform', 'setTransition'].includes(kind) ? 'transform' :
                ['choose', 'callScene', 'changeScene', 'jumpLabel'].includes(kind) ? 'branch' :
                  kind === 'wait' ? 'timer' : ['setVar', 'showVars'].includes(kind) ? 'variable' : 'puzzle';
  const element = document.createElement('span'); element.className = 'authoring-command-icon';
  element.dataset.commandKind = kind; element.setAttribute('role', 'img'); element.setAttribute('aria-label', label);
  element.title = label;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = paths[key]!;
  element.append(svg); return element;
}
