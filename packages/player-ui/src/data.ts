import { createId } from '@galcraft/contracts';
import type { CurrentMainStory, Domain, HistoryEntry, Id, LongTerm, PlayerHost, Result, RuntimeState, SaveIndex, SaveRecord, Snapshot } from '@galcraft/contracts';
import { CurrentMainStorySchema, LongTermSchema, SaveIndexSchema, SaveRecordSchema } from '@galcraft/contracts';
import type { PlayerPreferences } from './preferences.js';
import { defaultPreferences, validatePreferences, normalizeLanguagePreferences, type PlayerLanguages } from './preferences.js';
import { clone, fail, ok } from './common.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const bytes = (value: unknown) => encoder.encode(JSON.stringify(value));
const parse = (value: Uint8Array) => JSON.parse(decoder.decode(value)) as unknown;
const emptyIndex = (): SaveIndex => ({ schemaVersion: 1, revision: 0, manual: Array.from({length:12},(_,order)=>({slotId:createId(),order,recordId:null})), quick: [], auto: [], continueRecordId: null });
const emptyLongTerm = (): LongTerm => ({ schemaVersion: 2, revision: 0, readStatements: [], endings: [], cg: {}, music: [], video: [], flowEntries: {}, variables: {}, plugins: {} });

export type Profile = { index: SaveIndex; longTerm: LongTerm; preferences: PlayerPreferences; currentMainStory: CurrentMainStory | null; storageRevision: number };
export type SaveCategory = SaveRecord['kind'];
export type SaveInput = { kind: SaveCategory; slotId?: Id; record: SaveRecord; thumbnail?: Uint8Array;
  expectedIndexRevision: number; overwriteConfirmed?: boolean; occurrenceKey?: string };

export class PlayerDataService {
  readonly prefix: string;
  private profile: Profile | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private autosaved = new Set<string>();
  constructor(readonly host: Pick<PlayerHost, 'storage'|'target'>, readonly domain: Domain,
    readonly menuLocale: string, readonly voiceLocale: string, readonly reducedMotion = false, readonly languages?: PlayerLanguages) {
    this.prefix = `player/${domain.projectId}/${domain.kind}/${encodeURIComponent(domain.instance)}/`;
  }
  private key(suffix: string) { return this.prefix + suffix; }
  private async read(suffix: string): Promise<Result<Uint8Array | null>> { return this.host.storage.read(this.key(suffix)); }
  async open(): Promise<Result<Profile>> {
    if (this.profile) return ok(clone(this.profile));
    const [revision, index, longTerm, preferences, currentMainStory] = await Promise.all([
      this.read('revision'), this.read('index'), this.read('longTerm'), this.read('preferences'), this.read('currentMainStory'),
    ]);
    if (!revision.ok) return revision;
    if (!index.ok) return index;
    if (!longTerm.ok) return longTerm;
    if (!preferences.ok) return preferences;
    if (!currentMainStory.ok) return currentMainStory;
    try {
      const storageRevision = revision.value ? Number(parse(revision.value)) : 0;
      if (!Number.isSafeInteger(storageRevision) || storageRevision < 0) return fail('PROFILE_REVISION', '资料版本无效');
      const parsedIndex = SaveIndexSchema.parse(index.value ? parse(index.value) : emptyIndex());
      const manualCount=Math.max(12,Math.ceil(parsedIndex.manual.length/12)*12);
      while(parsedIndex.manual.length<manualCount)parsedIndex.manual.push({slotId:createId(parsedIndex),order:parsedIndex.manual.length,recordId:null});
      const parsedLongTerm = LongTermSchema.parse(longTerm.value ? parse(longTerm.value) : emptyLongTerm());
      const parsedPreferences = preferences.value ? parse(preferences.value) as PlayerPreferences :
        defaultPreferences(this.menuLocale, this.voiceLocale, this.reducedMotion);
      const valid = validatePreferences(parsedPreferences); if (!valid.ok) return valid;
      this.profile = { index: parsedIndex, longTerm: parsedLongTerm, preferences: normalizeLanguagePreferences(valid.value, this.languages),
        currentMainStory: currentMainStory.value ? CurrentMainStorySchema.nullable().parse(parse(currentMainStory.value)) : null, storageRevision };
      return ok(clone(this.profile));
    } catch (error) { return fail('PROFILE_INVALID', String(error)); }
  }
  reload(): Promise<Result<Profile>> {
    return this.transact(async () => {
      const previous = this.profile; this.profile = null;
      const loaded = await this.open();
      if (!loaded.ok) this.profile = previous;
      return loaded;
    });
  }
  current(): Profile | null { return this.profile ? clone(this.profile) : null; }
  /** Close/switch consumers wait for all already-started writes in this profile domain. */
  async waitForIdle(): Promise<void> {
    for(;;){const pending=this.queue;await pending;if(this.queue===pending)return;}
  }
  async record(recordId: Id): Promise<Result<SaveRecord | null>> {
    const stored = await this.read(`records/${recordId}`); if (!stored.ok || !stored.value) return stored.ok ? ok(null) : stored;
    try { const record = SaveRecordSchema.parse(parse(stored.value));
      return record.projectId === this.domain.projectId ? ok(record) : fail('RECORD_PROJECT', '存档不属于当前作品');
    } catch (error) { return fail('RECORD_INVALID', String(error)); }
  }
  async thumbnail(recordId: Id): Promise<Result<Uint8Array | null>> { return this.read(`thumbnails/${recordId}`); }
  private transact<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
    const pending = this.queue.then(run, run);
    this.queue = pending.then(() => undefined, () => undefined);
    return pending;
  }
  private async commit(next: Profile, writes: { key: string; bytes: Uint8Array }[], deletes: string[] = []): Promise<Result<Profile>> {
    const before = this.profile; if (!before) return fail('PROFILE_NOT_OPEN', '资料尚未装载');
    const revision = before.storageRevision + 1;
    const committed = await this.host.storage.commit({ domain: this.domain, expectedRevision: before.storageRevision,
      writes: [...writes.map(item => ({ key: this.key(item.key), bytes: new Uint8Array(item.bytes) })),
        { key: this.key('revision'), bytes: bytes(revision) }], deletes: deletes.map(key => this.key(key)) });
    if (!committed.ok) return committed;
    if (committed.value.revision !== revision) return fail('PROFILE_REVISION', '宿主返回的资料版本不一致');
    next.storageRevision = revision; this.profile = clone(next); return ok(clone(next));
  }
  async saveCurrentMainStory(value: CurrentMainStory | null): Promise<Result<CurrentMainStory | null>> {
    return this.transact(async () => {
      const opened = await this.open(); if (!opened.ok) return opened;
      const checked = CurrentMainStorySchema.nullable().safeParse(value);
      if (!checked.success) return fail('MAIN_STORY_INVALID', '当前正篇姓名无效');
      if (JSON.stringify(opened.value.currentMainStory) === JSON.stringify(checked.data)) return ok(opened.value.currentMainStory);
      const next = clone(opened.value); next.currentMainStory = checked.data;
      const committed = await this.commit(next, [{ key: 'currentMainStory', bytes: bytes(checked.data) }]);
      return committed.ok ? ok(committed.value.currentMainStory) : committed;
    });
  }
  async save(input: SaveInput): Promise<Result<SaveIndex>> {
    return this.transact(async () => {
      const opened = await this.open(); if (!opened.ok) return opened;
      if (input.record.projectId !== this.domain.projectId || input.record.kind !== input.kind || !SaveRecordSchema.safeParse(input.record).success)
        return fail('SAVE_INVALID', '存档内容与资料域不一致');
      if (input.expectedIndexRevision !== opened.value.index.revision) return fail('INDEX_STALE', '存档列表已更新');
      if (input.kind === 'auto' && input.occurrenceKey && this.autosaved.has(input.occurrenceKey)) return ok(opened.value.index);
      const next = clone(opened.value), index = next.index, oldIds: Id[] = [];
      if (input.kind === 'manual') {
        const slotId = input.slotId ?? index.manual.find(slot=>!slot.recordId)?.slotId ?? createId(this.profile);
        const slot = index.manual.find(item => item.slotId === slotId);
        if (slot?.recordId && !input.overwriteConfirmed) return fail('OVERWRITE_CONFIRMATION_REQUIRED', '覆盖存档需要确认');
        if (slot?.recordId) oldIds.push(slot.recordId);
        if (slot) slot.recordId = input.record.recordId;
        else index.manual.push({ slotId, order: index.manual.length, recordId: input.record.recordId });
      } else if (input.kind === 'continue') {
        if (input.record.state.story?.kind === 'afterstory') {
          const entries = index.afterstoryRecords ??= {}, key = input.record.state.story.entryId;
          if (entries[key]) oldIds.push(entries[key]); entries[key] = input.record.recordId;
        } else {
          if (index.continueRecordId) oldIds.push(index.continueRecordId);
          index.continueRecordId = input.record.recordId;
        }
      } else {
        const list = input.kind === 'quick' ? index.quick : index.auto;
        list.unshift(input.record.recordId);
        const capacity = input.kind === 'quick' ? 12 : 3;
        oldIds.push(...list.splice(capacity));
      }
      index.revision++;
      const writes: { key: string; bytes: Uint8Array }[] = [{ key: `records/${input.record.recordId}`, bytes: bytes(input.record) },
        { key: 'index', bytes: bytes(index) }];
      if (input.thumbnail) writes.push({ key: `thumbnails/${input.record.recordId}`, bytes: new Uint8Array(input.thumbnail) });
      const result = await this.commit(next, writes, oldIds.flatMap(id => [`records/${id}`, `thumbnails/${id}`]));
      if (result.ok && input.kind === 'auto' && input.occurrenceKey) this.autosaved.add(input.occurrenceKey);
      return result.ok ? ok(result.value.index) : result;
    });
  }
  async addManualPage(expectedIndexRevision: number): Promise<Result<SaveIndex>> {
    return this.transact(async () => {
      const opened = await this.open(); if (!opened.ok) return opened;
      if (opened.value.index.revision !== expectedIndexRevision) return fail('INDEX_STALE', '存档列表已更新');
      const next = clone(opened.value);
      const count = (Math.max(1, Math.ceil(next.index.manual.length / 12)) + 1) * 12;
      for (let order = next.index.manual.length; order < count; order++)
        next.index.manual.push({ slotId: createId(this.profile), order, recordId: null });
      next.index.revision++;
      const committed = await this.commit(next, [{ key: 'index', bytes: bytes(next.index) }]);
      return committed.ok ? ok(committed.value.index) : committed;
    });
  }
  async savePreferences(nextPreferences: PlayerPreferences, expectedRevision: number): Promise<Result<PlayerPreferences>> {
    return this.transact(async () => {
      const opened = await this.open(); if (!opened.ok) return opened;
      if (opened.value.preferences.revision !== expectedRevision) return fail('PREFERENCES_STALE', '设置已更新');
      const next = clone(opened.value); next.preferences = { ...normalizeLanguagePreferences(clone(nextPreferences), this.languages), revision: expectedRevision + 1 };
      const checked = validatePreferences(next.preferences); if (!checked.ok) return checked;
      const committed = await this.commit(next, [{ key: 'preferences', bytes: bytes(next.preferences) }]);
      return committed.ok ? ok(committed.value.preferences) : committed;
    });
  }
  async saveLongTerm(nextLongTerm: LongTerm, expectedRevision: number): Promise<Result<LongTerm>> {
    return this.transact(async () => {
      const opened = await this.open(); if (!opened.ok) return opened;
      if (opened.value.longTerm.revision !== expectedRevision) return fail('LONG_TERM_STALE', '长期资料已更新');
      const next = clone(opened.value); next.longTerm = { ...clone(nextLongTerm), revision: expectedRevision + 1 };
      if (!LongTermSchema.safeParse(next.longTerm).success) return fail('LONG_TERM_INVALID', '长期资料格式无效');
      const committed = await this.commit(next, [{ key: 'longTerm', bytes: bytes(next.longTerm) }]);
      return committed.ok ? ok(committed.value.longTerm) : committed;
    });
  }
  async clear(scopes: ('saves'|'longTerm'|'preferences')[]): Promise<Result<Profile>> {
    return this.transact(async () => {
      const opened = await this.open(); if (!opened.ok) return opened;
      const next = clone(opened.value), writes: { key: string; bytes: Uint8Array }[] = [], deletes: string[] = [];
      if (scopes.includes('saves')) {
        const ids = [...next.index.manual.map(slot => slot.recordId), ...next.index.quick, ...next.index.auto,
          next.index.continueRecordId,...Object.values(next.index.afterstoryRecords??{})].filter((id): id is Id => id !== null);
        deletes.push(...ids.flatMap(id => [`records/${id}`, `thumbnails/${id}`]));
        next.index = { ...emptyIndex(), revision: next.index.revision + 1 };
        next.currentMainStory = null;
        writes.push({ key: 'index', bytes: bytes(next.index) });
        writes.push({ key: 'currentMainStory', bytes: bytes(null) });
      }
      if (scopes.includes('longTerm')) { next.longTerm = { ...emptyLongTerm(), revision: next.longTerm.revision + 1 };
        writes.push({ key: 'longTerm', bytes: bytes(next.longTerm) }); }
      if (scopes.includes('preferences')) {
        next.preferences = { ...normalizeLanguagePreferences(defaultPreferences(this.menuLocale, this.voiceLocale, this.reducedMotion), this.languages), revision: next.preferences.revision + 1 };
        writes.push({ key: 'preferences', bytes: bytes(next.preferences) });
      }
      if (!writes.length) return ok(opened.value);
      return this.commit(next, writes, deletes);
    });
  }
  async applyImport(input: { expected: { indexRevision: number; longTermRevision: number; preferencesRevision: number };
    next: Profile; records: SaveRecord[]; thumbnails: Record<Id, Uint8Array>; removedRecordIds: Id[] }): Promise<Result<Profile>> {
    return this.transact(async () => {
      const opened = await this.open(); if (!opened.ok) return opened;
      if (opened.value.index.revision !== input.expected.indexRevision ||
        opened.value.longTerm.revision !== input.expected.longTermRevision ||
        opened.value.preferences.revision !== input.expected.preferencesRevision)
        return fail('PLAN_STALE', '资料在导入确认后已变化');
      const next = clone(input.next);
      next.currentMainStory = opened.value.currentMainStory;
      next.index.revision = opened.value.index.revision + 1;
      next.longTerm.revision = opened.value.longTerm.revision + 1;
      next.preferences = normalizeLanguagePreferences(next.preferences, this.languages);
      next.preferences.revision = opened.value.preferences.revision + 1;
      const writes = [{ key: 'index', bytes: bytes(next.index) }, { key: 'longTerm', bytes: bytes(next.longTerm) },
        { key: 'preferences', bytes: bytes(next.preferences) },
        ...input.records.map(record => ({ key: `records/${record.recordId}`, bytes: bytes(record) })),
        ...Object.entries(input.thumbnails).map(([id, value]) => ({ key: `thumbnails/${id}`, bytes: value }))];
      return this.commit(next, writes, input.removedRecordIds.flatMap(id => [`records/${id}`, `thumbnails/${id}`]));
    });
  }
  makeRecord(input: { snapshot: Snapshot; inspection: { state: RuntimeState; history: HistoryEntry[] };
    kind: SaveCategory; sceneName?: string; thumbnail?: string | null; recordId?: Id }): SaveRecord {
    const { snapshot, inspection } = input;
    return { schemaVersion: 1, recordId: input.recordId ?? createId(this.profile), projectId: snapshot.projectId,
      releaseVersion: snapshot.releaseVersion, engineVersion: snapshot.engineVersion,
      dependencyVersions: [snapshot.lock.engine, ...snapshot.lock.plugins, snapshot.lock.template],
      createdAt: new Date().toISOString(), kind: input.kind,
      summary: { sceneName: `${inspection.state.story?.kind === 'afterstory' ? `${inspection.state.story.title} · ` : ''}${input.sceneName ?? snapshot.scenes.find(item => item.scene.id === inspection.state.position.sceneId)?.scene.name ?? ''}`,
        speaker: inspection.state.presentation.text.speakerName, text: inspection.state.presentation.text.text,
        playTimeMs: inspection.state.playTimeMs }, thumbnail: input.thumbnail ?? null,
      state: clone(inspection.state), history: clone(inspection.history) };
  }
}
