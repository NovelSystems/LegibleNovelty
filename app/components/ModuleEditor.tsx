"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Type,
  Image as ImageIcon,
  FormInput,
  ListChecks,
  Trash2,
  Plus,
  Minus,
  X,
} from "lucide-react";
import {
  addPageAction,
  deletePageAction,
  addElementAction,
  moveElementAction,
  updateElementContentAction,
  updateMultipleChoiceContentAction,
  deleteElementAction,
  setAttestationAction,
  submitModuleAction,
  publishModuleAction,
} from "@/app/modules/actions";
import type {
  EditorPage,
  EditorElement,
  ImageContent,
  MultipleChoiceContent,
  ModuleStatus,
  ModuleElementType,
  AiAttestation,
} from "@/app/modules/types";
import { TextElementEditor } from "./TextElementEditor";

// Positions/sizes are PERCENT (0–100) of the fixed 4:3 canvas — resolution-neutral.
const MIN_PCT = 4;
// Client mirror of the authoritative bounds in lib/module-authoring.ts
// (MIN_MC_OPTIONS / MAX_MC_OPTIONS) — the server validator enforces them.
const MC_MIN_OPTIONS = 2;
const MC_MAX_OPTIONS = 10;

export function ModuleEditor({
  moduleId,
  status,
  initialAttestation,
  initialPages,
  maxPages,
  curriculumLoadLabel,
  seedTitle,
  authorName,
}: {
  moduleId: string;
  status: ModuleStatus;
  initialAttestation: AiAttestation | null;
  initialPages: EditorPage[];
  maxPages: number | null; // null = no cap
  curriculumLoadLabel: string | null; // e.g. "Worksheet" for the cap note
  seedTitle: string;
  authorName: string;
}) {
  const router = useRouter();
  const [pages, setPages] = useState<EditorPage[]>(initialPages);
  const [currentPageId, setCurrentPageId] = useState<string | null>(
    initialPages[0]?.pageId ?? null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showSubmit, setShowSubmit] = useState(false);
  const activeEditor = useRef<Parameters<
    NonNullable<React.ComponentProps<typeof TextElementEditor>["onActive"]>
  >[0] | null>(null);

  const editable = status === "draft";
  const currentPage = useMemo(
    () => pages.find((p) => p.pageId === currentPageId) ?? pages[0] ?? null,
    [pages, currentPageId],
  );
  const currentIndex = pages.findIndex((p) => p.pageId === currentPage?.pageId);
  const atPageCap = maxPages != null && pages.length >= maxPages;
  const selected =
    currentPage?.elements.find((e) => e.elementId === selectedId) ?? null;

  function run<T extends { ok: boolean; error?: string }>(
    action: Promise<T>,
    onOk?: (r: T) => void,
  ) {
    setError(null);
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      onOk?.(res);
    });
  }

  function patchElement(pageId: string, elementId: string, patch: Partial<EditorElement>) {
    setPages((prev) =>
      prev.map((p) =>
        p.pageId !== pageId
          ? p
          : {
              ...p,
              elements: p.elements.map((e) =>
                e.elementId === elementId ? { ...e, ...patch } : e,
              ),
            },
      ),
    );
  }

  // --- pages ---
  function onAddPage() {
    run(addPageAction(moduleId), (r) => {
      const rr = r as { ok: true; pageId: string; pageOrder: number };
      setPages((prev) => [...prev, { pageId: rr.pageId, pageOrder: rr.pageOrder, elements: [] }]);
      setCurrentPageId(rr.pageId);
    });
  }
  function onDeletePage(pageId: string) {
    run(deletePageAction(moduleId, pageId), () => {
      setPages((prev) => {
        const next = prev.filter((p) => p.pageId !== pageId);
        if (currentPageId === pageId) setCurrentPageId(next[0]?.pageId ?? null);
        return next;
      });
    });
  }

  // --- elements ---
  function onAddElement(type: ModuleElementType) {
    if (!currentPage) return;
    const z = Math.max(0, ...currentPage.elements.map((e) => e.zIndex)) + 1;
    run(addElementAction(moduleId, currentPage.pageId, type, z), (r) => {
      const rr = r as { ok: true; elementId: string };
      const content =
        type === "text"
          ? null
          : type === "image"
            ? { src: "", alt: "" }
            : type === "multiple_choice"
              ? {
                  stem: "",
                  allow_multiple: false,
                  options: [
                    { id: crypto.randomUUID(), label: "" },
                    { id: crypto.randomUUID(), label: "" },
                  ],
                }
              : { label: "Fill in" };
      const size =
        type === "image" ? { w: 50, h: 40 } : type === "multiple_choice" ? { w: 84, h: 70 } : type === "fillable_field" ? { w: 30, h: 8 } : { w: 84, h: 16 };
      const el: EditorElement = {
        elementId: rr.elementId,
        elementType: type,
        positionX: 8,
        positionY: 8,
        width: size.w,
        height: size.h,
        zIndex: z,
        content,
      };
      setPages((prev) =>
        prev.map((p) => (p.pageId === currentPage.pageId ? { ...p, elements: [...p.elements, el] } : p)),
      );
      setSelectedId(el.elementId);
    });
  }

  function onAddFillable() {
    // Prefer inline insertion into a focused text editor; otherwise a standalone
    // fillable element (the mockup's single toolbar button, reconciled to both).
    const ed = activeEditor.current;
    if (ed) {
      ed.chain().focus().insertContent({ type: "fillableField", attrs: { label: "Fill in" } }).run();
      return;
    }
    onAddElement("fillable_field");
  }

  function onDeleteSelected() {
    if (!selected || !currentPage) return;
    const { elementId } = selected;
    const pageId = currentPage.pageId;
    run(deleteElementAction(moduleId, elementId), () => {
      setPages((prev) =>
        prev.map((p) =>
          p.pageId === pageId ? { ...p, elements: p.elements.filter((e) => e.elementId !== elementId) } : p,
        ),
      );
      setSelectedId(null);
    });
  }

  function persistGeometry(pageId: string, el: EditorElement) {
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

  function onLayer(dir: "front" | "back") {
    if (!selected || !currentPage) return;
    const zs = currentPage.elements.map((e) => e.zIndex);
    const z = dir === "front" ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
    patchElement(currentPage.pageId, selected.elementId, { zIndex: z });
    persistGeometry(currentPage.pageId, { ...selected, zIndex: z });
  }

  function saveContent(pageId: string, elementId: string, content: unknown) {
    patchElement(pageId, elementId, { content });
    const el = pages.find((p) => p.pageId === pageId)?.elements.find((e) => e.elementId === elementId);
    // Multiple-choice content is validated server-side; everything else is
    // stored as free-form JSON.
    if (el?.elementType === "multiple_choice") {
      run(updateMultipleChoiceContentAction(moduleId, elementId, content));
    } else {
      run(updateElementContentAction(moduleId, elementId, content as never));
    }
  }

  // --- lifecycle ---
  function onSubmitConfirmed(attestation: AiAttestation) {
    setShowSubmit(false);
    run(setAttestationAction(moduleId, attestation), () =>
      run(submitModuleAction(moduleId), () => router.refresh()),
    );
  }
  function onPublish() {
    run(publishModuleAction(moduleId), () => router.refresh());
  }

  return (
    <div className="min-h-screen bg-white">
      <TopNav authorName={authorName} />

      {/* Breadcrumb + element toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-4">
        <div className="text-sm text-muted-foreground">
          Workshop / Modules / <span className="text-foreground">{seedTitle || "Untitled"}</span>
        </div>
        {editable && (
          <div className="flex items-center gap-1">
            <ToolbarBtn title="Text" onClick={() => onAddElement("text")}><Type size={16} /></ToolbarBtn>
            <ToolbarBtn title="Image" onClick={() => onAddElement("image")}><ImageIcon size={16} /></ToolbarBtn>
            <ToolbarBtn title="Fillable field" onClick={onAddFillable}><FormInput size={16} /></ToolbarBtn>
            <ToolbarBtn title="Multiple choice" onClick={() => onAddElement("multiple_choice")}><ListChecks size={16} /></ToolbarBtn>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <ToolbarBtn title="Bring forward" tone="accent" disabled={!selected} onClick={() => onLayer("front")}><BringForwardIcon /></ToolbarBtn>
            <ToolbarBtn title="Send back" tone="accent" disabled={!selected} onClick={() => onLayer("back")}><SendBackIcon /></ToolbarBtn>
            <ToolbarBtn title="Delete" tone="danger" disabled={!selected} onClick={onDeleteSelected}><Trash2 size={16} /></ToolbarBtn>
          </div>
        )}
      </div>

      {/* Pages sidebar + canvas */}
      <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 px-6 py-4">
        <PagesSidebar
          pages={pages}
          currentPageId={currentPage?.pageId ?? null}
          editable={editable}
          atPageCap={atPageCap}
          maxPages={maxPages}
          curriculumLoadLabel={curriculumLoadLabel}
          pending={pending}
          onSelect={(id) => { setCurrentPageId(id); setSelectedId(null); }}
          onAddPage={onAddPage}
          onDeletePage={onDeletePage}
        />

        <div className="flex flex-col items-center">
          {currentPage ? (
            <Canvas
              key={currentPage.pageId}
              page={currentPage}
              editable={editable}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onLiveGeometry={(elementId, patch) => patchElement(currentPage.pageId, elementId, patch)}
              onCommitGeometry={(el) => persistGeometry(currentPage.pageId, el)}
              onSaveContent={(elementId, content) => saveContent(currentPage.pageId, elementId, content)}
              registerActive={(ed) => { activeEditor.current = ed; }}
            />
          ) : (
            <p className="rounded-lg border border-border bg-gray-50 p-10 text-center text-muted-foreground">
              {editable ? "No pages yet — add the first page to start." : "This module has no pages."}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-400">
            Drag to move, drag a corner to resize. Layer and delete act on the current selection.
          </p>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border px-6 py-4">
        <div className="mb-3 flex items-center gap-3">
          <StatusChip status={status} />
          {currentPage && (
            <span className="text-sm text-muted-foreground">
              Page {currentIndex + 1} of {pages.length}
            </span>
          )}
          <span className="min-h-4 flex-1 text-sm text-danger-text" aria-live="polite">{error}</span>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.push("/seeds")} className="rounded-md border border-border bg-white px-4 py-2 text-base text-foreground hover:bg-gray-50">
            Save and exit
          </button>
          {status === "draft" && (
            <button type="button" onClick={() => setShowSubmit(true)} disabled={pending} className="rounded-md bg-primary px-4 py-2 text-base font-bold text-primary-foreground hover:bg-primary-hover active:bg-primary-active disabled:bg-primary-disabled">
              Submit for review
            </button>
          )}
          {status === "pending_review" && (
            <button type="button" onClick={onPublish} disabled={pending} className="rounded-md bg-primary px-4 py-2 text-base font-bold text-primary-foreground hover:bg-primary-hover active:bg-primary-active disabled:bg-primary-disabled">
              {pending ? "Working…" : "Publish"}
            </button>
          )}
        </div>
      </div>

      {showSubmit && (
        <SubmitModal
          initial={initialAttestation}
          pending={pending}
          onCancel={() => setShowSubmit(false)}
          onConfirm={onSubmitConfirmed}
        />
      )}
    </div>
  );
}

// --- top nav -----------------------------------------------------------------

function TopNav({ authorName }: { authorName: string }) {
  const tab = "text-sm";
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-3">
      <div className="flex items-center gap-7">
        <span className="text-[15px] font-bold text-primary">Legible Novelty</span>
        <nav className="flex gap-5 text-muted-foreground">
          <a href="/seeds" className={`${tab} hover:text-foreground`}>Seeds</a>
          <span className={`${tab} border-b-2 border-primary pb-3.5 font-bold text-primary`}>Modules</span>
          <span className={`${tab} text-gray-400`}>Lessons</span>
          <span className={`${tab} text-gray-400`}>Library</span>
        </nav>
      </div>
      <span className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground" title={authorName}>
        {initials(authorName)}
      </span>
    </header>
  );
}

function ToolbarBtn({
  title,
  onClick,
  disabled,
  tone,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "accent" | "danger";
  children: React.ReactNode;
}) {
  // Desktop: native hover tooltip via `title`. Touch: the tap fires onClick, and
  // we flash the label for ~3s as a confirmation (no separate preview tap).
  const [touchLabel, setTouchLabel] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "touch" && !disabled) {
      setTouchLabel(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setTouchLabel(false), 3000);
    }
  }

  const toneCls =
    tone === "danger"
      ? "border-danger-500 text-danger-text bg-danger-50"
      : tone === "accent"
        ? "border-primary text-primary bg-teal-50"
        : "border-border text-foreground bg-white hover:bg-gray-50";
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={onClick}
        onPointerDown={onPointerDown}
        disabled={disabled}
        className={`grid h-8 w-8 place-items-center rounded-md border ${toneCls} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {children}
      </button>
      <span
        role="status"
        className={`pointer-events-none absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-1.5 py-0.5 text-[10px] text-white transition-opacity duration-300 ${touchLabel ? "opacity-100" : "opacity-0"}`}
      >
        {title}
      </span>
    </span>
  );
}

// Layer icons: two overlapping squares (~40% overlap), one shaded (solid) and
// one outlined (white fill, colored border). SAME shapes/positions for both — only
// the paint order differs. Bring-forward paints the shaded square last (it covers
// the outlined one's corner); send-back paints the outlined square last.
function BringForwardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="2" width="9" height="9" rx="1" fill="#fff" stroke="currentColor" strokeWidth="1.4" />
      <rect x="5" y="5" width="9" height="9" rx="1" fill="currentColor" />
    </svg>
  );
}
function SendBackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5" y="5" width="9" height="9" rx="1" fill="currentColor" />
      <rect x="2" y="2" width="9" height="9" rx="1" fill="#fff" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

// --- pages sidebar -----------------------------------------------------------

function PagesSidebar({
  pages,
  currentPageId,
  editable,
  atPageCap,
  maxPages,
  curriculumLoadLabel,
  pending,
  onSelect,
  onAddPage,
  onDeletePage,
}: {
  pages: EditorPage[];
  currentPageId: string | null;
  editable: boolean;
  atPageCap: boolean;
  maxPages: number | null;
  curriculumLoadLabel: string | null;
  pending: boolean;
  onSelect: (id: string) => void;
  onAddPage: () => void;
  onDeletePage: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Pages</div>
      {pages.map((p, i) => {
        const active = p.pageId === currentPageId;
        return (
          <div key={p.pageId} className={`mb-2 rounded-md border p-1 ${active ? "border-2 border-primary bg-gray-50" : "border-border"}`}>
            <button type="button" onClick={() => onSelect(p.pageId)} className="block w-full">
              <span className="block h-16 rounded-sm border border-border bg-white" />
              <span className={`mt-1 block text-center text-[11px] ${active ? "font-bold text-primary" : "text-muted-foreground"}`}>Page {i + 1}</span>
            </button>
            {editable && pages.length > 1 && (
              <button type="button" onClick={() => onDeletePage(p.pageId)} className="mt-1 block w-full text-center text-[10px] text-danger-text hover:underline">Delete</button>
            )}
          </div>
        );
      })}
      {editable && (
        <>
          <button
            type="button"
            onClick={onAddPage}
            disabled={pending || atPageCap}
            className="w-full rounded-md border border-dashed border-gray-300 bg-gray-50 p-2 text-xs text-muted-foreground hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            + Add page
          </button>
          {atPageCap && (
            <div className="mt-1 text-center text-[10px] text-accent-text">
              {curriculumLoadLabel ?? "Page"} cap reached ({maxPages})
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- canvas ------------------------------------------------------------------

type Editor = NonNullable<
  Parameters<NonNullable<React.ComponentProps<typeof TextElementEditor>["onActive"]>>[0]
>;

function Canvas({
  page,
  editable,
  selectedId,
  onSelect,
  onLiveGeometry,
  onCommitGeometry,
  onSaveContent,
  registerActive,
}: {
  page: EditorPage;
  editable: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLiveGeometry: (elementId: string, patch: Partial<EditorElement>) => void;
  onCommitGeometry: (el: EditorElement) => void;
  onSaveContent: (elementId: string, content: unknown) => void;
  registerActive: (ed: Editor | null) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    el: EditorElement;
    corner: "move" | "nw" | "ne" | "sw" | "se";
    startX: number;
    startY: number;
  } | null>(null);

  function pct(dxPx: number, dyPx: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      dx: rect ? (dxPx / rect.width) * 100 : 0,
      dy: rect ? (dyPx / rect.height) * 100 : 0,
    };
  }

  function begin(
    e: React.PointerEvent,
    el: EditorElement,
    corner: "move" | "nw" | "ne" | "sw" | "se",
  ) {
    if (!editable) return;
    e.stopPropagation();
    onSelect(el.elementId);
    drag.current = { el, corner, startX: e.clientX, startY: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const { dx, dy } = pct(e.clientX - d.startX, e.clientY - d.startY);
    const g = { ...d.el };
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    if (d.corner === "move") {
      g.positionX = clamp(d.el.positionX + dx);
      g.positionY = clamp(d.el.positionY + dy);
    } else {
      if (d.corner.includes("e")) g.width = Math.max(MIN_PCT, d.el.width + dx);
      if (d.corner.includes("s")) g.height = Math.max(MIN_PCT, d.el.height + dy);
      if (d.corner.includes("w")) { g.width = Math.max(MIN_PCT, d.el.width - dx); g.positionX = d.el.positionX + dx; }
      if (d.corner.includes("n")) { g.height = Math.max(MIN_PCT, d.el.height - dy); g.positionY = d.el.positionY + dy; }
    }
    onLiveGeometry(d.el.elementId, {
      positionX: Math.round(g.positionX * 10) / 10,
      positionY: Math.round(g.positionY * 10) / 10,
      width: Math.round(g.width * 10) / 10,
      height: Math.round(g.height * 10) / 10,
    });
    d.el = g;
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (d) onCommitGeometry(d.el);
  }

  return (
    <div
      ref={canvasRef}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerDown={() => onSelect("")}
      className="relative aspect-[4/3] w-full max-w-[680px] rounded-md border border-gray-300 bg-white shadow-sm"
    >
      {[...page.elements]
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((el) => (
          <ElementView
            key={el.elementId}
            el={el}
            editable={editable}
            selected={selectedId === el.elementId}
            onBeginMove={(e) => begin(e, el, "move")}
            onBeginResize={(e, corner) => begin(e, el, corner)}
            onSaveContent={(content) => onSaveContent(el.elementId, content)}
            registerActive={registerActive}
          />
        ))}
    </div>
  );
}

function ElementView({
  el,
  editable,
  selected,
  onBeginMove,
  onBeginResize,
  onSaveContent,
  registerActive,
}: {
  el: EditorElement;
  editable: boolean;
  selected: boolean;
  onBeginMove: (e: React.PointerEvent) => void;
  onBeginResize: (e: React.PointerEvent, corner: "nw" | "ne" | "sw" | "se") => void;
  onSaveContent: (content: unknown) => void;
  registerActive: (ed: Editor | null) => void;
}) {
  const style: React.CSSProperties = {
    left: `${el.positionX}%`,
    top: `${el.positionY}%`,
    width: `${el.width}%`,
    height: `${el.height}%`,
    zIndex: el.zIndex,
  };
  return (
    <div
      className={`absolute rounded border bg-white ${selected ? "border-2 border-primary" : "border-border"}`}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* move grip (draggable) */}
      {editable && (
        <span
          onPointerDown={onBeginMove}
          className="absolute -top-2 left-1 z-10 cursor-move rounded bg-primary px-1 text-[9px] font-bold text-primary-foreground"
        >
          move
        </span>
      )}

      <div className="h-full w-full overflow-hidden">
        {el.elementType === "text" && (
          <TextElementEditor
            initialContent={el.content}
            editable={editable}
            onSave={onSaveContent}
            onActive={registerActive}
          />
        )}
        {el.elementType === "image" && (
          <ImageElement content={(el.content as ImageContent | null) ?? { src: "", alt: "" }} editable={editable} onSave={onSaveContent} />
        )}
        {el.elementType === "fillable_field" && (
          <div className="grid h-full w-full place-items-center p-1">
            <span className="fillable-field">
              {((el.content as { label?: string } | null)?.label as string) ?? "Fill in"}
            </span>
          </div>
        )}
        {el.elementType === "multiple_choice" && (
          <MultipleChoiceElement
            content={(el.content as MultipleChoiceContent | null) ?? { stem: "", allow_multiple: false, options: [] }}
            editable={editable}
            onSave={onSaveContent}
          />
        )}
      </div>

      {/* resize corners */}
      {editable && selected &&
        (["nw", "ne", "sw", "se"] as const).map((c) => (
          <span
            key={c}
            onPointerDown={(e) => onBeginResize(e, c)}
            className="absolute z-10 h-2.5 w-2.5 rounded-[1px] border border-white bg-primary"
            style={{
              cursor: `${c}-resize`,
              top: c[0] === "n" ? -5 : undefined,
              bottom: c[0] === "s" ? -5 : undefined,
              left: c[1] === "w" ? -5 : undefined,
              right: c[1] === "e" ? -5 : undefined,
            }}
          />
        ))}
    </div>
  );
}

// --- image element -----------------------------------------------------------

function ImageElement({
  content,
  editable,
  onSave,
}: {
  content: ImageContent;
  editable: boolean;
  onSave: (content: ImageContent) => void;
}) {
  const [src, setSrc] = useState(content.src);
  const [alt, setAlt] = useState(content.alt);
  if (!editable) {
    return src ? (
      <img src={src} alt={alt} className="h-full w-full object-contain" />
    ) : (
      <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">Image</div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        {src ? (
          <img src={src} alt={alt} className="h-full w-full object-contain" />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">No image yet</div>
        )}
      </div>
      <div className="space-y-1 border-t border-border bg-gray-50 p-1">
        <input className="w-full rounded border border-input px-1 py-0.5 text-xs" value={src} onChange={(e) => setSrc(e.target.value)} onBlur={() => onSave({ src, alt })} placeholder="Image URL" />
        <input className="w-full rounded border border-input px-1 py-0.5 text-xs" value={alt} onChange={(e) => setAlt(e.target.value)} onBlur={() => onSave({ src, alt })} placeholder="Alt text" />
      </div>
    </div>
  );
}

// --- multiple choice element -------------------------------------------------

function MultipleChoiceElement({
  content,
  editable,
  onSave,
}: {
  content: MultipleChoiceContent;
  editable: boolean;
  onSave: (content: MultipleChoiceContent) => void;
}) {
  const [mc, setMc] = useState<MultipleChoiceContent>(content);
  function commit(next: MultipleChoiceContent) {
    setMc(next);
    onSave(next);
  }
  const inputCls = "min-w-0 flex-1 rounded border border-input px-1.5 py-0.5 text-xs";
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Options</span>
          <div className="flex items-center overflow-hidden rounded border border-border">
            <button type="button" disabled={!editable || mc.options.length <= MC_MIN_OPTIONS} className="bg-gray-50 px-1.5 py-0.5 text-xs disabled:opacity-40" onClick={() => commit({ ...mc, options: mc.options.slice(0, -1) })}><Minus size={11} /></button>
            <span className="px-2 text-xs font-bold text-foreground">{mc.options.length}</span>
            <button type="button" disabled={!editable || mc.options.length >= MC_MAX_OPTIONS} className="bg-gray-50 px-1.5 py-0.5 text-xs disabled:opacity-40" onClick={() => commit({ ...mc, options: [...mc.options, { id: crypto.randomUUID(), label: "" }] })}><Plus size={11} /></button>
          </div>
        </div>
        {/* Author toggle: checkboxes (allow multiple) vs radio buttons (single). */}
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <input type="checkbox" checked={mc.allow_multiple} disabled={!editable} onChange={(e) => commit({ ...mc, allow_multiple: e.target.checked })} />
          Allow multiple answers
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        <input
          className="module-content mb-1.5 w-full rounded border border-input px-1.5 py-1 text-xs"
          value={mc.stem}
          disabled={!editable}
          placeholder="Question stem…"
          onChange={(e) => setMc({ ...mc, stem: e.target.value })}
          onBlur={() => onSave(mc)}
        />
        <div className="flex flex-col gap-1">
          {mc.options.map((opt, i) => (
            <div key={opt.id} className="flex items-center gap-1.5">
              {/* Format indicator only — checkbox or radio per the toggle. Not a
                  correctness marker (scoring is the deferred Quiz sub-stage). */}
              <input type={mc.allow_multiple ? "checkbox" : "radio"} disabled aria-hidden className="flex-shrink-0" />
              <input
                className={inputCls}
                value={opt.label}
                disabled={!editable}
                placeholder={`Option ${i + 1}`}
                onChange={(e) => setMc({ ...mc, options: mc.options.map((o, j) => (j === i ? { ...o, label: e.target.value } : o)) })}
                onBlur={() => onSave(mc)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- submit modal (attestation) ---------------------------------------------

// Display labels only — the backend ai_attestation enum values (wholly_human /
// ai_assisted_manual_flair / ai_pipeline) are unchanged. This is a UI copy swap,
// not a schema change.
const ATTESTATIONS: { value: AiAttestation; label: string; hint: string }[] = [
  { value: "wholly_human", label: "Fully Human Authored", hint: "No AI used in authoring." },
  { value: "ai_assisted_manual_flair", label: "AI-Assisted", hint: "AI helped; a person shaped the result." },
  { value: "ai_pipeline", label: "Mostly AI-Generated", hint: "Generated largely by an AI pipeline." },
];

function SubmitModal({
  initial,
  pending,
  onCancel,
  onConfirm,
}: {
  initial: AiAttestation | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (a: AiAttestation) => void;
}) {
  const [value, setValue] = useState<AiAttestation | null>(initial);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-md">
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-xl text-heading">How was this module made?</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          An AI attestation is required before submission. AI-assisted work is
          welcome here — this isn&apos;t a penalty; undeclared or human-only work
          simply earns a discoverability boost in search.
        </p>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">Attestation</span>
          <select
            value={value ?? ""}
            onChange={(e) => setValue(e.target.value ? (e.target.value as AiAttestation) : null)}
            className="w-full rounded-md border border-input bg-white px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          >
            <option value="" disabled>Select an attestation…</option>
            {ATTESTATIONS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </label>
        {value && (
          <p className="mt-2 text-xs text-muted-foreground">
            {ATTESTATIONS.find((a) => a.value === value)?.hint}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-border bg-white px-4 py-2 text-base text-foreground hover:bg-gray-50">Cancel</button>
          <button type="button" disabled={pending || value == null} onClick={() => value && onConfirm(value)} className="rounded-md bg-primary px-4 py-2 text-base font-bold text-primary-foreground hover:bg-primary-hover disabled:bg-primary-disabled">
            {pending ? "Working…" : "Confirm and submit"}
          </button>
        </div>
      </div>
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
  return <span className={`rounded px-2.5 py-1 text-xs font-bold ${s.cls}`}>{s.label}</span>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
