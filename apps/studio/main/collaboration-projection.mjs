import { CollaborationError } from '@galcraft/collaboration';

const clone = value => structuredClone(value);
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Compose independently generated contracts without losing fragment-local definition scopes. */
export function bundleDefinitions(schema) {
  if(!record(schema))return schema;
  const definitions = {}, root = clone(schema);
  let sequence = 0;
  const visit = (node, inherited = {}, top = false) => {
    if (Array.isArray(node)) return node.map(item => visit(item, inherited));
    if (!record(node)) return node;
    const names = { ...inherited };
    for (const name of Object.keys(node.$defs ?? {})) names[name] = top ? name : `fragment${++sequence}_${name}`;
    for (const [name, definition] of Object.entries(node.$defs ?? {})) definitions[names[name]] = visit(definition, names);
    return Object.fromEntries(Object.entries(node).filter(([key]) => key !== '$defs').map(([key, value]) => {
      if (key === '$ref' && typeof value === 'string' && value.startsWith('#/$defs/')) {
        const [escaped, ...tail] = value.slice(8).split('/'), name = escaped.replaceAll('~1', '/').replaceAll('~0', '~');
        const mapped = (names[name] ?? name).replaceAll('~', '~0').replaceAll('/', '~1');
        return [key, `#/$defs/${mapped}${tail.length ? '/' + tail.join('/') : ''}`];
      }
      return [key, visit(value, names)];
    }));
  };
  const body = visit(root, {}, true);
  return { ...body, ...(Object.keys(definitions).length ? { $defs: definitions } : {}) };
}

/** Discovery is a permissive transport projection; M12 validates the authoritative schema. */
export function discoverySchema(schema, depth = 0) {
  if (!record(schema)) return clone(schema);
  const variants=schema.oneOf??schema.anyOf;
  if(variants?.length>8&&bytes(schema)>1800&&variants.every(branch=>branch.type==='object')){
    for(const key of ['action','mode','op','operationKey','kind']){
      const values=variants.flatMap(branch=>branch.properties?.[key]?.enum??(typeof branch.properties?.[key]?.const==='string'?[branch.properties[key].const]:[]));
      if(variants.every(branch=>typeof branch.properties?.[key]?.const==='string'||branch.properties?.[key]?.enum?.length&&branch.properties[key].enum.every(value=>typeof value==='string')))return {type:'object',properties:{[key]:{type:'string',enum:[...new Set(values)]}},...(variants.every(branch=>branch.required?.includes(key))?{required:[key]}:{}),additionalProperties:true,description:'Action discovery only. Read the selected exact contract from galcraft_catalog; all supplied fields pass unchanged to the authoritative provider.'};
    }
  }
  if (depth > 3 || (depth > 0 && bytes(schema) > 1800 && !schema.properties?.action && !schema.properties?.mode)) {
    return { description: 'Full payload is accepted unchanged. Read the exact input contract with galcraft_catalog before supplying it.' };
  }
  const result = {};
  for (const [key, value] of Object.entries(schema)) {
    if (['$schema', '$defs', 'definitions', '$id'].includes(key)) continue;
    // A reference-free permissive leaf prevents SDK converters from stripping payload fields.
    if (key === '$ref') return { description: 'Use the exact referenced contract from galcraft_catalog. Payload fields pass through unchanged.' };
    if (key === 'properties') result[key] = Object.fromEntries(Object.entries(value).map(([name, field]) => [name, discoverySchema(field, depth + 1)]));
    else if (['oneOf', 'anyOf', 'allOf'].includes(key)) result[key] = value.map(branch => discoverySchema(branch, depth));
    else if (['items','additionalProperties','contains','not','if','then','else','propertyNames'].includes(key)) result[key] = discoverySchema(value, depth + 1);
    else if (key === 'prefixItems') result[key] = value.map(item=>discoverySchema(item,depth+1));
    else result[key] = clone(value);
  }
  return result;
}

function resolve(root, node) {
  if (!record(node) || !node.$ref?.startsWith('#/')) return node;
  return node.$ref.slice(2).split('/').reduce((value, key) => value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], root) ?? node;
}
function branches(root, node = root) {
  node = resolve(root, node);
  return node.oneOf ?? node.anyOf ?? [node];
}
function tag(root, node, name) {
  node = resolve(root, node);
  return resolve(root, node.properties?.[name] ?? {});
}
function withDefinitions(root, selected) {
  const definitions = {}, pending = [selected], visited = new Set();
  while (pending.length) {
    const node = pending.pop();
    if (!record(node) && !Array.isArray(node)) continue;
    if (node.$ref?.startsWith('#/$defs/')) {
      const key = node.$ref.slice('#/$defs/'.length).split('/')[0];
      if (!visited.has(key)) { visited.add(key); if (root.$defs?.[key] === undefined) throw new CollaborationError('CONTRACT_REFERENCE', `Missing shared definition: ${key}`); definitions[key] = clone(root.$defs[key]); pending.push(definitions[key]); }
    }
    pending.push(...Object.values(node));
  }
  return { ...clone(selected), ...(Object.keys(definitions).length ? { $defs: definitions } : {}) };
}

/** Select every matching branch, including legal media variants sharing the same mode. */
export function exactContract(root, { action, operationKinds, fieldGroup, fieldGroups } = {}) {
  root=bundleDefinitions(root);
  const rootedReference=node=>node&&typeof node==='object'&&(typeof node.$ref==='string'&&!node.$ref.startsWith('#/$defs/')||Object.values(node).some(rootedReference));
  // Plugin root/pointer recursion is rooted in the complete provider schema. Keep it intact.
  if(rootedReference(root))return clone(root);
  let selected = root;
  if (action) {
    const matched = branches(root).filter(branch => ['action', 'mode'].some(name => {
      const field = tag(root, branch, name);
      return field.const === action || field.enum?.includes(action) || field.default === action;
    }) || action === 'edit' && !!resolve(root, branch).properties?.edit);
    if (!matched.length) throw new CollaborationError('CONTRACT_ACTION_MISSING', `The exact contract has no action or variant named ${action}.`);
    selected = matched.length === 1 ? resolve(root, matched[0]) : { anyOf: matched };
  }
  selected = withDefinitions(root, selected);
  if (operationKinds?.length) {
    const request = resolve(selected, selected.properties?.request);
    const operations = resolve(selected, request?.properties?.operations ?? request?.properties?.steps);
    if (!operations?.items) throw new CollaborationError('CONTRACT_OPERATIONS_MISSING', 'Select a page prepare contract with operations.');
    const candidates = branches(selected, operations.items);
    const filtered = candidates.filter(branch => operationKinds.includes(tag(selected, branch, 'kind').const));
    if (operationKinds.some(kind=>!filtered.some(branch=>tag(selected,branch,'kind').const===kind))) throw new CollaborationError('CONTRACT_OPERATION_MISSING', 'Select actual page operation kinds from the page catalog.');
    operations.items = filtered.length === 1 ? clone(filtered[0]) : { anyOf: clone(filtered) };
  }
  if (fieldGroup) {
    const request=resolve(selected,selected.properties?.request),operations=resolve(selected,request?.properties?.operations),operation=resolve(selected,operations?.items);
    const fields = resolve(selected,selected.properties?.fields ?? operation?.properties?.changes ?? selected);
    const groups = { layout: ['layout'], appearance: ['normal', 'states'], content: ['text', 'content', 'props','options'], binding: ['bindings', 'binding', 'repeat'], interaction: ['actions', 'events', 'interaction','interactions','animations'], identity: ['name','visible', 'locked','visualScale'], ...fieldGroups };
    const names=groups[fieldGroup]??(Object.hasOwn(fields?.properties??{},fieldGroup)?[fieldGroup]:null);
    if (!fields?.properties || !names?.length || !names.some(name=>Object.hasOwn(fields.properties,name))) throw new CollaborationError('CONTRACT_FIELD_GROUP', 'This selected contract does not expose the requested field group or field.');
    fields.properties = Object.fromEntries(Object.entries(fields.properties).filter(([name]) => names.includes(name)));
    fields.required = (fields.required ?? []).filter(name => name in fields.properties);
  }
  const { $defs, ...body } = selected;
  return withDefinitions({ ...root, $defs: { ...root.$defs, ...$defs } }, body);
}

export function pageSlice(values, input = {}, defaultLimit = 40) {
  const offset = input.offset ?? 0, limit = input.limit ?? defaultLimit;
  return { items: values.slice(offset, offset + limit), total: values.length, offset, limit, nextOffset: offset + limit < values.length ? offset + limit : null };
}

function readAt(root, path) {
  if (!path || path === '/') return root;
  if (!path.startsWith('/')) throw new CollaborationError('RESULT_PATH', 'Use a JSON pointer beginning with /.');
  const value = path.slice(1).split('/').reduce((node, key) => node?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], root);
  if (value === undefined) throw new CollaborationError('RESULT_PATH', 'The selected result path does not exist.');
  return value;
}

export function receiptView(call, input = {}) {
  call={...call,projectId:input.projectId,recovery:{...call.recovery,query:{...call.recovery?.query,projectId:input.projectId}}};
  if (input.resultPath !== undefined) {
    const value = readAt(call.result, input.resultPath);
    if (Array.isArray(value)) return { ...call, result: { path: input.resultPath, ...pageSlice(value, input) } };
    if (typeof value === 'string') {
      const offset = input.offset ?? 0, limit = input.limit ?? 12000;
      return { ...call, result: { path: input.resultPath, text: value.slice(offset, offset + limit), total: value.length, offset, limit, nextOffset: offset + limit < value.length ? offset + limit : null } };
    }
    return { ...call, result: { path: input.resultPath, value } };
  }
  if (input.view === 'full' || !record(call.result)) return call;
  const result = clone(call.result), plan = result.plan;
  if (['galcraft_edit_prepare','galcraft_pages','galcraft_save','galcraft_production','galcraft_ui_composition'].includes(call.tool) && plan && Array.isArray(result.changes) && (plan.input || plan.preview || plan.before)) {
    const {input:frozen,before,preview,...summary}=plan;
    result.plan = { ...summary,expected:frozen?.expected??plan.expected,
      ...(frozen?{input:{expected:frozen.expected}}:{}) };
    // changes is the single complete difference representation; large sets have a continuation.
    if (result.changes?.length > 40) result.changes = result.changes.slice(0, 40);
    result.review = { changesTotal: call.result.changes?.length ?? 0, complete: (call.result.changes?.length ?? 0) <= 40,
      read: { tool: 'galcraft_call', projectId: input.projectId, sessionId: call.sessionId, callId: call.callId, resultPath: '/changes', offset: 0, limit: 40 },
      frozenInput: { tool: 'galcraft_call', projectId: input.projectId, sessionId: call.sessionId, callId: call.callId, resultPath: frozen?'/plan/input':'/plan' } };
  }
  const tasks=call.tool==='galcraft_production'?(result.task?[{task:result.task,path:'/task'}]:(result.tasks??[]).map((task,index)=>({task,path:`/tasks/${index}`}))):[];
  for(const {task,path}of tasks)for(const [index,item]of (task.items??[]).entries())if(item.attempts?.length>5){
    const total=item.attempts.length;item.attempts=item.attempts.slice(-5);item.attemptsRange={total,offset:total-5,limit:5,read:{tool:'galcraft_call',projectId:input.projectId,sessionId:call.sessionId,callId:call.callId,resultPath:`${path}/items/${index}/attempts`,offset:0,limit:40}};
  }
  return { ...call, result };
}
