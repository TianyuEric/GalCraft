import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const execute = promisify(execFile);
/** Local protocol simulation. Every accepted input creates a new decodable file. */
export async function startVideoSimulation({ directory, ffmpeg, port = 0, queueMs = 250, runningMs = 350 }) {
  await mkdir(directory, { recursive: true }); const tasks = new Map(), events = [], control = { stalledHistory: new Set() };
  const log = async event => { const record = { at: new Date().toISOString(), ...event }; events.push(record); await appendFile(join(directory, 'requests.ndjson'), JSON.stringify(record) + '\n'); };
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      const body = request.method === 'POST' ? JSON.parse(await new Promise((resolve, reject) => { let value = ''; request.on('data', chunk => value += chunk); request.on('end', () => resolve(value || '{}')); request.on('error', reject); })) : undefined;
      const reply = (data, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); };
      if (request.method === 'POST' && path === '/prompt') {
        const fields = body?.prompt?.['23']?.inputs;
        if (!fields || !['MinimaxHailuo03TextToVideoNode', 'MinimaxHailuo03ReferenceNode'].includes(body.prompt['23'].class_type) || body.prompt['8']?.class_type !== 'SaveVideo') return reply({ error: 'API node mapping required' }, 400);
        const id = randomUUID(), entry = { id, state: 'queued', fields, requestId: body.request_id, path: join(directory, `${id}.mp4`), output: null, cancel: false };
        tasks.set(id, entry); await log({ method: 'POST', path, id, requestId: body.request_id, input: body }); reply({ prompt_id: id });
        void (async () => {
          await new Promise(resolve => setTimeout(resolve, queueMs)); if (entry.cancel) return; entry.state = 'running';
          const height = fields.resolution === '1080P' ? 1080 : 768, ratio = fields.ratio === '9:16' ? 9 / 16 : fields.ratio === '1:1' ? 1 : 16 / 9, width = Math.round(height * ratio / 2) * 2;
          const color = '#' + (Number(fields.seed) % 0xffffff).toString(16).padStart(6, '0');
          await execute(ffmpeg, ['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${width}x${height}:r=12`, '-vf', 'drawbox=x=mod(t*120\\,iw):y=ih/3:w=iw/6:h=ih/3:color=white:t=fill', '-t', String(fields.duration), '-c:v', 'h264_mf', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', entry.path], { windowsHide: true });
          await new Promise(resolve => setTimeout(resolve, runningMs)); if (entry.cancel) return;
          entry.state = 'completed'; entry.output = { filename: `${id}.mp4`, metadata: { width, height, durationMs: fields.duration * 1000, simulation: true, requestId: body.request_id, prompt: fields.prompt, seed: fields.seed, codec: 'h264' } };
          await log({ event: 'file-created', id, path: entry.path, metadata: entry.output.metadata });
        })().catch(async error => { entry.state = 'failed'; await log({ event: 'generation-error', id, error: String(error) }); }); return;
      }
      const id = decodeURIComponent(path.split('/')[2] ?? ''), task = tasks.get(id);
      await log({ method: request.method, path, id, requestId: task?.requestId });
      if (!task) return reply({ error: 'missing task' }, 404);
      if (path.startsWith('/history/')) { if (control.stalledHistory.has(id)) { response.writeHead(200, { 'Content-Type': 'application/json' }); response.flushHeaders(); return; } return reply({ state: task.state, output: task.output, issues: [] }); }
      if (path.startsWith('/cancel/')) { task.cancel = true; task.state = 'cancelled'; return reply({ cancelled: true }); }
      if (path.startsWith('/view/') && task.state === 'completed') { response.writeHead(200, { 'Content-Type': 'video/mp4' }); response.end(await readFile(task.path)); return; }
      reply({ error: 'not ready' }, 409);
    } catch (error) { response.writeHead(500); response.end(String(error)); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, events, tasks, control, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const simulation = await startVideoSimulation({ directory: resolve(process.argv[2] ?? 'test-results/architecture-e4/simulation'), ffmpeg: resolve(process.argv[3] ?? 'tools/media/runtime/bin/ffmpeg.exe'), port: Number(process.argv[4] ?? 8199) });
  console.log(`Local MiniMax H3 API simulation: ${simulation.url}`);
}
