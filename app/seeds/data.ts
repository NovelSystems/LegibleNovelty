import { prisma } from "@/lib/prisma";
import type { SubjectOption } from "./types";

// Active (non-deprecated) Subject taxonomy nodes for the editor's subject select.
export async function loadSubjects(): Promise<SubjectOption[]> {
  const rows = await prisma.taxonomy.findMany({
    where: { level: "subject", deprecated_at: null },
    orderBy: { name: "asc" },
    select: { taxonomy_id: true, name: true },
  });
  return rows.map((r) => ({ id: r.taxonomy_id, name: r.name }));
}
