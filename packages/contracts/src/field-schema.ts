import {z} from 'zod';
import {ExprSchema,type FieldSpec} from './dsl.js';
import type {Json} from './common.js';

/** The public FieldSpec input contract shared by field-based contributions and their execution. */
export function fieldSpecsInputSchema(fields:readonly FieldSpec[]):Json {
  const {$defs,$schema:_version,...expression}=z.toJSONSchema(ExprSchema,{io:'input'});
  const expressionRefs=(value:unknown):unknown=>Array.isArray(value)?value.map(expressionRefs):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,key==='$ref'&&entry==='#'?'#/$defs/fieldExpression':expressionRefs(entry)])):value;
  let usesExpression=false;
  const object=(entries:readonly FieldSpec[]):Record<string,unknown>=>({type:'object',properties:Object.fromEntries(entries.map(field=>[field.path,convert(field)])),required:entries.filter(field=>field.required).map(field=>field.path),additionalProperties:false});
  const convert=(field:FieldSpec):Record<string,unknown>=>{
    let schema:Record<string,unknown>;
    if(field.type==='expression'){usesExpression=true;schema={$ref:'#/$defs/fieldExpression'};}
    else if(field.type==='object')schema=object(field.children??[]);
    else if(field.type==='array')schema={type:'array',items:field.item?convert(field.item):{},...(field.minItems===undefined?{}:{minItems:field.minItems})};
    else if(field.type==='enum')schema={enum:field.enumValues??[]};
    else schema={type:field.type==='ref'?'string':field.type};
    for(const[from,to]of [['min','minimum'],['max','maximum'],['exclusiveMin','exclusiveMinimum']]as const)if(field[from]!==undefined)schema[to]=field[from];
    if(field.nullable)schema={anyOf:[schema,{type:'null'}]};
    return {...schema,description:field.description,...(field.default!==null||field.nullable?{default:field.default}:{})};
  };
  const result=object(fields);return {...result,...(usesExpression?{$defs:{...$defs,fieldExpression:expressionRefs(expression)}}:{})} as Json;
}
