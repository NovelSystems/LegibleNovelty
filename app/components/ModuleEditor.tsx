"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addPageAction,
  deletePageAction,
  addElementAction,
  moveElementAction,
  updateElementContentAction,
  deleteElementAction,
  setAttestationAction,
  submitModuleAction,
  publishModuleAction,
} from "@/app/modules/actions";
import type {
  EditorPage,
  EditorElement,
  ImageContent,
  ModuleStatus,
  AiAttestation,
} from "@/app/modules/types";
import { TextElementEditor } from "./TextElementEditor";

const CANVAS_WIDTH = 816; // ~ US Letter at 96dpi; a fixed authoring frame.
const CANVAS_MIN_HEIGHT = 560;

type TipTapNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
};

// Cheap plain-text preview of a text element's TipTap doc for the canvas tile.
function plainText(json: unknown): string {
  const walk = (nodes?: TipTapNode[]): string => {
    let out = "";
    for (const n of nodes ?? []) {
      if (n.type === "text" && typeof n.text === "string") out += n.text;
      else if (n.type === "fillableField")
        out += `[${(n.attrs?.label as string) ?? "Fill in"}]`;
      if (n.content) out += walk(n.content);
      if (n.type === "paragraph") out += " ";
    }
    return out;
  };
  return walk((json as { content?: TipTapNode[] } | null)?.content).trim();
}

export function ModuleEditor({
  moduleId,
  status,
  initialAttestation,
  initialPages,
  maxPages,
  seedTitle,
  seedObjective,
  authorName,
}: {
  moduleId: string;
  status: ModuleStatus;
  initialAttestation: AiAttestation | null;
  initialPages: EditorPage[];
  maxPages: number | null; // null = no cap
  seedTitle: string;
  seedObjective: string;
  authorName: string;
}) {
  const router = useRouter();
  const [pages, setPages] = useState<EditorPage[]>(initialPages);
  const [attestation, setAttestation] = useState<AiAttestation | null>(
    initialAttestation,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [drag, setDrag] = useState<{
    elementId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const editable = status === "draft";
  const totalPages = pages.length;
  const atPageCap = maxPages != null && totalPages >= maxPages;

  const selected = useMemo(
    () =>
      pages.flatMap((p) => p.elements).find((e) => e.elementId === selectedId) ??
      null,
    [pages, selectedId],
  );

  function patchElement(elementId: string, patch: Partial<EditorElement>) {
    setPages((prev) =>
      prev.map((p) => ({
        ...p,
        elements: p.elements.map((e) =>
          e.elementId === elementId ? { ...e, ...patch } : e,
        ),
      })),
    );
  }

  function run<T>(action: Promise<T>, onOk?: (r: T) => void) {
    setError(null);
    startTransition(async () => {
      const res = (await action) as { ok: boolean; error?: string };
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      onOk?.(res as T);
    });
  }

  // --- pages ---
  function onAddPage() {
    run(addPageAction(moduleId), (res) => {
      const r = res as { ok: true; pageId: string; pageOrder: number };
      setPages((prev) => [
        ...prev,
        { pageId: r.pageId, pageOrder: r.pageOrder, elements: [] },
      ]);
    });
  }
  function onDeletePage(pageId: string) {
    run(deletePageAction(moduleId, pageId), () =>
      setPages((prev) => prev.filter((p) => p.pageId !== pageId)),
    );
  }

  // --- elements ---
  function onAddElement(pageId: string, type: EditorElement["elementType"]) {
    const z =
      Math.max(0, ...pages.flatMap((p) => p.elements).map((e) => e.zIndex)) + 1;
    run(addElementAction(moduleId, pageId, type, z), (res) => {
      const r = res as { ok: true; elementId: string };
      const el: EditorElement = {
        elementId: r.elementId,
        elementType: type,
        positionX: 24,
        positionY: 24,
        width: type === "image" ? 240 : 320,
        height: type === "image" ? 180 : 120,
        zIndex: z,
        content: type === "text" ? null : type === "image" ? { src: "", alt: "" } : { label: "Fill in" },
      };
      setPages((prev) =>
        prev.map((p) =>
          p.pageId === pageId ? { ...p, elements: [...p.elements, el] } : p,
        ),
      );
      setSelectedId(el.elementId);
    });
  }
  function onDeleteElement(elementId: string) {
    run(deleteElementAction(moduleId, elementId), () => {
      setPages((prev) =>
        prev.map((p) => ({
          ...p,
          elements: p.elements.filter((e) => e.elementId !== elementId),
        })),
      );
      if (selectedId === elementId) setSelectedId(null);
    });
  }
  function persistPosition(el: EditorElement) {
    run(
      moveElementAction(moduleId, el.elementId, {
        position_x: el.positionX,
        position_y: el.positionY,
        width: el.width,
        height: el.height,
        z_index: el.zIndex,
      }),
    );
  }

  // --- drag to move ---
  function onElementPointerDown(e: React.PointerEvent, el: EditorElement) {
    if (!editable) return;
    setSelectedId(el.elementId);
    setDrag({
      elementId: el.elementId,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.positionX,
      origY: el.positionY,
    });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onCanvasPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const nx = Math.max(0, drag.origX + (e.clientX - drag.startX));
    const ny = Math.max(0, drag.origY + (e.clientY - drag.startY));
    patchElement(drag.elementId, { positionX: Math.round(nx), positionY: Math.round(ny) });
  }
  function onCanvasPointerUp() {
    if (!drag) return;
    const el = pages.flatMap((p) => p.elements).find((x) => x.elementId === drag.elementId);
    setDrag(null);
    if (el) persistPosition(el);
  }

  // --- attestation + lifecycle ---
  function onSetAttestation(value: AiAttestation) {
    setAttestation(value);
    run(setAttestationAction(moduleId, value));
  }
  function onSubmit() {
    run(submitModuleAction(moduleId), () => router.refresh());
  }
  function onPublish() {
    run(publishModuleAction(moduleId), () => router.refresh());
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <nav className="min-w-0 text-sm text-muted-foreground">
            <a href="/seeds" className="hover:text-foreground">Seeds</a>
            <span className="mx-2">/</span>
            <span className="text-foreground">Module authoring</span>
            <p className="truncate text-heading">
              <span className="font-semibold">{seedTitle || "Untitled seed"}</span>
              <span className="ml-2 text-sm text-muted-foreground">— {seedObjective}</span>
            </p>
          </nav>
          <div className="flex items-center gap-3">
            <StatusChip status={status} />
            <span className="text-sm text-muted-foreground">
              Pages {totalPages}
              {maxPages != null ? ` / ${maxPages}` : ""}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl gap-6 px-6 py-6">
        {/* Canvas column */}
        <div className="min-w-0 flex-1 space-y-8">
          {pages.length === 0 && (
            <p className="rounded-lg border border-border bg-white p-8 text-center text-muted-foreground">
              No pages yet.{editable ? " Add the first page to start authoring." : ""}
            </p>
          )}

          {pages.map((page, i) => (
            <section key={page.pageId}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-heading">Page {i + 1}</h2>
                {editable && (
                  <div className="flex items-center gap-2 text-sm">
                    <button type="button" className="text-foreground hover:underline" onClick={() => onAddElement(page.pageId, "text")}>+ Text</button>
                    <button type="button" className="text-foreground hover:underline" onClick={() => onAddElement(page.pageId, "image")}>+ Image</button>
                    <button type="button" className="text-danger-text hover:underline" onClick={() => onDeletePage(page.pageId)}>Delete page</button>
                  </div>
                )}
              </div>
              <div
                className="relative overflow-hidden rounded-md border border-gray-300 bg-white shadow-sm"
                style={{ width: CANVAS_WIDTH, minHeight: CANVAS_MIN_HEIGHT, maxWidth: "100%" }}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={onCanvasPointerUp}
              >
                {page.elements.map((el) => (
                  <ElementTile
                    key={el.elementId}
                    el={el}
                    selected={selectedId === el.elementId}
                    editable={editable}
                    onPointerDown={(e) => onElementPointerDown(e, el)}
                    onSelect={() => setSelectedId(el.elementId)}
                    preview={el.elementType === "text" ? plainText(el.content) : undefined}
                  />
                ))}
              </div>
            </section>
          ))}

          {editable && (
            <button
              type="button"
              onClick={onAddPage}
              disabled={pending || atPageCap}
              className="rounded-md border border-border bg-white px-4 py-2 text-base font-medium text-foreground hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={atPageCap ? "This module is at its page limit for its curriculum load." : undefined}
            >
              {atPageCap ? `Page limit reached (${maxPages})` : "+ Add page"}
            </button>
          )}
        </div>

        {/* Side panel */}
        <aside className="w-80 shrink-0 space-y-6">
          {editable && selected ? (
            <PropertiesPanel
              key={selected.elementId}
              el={selected}
              onChangePosition={(patch) => {
                patchElement(selected.elementId, patch);
              }}
              onCommitPosition={() => {
                const el = pages.flatMap((p) => p.elements).find((x) => x.elementId === selected.elementId);
                if (el) persistPosition(el);
              }}
              onSaveContent={(content) => {
                patchElement(selected.elementId, { content });
                run(updateElementContentAction(moduleId, selected.elementId, content as never));
              }}
              onDelete={() => onDeleteElement(selected.elementId)}
            />
          ) : editable ? (
            <div className="rounded-lg border border-border bg-white p-4 text-sm text-muted-foreground">
              Select an element to edit it, or add a page and elements.
            </div>
          ) : null}

          <AttestationBar
            status={status}
            attestation={attestation}
            editable={editable}
            pending={pending}
            onSet={onSetAttestation}
            onSubmit={onSubmit}
            onPublish={onPublish}
          />

          <div className="min-h-5 text-sm" aria-live="polite">
            {error && <span className="text-danger-text">{error}</span>}
          </div>
          <p className="text-xs text-muted-foreground">Authoring by {authorName}.</p>
        </aside>
      </main>
    </div>
  );
}

function ElementTile({
  el,
  selected,
  editable,
  onPointerDown,
  onSelect,
  preview,
}: {
  el: EditorElement;
  selected: boolean;
  editable: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onSelect: () => void;
  preview?: string;
}) {
  const img = el.elementType === "image" ? (el.content as ImageContent | null) : null;
  return (
    <div
      onPointerDown={onPointerDown}
      onClick={onSelect}
      className={`absolute overflow-hidden rounded border ${selected ? "border-primary ring-2 ring-ring/40" : "border-gray-200"} bg-white ${editable ? "cursor-move" : ""}`}
      style={{
        left: el.positionX,
        top: el.positionY,
        width: el.width,
        height: el.height,
        zIndex: el.zIndex,
      }}
    >
      {el.elementType === "text" && (
        <div className="module-content h-full w-full overflow-hidden p-2 text-sm text-gray-800">
          {preview || <span className="text-muted-foreground">Empty text — select to edit</span>}
        </div>
      )}
      {el.elementType === "image" &&
        (img?.src ? (
          <img src={img.src} alt={img.alt} className="h-full w-full object-contain" />
        ) : (
          <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">Image — set a source</div>
        ))}
      {el.elementType === "fillable_field" && (
        <div className="grid h-full w-full place-items-center text-sm text-secondary-foreground">
          Fillable field
        </div>
      )}
    </div>
  );
}

function PropertiesPanel({
  el,
  onChangePosition,
  onCommitPosition,
  onSaveContent,
  onDelete,
}: {
  el: EditorElement;
  onChangePosition: (patch: Partial<EditorElement>) => void;
  onCommitPosition: () => void;
  onSaveContent: (content: unknown) => void;
  onDelete: () => void;
}) {
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  const field = "w-full rounded-md border border-input bg-white px-2 py-1 text-sm";
  return (
    <div className="space-y-3 rounded-lg border border-border bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-heading capitalize">{el.elementType.replace("_", " ")}</h3>
        <button type="button" className="text-sm text-danger-text hover:underline" onClick={onDelete}>Delete</button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["positionX", "positionY", "width", "height", "zIndex"] as const).map((k) => (
          <label key={k} className="text-xs text-muted-foreground">
            {k}
            <input
              type="number"
              className={field}
              value={el[k]}
              onChange={(e) => onChangePosition({ [k]: num(e.target.value) } as Partial<EditorElement>)}
              onBlur={onCommitPosition}
            />
          </label>
        ))}
      </div>

      {el.elementType === "text" && (
        <TextElementEditor initialContent={el.content} onSave={onSaveContent} />
      )}
      {el.elementType === "image" && (
        <ImageFields
          content={(el.content as ImageContent | null) ?? { src: "", alt: "" }}
          onSave={onSaveContent}
        />
      )}
    </div>
  );
}

function ImageFields({
  content,
  onSave,
}: {
  content: ImageContent;
  onSave: (content: ImageContent) => void;
}) {
  const [src, setSrc] = useState(content.src);
  const [alt, setAlt] = useState(content.alt);
  const field = "w-full rounded-md border border-input bg-white px-2 py-1 text-sm";
  return (
    <div className="space-y-2">
      <label className="block text-xs text-muted-foreground">
        Image source (URL)
        <input className={field} value={src} onChange={(e) => setSrc(e.target.value)} onBlur={() => onSave({ src, alt })} placeholder="https://…" />
      </label>
      <label className="block text-xs text-muted-foreground">
        Alt text
        <input className={field} value={alt} onChange={(e) => setAlt(e.target.value)} onBlur={() => onSave({ src, alt })} placeholder="Describe the image" />
      </label>
    </div>
  );
}

const ATTESTATIONS: { value: AiAttestation; label: string; hint: string }[] = [
  { value: "wholly_human", label: "Wholly human", hint: "No AI used in authoring." },
  { value: "ai_assisted_manual_flair", label: "AI-assisted, with manual flair", hint: "AI helped; a person shaped it." },
  { value: "ai_pipeline", label: "AI pipeline", hint: "Generated by an AI pipeline. Locks once set." },
];

function AttestationBar({
  status,
  attestation,
  editable,
  pending,
  onSet,
  onSubmit,
  onPublish,
}: {
  status: ModuleStatus;
  attestation: AiAttestation | null;
  editable: boolean;
  pending: boolean;
  onSet: (v: AiAttestation) => void;
  onSubmit: () => void;
  onPublish: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-heading">How was this made?</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          AI-assisted work is welcome here. This isn&apos;t a penalty — a declared human
          authorship simply earns a discoverability boost in search.
        </p>
      </div>
      <div className="space-y-1">
        {ATTESTATIONS.map((a) => (
          <label
            key={a.value}
            className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm ${attestation === a.value ? "border-primary bg-secondary" : "border-border"} ${!editable ? "opacity-70" : ""}`}
          >
            <input
              type="radio"
              name="attestation"
              className="mt-1"
              checked={attestation === a.value}
              disabled={!editable || attestation === "ai_pipeline"}
              onChange={() => onSet(a.value)}
            />
            <span>
              <span className="font-medium text-foreground">{a.label}</span>
              <span className="block text-xs text-muted-foreground">{a.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {status === "draft" && (
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || attestation == null}
          className="w-full rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground hover:bg-primary-hover active:bg-primary-active disabled:cursor-not-allowed disabled:bg-primary-disabled"
        >
          {pending ? "Working…" : "Submit for review"}
        </button>
      )}
      {status === "pending_review" && (
        <button
          type="button"
          onClick={onPublish}
          disabled={pending}
          className="w-full rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground hover:bg-primary-hover active:bg-primary-active disabled:cursor-not-allowed disabled:bg-primary-disabled"
        >
          {pending ? "Working…" : "Publish"}
        </button>
      )}
      {status === "published" && (
        <p className="text-sm text-secondary-foreground">This module is published.</p>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: ModuleStatus }) {
  const map: Record<ModuleStatus, { label: string; cls: string }> = {
    draft: { label: "Draft", cls: "bg-secondary text-secondary-foreground" },
    pending_review: { label: "In review", cls: "bg-gold-100 text-gold-700" },
    moderation_hold: { label: "On hold", cls: "bg-danger-100 text-danger-text" },
    published: { label: "Published", cls: "bg-teal-100 text-teal-700" },
  };
  const s = map[status];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}
