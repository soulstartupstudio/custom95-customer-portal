// Tiny CSV builder + browser download. Columns are { header, value: (row) => any }.
// Values are coerced to strings and quoted only when needed (comma/quote/newline).

function escapeCell(v) {
  if (v == null) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(columns, rows) {
  const header = columns.map((c) => escapeCell(c.header)).join(',')
  const body = (rows || []).map((row) => columns.map((c) => escapeCell(c.value(row))).join(','))
  return [header, ...body].join('\r\n')
}

export function downloadCsv(filename, csv) {
  // Prepend a UTF-8 BOM so Excel renders accents/€ correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Helpers for common cell formats.
export const csvDate = (v) => (v ? String(v).slice(0, 10) : '')         // YYYY-MM-DD
export const csvEur = (cents) => (cents == null ? '' : (cents / 100).toFixed(2)) // plain dot-decimal
export const fileSlug = (s) => (s || 'export').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'export'
