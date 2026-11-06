import type { DocumentView, EditInput } from '@galcraft/contracts';
import { parse } from '@galcraft/dsl';

type Baseline = { text: string; revision: number; statementIds: string[]; sidecar: DocumentView | null };
export type CandidateSourceRecovery = { version: 1; scenes: { documentId: string; sceneId: string; path: string; raw: string; revision: number; baseline: Baseline }[] };
const source = (document: DocumentView) => Object.entries(document.files).find(([path]) => /^scenes\/[^/]+\/script\.gal$/.test(path));
const valid = (documentId: string, revision: number, text: string) => !parse({ documentId, revision, text }).issues.some(issue => issue.severity === 'error');
const ids = (documentId: string, revision: number, text: string) => parse({ documentId, revision, text }).cst.flatMap(node => node.id ? [node.id] : []);
const data = (document: DocumentView | null) => document ? JSON.parse(Object.values(document.files)[0]!).data : null;

/** Recovery metadata belongs to this browser host, never to the public work format.
 * Raw source remains authoritative. Graphical readers receive a read-only projection. */
export class CandidateSourceRecoveryStore {
  private latest = new Map<string, Baseline>();
  private invalid = new Map<string, Baseline>();
  private observed = new Map<string, { text: string; revision: number; invalid: boolean }>();
  readonly errors: string[] = [];
  constructor(documents: DocumentView[], recovery?: CandidateSourceRecovery) {
    if (recovery && (!Array.isArray(recovery.scenes)||recovery.version!==1)) this.errors.push('源码恢复信封格式无效，错误原文已保留。');
    if (recovery && Array.isArray(recovery.scenes)) for (const entry of recovery.scenes) {
      try {
      const document = documents.find(item => item.documentId === entry.documentId), current = document && source(document);
      const sidecar = documents.find(item => `candidate/scenes/${entry.sceneId}.json` in item.files) ?? null;
      const baseline = entry.baseline;
      if (recovery.version !== 1 || !document || !current || current[0] !== entry.path || current[1] !== entry.raw || document.revision !== entry.revision ||
        entry.path !== `scenes/${entry.sceneId}/script.gal` || !baseline || typeof baseline.text!=='string' || !Number.isSafeInteger(baseline.revision) || baseline.revision<0 || !Array.isArray(baseline.statementIds) || !valid(entry.documentId, baseline.revision, baseline.text) ||
        JSON.stringify(ids(entry.documentId, baseline.revision, baseline.text)) !== JSON.stringify(baseline.statementIds) ||
        JSON.stringify(data(sidecar)) !== JSON.stringify(data(baseline.sidecar))) {
        this.errors.push(`场景 ${entry.sceneId} 的恢复基线与文档不匹配，图形编辑保持只读。`); continue;
      }
      this.latest.set(entry.documentId, structuredClone(baseline));
      this.invalid.set(entry.documentId, structuredClone(baseline));
      this.observed.set(entry.documentId, {text:entry.raw,revision:entry.revision,invalid:true});
      } catch { this.errors.push('一份源码恢复基线无法读取；错误原文已保留，图形编辑保持只读。'); }
    }
    this.observe(documents);
    for(const document of documents)if(this.isInvalid(document)&&!this.baseline(document))this.errors.push(`场景 ${source(document)![0].split('/')[1]} 缺少可校验的最后有效基线；图形内容不可用。`);
  }
  observe(documents: DocumentView[]) {
    for (const document of documents) {
      const entry = source(document); if (!entry) continue;
      const [path, text] = entry, sceneId = path.split('/')[1]!;
      if (valid(document.documentId, document.revision, text)) {
        this.latest.set(document.documentId, { text, revision: document.revision, statementIds: ids(document.documentId, document.revision, text),
          sidecar: structuredClone(documents.find(item => `candidate/scenes/${sceneId}.json` in item.files) ?? null) });
        this.observed.set(document.documentId, {text,revision:document.revision,invalid:false});
      } else {
        const previous = this.observed.get(document.documentId);
        if (!previous?.invalid && this.latest.has(document.documentId)) this.invalid.set(document.documentId, structuredClone(this.latest.get(document.documentId)!));
        this.observed.set(document.documentId, {text,revision:document.revision,invalid:true});
      }
    }
  }
  baseline(document: DocumentView): Baseline | undefined {
    const entry = source(document); if (!entry) return;
    return valid(document.documentId, document.revision, entry[1]) ? this.latest.get(document.documentId) : this.invalid.get(document.documentId);
  }
  /** Only host history uses this; persisted envelopes are validated by the constructor. */
  restore(documents: DocumentView[], recovery: CandidateSourceRecovery, affected: readonly string[] = []) {
    for(const document of documents){
      const raw=source(document);if(!raw)continue;
      const sceneId=raw[0].split('/')[1],sidecar=documents.find(item=>`candidate/scenes/${sceneId}.json` in item.files);
      if(!affected.includes(document.documentId)&&!(sidecar&&affected.includes(sidecar.documentId)))continue;
      this.latest.delete(document.documentId);this.invalid.delete(document.documentId);
      this.observed.set(document.documentId,{text:raw[1],revision:document.revision,invalid:this.isInvalid(document)});
    }
    for (const entry of recovery.scenes) {
      const document=documents.find(item=>item.documentId===entry.documentId),raw=document&&source(document);
      if(!document||!raw||raw[1]!==entry.raw)continue;
      this.latest.set(entry.documentId,structuredClone(entry.baseline));
      this.invalid.set(entry.documentId,structuredClone(entry.baseline));
      this.observed.set(entry.documentId,{text:entry.raw,revision:document.revision,invalid:this.isInvalid(document)});
    }
  }
  isInvalid(document: DocumentView) { const entry = source(document); return !!entry && !valid(document.documentId, document.revision, entry[1]); }
  capture(documents: DocumentView[]): CandidateSourceRecovery {
    return { version: 1, scenes: documents.flatMap(document => {
      const entry = source(document); if (!entry) return [];
      const baseline = this.isInvalid(document) ? this.baseline(document) : { text: entry[1], revision: document.revision,
        statementIds: ids(document.documentId, document.revision, entry[1]), sidecar: documents.find(item => `candidate/scenes/${entry[0].split('/')[1]}.json` in item.files) ?? null };
      if (!baseline) return [];
      return [{ documentId: document.documentId, sceneId: entry[0].split('/')[1]!, path: entry[0], raw: entry[1], revision: document.revision, baseline: structuredClone(baseline) }];
    }) };
  }
  project(documents: DocumentView[]): DocumentView[] {
    const result = structuredClone(documents);
    for (const document of result) if (this.isInvalid(document)) {
      const entry = source(document)!, baseline = this.baseline(document);
      document.files[entry[0]] = baseline?.text ?? '';
      if (baseline?.sidecar) {
        const index = result.findIndex(item => item.documentId === baseline.sidecar!.documentId);
        if (index >= 0) result[index] = structuredClone(baseline.sidecar);
      }
    }
    return result;
  }
  guard(input: EditInput, documents: DocumentView[]): string | null {
    if (input.origin === 'script') return null;
    const invalidScenes = documents.filter(document => this.isInvalid(document));
    const protectedIds = new Set(invalidScenes.map(document => document.documentId));
    for (const document of invalidScenes) {
      const sceneId = source(document)![0].split('/')[1]!;
      for (const sidecar of documents) if (`candidate/scenes/${sceneId}.json` in sidecar.files) protectedIds.add(sidecar.documentId);
    }
    return input.patches.some(patch => protectedIds.has(patch.documentId)) ? '此场景的源码无效；图形编辑显示最后有效版本。请先在源码模式修复。' : null;
  }
}
