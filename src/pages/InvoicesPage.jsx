import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Receipt, Download, CheckCircle2, AlertTriangle, Clock, Search } from 'lucide-react'
import { PageHeader, EmptyState, Spinner, Table, Badge, formatCents, formatDate } from '../components/ui'
import { downloadInvoicePdf } from '../lib/downloadInvoice'

const STATUS_LABEL = {
  draft: 'Draft', sent: 'Awaiting payment', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled',
  partly_paid: 'Partly paid', uncollectible: 'Uncollectible',
}
const STATUS_TONE = {
  draft: 'gray', sent: 'blue', paid: 'green', overdue: 'red', cancelled: 'gray',
  partly_paid: 'yellow', uncollectible: 'gray',
}
const STATUS_ICON = {
  paid: CheckCircle2,
  overdue: AlertTriangle,
  sent: Clock,
  partly_paid: Clock,
}

const FILTERS = [
  { id: 'open', label: 'Open' },         // sent / overdue / partly_paid
  { id: 'paid', label: 'Paid' },
  { id: 'all', label: 'All' },
]

export default function InvoicesPage({ company }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open')
  const [search, setSearch] = useState('')
  const [downloadingId, setDownloadingId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, subtotal_cents, vat_amount_cents, discount_cents, total_cents, amount_paid_cents, invoice_date, due_date, paid_at, payment_method, project_id, projects(name, project_number, proposal_id, proposals(proposal_number))')
        .eq('company_id', company.id)
        .neq('status', 'draft') // hide pre-finalised
        .order('invoice_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (cancelled) return
      const enriched = (data ?? []).map((inv) => ({
        ...inv,
        display_project_number: inv.projects?.proposals?.proposal_number ?? inv.projects?.project_number,
      }))
      setRows(enriched)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id])

  const filtered = useMemo(() => {
    let r = rows
    if (filter === 'open') r = r.filter((x) => ['sent', 'overdue', 'partly_paid'].includes(x.status))
    else if (filter === 'paid') r = r.filter((x) => x.status === 'paid')
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter((x) =>
        String(x.invoice_number || '').includes(q) ||
        x.projects?.name?.toLowerCase().includes(q) ||
        String(x.display_project_number || '').includes(q)
      )
    }
    return r
  }, [rows, filter, search])

  const totals = useMemo(() => {
    let outstanding = 0
    let paid = 0
    for (const r of rows) {
      if (r.status === 'paid') paid += r.total_cents || 0
      else if (['sent', 'overdue', 'partly_paid'].includes(r.status)) {
        outstanding += (r.total_cents || 0) - (r.amount_paid_cents || 0)
      }
    }
    return { outstanding, paid }
  }, [rows])

  const handleDownload = async (inv) => {
    setError(null)
    setDownloadingId(inv.id)
    try {
      await downloadInvoicePdf(inv.id)
    } catch (e) {
      setError(`Could not download invoice #${inv.invoice_number}: ${e.message || e}`)
    } finally {
      setDownloadingId(null)
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" subtitle="Your invoices from Custom95 — download the PDF anytime." />

      {/* Stat strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatTile
          tone="amber"
          icon={Clock}
          label="Outstanding"
          value={formatCents(totals.outstanding)}
          hint={`${rows.filter((r) => ['sent', 'overdue', 'partly_paid'].includes(r.status)).length} invoice(s) awaiting payment`}
        />
        <StatTile
          tone="green"
          icon={CheckCircle2}
          label="Paid this account"
          value={formatCents(totals.paid)}
          hint={`${rows.filter((r) => r.status === 'paid').length} invoice(s) settled`}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md ${filter === f.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search invoice # or project..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={rows.length === 0 ? 'No invoices yet' : 'No matching invoices'}
          description={rows.length === 0 ? 'Your invoices will appear here once your team issues them.' : 'Try a different filter or search term.'}
        />
      ) : (
        <Table
          columns={[
            {
              key: 'invoice_number',
              label: 'Invoice #',
              render: (r) => <span className="font-medium text-gray-900">#{r.invoice_number ?? '—'}</span>,
            },
            {
              key: 'project',
              label: 'Project',
              render: (r) => (
                <div className="min-w-0">
                  <div className="text-sm text-gray-900 truncate">{r.projects?.name || '—'}</div>
                  {r.display_project_number && <div className="text-[10px] text-gray-400">Project #{r.display_project_number}</div>}
                </div>
              ),
            },
            {
              key: 'invoice_date',
              label: 'Issued',
              render: (r) => <span className="text-gray-700 text-xs">{formatDate(r.invoice_date) || '—'}</span>,
            },
            {
              key: 'due_date',
              label: 'Due',
              render: (r) => <span className="text-gray-700 text-xs">{formatDate(r.due_date) || '—'}</span>,
            },
            {
              key: 'status',
              label: 'Status',
              render: (r) => {
                const Icon = STATUS_ICON[r.status]
                return (
                  <Badge tone={STATUS_TONE[r.status] || 'gray'}>
                    {Icon && <Icon size={10} className="mr-1" />}
                    {STATUS_LABEL[r.status] || r.status}
                  </Badge>
                )
              },
            },
            {
              key: 'total',
              label: 'Total',
              render: (r) => (
                <div className="text-right">
                  <div className="text-gray-900 font-semibold">{formatCents(r.total_cents)}</div>
                  {r.status === 'partly_paid' && r.amount_paid_cents > 0 && (
                    <div className="text-[10px] text-gray-500">{formatCents(r.amount_paid_cents)} paid</div>
                  )}
                </div>
              ),
            },
            {
              key: 'actions',
              label: '',
              render: (r) => (
                <div className="flex items-center justify-end">
                  <button
                    onClick={() => handleDownload(r)}
                    disabled={downloadingId === r.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                    title="Download PDF"
                  >
                    <Download size={12} />{downloadingId === r.id ? 'Preparing…' : 'Download PDF'}
                  </button>
                </div>
              ),
            },
          ]}
          rows={filtered}
        />
      )}
    </div>
  )
}

function StatTile({ tone = 'gray', icon: Icon, label, value, hint }) {
  const tones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    green: 'border-green-200 bg-green-50 text-green-900',
    gray: 'border-gray-200 bg-white text-gray-900',
  }
  return (
    <div className={`rounded-xl border p-4 ${tones[tone] || tones.gray}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
        {Icon && <Icon size={13} />}{label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs opacity-70 mt-0.5">{hint}</div>}
    </div>
  )
}
