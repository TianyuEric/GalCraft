import { PerformanceGuidance } from '@galcraft/contracts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConfigurationReadback, HarnessConfiguration, HarnessProject } from './contracts.js';

/** One official source; installers adapt only native discovery metadata. */
const skill = `---
name: galcraft-create
description: Create or revise GalCraft stories, characters, media and Player UI through the connected GalCraft MCP service, including existing production tasks, complete UI templates, authorized saves and local releases.
---

# Create with GalCraft

Start from the author's goal and existing work. Keep their language, dialogue, story facts, characters and explicit limits. Existing scripts, assets, prompts and configured services are useful starting points. A request for one avatar or page needs only that operation. Keep uncertain discussion in conversation or a production draft; agreed character facts belong in character documents and world/style/chapter notes in the project outline.

Read [creation conventions](references/creation.md), then only the relevant operation reference:

| Starting point / goal | Read |
| --- | --- |
| Create/open/connect a project, scope or an explicitly handed-off target | [Projects and collaboration](references/projects-and-collaboration.md) |
| Existing script, chapters, commands, variables or reusable scenes | [Story and structure](references/story-and-structure.md) |
| Character facts, reference image, only an avatar, differences or voice | [Characters](references/characters.md) |
| Existing pictures/recordings to import, process or bind | [Assets](references/assets.md), then the target's reference |
| Existing prompts, structured input, missing story media or Studio task | [Production](references/production.md), then [characters](references/characters.md) or [staging](references/staging.md) for binding |
| Performance, sound, weather, animation or entry media | [Staging](references/staging.md) |
| One page, reading layout, binding, CSS or UI animation | [Pages](references/pages.md) |
| Share, import, switch or manage a complete Player UI template | [Templates](references/templates.md) |
| Requested diagnostics, object save or local release | [Delivery](references/delivery.md) |
| Interrupted, uncertain, paused or conflicting work | [Recovery](references/recovery.md) |

Continue the authorized ordinary calls until the requested business result succeeds. Existing authorization for input, service, budget and adoption permits preparation, submission, waiting and adoption/binding without a new Studio confirmation for each item. Honor explicit review or pause requests. Ask only for missing material choices or expanded authorization.

Report the real endpoint: candidates, adopted/bound working content, saved objects and release artifacts are separate outcomes. accepted and an outer completed receipt do not establish asynchronous completion. Viewing images, listening, playing, screenshots and general check/preview runs are needed when the goal calls for them; they are not a routine completion gate. Handle returned blocking issues; a warning alone creates no extra task.
`;

const creation = `# Shared creation conventions

Use galcraft_guide for the current short public entry points. [Connect the exact project](projects-and-collaboration.md) before business calls. Every project call carries the returned projectId/sessionId. A mutation has a stable unique ASCII callId; retain accepted call identities for recovery. New or corrected input gets a new callId.

Discover summaries first: galcraft_capabilities, galcraft_catalog filtered by category/text and a small limit, or the domain's paged directory. Follow nextOffset only when needed. Keep default concise receipts. Read only the selected entry/action/field group's exact schema before building input. Example input for galcraft_catalog: {"category":"operations","text":"avatar","limit":5}; then {"category":"operations","key":selected.key}. Tool contracts use {"category":"tools","key":"galcraft_production","action":"prepare"}. Contract identity and field names come from the actual installed provider, including plugin definitions; this Skill is not a second schema catalog.

Read affected working documents and revisions with galcraft_context. Unsaved applied content is current work. Prefer the owning semantic operation; galcraft_edit_prepare takes {operation:{op:entry.key,...selectedFields},expected:versions} for shared author operations. Other entries may have their own wrapper: use their exact contract. Inspect result.plan/changes, then galcraft_edit_apply with {planId:plan.planId,expected:plan.expected}. Preserve unrelated fields, author language and existing identities. Resolve actual consumers before replacing/removing referenced objects. On conflict keep input, reread and prepare anew; replacing expected with a newer number alone does not resolve it.

Tools maintain IDs, paths, revisions, schema versions and exact dependencies. Use allowed null/empty values for undetermined optional associations; configured references must exist. Do not invent placeholder IDs or write asset indexes by hand. DSL/CSS drafts may remain incomplete with located diagnostics. Structured transactions must pass their owning schema before application.

Complete the requested business endpoint, then save only as authorized through [delivery](delivery.md). Use [recovery](recovery.md) for uncertain results. Ordinary creation does not require a fixed whole-project sequence or generic validation tour.
`;

const projects = `# Projects and collaboration

Use for create/open/connect, scope and explicit target handoff. Inputs are the intended project or author-selected creation parent and goal; a business session is not required for global project discovery. Use galcraft_projects summaries and its selected prepare/apply contract to create/open. Retain the returned real projectId/directory and reuse the author-selected parent for subsequent creations.

Bootstrap that exact project with galcraft_context {projectId:projectId,input:{mode:"bootstrap",projectId:projectId}}. Bootstrap is read-only and never creates or rebinds collaboration. Read galcraft_collaboration's prepareCreate contract; prepare with this projectId and returned writeSessionId, then apply its real reviewed plan and author decision. Carry the returned projectId/sessionId on every business and capability call. A decision represents actual user instructions, never invented approval. Several clients may share the active round; the author chooses among several unfinished historical rounds.

Default currentProject scope covers available project capabilities; maxGenerations:null adds no extra limit. Restricted scopes/numeric limits remain effective. Expand scope through prepareScope/apply using existing or newly obtained authorization. A reopened/switched project needs an explicit current connection; old bindings retain their historical meaning.

For “the currently selected button”, use the author's explicit Studio handoff, then galcraft_context input:{mode:"target"}. The handed-off identity/version stays fixed when Studio later selects something else. Missing target requires selecting/handing off the intended object; stale target requires rereading before a plan. Do not infer a target from mouse, scrolling or unsent form text.

Read galcraft_context mode:environment for installed/enabled/missing plugin and capture readiness. Plugin installation/activation/version changes and connection, recipe and workflow library management use Studio's existing interfaces. Personal credentials and complete personal configurations stay private. Template library writes are the explicitly supported exception described in [templates](templates.md).

Endpoint: the requested project, active collaboration/scope or fixed target is established. This does not save project edits. On stale binding, ambiguity or pause use [recovery](recovery.md).
`;

const story = `# Story and structure

Use for existing scripts, chapter/scene organization, individual commands, variables and reusable scenes. Preserve supplied dialogue, narration and plot unless rewriting was authorized; format normalization, scene splitting and necessary performance arrangement can preserve the source. Missing media can be added later through [production](production.md), without regenerating the script.

Read affected documents/revisions with galcraft_context and discover matching operations or command definitions in galcraft_catalog. Request the selected exact entry. For example, after discovering chapter.create, prepare input is {operation:{op:"chapter.create",name:authorName},expected:projectVersions}. Apply its returned plan through the [shared conventions](creation.md). Commands use their actual selected schema and stable statement/scene IDs; do not reconstruct full documents for a small semantic edit.

Independent operations include create/rename/reorder/move/copy/remove chapter or scene, choose the project start, insert/update/copy/remove/reorder/move commands, declare/update variables and configure scene parameters/locals/returns. Directory order does not rewrite control flow. Renaming/moving keeps identity. Copies rebuild internal identities and internal jumps while retaining external character/asset references. Before deletion/replacement inspect actual consumers and supply an authorized disposition; a nonempty chapter needs scene destinations.

Empty chapters/scenes and unconfigured optional routes are legal. Numbers, booleans and text have real initial values. Progress variables follow saves; advanced longTerm variables survive new runs and loading older saves, separately from read/ending/gallery sets. Changing a referenced variable's type/scope uses a new variable and explicit replacement.

Reusable scenes can simply call/return, or use parameters, local frame variables and typed returns. A legal declared default permits omission, including 0, false and empty strings. Without a default the caller must pass the parameter. Legacy required flags do not change this rule: required:true with a default permits omission; required:false without a default still requires an argument. Declaration changes can leave located DSL call diagnostics for later editing; do not silently rewrite every caller.

Endpoint: the requested working-copy transaction succeeds; check/play only if requested or needed to resolve a returned issue. Save authorized objects separately. Conflicts retain original input and follow [recovery](recovery.md).
`;

const characters = `# Characters and voice

Use for agreed character facts, references, groups, differences, one avatar, default effects, voice or optional routes/afterstories. Read only the character, relevant project language configuration and target asset identities/versions. Discover character operations and selected contracts in galcraft_catalog. Avatar-only changes must preserve description, differences, voice and other configuration.

Example: after selecting character.update's exact schema, prepare {operation:{op:"character.update",id:character.id,changes:{avatar:chosenReference}},expected:characterVersions}; chosenReference comes from that schema and galcraft_assets, not a guessed URI. Apply the returned plan. Import author-supplied pictures/recordings using [assets](assets.md); chat attachments become project facts only through import/adoption and association. Reference artwork is optional when the author has supplied enough text or authorized design.

Store agreed description and appearance notes in the character document; named groups organize costume/pose assets. Shared differences synchronize stage and reading avatar; initial difference is stable. Default avatars for offstage speakers, difference avatars, stage crops and per-line overrides are distinct supported choices. Optional empty associations use legal null values. Resource canvas/crop metadata and bottom-centre positioning supply geometry.

Default effects supply new figure appearances; an individual appearance overrides only specified fields. Common changes are position, scale, opacity and layer, with advanced filters/blending read as needed.

Default voice participation controls batch selection: ordinary characters start included, viewpoint characters start excluded. Manual selection and adopted audio remain usable. Project voice-language identity selects the corresponding preset; the provider maps service language codes. Keep target language, reference-recording language, reference transcript and actual spoken text distinct. Use only real model/voice parameters. [Production](production.md) reads established text and selected reference assets by default; real media references must reach compatible input ports.

Routes and ordinary afterstories are optional; their scene/ending organization does not replace story control flow. Card framing/order and lock presentation remain available. Endpoint: requested configuration or adoption/binding succeeds. Voice is not a release prerequisite; audition is goal-dependent. Save only as authorized; resolve conflicts via [recovery](recovery.md).
`;

const assets = `# Assets and resource processing

Use for author-supplied files, lookup/rename, versions/variants, reference-aware replacement, plugin type data or processing an existing resource. Inputs are explicit local paths or discovered asset/variant identities; infer only nonmaterial labels. Read galcraft_assets query with filters and paging before get; get only selected objects. Example import input: {action:"import",paths:authorPaths}. Keep successful items; fix/retry failed items individually. An explicit MCP path does not change the author's file-picker directory preference.

For binding use exact current or pinned variant identities from the picker/query and the target's semantic operation in [characters](characters.md), [staging](staging.md) or [pages](pages.md). Renaming preserves identity and suffix. Read references before replacing/removing; prepareVariantSwitch/applyVariantSwitch use returned expected revisions and actual affected consumers. Floating references follow current variants while pinned references keep their version.

For plugin data list types, then typeContract for the selected kind/typeVersion/provider. Submit editTypeData with the owning typeData schema, selected assetId/variantId and expectedRevision. Missing plugins keep content and report the exact missing capability; do not substitute types/providers.

For processing list processors, read processorContract for its processorKey/packageVersion, then processResource with assetId, sourceVariantId, expectedRevision and schema-valid settings. Read resourceCandidates summaries or selected resourceCandidate only as needed. confirmResource adopts the prepared candidate; discardResource removes the unwanted candidate; cancelResource follows that processor's actual cancellation capability. This is processing, not a fresh generation request. Original resources and pinned versions remain intact. A changed source requires a new valid plan.

The endpoint is the requested import/change/processing candidate or confirmed derived version, and binding when requested. A ready model or accepted operation alone is insufficient. View actual image/audio via galcraft_media only when the goal needs observation; metadata does not establish observed quality. Save affected objects as authorized and use [recovery](recovery.md) for conflicts/uncertainty.
`;

const production = `# Direct production, candidates and continuation

Use for supplied prompts/structured input, missing media, plugin production or existing Studio/other-session drafts, tasks and candidates within project scope. The normal path uses usable input and an already configured compatible connection/model/workflow. Recipe selection, prompt generation and text-model preparation are optional. Do not add a text-model request when usable input already exists.

Discover operation summaries in galcraft_catalog, read the selected operation schema, and read capabilities for actual connections/models/workflows. inspectConnection checks the selected connection's real capability; setup presets do not prove a service/model exists. Use defaults for the selected usage/operation when appropriate. Missing environment configuration goes to Studio Connections and tools; do not create connections or maintain recipe/workflow libraries through invented MCP writes.

Minimal prepare shape: {action:"prepare",operation:selected.key,connectionId:connection.id,fields:validatedInput}. Add model/workflowId, target and sourceVersions only as required by that exact contract and goal. references:[{assetId,variantId,port}] carries real media from M04 to supported ports. Preserve agreed character text and selected references; an asset ID embedded in prose is not an image attachment. Read the actual sendSummary and issues; prepare freezes input/configuration/references without sending.

Explicit parameterOverrides win, then explicit direct fields, applicable recipe/parameter defaults and operation defaults. Auto-filled values do not become author overrides. A changed score is preserved as a whole; replacing it or restoring default following is explicit. Read defaults/frozen for effective values and sources only when needed.

For an existing complete music score use the music plugin's render operation and the actual local-render connection. For writing from a description use writeScore with the configured text connection. Style, recipe, initial score and full instruments are optional. Discover real soundbanks/instruments through the installed plugin catalog and read only the selected exact operation/field group, including its referenced definitions. Supply a real selected soundbank when no reference or recipe supplies one; missing/unreadable soundbanks require their actual dependency. Never assume an example bank is installed. Recipe identities and writing styles are separate identities; an unknown style needs correction to a listed style or omission.

Keep reference music separate from explicit constraints. Declare only requested fixed BPM, meter, body bars/body seconds/finished seconds, allowed error, loop and actual required/allowed/excluded instrument identities through the exact music contract. Body duration excludes trailing release; finished duration follows actual loop/render treatment. All tempo points must honor fixed BPM, and required instruments need sounding notes. A reference score or a changed title does not lock its duration, speed or instrumentation.

A received complete score that violates declared constraints is a known business failure. Keep the original text/input and located diagnostics; correct the score and use reprocess on the original task/item locally without an extra model request. If a new writing request is necessary, include the concrete deviation, use existing authorized scope/budget and count the actual extra send. Ask only when that authorization is insufficient.

For a configured workflow, discover the usable entry and its exact selected operation contract. Media ports and nested fields belong to that contract; keep unavailable plugin identities and diagnose the dependency. Personal workflow drafts, import/replacement, connections and usable-library updates remain Studio operations. Local validity, connection checks and actual output history are distinct facts; using a locally valid binding needs no extra trial generation. Standard image/audio references use the configured HTTP upload; explicit shared paths follow the real node contract and frozen connection mapping.

With authorization covering target, input, configuration, request allowance and adoption, continue ordinary calls: submit {action:"submit",planId:prepared.planId}; tasks/wait on the original taskId; then select/prepareAdoption/adopt when requested. Do not wait for a Studio window or a separate author confirmation at each stage. wait is bounded (up to 30000 ms); running means wait/query again, not submit again. accepted and an outer completed result only describe the call. Inspect item state and candidateIds, then selected candidate metadata/checks (candidate with a small text limit) to establish complete, nonpartial output and handle blocking diagnostics. Expand content only as needed.

“Only candidates” ends at completed requested candidates. “Use for this character/scene/page” continues through the actual adoption and binding transaction. prepareAdoption uses selections [{itemId,candidateId}], current expected versions and any schema-required adoptions keyed by candidateId. adopt uses that returned planId/expected. Selecting alone is not adoption. Read candidate text or galcraft_media only as needed for choosing, fixing or explicitly inspecting the output. Do not impose per-image viewing, per-line audition, screenshots, generic checks or additional manual review.

For existing work, drafts/tasks are paged summaries. draft reads one record; saveDraft uses its actual expectedRevision; prepareDraft freezes it. frozen exposes recorded nonsecret input, parameters, references and exact configuration; unrecorded values remain unknown. keepResults accepts changed-source versions without replacing remote work. transferPrompt, planContinuation/submitContinuation and resume use the selected exact action contracts and original identities. New requested continuation sends are distinct from query/refetch recovery. Preserve provenance, remote IDs, attempts and actual send counts.

Endpoint: requested candidates or adopted/bound working content, followed by separately authorized save. Preserve unrelated content and existing successful outputs; [recovery](recovery.md) handles pause, disconnect or unknown history.
`;

const staging = `# Performance and stage media

Use for backgrounds, figures/framing, illustration states, voice/music/effects, weather, animations and startup/chapter/scene entry media. Inputs may already be project assets or supplied scripts; generate only missing requested media through [production](production.md). Read the selected scene commands, target object and referenced asset versions; catalog the relevant command/preset/plugin operation, then read that exact schema before constructing an edit.

A small discovery input is {category:"commands",text:goalTerm,limit:5}. The selected definition supplies real field names and reference kinds. Prepare/apply the owning author operation under [creation conventions](creation.md). Use existing stage object identities for later changes; an initial appearance and an update to an existing instance have different effects. Distinguish character identity from the actual stage instance, especially when several copies appear.

Use named presets for ordinary transitions and animations. Advanced timelines, composite animations, camera movement, weather and four-part entry transitions are available when the goal needs them. Character defaults apply at new appearance and the single appearance overrides specified fields. Positioning uses resource original canvas/crop offsets and a bottom-centre anchor. Keep original media and explicit older transition choices.

Startup splash, title/home media, chapter/scene entry and story video have separate triggers. Restoring a save resumes the story without replaying entry media. Media bindings use actual M04 identities/versions; adopting audio or imagery alone does not establish a scene binding. Gallery unlocks, story flow and route organization stay in their owning domains.

Endpoint: requested configuration, command transaction or adopted/bound media succeeds. Playback, screenshots and playtests are available for a requested effect diagnosis or review, not obligatory after every change. If a required provider/asset is missing retain content and report its exact reason. Save authorized objects and use [recovery](recovery.md) for stale plans or interrupted tasks.

${PerformanceGuidance.principles}

${PerformanceGuidance.shortScene}
`;

const pages = `# Pages, bindings and styles

Use component.text for one selected component's text in the current Player menu language; text:null restores that language's default. Read the exact operation contract and preserve the other components and languages.

Use for one page/component, reading layout, interaction, binding, CSS/SCSS or UI animation. A page-only request preserves story, characters, production and unrelated UI. Start with galcraft_pages read summaries; select pageId/componentId/styleId for details and versions. For an explicitly handed-off Studio object use [target handoff](projects-and-collaboration.md).

Get the selected page operation via {action:"catalog",part:"page",operationKinds:[selectedKind],fieldGroup:selectedGroup}; style edits use part:"style". Available operation kinds come from the current tool/operation contract, not a guessed key. prepare takes {action:"prepare",request:selectedRequest}. compileStyle prepares schema-valid style changes; apply uses result.plan.planId/result.plan.expected. The smaller component.setProperties operation has its own exact catalog wrapper. Read plugin component props from the installed exact provider schema.

galcraft_pages {action:"bindings",pageId:page.id} describes real binding paths, value types, access and scopes. It does not expose player-private records. Bind variables by stable identity and actual progress/local/longTerm scope; local declarations belong to their scene/frame. Zero, false and empty string are valid values, not missing-value substitutes. Map or explicitly clear unsupported project-specific references.

Read only affected groups for layout/appearance/content/binding/interaction/identity. Preserve component and interaction identities on small edits. Shared styles/animations affect actual consumers; a local change may need an independent definition. Keep author CSS/SCSS source and unapplied inputs; invalid source retains located diagnostics and the last valid result. Apply changes through M08 transactions rather than editing release output.

For generated UI composition use galcraft_ui_composition's exact plan/adoption contracts and real config/style/asset closure. Observation is goal-dependent. For requested runtime variable/style diagnosis use galcraft_preview action:observe on the specified scope/property; unknown provenance remains unknown. Emergency UI belongs to M08, overlays normal/modal/video/startup content immediately, and provides no story/save/load actions. F8 is the default with author default/player override; restore preserves earlier pause reasons and leaves auto/skip off.

Endpoint: requested page/style/adoption transaction succeeds. No routine capture or full navigation tour follows. Save authorized objects separately, follow [templates](templates.md) for a full switch and [recovery](recovery.md) for conflict.
`;

const templates = `# Complete Player UI templates

Use for sharing/importing a .galtemplate, switching the whole Player UI, hiding/restoring a legacy page or explicitly managing the local library. A local layout/color edit belongs in [pages](pages.md). Read galcraft_pages catalog part:templateLibrary or part:templateSwitch for the selected request schema. Minimal list: {action:"templateLibrary",request:{action:"list"}}. Page read summaries expose current adopted/source and hidden-page information; fetch full details only when needed.

Library operations follow the exact listed contract: official templates can be copied under a user identity; user packages can be updated, renamed or removed. Same-version import offers the real keep/replace/copy choice. A read, ordinary production goal or switch does not authorize unrelated library cleanup. Removing a source library package leaves already adopted project UI usable; project backup/restore carries its source and mappings.

Export uses the current applied working copy, including unsaved edits, and does not automatically save the project. Unapplied form input stays outside the package. Source and effective CSS must match that exported revision; inconsistency blocks export. Include UI configuration, author text, style source/effective CSS, dictionaries, animations, exact referenced assets/variants and dependencies. Examples are opt-in. Story, character records, tasks, player data and personal service secrets stay outside the default package. Single-page snippets are outside this workflow.

Imported packages can remain in the library with missing-plugin diagnostics; resolve blocking dependencies before application. Map project-specific bindings to real compatible target IDs/scopes or explicitly unbind. Do not copy a character merely to satisfy a template variable binding.

templatePlan compares the real adopted source, current project and incoming source across all Player pages/components/layout/styles/interactions/animations/dictionaries. Unchanged fields follow incoming defaults; author changes stay by default. Resolve actual both-sides conflicts under existing authorization, using whole-page keep/take when useful. Keep author-added content and its reachable association closure. Preserve CSS/SCSS source with explicit enabled/disabled choice. Old official-only pages may be hidden with complete recoverable configuration and resolved consumers; use restoreTemplatePage and apply to restore later. Required entry points stay valid.

Missing source baseline requires conservative explicit keep/replace choices, not fabricated three-way results. Unresolved blocking conflicts or vulnerable unapplied structural drafts prevent application. Apply the returned plan with expected versions once; it is one undoable M02 group. The new baseline records the incoming source, not the merged author result; ordinary save does not redefine it. Copies/backups retain source and remap project identities.

Endpoint: requested library action/export or template application/restoration succeeds. View merge details/preview only as needed. Save adopted project changes as authorized; export alone adds no save. See [recovery](recovery.md) for conflicts and missing dependencies.
`;

const delivery = `# Requested checks, saving and local delivery

Use when the goal includes diagnostics, observation, object saving, undo/redo or a release artifact. Read the exact selected tool/action contract and current identities/versions first. Ordinary editing and production finish at their requested business endpoints; do not automatically append check, preview, capture, audition or release.

galcraft_check and relevant preview entry points diagnose the requested scope. For an actual visual/audio judgment use supported client readers on real returned media; metadata alone does not establish quality. galcraft_preview observe reports selected runtime variable values/scopes or computed UI properties/provenance in isolated author preview; it reports unknown sources honestly. Missing capture browser does not prevent nonbrowser editing, saving or compilation. Read environment readiness; reuse an explicitly configured or detected supported browser and use its preparation entry only with authorization.

For an authorized save use galcraft_save plan for the requested objects, read necessary associated changes and then save the current plan. Unselected unrelated objects remain dirty. Applied working content, personal production drafts and formal disk saves are different facts. Undo/redo use galcraft_history's original operation and reviewed plan; another author's/round's changes require Studio review under existing history rules.

For a local release, choose whether to save authorized current changes or use an existing saved snapshot. Read galcraft_release targets, selected targetContract and signingOptions; use actual installed target/configuration identities. Prepare/check/build against that saved snapshot and query the original build until its actual result. Input example for target discovery is {action:"targets"}; selected action contracts define the rest. Report actual output paths and signing mode.

Windows uses an available author identity or a permitted unsigned mode. Vendor/test identities are blocked for author releases; no private key/password is returned. Signing the entry executable does not claim all content is signed or publicly trusted. Android project export yields an Android Studio project without requiring SDK/JDK or running Gradle and excludes local signing/tool paths. APK/AAB artifacts use the actual toolchain and chosen signing: APK supports tests, AAB defaults to author release signing with an explicit local-test exception. Project export is available without a release key. A test-signed artifact is reported as such.

Endpoint: the requested check, save or actual local artifact succeeds. External publication requires its own authorization. Preserve unsaved unrelated work and recover uncertain outcomes through [recovery](recovery.md).
`;

const recovery = `# Recovery without replacing existing work

Use after disconnect, uncertain acceptance, version conflict, missing providers, pause, cancellation or unknown remote history. Retain projectId/sessionId/callId, original plan/task/item/candidate IDs and authored inputs. Query galcraft_call using the accepted original sessionId/callId before considering another mutation. For global project/collaboration controls use galcraft_control_call. Repeating the identical accepted input retrieves its receipt; changed input needs a new callId.

Read concise status and selected details. Input rejection before acceptance submits no task; correct the reported field/session/scope. Accepted failed/uncertain calls require their original receipt. Running tasks use production wait/query; queries, waits and refetch never resubmit generation or add a generation count. Use the action-specific exact contract for refetch/resume/cancel and inspect task/item capability/remote state before choosing. Local cancellation and confirmed remote cancellation are separate facts.

Version conflicts retain input and actual original basis. Reread affected working documents and prepare a corrected plan. Preserve another actor's independent field edits; same-field conflicts need a real choice. A structural change that would destroy unapplied form input must wait for that input's disposition. Do not auto-submit/discard drafts or copy the latest expected number onto an obsolete plan.

Pause stops new edits, adoption and actual generation sends; existing tasks and remote outputs remain queryable. Rebinding preserves pause, scope, frozen configuration, remote IDs, attempts and sentRequests. After reopen/switch, explicitly connect to obtain current sessionId. Read-only discovery never creates/rebinds a round. Ended tasks keep their original remote query/refetch identity; unsent stages need current authorization to continue. Removing collaboration details does not remove project transactions or production tasks/frozen inputs.

Use [production continuation](production.md) on existing Studio/other-session work when authorized; distinguish original query/refetch from a genuinely new generation/continuation send. If remote state is unknown with no output, retain that identity and report unavailable history. Repeated queries cannot reconstruct missing remote history; a replacement request needs authorization and is never described as recovery success.

Read environment/diagnostics for missing plugins, service configuration or browser. Keep content and identify the actual dependency. Studio owns configuration changes; nonbrowser capabilities remain available when capture is not ready. galcraft_context mode:statistics supplies paged call states and actual sends for a requested diagnosis; transport failures, accepted business failures, waits and sends are distinct counts.

Use the actual Web/MCP URL displayed by Studio or the CLI; automatic port fallback can change it. Repair a saved client URL through the existing Studio configuration preview/merge/apply entry or copy guidance, preserving unrelated configuration. Existing update authorization remains effective; reload the client when required. Failed startup does not establish a new URL. Studio editing/saving remains available during MCP startup failure; use its persistent service diagnosis and retry after correcting the cause.

Endpoint: original work is recovered/queryable, a corrected authorized operation succeeds, or a precise unresolved blocker is reported without duplicate sends. Save restored/adopted project changes only as authorized.
`;

export function creativeSkillFiles(harness: HarnessConfiguration['harness'], project?: HarnessProject): Record<string, string> {
  const context = project ? `\n# Project connection\n\nTarget projectId: ${project.projectId}\nProject directory: ${project.projectRoot}\nLast observed writeSessionId: ${project.writeSessionId}\n\nBootstrap this exact project and explicitly connect before business calls. Keep its returned projectId/sessionId; reacquire after reopen or a new round.\n` : '';
  const files: Record<string, string> = {
    'SKILL.md': skill + context,
    'references/creation.md': creation,
    'references/projects-and-collaboration.md': projects,
    'references/story-and-structure.md': story,
    'references/characters.md': characters,
    'references/assets.md': assets,
    'references/production.md': production,
    'references/staging.md': staging,
    'references/pages.md': pages,
    'references/templates.md': templates,
    'references/delivery.md': delivery,
    'references/recovery.md': recovery,
  };
  if (harness === 'codex') files['agents/openai.yaml'] = 'interface:\n  display_name: "Create with GalCraft"\n  short_description: "Create stories and media with GalCraft tools"\n  default_prompt: "Use $galcraft-create to continue this GalCraft project through the authorized creative work."\npolicy:\n  allow_implicit_invocation: true\n';
  if (harness === 'claude') files['SKILL.md'] = files['SKILL.md']!.replace('---\n\n# Create', 'user-invocable: true\n---\n\n# Create');
  if (harness === 'dsh') files['SKILL.md'] = files['SKILL.md']!.replace('---\n\n# Create', 'user-invocable: true\nmetadata:\n  version: "0.1.0"\n---\n\n# Create');
  return files;
}

async function text(path: string) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

/** Compare actual files with the previously installed source; edited files stay intact. */
export async function previewSkillFiles(root: string, files: Record<string, string>) {
  const manifestPath = join(root, '.galcraft-installed.json'), manifest = await text(manifestPath);
  const previous = manifest ? JSON.parse(manifest) as Record<string, string> : {};
  const changes: NonNullable<HarnessConfiguration['changes']> = [], guidance: string[] = [];
  const states:ConfigurationReadback['files']=[];
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name), existing = await text(path);
    if (existing === content) {states.push({path,state:'current'});continue;}
    if (existing !== null && existing !== previous[name]) {
      const updatePath = `${path}.galcraft-update`, update = await text(updatePath);
      states.push({path,state:'localEdits',update:{path:updatePath,pending:update!==null,existing:update,localContent:existing,content}});
      if(update!==content)changes.push({ path: updatePath, existing: update, content });
      guidance.push(`Kept your edited file: ${path}. Review the official update at ${updatePath}.`);
    } else {states.push({path,state:existing===null?'notInstalled':'updateAvailable'});changes.push({ path, existing, content });}
  }
  const nextManifest=JSON.stringify(files,null,2)+'\n';
  if(manifest!==nextManifest)changes.push({ path: manifestPath, existing: manifest, content: nextManifest });
  const state=states.every(file=>file.state==='notInstalled')?'notInstalled':states.some(file=>file.state==='localEdits')?'localEdits':states.some(file=>file.state!=='current')?'updateAvailable':'current';
  return { changes, guidance,readback:{state,files:states} satisfies ConfigurationReadback };
}
