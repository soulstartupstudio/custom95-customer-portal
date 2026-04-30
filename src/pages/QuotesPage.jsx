import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Receipt } from 'lucide-react'
import { PageHeader, EmptyState, Spinner, Table, formatCents, formatDate, SecondaryButton, Badge } from '../components/ui'
import QuoteDrawer from '../components/QuoteDrawer'

const STATUS_LABELS = { draft: 'Finalising', sent: 'Ready for approval', accepted: 'Accepted', declined: 'Declined' }
const STATUS_TONES = { draft: 'gray', sent: 'blue', accepted: 'green', declined: 'red' }

function StatPill({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium inline-flex items-center gap-2 transition-colors ${
        active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label}
      <span className={`text-xs px-1.5 rounded-full ${active ? 'bg-white/20' : 'bg-white'}`}>{count}</span>
    </button>
  )
}

export default function QuotesPage({ company, contact, deepLinkId, clearDeepLink }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('quotes')
        .select('id, proposal_id, status, subtotal_cents, vat_rate, vat_amount_cents, total_cents, accepted_at, accepted_by_name, quote_pdf_url, notes, created_at, payment_terms, delivery_cost_cents')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
      if (cancelled) return
      setRows(data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id, refresh])

  useEffect(() => {
    if (!deepLinkId || !rows.length) return
    const match = rows.find((r) => r.id === deepLinkId)
    if (match) { setSelected(match); clearDeepLink?.() }
  }, [deepLinkId, rows])

  if (loading) return <Spinner />

  const counts = {
    all: rows.length,
    draft: rows.filter((r) => r.status === 'draft').length,
    sent: rows.filter((r) => r.status === 'sent').length,
    accepted: rows.filter((r) => r.status === 'accepted').length,
    declined: rows.filter((r) => r.status === 'declined').length,
  }
  const filtered = filter === 'all' ? rows : rows.filter((r) => r.status === filter)
  const pendingYou = rows.filter((r) => r.status === 'sent')

  return (
    <div className="space-y-6">
      <PageHeader title="Quotes" subtitle="Review and approve quotes for your proposals." />

      {pendingYou.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {pendingYou.length}
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-blue-900">Waiting for your approval</div>
            <div className="text-xs text-blue-700 mt-0.5">
              {pendingYou.length === 1 ? 'One quote needs a decision.' : `${pendingYou.length} quotes need a decision.`}
            </div>
          </div>
          <SecondaryButton onClick={() => setSelected(pendingYou[0])}>Open</SecondaryButton>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <StatPill label="All" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
        <StatPill label="Finalising" count={counts.draft} active={filter === 'draft'} onClick={() => setFilter('draft')} />
        <StatPill label="Awaiting approval" count={counts.sent} active={filter === 'sent'} onClick={() => setFilter('sent')} />
        <StatPill label="Accepted" count={counts.accepted} active={filter === 'accepted'} onClick={() => setFilter('accepted')} />
        <StatPill label="Declined" count={counts.declined} active={filter === 'declined'} onClick={() => setFilter('declined')} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Receipt} title={filter === 'all' ? 'No quotes yet' : 'Nothing here'} description={filter === 'all' ? 'Quotes will appear here once your proposals are priced.' : 'Switch filters to see other quotes.'} />
      ) : (
        <Table
          columns={[
            { key: 'created_at', label: 'Date', render: (r) => <span className="text-gray-500 text-xs">{formatDate(r.created_at)}</span> },
            { key: 'status', label: 'Status', render: (r) => <Badge tone={STATUS_TONES[r.status]}>{STATUS_LABELS[r.status] || r.status}</Badge> },
            { key: 'subtotal_cents', label: 'Subtotal', render: (r) => <span className="text-gray-600">{formatCents(r.subtotal_cents)}</span> },
            { key: 'total_cents', label: 'Total', render: (r) => <span className="font-medium text-gray-900">{formatCents(r.total_cents)}</span> },
            { key: 'accepted_at', label: 'Accepted', render: (r) => <span className="text-gray-500 text-xs">{formatDate(r.accepted_at) || '—'}</span> },
          ]}
          rows={filtered}
          onRowClick={setSelected}
        />
      )}

      {selected && (
        <QuoteDrawer
          quote={selected}
          company={company}
          contact={contact}
          onClose={() => setSelected(null)}
          onUpdated={() => setRefresh((x) => x + 1)}
        />
      )}
    </div>
  )
}
