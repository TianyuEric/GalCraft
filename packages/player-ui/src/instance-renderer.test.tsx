import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BasicComponentKinds, createId } from '@galcraft/contracts';
import { createBasicComponent, evaluateUICondition, resolveUIOfficialAction } from '@galcraft/templates/editor';
import { ComponentInstances, componentInstanceStyle } from './instance-renderer.js';
const context = { data: {}, local: {} };
describe('authored component instances', () => {
  it('uses the same local display override in regular and projected business buttons, including empty text', () => {
    const button = createBasicComponent('button'); button.content = { labelKey: 'page.characters' };
    const render = (override: string | undefined, projected: boolean) => renderToStaticMarkup(<ComponentInstances root={button} context={context} label={() => '后日谈'} textOverride={() => override} action={() => {}} {...projected ? { business: () => <button onClick={() => {}}>后日谈</button> } : {}}/>);
    for (const projected of [false, true]) { expect(render('After story', projected)).toContain('After story'); expect(render('', projected)).not.toContain('后日谈'); expect(render(undefined, projected)).toContain('后日谈'); }
    const text = createBasicComponent('text'); text.bindings = { text: { source: 'data', path: 'speaker' } };
    expect(renderToStaticMarkup(<ComponentInstances root={text} context={{ data: { speaker: '澜汐' }, local: {} }} label={() => ''} textOverride={() => 'After story'} action={() => {}}/>)).toContain('澜汐');
  });
  it('makes a whole afterstory card keyboard reachable and keeps locked and selected visuals distinct',()=>{
    const card=createBasicComponent('container');card.part='characters.card';card.states.locked={opacity:.4};card.states.selected={color:'#ffffff'};
    const render=(locked:boolean,selected:boolean)=>renderToStaticMarkup(<ComponentInstances root={card} context={context} label={key=>key} action={()=>{}} state={()=>({locked,selected})} business={(_,children)=><article>{children}</article>}/>);
    const available=render(false,true);expect(available).toContain('role="button"');expect(available).toContain('tabindex="0"');expect(available).toContain('data-gc-state="selected"');expect(available).not.toContain('<button');
    const locked=render(true,true);expect(locked).toContain('tabindex="-1"');expect(locked).toContain('aria-disabled="true"');expect(locked).toContain('data-gc-state="locked"');expect(locked).toContain('opacity:0.4');expect(locked).toContain('aria-pressed="false"');
  });
  it('renders number, false and empty string values while identifying a missing variable explicitly',()=>{
    const text=createBasicComponent('text');text.bindings={text:{source:'variable',scope:'progress',variableId:'ValueA'}};
    const render=(progress:Record<string,number|boolean|string>)=>renderToStaticMarkup(<ComponentInstances root={text} context={{data:{},local:{},variables:{progress,local:{},longTerm:{}}}} label={key=>key} action={()=>{}}/>);
    expect(render({ValueA:0})).toContain('>0</span>');expect(render({ValueA:false})).toContain('>false</span>');expect(render({ValueA:''})).toContain('></span>');expect(render({})).toContain('>—</span>');
    text.bindings.text={source:'variable',scope:'local',variableId:'ValueA',missingText:'当前场景无此值'};
    expect(render({ValueA:10})).toContain('当前场景无此值');
  });
  it('renders all eleven basic controls as actual native elements with stable author identities', () => {
    const root = createBasicComponent('container');
    root.children = BasicComponentKinds.map(kind => createBasicComponent(kind));
    root.children.find(child => child.part === 'basic.select')!.options = [{ value: 'a', label: 'First' }];
    const tabs = root.children.find(child => child.part === 'basic.tabs')!; tabs.options = [{ value: 'first', label: 'First tab' }, { value: 'second', label: 'Second tab' }]; tabs.children.push(createBasicComponent('text'));
    const html = renderToStaticMarkup(<ComponentInstances root={root} context={context} label={key => key} action={() => {}}/>);
    for (const child of root.children) expect(html).toContain(`data-gc-component="${child.id}"`);
    expect(html).toContain('type="range"'); expect(html).toContain('type="checkbox"'); expect(html).toContain('role="combobox"'); expect(html).toContain('role="tablist"'); expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-label="input"'); expect(html).toContain('<button');
  });
  it('uses stable item identities and the correct item values for two repeated rows', () => {
    const root = createBasicComponent('list'), row = createBasicComponent('button');
    root.repeat = { source: { source: 'data', path: 'characters' }, key: 'id', emptyText: 'No characters' };
    row.bindings = { text: { source: 'item', path: 'name' }, disabled: { source: 'item', path: 'locked' } }; root.children.push(row);
    const html = renderToStaticMarkup(<ComponentInstances root={root} context={{ data: { characters: [{ id: 'first', name: 'Lanxi', locked: false }, { id: 'second', name: 'Yue', locked: true }] }, local: {} }} label={key => key} action={() => {}}/>);
    expect(html).toContain('Lanxi'); expect(html).toContain('Yue'); expect(html).toContain(`${root.id}:first/${row.id}`); expect(html).toContain(`${root.id}:second/${row.id}`); expect(html.match(/disabled=""/g)).toHaveLength(1);
    const empty = renderToStaticMarkup(<ComponentInstances root={root} context={context} label={key => key} action={() => {}}/>);
    expect(empty).toContain('No characters'); expect(empty).not.toContain(`data-gc-component="${row.id}"`);
  });
  it('keeps group visual scale, anchor translation and animation transform on independent CSS properties', () => {
    const root = createBasicComponent('container'), group = createBasicComponent('container'); group.layout.anchorX = .5; group.layout.anchorY = 1; group.visualScale = 1.5; group.normal.fontSize = 26;
    const style = componentInstanceStyle(group, root);
    expect(style.scale).toBe('1.5'); expect(style.translate).toBe('-50% -100%'); expect(style.transform).toBeUndefined(); expect(style.fontSize).toBe(26);
  });
  it('retains hidden instance identity for exit animation and makes it noninteractive',()=>{
    const root=createBasicComponent('container'),control=createBasicComponent('button');control.bindings={visible:{source:'local',path:'shown'}};root.children=[control];
    const html=renderToStaticMarkup(<ComponentInstances root={root} context={{data:{},local:{shown:false}}} label={key=>key} action={()=>{}}/>);
    expect(html).toContain(`data-gc-component="${control.id}"`);expect(html).toContain('hidden=""');expect(html).toContain('inert=""');
  });
  it('resolves each record action from its own context and reads pure conditions without writing data', () => {
    const first = createId(), second = createId();
    const action = { kind: 'official' as const, action: { kind: 'selectOption' as const, optionId: first }, bindings: { optionId: { source: 'item' as const, path: 'id' } } };
    expect(resolveUIOfficialAction(action, { ...context, item: { id: first } })).toEqual({ kind: 'selectOption', optionId: first });
    expect(resolveUIOfficialAction(action, { ...context, item: { id: second } })).toEqual({ kind: 'selectOption', optionId: second });
    expect(evaluateUICondition({ op: 'equals', left: { source: 'item', path: 'id' }, right: { source: 'literal', value: first } }, { ...context, item: { id: first } })).toBe(true);
    expect(() => resolveUIOfficialAction(action, { ...context, item: {} })).toThrow();
  });
});
