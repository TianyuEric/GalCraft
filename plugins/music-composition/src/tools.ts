import { IssueSchema, validateJsonData } from '@galcraft/contracts';
import type { Issue, Json, Result, SoundBankStatus } from '@galcraft/contracts';
import type { PluginContext, ToolContribution } from '@galcraft/plugins/contracts';
import { musicInstrumentSchema, readSoundBank } from './catalog.js';
import { pluginId } from './score.js';
export const soundbankToolKey=`${pluginId}/soundbankInfo`;
const string={type:'string'},integer={type:'integer',minimum:0},object=(properties:Record<string,Json>,required:string[]=[]):Json=>({type:'object',properties,required,additionalProperties:false});
const paging={search:string,offset:integer,limit:{type:'integer',minimum:1,maximum:100}},availability={enum:['ready','notInstalled','unreadable']};
export const soundbankToolInput:Json={oneOf:[object({action:{const:'libraries'},query:object({...paging,availability})},['action']),object({action:{const:'instruments'},soundbank:object({id:string,version:{const:'0.1.0'}},['id','version']),query:object({...paging,drum:{type:'boolean'}})},['action','soundbank'])]};
const summary=object({id:string,version:{const:'0.1.0'},name:string,upstreamVersion:string,format:{enum:['sf2','sf3']},bytes:integer,sourceUrl:string,license:string,notices:{type:'array',items:object({name:string,text:string},['name','text'])},availability},['id','version','name','upstreamVersion','format','bytes','sourceUrl','license','notices','availability']);
const issueSchema=IssueSchema.toJSONSchema({io:'input'}) as Json;
export const soundbankToolOutput:Json={oneOf:[object({action:{const:'libraries'},items:{type:'array',items:summary},total:integer,offset:integer,limit:integer,issues:{type:'array',items:issueSchema}},['action','items','total','offset','limit','issues']),object({action:{const:'instruments'},soundbank:summary,items:{type:'array',items:musicInstrumentSchema},total:{type:['integer','null'],minimum:0},offset:integer,limit:integer,issues:{type:'array',items:issueSchema}},['action','soundbank','items','total','offset','limit','issues'])]};
const issue=(code:string,message:string):Issue=>({code,message,severity:'error',owner:'M10',related:[],actions:['supplyDependency']});
const failed=(error:Issue):Result<Json>=>({ok:false,error,issues:[error]});
function describe(status:SoundBankStatus){const {id,version,name,upstreamVersion,format,bytes,sourceUrl,license,notices}=status.descriptor;return {id,version,name,upstreamVersion,format,bytes,sourceUrl,license,notices,availability:status.availability};}
export type SoundbankReader=(url:string)=>Promise<ArrayBuffer>;
const browserRead:SoundbankReader=async url=>{const response=await fetch(url);if(!response.ok)throw new Error(`Cannot read the soundbank (HTTP ${response.status}).`);return response.arrayBuffer();};
export async function soundbankInfo(input:Json,context:Pick<PluginContext,'soundbanks'>,read:SoundbankReader=browserRead):Promise<Result<Json>>{
  const valid=validateJsonData(soundbankToolInput,input);if(!valid.ok)return failed(issue('SOUNDBANK_TOOL_INPUT',valid.error.message));
  if(!context.soundbanks)return failed(issue('SOUNDBANK_HOST','The host soundbank catalog is unavailable.'));
  const value=input as {action:'libraries'|'instruments';soundbank?:{id:string;version:'0.1.0'};query?:{search?:string;availability?:string;drum?:boolean;offset?:number;limit?:number}},query=value.query??{},offset=query.offset??0,limit=query.limit??40;
  const listed=await context.soundbanks.list();if(!listed.ok)return listed;
  const match=(id:string,name:string)=>!query.search||`${id} ${name}`.toLocaleLowerCase().includes(query.search.toLocaleLowerCase());
  if(value.action==='libraries'){
    const filtered=listed.value.filter(status=>match(status.descriptor.id,status.descriptor.name)&&(!query.availability||status.availability===query.availability)).sort((a,b)=>a.descriptor.id.localeCompare(b.descriptor.id)||a.descriptor.version.localeCompare(b.descriptor.version));
    return {ok:true,warnings:[],value:{action:'libraries',items:filtered.slice(offset,offset+limit).map(describe),total:filtered.length,offset,limit,issues:filtered.flatMap(status=>status.issues) as unknown as Json}};
  }
  const status=listed.value.find(status=>status.descriptor.id===value.soundbank!.id&&status.descriptor.version===value.soundbank!.version);
  if(!status)return failed(issue('SOUNDBANK_UNKNOWN','This exact soundbank is unknown. Query libraries and choose an actual ID and version.'));
  let bank=describe(status),items:import('./catalog.js').MusicInstrument[]=[],total:number|null=null,issues=status.issues;
  if(status.availability==='ready'){
    const resolved=await context.soundbanks.resolve(value.soundbank!);
    if(!resolved.ok){bank={...bank,availability:'unreadable'};issues=resolved.issues;}
    else try{const parsed=await readSoundBank(await read(resolved.value.url));items=parsed.instruments.filter(instrument=>match(instrument.id,instrument.name)&&(query.drum===undefined||instrument.drum===query.drum)).sort((a,b)=>a.id.localeCompare(b.id));total=items.length;}
    catch(error){bank={...bank,availability:'unreadable'};issues=[issue('SOUNDBANK_UNREADABLE',`Cannot parse the selected soundbank: ${error instanceof Error?error.message:String(error)}`)];}
  }
  return {ok:true,warnings:[],value:{action:'instruments',soundbank:bank,items:items.slice(offset,offset+limit),total,offset,limit,issues} as unknown as Json};
}
export function soundbankInfoTool(context:Pick<PluginContext,'soundbanks'>,read:SoundbankReader=browserRead):ToolContribution{
  return {key:soundbankToolKey,titleKey:`${soundbankToolKey}-title`,descriptionKey:`${soundbankToolKey}-description`,inputFields:[],locations:['production.tools'],external:{version:'0.1.0',description:'Discover installed and imported SF2/SF3 libraries (libraries), then query an exact library instruments (instruments). Search, offset and limit (default 40, maximum 100) are supported; instruments also filters drum. IDs, pitch ranges and CC capabilities come from the selected file. total=null means unavailable; total=0 means no match. No installation, download, score writing or rendering occurs. For writeScore use the returned instruments and exact soundbank identity. Ticks use score PPQ, notes use MIDI pitches 0–127, controls use supported CC numbers: 1 modulation, 2 breath, 7 volume, 10 pan, 11 expression, 64 sustain, 91 reverb and 93 chorus. render uses an existing score and a local plugin connection; writeScore uses a text connection then renders locally.',inputSchema:soundbankToolInput,outputSchema:soundbankToolOutput,effects:['read'],async:false,cancel:false,targetFields:[]},runExternal:input=>soundbankInfo(input,context,read),async run(input){const result=await soundbankInfo(input&&typeof input==='object'&&!Array.isArray(input)&&input.action?input:{action:'libraries'},context,read);if(!result.ok)return result;return {ok:true,warnings:[],value:{kind:'report',issues:(result.value as {issues:Json}).issues as unknown as Issue[],message:JSON.stringify(result.value)}};}};
}
