import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createId, type DiscardPlan, type DocumentView, type SaveObject, type SavePlan, type SaveScope, type StudioBridge } from '@galcraft/contracts';
import { FixtureIds, fixtureId } from '@galcraft/contracts/fixtures';
import { SaveReview } from './save-review.js';
import { Button } from './controls.js';
import '../authoring/shell.css';
import '../authoring/workspace.css';
import '../authoring/refinements.css';

function fixture() {
  const sceneId = FixtureIds.streetDocument, indexId = fixtureId(0xe03), firstId = fixtureId(0xc01), secondId = fixtureId(0xc02);
  const json = (id: string, data: unknown) => JSON.stringify({ schemaVersion: 1, documentId: id, revision: 3, data });
  let documents: DocumentView[] = [{ documentId: sceneId, revision: 3, savedRevision: 1, format: 'json', dirty: true,
    files: { [`scenes/${sceneId}/scene.json`]: json(sceneId, { name: '雨夜车站', background: firstId }) },
    savedFiles: { [`scenes/${sceneId}/scene.json`]: json(sceneId, { name: '车站', background: null }) } },
  { documentId: indexId, revision: 3, savedRevision: 1, format: 'json', dirty: true,
    files: { 'assets/index.json': json(indexId, { assets: [{ id: firstId, name: '车站 · 深夜的站台与未寄出的信' }, { id: secondId, name: '雨声循环 · 待调整音量' }] }) },
    savedFiles: { 'assets/index.json': json(indexId, { assets: [{ id: secondId, name: '雨声循环' }] }) } }];
  const objects: SaveObject[] = [{ documentId: sceneId, kind: 'document', objectId: null, key: 'scene', revision: 3, name: '雨夜车站', paths: Object.keys(documents[0]!.files) },
    { documentId: indexId, kind: 'asset', objectId: firstId, key: 'first', revision: 3, name: '车站 · 深夜的站台与未寄出的信', paths: ['assets/index.json'] },
    { documentId: indexId, kind: 'asset', objectId: secondId, key: 'second', revision: 3, name: '雨声循环 · 待调整音量', paths: ['assets/index.json'] }];
  let dirty = new Set(objects.map(object => object.key)), restore: { documents: DocumentView[]; dirty: Set<string> } | null = null, discard: DiscardPlan;
  const ok = <T,>(value: T) => ({ ok: true as const, value, warnings: [] });
  const plan = (scope: SaveScope): SavePlan => {
    const requested = scope.kind === 'objects' ? objects.filter(object => scope.objects.some(ref => ref.documentId === object.documentId && ref.objectId === object.objectId)).map(object => object.key) : [...dirty];
    const selected = new Set(requested); if (selected.has('scene') && dirty.has('first')) selected.add('first');
    const actual = objects.filter(object => selected.has(object.key) && dirty.has(object.key)), members = [...new Set(actual.map(object => object.documentId))];
    return { planId: createId(), members, versions: documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })),
      files: documents.filter(document => members.includes(document.documentId)).flatMap(document => Object.keys(document.files).map(path => ({ documentId: document.documentId, path, oldExists: true, newExists: true }))),
      extraDirtyMembers: [], objects: actual, requestedObjects: requested, reasons: selected.has('scene') && selected.has('first') && !requested.includes('first') ? [{ objectKey: 'first', requiredBy: 'scene', kind: 'reference', ref: { kind: 'asset', id: firstId } }] : [], preview: structuredClone(documents) };
  };
  const receipt = () => ({ groupId: createId(), operationId: createId(), documents: [], dirty: [...new Set(objects.filter(object => dirty.has(object.key)).map(object => object.documentId))], assetIds: [] });
  const bridge = {
    list: async () => ok(structuredClone(documents)), planSave: async (scope: SaveScope) => ok(plan(scope)),
    planDiscard: async (scope: import('@galcraft/contracts').DiscardScope) => {
      const requested=objects.filter(object=>scope.objects?.some(ref=>ref.documentId===object.documentId&&ref.objectId===object.objectId)??(scope.objectId?scope.objectId===object.objectId:scope.documentId===object.documentId));
      const selected=new Set(requested.map(object=>object.key));
      if(selected.has('first')&&dirty.has('scene'))selected.add('scene');
      const actual=objects.filter(object=>selected.has(object.key)),source=documents.filter(document=>actual.some(object=>object.documentId===document.documentId));
      discard={planId:createId(),scope,members:source.map(document=>document.documentId),expected:[],expanded:[],requestedObjects:requested.map(object=>object.key),objects:actual,
        reasons:selected.has('scene')&&!requested.some(object=>object.key==='scene')?[{objectKey:'scene',requiredBy:'first',kind:'reference'}]:[],
        preview:source.map(document=>{const result=structuredClone(document);result.savedFiles=structuredClone(document.files);
          if(document.documentId===sceneId)result.files=structuredClone(document.savedFiles);
          else {const value=JSON.parse(result.files['assets/index.json']!);if(selected.has('first'))value.data.assets=value.data.assets.filter((asset:{id:string})=>asset.id!==firstId);if(selected.has('second'))value.data.assets.find((asset:{id:string})=>asset.id===secondId).name='雨声循环';result.files['assets/index.json']=JSON.stringify(value);}
          return result;})};return ok(discard);
    },
    applyDiscard: async () => {
      restore={documents:structuredClone(documents),dirty:new Set(dirty)};
      for(const object of discard.objects??[])dirty.delete(object.key);
      for(const preview of discard.preview){const target=documents.find(document=>document.documentId===preview.documentId)!;target.files=structuredClone(preview.files);}
      return ok(receipt());
    },
    planUndo: async () => ok({ planId: createId(), requestedOperationId: createId(), reverseOrder: [], members: [], expected: [], label: '丢弃' }),
    undo: async () => { if (restore) { documents = restore.documents; dirty = restore.dirty; } return ok(receipt()); },
  } as unknown as StudioBridge['documents'];
  return { bridge, documents: structuredClone(documents), plan: plan({ kind: 'all' }) };
}

function ObjectReview({ theme = 'light', locale = 'zh-CN', failed = false, workspace = false }: { theme?: 'light' | 'dark'; locale?: string; failed?: boolean; workspace?: boolean }) {
  const model = useMemo(fixture, []), [open, setOpen] = useState(true), [saved, setSaved] = useState('');
  return <div className="authoring-shell" data-theme={theme} style={{ padding: 16, height: '100vh', display: 'flex', flexDirection: 'column' }}><div id="studio-portals" data-theme={theme} lang={locale}/>
    <p role="status">Storybook · 内存替身{saved}</p><Button onClick={() => setOpen(true)}>打开保存审阅</Button>
    {open && <div style={{ flex: 1, minHeight: 0 }}><SaveReview dialog={!workspace} initialPlan={model.plan} initialDocuments={model.documents} scope={{ kind: 'all' }} locale={locale} bridge={model.bridge}
      names={{ [FixtureIds.streetDocument]: '雨夜车站' }} close={() => setOpen(false)} changed={async () => {}}
      save={async plan => { if (failed) throw new Error('文件正在被占用。工作内容已保留，关闭占用后可重试。'); setSaved(` · 已保存 ${plan.objects.length} 个对象`); }}/></div>}</div>;
}
const meta = { title: 'Product/Studio/Workbench/Object save review', component: ObjectReview, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof ObjectReview>;
export default meta;
export const Selection: StoryObj<typeof meta> = {};
export const Dark: StoryObj<typeof meta> = { args: { theme: 'dark' } };
export const English: StoryObj<typeof meta> = { args: { locale: 'en' } };
export const Japanese: StoryObj<typeof meta> = { args: { locale: 'ja' } };
export const Failure: StoryObj<typeof meta> = { args: { failed: true } };
export const Pinned: StoryObj<typeof meta> = { args: { workspace: true } };
