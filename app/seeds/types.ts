// Shared types for the Seed Editor surface. Kept in a plain module (no
// "use server" / "use client" directive) so both the server actions and the
// client form can import them without a directive conflict.

export type CurriculumLoad = "worksheet" | "short_unit" | "extended_unit";
export type Complexity = "beginner" | "intermediate" | "advanced";

// The editor's form shape. Topic is a NAME (not an id): the action resolves it
// to a Topic taxonomy node via findOrCreateTopic, matching the brief's
// create-a-topic-on-the-fly scaffolding.
export interface SeedEditorInput {
  seedId?: string;
  title: string;
  subjectId: string;
  topicName: string;
  learningObjective: string;
  entryPrerequisite: string;
  curriculumLoad: "" | CurriculumLoad;
  complexity: "" | Complexity;
  content: string;
  notes: string;
}

export type SeedActionResult =
  | { ok: true; seedId: string; published?: boolean }
  | { ok: false; error: string };

export interface SubjectOption {
  id: string;
  name: string;
}
