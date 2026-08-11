import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createModule, publishModule, submitForReview, ModuleError } from "@/lib/modules";
import {
  addPage,
  assertUnderPageCap,
  createElement,
  extractFillableFields,
  findFillableFieldInModule,
  getModuleTree,
  moduleMaxPages,
  moveElement,
} from "@/lib/module-authoring";
import { canViewModule } from "@/lib/module-visibility";
import { makeAccount, dobForAge } from "./helpers/factory";
import { makePublishedPrimarySeed, makeModuleWithText } from "./helpers/module-factory";

describe("Module Editor — authoring model + visibility gate", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("instantiates real ModuleElement rows from a template, movable afterward", async () => {
    const { seed } = await makePublishedPrimarySeed();
    const author = await makeAccount();
    const module = await createModule({ authorAccountId: author.account_id, primarySeedId: seed.seed_id });
    const template = await prisma.moduleTemplate.create({
      data: {
        name: "Title + body",
        element_layout: {
          elements: [
            { element_type: "text", position_x: 10, position_y: 10, width: 300, height: 60, z_index: 0, content: { plainText: "Title" } },
            { element_type: "text", position_x: 10, position_y: 80, width: 300, height: 200, z_index: 1, content: { plainText: "Body" } },
          ],
        },
      },
    });
    const page = await addPage(module.module_id, 0, template.template_id);

    const elements = await prisma.moduleElement.findMany({ where: { page_id: page.page_id }, orderBy: { z_index: "asc" } });
    expect(elements).toHaveLength(2);
    expect(elements[0].position_x).toBe(10);
    // The page records its origin template (informational only).
    const savedPage = await prisma.modulePage.findUniqueOrThrow({ where: { page_id: page.page_id } });
    expect(savedPage.template_id).toBe(template.template_id);

    // Moving a template-instantiated element is NOT blocked.
    const moved = await moveElement(elements[0].element_id, { position_x: 999, position_y: 888 });
    expect(moved.position_x).toBe(999);
  });

  it("round-trips pages, elements, and positions through create/read", async () => {
    const { seed } = await makePublishedPrimarySeed();
    const author = await makeAccount();
    const module = await createModule({ authorAccountId: author.account_id, primarySeedId: seed.seed_id });
    const p0 = await addPage(module.module_id, 0);
    const p1 = await addPage(module.module_id, 1);
    await createElement(p0.page_id, { element_type: "image", position_x: 5, position_y: 6, width: 100, height: 100, z_index: 2, content: { src: "img://x", alt: "x" } });
    await createElement(p1.page_id, { element_type: "text", position_x: 1, position_y: 2, width: 50, height: 20, z_index: 0, content: { plainText: "hi" } });

    const tree = await getModuleTree(module.module_id);
    expect(tree.map((p) => p.page_order)).toEqual([0, 1]);
    expect(tree[0].elements[0].element_type).toBe("image");
    expect(tree[0].elements[0].position_x).toBe(5);
    expect(tree[1].elements[0].content).toEqual({ plainText: "hi" });
  });

  it("carries a unique id on a fillable field nested in text content, queryable independently", async () => {
    const { seed } = await makePublishedPrimarySeed();
    const author = await makeAccount();
    const module = await createModule({ authorAccountId: author.account_id, primarySeedId: seed.seed_id });
    const page = await addPage(module.module_id, 0);
    // A TipTap text doc with a fillable field node (unique id via
    // @tiptap/extension-unique-id, generated frontend-side).
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [
          { type: "text", text: "Fill in: " },
          { type: "fillableField", attrs: { id: "field-abc-123", label: "answer" } },
        ] },
      ],
    };
    await createElement(page.page_id, { element_type: "text", position_x: 0, position_y: 0, width: 100, height: 40, z_index: 0, content });

    // Extractable from the content tree.
    expect(extractFillableFields(content).map((f) => f.id)).toEqual(["field-abc-123"]);
    // Queryable independently of the rest of the element's content.
    const found = await findFillableFieldInModule(module.module_id, "field-abc-123");
    expect(found).not.toBeNull();
    expect(found!.field.attrs.label).toBe("answer");
    expect(await findFillableFieldInModule(module.module_id, "no-such-id")).toBeNull();
  });

  it("gates unendorsed modules by AGE, reusing the 18+ check (not VE/LNC status)", async () => {
    const { seed } = await makePublishedPrimarySeed();
    const author = await makeAccount();
    const module = await makeModuleWithText(author.account_id, seed.seed_id, "content");
    await submitForReview(module.module_id, author.account_id);
    await publishModule(module.module_id, author.account_id);

    // Stubbed endorsement resolver (Library's real table doesn't exist yet).
    const noEndorsements = () => false;
    const hasEndorsement = () => true;

    const adult = { date_of_birth: dobForAge(25) }; // ordinary adult, no VE/LNC
    const graduatedMinor = { date_of_birth: dobForAge(15) }; // 13-17 minor
    const child = { date_of_birth: dobForAge(9) };

    // Unendorsed: adults can reach it; minors cannot (single age check).
    expect(await canViewModule(adult, module.module_id, noEndorsements)).toBe(true);
    expect(await canViewModule(graduatedMinor, module.module_id, noEndorsements)).toBe(false);
    expect(await canViewModule(child, module.module_id, noEndorsements)).toBe(false);

    // Endorsed content is visible to all ages.
    expect(await canViewModule(graduatedMinor, module.module_id, hasEndorsement)).toBe(true);
  });

  it("caps pages by the PINNED revision's curriculum_load, not the live seed", async () => {
    // makePublishedPrimarySeed publishes a seed with curriculum_load = worksheet
    // (cap 2), captured in its baseline SeedRevision.
    const { seed } = await makePublishedPrimarySeed();
    const author = await makeAccount();
    const module = await createModule({
      authorAccountId: author.account_id,
      primarySeedId: seed.seed_id,
    });
    expect(await moduleMaxPages(module.module_id)).toBe(2);

    // Edit the LIVE seed's curriculum_load to a larger tier AFTER the module
    // pinned its revision.
    await prisma.learningSeed.update({
      where: { seed_id: seed.seed_id },
      data: { curriculum_load: "extended_unit" },
    });

    // The cap is UNCHANGED — it reads the pinned snapshot, not the live seed.
    // This is the entire point of the snapshot-completeness fix.
    expect(await moduleMaxPages(module.module_id)).toBe(2);

    // Enforcement: pages up to the limit are allowed; the next is rejected.
    await assertUnderPageCap(module.module_id); // 0 pages — ok
    await addPage(module.module_id, 0);
    await assertUnderPageCap(module.module_id); // 1 page — ok
    await addPage(module.module_id, 1);
    // 2 pages == worksheet cap → rejected.
    await expect(assertUnderPageCap(module.module_id)).rejects.toBeInstanceOf(
      ModuleError,
    );
  });
});
