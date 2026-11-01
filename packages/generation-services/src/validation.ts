import type { CapabilityReport, GenerationInput, WorkflowBinding, Issue, Result, Purpose, ImageUsage, ProductionOperationSnapshot, Json } from '@galcraft/contracts';
import { enrichIssue, PurposeSchema, ImageUsageSchema, WorkflowUsageGuidanceSchema } from '@galcraft/contracts';
export const ok = <T>(value: T): Result<T> => ({ok:true,value,warnings:[]});
export const issue = (code:string,message:string):Issue => enrichIssue({code,message,severity:'error',owner:'M10',related:[],actions:['edit','retry']});
export const fail = <T = never>(code:string,message:string):Result<T> => {const error=issue(code,message);return {ok:false,error,issues:[error]};};
export function validateInput(input: GenerationInput, capability?: CapabilityReport, omitted: string[] = []): void {
  if (!input || typeof input.purpose !== 'string' || !['text', 'image', 'difference', 'speech', 'music', 'matting'].includes(input.purpose) && !input.purpose.includes('/')) throw new Error('Invalid generation purpose');
  const value = input as unknown as Record<string, unknown>;
  const required = input.purpose === 'text' ? ['messages', 'maxOutputTokens'] : input.purpose === 'image' ? [...(input.novelai?[]:['positive']), 'width', 'height', 'count']
    : input.purpose === 'difference' ? ['reference', 'instruction', 'width', 'height', 'count'] : input.purpose === 'speech' ? ['text', 'language']
      : input.purpose === 'music' ? ['prompt', 'durationSec'] : input.purpose.includes('/') ? ['fields'] : ['reference'];
  for (const key of required) if (omitted.includes(key) || value[key] === null || value[key] === undefined || value[key] === '' || Array.isArray(value[key]) && !value[key].length) throw new Error(`Missing ${key}`);
  for (const key of ['width', 'height', 'count', 'maxOutputTokens', 'durationSec']) if (key in value && (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] <= 0)) throw new Error(`${key} must be a positive number`);
  if (input.purpose === 'text' && input.messages.some(message => message.role === 'assistant' && message.attachments.length)) throw new Error('Images can only be attached to user messages');
  if (input.purpose === 'music' && input.instrumental && input.lyrics) throw new Error('Instrumental music cannot include lyrics');
  if (!capability) return;
  if (capability.status === 'unavailable' || capability.purpose !== input.purpose) throw new Error('The connection is unavailable for this purpose');
  for (const port of capability.inputs) {
    const v = value[port.port], populated = v !== null && v !== undefined && v !== '' && (!Array.isArray(v) || v.length > 0);
    if (port.required && (!populated || omitted.includes(port.port))) throw new Error(`Missing required port ${port.port}`);
    if (populated && !port.supported && !omitted.includes(port.port)) throw new Error(`Unsupported port ${port.port}; explicitly exclude it`);
    if (typeof v === 'number' && port.supported && (port.limits.min !== undefined && v < port.limits.min || port.limits.max !== undefined && v > port.limits.max || port.limits.step !== undefined && v % port.limits.step !== 0)) throw new Error(`The size or parameter exceeds the limits for ${port.port}`);
    if (populated && port.limits.values && !port.limits.values.includes(String(v))) throw new Error(`The value is outside the available set for ${port.port}`);
  }
  if (input.purpose === 'text') {
    const attachments = input.messages.flatMap(message => message.attachments), vision = capability.textVision;
    if (attachments.length && (!vision?.supported || vision.maxImages !== null && attachments.length > vision.maxImages)) throw new Error('The current connection does not support these images');
    for (const attachment of attachments) if (!vision!.mimeTypes.includes(attachment.mime) || vision!.maxBytes !== null && attachment.bytes > vision!.maxBytes) throw new Error('The attachment type or size exceeds this connection capability');
  }
}
/** The declared purpose and image uses govern every workflow selection path. */
export function workflowSupportsPurpose(binding: { purpose: Purpose | null; imageUsages: WorkflowBinding['imageUsages'] }, purpose: Purpose, imageUsage?: ImageUsage | null): boolean {
  return binding.purpose === purpose && (purpose !== 'image' || !!imageUsage && !!binding.imageUsages?.includes(imageUsage));
}
export function validateWorkflow(binding: WorkflowBinding, objectInfo?: Record<string, any>): void {
  const diagnostics = workflowDiagnostics(binding);
  if (diagnostics.length) throw new Error(diagnostics.map(item => item.message).join('\n'));
  if (!PurposeSchema.safeParse(binding?.purpose).success) throw new Error('Choose the workflow purpose before saving or producing.');
  if (binding.purpose === 'image' && (!Array.isArray(binding.imageUsages) || binding.imageUsages.some(usage => !ImageUsageSchema.safeParse(usage).success))) throw new Error('Declare valid image uses for the workflow.');
  if (binding.purpose !== 'image' && binding.imageUsages !== null) throw new Error('Image uses belong to image workflows.');
  if (binding.usageGuidance !== undefined) WorkflowUsageGuidanceSchema.parse(binding.usageGuidance);
  if (binding?.modelFamily !== undefined && (typeof binding.modelFamily !== 'string' || !binding.modelFamily.trim())) throw new Error('The declared model family must be a nonempty identity.');
  if (!binding || !binding.apiGraph || typeof binding.apiGraph !== 'object' || Array.isArray(binding.apiGraph) || !Array.isArray(binding.inputs) || !Array.isArray(binding.outputs) || !Array.isArray(binding.uploads)) throw new Error('A semantic binding requires an API graph, inputs, outputs and upload settings');
  for (const [id,node] of Object.entries(binding.apiGraph)) if (!node || typeof node.class_type !== 'string' || !node.inputs || typeof node.inputs !== 'object' || Array.isArray(node.inputs)) throw new Error(`API node ${id} lacks class_type or inputs`);
  if (!Object.keys(binding.apiGraph).length || !binding.outputs.length) throw new Error('The API graph and outputs must not be empty');
  const reachable = new Set<string>();
  const visit = (id: string) => { if (reachable.has(id)) return; reachable.add(id); for (const input of Object.values(binding.apiGraph[id]?.inputs ?? {})) if (Array.isArray(input) && input.length === 2 && typeof input[0] === 'string' && input[0] in binding.apiGraph) visit(input[0]); };
  binding.outputs.forEach(output => visit(output.nodeId));
  for (const port of binding.inputs) {
    if (!reachable.has(port.nodeId)) throw new Error(`The bound field is not connected to a saved output: ${port.nodeId}.${port.input}`);
    const node = binding.apiGraph[port.nodeId];
    if (!node || node.class_type !== port.classType || !(port.input in node.inputs)) throw new Error(`The bound node or field is absent: ${port.nodeId}.${port.input}`);
    if (Array.isArray(node.inputs[port.input])) throw new Error(`Cannot replace a node link: ${port.nodeId}.${port.input}`);
    const actual = typeof node.inputs[port.input];
    if (port.transform === 'identity' && ['string','number','boolean'].includes(port.valueType) && actual !== port.valueType) throw new Error(`Input type mismatch: ${port.nodeId}.${port.input} requires ${actual}`);
    if (objectInfo) {
      const spec = objectInfo[port.classType]?.input, type = spec?.required?.[port.input] ?? spec?.optional?.[port.input];
      if (!type) throw new Error(`The service does not provide the bound field: ${port.classType}.${port.input}`);
      if (Array.isArray(type[0]) && !type[0].includes(node.inputs[port.input])) throw new Error(`The model or enum is unavailable: ${port.classType}.${port.input}`);
    }
  }
  for (const upload of binding.uploads) if (upload.method === 'serverPath' && upload.serverRoot !== null && !upload.serverRoot.trim()) throw new Error('The shared server directory must not be empty');
  for (const output of binding.outputs) if (!binding.apiGraph[output.nodeId] || !output.key?.trim() || output.role === 'mask' && output.kind !== 'image') throw new Error(`Invalid output binding: ${output.nodeId}.${output.key}; choose a node and a nonempty history file-list field.`);
  for (const node of Object.values(binding.apiGraph)) if (objectInfo && !objectInfo[node.class_type]) throw new Error(`Node is not installed: ${node.class_type}`);
}

export type WorkflowDiagnostic = { code: string; path: string; message: string; nodeId?: string; input?: string };
type WorkflowValueType = WorkflowBinding['inputs'][number]['valueType'];
export type WorkflowOperationPort = { key: string; label: string; description: string; required: boolean; valueTypes: WorkflowValueType[]; reason: string | null };
/** Resolve only declared local schema references. Unsupported compositions stay visible and unmappable. */
export function workflowOperationPorts(operation: ProductionOperationSnapshot): WorkflowOperationPort[] {
  const root = operation.definition.inputSchema;
  const record = (value: unknown): Record<string, any> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
  const scalarTypes = (value: Json | undefined, seen = new Set<string>()): WorkflowValueType[] => {
    const schema = record(value); if (!schema) return [];
    if (schema.$ref) {
      if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/') || seen.has(schema.$ref)) return [];
      const target = schema.$ref.slice(2).split('/').reduce((value: any, key: string) => value?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], root);
      return scalarTypes(target, new Set([...seen, schema.$ref]));
    }
    const alternatives = schema.anyOf ?? schema.oneOf;
    if (Array.isArray(alternatives)) {
      const types = alternatives.map(item => record(item)?.type === 'null' ? ['null'] : scalarTypes(item, seen));
      return types.some(type => !type.length) ? [] : [...new Set(types.flat().filter(type => type !== 'null'))] as WorkflowValueType[];
    }
    if (schema.allOf || schema.not || schema.if) return [];
    const types = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : schema.enum ? [...new Set(schema.enum.filter((item: unknown) => item !== null).map((item: unknown) => typeof item))] : schema.const !== undefined ? [typeof schema.const] : [];
    if (!types.length || types.some((type: string) => !['null', 'string', 'number', 'integer', 'boolean'].includes(type))) return [];
    return [...new Set(types.filter((type: string) => type !== 'null').map((type: string) => type === 'integer' ? 'number' : type))] as WorkflowValueType[];
  };
  const rootSchema = record(root), fields: WorkflowOperationPort[] = operation.definition.fields.map(field => {
    const valueTypes = scalarTypes(rootSchema?.properties?.[field.path]);
    return { key: field.path, label: field.label, description: field.description, required: rootSchema?.required?.includes(field.path) ?? field.required,
      valueTypes, reason: valueTypes.length ? null : 'The declared field schema requires an unsupported structured value, composition or reference.' };
  });
  for (const [key, property] of Object.entries(rootSchema?.properties ?? {})) if (!fields.some(field => field.key === key)) {
    const schema = record(property), valueTypes = scalarTypes(property as Json);
    fields.push({ key, label: typeof schema?.title === 'string' ? schema.title : key, description: typeof schema?.description === 'string' ? schema.description : '', required: rootSchema?.required?.includes(key) ?? false, valueTypes,
      reason: valueTypes.length ? null : 'The declared field schema requires an unsupported structured value, composition or reference.' });
  }
  for (const input of operation.definition.inputs) if (['image', 'audio'].includes(input.type)) fields.push({ key: input.key, label: input.key, description: input.mimeTypes.join(', '), required: input.required, valueTypes: input.multiple ? [] : [input.type === 'audio' ? 'audioFile' : 'imageFile'], reason: input.multiple ? 'This media port requires multiple files; this node mapping supports one file.' : null });
  return fields;
}
export function workflowOperationDiagnostics(binding: Pick<WorkflowBinding, 'inputs'>, operation: ProductionOperationSnapshot): WorkflowDiagnostic[] {
  const ports = workflowOperationPorts(operation);
  return binding.inputs.flatMap((input, i) => {
    const port = ports.find(port => port.key === input.port);
    return !port || !port.valueTypes.includes(input.valueType) || input.transform !== 'identity' && input.valueType !== 'number'
      ? [{ code: 'MAPPING_OPERATION', path: `inputs.${i}`, message: `Mapping ${input.nodeId}.${input.input} is incompatible with public operation field ${input.port}. ${port?.reason ?? 'Rebind or remove it.'}`, nodeId: input.nodeId, input: input.input }] : [];
  });
}
/** Local completeness is independent of network availability and execution history. */
export function workflowDiagnostics(binding: Omit<WorkflowBinding, 'purpose'> & { purpose: Purpose | null }): WorkflowDiagnostic[] {
  const issues: WorkflowDiagnostic[] = [];
  const add = (code: string, path: string, message: string, nodeId?: string, input?: string) => issues.push({ code, path, message, nodeId, input });
  if (!binding.name.trim()) add('NAME_REQUIRED', 'name', 'Enter a workflow name.');
  if (!binding.purpose) add('PURPOSE_REQUIRED', 'purpose', 'Choose a purpose or public operation.');
  if (!Object.keys(binding.apiGraph).length) add('GRAPH_REQUIRED', 'apiGraph', 'Import a ComfyUI API graph.');
  if (binding.purpose === 'image' && !binding.imageUsages?.length) add('IMAGE_USE_REQUIRED', 'imageUsages', 'Select at least one image use.');
  if (!binding.outputs.length) add('OUTPUT_REQUIRED', 'outputs', 'Select a file output node.');
  const reachable = new Set<string>();
  const visit = (id: string) => { if (reachable.has(id)) return; reachable.add(id); for (const value of Object.values(binding.apiGraph[id]?.inputs ?? {})) if (Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'number') visit(value[0]); };
  binding.outputs.forEach(output => visit(output.nodeId));
  binding.outputs.forEach((output, i) => {
    if (!binding.apiGraph[output.nodeId] || !output.key.trim()) add('OUTPUT_INVALID', `outputs.${i}`, `Choose an existing output node and file-list field: ${output.nodeId}.${output.key}.`, output.nodeId);
    else if (output.classType && output.classType !== binding.apiGraph[output.nodeId]?.class_type) add('OUTPUT_INVALID', `outputs.${i}`, `Output node ${output.nodeId} changed from ${output.classType}. Select its output again.`, output.nodeId);
    else if (binding.apiGraph[output.nodeId]?.class_type === 'SaveImage' && output.kind !== 'image' || ['SaveAudio', 'SaveAudioMP3', 'SaveAudioOpus'].includes(binding.apiGraph[output.nodeId]?.class_type ?? '') && output.kind !== 'audio') add('OUTPUT_INVALID', `outputs.${i}`, `The declared media kind does not match standard save node ${output.nodeId}. Select a matching output node and media kind.`, output.nodeId);
  });
  binding.inputs.forEach((port, i) => {
    const node = binding.apiGraph[port.nodeId], path = `inputs.${i}`;
    if (!node || node.class_type !== port.classType || !(port.input in node.inputs)) add('MAPPING_ABSENT', path, `The original node or input changed: ${port.nodeId}.${port.input}. Rebind or remove it.`, port.nodeId, port.input);
    else if (Array.isArray(node.inputs[port.input])) add('MAPPING_LINK', path, `A node link is read only: ${port.nodeId}.${port.input}.`, port.nodeId, port.input);
    else if (!reachable.has(port.nodeId)) add('MAPPING_DISCONNECTED', path, `The mapped input ${port.nodeId}.${port.input} does not affect outputs ${binding.outputs.map(output => output.nodeId).join(', ')}. Select an output on its path or remove this mapping.`, port.nodeId, port.input);
    else if (port.transform === 'identity' && ['string', 'number', 'boolean'].includes(port.valueType) && typeof node.inputs[port.input] !== port.valueType) add('MAPPING_TYPE', path, `Input type changed: ${port.nodeId}.${port.input}. Rebind it.`, port.nodeId, port.input);
  });
  return issues;
}
