import { ArrowRight } from 'lucide-react'

const TONE_STYLES = {
  gray: 'bg-gray-100 text-gray-700 ring-gray-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  green: 'bg-green-50 text-green-700 ring-green-200',
  yellow: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200',
}

export function Badge({ children, tone = 'gray' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${TONE_STYLES[tone] || TONE_STYLES.gray}`}>
      {children}
    </span>
  )
}

const STATUS_TONES = {
  draft: 'gray', open: 'blue', pending: 'yellow', sent: 'blue',
  approved: 'green', accepted: 'green', won: 'green', completed: 'green', delivered: 'green',
  active: 'blue', in_progress: 'blue', in_production: 'blue', in_transit: 'blue',
  declined: 'red', lost: 'red', cancelled: 'red', low_stock: 'yellow', out_of_stock: 'red',
  brief_pending: 'yellow', revision_requested: 'yellow',
}

export function StatusBadge({ status }) {
  if (!status) return null
  const tone = STATUS_TONES[status] || 'gray'
  return <Badge tone={tone}>{status.replace(/_/g, ' ')}</Badge>
}

export function Card({ title, action, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

const SECTION_TONES = {
  gray: { bg: 'bg-white border-gray-200', icon: 'text-gray-500 bg-gray-100' },
  blue: { bg: 'bg-blue-50/40 border-blue-100', icon: 'text-blue-600 bg-blue-100' },
  green: { bg: 'bg-green-50/40 border-green-100', icon: 'text-green-600 bg-green-100' },
  purple: { bg: 'bg-purple-50/40 border-purple-100', icon: 'text-purple-600 bg-purple-100' },
  amber: { bg: 'bg-amber-50/40 border-amber-100', icon: 'text-amber-600 bg-amber-100' },
}

export function SectionBlock({ icon: Icon, title, action, children, tone = 'gray' }) {
  const t = SECTION_TONES[tone] || SECTION_TONES.gray
  return (
    <div className={`rounded-xl border ${t.bg} overflow-hidden`}>
      <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100 bg-white/60">
        <div className="flex items-center gap-2">
          {Icon && (
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${t.icon}`}>
              <Icon size={14} />
            </div>
          )}
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 border-dashed p-12 text-center">
      {Icon && <Icon size={32} className="mx-auto text-gray-300 mb-3" />}
      <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      {action}
    </div>
  )
}

export function Field({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      {Icon && <Icon size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />}
      <div className="min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-sm text-gray-900 truncate">{value || <span className="text-gray-400">—</span>}</div>
      </div>
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
    </div>
  )
}

export function PrimaryButton({ children, onClick, type = 'button', disabled = false, className = '' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, onClick, type = 'button', disabled = false, className = '' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors ${className}`}
    >
      {children}
    </button>
  )
}

export function formatCents(cents) {
  if (cents == null) return '—'
  return '€' + (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/**
 * Mirrors the team app's quote math.
 * Stored `subtotal_cents` is (line items subtotal − discount + delivery).
 * Returns derived parts for transparent customer display.
 */
export function deriveQuoteBreakdown(quote, lineItems = []) {
  const items_subtotal = lineItems.reduce((s, li) => s + (li.total_sales_cents || 0), 0)
  const delivery = quote.delivery_cost_cents || 0
  const stored_subtotal = quote.subtotal_cents || 0
  const after_discount = Math.max(0, stored_subtotal - delivery)
  const discount = Math.max(0, items_subtotal - after_discount)
  return {
    items_subtotal,
    discount,
    delivery,
    after_discount,
    subtotal: stored_subtotal,
    vat_rate: quote.vat_rate,
    vat: quote.vat_amount_cents || 0,
    total: quote.total_cents || 0,
  }
}

export function formatDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function Table({ columns, rows, onRowClick, emptyLabel = 'No records.' }) {
  if (!rows?.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
        {emptyLabel}
      </div>
    )
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {columns.map((c) => (
                <th key={c.key} className="px-3 sm:px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                  {c.label}
                </th>
              ))}
              {onRowClick && <th className="w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-gray-50 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className="px-3 sm:px-5 py-3 text-gray-900 align-top">
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
                {onRowClick && (
                  <td className="pr-4 text-gray-400">
                    <ArrowRight size={14} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
