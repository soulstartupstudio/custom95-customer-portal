import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  FileText, Plus, Calendar, X, Package, Receipt, Palette, ArrowRight,
  LayoutGrid, List as ListIcon, Clock, Users as UsersIcon, Trash2, FolderKanban,
} from 'lucide-react'
import { PageHeader, StatusBadge, EmptyState, Spinner, PrimaryButton, Table, formatCents, formatDate, Badge, SecondaryButton } from '../components/ui'
import CommentsThread from '../components/CommentsThread'
import AddRequestedItem from '../components/AddRequestedItem'
import DesignDrawer from '../components/DesignDrawer'
import QuoteDrawer from '../components/QuoteDrawer'

const QUOTE_LABELS = { draft: 'Finalising', sent: 'Ready for approval', accepted: 'Accepted', declined: 'Declined' }
const QUOTE_TONES = { draft: 'gray', sent: 'blue', accepted: 'green', declined: 'red' }

function QuantityEditor({ item, onChanged }) {
  const [qty, setQty] = useState(item.quantity ?? '')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    const n = qty === '' ? null : Number(qty)
    if (n === item.quantity) return
    setSaving(true)
    await supabase.from('proposal_requested_items').update({ quantity: n }).eq('id', item.id)
    setSaving(false)
    onChanged?.()
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-gray-500">Qty</span>
      <input
        type="number"
        min="1"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
        disabled={saving}
        className="w-16 px-1.5 py-0.5 border border-gray-200 rounded text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </span>
  )
}

function DeleteItemButton({ item, onDeleted }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const del = async () => {
    setBusy(true)
    await supabase.from('proposal_requested_items').delete().eq('id', item.id)
    setBusy(false)
    onDeleted?.()
  }
  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-gray-300 hover:text-red-600 transition-colors"
        title="Remove item"
      >
        <Trash2 size={14} />
      </button>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => setConfirming(false)} className="text-xs text-gray-500 hover:text-gray-700 px-1">Cancel</button>
      <button onClick={del} disabled={busy} className="text-xs font-medium text-red-600 hover:text-red-700 px-1">
        {busy ? '…' : 'Remove'}
      </button>
    </div>
  )
}

// Proposal flow ends when a project is created. Later stages live in the Projects tab.
const JOURNEY = [
  { id: 'inquiry_received', label: 'Inquiry', tone: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500', hint: "We've got it — starting discovery" },
  { id: 'discovery', label: 'Discovery', tone: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500', hint: "Working on designs + quote" },
  { id: 'quote_approved', label: 'Quote approved', tone: 'bg-purple-50 border-purple-200', dot: 'bg-purple-500', hint: "Price accepted — designs in flight" },
  { id: 'pending_designs', label: 'Finalising designs', tone: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500', hint: "Locking in design direction" },
  { id: 'project', label: 'Now a project', tone: 'bg-green-50 border-green-200', dot: 'bg-green-500', hint: "Live project — click to open", terminal: true },
]

const DEAD_STATUSES = ['denied', 'not_proceeding', 'on_hold', 'completed']

function ProposalCard({ proposal, onClick, compact = false, linkedProject }) {
  const age = proposal.created_at ? Math.floor((Date.now() - new Date(proposal.created_at).getTime()) / (1000 * 60 * 60 * 24)) : null
  const isProject = proposal.status === 'project' && !!linkedProject
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-lg border border-gray-200 p-3 text-left hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">#{proposal.proposal_number}</div>
        {proposal.value_cents != null && (
          <div className="text-xs font-semibold text-gray-900">{formatCents(proposal.value_cents)}</div>
        )}
      </div>
      <div className="text-sm font-medium text-gray-900 mb-2 line-clamp-2">{proposal.name || `Proposal ${proposal.proposal_number}`}</div>
      {isProject && (
        <div className="mb-2 inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">
          <FolderKanban size={10} />Project #{linkedProject.project_number}
          <ArrowRight size={10} />
        </div>
      )}
      <div className="flex items-center gap-2 text-[10px] text-gray-500">
        {proposal.deadline_at && (
          <span className="inline-flex items-center gap-1"><Calendar size={10} />{formatDate(proposal.deadline_at)}</span>
        )}
        {proposal.quantity_est && (
          <span className="inline-flex items-center gap-1"><Package size={10} />{proposal.quantity_est}</span>
        )}
        {age != null && !compact && (
          <span className="inline-flex items-center gap-1 text-gray-400"><Clock size={10} />{age}d</span>
        )}
      </div>
    </button>
  )
}

function Kanban({ proposals, projectsByProposalId, onOpen }) {
  const byStage = useMemo(() => {
    const map = Object.fromEntries(JOURNEY.map((j) => [j.id, []]))
    for (const p of proposals) {
      if (DEAD_STATUSES.includes(p.status)) continue
      if (map[p.status]) map[p.status].push(p)
    }
    return map
  }, [proposals])

  return (
    <div className="overflow-x-auto -mx-6 px-6 pb-2">
      <div className="flex gap-3 min-w-max">
        {JOURNEY.map((stage, i) => {
          const items = byStage[stage.id] ?? []
          return (
            <div key={stage.id} className={`w-64 flex-shrink-0 rounded-xl border ${stage.tone} p-3`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${stage.dot}`} />
                  <span className="text-xs font-semibold text-gray-900">{i + 1}. {stage.label}</span>
                </div>
                <span className="text-[10px] font-medium text-gray-500 bg-white px-1.5 py-0.5 rounded-full">{items.length}</span>
              </div>
              <p className="text-[10px] text-gray-600 mb-3">{stage.hint}</p>
              <div className="space-y-2">
                {items.length === 0 ? (
                  <div className="text-[10px] text-gray-400 text-center py-4 bg-white/50 rounded border border-dashed border-gray-200">Nothing here</div>
                ) : (
                  items.map((p) => (
                    <ProposalCard
                      key={p.id}
                      proposal={p}
                      linkedProject={projectsByProposalId[p.id]}
                      onClick={() => onOpen(p)}
                      compact
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProposalDetail({ proposal, company, contact, onClose }) {
  const [items, setItems] = useState([])
  const [designs, setDesigns] = useState([])
  const [quotes, setQuotes] = useState([])
  const [team, setTeam] = useState([])
  const [address, setAddress] = useState(null)
  const [files, setFiles] = useState([])
  const [refresh, setRefresh] = useState(0)
  const [nestedDesign, setNestedDesign] = useState(null)
  const [nestedQuote, setNestedQuote] = useState(null)

  useEffect(() => {
    (async () => {
      const [fRes, iRes, qRes, tRes, dRes] = await Promise.all([
        supabase.from('proposal_files').select('id, file_name, file_type, storage_url, created_at').eq('proposal_id', proposal.id).order('created_at', { ascending: false }),
        supabase.from('proposal_requested_items').select('*, catalogue_items(main_photo_url)').eq('proposal_id', proposal.id).order('created_at'),
        supabase.from('quotes').select('*').eq('proposal_id', proposal.id).order('created_at', { ascending: false }),
        supabase.from('proposal_contacts').select('role, contacts(id, first_name, last_name, role, email, profile_image_url)').eq('proposal_id', proposal.id),
        supabase.from('design_tasks').select('*, proposal_requested_items!proposal_requested_item_id(reference_url, catalogue_items(main_photo_url))').eq('proposal_id', proposal.id).order('created_at'),
      ])
      setFiles(fRes.data ?? [])
      setItems(iRes.data ?? [])
      setQuotes(qRes.data ?? [])
      setTeam(tRes.data ?? [])
      const enrichedDesigns = (dRes.data ?? []).map((d) => ({
        ...d,
        display_image: d.latest_file_url || d.proposal_requested_items?.reference_url || d.proposal_requested_items?.catalogue_items?.main_photo_url || null,
      }))
      setDesigns(enrichedDesigns)

      if (proposal.delivery_address_id) {
        const { data } = await supabase.from('addresses').select('*').eq('id', proposal.delivery_address_id).single()
        setAddress(data)
      }
    })()
  }, [proposal.id, refresh])

  // Map design → its requested item (best effort by FK)
  const designsByItemId = useMemo(() => {
    const map = {}
    for (const d of designs) {
      if (d.proposal_requested_item_id) map[d.proposal_requested_item_id] = d
    }
    return map
  }, [designs])

  const stage = JOURNEY.find((s) => s.id === proposal.status) || JOURNEY[0]

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-xs text-gray-500">Proposal #{proposal.proposal_number}</div>
            <h2 className="text-lg font-semibold text-gray-900">{proposal.name || `Proposal ${proposal.proposal_number}`}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-6">
          {/* Journey progress bar */}
          <div className={`rounded-xl border p-3 ${stage.tone}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${stage.dot}`} />
              <span className="text-xs font-semibold text-gray-900">Stage: {stage.label}</span>
            </div>
            <p className="text-[11px] text-gray-700">{stage.hint}</p>
            <div className="grid grid-cols-6 gap-1 mt-3">
              {JOURNEY.map((s, i) => {
                const active = JOURNEY.findIndex((x) => x.id === proposal.status) >= i
                return (
                  <div key={s.id} className={`h-1 rounded-full ${active ? s.dot : 'bg-gray-200'}`} />
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><div className="text-xs text-gray-500">Value</div><div className="text-gray-900 font-medium">{formatCents(proposal.value_cents)}</div></div>
            <div><div className="text-xs text-gray-500">Quantity est.</div><div className="text-gray-900">{proposal.quantity_est ?? '—'}</div></div>
            <div><div className="text-xs text-gray-500">Deadline</div><div className="text-gray-900">{formatDate(proposal.deadline_at) || '—'}</div></div>
            <div><div className="text-xs text-gray-500">Occasion</div><div className="text-gray-900">{proposal.occasion || '—'}</div></div>
          </div>

          {/* Quotes — quick-open */}
          {quotes.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Receipt size={14} className="text-gray-400" />Quotes <span className="text-xs text-gray-400 font-normal">· {quotes.length}</span>
              </div>
              <div className="space-y-2">
                {quotes.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => setNestedQuote(q)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 text-left transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-900">
                          {q.total_cents > 0 ? formatCents(q.total_cents) : <span className="text-gray-500 font-normal">Price pending</span>}
                        </div>
                        <Badge tone={QUOTE_TONES[q.status]}>{QUOTE_LABELS[q.status] || q.status}</Badge>
                      </div>
                      <div className="text-xs text-gray-500">{formatDate(q.created_at)}{q.accepted_at ? ` · accepted ${formatDate(q.accepted_at)}` : ''}</div>
                    </div>
                    {q.status === 'sent' && <Badge tone="blue">Needs your approval</Badge>}
                    <ArrowRight size={14} className="text-gray-400" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {proposal.brief_notes && (
            <div>
              <div className="text-xs text-gray-500 mb-1 font-semibold">Brief</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{proposal.brief_notes}</div>
            </div>
          )}

          {/* Items with linked designs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Package size={14} className="text-gray-400" />Requested items {items.length > 0 && <span className="text-xs text-gray-400 font-normal">· {items.length}</span>}
              </div>
            </div>
            {items.length > 0 && (
              <div className="space-y-2 mb-3">
                {items.map((i) => {
                  const linkedDesign = designsByItemId[i.id]
                  return (
                    <div key={i.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="p-3 flex items-start gap-3">
                        <div className="w-12 h-12 rounded-md bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {i.reference_url || i.catalogue_items?.main_photo_url ? (
                            <img src={i.reference_url || i.catalogue_items.main_photo_url} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                          ) : (
                            <Package size={18} className="text-gray-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{i.description}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                            <QuantityEditor
                              item={i}
                              onChanged={() => setRefresh((r) => r + 1)}
                            />
                            <span>·</span>
                            <span>{i.catalogue_item_id ? 'catalogue' : 'custom'}</span>
                          </div>
                          {i.notes && <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap line-clamp-2">{i.notes}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={i.status} />
                          <DeleteItemButton item={i} onDeleted={() => setRefresh((r) => r + 1)} />
                        </div>
                      </div>
                      {linkedDesign && (
                        <button
                          onClick={() => setNestedDesign(linkedDesign)}
                          className="w-full flex items-center gap-3 px-3 py-2 bg-gray-50 hover:bg-blue-50 border-t border-gray-100 text-left transition-colors"
                        >
                          <Palette size={14} className="text-gray-400" />
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700">Design:</span>
                            <StatusBadge status={linkedDesign.status} />
                            {linkedDesign.revision_count > 0 && <span className="text-[10px] text-gray-500">Rev {linkedDesign.revision_count}</span>}
                          </div>
                          <span className="text-xs text-blue-600 font-medium inline-flex items-center gap-1">
                            {linkedDesign.status === 'awaiting_brief' && 'Finish brief'}
                            {linkedDesign.status === 'submitted' && 'Approve / feedback'}
                            {linkedDesign.status === 'in_progress' && 'View'}
                            {linkedDesign.status === 'revision_requested' && 'View'}
                            {linkedDesign.status === 'approved' && 'View'}
                            <ArrowRight size={12} />
                          </span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <AddRequestedItem
              proposalId={proposal.id}
              company={company}
              contact={contact}
              onAdded={() => setRefresh((r) => r + 1)}
            />
          </div>

          {/* Team */}
          {team.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <UsersIcon size={14} className="text-gray-400" />Team <span className="text-xs text-gray-400 font-normal">· {team.length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {team.map((pc) => {
                  const c = pc.contacts
                  if (!c) return null
                  const initials = [c.first_name, c.last_name].filter(Boolean).map((n) => n[0]).join('').toUpperCase()
                  return (
                    <div key={c.id} className="inline-flex items-center gap-2 border border-gray-200 rounded-full pl-1 pr-3 py-0.5 bg-white">
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-semibold text-gray-600 overflow-hidden">
                        {c.profile_image_url ? <img src={c.profile_image_url} alt="" className="w-full h-full object-cover" /> : initials || '?'}
                      </div>
                      <span className="text-xs text-gray-700">{c.first_name} {c.last_name}</span>
                      {pc.role === 'lead' && <span className="text-[9px] px-1 rounded bg-blue-100 text-blue-700">Lead</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Shipping */}
          {(address || proposal.shipment_type) && (
            <div>
              <div className="text-sm font-semibold text-gray-900 mb-2">Delivery</div>
              <div className="text-xs text-gray-500">{proposal.shipment_type?.replace(/_/g, ' ')}</div>
              {address && (
                <div className="text-sm text-gray-700 mt-1">
                  <div className="font-medium">{address.label}</div>
                  <div className="text-xs text-gray-500">{[address.street, address.house_number, address.postal_code, address.city, address.country].filter(Boolean).join(', ')}</div>
                </div>
              )}
            </div>
          )}

          {files.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-2 font-semibold">Files</div>
              <div className="space-y-2">
                {files.map((f) => (
                  <a key={f.id} href={f.storage_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                    <FileText size={16} className="text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 truncate">{f.file_name}</div>
                      <div className="text-xs text-gray-400">{f.file_type}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="pt-5 border-t border-gray-100">
            <CommentsThread entityType="proposal" entityId={proposal.id} company={company} contact={contact} />
          </div>
        </div>
      </div>

      {nestedDesign && (
        <DesignDrawer
          design={nestedDesign}
          company={company}
          contact={contact}
          onClose={() => setNestedDesign(null)}
          onUpdated={() => { setNestedDesign(null); setRefresh((r) => r + 1) }}
        />
      )}
      {nestedQuote && (
        <QuoteDrawer
          quote={nestedQuote}
          company={company}
          contact={contact}
          onClose={() => setNestedQuote(null)}
          onUpdated={() => { setNestedQuote(null); setRefresh((r) => r + 1) }}
        />
      )}
    </div>
  )
}

export default function ProposalsPage({ company, contact, onStartProposal, onOpenProject }) {
  const [rows, setRows] = useState([])
  const [projectsByProposalId, setProjectsByProposalId] = useState({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState('kanban')

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [propRes, projRes] = await Promise.all([
        supabase.from('proposals')
          .select('id, proposal_number, name, status, type, value_cents, quantity_est, deadline_at, occasion, brief_notes, notes_for_client, proposal_heat, created_at, created_by_client, shipment_type, delivery_address_id, delivery_address_ids')
          .eq('company_id', company.id)
          .order('created_at', { ascending: false }),
        supabase.from('projects').select('id, project_number, name, stage, proposal_id').eq('company_id', company.id),
      ])
      if (cancelled) return
      setRows(propRes.data ?? [])
      const byPropId = {}
      for (const p of projRes.data ?? []) {
        if (p.proposal_id) byPropId[p.proposal_id] = p
      }
      setProjectsByProposalId(byPropId)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id])

  // If a proposal is "project" stage, clicking it should navigate to the Projects tab.
  const openProposalOrProject = (p) => {
    if (p.status === 'project' && projectsByProposalId[p.id] && onOpenProject) {
      onOpenProject(projectsByProposalId[p.id].id)
    } else {
      setSelected(p)
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proposals"
        subtitle="Your pipeline — from inquiry to delivery."
        action={<PrimaryButton onClick={onStartProposal}><Plus size={16} />Start proposal</PrimaryButton>}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No proposals yet"
          description="Kick off a new proposal and we'll get back to you."
          action={<PrimaryButton onClick={onStartProposal}><Plus size={16} />Start proposal</PrimaryButton>}
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setView('kanban')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md inline-flex items-center gap-1.5 ${view === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}
              >
                <LayoutGrid size={13} />Pipeline
              </button>
              <button
                onClick={() => setView('list')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md inline-flex items-center gap-1.5 ${view === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}
              >
                <ListIcon size={13} />List
              </button>
            </div>
          </div>

          {view === 'kanban' ? (
            <Kanban proposals={rows} projectsByProposalId={projectsByProposalId} onOpen={openProposalOrProject} />
          ) : (
            <Table
              columns={[
                { key: 'proposal_number', label: '#', render: (r) => <span className="text-gray-500">#{r.proposal_number}</span> },
                { key: 'name', label: 'Name', render: (r) => (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{r.name || `Proposal ${r.proposal_number}`}</span>
                    {r.status === 'project' && projectsByProposalId[r.id] && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">
                        <FolderKanban size={10} />#{projectsByProposalId[r.id].project_number}
                      </span>
                    )}
                  </div>
                ) },
                { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'value_cents', label: 'Value', render: (r) => <span className="text-gray-600">{formatCents(r.value_cents)}</span> },
                { key: 'deadline_at', label: 'Deadline', render: (r) => <span className="text-gray-500 text-xs"><Calendar size={12} className="inline mr-1" />{formatDate(r.deadline_at) || '—'}</span> },
              ]}
              rows={rows}
              onRowClick={openProposalOrProject}
            />
          )}
        </>
      )}

      {selected && (
        <ProposalDetail
          proposal={selected}
          company={company}
          contact={contact}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
