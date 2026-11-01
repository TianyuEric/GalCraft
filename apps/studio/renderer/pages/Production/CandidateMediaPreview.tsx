import { useEffect, useRef, useState } from 'react';
import type { Artifact, AssetKind, AssetVariant } from '@galcraft/contracts';
import type { Candidate } from '@galcraft/authoring/production';
import type { AuthoringServices } from '../../authoring/controller.js';
import { mountAssetTypePreview } from '../../authoring/asset-type-preview.js';
import { AnimationCandidatePreview } from './AnimationCandidatePreview.js';

/** Candidates use the same exact-type preview selection and release as indexed assets. */
export function CandidateMediaPreview({ candidate, index, media, services, label, locale = 'zh-CN', editAnimation }: { candidate: Candidate; index: number; media: { uri: string; mime: string }[]; services: AuthoringServices; label: string; locale?: string; editAnimation?(value: import('@galcraft/contracts').NativeAnimation): Promise<void> }) {
  const root = useRef<HTMLDivElement>(null), element = useRef<HTMLMediaElement | null>(null), [mounted, setMounted] = useState(false), [error, setError] = useState('');
  const artifacts = candidate.artifacts.filter(artifact => artifact.kind !== 'text'), artifact = artifacts[index]!, current = media[index]!;
  const host = services.assetUi, hasPreview = host?.has(artifact.kind as AssetKind, artifact.typeData, 'preview');
  useEffect(() => {
    setMounted(false); setError('');
    if (!hasPreview || !root.current) return;
    const abort = new AbortController(); let release: (() => void) | null = null;
    const name = (artifact: Artifact) => artifact.localPath.split(/[\\/]/).at(-1)!;
    const metadata = artifact.metadata && typeof artifact.metadata === 'object' && !Array.isArray(artifact.metadata) ? artifact.metadata : {};
    const variant: AssetVariant = { id: candidate.id, parentId: null, role: 'original', entry: name(artifact), files: artifacts.map(value => ({ path: name(value), bytes: value.bytes, mime: value.mime, role: value.role === 'primary' ? 'entry' : 'dependency' })), metadata: { ...(typeof metadata.width === 'number' ? { width: metadata.width } : {}), ...(typeof metadata.height === 'number' ? { height: metadata.height } : {}) }, canvas: null, processing: null, targets: { web: 'unverified', windows: 'unverified' }, groupCapabilities: null, ...(artifact.typeData ? { typeData: artifact.typeData } : {}) };
    void mountAssetTypePreview(root.current, host, { source: { kind: 'candidate', candidateId: candidate.id }, kind: artifact.kind as AssetKind, name: label, variant,
      resource: { root: `candidate:${candidate.id}`, entry: variant.entry, files: variant.files, read: async path => { const at = artifacts.findIndex(value => name(value) === path); if (at < 0) throw new Error(`Undeclared candidate file: ${path}`); const response = await fetch(media[at]!.uri, { signal: abort.signal }); if (!response.ok) throw new Error(`Candidate file unavailable: ${path}`); return new Uint8Array(await response.arrayBuffer()); } } }, abort.signal)
      .then(value => { if (abort.signal.aborted) value?.(); else { release = value; setMounted(!!value); } }).catch(reason => { if (!abort.signal.aborted) setError(String(reason)); });
    return () => { abort.abort(); release?.(); };
  }, [candidate.id, artifact.localPath, host, hasPreview]);
  useEffect(() => { const value = element.current; return () => { if (value) { value.pause(); value.removeAttribute('src'); value.load(); } }; }, []);
  if (artifact.kind === 'animation') return <AnimationCandidatePreview candidate={candidate} uri={current.uri} services={services} locale={locale} edit={editAnimation}/>;
  return <><div ref={root}/>{error && <p role="alert" className="workbench-error">{error}</p>}{!mounted && (current.mime.startsWith('image/') ? <img src={current.uri} alt={label} loading="lazy" decoding="async"/> : current.mime.startsWith('video/') ? <video ref={value => { element.current = value; }} controls preload="metadata" src={current.uri}/> : current.mime.startsWith('audio/') ? <audio ref={value => { element.current = value; }} controls preload="none" src={current.uri}/> : <p role="alert">{artifact.kind} · {label}</p>)}</>;
}
