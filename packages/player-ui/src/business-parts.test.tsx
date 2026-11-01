import React from 'react';
import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createBasicComponent} from '@galcraft/templates/editor';
import {businessParts} from './business-parts.js';
import {ComponentInstances} from './instance-renderer.js';
describe('business page part projection',()=>{
  it('keeps locked repeated records isolated when their private parts are absent',()=>{
    const projection=businessParts(<><article key="a" data-gc-part="characters.card"><h2 data-gc-part="characters.card.name">Visible name</h2></article><article key="b" data-gc-part="characters.card"><div data-gc-part="characters.card.portrait"/></article></>);
    const component=createBasicComponent('text');component.part='characters.card.name';
    expect(projection.has(component.part,{data:{},local:{},item:{id:'b'}})).toBe(false);
    expect(projection.render(component,null,{data:{},local:{},item:{id:'b'}})).toBeNull();
    expect(renderToStaticMarkup(projection.render(component,null,{data:{},local:{},item:{id:'a'}}))).toContain('Visible name');
  });
  it('preserves native range inputs without attaching authored children to a void element',()=>{const component=createBasicComponent('slider');component.part='music.player.volume';const projection=businessParts(<input data-gc-part="music.player.volume" type="range" value="0.5" onChange={()=>{}}/>);const html=renderToStaticMarkup(<ComponentInstances root={component} context={{data:{},local:{}}} label={key=>key} action={()=>{}} business={projection.render}/>);expect(html).toContain('type="range"');expect(html).toContain('value="0.5"');expect(html).toContain(`data-gc-component="${component.id}"`);});
  it('projects the matching native record while retaining one shared authored row identity',()=>{const list=createBasicComponent('list'),row=createBasicComponent('button');row.part='music.list.item';row.content={};list.children=[row];list.repeat={source:{source:'data',path:'tracks'},key:'id'};const projection=businessParts(<>{['a','b'].map(id=><button key={id} data-gc-part="music.list.item" data-record={id}>{id==='a'?'First':'Second'}</button>)}</>);const html=renderToStaticMarkup(<ComponentInstances root={list} context={{data:{tracks:[{id:'a'},{id:'b'}]},local:{}}} label={key=>key} action={()=>{}} business={projection.render}/>);expect(html).toContain('data-record="a"');expect(html).toContain('data-record="b"');expect(html.match(new RegExp(`data-gc-component="${row.id}"`,'g'))).toHaveLength(2);expect(html).toContain('First');expect(html).toContain('Second');});
});
