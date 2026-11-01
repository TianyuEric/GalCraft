import { describe, expect, it } from 'vitest';
import { PluginManifestSchema } from './manifest.js';
import { StudioContributionDeclarationSchema } from './studio.js';
describe('Studio contribution declaration boundary', () => {
  it('keeps independent workbenches in the extension navigation and embedded UI in named slots', () => {
    expect(StudioContributionDeclarationSchema.safeParse({key:'org.example.plugin/workbench',kind:'workbench',slot:'extensions.navigation'}).success).toBe(true);
    expect(StudioContributionDeclarationSchema.safeParse({key:'org.example.plugin/form',kind:'form',slot:'creation.tools'}).success).toBe(true);
    expect(StudioContributionDeclarationSchema.safeParse({key:'org.example.plugin/workbench',kind:'workbench',slot:'creation.tools'}).success).toBe(false);
    expect(StudioContributionDeclarationSchema.safeParse({key:'org.example.plugin/form',kind:'form',slot:'extensions.navigation'}).success).toBe(false);
  });
  it('requires an editor entry and owned unique contribution keys', () => {
    const manifest = { schemaVersion:1,id:'org.example.plugin',name:'Example',version:'0.1.0',description:'',author:'Example',license:'MIT',homepage:null,
      engineRange:'^0.1.0',sdkMajor:0,targets:['web','windows'],dependencies:[],entry:{runtime:null,editor:'editor.js'},files:[{path:'editor.js',size:0}],
      contributions:[],studio:[{key:'org.example.plugin/workbench',kind:'workbench',slot:'extensions.navigation'}],stateVersions:{document:0,progress:0,longTerm:0},native:[] };
    expect(PluginManifestSchema.safeParse(manifest).success).toBe(true);
    expect(PluginManifestSchema.safeParse({...manifest,entry:{runtime:null,editor:null}}).success).toBe(false);
    expect(PluginManifestSchema.safeParse({...manifest,studio:[{...manifest.studio[0],key:'org.other.plugin/workbench'}]}).success).toBe(false);
    expect(PluginManifestSchema.safeParse({...manifest,studio:[...manifest.studio,...manifest.studio]}).success).toBe(false);
  });
});
