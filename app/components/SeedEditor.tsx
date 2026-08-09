"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveDraftAction,
  publishSeedAction,
  listSubjectTopicsAction,
  searchOwnSeedsAction,
} from "@/app/seeds/actions";
import type {
  SeedEditorInput,
  SubjectOption,
  CurriculumLoad,
  Complexity,
  ComboItem,
} from "@/app/seeds/types";
import { Combobox } from "@/components/ui/combobox";

// The Seed Editor screen. A focused authoring form: the brief is explicit that
// the field list should SHRINK, so this intentionally omits the source
// material's rarely-load-bearing fields (grade_range, algorithmic_constraints,
// target_learner_characteristics, lesson_size_scope — the last folded into the
// `curriculum load` enum) and leans on the large Notes catch-all for the rest.
//
// Two gates, mirroring lib/seeds.ts:
//   • SAVE   — title + subject + topic (the minimum to persist a draft).
//   • PUBLISH — the full completeness set (assertSeedComplete). The button that
//     used to read "Promote to module" is gone: promotion needs a published
//     revision a draft doesn't have, so a draft PUBLISHES (and only a published
//     seed can later be promoted, elsewhere).

type Status = "draft" | "pending_review" | "published";

const CURRICULUM_LOAD: { value: CurriculumLoad; label: string }[] = [
  { value: "worksheet", label: "Worksheet" },
  { value: "short_unit", label: "Short unit" },
  { value: "extended_unit", label: "Extended unit" },
];
const COMPLEXITY: { value: Complexity; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const inputClass =
  "w-full rounded-md border border-input bg-white px-3 py-2 text-base text-foreground " +
  "placeholder:text-muted-foreground focus:outline-none focus:border-ring " +
  "focus:ring-2 focus:ring-ring/30";

export function SeedEditor({
  subjects,
  initial,
  architectName,
  status,
  prerequisiteInitialLabel = "",
}: {
  subjects: SubjectOption[];
  initial: SeedEditorInput;
  architectName: string;
  status: Status;
  prerequisiteInitialLabel?: string;
}) {
  const router = useRouter();
  const [f, setF] = useState<SeedEditorInput>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Topic combobox: existing Topics under the chosen subject, filtered locally.
  const [allTopics, setAllTopics] = useState<ComboItem[]>([]);
  const [topicQuery, setTopicQuery] = useState("");
  // Prerequisite combobox: async search over the author's own seeds.
  const [prereqOptions, setPrereqOptions] = useState<ComboItem[]>([]);
  const [prereqLabel, setPrereqLabel] = useState(prerequisiteInitialLabel);

  const isPublished = status === "published";

  function set<K extends keyof SeedEditorInput>(key: K, value: SeedEditorInput[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  // Load the chosen subject's Topics whenever the subject changes.
  useEffect(() => {
    let alive = true;
    if (!f.subjectId) {
      setAllTopics([]);
      return;
    }
    listSubjectTopicsAction(f.subjectId).then((items) => {
      if (alive) setAllTopics(items);
    });
    return () => {
      alive = false;
    };
  }, [f.subjectId]);

  const topicItems = useMemo(() => {
    const q = topicQuery.trim().toLowerCase();
    return q
      ? allTopics.filter((t) => t.label.toLowerCase().includes(q))
      : allTopics;
  }, [allTopics, topicQuery]);

  function loadPrereq(query: string) {
    searchOwnSeedsAction(query, initial.seedId).then(setPrereqOptions);
  }

  // Completeness (publish gate) — same field set as lib/seeds.ts assertSeedComplete.
  const missing = useMemo(() => {
    const m: string[] = [];
    if (!f.title.trim()) m.push("title");
    if (!f.subjectId) m.push("subject");
    if (!f.topicName.trim()) m.push("topic");
    if (!f.curriculumLoad) m.push("curriculum load");
    if (!f.complexity) m.push("complexity");
    if (!f.entryPrerequisite.trim()) m.push("prerequisite knowledge");
    if (!f.learningObjective.trim()) m.push("learning outcome");
    if (!f.content.trim()) m.push("content");
    return m;
  }, [f]);

  const canSave =
    f.title.trim() !== "" && f.subjectId !== "" && f.topicName.trim() !== "";
  const canPublish = missing.length === 0;

  function run(action: typeof saveDraftAction) {
    setError(null);
    startTransition(async () => {
      const res = await action(f);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/seeds");
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <a href="/seeds" className="hover:text-foreground">
              Seeds
            </a>
            <ChevronRight />
            <span className="text-foreground">
              {initial.seedId ? "Edit seed" : "New seed"}
            </span>
          </nav>
          <div className="flex items-center gap-3">
            <StatusChip status={status} />
            <span
              className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground"
              title={architectName}
              aria-hidden
            >
              {initials(architectName)}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-40 pt-8">
        {/* Title */}
        <Field
          label="Title"
          hint="Give this idea a short, memorable name."
          required
        >
          <input
            className={`${inputClass} text-lg`}
            value={f.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Single-digit multiplication fluency"
            maxLength={200}
            disabled={isPublished}
          />
        </Field>

        <SectionHeading>Placement</SectionHeading>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Subject" hint="Which subject area?" required>
            <select
              className={inputClass}
              value={f.subjectId}
              onChange={(e) => set("subjectId", e.target.value)}
              disabled={isPublished}
            >
              <option value="">Select a subject…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Topic"
            hint="Pick an existing topic, or type a new one to create it under the subject."
            required
          >
            <Combobox
              id="topic"
              items={topicItems}
              value={f.topicName}
              allowCustom
              onQueryChange={setTopicQuery}
              onSelect={(v) => set("topicName", v)}
              placeholder={f.subjectId ? "Select or create a topic" : "Choose a subject first"}
              searchPlaceholder="Search or type a new topic…"
              emptyText="No topics yet — type to create one."
              createLabel={(q) => `Create topic “${q}”`}
              disabled={isPublished || !f.subjectId}
            />
          </Field>
        </div>

        <SectionHeading>Pedagogy</SectionHeading>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Curriculum load" hint="Rough authoring scope." required>
            <select
              className={inputClass}
              value={f.curriculumLoad}
              onChange={(e) =>
                set("curriculumLoad", e.target.value as SeedEditorInput["curriculumLoad"])
              }
              disabled={isPublished}
            >
              <option value="">Select…</option>
              {CURRICULUM_LOAD.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Complexity" hint="Difficulty tier." required>
            <select
              className={inputClass}
              value={f.complexity}
              onChange={(e) =>
                set("complexity", e.target.value as SeedEditorInput["complexity"])
              }
              disabled={isPublished}
            >
              <option value="">Select…</option>
              {COMPLEXITY.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Learning outcome"
          hint="What will a learner be able to do? A goal, not a problem list."
          required
        >
          <textarea
            className={`${inputClass} min-h-24 resize-y`}
            value={f.learningObjective}
            onChange={(e) => set("learningObjective", e.target.value)}
            placeholder="After this, a learner can…"
            disabled={isPublished}
          />
        </Field>

        <Field
          label="Prerequisite knowledge"
          hint="What should a learner already know before starting?"
          required
        >
          <textarea
            className={`${inputClass} min-h-24 resize-y`}
            value={f.entryPrerequisite}
            onChange={(e) => set("entryPrerequisite", e.target.value)}
            placeholder="Assumes the learner can…"
            disabled={isPublished}
          />
        </Field>

        <Field
          label="Prerequisite seed"
          hint="Optionally link a prior seed of yours that covers the immediately preceding topic. Optional."
        >
          <Combobox
            id="prerequisite"
            items={prereqOptions}
            value={f.prerequisiteSeedId}
            displayLabel={prereqLabel}
            clearable
            onOpen={() => loadPrereq("")}
            onQueryChange={loadPrereq}
            onSelect={(v, label) => {
              set("prerequisiteSeedId", v);
              setPrereqLabel(v ? label : "");
            }}
            placeholder="No prerequisite seed"
            searchPlaceholder="Search your seeds…"
            emptyText="No matching seeds of yours."
            disabled={isPublished}
          />
        </Field>

        <SectionHeading>Content</SectionHeading>
        <Field
          label="What needs to be covered"
          hint="Be as technical as the material demands — the concepts, methods, and depth a module built from this seed must teach. Substance, not a rough sketch."
          required
        >
          <textarea
            className={`${inputClass} min-h-40 resize-y`}
            value={f.content}
            onChange={(e) => set("content", e.target.value)}
            placeholder="The concepts, definitions, methods, and level of depth to cover…"
            disabled={isPublished}
          />
        </Field>

        <Field
          label="Notes"
          hint="A catch-all for anything that doesn't have its own field yet. Optional."
        >
          <textarea
            className={`${inputClass} min-h-32 resize-y`}
            value={f.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Open questions, sources, things to revisit…"
            disabled={isPublished}
          />
        </Field>
      </main>

      {/* Action bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-sm" aria-live="polite">
            {error ? (
              <span className="text-danger-text">{error}</span>
            ) : isPublished ? (
              <span className="text-muted-foreground">
                This seed is published and can no longer be edited here.
              </span>
            ) : !canPublish ? (
              <span className="text-muted-foreground">
                To publish, complete: {missing.join(", ")}.
              </span>
            ) : (
              <span className="text-secondary-foreground">
                Ready to publish.
              </span>
            )}
          </div>
          {!isPublished && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => run(saveDraftAction)}
                disabled={pending || !canSave}
                className="rounded-md border border-border bg-white px-4 py-2 text-base font-medium text-foreground hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save and exit
              </button>
              <button
                type="button"
                onClick={() => run(publishSeedAction)}
                disabled={pending || !canPublish}
                className="rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground hover:bg-primary-hover active:bg-primary-active disabled:cursor-not-allowed disabled:bg-primary-disabled"
              >
                {pending ? "Working…" : "Publish"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-6 block">
      <span className="mb-1 block text-sm font-semibold text-heading">
        {label}
        {required && <span className="ml-1 text-danger-text">*</span>}
      </span>
      {hint && (
        <span className="mb-2 block text-sm text-muted-foreground">{hint}</span>
      )}
      {children}
    </label>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-8 mb-4 border-t border-border pt-6 text-xs font-bold uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  );
}

function StatusChip({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string }> = {
    draft: { label: "Draft", cls: "bg-secondary text-secondary-foreground" },
    pending_review: {
      label: "In review",
      cls: "bg-gold-100 text-gold-700",
    },
    published: { label: "Published", cls: "bg-teal-100 text-teal-700" },
  };
  const s = map[status];
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ChevronRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
