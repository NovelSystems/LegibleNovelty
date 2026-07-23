import { prisma } from "@/lib/prisma";

// Seed Chains + curriculum-map backend queries (Seed Editor Task 3).
//
// The curriculum map VIEW is deferred, but its backend query support ships now —
// this is a schema-design constraint, not a feature: retrofitting coverage / gap
// / density / language-coverage onto a schema not shaped for them is the failure
// mode being avoided. All four queries operate over PUBLISHED, non-deleted seeds
// (what a learner-facing map would surface).

export class ChainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainError";
  }
}

const PUBLISHED = { status: "published", deleted_at: null } as const;

// --- Seed Chains -------------------------------------------------------------

// Add a directed edge (from → to) to a named chain within a Topic. Chains are
// decoupled from taxonomy structure; multiple competing chains coexist in one
// Topic, distinguished by chain_key. Both seeds must be placed in the Topic, and
// enrichment seeds (which enrich rather than advance) can't be chain members.
export async function addChainEdge(args: {
  topicId: string;
  chainKey: string;
  fromSeedId: string;
  toSeedId: string;
}) {
  if (args.fromSeedId === args.toSeedId) {
    throw new ChainError("A chain edge cannot point a seed at itself.");
  }
  const seeds = await prisma.learningSeed.findMany({
    where: { seed_id: { in: [args.fromSeedId, args.toSeedId] } },
  });
  if (seeds.length !== 2) throw new ChainError("Both seeds must exist.");
  for (const s of seeds) {
    if (s.topic_id !== args.topicId) {
      throw new ChainError("Both seeds must be placed in the chain's Topic.");
    }
    if (s.is_enrichment) {
      throw new ChainError("Enrichment seeds cannot be part of a chain.");
    }
  }
  return prisma.seedChain.create({
    data: {
      topic_id: args.topicId,
      chain_key: args.chainKey,
      from_seed_id: args.fromSeedId,
      to_seed_id: args.toSeedId,
    },
  });
}

// Topological ordering of a chain's seeds from its directed edges. Returns the
// linear sequence; throws if the edges contain a cycle. A branch/gap surfaces as
// multiple roots (see chainGaps).
export async function chainSequence(chainKey: string): Promise<string[]> {
  const edges = await prisma.seedChain.findMany({ where: { chain_key: chainKey } });
  const nodes = new Set<string>();
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const touch = (n: string) => {
    if (!indegree.has(n)) indegree.set(n, 0);
    if (!outgoing.has(n)) outgoing.set(n, []);
    nodes.add(n);
  };
  for (const e of edges) {
    touch(e.from_seed_id);
    touch(e.to_seed_id);
    outgoing.get(e.from_seed_id)!.push(e.to_seed_id);
    indegree.set(e.to_seed_id, indegree.get(e.to_seed_id)! + 1);
  }
  // Kahn's algorithm.
  const queue = [...nodes].filter((n) => (indegree.get(n) ?? 0) === 0).sort();
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const m of (outgoing.get(n) ?? []).sort()) {
      indegree.set(m, indegree.get(m)! - 1);
      if (indegree.get(m) === 0) queue.push(m);
    }
  }
  if (order.length !== nodes.size) {
    throw new ChainError("Chain contains a cycle.");
  }
  return order;
}

// --- Curriculum-map queries --------------------------------------------------

// COVERAGE: how thoroughly a Topic is covered by published seeds, split into
// advancing (chain-eligible) vs enrichment.
export async function coverage(topicId: string) {
  const seeds = await prisma.learningSeed.findMany({
    where: { topic_id: topicId, ...PUBLISHED },
    select: { seed_id: true, is_enrichment: true },
  });
  return {
    topicId,
    total: seeds.length,
    advancing: seeds.filter((s) => !s.is_enrichment).length,
    enrichment: seeds.filter((s) => s.is_enrichment).length,
    seedIds: seeds.map((s) => s.seed_id),
  };
}

// GAP: Topics (optionally within one Subject) with ZERO published seeds — the
// holes a curriculum map would highlight. Deprecated topics are excluded.
export async function coverageGaps(subjectId?: string) {
  const topics = await prisma.taxonomy.findMany({
    where: {
      level: "topic",
      deprecated_at: null,
      ...(subjectId ? { parent_id: subjectId } : {}),
    },
    select: { taxonomy_id: true, name: true, parent_id: true },
  });
  const gaps: { topicId: string; name: string; subjectId: string | null }[] = [];
  for (const t of topics) {
    const count = await prisma.learningSeed.count({
      where: { topic_id: t.taxonomy_id, ...PUBLISHED },
    });
    if (count === 0) {
      gaps.push({ topicId: t.taxonomy_id, name: t.name, subjectId: t.parent_id });
    }
  }
  return gaps;
}

// DENSITY: published-seed count per Topic (optionally within one Subject),
// highest first — how concentrated coverage is.
export async function density(subjectId?: string) {
  const grouped = await prisma.learningSeed.groupBy({
    by: ["topic_id"],
    where: {
      ...PUBLISHED,
      ...(subjectId ? { topic: { parent_id: subjectId } } : {}),
    },
    _count: { seed_id: true },
  });
  const names = await prisma.taxonomy.findMany({
    where: { taxonomy_id: { in: grouped.map((g) => g.topic_id) } },
    select: { taxonomy_id: true, name: true },
  });
  const nameOf = new Map(names.map((n) => [n.taxonomy_id, n.name]));
  return grouped
    .map((g) => ({
      topicId: g.topic_id,
      name: nameOf.get(g.topic_id) ?? "",
      density: g._count.seed_id,
    }))
    .sort((a, b) => b.density - a.density || a.topicId.localeCompare(b.topicId));
}

// LANGUAGE-COVERAGE: the distinct content languages present among a Topic's
// published seeds.
export async function languageCoverage(topicId: string): Promise<string[]> {
  const rows = await prisma.learningSeed.findMany({
    where: { topic_id: topicId, ...PUBLISHED },
    select: { language: true },
    distinct: ["language"],
  });
  return rows.map((r) => r.language).sort();
}

// The subset of `expected` languages NOT yet covered in a Topic — the
// language-shaped gaps.
export async function languageGaps(
  topicId: string,
  expected: string[],
): Promise<string[]> {
  const present = new Set(await languageCoverage(topicId));
  return expected.filter((l) => !present.has(l));
}
