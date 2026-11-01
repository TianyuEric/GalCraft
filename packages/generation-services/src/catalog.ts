import type { ConnectionConfig, Protocol, Purpose } from '@galcraft/contracts';
export const officialServices: { id: string; name: string; protocols: { protocol: Protocol; purposes: Purpose[] }[] }[] = [
  { id: 'org.galcraft.generation-services', name: '常用生成服务', protocols: [
    ...(['chatCompletions','anthropic','gemini','ollama'] as const).map(protocol => ({protocol,purposes:['text'] as Purpose[]})),
    {protocol:'openAIImage',purposes:['image','difference']},{protocol:'webUI',purposes:['image','difference']},
    ...(['openAISpeech','gptSoVits','miniMaxSpeech','elevenLabs'] as const).map(protocol => ({protocol,purposes:['speech'] as Purpose[]})),
    {protocol:'miniMaxMusic',purposes:['music']},
  ] },
  { id: 'org.galcraft.comfyui', name: 'ComfyUI 执行能力', protocols: [{protocol:'comfyUI',purposes:['image','difference','speech','music','matting']}] },
  { id: 'org.galcraft.novelai', name: 'NovelAI 创作能力', protocols: [{protocol:'novelAIText',purposes:['text']},{protocol:'novelAIImage',purposes:['image','difference']}] },
  { id: 'org.galcraft.voicestudio', name: 'VoiceStudio', protocols: [{protocol:'voiceStudio',purposes:['speech']}] },
];
export const serviceKeyForProtocol = (protocol: string): string | null => {
  const module = officialServices.find(module => module.protocols.some(entry => entry.protocol === protocol));
  return module ? `${module.id}/${protocol}` : null;
};
export function migrateConnection(config: ConnectionConfig): ConnectionConfig {
  const key = config.providerKey === 'org.galcraft.animation-generation/text' ? serviceKeyForProtocol(config.protocol) : config.providerKey === 'org.galcraft.voice-comfy/comfy' ? 'org.galcraft.comfyui/comfyUI' : config.providerKey ?? serviceKeyForProtocol(config.protocol);
  return key ? {...config, providerKey:key, ...(config.providerKey === 'org.galcraft.voice-comfy/comfy' ? {protocol:'comfyUI' as const,purposes:[...new Set([...config.purposes,'speech' as const])]}  : {})} : config;
}
