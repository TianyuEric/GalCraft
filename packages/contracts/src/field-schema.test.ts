import {expect,it} from 'vitest';
import {z} from 'zod';
import {ExprSchema,FieldSpecSchema} from './dsl.js';
import {fieldSpecsInputSchema} from './field-schema.js';

it('preserves recursive expression meaning inside an exact FieldSpec object contract',()=>{
  const expression=FieldSpecSchema.parse({path:'value',label:'Value',description:'Expression',type:'expression',required:true,nullable:false,default:null,unit:'none',group:'basic',summary:false,keywords:[]});
  const schema=z.fromJSONSchema(fieldSpecsInputSchema([{...expression,path:'value',required:true,nullable:false}]) as Parameters<typeof z.fromJSONSchema>[0]);
  const literal={kind:'literal',value:1},nested={kind:'binary',op:'+',left:literal,right:{kind:'unary',op:'-',value:literal}};
  for(const value of [literal,nested,{kind:'call',name:'min',args:[nested,literal]}]){expect(ExprSchema.safeParse(value).success).toBe(true);expect(schema.safeParse({value}).success).toBe(true);}
  expect(schema.safeParse({value:{kind:'binary',op:'+',left:{value:1},right:literal}}).success).toBe(false);
});
