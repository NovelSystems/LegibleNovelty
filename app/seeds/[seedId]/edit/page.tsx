import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SeedEditor } from "@/app/components/SeedEditor";
import { loadSubjects } from "../../data";
import type { SeedEditorInput } from "../../types";

export const dynamic = "force-dynamic";

export default async function EditSeedPage({
  params,
}: {
  params: Promise<{ seedId: string }>;
}) {
  const { seedId } = await params;
  const session = await auth();
  const accountId = session?.user?.id;
  if (!accountId) redirect("/login");

  const seed = await prisma.learningSeed.findUnique({
    where: { seed_id: seedId },
    include: { topic: true, prerequisite_seed: { select: { title: true } } },
  });
  // Owner-only, and never a soft-deleted seed. A stranger or missing seed 404s
  // rather than leaking existence.
  if (!seed || seed.deleted_at || seed.architect_account_id !== accountId) {
    notFound();
  }

  const subjects = await loadSubjects();
  const initial: SeedEditorInput = {
    seedId: seed.seed_id,
    title: seed.title ?? "",
    subjectId: seed.subject_id,
    topicName: seed.topic?.name ?? "",
    learningObjective: seed.learning_objective,
    entryPrerequisite: seed.entry_prerequisite,
    curriculumLoad: (seed.curriculum_load ??
      "") as SeedEditorInput["curriculumLoad"],
    complexity: (seed.complexity ?? "") as SeedEditorInput["complexity"],
    content: seed.content ?? "",
    notes: seed.notes,
    prerequisiteSeedId: seed.prerequisite_seed_id ?? "",
  };
  // Display label for a pre-selected prerequisite (its combobox item may not be
  // loaded until the picker opens).
  const prereqLabel = seed.prerequisite_seed
    ? seed.prerequisite_seed.title?.trim() || "Untitled draft"
    : "";

  return (
    <SeedEditor
      subjects={subjects}
      initial={initial}
      architectName={session.user?.name ?? "You"}
      status={seed.status}
      prerequisiteInitialLabel={prereqLabel}
    />
  );
}
