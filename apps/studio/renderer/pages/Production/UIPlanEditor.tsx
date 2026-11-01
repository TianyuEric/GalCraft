import type { UIPlanProposal } from "@galcraft/authoring/production";
import { Button, Choice, Field } from "../../components/controls.js";
import type { ProductionSession } from "./session.js";
import { tr } from "./Production.js";

export function UIPlanEditor({
  value,
  onChange,
  session: s,
  locale,
  connectionId,
}: {
  value: UIPlanProposal;
  onChange(value: UIPlanProposal): void;
  session: ProductionSession;
  locale: string;
  connectionId?: string | null;
}) {
  const t = (zh: string, en: string, ja: string) => tr(locale, zh, en, ja);
  const update = (
    index: number,
    patch: Partial<UIPlanProposal["steps"][number]>,
  ) =>
    onChange({
      ...value,
      steps: value.steps.map((step, i) =>
        i === index ? { ...step, ...patch } : step,
      ),
    });
  return (
    <div className="ui-plan-editor">
      <Field label={t("计划目标", "Plan objective", "計画の目的")}>
        <input
          value={value.summary}
          onChange={(e) => onChange({ ...value, summary: e.target.value })}
        />
      </Field>
      {value.steps.map((step, index) => (
        <article className="plan-step-editor" key={step.key}>
          <header>
            <span className="step-number">{index + 1}</span>
            <strong>{step.description || step.key}</strong>
            <Button
              tone="quiet"
              onClick={() =>
                onChange({
                  ...value,
                  steps: value.steps.filter((_, i) => i !== index),
                })
              }
            >
              {t("移除", "Remove", "削除")}
            </Button>
          </header>
          <Field label={t("修改要求", "Instruction", "変更の要望")}>
            <textarea
              value={step.instruction}
              onChange={(e) => update(index, { instruction: e.target.value })}
            />
          </Field>
          <div className="form-grid">
            <Field label={t("连接", "Connection", "接続")}>
              <Choice
                label={t("步骤连接", "Step connection", "ステップの接続")}
                value={String(
                  step.fields.connectionId ?? connectionId ?? "",
                )}
                options={[
                  { value: "", label: "—" },
                  ...s.data.connections
                    .filter((c) =>
                      c.purposes.includes(
                        step.kind === "raster" ? "image" : "text",
                      ),
                    )
                    .map((c) => ({ value: c.id, label: c.name })),
                ]}
                onChange={(id) =>
                  update(index, {
                    fields: { ...step.fields, connectionId: id },
                  })
                }
              />
            </Field>
            {step.kind === "raster" ? (
              <>
                <Field label={t("工作流", "Workflow", "ワークフロー")}>
                  <Choice
                    label={t("步骤工作流", "Step workflow", "ステップのワークフロー")}
                    value={String(step.fields.workflowBindingId ?? "")}
                    options={[
                      { value: "", label: "—" },
                      ...s.data.workflows
                        .filter((w) => w.purpose === "image")
                        .map((w) => ({ value: w.id, label: w.name })),
                    ]}
                    onChange={(id) =>
                      update(index, {
                        fields: { ...step.fields, workflowBindingId: id },
                      })
                    }
                  />
                </Field>
                <fieldset className="reference-assets">
                  <legend>
                    {t(
                      "参考素材（活动版本）",
                      "Reference assets (active variant)",
                      "参考素材（アクティブ版）",
                    )}
                  </legend>
                  {s.data.assets
                    .filter((a) => a.kind === "image")
                    .map((asset) => (
                      <label className="check-row" key={asset.id}>
                        <input
                          type="checkbox"
                          checked={step.reuseAssets.includes(asset.id)}
                          onChange={(event) => {
                            const refs = (
                              Array.isArray(step.fields.references)
                                ? step.fields.references
                                : []
                            ).filter(
                              (ref) =>
                                !(
                                  ref &&
                                  typeof ref === "object" &&
                                  !Array.isArray(ref) &&
                                  ref.kind === "existing" &&
                                  ref.assetId === asset.id
                                ),
                            );
                            update(index, {
                              reuseAssets: event.target.checked
                                ? [...step.reuseAssets, asset.id]
                                : step.reuseAssets.filter(
                                    (id) => id !== asset.id,
                                  ),
                              fields: {
                                ...step.fields,
                                references: [
                                  ...refs,
                                  ...(event.target.checked
                                    ? [
                                        {
                                          kind: "existing",
                                          assetId: asset.id,
                                          variantId: asset.activeVariantId,
                                        },
                                      ]
                                    : []),
                                ],
                              },
                            });
                          }}
                        />
                        {asset.name}
                      </label>
                    ))}
                </fieldset>
                {["width", "height", "count"].map((key, i) => (
                  <Field
                    key={key}
                    label={
                      [
                        t("宽度", "Width", "幅"),
                        t("高度", "Height", "高さ"),
                        t("数量", "Count", "枚数"),
                      ][i]
                    }
                  >
                    <input
                      type="number"
                      min="1"
                      value={Number(
                        step.fields[key] ?? (key === "count" ? 1 : 1024),
                      )}
                      onChange={(e) =>
                        update(index, {
                          fields: {
                            ...step.fields,
                            [key]: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                ))}
              </>
            ) : (
              <Field label={t("方案", "Recipe", "レシピ")}>
                <Choice
                  label={t("步骤方案", "Step recipe", "ステップのレシピ")}
                  value={step.recipe?.recipeId ?? ""}
                  options={[
                    { value: "", label: "—" },
                    ...s.data.recipes
                      .filter((r) =>
                        r.purposes.includes(
                          step.kind === "svg" ? "svg" : "uiPatch",
                        ),
                      )
                      .map((r) => ({ value: r.id, label: r.name })),
                  ]}
                  onChange={(id) => {
                    const r = s.data.recipes.find((r) => r.id === id);
                    update(index, {
                      recipe: r
                        ? {
                            recipeId: r.id,
                            scope: r.scope,
                            purpose: step.kind === "svg" ? "svg" : "uiPatch",
                            usage: "ui",
                            parameterValues: Object.fromEntries(
                              r.parameters.map((p) => [p.key, p.defaultValue]),
                            ),
                          }
                        : null,
                    });
                  }}
                />
              </Field>
            )}
          </div>
          <small>
            {t("先完成", "After", "先行ステップ")}:{" "}
            {step.dependsOn.join(", ") || "—"} · {t("素材", "Assets", "素材")}:{" "}
            {step.assetKeys.join(", ") || "—"}
          </small>
        </article>
      ))}
    </div>
  );
}
