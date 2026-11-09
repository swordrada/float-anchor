import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { YouTubeVideoNode, deleteAdjacentYouTube } from '../lib/youtubeEditor'
import { parseYouTubeUrl } from '../lib/youtube'
import YouTubePreview from './YouTubePreview'

function YouTubeNodeView({ node, selected, editor, getPos }: NodeViewProps) {
  const video = parseYouTubeUrl(node.attrs.src)
  const remove = () => {
    const pos = getPos()
    if (typeof pos !== 'number' || !editor.isEditable) return
    editor.commands.setNodeSelection(pos)
    deleteAdjacentYouTube('backward')(editor.state, editor.view.dispatch)
    editor.view.focus()
  }
  return <NodeViewWrapper className={`youtube-node${selected ? ' is-selected' : ''}`} contentEditable={false}>
    {video && <YouTubePreview key={`${video.id}:${video.start}`} video={video} onRemove={editor.isEditable ? remove : undefined} />}
  </NodeViewWrapper>
}

export const YouTubeEmbed = YouTubeVideoNode.extend({
  addNodeView() { return ReactNodeViewRenderer(YouTubeNodeView) },
})
