import { z } from 'zod';
import { createId, VoicePresetSchema } from '@galcraft/contracts';
import type { AssetTypeData, EditInput, Json, Patch, Ref, Result, VersionRef } from '@galcraft/contracts';
import { parse, patchFields, type CompileInput } from '@galcraft/dsl';
import { suggestedAssetName, validAssetFileName } from '@galcraft/assets/naming';
import type { ImportInput, PreparedIndexEdit } from '@galcraft/assets';
import type { Candidate, TaskItem } from './types.js';
import type { PlanningDocument } from './planning.js';
import { reviewScript } from './review.js';
import { ok, fail, requireValue as value } from './validation.js';
import { animationCandidate } from './animation-candidate.js';
export const CandidateAdoptionChoiceSchema = z.strictObject({mode:z.enum(['library','bind','voicePreset']).describe('library imports an asset only; bind adopts at the frozen scene/statement target; voicePreset stores a character reference voice for its selected locale'),name:z.string().optional(),placement:z.enum(['new','replace']).optional(),use:z.enum(['figure','illustration']).optional(),frame:z.strictObject({fit:z.enum(['cover','contain','native']),positionX:z.number().finite(),positionY:z.number().finite()}).optional(),voicePreset:z.strictObject({characterId:z.string(),locale:z.string(),referenceLocale:z.string(),transcript:z.string(),connectionId:z.string(),model:z.string()}).optional()}).superRefine((value,ctx)=>{if(value.mode==='voicePreset'&&!value.voicePreset)ctx.addIssue({code:'custom',path:['voicePreset'],message:'voicePreset mode requires the character, locales, exact transcript and source connection.'});});
export type CandidateAdoptionChoice = z.infer<typeof CandidateAdoptionChoiceSchema>;
type ReviewMedia = { path: string; candidate: Candidate; item: TaskItem; suggestedUse: string | undefined; typeData?: AssetTypeData };
export type CandidateReviewPorts = {
  projectId: string;
  choices: Record<string, CandidateAdoptionChoice>;
  findItem(candidate: Candidate): TaskItem | undefined;
  scriptSource(): CompileInput;
  bindingSource(): CompileInput;
  documents(): PlanningDocument[];
  assetNames(): string[];
  prepareMedia(input: ImportInput): Promise<{ edit: PreparedIndexEdit; assetIds: string[] }>;
  prepareAnimations?(input: { name: string; animation: import('@galcraft/contracts').NativeAnimation; assetId?: string; expectedRevision?: number; source: import('@galcraft/contracts').Asset['source'] }[]): Promise<{ edit: PreparedIndexEdit; assetIds: string[] }>;
  prepareAuthorDocument?(metadata: Json, candidate: Candidate): Promise<{ edit: EditInput; documentId: string }>;
};
/** Compute one M02 adoption group; M04 prepares media through the supplied port. */
export async function reviewProductionCandidates(candidates: Candidate[], expected: VersionRef[], ports: CandidateReviewPorts): Promise<Result<EditInput>> {

        if(Object.keys(ports.choices).some(key=>!candidates.some(candidate=>candidate.id===key)))return fail('ADOPTION_CHOICE_SCOPE', 'Adoption choices must be keyed by selected candidateId, not itemId. No changes were applied. Read selections and correct the choice keys.');
        for (const [candidateId, choice] of Object.entries(ports.choices)) if (choice.name !== undefined && !validAssetFileName(choice.name))
          return fail('ADOPTION_NAME_INVALID', `adoptions.${candidateId}.name: Expected a nonempty filename of at most 120 characters without path separators, reserved characters or trailing dots/spaces; received ${JSON.stringify(choice.name)}. No changes were applied. Correct the name and prepare adoption again.`);
        const patches: Patch[] = [],
          preparedAssets: string[] = [],
          requiredRefs: Ref[] = [],
          mediaFiles: ReviewMedia[] = [],
          allExpected = new Map(expected.map((v) => [v.ref.id, v]));
        const animations: { candidate: Candidate; item: TaskItem; value: Awaited<ReturnType<typeof animationCandidate>> }[] = [];
        const voiceChanges = new Map<string, { before: Record<string, unknown>; after: Record<string, unknown> }>();
        const voiceBindings = new Map<string, { document: ReturnType<CandidateReviewPorts['bindingSource']>['documents'][number]; statementId: string; fields: Record<string, Json>; locales: Set<string> }>();
        for (const candidate of candidates) {
          const item = ports.findItem(candidate);
          if (!item) throw new Error('The candidate task item is missing');
          if (item.creationMode === 'discuss' || item.conversation?.mode === 'discuss') throw new Error('Discussion output is for continued creation. Generate a script before adoption.');
          if (candidate.artifacts.some(artifact => artifact.kind === 'animation')) {
            animations.push({ candidate, item, value: await animationCandidate(candidate) });
            continue;
          }
          const media = candidate.artifacts.filter(
            (a) => a.role === "primary" && a.kind !== "text",
          );
          if (media.length) {
            if (item.operationSnapshot?.definition.adoption.kind === 'asset' && !item.operationSnapshot.definition.adoption.usages.includes(item.target.usage)) throw new Error(`This operation cannot be adopted for ${item.target.usage}`);
            if (media.some(artifact => artifact.kind === 'video') && ['figure', 'difference', 'voice', 'bgm', 'ui'].includes(item.target.usage)) throw new Error('Video can be used as a background or story video');
            mediaFiles.push(
              ...media.map((a) => ({ path: a.localPath, candidate, item, typeData: a.typeData, suggestedUse: a.metadata && typeof a.metadata === 'object' && !Array.isArray(a.metadata) && typeof a.metadata.suggestedUse === 'string' ? a.metadata.suggestedUse : undefined })),
            );
          } else {
            if (item.target.usage !== "script")
              throw new Error("Adopt this candidate into its production form or page composition");
            const current = ports.scriptSource(),
              document = current.documents.find(
                (d) => d.sceneId === item.target.sceneId,
              );
            if (!document) throw new Error("The source scene is missing");
            const edit = value(
              await reviewScript({
                candidate,
                current,
                documentId: document.documentId,
                beforeStatementId: item.target.statementId,
                replaceStatementIds: item.target.replaceStatementIds ?? [],
                bindings: {},
                expected,
              }),
            );
            patches.push(...edit.patches);
          }
        }
        if (animations.length) {
          if (!ports.prepareAnimations) throw new Error('The animation adoption provider is unavailable');
          const targets = animations.flatMap(entry => entry.value.request.assetId ? [entry.value.request.assetId] : []);
          if (new Set(targets).size !== targets.length) throw new Error('Only one candidate can be adopted into the same animation asset at a time');
          const prepared = await ports.prepareAnimations(animations.map(({ candidate, value: { request, animation } }) => ({ name: ports.choices[candidate.id]?.name ?? ports.bindingSource().assets.find(asset => asset.id === request.assetId)?.name ?? 'animation.gca', animation,
            ...(request.assetId ? { assetId: request.assetId, expectedRevision: request.assetRevision! } : {}), source: { kind: 'generation', description: `Production task ${candidate.taskId} / candidate ${candidate.id}`, usage: 'localReview', taskId: candidate.taskId, candidateId: candidate.id } })));
          patches.push(...prepared.edit.indexPatches); preparedAssets.push(...prepared.edit.preparedAssets); requiredRefs.push(...prepared.edit.requiredRefs); prepared.edit.expected.forEach(version => allExpected.set(version.ref.id, version));
          for (const [index, { candidate, item }] of animations.entries()) if (ports.choices[candidate.id]?.mode === 'bind') {
            const document = ports.bindingSource().documents.find(document => document.sceneId === item.target.sceneId);
            const parsed = document && parse(document), statement = parsed?.cst.find(node => node.id === item.target.statementId);
            if (!document || !parsed || !statement || !['setAnimation', 'setComplexAnimation'].includes(statement.command)) throw new Error('Select the source animation command');
            const fields = statement.object?.value as Record<string, unknown>;
            const changes = statement.command === 'setAnimation' ? [{ field: 'presetId', op: 'set' as const, value: prepared.assetIds[index]! }] : [{ field: 'resourceId', op: 'set' as const, value: prepared.assetIds[index]! }, ...['animation', 'segments'].filter(key => fields[key] != null).map(field => ({ field, op: 'inherit' as const, value: null }))];
            const edits = value(patchFields(parsed, { documentId: document.documentId, revision: document.revision, statementIds: [statement.id!], changes }));
            patches.push({ kind: 'text', documentId: document.documentId, edits: edits.map(edit => ({ start: edit.start, end: edit.end, before: edit.oldText, after: edit.text })) });
            allExpected.set(document.documentId, { ref: { kind: 'document', id: document.documentId }, revision: document.revision });
          }
        }
        if (mediaFiles.length) {
          const imported = await ports.prepareMedia({
            projectId: ports.projectId,
            files: mediaFiles.map((m) => m.path),
            fileTypeData: mediaFiles.map(media => media.typeData),
            fileAudioPlayback: mediaFiles.map(media => {
              const metadata = media.candidate.artifacts.find(artifact => artifact.localPath === media.path)?.metadata;
              if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
              return { ...(metadata.loop ? { loop: metadata.loop as { startSec: number; endSec: number; tail: 'wrap' | 'cut' } } : {}),
                ...(metadata.playbackEncoding ? { encoding: metadata.playbackEncoding as { format: 'opus'; bitrateKbps: 128 } } : {}) };
            }),
            fileSources: mediaFiles.map(({ candidate }) => ({ kind: 'generation', description: `Production task ${candidate.taskId} / candidate ${candidate.id}`, usage: 'localReview', taskId: candidate.taskId, candidateId: candidate.id })),
            fileTags: mediaFiles.map(({ suggestedUse, item }) => item.target.usage === 'ui' && suggestedUse && ['icon', 'frame', 'background', 'texture', 'logo', 'decoration'].includes(suggestedUse) ? [`ui:${suggestedUse}`] : []),
            fileNames: mediaFiles.map(({ path, candidate, item }) => {
              const documents = ports.documents();
              const records = documents.flatMap(doc => Object.entries(doc.files).filter(([path]) => path.endsWith('.json')).map(([,text]) => JSON.parse(text).data));
              const sceneName = records.find(record => record?.id === item.target.sceneId)?.name;
              const characterName = records.find(record => record?.id === item.target.characterId)?.name;
              return ports.choices[candidate.id]?.name ?? suggestedAssetName({ usage: item.target.usage, sceneName, characterName, extension: path.split('.').at(-1)! }, ports.assetNames());
            }),
            folder: [],
            conflict: "keepBoth",
            usage: null,
            targetBinding: null,
          });
          const edit = imported.edit;
          for (const [index, importedItem] of imported.assetIds.entries()) {
            const { candidate, item } = mediaFiles[index]!,
              choice = ports.choices[candidate.id];
            const authorDocument = candidate.artifacts.find(artifact => artifact.localPath === mediaFiles[index]!.path)?.metadata;
            const metadata = authorDocument && typeof authorDocument === 'object' && !Array.isArray(authorDocument) ? authorDocument.authorDocument : null;
            if (metadata) {
              if (!ports.prepareAuthorDocument) throw new Error('The author document provider is unavailable');
              const prepared = await ports.prepareAuthorDocument(metadata, candidate);
              patches.push(...prepared.edit.patches); preparedAssets.push(...prepared.edit.preparedAssets); requiredRefs.push(...prepared.edit.requiredRefs); prepared.edit.expected.forEach(version => allExpected.set(version.ref.id, version));
              for (const patch of edit.indexPatches) if (patch.kind === 'json') for (const change of patch.changes) if (Array.isArray(change.after)) {
                const author = metadata as { pluginId: string; contributionKey: string; stateVersion: number };
                for (const asset of change.after as any[]) if (asset.id === importedItem) for (const variant of asset.variants) if (variant.id === asset.activeVariantId || variant.id === asset.originalVariantId) variant.metadata = { ...variant.metadata, authorDocument: { pluginId: author.pluginId, contributionKey: author.contributionKey, stateVersion: author.stateVersion, documentId: prepared.documentId } };
              }
            }
            if (choice?.mode === 'voicePreset') {
              const selected = choice.voicePreset;
              if (item.target.usage !== 'voice' || !selected) throw new Error('Select the character and locale information for the reference voice');
              const path = `characters/${selected.characterId}.json`, document = ports.documents().find(doc => path in doc.files);
              if (!document) throw new Error('The reference voice character was removed');
              const previous = JSON.parse(document.files[path]!).data.voicePresets ?? {};
              const pending = voiceChanges.get(document.documentId) ?? { before: previous, after: structuredClone(previous) };
              if (pending.after[selected.locale] !== previous[selected.locale] && JSON.stringify(pending.after[selected.locale]) !== JSON.stringify(previous[selected.locale])) throw new Error(`Only one ${selected.locale} reference voice candidate can be adopted per character`);
              pending.after[selected.locale] = VoicePresetSchema.parse({ id: previous[selected.locale]?.id ?? createId(), revision: (previous[selected.locale]?.revision ?? 0) + 1,
                connectionId: selected.connectionId, model: selected.model, locale: selected.locale, speed: previous[selected.locale]?.speed ?? 1, emotion: previous[selected.locale]?.emotion ?? null,
                advanced: previous[selected.locale]?.advanced ?? {}, voice: { kind: 'reference', assetId: importedItem, transcript: selected.transcript, locale: selected.referenceLocale } });
              voiceChanges.set(document.documentId, pending); allExpected.set(document.documentId, { ref: { kind: 'document', id: document.documentId }, revision: document.revision });
              continue;
            }
            if (!choice || choice.mode !== "bind") continue;
            const document = ports.bindingSource().documents.find(
              (d) => d.sceneId === item.target.sceneId,
            );
            if (!document) throw new Error("Select a valid target scene");
            const parsed = parse(document),
              target = parsed.cst.find((n) => n.id === item.target.statementId);
            const assetId = importedItem,
              usage = item.target.usage;
            const visualTarget = ['figure', 'difference', 'cg'].includes(usage);
            const visualCommand = choice.use === 'illustration' || (!choice.use && !item.target.characterId) ? 'changeIllustration' : 'changeFigure';
            const targetValue = target?.object?.value;
            const targetOperation = targetValue && typeof targetValue === 'object' && 'op' in targetValue ? targetValue.op : undefined;
            const explicitReplacement = choice.placement === 'replace';
            if ((usage as string) === 'voice') {
              if (!target?.id || target.command !== 'say') throw new Error('Voice adoption requires a valid dialogue statement');
              const key = `${document.documentId}/${target.id}`, previous = voiceBindings.get(key);
              const configured = targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue) && 'voiceByLocale' in targetValue && targetValue.voiceByLocale && typeof targetValue.voiceByLocale === 'object' && !Array.isArray(targetValue.voiceByLocale) ? targetValue.voiceByLocale : {};
              const entry = previous ?? { document, statementId: target.id, fields: { voiceByLocale: structuredClone(configured) as Json }, locales: new Set<string>() };
              const locale = item.target.locale;
              if (entry.locales.has(locale ?? '')) throw new Error('Only one voice candidate can be adopted per statement and locale');
              entry.locales.add(locale ?? '');
              if (locale) { entry.fields.voiceByLocale ??= structuredClone(configured) as Json; (entry.fields.voiceByLocale as Record<string, Json>)[locale] = assetId; }
              else { entry.fields.voice = assetId; if (!previous) delete entry.fields.voiceByLocale; }
              voiceBindings.set(key, entry); allExpected.set(document.documentId, { ref: { kind: 'document', id: document.documentId }, revision: document.revision });
              continue;
            }
            if (explicitReplacement && (!target || !['changeFigure', 'changeIllustration', 'changeIllustrationDiff', 'changeBg', 'bgm', 'say'].includes(target.command)))
              throw new Error('Select the exact scene command to replace');
            const command = explicitReplacement ? target!.command :
              usage === "voice"
                ? "say"
                : usage === "bgm"
                  ? "bgm"
                  : visualTarget
                    ? visualCommand
                    : "changeBg";
            if (explicitReplacement) {
              const allowed = usage === 'voice' ? ['say'] : usage === 'bgm' ? ['bgm'] : visualTarget
                ? ['changeFigure', 'changeIllustration', 'changeIllustrationDiff'] : ['changeBg'];
              if (!allowed.includes(command)) throw new Error('The candidate usage does not match the selected replacement command');
              if (visualTarget && (!targetValue || typeof targetValue !== 'object' || !('objectId' in targetValue) || typeof targetValue.objectId !== 'string'))
                throw new Error('The selected display command lacks an explicit object identity');
            }
            const fields: Record<string, Json> =
              usage === "voice"
                ? { voice: assetId }
                : command === "changeBg"
                  ? {
                      assetId,
                      ...(choice.frame ?? (explicitReplacement ? {} :
                        item.backgroundPreview?.frame ?? {
                          fit: "cover",
                          positionX: 0.5,
                          positionY: 0.5,
                        })),
                    }
                  : { assetId };
            const bindingOperation = command === "bgm" ? "play" : "show";
            const replaces =
              choice.placement !== 'new' && target?.command === command &&
              (command === "say" || command === 'changeIllustrationDiff' ||
                (targetOperation ?? bindingOperation) ===
                  bindingOperation);
            if (explicitReplacement && !replaces) throw new Error('The selected command is not a replaceable display or playback position');
            if (explicitReplacement && visualTarget && !['changeFigure', 'changeIllustration', 'changeIllustrationDiff'].includes(command))
              throw new Error('An image difference requires an exact figure or illustration command');
            if (command === 'changeIllustrationDiff' && replaces) {
              fields.stateName = null;
            }
            if (
              command === "changeFigure" &&
              !replaces &&
              !ports.bindingSource().characters.some(
                (c) => c.id === item.target.characterId,
              )
            )
              throw new Error("Select a character or an existing figure command for figure binding");
            if (replaces) {
              const edits = value(
                patchFields(parsed, {
                  documentId: document.documentId,
                  revision: document.revision,
                  statementIds: [target!.id!],
                  changes: Object.entries(fields).map(([field, v]) => ({
                    field,
                    op: v === null && field === 'stateName' ? 'inherit' as const : 'set' as const,
                    value: v,
                  })),
                }),
              );
              patches.push({
                kind: "text",
                documentId: document.documentId,
                edits: edits.map((e) => ({
                  start: e.start,
                  end: e.end,
                  before: e.oldText,
                  after: e.text,
                })),
              });
            } else {
              if (usage === "voice") throw new Error("Voice adoption requires a dialogue statement");
              const at =
                target?.start ??
                parsed.cst.find((n) => n.command === "end")?.start ??
                document.text.length;
              const args =
                command === "changeFigure" || command === 'changeIllustration'
                  ? {
                      op: "show",
                      objectId: createId(),
                      ...(item.target.characterId
                        ? { characterId: item.target.characterId }
                        : {}),
                      ...fields,
                    }
                  : { op: bindingOperation, ...fields };
              patches.push({
                kind: "text",
                documentId: document.documentId,
                edits: [
                  {
                    start: at,
                    end: at,
                    before: "",
                    after: `${command} ${JSON.stringify(args)} @${createId()};\n`,
                  },
                ],
              });
            }
            allExpected.set(document.documentId, {
              ref: { kind: "document", id: document.documentId },
              revision: document.revision,
            });
          }
          patches.push(...edit.indexPatches);
          preparedAssets.push(...edit.preparedAssets);
          edit.expected.forEach((v) => allExpected.set(v.ref.id, v));
        }
        for (const [documentId, value] of voiceChanges) patches.push({ kind: 'json', documentId, changes: [{ path: '/data/voicePresets', op: 'set', before: value.before as Json, after: value.after as Json }] });
        for (const binding of voiceBindings.values()) {
          const edits = value(patchFields(parse(binding.document), { documentId: binding.document.documentId, revision: binding.document.revision, statementIds: [binding.statementId], changes: Object.entries(binding.fields).map(([field, value]) => ({ field, op: 'set' as const, value })) }));
          patches.push({ kind: 'text', documentId: binding.document.documentId, edits: edits.map(edit => ({ start: edit.start, end: edit.end, before: edit.oldText, after: edit.text })) });
        }
        const textPatches = new Map<string, Extract<Patch, { kind: 'text' }>['edits']>();
        for (let i = patches.length - 1; i >= 0; i--)
          if (patches[i]!.kind === "text") {
            const patch = patches.splice(i, 1)[0]!;
            if (patch.kind !== "text") continue;
            const edits = textPatches.get(patch.documentId) ?? [];
            edits.push(...patch.edits);
            textPatches.set(patch.documentId, edits);
          }
        for (const [documentId, edits] of textPatches) {
          const sorted = edits.sort((a, b) => a.start - b.start);
          if (sorted.some((e, i) => i && e.start < sorted[i - 1]!.end))
            throw new Error("Only one candidate can be adopted at a position. Adjust the selection.");
          // Adjacent field removals and insertions form one replacement. Their
          // inverse otherwise shares a position and loses the source ordering.
          const combined: typeof sorted = [];
          for (const edit of sorted) {
            const previous = combined.at(-1);
            if (previous && previous.end === edit.start) {
              previous.end = edit.end;
              previous.before += edit.before;
              previous.after += edit.after;
            } else combined.push({ ...edit });
          }
          patches.push({ kind: "text", documentId, edits: combined });
        }
        return ok({
          label: "Adopt production candidates",
          origin: "candidate",
          expected: [...allExpected.values()],
          patches,
          preparedAssets,
          requiredRefs,
        });

}
