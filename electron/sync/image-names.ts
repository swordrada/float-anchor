import path from 'node:path'

export const IMAGE_EXTENSION_CANDIDATES = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.tif', '.tiff']

export function getImageBasename(value: string) {
  const clean = value.split(/[?#]/)[0].replace(/\\/g, '/')
  return path.posix.basename(clean)
}

export function extractStoredImageName(value: string) {
  if (!value) return null

  let decoded = value.trim().replace(/^<|>$/g, '')
  try {
    decoded = decodeURIComponent(decoded)
  } catch {}

  const normalized = decoded.replace(/\\/g, '/')
  if (normalized.startsWith('fa-img://')) {
    return getImageBasename(normalized.replace(/^fa-img:\/\//, ''))
  }

  const imageName = getImageBasename(normalized)
  if (!imageName || !IMAGE_EXTENSION_CANDIDATES.includes(path.extname(imageName).toLowerCase())) {
    return null
  }

  const lower = normalized.toLowerCase()
  const looksLikeStoredImagePath = (
    lower.includes('/float-anchor/data/images/') ||
    lower.includes('/floatanchor/data/images/') ||
    lower.includes('/application support/float-anchor/data/images/') ||
    lower.includes('/appdata/roaming/float-anchor/data/images/')
  )

  return looksLikeStoredImagePath ? imageName : null
}

export function getReferencedImageNames(data: any) {
  const referenced = new Set<string>()

  for (const canvas of data?.canvases || []) {
    for (const card of canvas.cards || []) {
      const content = typeof card.content === 'string' ? card.content : ''
      for (const match of content.matchAll(/fa-img:\/\/([^\s)]+)/g)) {
        const imageName = extractStoredImageName(`fa-img://${match[1]}`)
        if (imageName) referenced.add(imageName)
      }
      for (const match of content.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)) {
        const imageName = extractStoredImageName(match[1])
        if (imageName) referenced.add(imageName)
      }
      for (const match of content.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
        const imageName = extractStoredImageName(match[1])
        if (imageName) referenced.add(imageName)
      }
    }
  }

  return referenced
}

export function isRemoteImageNameMatch(requestedName: string, remoteName: string) {
  if (remoteName === requestedName) return true
  const requestedBase = path.parse(path.basename(requestedName)).name || requestedName
  const remoteBase = path.posix.parse(remoteName).name || remoteName
  return requestedBase === remoteBase && IMAGE_EXTENSION_CANDIDATES.includes(path.extname(remoteName).toLowerCase())
}
