import type { ContextPart, WorkflowBinding } from '@galcraft/authoring/production';

export const workflowFixture: WorkflowBinding = {
  id: 'FlowAA', revision: 3, name: '黄昏背景 · 可复用图像流程', purpose: 'image', imageUsages: ['background'], graphVersion: '1', editorWorkflowPath: null,
  usageGuidance: { description: '为视觉小说制作宽幅场景背景，保留角色站位和字幕阅读空间。', scenarios: ['黄昏海边的日常场景', '章节转换时的环境定格'],
    inputs: [{ port: 'positive', description: '描述地点、时间、光线与构图；角色由立绘层负责。' }, { port: 'width', description: '使用作品画布宽度，并与高度保持对应比例。' }],
    promptTips: ['先写场景主体，再补光线和构图。', '需要无人物背景时，在提示词中明确说明。'], limitations: ['示例工作流只演示映射，模型与尺寸以实际服务为准。'],
    examples: [{ title: '黄昏海边', input: 'quiet seaside at sunset, warm light, wide composition, no people', notes: '预览地平线与字幕区域后再采用。' }] },
  apiGraph: {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'landscape-model.safetensors' }, _meta: { title: '加载图像模型' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: 'quiet seaside at sunset, warm light, wide composition', clip: ['1', 1] }, _meta: { title: '画面描述' } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: 'low quality, watermark', clip: ['1', 1] }, _meta: { title: '排除内容' } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: 1280, height: 720, batch_size: 1 }, _meta: { title: '画布与数量' } },
    '5': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0], seed: 42, steps: 20, cfg: 7 }, _meta: { title: '图像采样' } },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] }, _meta: { title: '解码图像' } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'GalCraft' }, _meta: { title: '保存图像' } },
  },
  inputs: [
    { port: 'positive', nodeId: '2', classType: 'CLIPTextEncode', input: 'text', valueType: 'string', required: true, transform: 'identity' },
    { port: 'width', nodeId: '4', classType: 'EmptyLatentImage', input: 'width', valueType: 'number', required: true, transform: 'round' },
  ], uploads: [], outputs: [{ nodeId: '7', key: 'custom_images', kind: 'image', decoder: 'comfyFileList', group: 'main', role: 'primary', background: 'unknown' }], requiredNodes: [], modelNotes: [],
};
export const contextFixture: ContextPart[] = Array.from({ length: 18 }, (_, index) => ({
  id: `Ctx${String(index).padStart(3, '0')}`, kind: index % 3 === 0 ? 'setting' : index % 3 === 1 ? 'character' : 'script',
  label: index % 3 === 0 ? `海滨小镇的世界设定 ${index + 1}` : index % 3 === 1 ? `角色资料 · 夏日同行者 ${index + 1}` : `黄昏海边 · 场景片段 ${index + 1}`,
  text: `第 ${index + 1} 段资料。夕阳照在安静的海边，人物在这里作出自己的选择。` + '保留人物已经确认的动机与场景事实。'.repeat(index % 4 + 1),
  included: index % 4 !== 0, source: null, media: null, attachment: null, authorEdited: false,
}));
