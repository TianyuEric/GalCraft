import { describe, expect, it } from 'vitest';
import { validateProductionOperationDefinition } from '@galcraft/contracts';
import { operations, pluginId } from './definition.js';
describe('public six-mode voice definitions', () => {
  it('declares exact independent inputs and real MP3 save paths', () => {
    expect(operations).toHaveLength(6);
    for (const operation of operations) {
      validateProductionOperationDefinition(operation, { id: pluginId, version: '0.1.0' });
      const workflow = operation.workflow as any;
      expect(workflow.purpose).toBe(operation.id);
      expect(workflow.modelFamily).toBe(operation.id.includes('breeze') ? 'breeze-tts-2' : 'irodori-v4.1-small');
      expect(workflow.apiGraph[workflow.outputs[0].nodeId].inputs.format).toBe('mp3');
      expect(operation.fields.some(field => field.path === 'referenceText')).toBe(operation.id.includes('breeze') && !operation.id.endsWith('Design'));
      expect(operation.inputs.some(port => port.key === 'referenceAudio')).toBe(!operation.id.endsWith('Design'));
      expect(operation.fields.some(field => field.path === 'voiceDescription')).toBe(operation.id.endsWith('Design'));
      expect(operation.fields.some(field => field.path === 'performanceInstruction')).toBe(operation.id.endsWith('Direction'));
      expect(operation.fields.some(field => field.path === 'speed')).toBe(false);
    }
  });
});
