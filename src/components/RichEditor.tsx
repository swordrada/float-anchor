import { useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { marked } from 'marked'
import TurndownService from 'turndown'

const td = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
})

td.addRule('strikethrough', {
  filter: (node) => ['DEL', 'S', 'STRIKE'].includes(node.nodeName),
  replacement: (c) => `~~${c}~~`,
})

function mdToHtml(md: string): string {
  if (!md.trim()) return ''
  return marked.parse(md, { async: false }) as string
}

interface Props {
  content: string
  onChange: (md: string) => void
}

export default function RichEditor({ content, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'editor-link' },
      }),
      Placeholder.configure({
        placeholder: '输入内容，支持 Markdown 语法...',
      }),
    ],
    content: mdToHtml(content),
    onUpdate: ({ editor: e }) => {
      onChange(td.turndown(e.getHTML()))
    },
  })

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href ?? ''
    const url = window.prompt('输入链接地址：', prev)
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: url })
        .run()
    }
  }, [editor])

  if (!editor) return null

  const TB = ({
    run,
    on,
    tip,
    children,
  }: {
    run: () => void
    on: boolean
    tip: string
    children: React.ReactNode
  }) => (
    <button
      className={on ? 'active' : ''}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      title={tip}
    >
      {children}
    </button>
  )

  return (
    <>
      <div className="card-edit-toolbar">
        <TB
          run={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          on={editor.isActive('heading', { level: 2 })}
          tip="二级标题"
        >
          H2
        </TB>
        <TB
          run={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          on={editor.isActive('heading', { level: 3 })}
          tip="三级标题"
        >
          H3
        </TB>
        <TB
          run={() =>
            editor.chain().focus().toggleHeading({ level: 4 }).run()
          }
          on={editor.isActive('heading', { level: 4 })}
          tip="四级标题"
        >
          H4
        </TB>
        <span className="tb-sep" />
        <TB
          run={() => editor.chain().focus().toggleBold().run()}
          on={editor.isActive('bold')}
          tip="加粗 ⌘B"
        >
          <strong>B</strong>
        </TB>
        <TB
          run={() => editor.chain().focus().toggleItalic().run()}
          on={editor.isActive('italic')}
          tip="斜体 ⌘I"
        >
          <em>I</em>
        </TB>
        <TB
          run={() => editor.chain().focus().toggleStrike().run()}
          on={editor.isActive('strike')}
          tip="删除线"
        >
          <s>S</s>
        </TB>
        <TB
          run={() => editor.chain().focus().toggleCode().run()}
          on={editor.isActive('code')}
          tip="行内代码"
        >
          &lt;/&gt;
        </TB>
        <span className="tb-sep" />
        <TB
          run={() => editor.chain().focus().toggleBulletList().run()}
          on={editor.isActive('bulletList')}
          tip="无序列表"
        >
          •
        </TB>
        <TB
          run={() => editor.chain().focus().toggleOrderedList().run()}
          on={editor.isActive('orderedList')}
          tip="有序列表"
        >
          1.
        </TB>
        <TB
          run={() => editor.chain().focus().toggleBlockquote().run()}
          on={editor.isActive('blockquote')}
          tip="引用"
        >
          &gt;
        </TB>
        <TB run={setLink} on={editor.isActive('link')} tip="链接">
          🔗
        </TB>
      </div>

      <div className="rich-editor-wrap">
        <EditorContent editor={editor} className="rich-editor markdown-body" />
      </div>
    </>
  )
}
