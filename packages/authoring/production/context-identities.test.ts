import { describe, expect, it } from 'vitest';
import { FixtureAsset, FixtureCharacters, FixtureIds, FixtureProject, FixtureSnapshot, FixtureVariables } from '@galcraft/contracts/fixtures';
import { CoreCommandSpecs, parse } from '@galcraft/dsl';
import { compactContextParts, restoreCandidateIdentities } from './context-identities.js';
import { candidateText, reviewScript } from './review.js';
import type { Candidate, ContextPart } from './types.js';

const legacy = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const characterId = legacy(201), statementId = legacy(801), variableId = legacy(501);
const script = `say {"speaker":{"kind":"character","id":"${characterId}"},"text":"literal ${characterId}","when":expr("progress[\\\"${variableId}\\\"] > 0")} @${statementId};`;
const part = (kind: ContextPart['kind'], text: string): ContextPart => ({ id: 'Part01', kind, text, label: 'context', included: true, source: null, media: null, attachment: null, authorEdited: false });

describe('short AI context references', () => {
  it('restores plugin reference fields and structured variable expressions from the stored command contract', () => {
    const plugin = { ...structuredClone(CoreCommandSpecs.find(spec => spec.key === 'setVar')!), key: 'org.galcraft.context/set' };
    const text = `${plugin.key} {variableId:"${variableId}",op:"set",value:{kind:"variable",scope:"progress",id:"${variableId}"}} @${statementId};`;
    const compacted = compactContextParts([part('script', text)], '0.1.0', [plugin]);
    const compact = compacted.context[0]!.text!;
    expect(compact).not.toContain(variableId);
    const restored = restoreCandidateIdentities(compact, compacted.idAliases, 'script', [plugin]);
    const parsed = parse({ documentId: 'Doc001', revision: 1, text: restored });
    expect(parsed.statements[0]!.args.variableId).toBe(variableId);
    expect(parsed.statements[0]!.args.value).toEqual({ kind: 'variable', scope: 'progress', id: variableId });
    expect(parsed.cst[0]!.id).toBe(statementId);
  });
  it('shortens structured legacy references and restores them without touching dialogue or prose', () => {
    const assetId = legacy(601);
    const style = `[data-gc-component="${statementId}"]{background-image:url("asset:${assetId}");content:"${assetId}"}`;
    const result = compactContextParts([part('script', script), part('character', JSON.stringify({ id: characterId, name: '角色', description: characterId })), part('instruction', `Remember ${characterId}`),
      part('assetCatalog', JSON.stringify({ assets: [{ id: assetId, description: assetId }] })), part('style', style)]);
    const compact = parse({ documentId: 'Doc001', revision: 1, text: result.context[0]!.text! });
    expect(compact.issues).toEqual([]);
    expect(compact.cst[0]!.id).toMatch(/^[A-Za-z0-9]{6}$/);
    const args = compact.statements[0]!.args as any;
    expect(args.speaker.id).toMatch(/^[A-Za-z0-9]{6}$/);
    expect(args.text).toBe(`literal ${characterId}`);
    expect(args.when.left.id).toMatch(/^[A-Za-z0-9]{6}$/);
    const character = JSON.parse(result.context[1]!.text!);
    expect(character.id).toBe(args.speaker.id);
    expect(character.description).toBe(characterId);
    expect(result.context[2]!.text).toBe(`Remember ${characterId}`);
    const assetAlias = Object.entries(result.idAliases).find(([, real]) => real === assetId)![0];
    expect(JSON.parse(result.context[3]!.text!).assets[0]).toEqual({ id: assetAlias, description: assetId });
    expect(result.context[4]!.text).toContain(`asset:${assetAlias}`);
    expect(result.context[4]!.text).toContain(`content:"${assetId}"`);
    expect(restoreCandidateIdentities(result.context[4]!.text!, result.idAliases, 'ui')).toBe(result.context[4]!.text);
    expect(restoreCandidateIdentities(JSON.stringify({ styles: [{ source: result.context[4]!.text }] }), result.idAliases, 'ui')).toBe(JSON.stringify({ styles: [{ source: style }] }));
    const restored = parse({ documentId: 'Doc001', revision: 1, text: restoreCandidateIdentities(result.context[0]!.text!, result.idAliases, 'script') });
    expect(restored.cst[0]!.id).toBe(statementId);
    expect(restored.statements[0]!.args).toEqual(parse({ documentId: 'Doc001', revision: 1, text: script }).statements[0]!.args);
  });

  it('adopts AI aliases into an existing UUID scene with stable statements and real cross-module references', async () => {
    const project = structuredClone(FixtureProject), scene = structuredClone(FixtureSnapshot.scenes[0]!.scene);
    const sceneDocumentId = legacy(402), realStatementId = legacy(802), assetId = legacy(602);
    const character = { ...structuredClone(FixtureCharacters[1]!), id: characterId, defaultVoicing: 'intentionalSilent' as const };
    const variable = { ...structuredClone(FixtureVariables[0]!), id: variableId };
    const asset = { ...structuredClone(FixtureAsset), id: assetId };
    const original = `say {"speaker":{"kind":"character","id":"${characterId}"},"text":"old","when":expr("progress[\\\"${variableId}\\\"] >= 0")} @${realStatementId};\nend {} @End001;`;
    const compressed = compactContextParts([part('script', original), part('assetCatalog', JSON.stringify({ assets: [{ id: assetId }] }))]);
    const assetAlias = Object.entries(compressed.idAliases).find(([, real]) => real === assetId)![0];
    const modelText = `changeBg {"op":"show","assetId":"${assetAlias}"} @NewBg1;\n` + compressed.context[0]!.text!.replace('"old"', '"new"');
    const candidate = { id: 'Cand01', partial: false, editedText: modelText, artifacts: [], recipeSnapshot: null, idAliases: compressed.idAliases } as unknown as Candidate;
    expect(await candidateText(candidate)).toContain(`@${realStatementId}`);
    const current = { projectId: FixtureIds.projectA, engineVersion: '0.1.0', project, lock: FixtureSnapshot.lock,
      documents: [{ kind: 'scene' as const, documentId: sceneDocumentId, revision: 1, sceneId: scene.id, text: original }], scenes: [scene],
      characters: [character], variables: [variable], assets: [asset], gallery: [], flows: [], template: FixtureSnapshot.template, cancelOperationId: 'Cancel' };
    const expected = [{ ref: { kind: 'document' as const, id: sceneDocumentId }, revision: 1 }];
    // Insert the new background and replace say; the current end stays outside the edit.
    candidate.editedText = parse({ documentId: 'Doc001', revision: 1, text: modelText }).cst.slice(0, 2).map(node => node.raw).join('\n');
    const reviewed = await reviewScript({ candidate, current, documentId: sceneDocumentId, beforeStatementId: null, replaceStatementIds: [realStatementId], bindings: {}, expected });
    if (!reviewed.ok) throw new Error(JSON.stringify(reviewed.issues));
    expect(reviewed.ok).toBe(true);
    const patch = reviewed.value.patches[0];
    expect(patch?.kind).toBe('text');
    if (patch?.kind !== 'text') throw new Error('text patch expected');
    expect(patch.edits[0]!.after).toContain(`@${realStatementId}`);
    expect(patch.edits[0]!.after).toContain('"new"');
    const adopted = parse({ documentId: sceneDocumentId, revision: 1, text: patch.edits[0]!.after });
    expect(adopted.statements[0]!.args.assetId).toBe(assetId);
    expect(adopted.cst[0]!.id).toMatch(/^[A-Za-z0-9]{6}$/);
    expect(adopted.cst[0]!.id).not.toBe('NewBg1');
    expect(adopted.statements[1]!.args.speaker).toEqual({ kind: 'character', id: characterId });
    expect((adopted.statements[1]!.args.when as any).left.id).toBe(variableId);
  });
});
