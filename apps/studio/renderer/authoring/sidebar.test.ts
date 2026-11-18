// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Result, SemanticPage } from '@galcraft/contracts';
import { FixtureCharacters, FixtureIds, FixtureProject } from '@galcraft/contracts/fixtures';
import { createAuthoringSidebar, initialSidebarState, runSidebarSearch } from './sidebar.js';
import type { AuthoringServices, AuthoringSource } from './controller.js';

const text = (value: string, id: string) => `say {speaker:{kind:"narrator"},text:${JSON.stringify(value)}} @${id};\n`;
function source(): AuthoringSource {
  return { projectDocumentId: FixtureIds.projectA, projectRevision: 1, projectSavedRevision: 1, projectDirty: false,
    project: structuredClone(FixtureProject), characters: structuredClone(FixtureCharacters), scenes: [
      { sceneId: FixtureIds.street, documentId: FixtureIds.streetDocument, name: 'Street', chapterId: FixtureIds.chapter,
        revision: 2, savedRevision: 1, dirty: true, text: text('before', FixtureIds.statements[0]) + text('unsaved rain', FixtureIds.statements[1]) + text('after', FixtureIds.statements[2]) },
      { sceneId: FixtureIds.bookshop, documentId: FixtureIds.bookshopDocument, name: 'Shop', chapterId: FixtureIds.chapter,
        revision: 1, savedRevision: 1, dirty: false, text: text('rain in shop', FixtureIds.statements[3]) },
    ] };
}
const page = (total: number): SemanticPage => ({ requestId: FixtureIds.projectA, versions: [], items: [], total, offset: 0, coverage: [] });
const ok = <T>(value: T): Result<T> => ({ ok: true, value, warnings: [] });

describe('authoring sidebar working-document search', () => {
  it('finds unsaved dialogue by default across the project and supplies its neighbours', async () => {
    const state = initialSidebarState(); state.term = 'rain';
    const found = await runSidebarSearch({ state, source: source(), sceneId: FixtureIds.street, services: {} as AuthoringServices });
    expect(found?.total).toBe(2);
    expect(found?.items[0]).toMatchObject({ source: { revision: 2 }, context: { before: 'before', current: 'unsaved rain', after: 'after' } });
    expect(state.searching).toBe(false); expect(state.error).toBe('');
  });
  it('scopes text to the selected scene before counting or paginating', async () => {
    const state = initialSidebarState(); state.term = 'rain'; state.scope = 'scene';
    const found = await runSidebarSearch({ state, source: source(), sceneId: FixtureIds.bookshop, services: {} as AuthoringServices });
    expect(found?.total).toBe(1); expect(found?.items[0]?.sceneId).toBe(FixtureIds.bookshop);
    expect(found?.coverage).toHaveLength(1);
  });
  it('keeps the full count while returning the requested result page', async () => {
    const state = initialSidebarState(); state.term = 'rain'; state.offset = 40;
    const working = source(); working.scenes = [working.scenes[0]!];
    working.scenes[0]!.text = Array.from({ length: 43 }, (_, index) => text(`rain ${index}`, crypto.randomUUID())).join('');
    const found = await runSidebarSearch({ state, source: working, sceneId: FixtureIds.street, services: {} as AuthoringServices });
    expect(found).toMatchObject({ total: 43, offset: 40 }); expect(found?.items).toHaveLength(3);
    expect(found?.items[0]?.context.current).toBe('rain 40');
  });
  it('passes scene scope to semantic queries and retains full-project as the default', async () => {
    const searchSemantic = vi.fn(async () => ok(page(1))); const services = { searchSemantic } as unknown as AuthoringServices;
    const state = initialSidebarState(); state.mode = 'asset'; state.target = FixtureIds.background;
    await runSidebarSearch({ state, source: source(), sceneId: FixtureIds.street, services });
    expect(searchSemantic).toHaveBeenLastCalledWith({ kind: 'asset', id: FixtureIds.background }, 0, undefined);
    state.scope = 'scene'; await runSidebarSearch({ state, source: source(), sceneId: FixtureIds.street, services });
    expect(searchSemantic).toHaveBeenLastCalledWith({ kind: 'asset', id: FixtureIds.background }, 0, [FixtureIds.street]);
  });
  it('keeps the newest query when an earlier semantic response arrives later', async () => {
    const resolvers: ((value: Result<SemanticPage>) => void)[] = [];
    const services = { searchSemantic: () => new Promise<Result<SemanticPage>>(resolve => resolvers.push(resolve)) } as unknown as AuthoringServices;
    const state = initialSidebarState(); state.mode = 'bgm';
    const options = { state, source: source(), sceneId: FixtureIds.street, services };
    const first = runSidebarSearch(options), second = runSidebarSearch(options);
    resolvers[1]!(ok(page(2))); await second; resolvers[0]!(ok(page(9))); await first;
    expect(state.page?.total).toBe(2); expect(state.searching).toBe(false);
  });
  it('requires a scene for a scene-scoped query', async () => {
    const state = initialSidebarState(); state.scope = 'scene'; state.term = 'rain';
    const searchSemantic = vi.fn();
    const found = await runSidebarSearch({ state, source: source(), sceneId: null, locale: 'en', services: { searchSemantic } as unknown as AuthoringServices });
    expect(found).toBeNull(); expect(state.error).toContain('Select a scene'); expect(searchSemantic).not.toHaveBeenCalled();
  });
  it('restores scene search and suspends it while the central document is incompatible', async () => {
    const working = source();
    const state = initialSidebarState({ mode: 'text', term: 'rain', target: '', targetLabel: '', scope: 'scene',
      variableAccess: 'both', offset: 0, hasSearched: true, searchScrollTop: 0 });
    const search = createAuthoringSidebar({ services: {} as AuthoringServices, source: working, sceneId: null, state, locale: 'en',
      cache: () => {}, locate: async () => {} });
    const input = search.node.querySelector('input')!;
    try {
      expect(input.disabled).toBe(true);
      expect(search.node.querySelector('.sidebar-source')?.textContent).toContain('Open a scene');
      search.update(working, FixtureIds.street);
      await vi.waitFor(() => expect(search.node.querySelector('.sidebar-hit-current')?.textContent).toBe('unsaved rain'));
      expect(input.disabled).toBe(false);
      search.update(working, null);
      expect(search.node.querySelector('.sidebar-search-hit')).toBeNull();
      expect(input.value).toBe('rain');
      search.update(working, FixtureIds.bookshop);
      await vi.waitFor(() => expect(search.node.querySelector('.sidebar-hit-current')?.textContent).toBe('rain in shop'));
      expect(search.node.querySelector('input')).toBe(input);
    } finally { search.dispose(); }
  });
});
