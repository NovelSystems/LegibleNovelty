import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeAccount } from "./helpers/factory";

// Awards backend ONLY (Task 9): the tables exist and accept inserts consistent
// with the schema. Nothing user-facing reads or writes them in Stage 1 — this
// test reaches them via direct database access, which is the only surface.
describe("Awards schema (Task 9) — backend only", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("accepts a category, a dated instance, and a nomination", async () => {
    const category = await prisma.awardCategory.create({
      data: {
        name: "Best Math Module",
        attachment_target_type: "module",
        is_cyclical: true,
        // eligibility_threshold intentionally left null (deferred, no placeholder).
      },
    });
    expect(category.eligibility_threshold).toBeNull();

    const creator = await makeAccount();
    const instance = await prisma.awardInstance.create({
      data: {
        category_id: category.category_id,
        cycle_label: "2026",
        target_id: randomUUID(),
        winning_creator_account_id: creator.account_id,
      },
    });
    expect(instance.category_id).toBe(category.category_id);

    const nominator = await makeAccount();
    const nomination = await prisma.awardNomination.create({
      data: {
        nominator_account_id: nominator.account_id,
        target_id: randomUUID(),
        rationale: "Exceptional clarity and rigor.",
      },
    });
    expect(nomination.rationale).toBeTruthy();
  });
});
