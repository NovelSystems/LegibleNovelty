"use client";

import { useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { UniqueID } from "@tiptap/extension-unique-id";
import { FillableField } from "./tiptap/FillableField";

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

// TipTap editor for a text element. Authored module content, so it renders in
// the Lora `.module-content` font (not the interface font). Fillable fields are
// inserted as inline custom nodes that get a unique id via UniqueID. Content is
// persisted on blur.
export function TextElementEditor({
  initialContent,
  onSave,
}: {
  initialContent: unknown;
  onSave: (json: unknown) => void;
}) {
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const editor = useEditor({
    immediatelyRender: false, // SSR-safe in the App Router
    extensions: [
      StarterKit,
      UniqueID.configure({ types: ["fillableField"] }),
      FillableField,
    ],
    content: (initialContent as object) ?? EMPTY_DOC,
    editorProps: {
      attributes: { class: "module-content tiptap-area" },
    },
    onBlur: ({ editor }) => saveRef.current(editor.getJSON()),
  });

  if (!editor) return null;

  return (
    <div className="rounded-md border border-border">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn =
    "rounded px-2 py-1 text-sm text-foreground hover:bg-muted data-[active=true]:bg-secondary data-[active=true]:text-secondary-foreground";
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-gray-50 p-1">
      <button
        type="button"
        className={btn}
        data-active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        className={btn}
        data-active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </button>
      <button
        type="button"
        className={btn}
        data-active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </button>
      <button
        type="button"
        className={btn}
        data-active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </button>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      <button
        type="button"
        className={btn}
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertContent({ type: "fillableField", attrs: { label: "Fill in" } })
            .run()
        }
        title="Insert a fillable field"
      >
        + Fillable field
      </button>
    </div>
  );
}
