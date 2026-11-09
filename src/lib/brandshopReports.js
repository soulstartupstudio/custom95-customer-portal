import { supabase } from './supabase'

// Quarterly PDF reports the Custom95 team publishes per brandshop (team app › Brandshops ›
// Reports). Rows in brandshop_reports, files in the private bucket brandshop-reports; a report
// is "new" for this person until they open or download it (brandshop_report_views, written by
// the brandshop_report_mark_viewed RPC). Table + bucket come from the team-app migration
// supabase/migrations/20261109_brandshop_reports.sql.

export const REPORTS_BUCKET = 'brandshop-reports'

const d = (iso) => new Date(`${iso}T00:00:00`)
const fmt = (date, opts) => date.toLocaleDateString('en-GB', opts)

// "1 Aug – 31 Oct 2026" (full) / "Aug – Oct 2026" (short). Years shown twice only when they differ.
export function periodLabel(r, { short = false } = {}) {
  if (!r?.period_start || !r?.period_end) return ''
  const a = d(r.period_start), b = d(r.period_end)
  const sameYear = a.getFullYear() === b.getFullYear()
  if (short) {
    const sameMonth = sameYear && a.getMonth() === b.getMonth()
    if (sameMonth) return fmt(b, { month: 'short', year: 'numeric' })
    return sameYear
      ? `${fmt(a, { month: 'short' })} – ${fmt(b, { month: 'short', year: 'numeric' })}`
      : `${fmt(a, { month: 'short', year: 'numeric' })} – ${fmt(b, { month: 'short', year: 'numeric' })}`
  }
  return sameYear
    ? `${fmt(a, { day: 'numeric', month: 'short' })} – ${fmt(b, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `${fmt(a, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmt(b, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export function formatFileSize(n) {
  if (!n) return ''
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
}

// Newest period first, each with is_new for the signed-in person. Returns [] when the feature
// is not set up yet (table missing) so the page renders as if there were no reports.
export async function fetchBrandshopReports(brandshopIds) {
  const ids = (brandshopIds || []).filter(Boolean)
  if (!ids.length) return []
  const [res, auth] = await Promise.all([
    supabase
      .from('brandshop_reports')
      .select('id, brandshop_id, title, period_start, period_end, storage_path, file_name, file_size_bytes, created_at, brandshop_report_views(user_id)')
      .in('brandshop_id', ids)
      .order('period_end', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ])
  if (res.error) return []
  const uid = auth?.data?.user?.id
  return (res.data ?? []).map((r) => ({
    ...r,
    is_new: !(r.brandshop_report_views ?? []).some((v) => v.user_id === uid),
  }))
}

export async function markReportViewed(reportId) {
  try { await supabase.rpc('brandshop_report_mark_viewed', { p_report_id: reportId }) } catch (_) { /* badge only */ }
}

// File name the download gets: "kracht-brandshop-report-aug-oct-2026.pdf"
export function reportFileName(r, shopName) {
  const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `${[slug(shopName), slug(r.title), slug(periodLabel(r, { short: true }))].filter(Boolean).join('-')}.pdf`
}

export async function reportSignedUrl(r, { download = null, seconds = 600 } = {}) {
  const { data, error } = await supabase.storage
    .from(REPORTS_BUCKET)
    .createSignedUrl(r.storage_path, seconds, download ? { download } : undefined)
  if (error || !data?.signedUrl) throw new Error('This report could not be opened right now. Please try again in a moment.')
  return data.signedUrl
}

// Storage serves the signed URL with Content-Disposition: attachment, so the browser saves it.
export async function downloadReport(r, shopName) {
  const url = await reportSignedUrl(r, { download: reportFileName(r, shopName) })
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
