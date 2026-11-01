import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { fail, ok } from './result.mjs';

const run = promisify(execFile);
const museScoreCommit = '37128c5ac8f9af804b63650610952414421828b8';
const basicSource = `https://raw.githubusercontent.com/musescore/MuseScore/${museScoreCommit}/share/sound/`;
export const soundBankCatalog = [
  { schemaVersion: 1, id: 'musescore-general-hq', version: '0.1.0', name: 'MuseScore General HQ 0.2.1',
    upstreamVersion: '0.2.1', format: 'sf2', bytes: 489519900, license: 'MIT',
    sourceUrl: 'https://deb.debian.org/debian/pool/main/m/musescore-general-soundfont/musescore-general-soundfont-lossless_0.2.1-1_all.deb',
    downloadBytes: 329861822, file: 'MuseScore_General_Full.sf2', notices: [] },
  { schemaVersion: 1, id: 'ms-basic', version: '0.1.0', name: 'MS Basic · MuseScore 官方 SF3',
    upstreamVersion: museScoreCommit, format: 'sf3', bytes: 51278610, license: 'MIT',
    sourceUrl: `${basicSource}MS%20Basic.sf3`, downloadBytes: 51278610, file: 'MS Basic.sf3', notices: [] },
];
const publicDescriptor = ({ file, downloadBytes, ...descriptor }) => descriptor;

/** Personal installation files belong to the desktop host and never enter a Player release. */
export class SoundBanks {
  constructor(directory, options = {}) { this.directory = resolve(directory); this.fetch = options.fetch ?? globalThis.fetch; this.installing = new Map(); }
  entry(input) {
    const entry = soundBankCatalog.find(item => item.id === input?.id && item.version === input?.version);
    if (!entry) throw new Error('Choose a supported soundbank and exact version.');
    return entry;
  }
  target(entry) { return join(this.directory, entry.id, entry.version); }
  async lookup(input) {
    const fixed = soundBankCatalog.find(item => item.id === input?.id && item.version === input?.version); if (fixed) return fixed;
    if (input?.version !== '0.1.0' || !/^user-[0-9a-f-]+$/.test(input?.id ?? '')) throw new Error('The soundbank identity or version is unavailable.');
    const descriptor = JSON.parse(await readFile(join(this.directory, input.id, input.version, 'soundbank.json'), 'utf8'));
    if (descriptor.id !== input.id || descriptor.version !== input.version || !['sf2', 'sf3'].includes(descriptor.format)) throw new Error('The imported soundbank installation record is invalid.');
    return { ...descriptor, file: `soundbank.${descriptor.format}` };
  }
  async installed(entry) {
    const directory = this.target(entry);
    const descriptor = JSON.parse(await readFile(join(directory, 'soundbank.json'), 'utf8'));
    if (descriptor.id !== entry.id || descriptor.version !== entry.version || descriptor.upstreamVersion !== entry.upstreamVersion
      || descriptor.bytes !== entry.bytes || descriptor.sourceUrl !== entry.sourceUrl || descriptor.format !== entry.format) throw new Error('The installation record does not match the soundbank version.');
    await this.checkFile(join(directory, entry.file), entry.bytes);
    if (!Array.isArray(descriptor.notices) || !descriptor.notices.length || descriptor.notices.some(item => !item.name || !item.text)) throw new Error('The soundbank license notices are missing.');
    return { descriptor, installed: true, directory,availability:'ready',issues:[] };
  }
  async checkFile(path, bytes) {
    if ((await stat(path)).size !== bytes) throw new Error('The soundbank file size differs from the exact version. Reinstall it.');
    const handle = await open(path, 'r');
    try { const header = Buffer.alloc(12); await handle.read(header, 0, 12, 0);
      if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'sfbk') throw new Error('The file is not a readable SoundFont.');
    } finally { await handle.close(); }
  }
  async list() {
    const statuses = [];
    const unavailable=async(entry,error)=>{
      const exists=await stat(this.target(entry)).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
      const availability=exists?'unreadable':'notInstalled',issue={code:exists?'SOUNDBANK_UNREADABLE':'SOUNDBANK_NOT_INSTALLED',severity:'warning',owner:'M09',message:exists?`The installed soundbank cannot be read: ${error.message}`:'This exact soundbank is not installed.',related:[],actions:['supplyDependency']};
      return {descriptor:publicDescriptor(entry),installed:false,directory:exists?this.target(entry):null,availability,issues:[issue]};
    };
    for (const entry of soundBankCatalog) {
      try { statuses.push(await this.installed(entry)); }
      catch(error) { statuses.push(await unavailable(entry,error)); }
    }
    for (const name of await readdir(this.directory).catch(() => [])) if (/^user-[0-9a-f-]+$/.test(name)) {
      let entry;try{entry=await this.lookup({id:name,version:'0.1.0'});}catch{continue;}
      try { statuses.push(await this.installed(entry)); } catch(error) { statuses.push(await unavailable(entry,error)); }
    }
    return ok(statuses);
  }
  async import(input) {
    let staging;
    try {
      if (!input?.name?.trim() || !input?.license?.trim() || !input?.sourceUrl?.trim()) throw new Error('请填写音色名称、来源和许可资料');
      const format = extname(input.path).slice(1).toLowerCase(); if (!['sf2', 'sf3'].includes(format)) throw new Error('请选择 SF2 或 SF3 音色文件');
      const bytes = (await stat(input.path)).size; await this.checkFile(input.path, bytes);
      const id = `user-${randomUUID()}`;
      const descriptor = { schemaVersion: 1, id, version: '0.1.0', name: input.name.trim(), upstreamVersion: 'user-import', format, bytes,
        sourceUrl: input.sourceUrl.trim(), license: input.license.trim(), notices: [{ name: '作者提供的音色来源与许可', text: `${input.name.trim()}\n来源：${input.sourceUrl.trim()}\n\n${input.license.trim()}` }] };
      await mkdir(this.directory, { recursive: true }); staging = await mkdtemp(join(this.directory, '.install-'));
      await copyFile(input.path, join(staging, `soundbank.${format}`)); await this.checkFile(join(staging, `soundbank.${format}`), bytes);
      await writeFile(join(staging, 'soundbank.json'), JSON.stringify(descriptor, null, 2));
      await mkdir(join(this.directory, id), { recursive: true }); await rename(staging, join(this.directory, id, '0.1.0')); staging = null;
      return ok(await this.installed(await this.lookup({ id, version: '0.1.0' })));
    } catch (error) { return fail('SOUNDBANK_IMPORT', String(error), 'M09', ['edit']); }
    finally { if (staging && resolve(staging).startsWith(`${this.directory}${sep}.install-`)) await rm(staging, { recursive: true, force: true }); }
  }
  async download(url, path, expectedBytes) {
    const response = await this.fetch(url);
    if (!response.ok || !response.body) throw new Error(`音色下载失败（HTTP ${response.status}）`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(path));
    if (expectedBytes && (await stat(path)).size !== expectedBytes) throw new Error('下载未完成，请重新安装音色包');
  }
  async install(input) {
    let entry;
    try { entry = this.entry(input); } catch (error) { return fail('SOUNDBANK_SELECTION', String(error), 'M09', ['edit']); }
    if (this.installing.has(entry.id)) return this.installing.get(entry.id);
    const pending = this.performInstall(entry).finally(() => this.installing.delete(entry.id));
    this.installing.set(entry.id, pending); return pending;
  }
  async performInstall(entry) {
    let staging;
    try {
      try { return ok(await this.installed(entry)); } catch { /* A missing or incomplete installation can be repaired explicitly. */ }
      await mkdir(this.directory, { recursive: true });
      staging = await mkdtemp(join(this.directory, '.install-'));
      const output = join(staging, 'package'); await mkdir(output);
      const notices = [];
      if (entry.id === 'ms-basic') {
        await this.download(entry.sourceUrl, join(output, entry.file), entry.downloadBytes);
        for (const name of ['MS Basic_License.md', 'MS Basic_Readme.md', 'MS_Basic_Changelog.md']) {
          const path = join(output, name); await this.download(`${basicSource}${encodeURIComponent(name)}`, path);
          notices.push({ name, text: await readFile(path, 'utf8') });
        }
      } else {
        const archive = join(staging, 'soundbank.deb');
        await this.download(entry.sourceUrl, archive, entry.downloadBytes);
        await run('tar', ['-xf', archive, '-C', staging, 'data.tar.xz'], { windowsHide: true });
        const docs = './usr/share/doc/musescore-general-soundfont-lossless/';
        const sample = './usr/share/sounds/sf2/MuseScore_General_Full.sf2';
        await run('tar', ['-xf', join(staging, 'data.tar.xz'), '-C', output, sample,
          `${docs}copyright`, `${docs}MuseScore_General_HQ_Readme.md.gz`, `${docs}MuseScore_General_HQ_Sample_Sources.csv.gz`], { windowsHide: true });
        await rename(join(output, sample), join(output, entry.file));
        for (const name of ['copyright', 'MuseScore_General_HQ_Readme.md.gz', 'MuseScore_General_HQ_Sample_Sources.csv.gz']) {
          const bytes = await readFile(join(output, docs, name));
          notices.push({ name: name.replace(/\.gz$/, ''), text: (name.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8') });
        }
      }
      await this.checkFile(join(output, entry.file), entry.bytes);
      const descriptor = { ...publicDescriptor(entry), notices };
      await writeFile(join(output, 'soundbank.json'), JSON.stringify(descriptor, null, 2));
      const target = this.target(entry); await mkdir(join(this.directory, entry.id), { recursive: true });
      // Remove only this host-owned exact installation directory after a complete replacement exists.
      if (!resolve(target).startsWith(`${this.directory}${sep}`)) throw new Error('音色安装目录不在本机媒体目录内');
      await rm(target, { recursive: true, force: true }); await rename(output, target);
      return ok(await this.installed(entry));
    } catch (error) { return fail('SOUNDBANK_INSTALL', String(error), 'M09', ['retry']); }
    finally { if (staging && resolve(staging).startsWith(`${this.directory}${sep}.install-`)) await rm(staging, { recursive: true, force: true }); }
  }
  async resolve(input) {
    try { const entry = await this.lookup(input), installed = await this.installed(entry);
      return ok({ url: pathToFileURL(join(installed.directory, entry.file)).href, expected: installed.descriptor });
    } catch (error) { return fail('SOUNDBANK_MISSING', `The soundbank is unavailable: ${String(error)}. Install the exact library in the composition workstation.`, 'M09', ['supplyDependency']); }
  }
}
