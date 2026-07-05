import crypto from 'node:crypto'

const MIME_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/bmp': 'bmp', 'image/tiff': 'tiff',
}

export function extFromMime(mime?: string): string {
  if (!mime) return ''
  return MIME_EXT[mime.toLowerCase()] || ''
}

export function sniffExt(buf: Buffer): string {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpg'
  if (buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === 'GIF8') return 'gif'
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  return ''
}

export function resolveExt(mime: string | undefined, buf: Buffer): string {
  return extFromMime(mime) || sniffExt(buf) || 'png'
}

export function hashName(buf: Buffer, ext: string): string {
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)
  return `${hash}.${ext || 'png'}`
}

// 扫描 content 里的 data:image/...;base64,... token，逐个交给 save 存盘并替换为 fa-img://{name}
const DATA_URL_RE = /data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g

export function rewriteEmbeddedImages(
  content: string,
  save: (buf: Buffer, mime: string) => string,
): { content: string; extracted: number } {
  let extracted = 0
  const out = content.replace(DATA_URL_RE, (full, subtype, b64) => {
    try {
      const buf = Buffer.from(b64, 'base64')
      if (buf.length === 0) return full
      const name = save(buf, `image/${subtype}`)
      extracted += 1
      return `fa-img://${name}`
    } catch {
      return full
    }
  })
  return { content: out, extracted }
}
