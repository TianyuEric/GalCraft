import { readFile, writeFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createId } from '@galcraft/contracts';
import { assetFilePath, rasterizeSVG, inspectSVG } from '@galcraft/assets';
import { CollaborationError } from '@galcraft/collaboration';
import { mediaExecutables, probeMedia, runProcess } from '@galcraft/media-tools/process';

const problem = (code, message) => { throw new CollaborationError(code, message); };
const value = result => { if (!result.ok) problem(result.error.code, result.error.message); return result.value; };

/** Owns external-readable resources, including the M04 lease, until explicit release or service stop. */
export class CollaborationMedia {
  constructor({ assets, production, authorize, taskInScope, endpoint, cacheRoot }) {
    Object.assign(this, { assets, production, authorize, taskInScope, endpoint }); this.resources = new Map();
    this.cacheRoot = resolve(cacheRoot);
    this.ready = rm(this.cacheRoot, { recursive: true, force: true }).then(() => mkdir(this.cacheRoot, { recursive: true }));
  }
  async directory(context) { await this.ready; const parent=join(this.cacheRoot,context.sessionId);await mkdir(parent,{recursive:true});return mkdtemp(join(parent,'review-')); }
  async source(input, context) {
    if (input.kind === 'asset') {
      const current = this.assets.current(), asset = current?.index.data.assets.find(asset => asset.id === input.assetId);
      const variant = asset?.variants.find(variant => variant.id === (input.variantId ?? asset.activeVariantId));
      if (!variant) problem('MEDIA_SOURCE_MISSING', 'The asset or exact version is missing. Read galcraft_assets again.');
      const entry = variant.files.find(file => file.path === variant.entry);
      if (!entry) problem('MEDIA_SOURCE_MISSING', 'The asset version has no entry file.');
      const lease = value(this.assets.resolveRuntime(asset.id, variant.id));
      return { path: join(this.assets.projectDocuments.currentRoot, assetFilePath(asset.id, variant.id, variant.entry)), mime: entry.mime,
        source: { kind: 'asset', projectId: context.projectId, assetId: asset.id, variantId: variant.id, name: asset.name },
        release: () => this.assets.releaseRuntime(lease.leaseId) };
    }
    const { service } = await this.production.current(), candidate = service.getCandidate(input.candidateId);
    const task = service.listTasks().find(task => task.id === candidate?.taskId);
    if (!candidate || !this.taskInScope(task, context)) problem('MEDIA_CANDIDATE_SCOPE', 'The candidate is outside the current project authorization. Read scoped tasks and candidates first.');
    const artifactIndex = input.artifactIndex ?? candidate.artifacts.findIndex(artifact => artifact.kind !== 'text');
    const artifact = candidate.artifacts[artifactIndex];
    if (!artifact?.localPath || artifact.kind === 'text') problem('MEDIA_SOURCE_MISSING', 'The selected candidate artifact is not readable media. Use an artifact index from candidate.');
    return { path: artifact.localPath, mime: artifact.mime, source: { kind: 'candidate', projectId: context.projectId, taskId: candidate.taskId,
      candidateId: candidate.id, itemId: candidate.itemId, artifactIndex, provider: (()=>{const p=task.items.find(item=>item.id===candidate.itemId)?.providerSnapshot;return p?{providerKey:p.providerKey,packageVersion:p.packageVersion}:null;})() }, release() {} };
  }
  async add({ path, bytes, mime, source, release = () => {}, ...metadata }, context) {
    await this.ready;
    const id = createId();let directory;
    if(bytes){directory=await this.directory(context);path=join(directory,mime==='image/png'?'image.png':mime==='audio/wav'?'audio.wav':'media.bin');await writeFile(path,bytes);}
    path=resolve(path);
    const size = (await stat(path)).size;
    const entry = { id, path, mime, source, release, metadata, context, size, directory };
    this.resources.set(id, entry);
    return this.description(entry);
  }
  description(entry) { return { resourceId: entry.id, localPath:entry.path,availability:'ready',uri: `galcraft-media://${entry.id}`, httpUrl:this.endpoint?.() ? this.endpoint().replace(/\/mcp$/, `/media/${entry.id}`) : null, mime: entry.mime, bytes: entry.size, source: entry.source, metadata:entry.metadata }; }
  get(id) { const entry = this.resources.get(id); if (!entry) problem('MEDIA_RESOURCE_RELEASED', 'The media resource has expired. Read the original asset or candidate with a new call.'); this.authorize(entry.context); return entry; }
  list() { return [...this.resources.values()].flatMap(entry => { try { this.authorize(entry.context); return [{ uri: `galcraft-media://${entry.id}`, name: entry.source.name ?? entry.id, mimeType: entry.mime, size: entry.size }]; } catch { return []; } }); }
  async bytes(id) { const entry = this.get(id); return { entry, bytes: await readFile(entry.path) }; }
  async release(id) { const entry = this.resources.get(id); if (entry) { this.resources.delete(id);try{await entry.release();}finally{if(entry.directory)await rm(entry.directory,{recursive:true,force:true});} } }
  async end(sessionId){await Promise.all([...this.resources.values()].filter(entry=>entry.context.sessionId===sessionId).map(entry=>this.release(entry.id)));}
  async close() { await this.ready; await Promise.all([...this.resources.keys()].map(id => this.release(id)));await rm(this.cacheRoot,{recursive:true,force:true}); }
  async refresh(result){
    if(!result||typeof result!=='object')return result;
    if(result.resourceId&&'availability' in result){const entry=this.resources.get(result.resourceId);const availability=!entry?'expired':await stat(entry.path).then(()=> 'ready',error=>{if(error.code==='ENOENT')return 'missing';throw error;});return {...result,availability,localPath:availability==='ready'?entry.path:null,uri:availability==='ready'?result.uri:null,httpUrl:availability==='ready'?result.httpUrl:null};}
    if(Array.isArray(result))return Promise.all(result.map(value=>this.refresh(value)));
    return Object.fromEntries(await Promise.all(Object.entries(result).map(async([key,value])=>[key,await this.refresh(value)])));
  }
  async read(input, context) {
    if (input.mode === 'release') { const entry = this.get(input.resourceId); if (entry.context.sessionId !== context.sessionId) problem('MEDIA_RESOURCE_SCOPE', 'The resource belongs to another collaboration.'); await this.release(input.resourceId); return { mode:'release',released: true, resourceId: input.resourceId }; }
    const source = await this.source(input.source, context);
    let transferred = false;
    try {
      if(input.mode==='resource'&&!/^(image|audio|video)\//.test(source.mime)){const file=await this.add(source,context);transferred=true;return {mode:'resource',file};}
      const svg = source.mime === 'image/svg+xml' ? value(inspectSVG({ source: await readFile(source.path, 'utf8') })) : null;
      const raw = svg ? { streams: [{ codec_type: 'video', codec_name: 'svg', width: svg.intrinsic.width, height: svg.intrinsic.height }], format: {} }
        : await probeMedia(this.assets.toolDirectory, source.path).catch(error => problem('MEDIA_DECODE', `Cannot decode media metadata: ${error.message}`));
      const video = raw.streams?.find(stream => stream.codec_type === 'video'), audio = raw.streams?.find(stream => stream.codec_type === 'audio');
      const rate = video?.avg_frame_rate?.split('/').map(Number), fps = rate?.[1] ? rate[0] / rate[1] : null;
      const durationSec = Number(raw.format?.duration ?? video?.duration ?? audio?.duration) || null;
      const metadata = { width: video?.width ?? null, height: video?.height ?? null, durationSec, fps, hasAudio: !!audio,sampleRate:audio?.sample_rate?Number(audio.sample_rate):null,channels:audio?.channels??null,
        codecs: { video: video?.codec_name ?? null, audio: audio?.codec_name ?? null } };
      if (input.mode === 'metadata') return { mode:'metadata',source: source.source, mime: source.mime, metadata };
      if (input.mode === 'frame') {
        if (!source.mime.startsWith('video/')) problem('MEDIA_KIND', 'Frame mode requires a video asset or candidate.');
        const { ffprobe, ffmpeg } = mediaExecutables(this.assets.toolDirectory);
        const frames = JSON.parse((await runProcess(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', source.path])).stdout).frames ?? [];
        if (!frames.length) problem('MEDIA_DECODE', 'The video has no decodable frames.');
        if (input.timeSec !== undefined && (input.timeSec < 0 || durationSec === null || input.timeSec >= durationSec)) problem('MEDIA_TIME_RANGE', `timeSec must be in [0, ${durationSec})`);
        const frame = input.frame ?? frames.reduce((nearest, item, index) => Math.abs(Number(item.best_effort_timestamp_time) - input.timeSec) < Math.abs(Number(frames[nearest].best_effort_timestamp_time) - input.timeSec) ? index : nearest, 0);
        if (!Number.isInteger(frame) || frame < 0 || frame >= frames.length) problem('MEDIA_FRAME_RANGE', `frame must be in [0, ${frames.length - 1}]`);
        const directory = await this.directory(context);
        try {
          const path = join(directory, 'frame.png');
          await runProcess(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', source.path, '-vf', `select=eq(n\\,${frame})`, '-frames:v', '1', path]);
          const resource = await this.add({ bytes: await readFile(path), mime: 'image/png', source: source.source, width: video.width, height: video.height,
            sample: { requested: input.frame !== undefined ? { frame: input.frame } : { timeSec: input.timeSec }, frame, timeSec: Number(frames[frame].best_effort_timestamp_time), totalFrames: frames.length } }, context);
          const sample=resource.metadata.sample;delete resource.metadata.sample;
          return {mode:'frame',...(await this.rendition(resource,input.preview,context)),original:{mime:source.mime,bytes:(await stat(source.path)).size,metadata},sample,issues:[]};
        } finally { await rm(directory, { recursive: true, force: true }); }
      }
      if (input.mode === 'audio') {
        if (!audio) problem('MEDIA_AUDIO_MISSING', 'This media has no audio track.');
        const start = input.startSec ?? 0, end = input.endSec ?? durationSec;
        if (start < 0 || end === null || end <= start || durationSec === null || end > durationSec) problem('MEDIA_TIME_RANGE', 'Choose startSec/endSec within the media duration.');
        const directory = await this.directory(context);
        try {
          const path = join(directory, 'audio.wav');
          await runProcess(mediaExecutables(this.assets.toolDirectory).ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', source.path, '-ss', String(start), '-t', String(end - start), '-vn', '-c:a', 'pcm_s16le', path]);
          const resource = await this.add({ bytes: await readFile(path), mime: 'audio/wav', source: source.source, durationSec: end - start,sampleRate:metadata.sampleRate,channels:metadata.channels,codecs:{video:null,audio:'pcm_s16le'}, sample: { startSec: start, endSec: end } }, context);
          const sample=resource.metadata.sample;delete resource.metadata.sample;return {mode:'audio',file:resource,sample,issues:[]};
        } finally { await rm(directory, { recursive: true, force: true }); }
      }
      if (input.mode === 'image' && !source.mime.startsWith('image/')) problem('MEDIA_KIND', 'Image mode requires an image asset or candidate.');
      if (input.mode === 'image' && source.mime === 'image/svg+xml') {
        const bytes = Buffer.from(value(await rasterizeSVG(await readFile(source.path, 'utf8'))));
        const resource=await this.add({ bytes, mime: 'image/png', source: source.source, ...metadata }, context);return {mode:'image',...(await this.rendition(resource,input.preview,context)),original:{mime:source.mime,bytes:(await stat(source.path)).size,metadata},issues:[]};
      }
      const resource = await this.add({ ...source, ...metadata }, context); transferred = true;
      return input.mode==='image'?{mode:'image',...(await this.rendition(resource,input.preview,context)),original:{mime:source.mime,bytes:resource.bytes,metadata},issues:[]}:{mode:'resource',file:resource};
    } finally { if (!transferred) await source.release(); }
  }
  async rendition(resource,preview,context){
    let file=resource;
    if(preview){const directory=await this.directory(context),format=preview.format??'png',path=join(directory,`preview.${format==='jpeg'?'jpg':format}`);
      try{await runProcess(mediaExecutables(this.assets.toolDirectory).ffmpeg,['-hide_banner','-loglevel','error','-y','-i',resource.localPath,'-vf',`scale=w='min(iw,${preview.maxWidth})':h='min(ih,${preview.maxHeight})':force_original_aspect_ratio=decrease`,'-frames:v','1',path]);
        const size=(await stat(path)).size;if(preview.maxBytes&&size>preview.maxBytes)problem('MEDIA_PREVIEW_BYTES',`The rendition is ${size} bytes, above maxBytes=${preview.maxBytes}. Request smaller dimensions or another format.`);
        const raw=await probeMedia(this.assets.toolDirectory,path),video=raw.streams.find(stream=>stream.codec_type==='video');
        file=await this.add({bytes:await readFile(path),mime:`image/${format}`,source:resource.source,...resource.metadata,width:video.width,height:video.height},context);
      }catch(error){await this.release(resource.resourceId);throw error;}finally{await rm(directory,{recursive:true,force:true});}
      await this.release(resource.resourceId);
    }
    return {file,rendition:{resized:file.metadata.width!==resource.metadata.width||file.metadata.height!==resource.metadata.height,width:file.metadata.width,height:file.metadata.height,mime:file.mime,bytes:file.bytes}};
  }
  async contents() { return []; }
}
