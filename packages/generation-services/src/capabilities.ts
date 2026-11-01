import type {CapabilityReport,ConnectionConfig,GenerationInput,WorkflowBinding} from '@galcraft/contracts';
import {validateInput} from './validation.js';
export function inputCapability(config: ConnectionConfig, input: GenerationInput, workflow: WorkflowBinding | null): CapabilityReport {
  const protocols: Record<string, string[]> = {
    chatCompletions: ['system', 'messages', 'maxOutputTokens', 'temperature', 'seed'], anthropic: ['system', 'messages', 'maxOutputTokens', 'temperature'],
    gemini: ['system', 'messages', 'maxOutputTokens', 'temperature', 'seed'], ollama: ['system', 'messages', 'maxOutputTokens', 'temperature', 'seed'], novelAIText: ['system', 'messages', 'maxOutputTokens', 'temperature', 'seed'],
    webUI: ['positive', 'negative', 'instruction', 'width', 'height', 'count', 'seed', 'references', 'reference'], novelAIImage: ['positive', 'negative', 'instruction', 'width', 'height', 'count', 'seed', 'references', 'reference'],
    openAIImage: ['positive', 'instruction', 'width', 'height', 'count', 'references', 'reference'], openAISpeech: ['text', 'voiceId', 'speed'],
    gptSoVits: ['text', 'language', 'referenceAudio', 'referenceText', 'referenceLanguage'], miniMaxSpeech: ['text', 'language', 'voiceId', 'emotion', 'speed'], elevenLabs: ['text', 'language', 'voiceId'],
    miniMaxMusic: ['prompt', 'lyrics', 'instrumental'],
  };
  const supported = config.protocol === 'comfyUI' ? workflow?.inputs.map(port => port.port) ?? [] : protocols[config.protocol] ?? [];
  const localInputs = config.protocol === 'openAISpeech' ? ['language'] : config.protocol === 'miniMaxMusic' ? ['durationSec'] : [];
  const declared = config.parameters.capabilityInputs as CapabilityReport['inputs'] | undefined;
  return { connectionId: config.id, connectionRevision: config.revision, checkedAt: new Date().toISOString(), serviceVersion: null, purpose: input.purpose, status: 'unverified',
    inputs: Object.keys(input).filter(key => !['purpose', 'usage'].includes(key)).map(port => {
      const capability = declared?.find(value => value.port === port) ?? { port, required: false,
        supported: supported.includes(port) || port === 'count' && 'count' in input && input.count === 1 || port === 'language' && config.protocol === 'comfyUI' && config.parameters.language === (input as any).language,
        limits: {} };
      return localInputs.includes(port) ? { ...capability, supported: true } : capability;
    }), output: input.purpose === 'text' ? 'text' : ['speech', 'music'].includes(input.purpose) ? 'audio' : 'image', models: [config.model], promptFormat: null,
    textVision: input.purpose === 'text' ? { supported: config.parameters.textVision === true, mimeTypes: ['image/png', 'image/jpeg', 'image/webp'], maxImages: null, maxBytes: null } : null,
    remote: { query: config.protocol === 'comfyUI', cancelQueued: config.protocol === 'comfyUI', cancelRunning: config.protocol === 'comfyUI' ? 'globalOnly' : 'none' }, issues: [] };
}
export function confirmInput(config: ConnectionConfig, input: GenerationInput, workflow: WorkflowBinding | null, omittedPorts: string[], capability?: CapabilityReport): GenerationInput {
  validateInput(input, capability ?? inputCapability(config, input, workflow), omittedPorts);
  const output = structuredClone(input) as unknown as Record<string, unknown>;
  for (const port of omittedPorts) { if (!(port in output)) throw new Error(`排除端口不存在：${port}`); output[port] = null; }
  return output as unknown as GenerationInput;
}
