import { createServer } from 'node:http';
import { isDeepStrictEqual } from 'node:util';
import { createMcpHandler, McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { z } from 'zod';
import { issueFromError, issueSummary } from '@galcraft/contracts';
import { publicCall } from '@galcraft/collaboration';
import { collaborationGuide } from './collaboration-catalog.mjs';
import { studioVersion } from './studio-version.mjs';
import { ProjectsControlSchema, CollaborationControlSchema } from './collaboration-control.mjs';
import { discoverySchema, receiptView } from './collaboration-projection.mjs';
import { listenLocalService, requireServicePort, servicePort, STUDIO_MCP_PORT } from './local-service-ports.mjs';

/** Transport owns listening; M12 and the providers own every business action. */
export class CollaborationMcp {
  constructor({ catalog, invoke, sessions, capabilities, receipt,cancel,media,control,bootstrap,recoverTask }) { Object.assign(this, { catalog, invoke, sessions, capabilities, receipt,cancel,media,control,bootstrap,recoverTask }); this.server = null; this.endpoint = null; }
  async start(port, options = {}) {
    port = servicePort(port);
    if (this.starting) { await this.starting; requireServicePort(port, this.endpoint); return { endpoint: this.endpoint }; }
    if (this.server) { requireServicePort(port, this.endpoint); return { endpoint: this.endpoint }; }
    this.starting = this.listen(port, options);
    try { return await this.starting; } finally { this.starting = null; }
  }
  async listen(port, { previousPort } = {}) {
    this.metrics??={requests:0,rejectedRequests:0,parameterRejections:0,originalQueries:0,controlCalls:0};
    let previousCatalog,preparedCatalog;
    const handler = createMcpHandler(async () => {
      const server = new McpServer({ name: 'galcraft-studio', version: studioVersion }, {instructions:'Use galcraft_guide first. Create/open with the project controls, then use context mode:bootstrap for the explicitly selected project. Start or join collaboration explicitly. Every project business call requires projectId and sessionId. Read exact contracts on demand with galcraft_catalog. Query original call identities after disconnect; honor scope and pause.'});
      const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
      const rejected = error => {const issue=issueFromError(error,'M12');const value={accepted:false,error:{code:error.code??issue.code,message:issueSummary(issue),issue,applied:false,...(error.review?{review:error.review}:{})},recovery:{next:'Correct the indicated input, session binding or scope, then make a new request. No business action was accepted.'}};return {isError:true,content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};};
      const safe = action => async input => { try { return await action(input); } catch (error) { return rejected(error); } };
      const strings=z.array(z.string()),guideSchema=z.strictObject({version:z.string(),purpose:z.string(),start:strings,identities:z.record(z.string(),z.string()),results:strings,editing:strings,production:strings,media:strings,examples:z.array(z.strictObject({tool:z.string(),arguments:z.record(z.string(),z.json())}))});
      const catalog=await this.catalog();
      if(!previousCatalog||!isDeepStrictEqual(previousCatalog,catalog)){
        preparedCatalog=catalog.map(definition=>({definition,inputSchema:z.strictObject({projectId:z.string(),sessionId:definition.key==='galcraft_context'?z.string().optional():z.string(),callId:z.string().optional(),view:z.enum(['summary','full']).optional(),...(definition.key==='galcraft_production'?{recovery:z.boolean().optional()}:{}),input:definition.key==='galcraft_context'?z.union([z.strictObject({mode:z.literal('bootstrap'),projectId:z.string()}),z.fromJSONSchema(discoverySchema(definition.inputSchema))]):z.fromJSONSchema(discoverySchema(definition.inputSchema))})}));
        previousCatalog=catalog;
      }
      server.registerTool('galcraft_guide', { description: 'Start here. Public GalCraft workflow, ID sources, schemas, failure recovery, media reading and the project/session control, generation, adoption, formal-save and local-release endpoints. No session required.', inputSchema: z.object({}), outputSchema: z.strictObject({result:guideSchema}) }, async () => result({ result: collaborationGuide }));
      if(this.control){
        for(const [key,inputSchema] of [['galcraft_projects',ProjectsControlSchema],['galcraft_collaboration',CollaborationControlSchema]])server.registerTool(key,{description:key==='galcraft_projects'?'Discover projects and templates, prepare create/open, then apply the reviewed target with the author decision. No collaboration session required. Mutating controls require callId; an authorDecision must express the actual author choice.':'Create a collaboration, review scope differences, rebind an expired write session, pause/resume/end. No existing session is needed for options or prepareCreate. Confirm only the actual author-authorized plan; keep model proposals pending. Query original control calls after disconnect.',inputSchema:z.strictObject({callId:z.string().optional(),input:inputSchema}),outputSchema:z.strictObject({result:z.json()})},safe(async request=>result({result:JSON.parse(JSON.stringify(await this.control.invoke(key,request.input,request.callId)))})));
        server.registerTool('galcraft_control_call',{description:'Query an original project or collaboration control call. Never repeats a project creation, scope choice or rebind.',inputSchema:z.strictObject({callId:z.string()}),outputSchema:z.strictObject({result:z.json()})},safe(async input=>result({result:await this.control.query(input.callId)})));
      }
      server.registerTool('galcraft_sessions', { description: 'Read collaboration summaries without creating or rebinding. Filter by projectId; history is paginated.', inputSchema: z.strictObject({projectId:z.string().optional(),offset:z.number().int().nonnegative().optional(),limit:z.number().int().min(1).max(100).optional()}) }, safe(async input => result({ result: await this.sessions(input) })));
      server.registerTool('galcraft_capabilities', { description: 'Read current operation, connection, workflow and document identities for the specified active project/session. This never starts or rebinds a collaboration.', inputSchema: z.strictObject({ projectId:z.string(),sessionId: z.string() }) }, safe(async input => result({ result: await this.capabilities(input) })));
      server.registerTool('galcraft_call', { description: 'Query an original accepted call. view:full returns the exact original result; resultPath reads a JSON pointer within result, with offset/limit for arrays or text. Querying never resubmits or consumes quota.', inputSchema: z.strictObject({projectId:z.string(),sessionId:z.string(),callId:z.string(),view:z.enum(['summary','full']).optional(),resultPath:z.string().optional(),offset:z.number().int().nonnegative().optional(),limit:z.number().int().min(1).max(24000).optional()}) }, safe(async input => result(receiptView(publicCall(await this.receipt(input)),input))));
      if(this.cancel)server.registerTool('galcraft_cancel',{description:'Request cancellation using the original projectId/sessionId/callId. Inspect the original call for its final business state.',inputSchema:z.strictObject({projectId:z.string(),sessionId:z.string(),callId:z.string()})},safe(async input=>result({result:await this.cancel(input)})));
      if (this.media) server.registerResource('galcraft-media', new ResourceTemplate('galcraft-media://{resourceId}', { list: async () => ({ resources: this.media.list() }) }), { description: 'Actual pixels or complete original video/audio bytes. Scope and source lifecycle are checked on each read.' }, async (uri, { resourceId }) => {
        const { entry, bytes } = await this.media.bytes(String(resourceId));
        return { contents: [{ uri: uri.href, mimeType: entry.mime, blob: bytes.toString('base64') }] };
      });
      for (const {definition,inputSchema} of preparedCatalog) server.registerTool(definition.key, {
        title: definition.title, description: `${definition.description}\nExact input: galcraft_catalog category:tools key:${definition.key}; select action/part as needed. Supply fixed projectId/sessionId; new writes also require callId.`,
        inputSchema,
        annotations: { readOnlyHint: definition.effects.every(effect => ['read','preview'].includes(effect)), destructiveHint: false },
      }, async (request,transportContext) => {
        try {
          if(definition.key==='galcraft_context'&&request.input.mode==='bootstrap'){
            if(request.input.projectId!==request.projectId)throw Object.assign(new Error('Bootstrap must name the same explicit projectId in the envelope and input.'),{code:'PROJECT_BINDING_MISMATCH'});
            return result({result:await this.bootstrap({projectId:request.projectId})});
          }
          if(definition.key==='galcraft_production'&&request.recovery)return result({result:await this.recoverTask({projectId:request.projectId,sessionId:request.sessionId,input:request.input,signal:transportContext.mcpReq.signal})});
          const record = publicCall(await this.invoke({projectId:request.projectId,sessionId:request.sessionId,callId:request.callId,tool:definition.key,input:request.input,signal:definition.key==='galcraft_production'&&request.input.action==='wait'?transportContext.mcpReq.signal:undefined})); const output = result(receiptView(record,request)); if (this.media) output.content.push(...await this.media.contents(record.result)); return output;
        }
        catch (error) { return rejected(error); }
      });
      return server;
    });
    const handle = toNodeHandler(handler), host = localhostHostValidation(), origin = localhostOriginValidation();
    const server = createServer((request, response) => {
      if (!host(request, response) || !origin(request, response)) return;
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      if (this.media && pathname.startsWith('/media/') && ['GET', 'HEAD'].includes(request.method)) {
        void (async () => { try {
          const { entry, bytes } = await this.media.bytes(pathname.slice('/media/'.length));
          const headers = { 'content-type': entry.mime, 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
          if (request.headers.range) {
            const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
            const start = range?.[1] ? Number(range[1]) : range?.[2] ? Math.max(0, bytes.length - Number(range[2])) : NaN;
            const end = range?.[1] && range?.[2] ? Math.min(bytes.length - 1, Number(range[2])) : bytes.length - 1;
            if (!Number.isSafeInteger(start) || start < 0 || start > end || start >= bytes.length) { response.writeHead(416, { 'content-range': `bytes */${bytes.length}` }).end(); return; }
            response.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${bytes.length}`, 'content-length': end - start + 1 }); response.end(request.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1));
          } else { response.writeHead(200, { ...headers, 'content-length': bytes.length }); response.end(request.method === 'HEAD' ? undefined : bytes); }
        } catch (error) { response.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ code: error.code ?? 'MEDIA_READ', message: error.message })); } })(); return;
      }
      if (pathname !== '/mcp') { response.writeHead(404).end(); return; }
      let payload='',toolCall=false,reply='';request.on('data',chunk=>{payload+=chunk;});request.on('end',()=>{try{const message=JSON.parse(payload);if(message.method==='tools/call'){toolCall=true;this.metrics.requests++;const name=message.params?.name;if(name==='galcraft_call'||name==='galcraft_control_call')this.metrics.originalQueries++;if(name==='galcraft_projects'||name==='galcraft_collaboration')this.metrics.controlCalls++;}}catch{}});
      const observe=chunk=>{if(chunk&&reply.length<65536)reply+=ArrayBuffer.isView(chunk)?Buffer.from(chunk.buffer,chunk.byteOffset,chunk.byteLength).toString('utf8'):String(chunk);};
      const write=response.write.bind(response),end=response.end.bind(response);
      response.write=(chunk,...args)=>{observe(chunk);return write(chunk,...args);};response.end=(chunk,...args)=>{observe(chunk);return end(chunk,...args);};
      response.once('finish',()=>{if(toolCall&&(/"isError"\s*:\s*true/.test(reply)||/"error"\s*:\s*\{\s*"code"\s*:\s*-32\d+/.test(reply))){this.metrics.rejectedRequests++;if(/TOOL_INPUT|ZodError|Invalid (?:arguments|params)|-32602/.test(reply))this.metrics.parameterRejections++;}});
      void handle(request, response);
    });
    // The harness may compile the discovered schemas locally before its next request.
    server.keepAliveTimeout=60000;
    try { await listenLocalService(server, { port, previousPort, defaultPort: STUDIO_MCP_PORT }); }
    catch (error) { server.close(); throw error; }
    this.server = server; this.endpoint = `http://127.0.0.1:${server.address().port}/mcp`; return { endpoint: this.endpoint };
  }
  async stop() { if (this.starting) await this.starting.catch(() => {}); const server = this.server; this.server = null; this.endpoint = null; if (server) { server.closeIdleConnections(); await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } await this.media?.close(); }
}
