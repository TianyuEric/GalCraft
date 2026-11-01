import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createMotionProject, parseMotionProject, updateMotionProject, projectDocumentKey } from './project.js';
import { definition, motionRenderOperation } from './definition.js';
import { validateProductionOperationDefinition } from '@galcraft/contracts';
import { PluginManifestSchema } from '@galcraft/plugins/contracts';
import { pluginMetadata } from './metadata.js';
describe('Motion Canvas source document and operation', () => {
  it('publishes a valid ordinary exact plugin and one local video operation', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package/manifest.json', import.meta.url), 'utf8'));
    expect(PluginManifestSchema.parse(manifest).version).toBe('0.1.0');
    expect(() => validateProductionOperationDefinition(motionRenderOperation, pluginMetadata, pluginMetadata.contributions)).not.toThrow();
    expect(parseMotionProject(createMotionProject()).ok).toBe(true);
  });
  it('rejects missing entry, duplicate Windows paths and invalid output geometry', () => {
    const project = createMotionProject(); project.entry='missing.ts'; project.files.push({path:'PROJECT.ts',content:''}); project.render.width=959;
    const parsed = parseMotionProject(project); expect(parsed.ok).toBe(false);
    if(!parsed.ok) expect(parsed.issues.map(issue=>issue.code)).toEqual(expect.arrayContaining(['MOTION_ENTRY','MOTION_FILE_DUPLICATE','MOTION_DIMENSIONS']));
  });
  it('keeps revisions and source unchanged on an expired edit base', () => {
    const project = createMotionProject(), before=structuredClone(project);
    expect(updateMotionProject(project,2,[{path:'scene.tsx',content:'updated'}]).ok).toBe(false); expect(project).toEqual(before);
    const parsed=updateMotionProject(project,1,[{path:'scene.tsx',content:'updated'}]);expect(parsed.ok).toBe(true);if(parsed.ok){expect(parsed.value.revision).toBe(2);expect(parsed.value.files.find(file=>file.path==='scene.tsx')?.content).toBe('updated');}
  });
  it('validates binding aliases and keeps asset references through a copied document', () => {
    const project=createMotionProject();project.bindings=[{alias:'cover',assetId:'image1',variantId:'variant1',port:'images',purpose:'image'}];
    const document=definition.documents!.find(item=>item.key===projectDocumentKey)!;
    expect(document.collectReferences({project})).toEqual([{kind:'asset',id:'image1'},{kind:'variant',id:'variant1'}]);
    const rewritten=document.rewriteReferences({project},{image1:'image2',variant1:'variant2'});expect(rewritten.ok).toBe(true);
    if(rewritten.ok)expect(rewritten.value).toMatchObject({project:{bindings:[{assetId:'image2',variantId:'variant2'}]}});
    project.bindings.push({...project.bindings[0]!}); expect(parseMotionProject(project).ok).toBe(false);
  });
});
