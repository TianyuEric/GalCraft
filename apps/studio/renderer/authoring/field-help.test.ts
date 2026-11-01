import { expect, it } from 'vitest';
import { CoreCommandSpecs } from '@galcraft/dsl';
import type {FieldSpec} from '@galcraft/contracts';
import { extendedFieldLabel } from './field-help.js';
it('localizes every built-in parameter label',()=>{
 const missing=new Set<string>();
 const visit=(f:FieldSpec)=>{if(extendedFieldLabel(f,'zh-CN')===f.path)missing.add(f.path);f.children?.forEach(visit);if(f.item)visit(f.item);};
 CoreCommandSpecs.forEach(c=>c.fields.forEach(visit));expect([...missing]).toEqual([]);
});
