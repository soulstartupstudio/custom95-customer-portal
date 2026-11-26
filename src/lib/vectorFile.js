// FB-186 (Sem): is this logo / design file a vector file?
//
// Suppliers need vector artwork (SVG, AI, EPS, PDF with paths, CDR) for screen print,
// embroidery files and sharp production at any size. A PNG or JPG is a picture of the logo:
// fine for a mock-up, not for production. We tell at upload time and store the answer in
// `is_vector` (brand_assets, design_files): true = vector, false = not vector, null = unknown.
// The database fills it from the extension when a row arrives without it (edge functions,
// agents), so a PDF only gets a real verdict when it's uploaded through the browser.
//
// The same file lives in the team app (src/lib/vectorFile.js) — keep them in step.

const VECTOR_EXT = new Set(['svg', 'svgz', 'ai', 'eps', 'cdr'])
const RASTER_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'tif', 'tiff', 'psd', 'avif', 'bmp', 'heic'])

export const fileExt = (name) => (String(name || '').split(/[?#]/)[0].toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]) || ''

// By the name alone: 'vector' | 'raster' | 'pdf' (needs a look inside) | null (can't tell: zip, font …).
export function vectorKindByName(name) {
  const ext = fileExt(name)
  if (VECTOR_EXT.has(ext)) return 'vector'
  if (RASTER_EXT.has(ext)) return 'raster'
  if (ext === 'pdf') return 'pdf'
  return null
}

// What the badge says: 'vector' | 'raster' | 'check' (PDF we couldn't judge) | null (no badge).
export function vectorStatus(isVector, name) {
  if (isVector === true) return 'vector'
  if (isVector === false) return 'raster'
  const k = vectorKindByName(name)
  return k === 'pdf' ? 'check' : k
}

// ── PDF: a pragmatic look inside (first ~2 MB) ─────────────────────────────
// Content streams are Flate-compressed, so we inflate them (DecompressionStream) and count
// path operators (m l c v y re + fill/stroke) and text (BT … Tj). A logo PDF exported from
// Illustrator is full of them; a "PDF" that is one scanned / pasted picture only has
// `/Im0 Do` and an image XObject. Mixed or unreadable → unknown ("Check: PDF may be raster").
const PDF_SCAN_BYTES = 2 * 1024 * 1024
const MAX_STREAMS = 60

// Reads what inflates and keeps it when the stream ends in junk (the EOL before `endstream`,
// a stream cut off by the 2 MB window) — browsers throw at the end instead of returning.
async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') return null
  for (const fmt of ['deflate', 'deflate-raw']) {
    const chunks = []; let size = 0
    try {
      const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(fmt)).getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value); size += value.length
        if (size > 4 * 1024 * 1024) { reader.cancel().catch(() => {}); break }
      }
    } catch (_) { /* junk at the end, or the wrong format */ }
    if (size) {
      const out = new Uint8Array(size); let o = 0
      for (const c of chunks) { out.set(c, o); o += c.length }
      return out
    }
  }
  return null
}
const latin1 = (u8) => {
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
  return s
}
const NUM = '-?(?:\\d+\\.?\\d*|\\.\\d+)'
const PATH_RE = new RegExp(`(?:${NUM}\\s+){2}[ml]\\b|(?:${NUM}\\s+){4}(?:re|v|y)\\b|(?:${NUM}\\s+){6}c\\b`, 'g')
const TEXT_RE = /\bBT\b[\s\S]{0,400}?(?:Tj|TJ|')/g
const IMAGE_RE = /\/Subtype\s*\/Image\b/g

export async function inspectPdf(blob) {
  const head = new Uint8Array(await blob.slice(0, PDF_SCAN_BYTES).arrayBuffer())
  const raw = latin1(head)
  if (!raw.startsWith('%PDF') && !raw.slice(0, 1024).includes('%PDF')) return { status: 'check' }
  let images = (raw.match(IMAGE_RE) || []).length
  let paths = 0, texts = 0, read = 0
  const streamRe = /stream\r?\n/g
  let m, n = 0
  while ((m = streamRe.exec(raw)) && n < MAX_STREAMS) {
    const start = m.index + m[0].length
    const end = raw.indexOf('endstream', start)
    if (end < 0) break // cut off by the 2 MB window
    const dict = raw.slice(Math.max(0, m.index - 400), m.index)
    const lastDict = dict.slice(dict.lastIndexOf('<<'))
    streamRe.lastIndex = end + 9
    if (/\/Subtype\s*\/Image\b/.test(lastDict)) continue // the picture itself — counted above
    if (/\/(?:XRef|Metadata|EmbeddedFile|FontFile\d?)\b|\/Length1\b/.test(lastDict)) continue
    n++
    let text = null
    if (/\/FlateDecode\b/.test(lastDict)) {
      const out = await inflate(head.subarray(start, end))
      if (out) text = latin1(out)
    } else if (!/\/Filter\b/.test(lastDict)) {
      text = raw.slice(start, end)
    }
    if (text == null) continue
    read++
    images += (text.match(IMAGE_RE) || []).length // image XObjects inside object streams
    paths += (text.match(PATH_RE) || []).length
    texts += (text.match(TEXT_RE) || []).length
  }
  const vectorOps = paths + texts * 4
  if (!images && vectorOps > 0) return { status: 'vector', images, paths, texts }
  if (vectorOps >= 40) return { status: 'vector', images, paths, texts } // vector artwork (maybe with a small picture)
  if (images && read > 0 && vectorOps <= 4) return { status: 'raster', images, paths, texts } // one picture, maybe a crop mark
  return { status: 'check', images, paths, texts }
}

// For upload handlers: { is_vector: true | false | null, status }. Never throws.
export async function classifyVectorFile(file) {
  if (!file) return { is_vector: null, status: null }
  const kind = vectorKindByName(file.name) || (file.type === 'application/pdf' ? 'pdf' : /^image\/svg/.test(file.type || '') ? 'vector' : /^image\//.test(file.type || '') ? 'raster' : null)
  if (kind === 'vector') return { is_vector: true, status: 'vector' }
  if (kind === 'raster') return { is_vector: false, status: 'raster' }
  if (kind !== 'pdf') return { is_vector: null, status: null }
  try {
    const r = await inspectPdf(file)
    return { is_vector: r.status === 'vector' ? true : r.status === 'raster' ? false : null, status: r.status }
  } catch (_) {
    return { is_vector: null, status: 'check' }
  }
}

export const VECTOR_LABEL = { vector: 'Vector', raster: 'Not vector', check: 'Check: PDF may be raster' }
export const VECTOR_HINT = {
  vector: 'Vector file — sharp at any size, fine for production.',
  raster: 'Not a vector file (a picture of the logo). Fine for a mock-up; for production ask the customer for SVG / AI / EPS / PDF.',
  check: "PDF we couldn't judge — it may hold only a picture of the logo. Open it, or ask the customer for SVG / AI / EPS.",
}
export const NOT_VECTOR_SUPPLIER_NOTE = 'Logo is not a vector file — ask the customer for SVG/AI/EPS/PDF'
