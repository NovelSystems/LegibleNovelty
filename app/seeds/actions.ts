"use server";

import { auth } from "@/auth";
import {
  createSeedDraft,
  updateSeedDraft,
  publishDraft,
  findOrCreateTopic,
  SeedError,
} from "@/lib/seeds";
import type { SeedEditorInput, SeedActionResult } from "./types";

// Server actions for the Seed Editor. The domain rules (save gate, placement
// validation, publish-completeness, quota) all live in lib/seeds.ts; these only
// resolve the signed-in architect, turn the topic NAME into a Topic node, and
// adapt the lib functions to the form.

async function currentAccountId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

// Create-or-update the draft from the form, returning the seed id. Enforces the
// SAVE gate (title + subject + topic) here, ahead of the lib layer, so the user
// gets a precise message. Shared by both Save and Publish.
async function persistDraft(
  accountId: string,
  input: SeedEditorInput,
): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new SeedError("A title is required to save.");
  if (!input.subjectId) throw new SeedError("A subject is required to save.");
  const topicName = input.topicName.trim();
  if (!topicName) throw new SeedError("A topic is required to save.");

  const topic = await findOrCreateTopic(input.subjectId, topicName);

  // Empty select → undefined (leave the column null on create / untouched on
  // update); a chosen value passes straight through as the Prisma enum literal.
  const curriculumLoad = input.curriculumLoad || undefined;
  const complexity = input.complexity || undefined;

  if (input.seedId) {
    const updated = await updateSeedDraft(input.seedId, accountId, {
      title,
      subjectId: input.subjectId,
      topicId: topic.taxonomy_id,
      learningObjective: input.learningObjective,
      entryPrerequisite: input.entryPrerequisite,
      notes: input.notes,
      curriculumLoad,
      complexity,
      content: input.content,
    });
    return updated.seed_id;
  }

  const created = await createSeedDraft({
    architectAccountId: accountId,
    title,
    subjectId: input.subjectId,
    topicId: topic.taxonomy_id,
    learningObjective: input.learningObjective,
    entryPrerequisite: input.entryPrerequisite,
    notes: input.notes,
    curriculumLoad,
    complexity,
    content: input.content,
  });
  return created.seed_id;
}

function toError(e: unknown, fallback: string): SeedActionResult {
  return { ok: false, error: e instanceof Error ? e.message : fallback };
}

export async function saveDraftAction(
  input: SeedEditorInput,
): Promise<SeedActionResult> {
  const accountId = await currentAccountId();
  if (!accountId) return { ok: false, error: "You must be signed in." };
  try {
    const seedId = await persistDraft(accountId, input);
    return { ok: true, seedId };
  } catch (e) {
    return toError(e, "Could not save the seed.");
  }
}

export async function publishSeedAction(
  input: SeedEditorInput,
): Promise<SeedActionResult> {
  const accountId = await currentAccountId();
  if (!accountId) return { ok: false, error: "You must be signed in." };
  try {
    // Persist the latest form values first, then run the completeness-gated
    // publish against the saved row.
    const seedId = await persistDraft(accountId, input);
    await publishDraft(seedId, accountId);
    return { ok: true, seedId, published: true };
  } catch (e) {
    return toError(e, "Could not publish the seed.");
  }
}
