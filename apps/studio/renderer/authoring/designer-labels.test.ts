import {describe,it,expect} from 'vitest';
import {createOfficialTemplate} from '@galcraft/templates';
import {designerPageName,designerComponentName} from './designer-labels.js';
describe('designer system labels and authored translations',()=>{
  const template=createOfficialTemplate({kind:'standard'}),root=template.pages.find(page=>page.key==='title')!.root;
  it('falls back to system translations without changing the configured project resources',()=>{
    const locales={'zh-CN':{'page.title':'作者的首页'}};
    expect(designerPageName('title','en',locales)).toBe('Title');
    expect(designerPageName('title','zh-CN',locales)).toBe('作者的首页');
    expect(locales).toEqual({'zh-CN':{'page.title':'作者的首页'}});
  });
  it('prefers authored translations when a configured resource has the same key as an official label',()=>{
    const component={...root,content:{...root.content,labelKey:'page.title'}};
    const locales={en:{'page.title':'Opening credits'}};
    expect(designerPageName('title','en',locales)).toBe('Opening credits');
    expect(designerComponentName(component,'en',locales)).toBe('Opening credits');
    expect(designerComponentName(component,'en')).toBe('Title');
  });
});
