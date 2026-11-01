import type { Issue, Json, Result } from './common.js';

/** Shared JSON-schema validation for plugin data before a host commits an edit. */
export function validateJsonData(schema: Json, data: Json): Result<Json> { return validateWithRoot(schema,data,schema); }
function validateWithRoot(schema:Json,data:Json,root:Json):Result<Json>{
  const issues: Issue[] = [];
  const equal = (left: Json, right: Json): boolean => {
    if (left === right) return true;
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length && left.every((item, index) => equal(item, right[index]!));
    const keys = Object.keys(left); return keys.length === Object.keys(right).length
      && keys.every(key => Object.hasOwn(right, key) && equal(left[key]!, right[key]!));
  };
  const report = (path: string, message: string) => issues.push({ code: 'PLUGIN_SCHEMA', severity: 'error',
    owner: 'M09', message: `${path || '$'}: ${message}`, related: [], actions: ['edit'] });
  const visit = (definition: Json, value: Json, path: string, references=new Set<string>()): void => {
    if (definition === true) return;
    if (definition === false) { report(path, 'Value is disallowed'); return; }
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) { report(path, 'Invalid schema'); return; }
    if(definition.$ref!==undefined){const reference=definition.$ref;if(typeof reference!=='string'||!reference.startsWith('#/')){report(path,'Only local JSON Pointer references are supported');return;}if(references.has(reference)){report(path,'Cyclic schema reference without data traversal');return;}let target:Json|undefined=root;for(const token of reference.slice(2).split('/')){const key=token.replace(/~1/g,'/').replace(/~0/g,'~');target=target&&typeof target==='object'&&!Array.isArray(target)?target[key]:undefined;}if(target===undefined){report(path,`Missing schema reference ${reference}`);return;}visit(target,value,path,new Set([...references,reference]));}
    for (const keyword of ['anyOf', 'oneOf', 'allOf'] as const) if (Array.isArray(definition[keyword])) {
      const matching = definition[keyword].filter(variant => validateWithRoot(variant, value,root).ok).length;
      if (keyword === 'anyOf' && matching === 0 || keyword === 'oneOf' && matching !== 1 || keyword === 'allOf' && matching !== definition[keyword].length)
        report(path, `${keyword} constraints failed`);
    }
    if (definition.not !== undefined && validateWithRoot(definition.not, value,root).ok) report(path, 'Disallowed by not');
    const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    const allowed = Array.isArray(definition.type) ? definition.type : [definition.type];
    if (definition.type && !allowed.some(item => item === type || item === 'integer' && typeof value === 'number' && Number.isInteger(value))) {
      report(path, `Expected ${allowed.join('|')}`); return;
    }
    if (Array.isArray(definition.enum) && !definition.enum.some(item => equal(item, value))) report(path, 'Value is outside enum');
    if (definition.const !== undefined && !equal(definition.const, value)) report(path, 'Value differs from const');
    if (typeof value === 'number') {
      if (typeof definition.minimum === 'number' && value < definition.minimum) report(path, `Minimum ${definition.minimum}`);
      if (typeof definition.maximum === 'number' && value > definition.maximum) report(path, `Maximum ${definition.maximum}`);
      if (typeof definition.exclusiveMinimum === 'number' && value <= definition.exclusiveMinimum) report(path, `Greater than ${definition.exclusiveMinimum}`);
      if (typeof definition.exclusiveMaximum === 'number' && value >= definition.exclusiveMaximum) report(path, `Less than ${definition.exclusiveMaximum}`);
    }
    if (typeof value === 'string') {
      if (typeof definition.minLength === 'number' && value.length < definition.minLength) report(path, 'String too short');
      if (typeof definition.maxLength === 'number' && value.length > definition.maxLength) report(path, 'String too long');
      if (typeof definition.pattern === 'string' && !new RegExp(definition.pattern).test(value)) report(path, 'Pattern mismatch');
    }
    if (Array.isArray(value)) {
      if (typeof definition.minItems === 'number' && value.length < definition.minItems) report(path, 'Too few items');
      if (typeof definition.maxItems === 'number' && value.length > definition.maxItems) report(path, 'Too many items');
      if (definition.items !== undefined) value.forEach((item, index) => visit(definition.items!, item, `${path}[${index}]`));
    } else if (value && typeof value === 'object') {
      const properties = definition.properties && typeof definition.properties === 'object' && !Array.isArray(definition.properties) ? definition.properties : {};
      for (const key of Array.isArray(definition.required) ? definition.required : []) if (typeof key === 'string' && !Object.hasOwn(value, key)) report(`${path}.${key}`, 'Required field missing');
      for (const [key, item] of Object.entries(value)) {
        if (properties[key] !== undefined) visit(properties[key]!, item, `${path}.${key}`);
        else if (definition.additionalProperties === false) report(`${path}.${key}`, 'Unknown property');
        else if (definition.additionalProperties && typeof definition.additionalProperties === 'object') visit(definition.additionalProperties, item, `${path}.${key}`);
      }
    }
  };
  try { visit(schema, data, '$'); } catch (error) { report('$', String(error)); }
  return issues.length ? { ok: false, error: issues[0]!, issues } : { ok: true, value: structuredClone(data), warnings: [] };
}
