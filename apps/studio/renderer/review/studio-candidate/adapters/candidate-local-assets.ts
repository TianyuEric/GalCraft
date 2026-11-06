import { AssetSchema, type Asset, type AssetImportReceipt, type Issue } from '@galcraft/contracts';
import { prepareCandidateAsset } from '../application/services.js';
import type { CandidateSession } from '../application/session.js';

export type CandidateLocalAsset = { key: string; file: File };
const allowed: Record<string, Asset['kind']> = { image: 'image', audio: 'audio', video: 'video', font: 'font' };

function readFile(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cancel = () => reader.abort();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(signal.reason);
    reader.onloadend = () => signal.removeEventListener('abort', cancel);
    signal.addEventListener('abort', cancel, { once: true });
    reader.readAsDataURL(file);
  });
}

/** Browser-file adapter for candidate M04. The exact bytes and catalog identity share a transaction. */
export async function importCandidateFiles(session: CandidateSession, entries: CandidateLocalAsset[], signal: AbortSignal): Promise<AssetImportReceipt> {
  const succeeded: Asset[] = [], failed: { path: string; issue: Issue }[] = [];
  for (const { key, file } of entries) {
    if (signal.aborted) break;
    try {
      const kind = allowed[file.type.split('/')[0] ?? ''];
      if (!kind || !file.size) throw new Error('请选择非空的图像、音频、视频或字体文件。');
      const uri = await readFile(file, signal);
      if (signal.aborted) break;
      const prepared = prepareCandidateAsset(session.host.list(), { name: file.name, mime: file.type, uri });
      if (!prepared.ok) throw new Error(prepared.error.message);
      const { asset, input } = prepared.value;
      asset.kind = kind;
      asset.sourceName = file.name;
      asset.variants[0]!.metadata = {};
      asset.variants[0]!.files[0]!.bytes = file.size;
      AssetSchema.parse(asset);
      const committed = session.host.commit(input);
      if (!committed.ok) throw new Error(committed.error.message);
      succeeded.push(asset);
    } catch (reason) {
      if (signal.aborted) break;
      failed.push({ path: key, issue: { code: 'CANDIDATE_ASSET_FILE', message: reason instanceof Error ? reason.message : String(reason), severity: 'error', owner: 'M04', related: [], actions: ['retry'] } });
    }
  }
  return { succeeded, failed };
}
