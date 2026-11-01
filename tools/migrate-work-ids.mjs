import { createRequire } from 'node:module';
import { mkdir, readFile, rename, rm, writeFile, copyFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { StudioBackups } from '../apps/studio/main/backup-providers.mjs';
import { AuthoringPreferences } from '../apps/studio/main/preferences.mjs';

const require = createRequire(new URL('../apps/studio/package.json', import.meta.url));
const { migrateLegacyProject } = await import(pathToFileURL(require.resolve('@galcraft/documents/backup')).href);
const { EngineCatalog } = await import(pathToFileURL(require.resolve('@galcraft/publishing/engine')).href);
const { createId, WorkspaceResumeSchema, StageGuidePreferencesSchema } = await import(pathToFileURL(require.resolve('@galcraft/contracts')).href);

async function optional(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function list(path) {
  try { return await readdir(path); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function put(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, content); await rename(`${path}.tmp`, path);
}
const mapWorkspace = (record, mapping) => {
  const id = value => mapping[value] ?? value;
  return WorkspaceResumeSchema.parse({ ...record, projectId: id(record.projectId), documentId: id(record.documentId), sceneId: id(record.sceneId),
    caret: { ...record.caret, statementId: id(record.caret.statementId) }, previousStatementId: id(record.previousStatementId), nextStatementId: id(record.nextStatementId),
    scroll: { ...record.scroll, statementId: id(record.scroll.statementId) } });
};

/** The supplied userData's registered source works are the batch boundary. */
export async function migrateWorkLibrary({ userData, reportPath }) {
  const root = resolve(userData);
  const backups = new StudioBackups({ userData: root, projects: {}, engineCatalog: new EngineCatalog(root),
    officialPackages: { 'org.galcraft.affection': resolve(import.meta.dirname, '../plugins/official-affection/package'),
      'org.galcraft.steam': resolve(import.meta.dirname, '../plugins/official-steam/package') } });
  const library = backups.projectLibrary, providers = backups.service.providers, records = await library.capture();
  const runDirectory = join(root, 'short-id-migrations', createId(records));
  const receipts = [], skipped = [];
  await mkdir(runDirectory, { recursive: true });
  const preferencePath = join(root, 'preferences.json');
  if (await optional(preferencePath) !== null) await copyFile(preferencePath, join(runDirectory, 'preferences.json'));
  await new AuthoringPreferences(root).readPreferences();
  for (const record of records) {
    const inspected = await library.metadata(record.directory, record);
    if (inspected.status !== 'available') { skipped.push({ directory: record.directory, reason: inspected.status }); continue; }
    // Frozen tasks carry source revisions and text images; resolve them before changing identity.
    for (const kind of ['tasks', 'task-drafts']) if ((await list(join(root, kind, inspected.projectId))).length)
      throw new Error(`请先处理个人制作任务再迁移：${inspected.name} / ${kind}`);
    const captured = new Map(), created = new Set();
    const personal = [];
    for (const [kind, folder] of [['workspace', 'authoring-preferences/workspace'], ['stage-guides', 'authoring-preferences/stage-guides'], ['assets', 'asset-picker']]) {
      const path = join(root, folder, `${inspected.projectId}.json`), raw = await optional(path);
      if (raw !== null) personal.push({ kind, folder, path, raw });
    }
    providers.registry = {
      capture: async () => library.capture(),
      register: async receipt => {
        const mapping = receipt.idMap;
        for (const item of personal) {
          const data = JSON.parse(item.raw);
          const next = item.kind === 'workspace' ? mapWorkspace(WorkspaceResumeSchema.parse(data), mapping)
            : item.kind === 'stage-guides' ? StageGuidePreferencesSchema.parse({ ...data, projectId: receipt.projectId })
              : Object.fromEntries(Object.entries(data).map(([kind, ids]) => [kind, ids.map(id => mapping[id] ?? id)]));
          const path = join(root, item.folder, `${receipt.projectId}.json`);
          if (path !== item.path && await optional(path) !== null) throw new Error(`迁移目标个人偏好已存在：${path}`);
          captured.set(item.path, item.raw); created.add(path);
          await put(join(runDirectory, inspected.projectId, item.folder, `${inspected.projectId}.json`), item.raw);
          await put(path, JSON.stringify(next, null, 2) + '\n');
          if (path !== item.path) await rm(item.path);
        }
        const current = await library.metadata(receipt.directory, record), { status, ...entry } = current;
        await library.restore((await library.capture()).map(item => resolve(item.directory) === resolve(record.directory) ? entry : item));
      },
      restore: async previous => {
        for (const path of created) await rm(path, { force: true });
        for (const [path, raw] of captured) await put(path, raw);
        await library.restore(previous);
      },
    };
    const receipt = await migrateLegacyProject(record.directory, providers);
    if (receipt) {
      receipts.push(receipt);
      await put(join(runDirectory, `${receipt.sourceProjectId}.json`), JSON.stringify(receipt, null, 2) + '\n');
      const report = { userData: root, runDirectory, receipts, skipped };
      if (reportPath) await put(resolve(reportPath), JSON.stringify(report, null, 2) + '\n');
      console.log(JSON.stringify({ name: inspected.name, sourceProjectId: receipt.sourceProjectId, projectId: receipt.projectId,
        migratedIds: Object.keys(receipt.idMap).length, backupDirectory: receipt.backupDirectory }));
    }
  }
  return { userData: root, runDirectory, receipts, skipped };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), value = key => args[args.indexOf(key) + 1];
  if (!args.includes('--user-data') || !value('--user-data')) throw new Error('用法：node tools/migrate-work-ids.mjs --user-data PATH [--report PATH]；请先退出 Studio');
  await migrateWorkLibrary({ userData: value('--user-data'), reportPath: args.includes('--report') ? value('--report') : undefined });
}
