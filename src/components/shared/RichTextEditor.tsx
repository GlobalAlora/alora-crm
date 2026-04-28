'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { Bold, Italic, Underline, List, ListOrdered, Link as LinkIcon, Unlink } from 'lucide-react'
import { useEffect } from 'react'

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  editable?: boolean
  minimal?: boolean
}

function ToolbarButton({
  onClick,
  active,
  icon,
  title,
}: {
  onClick: () => void
  active?: boolean
  icon: React.ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-200 text-slate-600'
      }`}
    >
      {icon}
    </button>
  )
}

function Toolbar({ editor, minimal = false }: { editor: ReturnType<typeof useEditor>; minimal?: boolean }) {
  const setLink = () => {
    const url = window.prompt('Ingresa la URL del link:')
    if (url) {
      editor?.chain().focus().setLink({ href: url }).run()
    }
  }

  const unsetLink = () => {
    editor?.chain().focus().unsetLink().run()
  }

  return (
    <div className={`flex items-center gap-1 p-2 border-b bg-slate-50 ${minimal ? 'rounded-t-md' : ''}`}>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBold().run()}
        active={editor?.isActive('bold')}
        icon={<Bold size={14} />}
        title="Negrita"
      />
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        active={editor?.isActive('italic')}
        icon={<Italic size={14} />}
        title="Cursiva"
      />
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
        active={editor?.isActive('underline')}
        icon={<Underline size={14} />}
        title="Subrayado"
      />
      <div className="w-px h-5 bg-slate-300 mx-1" />
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        active={editor?.isActive('bulletList')}
        icon={<List size={14} />}
        title="Lista"
      />
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        active={editor?.isActive('orderedList')}
        icon={<ListOrdered size={14} />}
        title="Lista numerada"
      />
      <div className="w-px h-5 bg-slate-300 mx-1" />
      {editor?.isActive('link') ? (
        <ToolbarButton onClick={unsetLink} icon={<Unlink size={14} />} title="Quitar link" />
      ) : (
        <ToolbarButton onClick={setLink} icon={<LinkIcon size={14} />} title="Agregar link" />
      )}
    </div>
  )
}

export function RichTextEditor({ content, onChange, editable = true, minimal = false }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline cursor-pointer',
        },
      }),
      TextStyle,
      Color,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none text-slate-700 ${minimal ? 'min-h-[40px]' : 'min-h-[60px]'}`,
      },
    },
  })

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  if (!editor) return null

  return (
    <div className={`border rounded-md overflow-hidden ${minimal ? '' : ''}`}>
      {editable && <Toolbar editor={editor} minimal={minimal} />}
      <EditorContent editor={editor} />
    </div>
  )
}
