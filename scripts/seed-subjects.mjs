// Starter Subject taxonomy seed. Run with `pnpm exec prisma db seed` (wired via
// package.json "prisma.seed"), or `node scripts/seed-subjects.mjs`. Deliberately
// NOT part of `prisma migrate deploy`, so it never runs in CI/tests — it only
// populates a real/dev database so the Seed Editor's Subject dropdown isn't empty.
//
// PLACEHOLDER LIST — NOT a curated curriculum. These are plausible top-level
// subjects only, seeded to unblock UI work; replace/expand with real curriculum
// input later (same spirit as the placeholder brand colors in the tokens pass).
// This is not a finished taxonomy.
//
// Subjects/Topics are the admin-maintained `Taxonomy` model (level subject|topic).
// Idempotent: find-or-create by (level, name[, parent]).

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STARTER_SUBJECTS = [
  "Mathematics",
  "Science",
  "Language Arts",
  "Social Studies",
  "Computer Science",
  "The Arts",
  "World Languages",
  "Health & Physical Education",
];

// A couple of example Topics (Topics are otherwise created on the fly from the
// Seed Editor); enough to exercise placement/find-or-create later.
const EXAMPLE_TOPICS = {
  Mathematics: ["Multiplication", "Fractions"],
};

async function findOrCreateSubject(name) {
  const existing = await prisma.taxonomy.findFirst({ where: { level: "subject", name } });
  return existing ?? prisma.taxonomy.create({ data: { level: "subject", name } });
}

async function findOrCreateTopic(name, subjectId) {
  const existing = await prisma.taxonomy.findFirst({
    where: { level: "topic", name, parent_id: subjectId },
  });
  return existing ?? prisma.taxonomy.create({ data: { level: "topic", name, parent_id: subjectId } });
}

async function main() {
  for (const name of STARTER_SUBJECTS) {
    const subject = await findOrCreateSubject(name);
    for (const topic of EXAMPLE_TOPICS[name] ?? []) {
      await findOrCreateTopic(topic, subject.taxonomy_id);
    }
  }
  const subjects = await prisma.taxonomy.count({ where: { level: "subject" } });
  console.log(`Starter subjects present: ${subjects} (placeholder list — replace with curated curriculum).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
