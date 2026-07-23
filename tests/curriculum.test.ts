import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  addChainEdge,
  chainSequence,
  coverage,
  coverageGaps,
  density,
  languageCoverage,
  languageGaps,
  ChainError,
} from "@/lib/curriculum";
import { makeAccount } from "./helpers/factory";
import { makeTaxonomyPair, publishSeedFixture } from "./helpers/seed-factory";

// Curriculum-map backend queries must return correct results even with no map
// UI to display them (Task 3). Each test builds an isolated Subject so global
// gap/density queries can be scoped to it and asserted exactly.

describe("Seed Chains + curriculum-map queries (Task 3)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("coverage counts published seeds and splits advancing vs enrichment", async () => {
    const architect = await makeAccount({ endorsed: true });
    const { subject, topic } = await makeTaxonomyPair({ subject: `Sci-${Date.now()}` });
    await publishSeedFixture({ architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id });
    await publishSeedFixture({ architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id });
    await publishSeedFixture({
      architectId: architect.account_id,
      subjectId: subject.taxonomy_id,
      topicId: topic.taxonomy_id,
      isEnrichment: true,
    });

    const cov = await coverage(topic.taxonomy_id);
    expect(cov.total).toBe(3);
    expect(cov.advancing).toBe(2);
    expect(cov.enrichment).toBe(1);
  });

  it("gap lists topics with zero published seeds; density ranks by count", async () => {
    const architect = await makeAccount({ endorsed: true });
    const subject = await prisma.taxonomy.create({
      data: { level: "subject", name: `Gap-${Date.now()}` },
    });
    const busy = await prisma.taxonomy.create({
      data: { level: "topic", name: "Busy", parent_id: subject.taxonomy_id },
    });
    const empty = await prisma.taxonomy.create({
      data: { level: "topic", name: "Empty", parent_id: subject.taxonomy_id },
    });
    await publishSeedFixture({ architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: busy.taxonomy_id });
    await publishSeedFixture({ architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: busy.taxonomy_id });

    const gaps = await coverageGaps(subject.taxonomy_id);
    expect(gaps.map((g) => g.topicId)).toEqual([empty.taxonomy_id]);

    const dens = await density(subject.taxonomy_id);
    expect(dens).toEqual([
      expect.objectContaining({ topicId: busy.taxonomy_id, density: 2 }),
    ]);
  });

  it("language-coverage lists distinct languages and reports gaps", async () => {
    const architect = await makeAccount({ endorsed: true });
    const { subject, topic } = await makeTaxonomyPair({ subject: `Lang-${Date.now()}` });
    await publishSeedFixture({ architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id, language: "en" });
    await publishSeedFixture({ architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id, language: "es" });
    await publishSeedFixture({ architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id, language: "en" });

    expect(await languageCoverage(topic.taxonomy_id)).toEqual(["en", "es"]);
    expect(await languageGaps(topic.taxonomy_id, ["en", "es", "fr"])).toEqual(["fr"]);
  });

  it("orders a chain via its directed edges and rejects enrichment members", async () => {
    const architect = await makeAccount({ endorsed: true });
    const { subject, topic } = await makeTaxonomyPair({ subject: `Chain-${Date.now()}` });
    const a = await publishSeedFixture({ architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id });
    const b = await publishSeedFixture({ architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id });
    const c = await publishSeedFixture({ architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id });
    const enrich = await publishSeedFixture({
      architectId: architect.account_id,
      subjectId: subject.taxonomy_id,
      topicId: topic.taxonomy_id,
      isEnrichment: true,
    });

    const key = `chain-${Date.now()}`;
    await addChainEdge({ topicId: topic.taxonomy_id, chainKey: key, fromSeedId: a.seed_id, toSeedId: b.seed_id });
    await addChainEdge({ topicId: topic.taxonomy_id, chainKey: key, fromSeedId: b.seed_id, toSeedId: c.seed_id });

    expect(await chainSequence(key)).toEqual([a.seed_id, b.seed_id, c.seed_id]);

    // Enrichment seeds enrich rather than advance — they cannot join a chain.
    await expect(
      addChainEdge({ topicId: topic.taxonomy_id, chainKey: key, fromSeedId: c.seed_id, toSeedId: enrich.seed_id }),
    ).rejects.toBeInstanceOf(ChainError);
  });

  it("supports multiple competing chains in one topic, kept separate by key", async () => {
    const architect = await makeAccount({ endorsed: true });
    const { subject, topic } = await makeTaxonomyPair({ subject: `Compete-${Date.now()}` });
    const a = await publishSeedFixture({ architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id });
    const b = await publishSeedFixture({ architectId: architect.account_id, subjectId: subject.taxonomy_id, topicId: topic.taxonomy_id });

    const keyX = `x-${randomUUID()}`;
    const keyY = `y-${randomUUID()}`;
    await addChainEdge({ topicId: topic.taxonomy_id, chainKey: keyX, fromSeedId: a.seed_id, toSeedId: b.seed_id });
    await addChainEdge({ topicId: topic.taxonomy_id, chainKey: keyY, fromSeedId: b.seed_id, toSeedId: a.seed_id });

    expect(await chainSequence(keyX)).toEqual([a.seed_id, b.seed_id]);
    expect(await chainSequence(keyY)).toEqual([b.seed_id, a.seed_id]);
  });
});
