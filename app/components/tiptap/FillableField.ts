import { Node, mergeAttributes } from "@tiptap/react";

// A fillable field: an inline, atomic custom node nested INSIDE a text element's
// TipTap content (not a top-level ModuleElement). Each carries a unique `id`,
// assigned by the UniqueID extension (configured for this node type in the
// editor), plus a human label. Rendered as an inline placeholder chip.
export const FillableField = Node.create({
  name: "fillableField",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      // Managed by UniqueID.configure({ types: ["fillableField"] }).
      id: { default: null },
      label: {
        default: "Fill in",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-label") ?? "Fill in",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-label": (attrs.label as string) ?? "Fill in",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-fillable-field]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = (node.attrs.label as string) ?? "Fill in";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-fillable-field": "",
        class: "fillable-field",
      }),
      `[${label}]`,
    ];
  },
});
