import { prisma } from "@/lib/prisma";
import { createSeedDraft, publishSeed, submitForReview } from "@/lib/seeds";
import { makeAccount } from "./factory";

// Fixtures for the Seed Editor tests: a Subject→Topic taxonomy pair and a quick
// "publish a seed" helper that walks the real draft → pending_review → published
// path so quota logic is exercised honestly.

export async function makeTaxonomyPair(opts: { subject?: string; topic?: string } = {}) {
  const subject = await prisma.taxonomy.create({
    data: { level: "subject", name: opts.subject ?? "Mathematics" },
  });
  const topic = await prisma.taxonomy.create({
    data: { level: "topic", name: opts.topic ?? "Multiplication", parent_id: subject.taxonomy_id },
  });
  return { subject, topic };
}

export interface SeedFixtureOpts {
  architectId: string;
  subjectId: string;
  topicId: string;
  language?: string;
  isEnrichment?: boolean;
}

// Create a draft with sensible defaults.
export function draftSeed(opts: SeedFixtureOpts) {
  return createSeedDraft({
    architectAccountId: opts.architectId,
    learningObjective: "Understand single-digit multiplication.",
    entryPrerequisite: "Can add single digits.",
    lessonSizeScope: "single-session",
    subjectId: opts.subjectId,
    topicId: opts.topicId,
    gradeRange: "roughly ages 7-9",
    notes: "",
    language: opts.language,
    isEnrichment: opts.isEnrichment,
  });
}

// Create → submit → publish, returning the published seed.
export async function publishSeedFixture(opts: SeedFixtureOpts, now?: Date) {
  const seed = await draftSeed(opts);
  await submitForReview(seed.seed_id, opts.architectId);
  return publishSeed(seed.seed_id, opts.architectId, now);
}

export { makeAccount };
