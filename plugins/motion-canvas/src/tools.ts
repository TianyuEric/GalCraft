import { IssueSchema, validateJsonData } from '@galcraft/contracts';
import type { Json, Result } from '@galcraft/contracts';
import type { PluginContext, ToolContribution } from '@galcraft/plugins/contracts';
import { createMotionProject, motionIssue, motionProjectSchema, parseMotionProject, pluginId, toolchainKey } from './project.js';

export const projectToolKey = `${pluginId}/projectInfo`;
const object=(properties:Record<string,Json>,required=Object.keys(properties)):Json=>({type:'object',properties,required,additionalProperties:false});
const text={type:'string'},toolchain=object({id:text,version:text,motionCanvas:text,vite:text,playwright:text,browser:object({name:text,version:text,executablePath:text}),encoding:object({ffmpegVersion:text,ffprobeVersion:text,videoEncoder:text,audioEncoder:text,pixelFormat:text,toolDirectory:text}),runtimeDirectory:text,dependencies:{type:'object',additionalProperties:text},runtimeBytes:{type:'integer',minimum:0}});
export const projectToolInput:Json={oneOf:[object({action:{const:'describe'}}),object({action:{const:'runtime'}}),object({action:{const:'validate'},project:true})]};
const base={schema:{type:'object'},issues:{type:'array',items:IssueSchema.toJSONSchema({io:'input'}) as Json}};
export const projectToolOutput:Json={oneOf:[object({...base,action:{const:'describe'},valid:{type:'null'},project:motionProjectSchema,toolchain:{type:'null'}}),object({...base,action:{const:'validate'},valid:{type:'boolean'},project:{anyOf:[motionProjectSchema,{type:'null'}]},toolchain:{type:'null'}}),object({...base,action:{const:'runtime'},valid:{type:'null'},project:{type:'null'},toolchain:{anyOf:[toolchain,{type:'null'}]}})]};
export async function motionProjectInfo(input: Json, context: Pick<PluginContext, 'runtimeDependencies'>): Promise<Result<Json>> {
  const checked=validateJsonData(projectToolInput,input);if(!checked.ok)return checked;
  if (!input || typeof input !== 'object' || Array.isArray(input) || !['describe','validate','runtime'].includes(String(input.action))) {const error = motionIssue('MOTION_TOOL_INPUT', 'Choose describe, validate or runtime.');return {ok: false,error,issues:[error]};}
  const action = String(input.action), parsed = action === 'validate' ? parseMotionProject(input.project) : null;
  let toolchain: Json = null, issues = parsed && !parsed.ok ? parsed.issues : [];
  if (action === 'runtime') {
    const resolved = await context.runtimeDependencies?.resolve(toolchainKey);
    if (resolved?.ok) toolchain = resolved.value.expected;
    else issues = [resolved && !resolved.ok ? resolved.error : motionIssue('MOTION_RUNTIME', 'Prepare and install the optional local rendering toolchain.')];
  }
  return {ok: true, warnings: [], value: {action, valid: parsed ? parsed.ok : null, project: action === 'describe' ? createMotionProject() as unknown as Json : parsed?.ok ? parsed.value as unknown as Json : null, schema: motionProjectSchema, toolchain, issues: issues as unknown as Json}};
}
export function projectInfoTool(context: Pick<PluginContext, 'runtimeDependencies'>): ToolContribution {
  return {key: projectToolKey, titleKey: `${projectToolKey}-title`, descriptionKey:`${projectToolKey}-description`, inputFields: [], locations: ['production.tools'],
    external: {version: '0.1.0', description: 'Read the Motion Canvas project schema and a minimal 15-second source (describe), check project fields and semantic bindings (validate), or read exact local toolchain availability (runtime). Schema validation does not compile or render. After installing the optional toolchain, create a protocol:plugin local execution instance for org.galcraft.motion-canvas/renderProvider in Connections and Tools; use its actual connectionId. Create/read/edit sources through galcraft_documents. Prepare org.galcraft.motion-canvas/render with connectionId, fields.project and references [{assetId,variantId,port:images|fonts|audio}], then use the returned planId to submit and poll the resulting taskId. Read video candidates through galcraft_media; edit and create a new render to correct them. Adoption requires author confirmation; saving is a separate action.', inputSchema: projectToolInput, outputSchema: projectToolOutput, effects: ['read'], async: false, cancel: false, targetFields: []},
    async run(input) {const result = await motionProjectInfo(input&&typeof input==='object'&&!Array.isArray(input)&&input.action?input:{action:'describe'}, context); if (!result.ok) return result; const value = result.value as Record<string, Json>; return {ok:true,warnings:[],value:{kind:'report',issues:value.issues as unknown as import('@galcraft/contracts').Issue[],message:JSON.stringify(result.value)}};},
    runExternal: input => motionProjectInfo(input, context),
  };
}
