import { describe, expect, it } from 'vitest';
import { RuntimeTemplateSchema } from '@galcraft/contracts';
import { ComponentCatalog, componentDefinition } from './catalog.js';
import { createTemplateDocuments, readTemplateDocuments } from './documents.js';
import { resolveComponentTree, resolveLayout } from './layout.js';
import { playerLocaleRows } from './locale-data.js';
import { officialLocaleResources, playerText, validateLocaleResources } from './locales.js';
import { completePluginPages, createOfficialTemplate, DEFAULT_TEMPLATE, missingRequiredEntrances, OfficialTemplates } from './templates.js';
import { components, instantiateTemplate, rewriteTemplateCss } from './editing.js';
import { templateIssues } from './package.js';
import { insertPluginComponent, pluginComponentCatalog } from './plugin-components.js';

describe('official template core', () => {
  it('exposes selected save slots and one whole-card afterstory entrance in new templates',()=>{
    for(const appearance of ['paper','night'] as const){const template=createOfficialTemplate({appearance,kind:'standard'});
      for(const page of ['save','load']){expect(componentDefinition(`${page}.grid.slot`)?.states).toContain('selected');const slot=components(template.pages.find(item=>item.key===page)!.root).find(item=>item.part===`${page}.grid.slot`)!;expect(slot.states.hover?.color).toBe(slot.normal.color);expect(slot.states.selected?.color).not.toBe(slot.normal.color);expect(slot.states.selected?.background?.color).not.toBe(slot.normal.background?.color);}
      const card=components(template.pages.find(page=>page.key==='characters')!.root).find(component=>component.part==='characters.card')!;
      expect(componentDefinition(card.part)).toMatchObject({kind:'container',action:'startAfterstory'});expect(componentDefinition(card.part)?.states).toEqual(expect.arrayContaining(['hover','selected','locked']));
      expect(components(card).some(component=>/^characters\.afterstory\.(start|continue|replay)$/.test(component.part))).toBe(false);
      for(const action of ['start','continue','replay'])expect(componentDefinition(`characters.afterstory.${action}`)).not.toBeNull();
      const footer=components(template.pages.find(page=>page.key==='settings')!.root).find(component=>component.part==='settings.footer')!;
      expect(footer.children.map(component=>component.part)).toContain('settings.titleAction');expect(componentDefinition('settings.titleAction')?.action).toBe('returnTitle');
    }
  });
  it('groups each gallery viewer record with its title and separates the viewer regions',()=>{
    const viewer=components(createOfficialTemplate().pages.find(page=>page.key==='cg')!.root).find(component=>component.part==='cg.viewer')!;
    expect(viewer.children.map(component=>component.part)).toEqual(['cg.viewer.header','cg.viewer.entries','cg.viewer.content','cg.viewer.footer']);
    expect(viewer.children[0]!.children.map(component=>component.part)).toEqual(['cg.viewer.title','cg.viewer.auxiliary','cg.viewer.back']);
    expect(components(viewer).find(component=>component.part==='cg.viewer.entry')?.children.map(component=>component.part)).toEqual(['cg.viewer.entry.cover','cg.viewer.entry.title']);
    expect(components(viewer).find(component=>component.part==='cg.viewer.difference')?.children.map(component=>component.part)).toEqual(['cg.viewer.difference.cover','cg.viewer.difference.title']);
  });
  it('keeps relationship variables and HUDs explicit in new official templates',()=>{
    for(const kind of ['light','standard','rich'] as const){const template=createOfficialTemplate({kind});expect(template.pages.some(page=>page.key==='relations')).toBe(false);expect(components(template.pages.find(page=>page.key==='story')!.root).some(component=>component.bindings?.text?.source==='variable')).toBe(false);}
    const template=createOfficialTemplate();const confirm=template.pages.find(page=>page.key==='confirm')!;const actions=components(confirm.root).find(component=>component.name==='Confirmation actions')!;
    expect(actions.layout.mode).toBe('row');expect(actions.children.map(component=>component.part)).toEqual(['confirm.confirm','confirm.cancel']);
  });
  it('binds relationship rows and HUDs to the same core identity without requiring a plugin',()=>{
    const template=createOfficialTemplate({kind:'rich',relationVariables:[{id:'RelatA',name:'澜汐',scope:'progress'}]});
    for(const key of ['relations','story'])expect(components(template.pages.find(page=>page.key===key)!.root).find(component=>component.bindings?.text?.source==='variable')?.bindings?.text).toEqual({source:'variable',scope:'progress',variableId:'RelatA'});
    expect(template.dependencies.every(dependency=>dependency.kind!=='plugin')).toBe(true);
    expect(readTemplateDocuments(createTemplateDocuments(template))).toEqual(template);
    expect(templateIssues(template)).toEqual([]);
  });
  it('persists authored plugin instances and exposes their actual configuration metadata', () => {
    const template = createOfficialTemplate(), page = template.pages.find(item => item.key === 'story')!;
    const definition = {key:'example.game/hud',componentKey:'example.game/hud',publicParts:['hud.value'],sampleProps:{title:'sample'},fields:[]};
    const inserted = insertPluginComponent(template,page.id,page.root.id,definition,{title:'authored'});
    const instance = components(inserted.template.pages.find(item=>item.id===page.id)!.root).find(item=>item.id===inserted.componentId)!;
    expect(instance.plugin).toEqual({key:'example.game/hud',props:{title:'authored'}});
    expect(components(page.root).some(item=>item.id===inserted.componentId)).toBe(false);
    expect(readTemplateDocuments(createTemplateDocuments(inserted.template)).pages.find(item=>item.id===page.id)!.root.children.at(-1)!.plugin).toEqual(instance.plugin);
    expect(pluginComponentCatalog([definition])[0]?.sampleProps).toEqual({title:'sample'});
  });
  it('copies short template IDs and CSS references while preserving visible text', () => {
    const template = createOfficialTemplate();
    const first = template.pages[0]!;
    const originalId = first.root.id;
    first.root.content.caption = `literal ${originalId}`;
    first.root.content.exact = originalId;
    const mapping = new Map<string, string>();
    const copy = instantiateTemplate(template, id => id === 'Asset1' ? 'Asset2' : id, id => id, mapping);
    expect(copy.instanceId).toMatch(/^[A-Za-z0-9]{6}$/);
    expect(copy.pages[0]!.root.content).toEqual(first.root.content);
    expect(copy.pages[0]!.root.id).not.toBe(originalId);
    const all = [copy.instanceId, ...copy.pages.flatMap(page => [page.id, page.portalRootId, ...components(page.root).map(item => item.id)]), ...copy.animations.map(item => item.id)];
    expect(new Set(all.map(id => id.toLowerCase())).size).toBe(all.length);
    const css = `[data-gc-component="${originalId}"] {background:url(asset:Asset1);content:"literal ${originalId}"}`;
    expect(rewriteTemplateCss(css, mapping, id => id === 'Asset1' ? 'Asset2' : id)).toBe(`[data-gc-component="${copy.pages[0]!.root.id}"] {background:url(asset:Asset2);content:"literal ${originalId}"}`);
  }, 30_000);
  it('creates each feature tier with complete required entrances and independent entities', () => {
    expect(DEFAULT_TEMPLATE).toBe('standard');
    expect(OfficialTemplates.map(item => item.kind)).toEqual(['light', 'standard', 'rich']);
    const light = createOfficialTemplate({ kind: 'light' });
    const standard = createOfficialTemplate();
    const rich = createOfficialTemplate({ kind: 'rich' });
    for (const template of [light, standard, rich]) {
      expect(RuntimeTemplateSchema.safeParse(template).success).toBe(true);
      expect(missingRequiredEntrances(template)).toEqual([]);
      expect(missingRequiredEntrances(template, 'windows')).toEqual([]);
    }
    expect(light.pages.some(page => page.key === 'cg')).toBe(false);
    expect(standard.pages.some(page => page.key === 'cg')).toBe(true);
    expect(standard.pages.some(page => page.key === 'flow')).toBe(false);
    expect(rich.pages.some(page => page.key === 'flow')).toBe(true);
    expect(components(rich.pages.find(page => page.key === 'story')!.root).find(component => component.part === 'story.toolbar.flow')?.visible).toBe(true);
    expect(components(standard.pages.find(page => page.key === 'story')!.root).some(component => component.part === 'story.toolbar.flow')).toBe(false);
    expect(rich.dependencies.some(dependency => dependency.id === 'org.galcraft.affection')).toBe(false);
    expect(createOfficialTemplate({kind:'rich',richRelation:'plugin'}).dependencies.find(dependency=>dependency.id==='org.galcraft.affection')?.required).toBe(true);
    expect(createOfficialTemplate({ kind: 'rich', richRelation: 'reading' }).dependencies
      .some(dependency => dependency.id === 'org.galcraft.affection')).toBe(false);
    const night = createOfficialTemplate({ kind: 'standard', appearance: 'night' });
    expect(night.features).toEqual(standard.features);
    expect(night.defaultVisual.background.color).not.toBe(standard.defaultVisual.background.color);
    const second = createOfficialTemplate();
    expect(second.instanceId).not.toBe(standard.instanceId);
    expect(second.pages[0]?.id).not.toBe(standard.pages[0]?.id);
    second.pages[0]!.background.color = '#000000';
    expect(standard.pages[0]?.background.color).not.toBe('#000000');
    const allIds = [standard.instanceId, ...standard.pages.flatMap(page => {
      const ids = [page.id, page.portalRootId];
      const visit = (component: typeof page.root) => { ids.push(component.id); component.children.forEach(visit); };
      visit(page.root);
      return ids;
    }), ...standard.animations.map(animation => animation.id)];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('emits M02 JSON documents and restores the exact runtime configuration', () => {
    const template = createOfficialTemplate();
    const documents = createTemplateDocuments(template);
    expect(documents[0]?.files['ui/template.json']).toBeDefined();
    expect(documents.length).toBe(2 + template.pages.length + 3);
    for (const item of documents) {
      const [path, raw] = Object.entries(item.files)[0]!;
      expect(path.startsWith('ui/')).toBe(true);
      const envelope = JSON.parse(raw) as Record<string, unknown>;
      expect(Object.keys(envelope).sort()).toEqual(['data', 'documentId', 'revision', 'schemaVersion']);
      expect(envelope).toMatchObject({ schemaVersion: 1, documentId: item.documentId, revision: 1 });
      expect(envelope.data).toBeDefined();
      if (path.startsWith('ui/pages/')) expect(envelope.data).toMatchObject({ id: item.documentId });
      if (path.startsWith('ui/locales/')) expect(envelope.data).toMatchObject({ schemaVersion: 1, locale: path.split('/').at(-1)!.replace('.json', '') });
    }
    expect(new Set(documents.map(item => item.documentId)).size).toBe(documents.length);
    expect(readTemplateDocuments(documents)).toEqual(template);
  });

  it('binds public parts to fixed actions and usable layout defaults', () => {
    expect(new Set(ComponentCatalog.map(item => item.part)).size).toBe(ComponentCatalog.length);
    expect(componentDefinition('story.toolbar.save')?.action).toBe('open:save');
    expect(componentDefinition('title.menu.exit')?.targets).toEqual(['windows']);
    expect(componentDefinition('story.toolbar.save')?.imageSlots).toContain('icon');
    expect(componentDefinition('settings.select.trigger')).toMatchObject({
      kind: 'select', contentKeys: ['labelKey'], imageSlots: ['icon', 'frame'],
      states: ['hover', 'pressed', 'focus', 'disabled'],
    });
    for (const part of ['cg.viewer.previous', 'cg.viewer.next', 'cg.viewer.back']) {
      expect(componentDefinition(part)?.imageSlots).toEqual(['icon', 'frame']);
    }
    expect(componentDefinition('cg.viewer.image')?.imageSlots).toEqual([]);
    for (const page of ['save', 'load']) for (const category of ['manual', 'quick', 'auto']) {
      expect(componentDefinition(`${page}.categoryTabs.${category}`)).toMatchObject({
        kind: 'tab', contentKeys: ['labelKey'], action: `selectCategory:${category}`,
        states: ['hover', 'pressed', 'focus', 'disabled'],
      });
    }
    expect(componentDefinition('story.bodyText')?.imageSlots).toEqual([]);
    const template = createOfficialTemplate();
    const story = template.pages.find(page => page.key === 'story')!;
    const panel = story.root.children.find(item => item.part === 'story.readingPanel')!;
    const textBox = panel.children.find(item => item.part === 'story.textBox')!;
    expect(panel.children.map(item=>item.part)).toEqual(['story.nameBox','story.textBox','story.avatar','story.toolbar']);
    expect(textBox.layout.height.unit).toBe('auto');
    expect(textBox.layout.maxHeight).toBe(290);
    expect(textBox.children.find(item => item.part === 'story.bodyText')?.layout.overflow).toBe('scroll');
    expect(story.toolbar?.anchor).toBe('bottom');
    const rect = resolveLayout(textBox.layout, { x: 0, y: 0, width: 1920, height: 1080 });
    expect(rect.height).toBe(138);
    expect(rect.y).toBe(0);
    const geometry = resolveComponentTree(story.root, { x: 0, y: 0, width: 1920, height: 1080 });
    const toolbar = geometry.children.find(item => item.part === 'story.readingPanel')!.children.find(item => item.part === 'story.toolbar')!;
    const toolbarParts=(node:typeof toolbar):string[]=>[node.part,...node.children.flatMap(toolbarParts)];
    expect(toolbarParts(toolbar)).toEqual(expect.arrayContaining(['story.toolbar.progress','story.toolbar.save','story.toolbar.tools','story.toolbar.settings','story.toolbar.pace','story.toolbar.auto','story.toolbar.more','story.toolbar.title']));
    expect(Math.max(...toolbar.children.map(item => item.rect.x + item.rect.width))).toBeLessThanOrEqual(1920);
    const title = template.pages.find(page => page.key === 'title')!;
    title.root.children.find(item => item.part === 'title.menu')!.visible = false;
    expect(missingRequiredEntrances(template)).toContain('title.menu.start');
  });

  it('rejects missing fixed actions on every enabled official page', () => {
    const missing = [
      'save.primary', 'load.primary', 'save.back', 'load.back', 'history.back',
      'confirm.confirm', 'confirm.cancel', 'dataImport.apply', 'dataClear.confirm',
      'cg.viewer.back', 'music.back', 'flow.enter', 'flow.back', 'characters.back',
      'videoError.retry', 'settings.dataImport', 'title.menu.music',
      'save.categoryTabs.manual', 'load.categoryTabs.quick', 'save.categoryTabs.auto',
    ];
    const find = (template: ReturnType<typeof createOfficialTemplate>, part: string) => {
      const visit = (node: typeof template.pages[number]['root']): typeof node | null =>
        node.part === part ? node : node.children.map(visit).find(Boolean) ?? null;
      return template.pages.map(page => visit(page.root)).find(Boolean) ?? null;
    };
    for (const part of missing) {
      const template = createOfficialTemplate({ kind: 'rich' });
      find(template, part)!.visible = false;
      expect(missingRequiredEntrances(template), part).toContain(part);
    }
    const template = createOfficialTemplate();
    template.pages = template.pages.filter(page => page.key !== 'confirm');
    expect(missingRequiredEntrances(template)).toContain('confirm');
    const rich = createOfficialTemplate({ kind: 'rich' });
    rich.pages.find(page => page.key === 'flow')!.root.visible = false;
    expect(missingRequiredEntrances(rich)).toContain('flow');
  });

  it('requires both Windows exit actions while keeping Web validation target-specific', () => {
    for (const part of ['title.menu.exit', 'settings.exit']) {
      const template = createOfficialTemplate();
      const find = (node: typeof template.pages[number]['root']): typeof node | null =>
        node.part === part ? node : node.children.map(find).find(Boolean) ?? null;
      template.pages.map(page => find(page.root)).find(Boolean)!.visible = false;
      expect(missingRequiredEntrances(template, 'windows')).toContain(part);
      expect(missingRequiredEntrances(template, 'web')).not.toContain(part);
    }
  });

  it('applies align and justify to row, column and grid flow', () => {
    const template = createOfficialTemplate();
    const menu = structuredClone(template.pages.find(page => page.key === 'title')!.root.children.find(item => item.part === 'title.menu')!);
    menu.children = menu.children.slice(0, 3);
    menu.layout = { ...menu.layout, anchorX: 0, anchorY: 0, x: { unit: 'px', value: 0 }, y: { unit: 'px', value: 0 },
      width: { unit: 'px', value: 100 }, height: { unit: 'px', value: 100 }, minHeight: 0, gap: 10 };
    for (const child of menu.children) child.layout = { ...child.layout,
      width: { unit: 'px', value: 20 }, height: { unit: 'px', value: 10 }, minWidth: 0, minHeight: 0 };
    menu.children = menu.children.slice(0, 2);
    menu.layout.mode = 'row'; menu.layout.align = 'end'; menu.layout.justify = 'spaceBetween';
    let result = resolveComponentTree(menu, { x: 0, y: 0, width: 100, height: 100 });
    expect(result.children.map(child => child.rect)).toMatchObject([{ x: 0, y: 90 }, { x: 80, y: 90 }]);
    menu.layout.mode = 'column'; menu.layout.align = 'center'; menu.layout.justify = 'center';
    result = resolveComponentTree(menu, { x: 0, y: 0, width: 100, height: 100 });
    expect(result.children.map(child => child.rect)).toMatchObject([{ x: 40, y: 35 }, { x: 40, y: 55 }]);
    menu.layout.align = 'stretch';
    result = resolveComponentTree(menu, { x: 0, y: 0, width: 100, height: 100 });
    expect(result.children.map(child => child.rect.width)).toEqual([100, 100]);
    menu.children.push(structuredClone(menu.children[0]!));
    menu.layout.mode = 'grid'; menu.layout.columns = 2; menu.layout.align = 'center'; menu.layout.justify = 'center';
    result = resolveComponentTree(menu, { x: 0, y: 0, width: 100, height: 100 });
    expect(result.children.map(child => child.rect)).toMatchObject([
      { x: 12.5, y: 35 }, { x: 67.5, y: 35 }, { x: 12.5, y: 55 },
    ]);
    menu.layout.justify = 'spaceBetween';
    result = resolveComponentTree(menu, { x: 0, y: 0, width: 100, height: 100 });
    expect(result.children.map(child => child.rect.y)).toEqual([0, 0, 90]);
  });

  it('provides translated labels for every visible fixed button', () => {
    const recordLabels = new Set(['cg.viewer.entry', 'cg.viewer.difference']);
    for (const kind of ['light', 'standard', 'rich'] as const) {
      const template = createOfficialTemplate({ kind });
      const visit = (node: typeof template.pages[number]['root']): void => {
        if (node.visible && componentDefinition(node.part)?.kind === 'button' && !recordLabels.has(node.part)) {
          const key = node.content.labelKey;
          expect(typeof key, node.part).toBe('string');
          for (const locale of ['zh-CN', 'en', 'ja']) expect(template.locales[locale]?.[key as string], node.part).toBeTruthy();
        }
        node.children.forEach(visit);
      };
      template.pages.forEach(page => visit(page.root));
      const select = components(template.pages.find(page => page.key === 'settings')!.root)
        .find(item => item.part === 'settings.select')!.children.find(item => item.part === 'settings.select.trigger')!;
      expect(select.content.labelKey).toBe('action.select');
      for (const page of ['save', 'load']) {
        const tabs = template.pages.find(item => item.key === page)!.root.children.find(item => item.part === `${page}.categoryTabs`)!;
        const expectedCategories = kind === 'light' ? ['manual'] : ['manual', 'quick', 'auto'];
        expect(tabs.children.map(item => item.part)).toEqual(expectedCategories.map(category => `${page}.categoryTabs.${category}`));
        for (const tab of tabs.children) {
          const key = tab.content.labelKey as string;
          expect(key).toBe(`save.${tab.part.split('.').at(-1)}`);
          for (const locale of ['zh-CN', 'en', 'ja']) expect(template.locales[locale]?.[key]).toBeTruthy();
        }
      }
    }
  });

  it('validates Chinese, English and Japanese keys and falls back to Chinese at runtime', () => {
    const resources = officialLocaleResources();
    expect(new Set(playerLocaleRows.map(row => row[0])).size).toBe(playerLocaleRows.length);
    expect(validateLocaleResources(resources)).toEqual([]);
    expect(resources.ja.strings['save.page']).toContain('{number}');
    const locales = Object.fromEntries(Object.entries(resources).map(([locale, resource]) => [locale, resource.strings]));
    expect(playerText(locales, 'ja', 'save.page', { number: 2 })).toMatchObject({ text: '2ページ', fallback: false });
    delete locales.ja!['title.start'];
    expect(playerText(locales, 'ja', 'title.start')).toMatchObject({ text: '开始游戏', resolvedLocale: 'zh-CN', fallback: true });
    resources.en.strings['save.page'] = 'Page {page}';
    expect(validateLocaleResources(resources)).toContain('en:save.page: parameter mismatch');
  });
});

it('adds plugin public parts without replacing authored layout and state',()=>{
 const template=createOfficialTemplate({kind:'rich'}),pages=[{key:'org.galcraft.affection/relations',titleKey:'page.relations',publicParts:['relations.list','relations.value']}];
 completePluginPages(template,pages);const page=template.pages.find(p=>p.key===pages[0]!.key)!;
 const component=page.root.children[0]!;component.normal.color='#123456';component.states.hover={opacity:.6};const id=component.id;
 completePluginPages(template,pages);expect(template.pages.filter(p=>p.key===pages[0]!.key)).toHaveLength(1);expect(page.root.children[0]!.id).toBe(id);expect(component.normal.color).toBe('#123456');expect(component.states.hover?.opacity).toBe(.6);expect(RuntimeTemplateSchema.safeParse(template).success).toBe(true);
});
