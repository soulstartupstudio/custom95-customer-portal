import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { FileText, Download, Eye, X, ArrowRight } from 'lucide-react'
import { PrimaryButton, SecondaryButton, formatDate } from './ui'
import {
  fetchBrandshopReports, markReportViewed, reportSignedUrl, downloadReport, periodLabel, formatFileSize,
} from '../lib/brandshopReports'

// Quarterly reports the Custom95 team publishes for a brandshop. The latest report sits on
// top; it carries a "New" badge until this person opens or downloads it. Earlier reports are
// listed below with the period they cover. Renders nothing while the shop has no report.

export function NewBadge({ className = '' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-green-600 text-white ${className}`}>
      New
    </span>
  )
}

function PeriodBadge({ report }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset bg-gray-50 text-gray-700 ring-gray-200 whitespace-nowrap">
      {periodLabel(report, { short: true })}
    </span>
  )
}

export default function BrandshopReportsWidget({ shop }) {
  const [reports, setReports] = useState(null) // null = loading
  const [preview, setPreview] = useState(null) // { report, url }
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!shop?.id) return
    let cancelled = false
    fetchBrandshopReports([shop.id]).then((rows) => { if (!cancelled) setReports(rows) })
    return () => { cancelled = true }
  }, [shop?.id])

  const seen = (r) => {
    if (!r.is_new) return
    setReports((prev) => (prev || []).map((x) => (x.id === r.id ? { ...x, is_new: false } : x)))
    markReportViewed(r.id)
  }

  const view = async (r) => {
    setBusyId(r.id); setError(null)
    try {
      const url = await reportSignedUrl(r)
      setPreview({ report: r, url })
      seen(r)
    } catch (e) { setError(e.message) } finally { setBusyId(null) }
  }

  const download = async (r) => {
    setBusyId(r.id); setError(null)
    try {
      await downloadReport(r, shop.shop_name)
      seen(r)
    } catch (e) { setError(e.message) } finally { setBusyId(null) }
  }

  if (!reports || reports.length === 0) return null

  const [latest, ...previous] = reports
  const newCount = reports.filter((r) => r.is_new).length

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <FileText size={14} className="text-gray-400" />Quarterly reports
        </h3>
        {newCount > 0 && (
          <span className="text-xs font-medium text-green-700">{newCount === 1 ? '1 new report' : `${newCount} new reports`}</span>
        )}
      </div>

      <div className="p-5">
        {/* Latest report */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-xl bg-gray-900 text-white flex items-center justify-center flex-shrink-0">
            <FileText size={20} />
          </div>
          <div className="flex-1 min-w-[12rem]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-semibold text-gray-900">{periodLabel(latest)}</span>
              {latest.is_new && <NewBadge />}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {latest.title} · PDF{latest.file_size_bytes ? ` · ${formatFileSize(latest.file_size_bytes)}` : ''} · published {formatDate(latest.created_at)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SecondaryButton onClick={() => view(latest)} disabled={busyId === latest.id}>
              <Eye size={14} />View
            </SecondaryButton>
            <PrimaryButton onClick={() => download(latest)} disabled={busyId === latest.id}>
              <Download size={14} />{busyId === latest.id ? 'Preparing…' : 'Download'}
            </PrimaryButton>
          </div>
        </div>

        {/* Earlier reports */}
        {previous.length > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">Previous reports</div>
            <ul className="divide-y divide-gray-100">
              {previous.map((r) => (
                <li key={r.id} className="py-2.5 flex items-center gap-3">
                  <PeriodBadge report={r} />
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-sm text-gray-800 truncate">{r.title}</span>
                    {r.is_new && <NewBadge />}
                    <span className="text-xs text-gray-400 hidden sm:inline">{periodLabel(r)}{r.file_size_bytes ? ` · ${formatFileSize(r.file_size_bytes)}` : ''}</span>
                  </div>
                  <button type="button" onClick={() => view(r)} disabled={busyId === r.id} title="View" className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-50">
                    <Eye size={15} />
                  </button>
                  <button type="button" onClick={() => download(r)} disabled={busyId === r.id} title="Download" className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-50">
                    <Download size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
      </div>

      {/* PDF popup */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-stretch sm:items-center justify-center sm:p-6" onClick={() => setPreview(null)}>
          <div className="w-full max-w-4xl bg-white sm:rounded-xl shadow-xl h-full sm:h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0 gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{preview.report.title} — {periodLabel(preview.report)}</div>
                <div className="text-[11px] text-gray-500 truncate">{shop.shop_name || shop.shop_domain}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <PrimaryButton onClick={() => download(preview.report)} disabled={busyId === preview.report.id} className="!px-3 !py-1.5 !text-xs">
                  <Download size={12} />Download
                </PrimaryButton>
                <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X size={20} /></button>
              </div>
            </div>
            <iframe src={preview.url} title={`${periodLabel(preview.report)} report`} className="flex-1 w-full border-0 bg-gray-100" />
          </div>
        </div>
      )}
    </div>
  )
}

// Dashboard nudge: one line while an unopened report exists for any of the company's shops.
export function BrandshopReportNudge({ company, navigate }) {
  const [item, setItem] = useState(null) // { shop, report, count }

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      const { data: shops } = await supabase.from('brandshops').select('id, shop_name, shop_domain').eq('company_id', company.id)
      if (cancelled || !shops?.length) return
      const reports = await fetchBrandshopReports(shops.map((s) => s.id))
      if (cancelled) return
      const unread = reports.filter((r) => r.is_new)
      if (!unread.length) return
      const shop = shops.find((s) => s.id === unread[0].brandshop_id)
      setItem({ shop, report: unread[0], count: unread.length })
    })()
    return () => { cancelled = true }
  }, [company?.id])

  if (!item) return null
  const { shop, report, count } = item
  return (
    <button
      type="button"
      onClick={() => navigate('brandshop')}
      className="w-full text-left bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-4 hover:border-green-300 hover:shadow-sm transition-all"
    >
      <div className="w-10 h-10 rounded-lg bg-green-600 text-white flex items-center justify-center flex-shrink-0"><FileText size={16} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">{count === 1 ? 'New brandshop report' : `${count} new brandshop reports`}</span>
          <NewBadge />
        </div>
        <div className="text-xs text-gray-600 truncate">{shop?.shop_name || shop?.shop_domain} · {report.title} · {periodLabel(report)}</div>
      </div>
      <span className="text-sm font-medium text-green-700 inline-flex items-center gap-1 flex-shrink-0">View report<ArrowRight size={14} /></span>
    </button>
  )
}
