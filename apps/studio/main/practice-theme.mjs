import { createId } from '@galcraft/contracts';
import { createBasicComponent, componentDefinition } from '@galcraft/templates';

import { compileStyle } from '@galcraft/templates/compiler';
const walk = node => [node, ...node.children.flatMap(walk)];
const selector = part => `[data-gc-part="${part}"]`;

/** Keep the sample's recovery message and two actions in ordinary editable flow. */
export function configurePracticeVideoError(page) {
  const parts = walk(page.root), message = parts.find(component => component.part === 'videoError.message');
  const buttons = ['videoError.retry', 'videoError.titleAction'].map(part => parts.find(component => component.part === part));
  if (!message || buttons.some(component => !component)) throw new Error('Sample video recovery parts are incomplete');
  const panel = parts.find(component => component.name === 'Video recovery') ?? createBasicComponent('container', { name: 'Video recovery' });
  const actions = parts.find(component => component.name === 'Video recovery actions') ?? createBasicComponent('container', { name: 'Video recovery actions' });
  for (const component of parts) component.children = component.children.filter(child => child !== message && !buttons.includes(child));
  const px = value => ({ unit: 'px', value }), pct = value => ({ unit: 'percent', value }), auto = { unit: 'auto' };
  Object.assign(panel.layout, { position: 'free', mode: 'column', anchorX: .5, anchorY: .5, x: px(0), y: px(0), width: pct(70), height: auto,
    minWidth: 560, maxWidth: 1100, padding: { top: 48, right: 48, bottom: 48, left: 48 }, gap: 24, align: 'stretch' });
  panel.normal = { ...panel.normal, color: '#4a3d49', radius: 12,
    background: { fit: 'cover', positionX: .5, positionY: .5, imageId: null, imageOpacity: 1, color: '#fffaf3', colorOpacity: 1 } };
  Object.assign(message.layout, { position: 'flow', anchorX: 0, anchorY: 0, x: px(0), y: px(0), width: pct(100), height: auto, minHeight: 48, maxHeight: 540, overflow: 'scroll' });
  Object.assign(actions.layout, { position: 'flow', mode: 'row', width: pct(100), height: auto, gap: 16, align: 'center', justify: 'end' });
  for (const button of buttons) Object.assign(button.layout, { position: 'flow', anchorX: 0, anchorY: 0, x: px(0), y: px(0), height: auto, minHeight: 56 });
  actions.children = buttons; panel.children = [message, actions];
  if (!page.root.children.includes(panel)) page.root.children.push(panel);
  return page;
}

/** An editable theme on the ordinary public page/component and named-style contracts. */
export function practiceTheme(views, manifest, asset, variants) {
  const patches = [], rootDocument = views.find(doc => doc.files['ui/template.json']);
  const before = JSON.parse(rootDocument.files['ui/template.json']).data, next = structuredClone(before);
  const image = (key, icon = true) => ({ assetId: asset(manifest.ui[key]), variantId: variants.get(asset(manifest.ui[key])),
    mode: 'contain', positionX: .5, positionY: .5, colorMode: icon ? 'mask' : 'original', tint: null,
    opacity: 1, slices: null, borders: null, fillCenter: true });
  const colors = { ink: '#4a3d49', accent: '#a36572', cream: '#fff8ef', line: '#dcc8bd' };
  Object.assign(next.template.defaultVisual, { color: colors.ink, borderColor: colors.line, fontSize: 30,
    background: { ...next.template.defaultVisual.background, color: colors.cream } });
  next.template.readingStyles = { read: { color: '#c6b8aa' } };
  next.template.features = next.template.features.filter(feature => feature !== 'coreRelations');
  for (const doc of views) for (const [path, raw] of Object.entries(doc.files)) {
    if (!path.startsWith('ui/pages/')) continue;
    const original = JSON.parse(raw).data, page = structuredClone(original), key = page.key;
    if (key === 'videoError') configurePracticeVideoError(page);
    if (key === 'relations') {
      next.pageIds = next.pageIds.filter(id => id !== page.id);
      patches.push({ kind: 'document', documentId: doc.documentId, op: 'delete',
        before: { documentId: doc.documentId, format: doc.format, files: doc.files }, after: null });
      continue;
    }
    if (key === 'title') for (const component of walk(page.root)) component.children = component.children.filter(child =>
      !child.interactions?.some(interaction => interaction.actions.some(action => action.kind === 'open' && action.page === 'relations')));
    const parts = walk(page.root);
    const get = part => parts.find(component => component.part === `${key}.${part}`);
    const isModal = ['confirm', 'error', 'dataImport', 'dataClear'].includes(key);
    if (!['story', 'choice', 'input'].includes(key) && !isModal) Object.assign(page.background, {
      imageId: asset(key === 'title' ? manifest.home.wall : manifest.backgrounds.sky), imageOpacity: key === 'title' ? .92 : .18,
      color: colors.cream, colorOpacity: 1,
    });
    const rules = [];
    for (const component of parts) {
      const last = component.part.split('.').at(-1), iconKey = { continue: 'start', quickSave: 'save', quickLoad: 'load', lock: 'pin',
        titleAction: 'title', cancel: 'back', confirm: 'start', retry: 'history', voice: 'music', jump: 'start', play: 'start' }[last] ?? last;
      const button = component.content.labelKey || component.part.includes('.menu.') || component.part.includes('.toolbar.') ||
        ['back', 'cancel', 'confirm', 'primary'].includes(last);
      if (button && componentDefinition(component.part)?.imageSlots.includes('icon') && manifest.ui[iconKey] && !component.part.endsWith('.trigger')) {
        component.normal.images = { ...component.normal.images, icon: image(iconKey) };
        rules.push(`${selector(component.part)} { padding-inline: 1em; gap: .55em; text-align: center; }`);
      }
      if (button) {
        component.normal.color = key === 'story' ? '#fff8ef' : colors.ink;
        component.states.hover = { ...component.states.hover, color: key === 'story' ? '#fff' : '#915867' };
        rules.push(`${selector(component.part)} { border-radius: .35em; border-color: transparent; transition: background-color .16s, box-shadow .16s; }`);
        rules.push(`${selector(component.part)}:focus-visible { outline: 2px solid #c38a7b; outline-offset: 3px; }`);
      }
      if (component.part.includes('.categoryTabs.')) {
        delete component.normal.color;
        rules.push(`${selector(component.part)} { --gc-accent: #996475; }`);
      }
    }
    if (key === 'title') {
      get('logo').visible = false;
      get('workTitle').visible = false;
      get('description').visible = false;
      const layer = (name, file, x, y, width, height, z, photo = false) => {
        const component = createBasicComponent('image', { name });
        Object.assign(component.layout, { x: { unit: 'px', value: x }, y: { unit: 'px', value: y }, width: { unit: 'px', value: width }, height: { unit: 'px', value: height }, z });
        component.normal = { images: { decoration: { assetId: asset(file), variantId: variants.get(asset(file)), mode: 'contain', positionX: .5, positionY: .5, colorMode: 'original', tint: null, opacity: 1, slices: null, borders: null, fillCenter: true } },
          ...(photo ? { borderColor: '#fff4e4', borderWidth: 12, background: { ...next.template.defaultVisual.background, color: '#fff4e4' } } : {}) };
        page.root.children.push(component);
      };
      layer('放映馆前 · 三人合照', manifest.home.friends, 88, 104, 820, 547, 1, true);
      layer('筹备放映 · 三人合照', manifest.home.preparation, 304, 594, 640, 427, 2, true);
      layer('今晚，让春天亮起来 · 标题艺术字', manifest.home.title, 1040, 64, 790, 395, 3);
      Object.assign(get('menu').layout, { anchorX: 0, anchorY: 0, x: { unit: 'px', value: 1144 }, y: { unit: 'px', value: 472 }, width: { unit: 'px', value: 560 }, minHeight: 0, gap: 8, z: 4 });
      for (const component of get('menu').children) {
        component.normal.color = '#fff4e4';
        component.normal.background = { ...next.template.defaultVisual.background, color: '#17283e', colorOpacity: .8 };
        component.states.hover = { ...component.states.hover, color: '#fff9ec', background: { ...next.template.defaultVisual.background, color: '#775e48', colorOpacity: .94 } };
        component.layout.minHeight = 48;
      }
      for (const part of ['start', 'continue']) {
        const button = get(`menu.${part}`);
        if (button) Object.assign(button.normal, { color: '#15243b', background: { ...next.template.defaultVisual.background, color: '#f4d7a3', colorOpacity: .96 } });
      }
      rules.push(`${selector('title.menu')} { background: transparent; padding: 0; border: 0; }`,
        `${get('menu').children.map(component => selector(component.part)).join(', ')} { font-size: calc(28px * var(--gc-scale)); letter-spacing: .06em; justify-content: flex-start; padding-inline: 1.25em; }`,
        `${get('menu').children.map(component => `${selector(component.part)}:focus-visible`).join(', ')} { outline: 2px solid #f4d7a3; outline-offset: 3px; }`);
    } else if (key === 'story') {
      get('toolbar').layout.justify = 'end';
      const panel=get('readingPanel');
      if(panel)Object.assign(panel.normal,{color:'#fff8ef',radius:0,background:{...next.template.defaultVisual.background,color:'#182338',colorOpacity:.84}});
      Object.assign(get('textBox').normal, { color: '#fff8ef', radius: 0,
        background: { ...next.template.defaultVisual.background, color: '#182338', colorOpacity: .84 } });
      get('nameBox').normal.background = { ...next.template.defaultVisual.background, color: '#996475' };
      get('nameBox').normal.color = '#fff8ed';
      get('nameText').normal.color = '#fff8ed';
      rules.push(`${selector('story.nameBox')} { border-radius: .45em .45em .2em .2em; font-weight: 500; letter-spacing: .12em; }`,
        `${selector('story.bodyText')} { line-height: 1.9; letter-spacing: .035em; }`,
        `${selector('story.toolbar')} { justify-content: flex-end; background: linear-gradient(0deg,#302533ce,#30253300); border-top: 0; }`);
    } else {
      for (const part of ['header', 'title']) if (get(part)) rules.push(`${selector(`${key}.${part}`)} { color: #855769; letter-spacing: .14em; border-color: #cfaeb6; }`);
      for (const part of ['panel', 'detail', 'content', 'list.item']) if (get(part)) rules.push(`${selector(`${key}.${part}`)} { background: #fffaf3eb; border: 1px solid #e7d6cd; border-radius: .6em; box-shadow: 0 6px 25px #60454b0d; }`);
      if (key === 'save' || key === 'load' || key === 'characters') {
        const card = get(key === 'characters' ? 'card' : 'grid.slot');
        const surface = color => ({ ...next.template.defaultVisual.background, color, colorOpacity: 1 });
        Object.assign(card.normal, { color: colors.ink, background: surface('#fffaf3'), borderColor: colors.line, borderWidth: 1, radius: 12 });
        card.states.hover = { ...card.states.hover, color: colors.ink, background: surface('#f6e6df'), borderColor: '#bd8d98' };
        card.states.selected = { ...card.states.selected, color: '#fff9ef', background: surface('#805363'), borderColor: '#805363' };
        if (key === 'characters') {
          card.states.pressed = { ...card.states.pressed, ...card.states.selected };
          card.states.locked = { ...card.states.locked, color: '#796f73', background: surface('#eee8e2'), borderColor: colors.line };
        }
        for (const child of walk(card).slice(1)) child.normal.color = 'inherit';
        rules.push(`${selector(card.part)} { transition: background-color .16s, border-color .16s; }`);
      }
      if (key === 'choice') rules.push(`${selector('choice.list.item')} { background: #fff8efeF; color: #654953; border: 1px solid #c996a4; box-shadow: 0 6px 25px #3b25312a; border-radius: .5em; }`);
      if (key === 'settings') rules.push(`${selector('settings.categories')}, ${selector('settings.content')} { --gc-accent: #996475; }`);
    }
    const id = createId(), sourcePath = `ui/styles/${id}.css`, compiledPath = `ui/styles/${id}.compiled.css`;
    const style = { id, name: `春灯 · ${key}`, activation: 'page', scope: { pageId: page.id, componentId: null }, language: 'css',
      sourcePath, sourceRevision: 1, compiledPath, compiledSourceRevision: null, assets: [], issues: [] };
    const source = rules.join('\n'), compiled = compileStyle({ style, source, instanceId: next.template.instanceId });
    if (compiled.style.issues.length) throw new Error(compiled.style.issues.map(issue => issue.message).join('; '));
    next.template.styles.push(compiled.style);
    patches.push({ kind: 'file', documentId: rootDocument.documentId, path: sourcePath, before: null, after: source },
      { kind: 'file', documentId: rootDocument.documentId, path: compiledPath, before: null, after: compiled.css },
      { kind: 'json', documentId: doc.documentId, changes: [{ path: '/data', op: 'set', before: original, after: page }] });
  }
  patches.push({ kind: 'json', documentId: rootDocument.documentId, changes: [{ path: '/data', op: 'set', before, after: next }] });
  return patches;
}
