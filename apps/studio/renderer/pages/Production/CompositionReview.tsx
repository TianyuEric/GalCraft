import { useEffect, useRef, useState } from "react";
import type { UIComposition, PreviewStyleMatch } from "@galcraft/templates";
import { compositionClosure, resolvePreviewStyleMatches } from "@galcraft/templates";
import type { AuthoringServices } from "../../authoring/controller.js";
import { openPlayerPreview } from "../../authoring/player-preview.js";
import { pagePreviewSample } from "../../authoring/page-preview-sample.js";
import { Button, Choice, Field } from "../../components/controls.js";
import type { ProductionSession } from "./session.js";
import { unwrap } from "./bridge.js";
import { tr } from "./Production.js";

export function CompositionReview({
  composition: initial,
  session: s,
  locale,
  services,
  adopt,
}: {
  composition: UIComposition;
  session: ProductionSession;
  locale: string;
  services: AuthoringServices;
  adopt(plan: import("@galcraft/contracts").EditPlan): void;
}) {
  const t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja);
  const [composition, setComposition] = useState(initial),
    [keys, setKeys] = useState(
      [
        ...initial.proposal.config,
        ...initial.proposal.styles,
        ...initial.proposal.assets,
      ].map((c) => c.key),
    );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [choices, setChoices] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<
    Record<
      string,
      (import("@galcraft/assets").UIReplacementRef & { label: string })[]
    >
  >({});
  const [replaceModes, setReplaceModes] = useState<
    Record<string, "none" | "selected" | "all">
  >({});
  const [selectedRefs, setSelectedRefs] = useState<Record<string, number[]>>(
    {},
  );
  const [sourceVariants, setSourceVariants] = useState<Record<string, string>>(
    {},
  );
  const surface = useRef<HTMLDivElement>(null),
    player = useRef<Awaited<ReturnType<typeof openPlayerPreview>> | null>(null);
  useEffect(() => () => player.current?.dispose(), []);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    const saved = unwrap(
      await s.bridge.production.saveComposition(composition),
    );
    setComposition(saved);
    return saved;
  };
  const previewSelection = async (saved: UIComposition) => {
    const input = { id: saved.id, revision: saved.revision, keys,
      substitutions: Object.fromEntries(Object.entries(choices).filter(([, value]) => value !== 'new' && !value.startsWith('variant:'))) };
    const result = unwrap(await s.bridge.production.previewComposition(input));
    const compiled = await services.compilePreview?.();
    if (!compiled?.ok || !compiled.value.snapshot) throw new Error(t('需要有效剧情快照', 'A valid story snapshot is required', '有効なシナリオが必要です'));
    if (!surface.current) throw new Error(t('候选预览界面尚未就绪', 'Candidate preview is not mounted', '候補プレビューの準備ができていません'));
    const pageId = saved.proposal.config.find(change => keys.includes(change.key))?.pageId ??
      saved.proposal.styles.find(change => keys.includes(change.key))?.scope.pageId ??
      s.task?.items.find(item => item.candidateIds.includes(saved.candidateId))?.target.uiScope?.pageIds[0];
    const pageIds = [...new Set([...result.unresolvedStyleMatches.map(request => request.pageId), ...(pageId ? [pageId] : [])])];
    // Keep the author's selected page visible after checking every participating page.
    if (pageId) pageIds.sort((left, right) => left === pageId ? 1 : right === pageId ? -1 : 0);
    const matches: PreviewStyleMatch[] = [];
    for (const id of pageIds) {
      const page = result.template.pages.find(page => page.id === id);
      if (!page) throw new Error('目标预览页面不存在');
      const snapshot = pagePreviewSample(compiled.value.snapshot, result.template, page.key, 'normal');
      snapshot.assets.push(...result.previewAssets);
      player.current?.dispose(); player.current = null;
      const mount = document.createElement('div');
      Object.assign(mount.style, { position: 'absolute', inset: '0' });
      surface.current.style.aspectRatio = `${snapshot.project.canvas.width}/${snapshot.project.canvas.height}`;
      surface.current.replaceChildren(mount);
      player.current = await openPlayerPreview(mount, services, snapshot, 'candidate', result.styles, result.template.styles.map(style => style.id), result.locations);
      if (['story', 'choice', 'input', 'history', 'save', 'load'].includes(page.key)) await player.current.view.newGame();
      player.current.view.navigation.replace(page.key);
      for (const request of result.unresolvedStyleMatches.filter(request => request.pageId === id)) matches.push({ ...request, targets: resolvePreviewStyleMatches(mount, request) });
    }
    const reviewed = result.unresolvedStyleMatches.length ? unwrap(await s.bridge.production.previewComposition({ ...input, previewId: result.previewId, matches })) : result;
    setComposition({ ...saved, propertyOwners: reviewed.propertyOwners });
    setPreview(true);
    return reviewed.previewId;
  };
  const availableImages = s.data.imageCandidates ?? s.data.candidates.map(({ candidate }) => candidate);
  const imageCandidates = availableImages.flatMap(candidate =>
    candidate.artifacts
      .map((artifact, artifactIndex) => ({
        candidate,
        artifact,
        artifactIndex,
      }))
      .filter(
        (a) => a.artifact.kind === "image" && a.artifact.role === "primary",
      ),
  );
  return (
    <div>
      <p>{composition.proposal.summary}</p>
      {[
        ...composition.proposal.config,
        ...composition.proposal.styles,
        ...composition.proposal.assets,
      ].map((c) => (
        <label className="check-row" key={c.key}>
          <input
            type="checkbox"
            checked={keys.includes(c.key)}
            onChange={(e) => {
              setKeys(
                e.target.checked
                  ? [...keys, c.key]
                  : keys.filter((k) => k !== c.key),
              );
              setPreview(false);
            }}
          />
          {c.key}
          {"path" in c && <small>{c.path}</small>}
          {"name" in c && <small>{c.name}</small>}
        </label>
      ))}
      <Button
        onClick={() => {
          try {
            setKeys(compositionClosure(composition, keys, []));
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        {t("补齐依赖选区", "Include dependencies", "依存項目を含める")}
      </Button>
      {composition.proposal.assets
        .filter((a) => a.source.kind === "candidate" && keys.includes(a.key))
        .map((a) => (
          <section className="plan-step-editor" key={a.key}>
            <h3>{a.key}</h3>
            <Field label={t("采用方式", "Adoption", "採用方法")}>
              <Choice
                label="Asset adoption"
                value={choices[a.key] ?? "new"}
                options={[
                  {
                    value: "new",
                    label: t(
                      "作为独立素材入库",
                      "Add independent asset",
                      "独立素材として追加",
                    ),
                  },
                  ...s.data.assets
                    .filter((a) => a.kind === "image")
                    .map((asset) => ({
                      value: `variant:${asset.id}`,
                      label:
                        t(
                          "追加版本：",
                          "Append variant: ",
                          "バージョンを追加：",
                        ) + asset.name,
                    })),
                  ...s.data.assets
                    .filter((a) => a.kind === "image")
                    .map((asset) => ({
                      value: asset.id,
                      label:
                        t("替代为：", "Use existing: ", "既存素材：") +
                        asset.name,
                    })),
                ]}
                onChange={(value) => {
                  setChoices({ ...choices, [a.key]: value });
                  setPreview(false);
                  if (value.startsWith("variant:"))
                    void run(async () => {
                      setReferences({
                        ...references,
                        [a.key]: unwrap(
                          await s.bridge.production.assetReferences(
                            value.slice(8),
                          ),
                        ),
                      });
                    });
                }}
              />
            </Field>
            {choices[a.key]?.startsWith("variant:") && (
              <>
                <Field label={t("源版本", "Source variant", "元のバージョン")}>
                  <Choice
                    label="Source variant"
                    value={
                      sourceVariants[a.key] ??
                      s.data.assets.find(
                        (asset) => asset.id === choices[a.key].slice(8),
                      )!.activeVariantId
                    }
                    options={s.data.assets
                      .find((asset) => asset.id === choices[a.key].slice(8))!
                      .variants.map((v, i) => ({
                        value: v.id,
                        label: `${i + 1} · ${v.entry}`,
                      }))}
                    onChange={(id) => {
                      setSourceVariants({ ...sourceVariants, [a.key]: id });
                      setPreview(false);
                    }}
                  />
                </Field>
                <Field
                  label={t(
                    "引用替换范围",
                    "Replace references",
                    "参照の置換範囲",
                  )}
                >
                  <Choice
                    label="Replacement scope"
                    value={replaceModes[a.key] ?? "none"}
                    options={[
                      {
                        value: "none",
                        label: t(
                          "仅追加，不替换现有引用",
                          "Append only; keep existing references",
                          "追加のみ、既存参照を維持",
                        ),
                      },
                      {
                        value: "selected",
                        label: t(
                          "选定的精确版本引用",
                          "Selected pinned references",
                          "選択した固定バージョン参照",
                        ),
                      },
                      {
                        value: "all",
                        label: t(
                          "全部引用并更新活动版本",
                          "All references and active variant",
                          "すべての参照とアクティブ版",
                        ),
                      },
                    ]}
                    onChange={(mode) => {
                      setReplaceModes({
                        ...replaceModes,
                        [a.key]: mode as "none" | "selected" | "all",
                      });
                      setPreview(false);
                    }}
                  />
                </Field>
                {(references[a.key] ?? []).map((ref, index) => (
                  <label className="check-row" key={index}>
                    <input
                      type="checkbox"
                      disabled={
                        replaceModes[a.key] !== "selected" ||
                        ref.variantId === null
                      }
                      checked={
                        replaceModes[a.key] === "all" ||
                        (replaceModes[a.key] === "selected" &&
                          (selectedRefs[a.key] ?? []).includes(index))
                      }
                      onChange={(e) => {
                        setSelectedRefs({
                          ...selectedRefs,
                          [a.key]: e.target.checked
                            ? [...(selectedRefs[a.key] ?? []), index]
                            : (selectedRefs[a.key] ?? []).filter(
                                (i) => i !== index,
                              ),
                        });
                        setPreview(false);
                      }}
                    />
                    <span>
                      {ref.label}
                      <small>
                        {ref.variantId
                          ? t("精确版本", "Pinned variant", "固定版")
                          : t(
                              "跟随活动版本",
                              "Follows active variant",
                              "アクティブ版に追従",
                            )}
                      </small>
                    </span>
                  </label>
                ))}
              </>
            )}
            {(!choices[a.key] ||
              choices[a.key] === "new" ||
              choices[a.key].startsWith("variant:")) && (
              <Field label={t("图像候选", "Image candidate", "画像候補")}>
                <Choice
                  label="Image candidate"
                  value={(() => {
                    const r = composition.resources.find(
                      (r) => r.key === a.key,
                    );
                    return r ? `${r.candidateId}/${r.artifactIndex}` : "";
                  })()}
                  options={[
                    {
                      value: "",
                      label: t("选择候选", "Choose candidate", "候補を選択"),
                    },
                    ...imageCandidates.map(
                      ({ candidate: c, artifactIndex }) => ({
                        value: `${c.id}/${artifactIndex}`,
                        label: `${c.provenance.connectionName} · ${c.id.slice(0, 8)} · ${artifactIndex + 1}`,
                      }),
                    ),
                  ]}
                  onChange={(value) => {
                    const [candidateId, index] = value.split("/");
                    const candidate = availableImages.find(c => c.id === candidateId);
                    setComposition({
                      ...composition,
                      resources: [
                        ...composition.resources.filter((r) => r.key !== a.key),
                        ...(candidate
                          ? [
                              {
                                key: a.key,
                                candidateId,
                                taskId: candidate.taskId,
                                artifactIndex: Number(index),
                              },
                            ]
                          : []),
                      ],
                    });
                    setPreview(false);
                  }}
                />
              </Field>
            )}
          </section>
        ))}
      {error && (
        <p role="alert" className="workbench-error">
          {error}
        </p>
      )}
      <div className="gc-actions">
        <Button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const saved = await save();
              await previewSelection(saved);
            })
          }
        >
          {t("预览所选组合", "Preview selection", "選択した組み合わせを表示")}
        </Button>
        <Button
          tone="primary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const saved = await save();
              const previewId = await previewSelection(saved);
              adopt(
                unwrap(
                  await s.bridge.production.prepareUIAdoption({
                    compositionId: saved.id,
                    expectedCompositionRevision: saved.revision,
                    previewId,
                    changeKeys: keys.filter(
                      (k) => !saved.proposal.assets.some((a) => a.key === k),
                    ),
                    assetKeys: keys.filter((k) =>
                      saved.proposal.assets.some((a) => a.key === k),
                    ),
                    assetAdoptions: saved.proposal.assets
                      .filter(
                        (a) =>
                          keys.includes(a.key) &&
                          a.source.kind === "candidate" &&
                          (!choices[a.key] ||
                            choices[a.key] === "new" ||
                            choices[a.key].startsWith("variant:")),
                      )
                      .map((a) => {
                        const asset = s.data.assets.find(
                          (asset) => `variant:${asset.id}` === choices[a.key],
                        );
                        const mode = replaceModes[a.key] ?? "none";
                        return {
                          key: a.key,
                          source: asset
                            ? {
                                assetId: asset.id,
                                variantId:
                                  sourceVariants[a.key] ??
                                  asset.activeVariantId,
                              }
                            : null,
                          destination: asset
                            ? ("newVariant" as const)
                            : ("newAsset" as const),
                          replace: {
                            mode: asset ? mode : ("none" as const),
                            refs: asset
                              ? (references[a.key] ?? []).filter(
                                  (_, i) =>
                                    mode === "all" ||
                                    (mode === "selected" &&
                                      (selectedRefs[a.key] ?? []).includes(i)),
                                )
                              : [],
                          },
                        };
                      }),
                    substitutions: Object.entries(choices)
                      .filter(
                        ([key, id]) =>
                          keys.includes(key) &&
                          id !== "new" &&
                          !id.startsWith("variant:"),
                      )
                      .map(([key, id]) => ({
                        key,
                        assetId: id,
                        variantId: s.data.assets.find((a) => a.id === id)!
                          .activeVariantId,
                      })),
                    expected: s.data.versions,
                  }),
                ),
              );
            })
          }
        >
          {t("审阅采用范围", "Review adoption scope", "採用範囲を確認")}
        </Button>
      </div>
      <p role="status">
        {preview
          ? t(
              "候选预览 · 尚未采用",
              "Candidate preview · not adopted",
              "候補プレビュー・未採用",
            )
          : t("预览尚未更新", "Preview not updated", "プレビュー未更新")}
      </p>
      <div className="composition-preview" ref={surface} />
    </div>
  );
}
