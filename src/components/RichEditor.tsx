import { useCallback, useState, useRef, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
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

td.addRule('emptyParagraph', {
  filter: (node) => {
    if (node.nodeName !== 'P') return false
    const html = (node as HTMLElement).innerHTML?.trim()
    return html === '<br>' || html === '' || html === '<br class="ProseMirror-trailingBreak">'
  },
  replacement: () => '\n\n<br>\n\n',
})

td.addRule('image', {
  filter: 'img',
  replacement: (_c, node) => {
    const el = node as HTMLElement
    const src = el.getAttribute('src') || ''
    const alt = el.getAttribute('alt') || ''
    return `![${alt}](${src})`
  },
})

td.addRule('coloredText', {
  filter: (node) => {
    return node.nodeName === 'SPAN' && !!(node as HTMLElement).style.color
  },
  replacement: (c, node) => {
    const color = (node as HTMLElement).style.color
    return `<span style="color: ${color}">${c}</span>`
  },
})

td.addRule('highlightMark', {
  filter: (node) => {
    return node.nodeName === 'MARK' && !!(node as HTMLElement).getAttribute('data-color')
  },
  replacement: (c, node) => {
    const color = (node as HTMLElement).getAttribute('data-color') || ''
    return `<mark data-color="${color}" style="background-color: ${color}">${c}</mark>`
  },
})

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
}

function mdToHtml(md: string): string {
  if (!md.trim()) return ''
  return marked.parse(md, { async: false }) as string
}

const TEXT_COLORS = [
  { label: 'Default', color: '' },
  { label: 'Gray', color: '#787774' },
  { label: 'Brown', color: '#9F6B53' },
  { label: 'Orange', color: '#D9730D' },
  { label: 'Yellow', color: '#CB9A22' },
  { label: 'Green', color: '#448361' },
  { label: 'Blue', color: '#337EA9' },
  { label: 'Purple', color: '#9065B0' },
  { label: 'Pink', color: '#C14C8A' },
  { label: 'Red', color: '#D44C47' },
]

const BG_COLORS = [
  { label: 'Default', color: '' },
  { label: 'Gray', color: '#F1F1EF' },
  { label: 'Brown', color: '#F4EEEE' },
  { label: 'Orange', color: '#FBECDD' },
  { label: 'Yellow', color: '#FBF3DB' },
  { label: 'Green', color: '#EDF3EC' },
  { label: 'Blue', color: '#E7F3F8' },
  { label: 'Purple', color: '#F6F3F9' },
  { label: 'Pink', color: '#FAF1F5' },
  { label: 'Red', color: '#FDEBEC' },
]

function ColorPicker({
  editor,
  onClose,
}: {
  editor: ReturnType<typeof useEditor>
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  if (!editor) return null

  return (
    <div className="color-picker-dropdown" ref={ref}>
      <div className="color-picker-section">
        <div className="color-picker-label">Color</div>
        <div className="color-picker-grid">
          {TEXT_COLORS.map((c) => (
            <button
              key={`t-${c.label}`}
              className={`color-swatch text-swatch${
                (!c.color && !editor.getAttributes('textStyle').color) ||
                editor.getAttributes('textStyle').color === c.color
                  ? ' active'
                  : ''
              }`}
              title={c.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (c.color) {
                  editor.chain().focus().setColor(c.color).run()
                } else {
                  editor.chain().focus().unsetColor().run()
                }
              }}
            >
              <span style={c.color ? { color: c.color } : undefined}>A</span>
            </button>
          ))}
        </div>
      </div>
      <div className="color-picker-section">
        <div className="color-picker-label">Background</div>
        <div className="color-picker-grid">
          {BG_COLORS.map((c) => (
            <button
              key={`b-${c.label}`}
              className={`color-swatch bg-swatch${
                (!c.color && !editor.isActive('highlight')) ||
                editor.isActive('highlight', { color: c.color })
                  ? ' active'
                  : ''
              }`}
              title={c.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (c.color) {
                  editor.chain().focus().toggleHighlight({ color: c.color }).run()
                } else {
                  editor.chain().focus().unsetHighlight().run()
                }
              }}
            >
              <span
                style={
                  c.color
                    ? { backgroundColor: c.color, color: '#37352F' }
                    : undefined
                }
              >
                A
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

interface Props {
  content: string
  onChange: (md: string) => void
}

export default function RichEditor({ content, onChange }: Props) {
  const [showColorPicker, setShowColorPicker] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'editor-link' },
        protocols: ['http', 'https', 'mailto', { scheme: 'fa', optionalSlashes: true }],
        validate: (url) => /^(https?:|mailto:|fa:)/.test(url),
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: { class: 'editor-image' },
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
        HTMLAttributes: { class: 'editor-highlight' },
      }),
      Placeholder.configure({
        placeholder: '输入内容，支持 Markdown 语法...',
      }),
    ],
    content: mdToHtml(content),
    onUpdate: ({ editor: e }) => {
      onChange(td.turndown(e.getHTML()))
    },
    editorProps: {
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault()
            const file = item.getAsFile()
            if (!file) return false
            fileToBase64(file).then((src) => {
              editor?.chain().focus().setImage({ src }).run()
            })
            return true
          }
        }
        return false
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files
        if (!files?.length) return false
        for (const file of files) {
          if (file.type.startsWith('image/')) {
            event.preventDefault()
            fileToBase64(file).then((src) => {
              editor?.chain().focus().setImage({ src }).run()
            })
            return true
          }
        }
        return false
      },
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

  const insertImage = useCallback(() => {
    if (!editor) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const src = await fileToBase64(file)
      editor.chain().focus().setImage({ src }).run()
    }
    input.click()
  }, [editor])

  if (!editor) return null

  const currentColor = editor.getAttributes('textStyle').color || ''

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
        <div className="tb-color-wrap">
          <button
            className={showColorPicker ? 'active' : ''}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowColorPicker(!showColorPicker)}
            title="文字颜色 / 高亮"
          >
            <span
              className="tb-color-icon"
              style={currentColor ? { color: currentColor } : undefined}
            >
              A
            </span>
            <span
              className="tb-color-underline"
              style={{
                backgroundColor: currentColor || 'var(--text-primary)',
              }}
            />
          </button>
          {showColorPicker && (
            <ColorPicker
              editor={editor}
              onClose={() => setShowColorPicker(false)}
            />
          )}
        </div>
        <span className="tb-sep" />
        <TB
          run={() => editor.chain().focus().toggleBulletList().run()}
          on={editor.isActive('bulletList')}
          tip="无序列表"
        >
          &bull;
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
        <TB run={insertImage} on={false} tip="插入图片">
          🖼
        </TB>
      </div>

      <div className="rich-editor-wrap">
        <EditorContent editor={editor} className="rich-editor markdown-body" />
      </div>
    </>
  )
}
