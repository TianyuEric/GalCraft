import { LanguageService } from '@galcraft/dsl';
import { createId } from '@galcraft/contracts';
import { pathToFileURL } from 'node:url';

process.parentPort.once('message', event => {
  const [port] = event.ports;
  const controller = new AbortController();
  port.on('message', message => {
    if (message.data?.type === 'cancel') controller.abort();
  });
  port.start();
  const request = event.data.input;
  void (async () => {
    const Compiler = request.compiler ? (await import(pathToFileURL(request.compiler).href)).LanguageService : LanguageService;
    const service = new Compiler();
    const compiled = await service.compile({ ...request.compileInput, signal: controller.signal });
    if (request.kind === 'pluginPrepare') {
      const result = service.patchFields(request.edit);
      if (!result.ok) return result;
      return { ok: true, value: { label: request.edit.label ?? '插件字段编辑', origin: 'plugin',
        expected: [{ ref: { kind: 'document', id: request.edit.documentId }, revision: request.edit.revision }],
        patches: [{ kind: 'text', documentId: request.edit.documentId, edits: result.value.map(edit => ({
          start: edit.start, end: edit.end, before: edit.oldText, after: edit.text })) }], preparedAssets: [], requiredRefs: [] }, warnings: [] };
    }
    if (request.kind === 'pluginQuery') {
      const { query, compileInput } = request, matches = [], issues = [...compiled.issues];
      for (const ref of query.refs ?? []) {
        const variable = compileInput.variables.find(item => item.id === ref.id);
        const filter = ref.kind === 'character' ? { kind: 'dialogue', speaker: { kind: 'character', id: ref.id } }
          : ref.kind === 'asset' ? { kind: 'asset', id: ref.id }
          : ref.kind === 'variable' ? { kind: 'variable', id: ref.id, scope: variable?.scope ?? 'progress', declaringSceneId: null, access: 'both' } : null;
        if (!filter) continue;
        const semanticQuery = { projectId: compileInput.projectId, requestId: createId(),
          expected: compileInput.documents.map(document => ({ ref: { kind: 'document', id: document.documentId }, revision: document.revision })),
          expectedLock: compileInput.lock, sceneIds: query.sceneId ? [query.sceneId] : [], offset: 0, limit: 100, filter };
        const result = service.querySemantic(semanticQuery);
        if (!result.ok) { issues.push(...result.issues); continue; }
        const page = { ...result.value, items: [...result.value.items] };
        for (let offset = page.items.length; offset < page.total;) {
          const more = service.querySemantic({ ...semanticQuery, offset });
          if (!more.ok) { issues.push(...more.issues); break; }
          if (!more.value.items.length) break;
          page.items.push(...more.value.items); offset += more.value.items.length;
        }
        matches.push({ ref, ...page });
      }
      const sceneDocuments = compileInput.documents.filter(item => item.kind === 'scene');
      const documents = compiled.parses.map((parsed, index) => ({ documentId: parsed.documentId, revision: parsed.revision,
        sceneId: sceneDocuments[index]?.sceneId ?? null, statements: parsed.statements.filter(statement =>
          !query.statementIds?.length || query.statementIds.includes(statement.id)), issues: parsed.issues }))
        .filter(document => !query.sceneId || document.sceneId === query.sceneId);
      return { ok: true, value: { documents, matches, issues, versions: compileInput.documents.map(document => ({
        ref: { kind: 'document', id: document.documentId }, revision: document.revision })) }, warnings: [] };
    }
    return request.kind === 'compile' ? compiled
      : request.kind === 'query' ? service.querySemantic(request.query)
      : { ok: true, value: service.locate(request.source, request.fieldPath), warnings: [] };
  })().then(
    value => port.postMessage({ type: 'result', value }),
    error => port.postMessage({ type: 'error', code: 'COMPILE_FAILED', message: String(error) }),
  ).finally(() => { setTimeout(() => { port.close(); process.exit(0); }, 100); });
});
