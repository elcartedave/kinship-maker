"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

import {
  augmentIntentWithLayoutGaps,
  mergeAnswersAndResolveGaps,
} from "@/lib/kinship/ai/intent-gaps";
import {
  chartHasEgoSymbol,
  computeSubgraphMergeOffset,
  intentToKinshipGraph,
  remapKinshipIds,
  translateSymbolNodes,
} from "@/lib/kinship/ai/intent-to-chart";
import type { KinshipClarification, KinshipIntent } from "@/lib/kinship/ai/schema";
import { hydrateEdges, hydrateNodes } from "@/lib/kinship/document";
import type { KinshipEdge, KinshipNode } from "@/lib/kinship/types";

export type AiGeneratePanelProps = {
  open: boolean;
  onClose: () => void;
  existingNodes: KinshipNode[];
  onApplyMerge: (fragment: { nodes: KinshipNode[]; edges: KinshipEdge[] }) => void;
};

export function AiGeneratePanel({
  open,
  onClose,
  existingNodes,
  onApplyMerge,
}: AiGeneratePanelProps) {
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState<KinshipIntent | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setHint(null);
  }, [open]);

  const clarifications = intent?.clarifications ?? [];
  const allAnswered =
    clarifications.length === 0 ||
    clarifications.every((c) => answers[c.clarificationId] !== undefined);

  const handleGenerate = useCallback(async () => {
    setError(null);
    setHint(null);
    setIntent(null);
    setAnswers({});
    setLoading(true);
    try {
      const res = await fetch("/api/kinship/generate-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = (await res.json()) as {
        intent?: KinshipIntent;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      if (!data.intent) {
        throw new Error("Response missing intent");
      }
      // Surface anything the model omitted (sex, co-parent partner status…)
      // as MCQs so the user can resolve them before merging.
      setIntent(augmentIntentWithLayoutGaps(data.intent));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }, [description]);

  /** Merged AI subgraph always includes a new ego node — cannot coexist with an existing ego. */
  const egoCollision = chartHasEgoSymbol(existingNodes);

  const handleMerge = useCallback(() => {
    if (!intent) {
      return;
    }
    if (egoCollision) {
      setError(
        "This chart already has an Ego symbol. Remove it or start a new chart before merging AI output (which always includes Ego).",
      );
      return;
    }

    const result = mergeAnswersAndResolveGaps(intent, answers);
    if (!result.ok) {
      // Either the model omitted required fields (sex / partner status) or the
      // user has not answered all MCQs yet. Surface the augmented intent so
      // the new questions render, and nudge them with a non-error hint.
      setIntent(result.intent);
      setError(null);
      setHint(
        "A few more details are needed to draw the chart cleanly — answer the questions below, then tap Merge into chart again.",
      );
      return;
    }

    try {
      const toBuild = result.intent;
      const { nodes: rawNodes, edges: rawEdges } = intentToKinshipGraph(toBuild);
      const { dx, dy } = computeSubgraphMergeOffset(existingNodes, rawNodes);
      const shifted = translateSymbolNodes(rawNodes, dx, dy);
      const { nodes: remappedNodes, edges: remappedEdges } = remapKinshipIds(
        shifted,
        rawEdges,
      );
      onApplyMerge({
        nodes: hydrateNodes(remappedNodes),
        edges: hydrateEdges(remappedEdges),
      });
      onClose();
      setIntent(null);
      setDescription("");
      setAnswers({});
      setError(null);
      setHint(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build chart");
    }
  }, [
    answers,
    egoCollision,
    existingNodes,
    intent,
    onApplyMerge,
    onClose,
  ]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(24,18,10,0.35)] p-3 sm:items-center">
      <div
        className="paper-panel flex max-h-[min(90vh,40rem)] w-full max-w-lg flex-col rounded-[1.5rem] p-4 shadow-xl"
        role="dialog"
        aria-labelledby="ai-generate-title"
      >
        <div className="flex items-start justify-between gap-2 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-accent-strong" strokeWidth={2} />
            <h2 id="ai-generate-title" className="font-display text-lg text-ink">
              Describe your kin network
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-ink-soft transition hover:bg-white/80"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        <p className="mt-3 text-sm leading-6 text-ink-soft">
          The model proposes people and relationships. Unstated details become
          quick multiple-choice questions. Nothing is saved until you choose{" "}
          <span className="font-medium text-ink">Merge into chart</span>.
        </p>

        <label className="mt-3 block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            disabled={loading}
            placeholder='e.g. "I have two siblings — a sister and a brother — and my parents are married."'
            className="mt-2 w-full resize-y rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || description.trim().length === 0}
            onClick={() => void handleGenerate()}
            className="rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
          >
            {loading ? "Generating…" : "Generate"}
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {error}
          </p>
        ) : null}

        {hint && !error ? (
          <p className="mt-3 rounded-xl border border-line bg-white/70 px-3 py-2 text-sm text-ink-soft">
            {hint}
          </p>
        ) : null}

        {intent ? (
          <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
            <div className="rounded-xl border border-line bg-white/70 px-3 py-2 text-sm text-ink">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-strong">
                Summary
              </p>
              <p className="mt-1 leading-6">{intent.summary}</p>
            </div>

            {clarifications.length > 0 ? (
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
                  Follow-up
                </p>
                {clarifications.map((c) => (
                  <ClarificationField
                    key={c.clarificationId}
                    clarification={c}
                    people={intent.people}
                    value={answers[c.clarificationId]}
                    onChange={(value) =>
                      setAnswers((prev) => ({ ...prev, [c.clarificationId]: value }))
                    }
                  />
                ))}
              </div>
            ) : null}

            <button
              type="button"
              disabled={egoCollision}
              onClick={handleMerge}
              title={
                !allAnswered
                  ? "Some details are still missing — Merge will surface the remaining questions."
                  : undefined
              }
              className="w-full rounded-full border border-line bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:border-accent disabled:opacity-50"
            >
              Merge into chart
            </button>
            {egoCollision ? (
              <p className="text-xs text-amber-900">
                Remove the existing Ego symbol from this chart first — merged AI
                output always includes a new Ego.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ClarificationField({
  clarification: c,
  people,
  value,
  onChange,
}: {
  clarification: KinshipClarification;
  people: KinshipIntent["people"];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className="rounded-xl border border-line bg-white/60 px-3 py-2">
      <legend className="px-1 text-sm font-medium text-ink">{c.question}</legend>
      <div className="mt-2 flex flex-col gap-2">
        {c.kind === "ego"
          ? c.candidateIds.map((id) => {
              const label =
                people.find((p) => p.id === id)?.displayName?.trim() || id;
              return (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-2 text-sm text-ink"
                >
                  <input
                    type="radio"
                    name={c.clarificationId}
                    value={id}
                    checked={value === id}
                    onChange={() => onChange(id)}
                  />
                  {label}
                </label>
              );
            })
          : null}
        {c.kind === "sex"
          ? c.options.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 text-sm capitalize text-ink"
              >
                <input
                  type="radio"
                  name={c.clarificationId}
                  value={opt}
                  checked={value === opt}
                  onChange={() => onChange(opt)}
                />
                {opt}
              </label>
            ))
          : null}
        {c.kind === "partner-status"
          ? c.options.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 text-sm text-ink"
              >
                <input
                  type="radio"
                  name={c.clarificationId}
                  value={opt}
                  checked={value === opt}
                  onChange={() => onChange(opt)}
                />
                {opt}
              </label>
            ))
          : null}
        {(c.kind === "deceased" || c.kind === "adopted")
          ? c.options.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 text-sm capitalize text-ink"
              >
                <input
                  type="radio"
                  name={c.clarificationId}
                  value={opt}
                  checked={value === opt}
                  onChange={() => onChange(opt)}
                />
                {opt}
              </label>
            ))
          : null}
      </div>
    </fieldset>
  );
}
