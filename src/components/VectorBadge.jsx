import { vectorStatus, VECTOR_LABEL, VECTOR_HINT } from '../lib/vectorFile'

// FB-186: "Vector" (green) / "Not vector" (amber) / "Check: PDF may be raster" (amber, outlined)
// next to a logo or design file. `isVector` = the stored column; `name` = file name (fallback
// when the column is empty). Renders nothing for files the check doesn't apply to (zip, font …).
const TONE = {
  vector: 'bg-green-50 text-green-700 ring-green-200',
  raster: 'bg-amber-50 text-amber-800 ring-amber-200',
  check: 'bg-white text-amber-700 ring-amber-300',
}
export default function VectorBadge({ isVector, name, size = 'sm', short = false, className = '' }) {
  const s = vectorStatus(isVector, name)
  if (!s) return null
  const label = short && s === 'check' ? 'Check PDF' : VECTOR_LABEL[s]
  const sz = size === 'xs' ? 'text-[9px] px-1 py-0' : 'text-[10px] px-1.5 py-0.5'
  return (
    <span title={VECTOR_HINT[s]} className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset whitespace-nowrap ${sz} ${TONE[s]} ${className}`}>
      {label}
    </span>
  )
}
