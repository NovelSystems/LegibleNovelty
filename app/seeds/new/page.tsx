import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SeedEditor } from "@/app/components/SeedEditor";
import { loadSubjects } from "../data";
import type { SeedEditorInput } from "../types";

export const dynamic = "force-dynamic";

const EMPTY: SeedEditorInput = {
  title: "",
  subjectId: "",
  topicName: "",
  learningObjective: "",
  entryPrerequisite: "",
  curriculumLoad: "",
  complexity: "",
  content: "",
  notes: "",
  prerequisiteSeedId: "",
};

export default async function NewSeedPage() {
  const session = await auth();
  const accountId = session?.user?.id;
  if (!accountId) redirect("/login");

  const subjects = await loadSubjects();
  return (
    <SeedEditor
      subjects={subjects}
      initial={EMPTY}
      architectName={session.user?.name ?? "You"}
      status="draft"
    />
  );
}
