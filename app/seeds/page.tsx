import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_review: "In review",
  published: "Published",
};

// The architect's own seeds — the landing spot for "Save and exit" and the entry
// point to the editor. Owner-scoped; excludes soft-deleted seeds.
export default async function SeedsPage() {
  const session = await auth();
  const accountId = session?.user?.id;
  if (!accountId) redirect("/login");

  const seeds = await prisma.learningSeed.findMany({
    where: { architect_account_id: accountId, deleted_at: null },
    orderBy: { updated_at: "desc" },
    include: { subject: true, topic: true },
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl">Your seeds</h1>
        <a
          href="/seeds/new"
          className="rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground hover:bg-primary-hover active:bg-primary-active"
        >
          New seed
        </a>
      </div>

      {seeds.length === 0 ? (
        <p className="rounded-lg border border-border bg-gray-50 p-8 text-center text-muted-foreground">
          No seeds yet. Start one with <strong>New seed</strong>.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {seeds.map((s) => (
            <li key={s.seed_id}>
              <a
                href={`/seeds/${s.seed_id}/edit`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-heading">
                    {s.title?.trim() || "Untitled draft"}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {s.subject?.name ?? "—"} · {s.topic?.name ?? "—"}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
