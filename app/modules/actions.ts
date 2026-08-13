"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createModule,
  setAiAttestation,
  submitForReview,
  publishModule,
  touchModuleEdited,
  ModuleError,
  PublicationGateError,
} from "@/lib/modules";
import {
  addPage,
  assertUnderPageCap,
  createElement,
  moveElement,
  updateElementContent,
  parseMultipleChoiceContent,
  defaultMultipleChoiceContent,
} from "@/lib/module-authoring";
import type { Prisma } from "@prisma/client";
import type { ActionResult, ModuleElementType, AiAttestation } from "./types";

// Domain rules (ownership, gates, quota, page cap) live in lib/*. These actions
// resolve the signed-in author, enforce owner + draft-only editing, and adapt.

async function currentAccountId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

// Editing a module requires: signed in, the module's owner, and status = draft
// (authoring is locked once submitted for review). Throws otherwise.
async function loadEditableModule(moduleId: string, accountId: string) {
  const module = await prisma.contextualizedModule.findUnique({
    where: { module_id: moduleId },
  });
  if (!module || module.author_account_id !== accountId) {
    throw new ModuleError("Module not found.");
  }
  if (module.status !== "draft") {
    throw new ModuleError("Only a draft module can be edited.");
  }
  return module;
}

function fail(e: unknown, fallback: string): { ok: false; error: string } {
  if (e instanceof ModuleError || e instanceof PublicationGateError) {
    return { ok: false, error: e.message };
  }
  return { ok: false, error: fallback };
}

// --- on-ramp -----------------------------------------------------------------

// Start a Module from a PUBLISHED seed. createModule pins the module to the
// seed's latest revision; we only verify the seed is the caller's own and is
// published before handing off.
export async function startModuleAction(
  seedId: string,
): Promise<ActionResult<{ moduleId: string }>> {
  const accountId = await currentAccountId();
  if (!accountId) return { ok: false, error: "You must be signed in." };
  try {
    const seed = await prisma.learningSeed.findUnique({ where: { seed_id: seedId } });
    if (!seed || seed.deleted_at || seed.architect_account_id !== accountId) {
      return { ok: false, error: "Seed not found." };
    }
    if (seed.published_at == null) {
      return { ok: false, error: "Only a published seed can start a module." };
    }
    const module = await createModule({
      authorAccountId: accountId,
      primarySeedId: seedId,
    });
    return { ok: true, moduleId: module.module_id };
  } catch (e) {
    return fail(e, "Could not start a module.");
  }
}

// --- pages -------------------------------------------------------------------

export async function addPageAction(
  moduleId: string,
): Promise<ActionResult<{ pageId: string; pageOrder: number }>> {
  const accountId = await currentAccountId();
  if (!accountId) return { ok: false, error: "You must be signed in." };
  try {
    await loadEditableModule(moduleId, accountId);
    await assertUnderPageCap(moduleId); // reads the pinned snapshot's curriculum_load
    const count = await prisma.modulePage.count({ where: { module_id: moduleId } });
    const page = await addPage(moduleId, count);
    return { ok: true, pageId: page.page_id, pageOrder: page.page_order };
  } catch (e) {
    return fail(e, "Could not add a page.");
  }
}

export async function deletePageAction(
  moduleId: string,
  pageId: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  if (!accountId) return { ok: false, error: "You must be signed in." };
  try {
    await loadEditableModule(moduleId, accountId);
    // Ownership of the page is via the module (cascade-linked); scope the delete.
    await prisma.modulePage.deleteMany({ where: { page_id: pageId, module_id: moduleId } });
    return { ok: true };
  } catch (e) {
    return fail(e, "Could not delete the page.");
  }
}

// --- elements ----------------------------------------------------------------

const DEFAULT_TEXT_CONTENT = { type: "doc", content: [{ type: "paragraph" }] };
const DEFAULT_MC_CONTENT = defaultMultipleChoiceContent() as unknown as Prisma.InputJsonValue;
// Default element size as PERCENT of the 4:3 canvas.
const DEFAULT_SIZES: Record<ModuleElementType, { w: number; h: number }> = {
  text: { w: 84, h: 16 },
  image: { w: 50, h: 40 },
  fillable_field: { w: 30, h: 8 },
  multiple_choice: { w: 84, h: 70 },
};

export async function addElementAction(
  moduleId: string,
  pageId: string,
  elementType: ModuleElementType,
  zIndex: number,
): Promise<ActionResult<{ elementId: string }>> {
  const accountId = await currentAccountId();
  if (!accountId) return { ok: false, error: "You must be signed in." };
  try {
    await loadEditableModule(moduleId, accountId);
    const page = await prisma.modulePage.findFirst({
      where: { page_id: pageId, module_id: moduleId },
    });
    if (!page) return { ok: false, error: "Page not found." };
    const content: Prisma.InputJsonValue =
      elementType === "text"
        ? DEFAULT_TEXT_CONTENT
        : elementType === "image"
          ? { src: "", alt: "" }
          : elementType === "multiple_choice"
            ? DEFAULT_MC_CONTENT
            : { label: "Fill in" };
    // Positions/sizes are PERCENT of the 4:3 canvas (0–100), resolution-neutral.
    const size = DEFAULT_SIZES[elementType];
    const el = await createElement(pageId, {
      element_type: elementType,
      position_x: 8,
      position_y: 8,
      width: size.w,
      height: size.h,
      z_index: zIndex,
      content,
    });
    await touchModuleEdited(moduleId, accountId);
    return { ok: true, elementId: el.element_id };
  } catch (e) {
    return fail(e, "Could not add an element.");
  }
}

export async function moveElementAction(
  moduleId: string,
  elementId: string,
  position: {
    position_x?: number;
    position_y?: number;
    width?: number;
    height?: number;
    z_index?: number;
  },
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  if (!accountId) return { ok: false, error: "You must be signed in." };
  try {
    await loadEditableModule(moduleId, accountId);
    await assertElementInModule(elementId, moduleId);
    await moveElement(elementId, position);
    return { ok: true };
  } catch (e) {
    return fail(e, "Could not move the element.");
  }
}

export async function updateElementContentAction(
  moduleId: string,
  elementId: string,
  content: Prisma.InputJsonValue,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  if (!accountId) return { ok: false, error: "You must be signed in." };
  try {
    await loadEditableModule(moduleId, accountId);
    await assertElementInModule(elementId, moduleId);
    await updateElementContent(elementId, content);
    await touchModuleEdited(moduleId, accountId);
    return { ok: true };
  } catch (e) {
    return fail(e, "Could not save the element.");
  }
}

// Multiple-choice content goes through validation (stem present; option count
// within [MIN_MC_OPTIONS, MAX_MC_OPTIONS]) before it is written — unlike the
// free-form text/image content, which the generic action above stores as-is.
export async function updateMultipleChoiceContentAction(
  moduleId: string,
  elementId: string,
  content: unknown,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  if (!accountId) return { ok: false, error: "You must be signed in." };
  try {
    await loadEditableModule(moduleId, accountId);
    await assertElementInModule(elementId, moduleId);
    const parsed = parseMultipleChoiceContent(content); // throws ModuleError if invalid
    await updateElementContent(elementId, parsed as unknown as Prisma.InputJsonValue);
    await touchModuleEdited(moduleId, accountId);
    return { ok: true };
  } catch (e) {
    return fail(e, "Could not save the multiple-choice element.");
  }
}

export async function deleteElementAction(
  moduleId: string,
  elementId: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  if (!accountId) return { ok: false, error: "You must be signed in." };
  try {
    await loadEditableModule(moduleId, accountId);
    // Scope the delete to elements belonging to this module's pages.
    await prisma.moduleElement.deleteMany({
      where: { element_id: elementId, page: { module_id: moduleId } },
    });
    return { ok: true };
  } catch (e) {
    return fail(e, "Could not delete the element.");
  }
}

async function assertElementInModule(elementId: string, moduleId: string) {
  const found = await prisma.moduleElement.findFirst({
    where: { element_id: elementId, page: { module_id: moduleId } },
    select: { element_id: true },
  });
  if (!found) throw new ModuleError("Element not found.");
}

// --- attestation + lifecycle -------------------------------------------------

export async function setAttestationAction(
  moduleId: string,
  attestation: AiAttestation,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  if (!accountId) return { ok: false, error: "You must be signed in." };
  try {
    await setAiAttestation(moduleId, accountId, attestation);
    return { ok: true };
  } catch (e) {
    return fail(e, "Could not set the attestation.");
  }
}

export async function submitModuleAction(
  moduleId: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  if (!accountId) return { ok: false, error: "You must be signed in." };
  try {
    await submitForReview(moduleId, accountId);
    return { ok: true };
  } catch (e) {
    return fail(e, "Could not submit the module.");
  }
}

export async function publishModuleAction(
  moduleId: string,
): Promise<ActionResult> {
  const accountId = await currentAccountId();
  if (!accountId) return { ok: false, error: "You must be signed in." };
  try {
    await publishModule(moduleId, accountId);
    return { ok: true };
  } catch (e) {
    return fail(e, "Could not publish the module.");
  }
}
