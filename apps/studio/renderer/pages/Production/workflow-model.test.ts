import { describe, expect, it } from 'vitest';
import { changeWorkflowOperation, compatiblePorts, mapWorkflowInput, operationPorts, replaceWorkflowGraph, workflowInputRows, workflowTopology } from './workflow-model.js';
import type { ProductionOperationSnapshot } from '@galcraft/contracts';
import { workflowDiagnostics, workflowOperationDiagnostics } from '@galcraft/generation-services/validation';
import { updateContextPart } from './context-table-model.js';
import { contextFixture, workflowFixture } from './workflow-fixture.js';

describe('semantic workflow editing', () => {
  it('uses the public schema including references and nullable unions, retaining unsupported fields explicitly', () => {
    const field = (path: string) => ({ path, label: path, description: '', type: 'object' as const, required: true, nullable: false, default: null, unit: 'none' as const, group: 'basic' as const, summary: true, keywords: [] });
    const operation: ProductionOperationSnapshot = { id: 'org.example.audio/design', version: 1, provider: { id: 'org.example.audio', version: '0.1.0' }, definition: {
      contractVersion: 1, id: 'org.example.audio/design', version: 1, title: 'Design', description: '', providerKey: 'org.example.audio/provider', purpose: 'org.example.audio/design',
      fields: ['description', 'choice', 'structured'].map(field), inputSchema: { type: 'object', properties: { description: { $ref: '#/$defs/description' }, choice: { anyOf: [{ type: 'number' }, { enum: ['fast', 'slow'] }, { type: 'null' }] }, structured: { type: 'object' } }, $defs: { description: { enum: ['warm', 'bright'] } }, required: ['description'] },
      inputs: [{ key: 'referenceAudio', type: 'audio', required: true, multiple: false, mimeTypes: ['audio/wav'] }], outputs: [{ key: 'audio', type: 'audio', required: true, multiple: false, mimeTypes: ['audio/wav'] }], capabilities: { query: true, refetch: true, cancelPerTask: false, resume: true }, adoption: { kind: 'asset', assetKind: 'audio', usages: ['voice'] },
    } };
    expect(compatiblePorts(operation.definition.purpose as 'speech', '', operation)).toEqual(['description', 'choice', 'referenceAudio']);
    expect(compatiblePorts('speech', 42, operation)).toEqual(['choice']);
    expect(operationPorts(operation).find(port => port.key === 'structured')).toMatchObject({ valueType: null, reason: expect.stringContaining('unsupported') });
    const binding = { ...structuredClone(workflowFixture), purpose: operation.definition.purpose as 'speech', operation: operation.id };
    const row = workflowInputRows(binding).find(row => typeof row.value === 'number')!;
    const mapped = mapWorkflowInput(binding, row, 'choice', operation);
    expect(mapped.inputs.find(input => input.nodeId === row.nodeId && input.input === row.input)).toMatchObject({ valueType: 'number' });
    expect(workflowOperationDiagnostics(binding, operation).length).toBeGreaterThan(0);
  });
  it('keeps author output keys and incompatible graph mappings visible until corrected', () => {
    const automatic = { ...structuredClone(workflowFixture), outputs: workflowFixture.outputs.map(output => ({ ...output, source: 'automatic' as const })) };
    expect(changeWorkflowOperation(automatic, 'speech').outputs[0]).toMatchObject({ key: 'audio', kind: 'audio' });
    expect(changeWorkflowOperation(workflowFixture, 'speech').outputs[0]).toMatchObject({ key: 'custom_images', kind: 'image' });
    const graph = structuredClone(workflowFixture.apiGraph); graph['2']!.class_type = 'DifferentTextNode';
    const replaced = replaceWorkflowGraph(workflowFixture, graph);
    expect(replaced.inputs).toEqual(workflowFixture.inputs);
    expect(workflowDiagnostics(replaced)).toContainEqual(expect.objectContaining({ code: 'MAPPING_ABSENT', nodeId: '2' }));
    delete graph['2'];
    expect(workflowInputRows(replaceWorkflowGraph(workflowFixture, graph)).some(row => row.nodeId === '2' && row.binding)).toBe(true);
  });
  it('offers only purpose and literal-type compatible fields', () => {
    expect(compatiblePorts('speech', '')).toContain('referenceAudio');
    expect(compatiblePorts('speech', '')).not.toContain('positive');
    expect(compatiblePorts('image', '')).toContain('references');
    expect(compatiblePorts('image', 720)).toEqual(['width', 'height', 'count', 'seed']);
    expect(compatiblePorts('music', true)).toEqual(['instrumental']);
    expect(compatiblePorts('matting', 1)).toEqual([]);
    expect(compatiblePorts('image', ['2', 0])).toEqual([]);
  });
  it('changes one mapping without overwriting graph links, transforms or custom history keys', () => {
    const original = structuredClone(workflowFixture);
    const width = workflowInputRows(original).find(row => row.nodeId === '4' && row.input === 'width')!;
    const changed = mapWorkflowInput(original, width, 'height');
    expect(changed.inputs.find(input => input.input === 'width')).toMatchObject({ port: 'height', transform: 'round' });
    expect(changed.apiGraph).toEqual(original.apiGraph);
    expect(changed.outputs).toEqual(original.outputs);
    expect(changed.outputs[0]!.key).toBe('custom_images');
    const link = workflowInputRows(original).find(row => row.nodeId === '2' && row.input === 'clip')!;
    expect(mapWorkflowInput(original, link, 'positive')).toBe(original);
    expect(original).toEqual(workflowFixture);
  });
  it('retains shared upload settings while binding or removing another input', () => {
    const original = structuredClone(workflowFixture);
    original.apiGraph['8'] = { class_type: 'LoadImage', inputs: { image: 'reference.png', second: 'reference2.png' } };
    original.inputs.push({ port: 'references', nodeId: '8', classType: 'LoadImage', input: 'image', valueType: 'imageFile', required: false, transform: 'identity' });
    original.uploads.push({ port: 'references', method: 'serverPath', subfolder: 'art', serverRoot: 'D:/shared/art' });
    const second = workflowInputRows(original).find(row => row.input === 'second')!;
    const changed = mapWorkflowInput(original, second, 'references');
    expect(changed.uploads).toEqual(original.uploads);
    const removed = mapWorkflowInput(changed, workflowInputRows(changed).find(row => row.input === 'image')!, '');
    expect(removed.uploads).toEqual(original.uploads);
  });
  it('lays out every imported node and exact link without changing topology', () => {
    const graph = structuredClone(workflowFixture.apiGraph), model = workflowTopology(graph);
    expect(model.nodes).toHaveLength(7);
    expect(model.edges).toHaveLength(9);
    expect(model.edges.some(edge => edge.source === '1' && edge.target === '2' && edge.input === 'clip' && edge.slot === 1)).toBe(true);
    expect(new Set(model.nodes.map(node => `${node.position.x},${node.position.y}`)).size).toBe(7);
    expect(model.nodes.every(node => Number.isFinite(node.position.x) && Number.isFinite(node.position.y))).toBe(true);
    expect(graph).toEqual(workflowFixture.apiGraph);
  });
});
describe('context table payloads', () => {
  it('updates the stable ID even when duplicate names are sorted or filtered', () => {
    const parts = structuredClone(contextFixture.slice(0, 3)); parts.forEach(part => { part.label = 'Same name'; });
    const changed = updateContextPart(parts, parts[1]!.id, { included: false });
    expect(changed[0]).toBe(parts[0]); expect(changed[2]).toBe(parts[2]);
    expect(changed[1]).toEqual({ ...parts[1], included: false });
  });
  it('edits text without altering source, attachment or included state', () => {
    const parts = structuredClone(contextFixture);
    const changed = updateContextPart(parts, parts[0]!.id, { text: 'Updated text' });
    expect(changed[0]).toEqual({ ...parts[0], text: 'Updated text', authorEdited: true });
    expect(changed.slice(1)).toEqual(parts.slice(1));
  });
});
