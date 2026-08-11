import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getModuleTree, moduleMaxPages } from "@/lib/module-authoring";
import { ModuleEditor } from "@/app/components/ModuleEditor";
import type { EditorPage } from "@/app/modules/types";

export const dynamic = "force-dynamic";

export default async function EditModulePage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;
  const session = await auth();
  const accountId = session?.user?.id;
  if (!accountId) redirect("/login");

  const module = await prisma.contextualizedModule.findUnique({
    where: { module_id: moduleId },
    include: {
      primary_seed_revision: {
        select: { title: true, learning_objective: true },
      },
    },
  });
  // Owner-only; a stranger or missing module 404s.
  if (!module || module.author_account_id !== accountId) notFound();

  const tree = await getModuleTree(moduleId);
  const pages: EditorPage[] = tree.map((p) => ({
    pageId: p.page_id,
    pageOrder: p.page_order,
    elements: p.elements.map((e) => ({
      elementId: e.element_id,
      elementType: e.element_type,
      positionX: e.position_x,
      positionY: e.position_y,
      width: e.width,
      height: e.height,
      zIndex: e.z_index,
      content: e.content,
    })),
  }));

  // The page cap comes from the PINNED revision's curriculum_load (Infinity when
  // the snapshot has none) — serialize Infinity as null (no cap).
  const max = await moduleMaxPages(moduleId);
  const maxPages = Number.isFinite(max) ? max : null;

  return (
    <ModuleEditor
      moduleId={module.module_id}
      status={module.status}
      initialAttestation={module.ai_attestation}
      initialPages={pages}
      maxPages={maxPages}
      seedTitle={module.primary_seed_revision.title ?? ""}
      seedObjective={module.primary_seed_revision.learning_objective}
      authorName={session.user?.name ?? "You"}
    />
  );
}
