import { prisma } from "@/lib/prisma";
import type { CurriculumLoad, ModuleElementType, Prisma } from "@prisma/client";
import { ModuleError } from "@/lib/modules";

// --- page cap (tied to the pinned SeedRevision snapshot) ---------------------
// Max pages per module, keyed by the curriculum_load of the module's PINNED seed
// revision. Named constants: the exact values are expected to be tuned later.
export const MODULE_PAGE_CAPS: Record<CurriculumLoad, number> = {
  worksheet: 2,
  short_unit: 10,
  extended_unit: 30,
};

// The page cap for a module, derived from its PINNED SeedRevision snapshot
// (curriculum_load frozen at module-creation time) — NOT the live seed. This is
// the whole point of the snapshot-completeness fix: editing the live seed's
// curriculum_load afterward must not change an existing module's cap. A null
// curriculum_load on the snapshot imposes no cap.
export async function moduleMaxPages(moduleId: string): Promise<number> {
  const module = await prisma.contextualizedModule.findUniqueOrThrow({
    where: { module_id: moduleId },
    select: { primary_seed_revision: { select: { curriculum_load: true } } },
  });
  const load = module.primary_seed_revision.curriculum_load;
  return load ? MODULE_PAGE_CAPS[load] : Number.POSITIVE_INFINITY;
}

// Throws if the module is already at its page cap. Called by the authoring UI's
// add-page action before creating a page.
export async function assertUnderPageCap(moduleId: string): Promise<void> {
  const [max, count] = await Promise.all([
    moduleMaxPages(moduleId),
    prisma.modulePage.count({ where: { module_id: moduleId } }),
  ]);
  if (count >= max) {
    throw new ModuleError(
      `This module is at its page limit (${max}) for its seed's curriculum load.`,
    );
  }
}

// Module authoring model (Module Editor Task 7): a module is an ordered sequence
// of pages; each page holds freely-positioned elements. Templates are a
// starting-point PREFILL (not a separate locked mode) — picking one just
// instantiates real ModuleElement rows at preset positions; nothing prevents
// moving them afterward. Fillable fields nest inside a text element's TipTap
// content (via @tiptap/extension-unique-id, generated frontend-side, MIT) — they
// are NOT their own top-level element_type.

export interface ElementSpec {
  element_type: ModuleElementType;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  z_index: number;
  content: Prisma.InputJsonValue;
}

// --- pages -------------------------------------------------------------------

export async function addPage(moduleId: string, pageOrder: number, templateId?: string) {
  const page = await prisma.modulePage.create({
    data: { module_id: moduleId, page_order: pageOrder, template_id: templateId ?? null },
  });
  if (templateId) await instantiateTemplate(page.page_id, templateId);
  return page;
}

// A template's element_layout is an array of ElementSpecs. Instantiating it
// creates REAL ModuleElement rows at the preset positions; the page records
// which template it came from (informational only — it does not lock the page).
export async function instantiateTemplate(pageId: string, templateId: string) {
  const template = await prisma.moduleTemplate.findUniqueOrThrow({ where: { template_id: templateId } });
  const layout = (template.element_layout as { elements?: ElementSpec[] })?.elements ?? [];
  await prisma.$transaction([
    prisma.modulePage.update({ where: { page_id: pageId }, data: { template_id: templateId } }),
    ...layout.map((spec) =>
      prisma.moduleElement.create({
        data: {
          page_id: pageId,
          element_type: spec.element_type,
          position_x: spec.position_x,
          position_y: spec.position_y,
          width: spec.width,
          height: spec.height,
          z_index: spec.z_index,
          content: spec.content,
        },
      }),
    ),
  ]);
  return prisma.moduleElement.findMany({ where: { page_id: pageId } });
}

// --- elements ----------------------------------------------------------------

export async function createElement(pageId: string, spec: ElementSpec) {
  return prisma.moduleElement.create({
    data: {
      page_id: pageId,
      element_type: spec.element_type,
      position_x: spec.position_x,
      position_y: spec.position_y,
      width: spec.width,
      height: spec.height,
      z_index: spec.z_index,
      content: spec.content,
    },
  });
}

// Free positioning is always available — moving an element is never blocked by
// its having come from a template.
export async function moveElement(
  elementId: string,
  position: { position_x?: number; position_y?: number; width?: number; height?: number; z_index?: number },
) {
  return prisma.moduleElement.update({ where: { element_id: elementId }, data: position });
}

export async function updateElementContent(elementId: string, content: Prisma.InputJsonValue) {
  return prisma.moduleElement.update({ where: { element_id: elementId }, data: { content } });
}

// Full page/element tree for a module, ordered — round-trips create/read/update.
export async function getModuleTree(moduleId: string) {
  return prisma.modulePage.findMany({
    where: { module_id: moduleId },
    orderBy: { page_order: "asc" },
    include: { elements: { orderBy: { z_index: "asc" } } },
  });
}

// --- fillable fields (nested in text content) --------------------------------

export interface FillableField {
  id: string;
  attrs: Record<string, unknown>;
}

// Recursively collect fillable-field nodes from a TipTap content tree. A fillable
// field is a node of type "fillableField" whose attrs carry the unique id.
export function extractFillableFields(content: unknown): FillableField[] {
  const found: FillableField[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] };
    if (n.type === "fillableField" && n.attrs && typeof n.attrs.id === "string") {
      found.push({ id: n.attrs.id, attrs: n.attrs });
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(content);
  return found;
}

// Find a specific fillable field by its unique id anywhere in a module's text
// elements — queryable INDEPENDENTLY of the rest of that element's content.
export async function findFillableFieldInModule(
  moduleId: string,
  fieldId: string,
): Promise<{ elementId: string; field: FillableField } | null> {
  const elements = await prisma.moduleElement.findMany({
    where: { page: { module_id: moduleId }, element_type: "text" },
  });
  for (const el of elements) {
    const field = extractFillableFields(el.content).find((f) => f.id === fieldId);
    if (field) return { elementId: el.element_id, field };
  }
  return null;
}
