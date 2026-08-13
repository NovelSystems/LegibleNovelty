"use client";

import { useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { UniqueID } from "@tiptap/extension-unique-id";
import { FillableField } from "./tiptap/FillableField";

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

// TipTap editor for a text element, rendered in place on the canvas. Authored
// module content → Lora `.module-content` font. Fillable fields are inserted
// from the top toolbar into whichever editor is focused (registered via
// onActive). Content persists on blur.
export function TextElementEditor({
  initialContent,
  editable,
  onSave,
  onActive,
}: {
  initialContent: unknown;
  editable: boolean;
  onSave: (json: unknown) => void;
  onActive?: (editor: Editor | null) => void;
}) {
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const activeRef = useRef(onActive);
  activeRef.current = onActive;

  const editor = useEditor({
    editable,
    immediatelyRender: false, // SSR-safe in the App Router
    extensions: [
      StarterKit,
      UniqueID.configure({ types: ["fillableField"] }),
      FillableField,
    ],
    content: (initialContent as object) ?? EMPTY_DOC,
    editorProps: { attributes: { class: "module-content tiptap-area" } },
    onFocus: ({ editor }) => activeRef.current?.(editor),
    onBlur: ({ editor }) => {
      activeRef.current?.(null);
      saveRef.current(editor.getJSON());
    },
  });

  if (!editor) return null;

  return (
    <div className="flex h-full flex-col">
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className="min-h-0 flex-1 overflow-auto" />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn =
    "rounded px-1.5 py-0.5 text-xs text-foreground hover:bg-muted data-[active=true]:bg-secondary data-[active=true]:text-secondary-foreground";
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-gray-50 px-1 py-0.5">
      <button type="button" className={btn} data-active={editor.isActive("bold")} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></button>
      <button type="button" className={btn} data-active={editor.isActive("italic")} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></button>
      <button type="button" className={btn} data-active={editor.isActive("heading", { level: 2 })} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
      <button type="button" className={btn} data-active={editor.isActive("bulletList")} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</button>
      <span className="mx-0.5 h-3 w-px bg-border" aria-hidden />
      <button
        type="button"
        className={btn}
        title="Insert a fillable field inline"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertContent({ type: "fillableField", attrs: { label: "Fill in" } })
            .run()
        }
      >
        + Field
      </button>
    </div>
  );
}
