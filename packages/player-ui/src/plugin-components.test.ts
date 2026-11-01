import { expect, it } from 'vitest';
import type { ComponentContribution } from '@galcraft/plugins/contracts';
import { renderPluginComponent } from './plugin-components.js';

it('uses authored props and refreshes state bindings from each restored domain', () => {
  const component: ComponentContribution = {key:'example.game/hud',componentKey:'example.game/hud',publicParts:[],propsSchema:{type:'object',required:['title','value'],properties:{title:{type:'string'},value:{type:'number'}}},
    sampleProps:{title:'sample',value:0},stateBindings:[{property:'value',domain:'progress',path:'inventory/count'}],render:context=>context.props};
  const props = {title:'authored',value:1}, actions = {invoke:async()=>({ok:true as const,value:null,warnings:[]})};
  expect(renderPluginComponent(component,{props,input:{},progress:{inventory:{count:20}},longTerm:{},actions})).toMatchObject({ok:true,value:{title:'authored',value:20}});
  expect(renderPluginComponent(component,{props,input:{},progress:{inventory:{count:5}},longTerm:{},actions})).toMatchObject({ok:true,value:{title:'authored',value:5}});
  expect(props.value).toBe(1);
  expect(renderPluginComponent(component,{props:{title:3},input:{},progress:{inventory:{count:20}},longTerm:{},actions}).ok).toBe(false);
});
