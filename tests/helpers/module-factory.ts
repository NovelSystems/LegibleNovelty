import { prisma } from "@/lib/prisma";
import { createModule } from "@/lib/modules";
import { addPage, createElement } from "@/lib/module-authoring";
import { makeAccount } from "./factory";
import { makeTaxonomyPair, publishSeedFixture } from "./seed-factory";

// A published primary seed (with its baseline SeedRevision) plus its taxonomy,
// optionally flagged as a political-systems Topic for escalation tests.
export async function makePublishedPrimarySeed(opts: { political?: boolean; objective?: string } = {}) {
  const architect = await makeAccount({ endorsed: true });
  const { subject, topic } = await makeTaxonomyPair({ subject: `Mod-${Date.now()}-${Math.random()}` });
  if (opts.political) {
    await prisma.taxonomy.update({
      where: { taxonomy_id: topic.taxonomy_id },
      data: { is_political_systems: true },
    });
  }
  const seed = await publishSeedFixture({
    architectId: architect.account_id,
    subjectId: subject.taxonomy_id,
    topicId: topic.taxonomy_id,
    objective: opts.objective,
  });
  return { seed, subject, topic, architect };
}

// A module authored by `authorId` against `primarySeedId`, with one text element
// carrying `plainText` (used by the deterministic alignment checks).
export async function makeModuleWithText(
  authorId: string,
  primarySeedId: string,
  plainText: string,
  now?: Date,
) {
  const module = await createModule({ authorAccountId: authorId, primarySeedId }, now);
  const page = await addPage(module.module_id, 0);
  await createElement(page.page_id, {
    element_type: "text",
    position_x: 0,
    position_y: 0,
    width: 100,
    height: 50,
    z_index: 0,
    content: { plainText },
  });
  return module;
}

export { makeAccount };
