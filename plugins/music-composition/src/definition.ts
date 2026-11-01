import { productionMessages } from '@galcraft/plugins/contracts';
import translations from './display-translations.json' with { type: 'json' };
import type { FieldSpec, Json, ProductionOperationDefinition } from '@galcraft/contracts';
import type { PluginDefinition } from '@galcraft/plugins/contracts';
import { createMusicScore, musicScoreSchema, operationId, parseMusicScore, scoreDocumentKey } from './score.js';
import { documentEditorKey, editorKey, renderProviderKey, writingOperationId, writingPreparationKey } from './metadata.js';
import { compositionPresets } from './presets.js';
import { musicInstrumentSchema } from './catalog.js';
import {soundbankToolKey} from './tools.js';
import { musicConstraintsSchema } from './constraints.js';
const scoreField: FieldSpec = { path: 'score', label: 'Score', description: 'Edit sections, tracks, notes and sampled instruments.', labelKey: `${scoreDocumentKey}-label`, descriptionKey: `${scoreDocumentKey}-description`, type: 'object', required: true, nullable: false, default: createMusicScore() as unknown as Json,
  unit: 'none', group: 'basic', summary: true, keywords: ['composition', 'score'] };
export const musicRenderOperation: ProductionOperationDefinition = {
  contractVersion: 1, id: operationId, version: 1, title: 'Editable music composition', description: 'Render an existing multitrack score locally using its exact installed soundbank. Query soundbankInfo for real instrument IDs and ranges before preparing.', purpose: operationId, providerKey: renderProviderKey,
  execution:'local', fieldEditorKey: editorKey, fields: [scoreField], inputSchema: { type: 'object', properties: { score: musicScoreSchema }, required: ['score'], additionalProperties: false },
  inputs: [], outputs: [{ key: 'audio', type: 'audio', required: true, multiple: false, mimeTypes: ['audio/wav'] }],
  presets: compositionPresets,
  capabilities: { query: false, refetch: false, cancelPerTask: true, resume: false }, adoption: { kind: 'asset', assetKind: 'audio', usages: ['bgm'] },
};
export const musicWritingOperation:ProductionOperationDefinition={
  contractVersion:1,id:writingOperationId,version:1,title:'Write a score and render locally',description:'Use a compatible text connection to write a score, validate it, then render locally. Query soundbankInfo for the exact installed library and instruments; the host must provide that soundbank.',purpose:writingOperationId,providerKey:writingPreparationKey,textPreparationKey:writingPreparationKey,execution:'remote',
  connection:{purpose:'text',protocols:['chatCompletions','anthropic','gemini','ollama','novelAIText']},
  fieldEditorKey: `${editorKey}-writing`,
  fields:[{...scoreField,required:false,nullable:true,default:null,label:'Creative reference score'},
    {...scoreField,path:'soundbank',label:'Installed soundbank',description:'Choose an actual soundbank; otherwise inherit the creative reference or selected score scheme.',required:false,nullable:true,default:null},
    {...scoreField,path:'instruments',label:'Actual instrument catalog',type:'array',required:false,default:[]},
    {...scoreField,path:'presetId',label:'Writing style (optional)',description:'Omit for custom writing. ambient, dramatic and pop are writing style IDs; score scheme IDs are different.',type:'string',required:false,default:''},
    {...scoreField,path:'description',label:'Creative description',type:'string',default:'',required:true},
    {...scoreField,path:'musicConstraints',label:'Explicit music constraints',description:'Optional fixed BPM, meter, bars, body/total seconds, loop and instrument identity lists.',required:false,default:{}},
    {...scoreField,path:'render',label:'Rendering settings',required:false,nullable:true,default:null}],
  inputSchema:{type:'object',properties:{score:{anyOf:[musicScoreSchema,{type:'null'}]},soundbank:{anyOf:[{type:'object',properties:{id:{type:'string',minLength:1},version:{const:'0.1.0'}},required:['id','version'],additionalProperties:false},{type:'null'}]},instruments:{type:'array',items:musicInstrumentSchema},presetId:{enum:['','ambient','dramatic','pop']},description:{type:'string',minLength:1},musicConstraints:musicConstraintsSchema,render:{anyOf:[(musicScoreSchema as {properties:Record<string,Json>}).properties.render!,{type:'null'}]}},required:['description'],additionalProperties:false},
  inputs:[],outputs:[{key:'audio',type:'audio',required:true,multiple:false,mimeTypes:['audio/wav']}],capabilities:{query:false,refetch:false,cancelPerTask:false,resume:false},adoption:{kind:'asset',assetKind:'audio',usages:['bgm']}
};
export const definition: PluginDefinition = {
  productionOperations: [musicRenderOperation,musicWritingOperation],
  documents: [{ key: scoreDocumentKey, titleKey: `${scoreDocumentKey}-title`, schema: { type: 'object', properties: { score: musicScoreSchema }, required: ['score'], additionalProperties: false },
    fields: [scoreField], initial: { score: createMusicScore() } as unknown as Json,
    stateVersion: 1, instances: 'multiple', validate(data) { const parsed = parseMusicScore(data && typeof data === 'object' && !Array.isArray(data) ? data.score : undefined); return parsed.ok ? { ...parsed, value: { score: parsed.value } as unknown as Json } : parsed; },
    collectReferences: () => [], rewriteReferences: data => ({ ok: true, warnings: [], value: data }) }],
  messages: {
    'zh-CN': { [`${scoreDocumentKey}-title`]: '编曲作者源', [`${scoreDocumentKey}-label`]: '乐谱', [`${scoreDocumentKey}-description`]: '编辑分段、音轨、音符与采样音色' },
    en: { ['org.galcraft.music-composition/soundbankInfo-title']:'Soundbank and instrument catalog', [`${scoreDocumentKey}-title`]: 'Composition source', [`${scoreDocumentKey}-label`]: 'Score', [`${scoreDocumentKey}-description`]: 'Edit sections, tracks, notes and sample soundbanks' },
    ja: { [`${scoreDocumentKey}-title`]: '作曲ソース', [`${scoreDocumentKey}-label`]: '楽譜', [`${scoreDocumentKey}-description`]: 'セクション、トラック、ノート、サンプル音源を編集' },
  },
};
export { documentEditorKey };
for(const [locale,title,description]of [['zh-CN','音源与乐器目录','查询实际音源库、乐器身份、音域和控制器能力。'],['en','Soundbank and instrument catalog','Find actual soundbanks, instrument identities, pitch ranges and controller capabilities.'],['ja','音源と楽器の一覧','実際の音源、楽器の識別子、音域、コントローラー機能を確認します。']]){definition.messages![locale!]![`${soundbankToolKey}-title`]=title!;definition.messages![locale!]![`${soundbankToolKey}-description`]=description!;}
productionMessages(definition.productionOperations!, translations, definition.messages);
export function createDefinition(): PluginDefinition { return definition; }
