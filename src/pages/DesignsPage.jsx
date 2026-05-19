import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Palette } from 'lucide-react'
import { PageHeader, StatusBadge, EmptyState, Spinner, SecondaryButton } from '../components/ui'
import DesignDrawer from '../components/DesignDrawer'
import { fetchDesignMockupUrls } from '../lib/designThumbnails'

function DesignCard({ design, onClick }) {
  const img = design.display_image
  return (
    <button onClick={onClick} className="bg-white rounded-xl border border-gray-200 overflow-hidden text-left hover:border-blue-300 hover:shadow-sm transition-all">
      <div className="aspect-video bg-gray-50 flex items-center justify-center overflow-hidden relative">
        {img ? (
          <img src={img} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
        ) : (
          <Palette size={32} className="text-gray-300" />
        )}
        {img && !design.has_mockup && (
          <div className="absolute bottom-1 left-1 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded">Reference</div>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-sm font-medium text-gray-900 truncate mb-2">{design.title}</h3>
        <div className="flex items-center justify-between">
          <StatusBadge status={design.status} />
          {design.revision_count > 0 && <span className="text-xs text-gray-400">Rev {design.revision_count}</span>}
        </div>
      </div>
    </button>
  )
}

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

export default function DesignsPage({ company, contact, deepLinkId, clearDeepLink }) {
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
        .from('design_tasks')
        .select('*, proposal_requested_items!proposal_requested_item_id(reference_url, catalogue_item_id, catalogue_items(main_photo_url))')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
      if (cancelled) return

      // Pull the latest signed mockup URL per design (preferred over fallbacks).
      const mockupUrls = await fetchDesignMockupUrls((data ?? []).map((d) => d.id))
      if (cancelled) return

      const enriched = (data ?? []).map((d) => ({
        ...d,
        display_image: mockupUrls[d.id]
          || d.latest_file_url
          || d.proposal_requested_items?.reference_url
          || d.proposal_requested_items?.catalogue_items?.main_photo_url
          || null,
        has_mockup: !!mockupUrls[d.id],
      }))
      setRows(enriched)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id, refresh])

  useEffect(() => {
    if (!deepLinkId || !rows.length) return
    const match = rows.find((r) => r.id === deepLinkId)
    if (match) {
      setSelected(match)
      clearDeepLink?.()
    }
  }, [deepLinkId, rows])

  if (loading) return <Spinner />

  const counts = {
    all: rows.length,
    action: rows.filter((d) => d.status === 'awaiting_brief' || d.status === 'submitted').length,
    awaiting_brief: rows.filter((d) => d.status === 'awaiting_brief').length,
    submitted: rows.filter((d) => d.status === 'submitted').length,
    in_progress: rows.filter((d) => d.status === 'in_progress' || d.status === 'revision_requested').length,
    approved: rows.filter((d) => d.status === 'approved').length,
  }

  const filterFn = {
    all: () => true,
    action: (d) => d.status === 'awaiting_brief' || d.status === 'submitted',
    awaiting_brief: (d) => d.status === 'awaiting_brief',
    submitted: (d) => d.status === 'submitted',
    in_progress: (d) => d.status === 'in_progress' || d.status === 'revision_requested',
    approved: (d) => d.status === 'approved',
  }[filter]
  const filtered = rows.filter(filterFn)
  const actionItems = rows.filter((d) => d.status === 'awaiting_brief' || d.status === 'submitted')

  return (
    <div className="space-y-6">
      <PageHeader title="Designs" subtitle="Review, approve, or send feedback on your designs." />

      {actionItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {actionItems.length}
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber-900">Needs your attention</div>
            <div className="text-xs text-amber-800 mt-0.5">
              {counts.awaiting_brief > 0 && `${counts.awaiting_brief} brief${counts.awaiting_brief === 1 ? '' : 's'} to submit`}
              {counts.awaiting_brief > 0 && counts.submitted > 0 && ' · '}
              {counts.submitted > 0 && `${counts.submitted} mockup${counts.submitted === 1 ? '' : 's'} to review`}
            </div>
          </div>
          <SecondaryButton onClick={() => setSelected(actionItems[0])}>Open first</SecondaryButton>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <StatPill label="All" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
        <StatPill label="Needs action" count={counts.action} active={filter === 'action'} onClick={() => setFilter('action')} />
        <StatPill label="In progress" count={counts.in_progress} active={filter === 'in_progress'} onClick={() => setFilter('in_progress')} />
        <StatPill label="Approved" count={counts.approved} active={filter === 'approved'} onClick={() => setFilter('approved')} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Palette} title={rows.length === 0 ? 'No designs yet' : 'Nothing here'} description={rows.length === 0 ? 'Designs appear here once you start a proposal with items.' : 'Switch filters to see other designs.'} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d) => <DesignCard key={d.id} design={d} onClick={() => setSelected(d)} />)}
        </div>
      )}

      {selected && (
        <DesignDrawer
          design={selected}
          company={company}
          contact={contact}
          onClose={() => setSelected(null)}
          onUpdated={() => setRefresh((x) => x + 1)}
        />
      )}
    </div>
  )
}
