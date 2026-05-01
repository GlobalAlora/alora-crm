'use client'

import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Underline from '@tiptap/extension-underline'
import {
  Bold, Italic, Underline as UnderlineIcon,
  List, ListOrdered, Link as LinkIcon, Unlink, Strikethrough,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  editable?: boolean
  minimal?: boolean
  className?: string
}

const EMPTY_HTML = '<p></p>'
const normalize = (s: string) => (s === EMPTY_HTML ? '' : s)

function ToolbarBtn({
  onClick, active, title, children,
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={cn(
        'p-1.5 rounded transition-colors',
        active ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-200'
      )}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null

  const handleLink = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const url = window.prompt('URL del hipervínculo:', 'https://')
    if (!url) return
    const href = url.startsWith('http') ? url : `https://${url}`
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 bg-slate-50">
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Negrita (Ctrl+B)"
      >
        <Bold size={13} />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Itálica (Ctrl+I)"
      >
        <Italic size={13} />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title="Subrayado (Ctrl+U)"
      >
        <UnderlineIcon size={13} />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Tachado"
      >
        <Strikethrough size={13} />
      </ToolbarBtn>

      <div className="w-px h-3.5 bg-slate-200 mx-1" />

      {editor.isActive('link') ? (
        <ToolbarBtn onClick={handleLink} active title="Quitar hipervínculo">
          <Unlink size={13} />
        </ToolbarBtn>
      ) : (
        <ToolbarBtn onClick={handleLink} title="Hipervínculo">
          <LinkIcon size={13} />
        </ToolbarBtn>
      )}

      <div className="w-px h-3.5 bg-slate-200 mx-1" />

      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Lista con viñetas"
      >
        <List size={13} />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Lista numerada"
      >
        <ListOrdered size={13} />
      </ToolbarBtn>
    </div>
  )
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = 'Escribí algo...',
  editable = true,
  minimal = false,
  className,
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline cursor-pointer hover:text-blue-800',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      TextStyle,
      Color,
    ],
    content: content || '',
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange(normalize(html))
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none text-slate-700 leading-relaxed',
          minimal ? 'min-h-[40px]' : 'min-h-[60px]'
        ),
      },
    },
  })

  // Sync content when prop changes externally (e.g. lead switches)
  useEffect(() => {
    if (!editor) return
    const current = normalize(editor.getHTML())
    const incoming = normalize(content ?? '')
    if (current !== incoming) {
      editor.commands.setContent(incoming || EMPTY_HTML)
    }
  }, [content, editor])

  if (!editor) return null

  const isEmpty = editor.isEmpty

  return (
    <div className={cn(
      'border border-slate-200 rounded-lg overflow-hidden bg-white',
      'focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-400',
      className
    )}>
      {editable && <Toolbar editor={editor} />}
      <div className="relative px-3 py-2">
        {isEmpty && editable && (
          <p className="absolute top-2 left-3 text-sm text-slate-300 italic pointer-events-none select-none">
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
