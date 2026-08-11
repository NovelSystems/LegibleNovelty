// Shared types for the Module Editor surface (plain module — no directive — so
// both the server actions and the client canvas can import it).

export type ModuleElementType = "text" | "image" | "fillable_field";
export type ModuleStatus =
  | "draft"
  | "pending_review"
  | "moderation_hold"
  | "published";
export type AiAttestation =
  | "wholly_human"
  | "ai_assisted_manual_flair"
  | "ai_pipeline";

// Image element content shape (text content is TipTap JSON, kept as unknown).
export interface ImageContent {
  src: string;
  alt: string;
}

export interface EditorElement {
  elementId: string;
  elementType: ModuleElementType;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  zIndex: number;
  content: unknown;
}

export interface EditorPage {
  pageId: string;
  pageOrder: number;
  elements: EditorElement[];
}

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };
