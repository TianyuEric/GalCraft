import { mkdir, readFile, readdir, unlink, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createId } from '@galcraft/contracts';
import type { Dependency } from '@galcraft/contracts';
import { strToU8, zipSync } from 'fflate';
import { createOfficialTemplate } from './templates.js';
import { inspectTemplate, packTemplate } from './package.js';

export type TemplateLibraryIdentity = { id: string; version: string };
export type TemplateLibraryEntry = TemplateLibraryIdentity & { name: string; description: string; official: boolean; features: string[]; targets: string[]; dependencies: Dependency[] };
export type TemplateImportChoice = 'cancel' | 'copy' | 'update';
const officialKinds = ['light', 'standard', 'rich'] as const;
const summary = (value: ReturnType<typeof inspectTemplate>, official = false): TemplateLibraryEntry => ({ id: value.template.id, version: value.template.version,
  name: value.manifest.name, description: value.manifest.description, official, features: value.template.features, targets: value.manifest.targets, dependencies: value.template.dependencies });

/** A local package library owns only package bytes. Adopted works own separate content and assets. */
export class TemplateLibrary {
  constructor(readonly directory: string) {}
  private path(identity: TemplateLibraryIdentity) { return join(this.directory, `${encodeURIComponent(identity.id)}@${encodeURIComponent(identity.version)}.galtemplate`); }
  private official(identity: TemplateLibraryIdentity) {
    const template = officialKinds.map(kind => createOfficialTemplate({ kind })).find(template => template.id === identity.id && template.version === identity.version);
    return template ? inspectTemplate(packTemplate({ template, name: template.id, description: '', files: {}, assetFiles: {} })) : null;
  }
  async read(identity: TemplateLibraryIdentity) { return this.official(identity) ?? inspectTemplate(new Uint8Array(await readFile(this.path(identity)))); }
  async list(input: { offset?: number; limit?: number; search?: string } = {}) {
    await mkdir(this.directory, { recursive: true });
    const entries = officialKinds.map(kind => { const template = createOfficialTemplate({ kind }); return summary(this.official(template)!, true); });
    for (const path of await readdir(this.directory)) if (path.endsWith('.galtemplate')) entries.push(summary(inspectTemplate(new Uint8Array(await readFile(join(this.directory, path))))));
    const selected = entries.filter(entry => !input.search || `${entry.name} ${entry.id}`.toLocaleLowerCase().includes(input.search.toLocaleLowerCase()));
    const offset = input.offset ?? 0, limit = Math.min(100, input.limit ?? 30);
    return { items: selected.slice(offset, offset + limit), total: selected.length, offset, limit, nextOffset: offset + limit < selected.length ? offset + limit : null };
  }
  private async store(bytes: Uint8Array) {
    const value = inspectTemplate(bytes); await mkdir(this.directory, { recursive: true });
    const path = this.path(value.template), temporary = `${path}.tmp`;
    await writeFile(temporary, bytes); await rename(temporary, path); return summary(value);
  }
  private repack(value: ReturnType<typeof inspectTemplate>, patch: { id?: string; name?: string }) {
    const template = structuredClone(value.template);
    if (patch.id) { const old = template.id; template.id = patch.id; template.dependencies = template.dependencies.map(item => item.kind === 'template' && item.id === old ? { ...item, id: patch.id! } : item); }
    const files:Record<string,Uint8Array> = { ...value.files, 'config/template.json': strToU8(JSON.stringify(template)) };
    const manifest = { ...value.manifest, id: template.id, name: patch.name ?? value.manifest.name, template, dependencies: template.dependencies,
      files: value.manifest.files.map((entry: any) => entry.path === 'config/template.json' ? { ...entry, bytes: files['config/template.json']!.length } : entry) };
    files['manifest.json'] = strToU8(JSON.stringify(manifest)); return zipSync(files);
  }
  async import(bytes: Uint8Array, choice?: TemplateImportChoice) {
    const incoming = inspectTemplate(bytes), official = this.official(incoming.template);
    let existing: TemplateLibraryEntry | null = official ? summary(official, true) : null;
    if (!existing) try { existing = summary(await this.read(incoming.template)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (choice === 'cancel') return { status: 'cancelled' as const, entry: existing };
    if (existing && !choice) return { status: 'conflict' as const, entry: existing, choices: existing.official ? ['cancel', 'copy'] : ['cancel', 'copy', 'update'] };
    if (choice === 'update' && official) throw new Error('TEMPLATE_OFFICIAL_READ_ONLY');
    const stored = choice === 'copy' ? this.repack(incoming, { id: `user.${createId()}`, name: `${incoming.manifest.name} copy` }) : bytes;
    return { status: 'imported' as const, entry: await this.store(stored) };
  }
  async copy(identity: TemplateLibraryIdentity, name?: string) { return this.store(this.repack(await this.read(identity), { id: `user.${createId()}`, name: name ?? `${(await this.read(identity)).manifest.name} copy` })); }
  async rename(identity: TemplateLibraryIdentity, name: string) { if (this.official(identity)) throw new Error('TEMPLATE_OFFICIAL_READ_ONLY'); if (!name.trim()) throw new Error('TEMPLATE_NAME_REQUIRED'); return this.store(this.repack(await this.read(identity), { name: name.trim() })); }
  async remove(identity: TemplateLibraryIdentity) { if (this.official(identity)) throw new Error('TEMPLATE_OFFICIAL_READ_ONLY'); await unlink(this.path(identity)); return identity; }
  async export(identity: TemplateLibraryIdentity) { const official = this.official(identity); return official ? zipSync(official.files) : new Uint8Array(await readFile(this.path(identity))); }
}
