import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  FileText, Plus, Calendar, X, Package, Receipt, Palette, ArrowRight, Truck, MapPin,
  LayoutGrid, List as ListIcon, Clock, Users as UsersIcon, Trash2, FolderKanban,
  User, Mail, Phone, Image as ImageIcon, ChevronDown, ChevronUp,
} from 'lucide-react'
import { PageHeader, StatusBadge, EmptyState, Spinner, PrimaryButton, Table, formatCents, formatDate, Badge, SecondaryButton, SectionBlock, deriveQuoteBreakdown } from '../components/ui'
import AddRequestedItem from '../components/AddRequestedItem'
import DesignDrawer from '../components/DesignDrawer'
import QuoteDrawer from '../components/QuoteDrawer'
import { fetchDesignMockupUrls } from '../lib/designThumbnails'

const QUOTE_LABELS = { draft: 'Finalising', sent: 'Ready for approval', accepted: 'Accepted', declined: 'Declined' }
const QUOTE_TONES = { draft: 'gray', sent: 'blue', accepted: 'green', declined: 'red' }

// Team app prefixes brief_notes with "Denied: <reason>\n\n<rest>" or "On Hold: <reason>\n\n<rest>".
function parseStatusReason(status, brief_notes) {
  if (!brief_notes) return { reason: null, cleaned: brief_notes }
  const prefix = status === 'denied' ? 'Denied:' : status === 'on_hold' ? 'On Hold:' : null
  if (!prefix || !brief_notes.startsWith(prefix)) return { reason: null, cleaned: brief_notes }
  const firstLine = brief_notes.split('\n')[0]
  const reason = firstLine.replace(prefix, '').trim()
  const rest = brief_notes.split('\n').slice(1).join('\n').trim()
  return { reason, cleaned: rest || null }
}

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
  { id: 'quote_approved', label: 'Quote approved', tone: 'bg-purple-50 border-purple-200', dot: 'bg-purple-500', hint: "Price accepted — preparing next steps" },
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
          <FolderKanban size={10} />Open project
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
  const [teamOnlyItems, setTeamOnlyItems] = useState([])
  const [designs, setDesigns] = useState([])
  const [quotes, setQuotes] = useState([])
  const [quoteLineItems, setQuoteLineItems] = useState({}) // quote_id -> line_items[]
  const [designTeamAssets, setDesignTeamAssets] = useState({}) // design_id -> [{file_type, signed_url, version}]
  const [team, setTeam] = useState([])
  const [am, setAm] = useState(null)
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

      // Designs + mockup URLs
      const mockupUrls = await fetchDesignMockupUrls((dRes.data ?? []).map((d) => d.id))
      const enrichedDesigns = (dRes.data ?? []).map((d) => ({
        ...d,
        display_image: mockupUrls[d.id]
          || d.latest_file_url
          || d.proposal_requested_items?.reference_url
          || d.proposal_requested_items?.catalogue_items?.main_photo_url
          || null,
        has_mockup: !!mockupUrls[d.id],
      }))
      setDesigns(enrichedDesigns)

      // Quote line items (from the client view, which now includes proposal_requested_item_id)
      const qIds = (qRes.data ?? []).map((q) => q.id)
      if (qIds.length) {
        const { data: lineItems } = await supabase
          .from('quote_line_items_client')
          .select('*')
          .in('quote_id', qIds)
          .order('sort_order')
        const allLi = lineItems ?? []
        const byQuote = {}
        for (const li of allLi) (byQuote[li.quote_id] = byQuote[li.quote_id] || []).push(li)
        setQuoteLineItems(byQuote)

        // Team-added items = quote line items not linked to a customer-side proposal_requested_item.
        const customerItemIds = new Set((iRes.data ?? []).map((i) => i.id))
        const teamOnly = allLi.filter((li) =>
          !li.proposal_requested_item_id || !customerItemIds.has(li.proposal_requested_item_id)
        )

        // Photo lookup for team-added catalogue items
        const cataIds = Array.from(new Set(teamOnly.map((li) => li.catalogue_item_id).filter(Boolean)))
        let cataPhotos = {}
        if (cataIds.length) {
          const { data: catas } = await supabase
            .from('catalogue_items')
            .select('id, main_photo_url')
            .in('id', cataIds)
          cataPhotos = Object.fromEntries((catas ?? []).map((c) => [c.id, c.main_photo_url]))
        }

        setTeamOnlyItems(teamOnly.map((li) => ({
          id: `team-${li.id}`,
          source: 'team',
          line_item_id: li.id,
          quote_id: li.quote_id,
          description: li.description,
          quantity: li.quantity,
          notes: li.customization_notes || li.notes,
          catalogue_item_id: li.catalogue_item_id,
          colour_choice: li.selected_colour,
          catalogue_items: cataPhotos[li.catalogue_item_id] ? { main_photo_url: cataPhotos[li.catalogue_item_id] } : null,
        })))
      }

      // Logos & assets per design (file_type IN logo/asset), signed
      const designIds = (dRes.data ?? []).map((d) => d.id)
      if (designIds.length) {
        const { data: rawFiles } = await supabase
          .from('design_files')
          .select('id, design_task_id, file_url, file_type, version, storage_bucket')
          .in('design_task_id', designIds)
          .in('file_type', ['logo', 'asset'])
        const byBucket = {}
        for (const f of rawFiles ?? []) {
          const b = f.storage_bucket || 'designs'
          ;(byBucket[b] = byBucket[b] || []).push(f)
        }
        const byDesign = {}
        for (const [bucket, list] of Object.entries(byBucket)) {
          const paths = list.map((f) => f.file_url)
          const { data: signed } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60)
          const byPath = Object.fromEntries((signed ?? []).filter((s) => !s.error).map((s) => [s.path, s.signedUrl]))
          for (const f of list) {
            (byDesign[f.design_task_id] = byDesign[f.design_task_id] || []).push({ ...f, signed_url: byPath[f.file_url] })
          }
        }
        setDesignTeamAssets(byDesign)
      }

      // Delivery address
      if (proposal.delivery_address_id) {
        const { data } = await supabase.from('addresses').select('*').eq('id', proposal.delivery_address_id).single()
        setAddress(data)
      }

      // AM (owner_user_id)
      if (proposal.owner_user_id) {
        const { data } = await supabase.from('users').select('id, full_name, email, phone, avatar_url, role').eq('id', proposal.owner_user_id).single()
        setAm(data)
      }
    })()
  }, [proposal.id, refresh])

  // Map each item id → its best-matching design.
  // Try (in order): proposal_requested_item_id link → line_item_id link → fuzzy title match.
  const designsByItemId = useMemo(() => {
    const map = {}
    const used = new Set()
    const normTitle = (s) => (s || '')
      .toLowerCase()
      .replace(/^design:\s*/i, '')
      .trim()
    const claim = (key, design) => {
      if (!design || used.has(design.id) || map[key]) return
      map[key] = design
      used.add(design.id)
    }
    // 1. Direct linked-FK matches
    for (const d of designs) {
      if (d.proposal_requested_item_id) claim(d.proposal_requested_item_id, d)
      if (d.line_item_id) claim(`team-${d.line_item_id}`, d)
    }
    // 2. Title fallback — useful when team creates designs without a line_item_id link
    const allItems = [
      ...items.map((i) => ({ key: i.id, name: i.description })),
      ...teamOnlyItems.map((i) => ({ key: i.id, name: i.description })),
    ]
    for (const it of allItems) {
      if (map[it.key]) continue
      const want = normTitle(it.name)
      if (!want) continue
      const match = designs.find((d) => !used.has(d.id) && normTitle(d.title) === want)
      if (match) claim(it.key, match)
    }
    return map
  }, [designs, items, teamOnlyItems])

  const stage = JOURNEY.find((s) => s.id === proposal.status) || JOURNEY[0]
  const leadContact = team.find((t) => t.role === 'lead')?.contacts

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
            <div className="grid grid-cols-5 gap-1 mt-3">
              {JOURNEY.map((s, i) => {
                const active = JOURNEY.findIndex((x) => x.id === proposal.status) >= i
                return (
                  <div key={s.id} className={`h-1 rounded-full ${active ? s.dot : 'bg-gray-200'}`} />
                )
              })}
            </div>
          </div>

          {/* People callout: submitted by + AM */}
          {(leadContact || am) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {leadContact && (
                <div className="border border-gray-200 rounded-lg p-3 bg-white">
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5 flex items-center gap-1"><User size={10} />Submitted by</div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-semibold overflow-hidden">
                      {leadContact.profile_image_url
                        ? <img src={leadContact.profile_image_url} alt="" className="w-full h-full object-cover" />
                        : [leadContact.first_name, leadContact.last_name].filter(Boolean).map((n) => n[0]).join('').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{leadContact.first_name} {leadContact.last_name}</div>
                      {leadContact.email && <div className="text-xs text-gray-500 truncate">{leadContact.email}</div>}
                    </div>
                  </div>
                </div>
              )}
              {am && (
                <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/40">
                  <div className="text-[10px] uppercase tracking-wide text-blue-700 mb-1.5 flex items-center gap-1"><User size={10} />Your account manager</div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center text-blue-800 text-xs font-semibold overflow-hidden">
                      {am.avatar_url
                        ? <img src={am.avatar_url} alt="" className="w-full h-full object-cover" />
                        : am.full_name?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 truncate">{am.full_name}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs">
                        {am.email && <a href={`mailto:${am.email}`} className="text-blue-700 hover:text-blue-800 inline-flex items-center gap-0.5"><Mail size={10} /></a>}
                        {am.phone && <a href={`tel:${am.phone}`} className="text-blue-700 hover:text-blue-800 inline-flex items-center gap-0.5"><Phone size={10} /></a>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reason/notes/brief callouts */}
          {(() => {
            const { reason, cleaned } = parseStatusReason(proposal.status, proposal.brief_notes)
            const isDenied = proposal.status === 'denied'
            return (
              <>
                {reason && (
                  <div className={`rounded-lg p-3 border ${isDenied ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className={`text-xs font-semibold mb-1 ${isDenied ? 'text-red-900' : 'text-amber-900'}`}>
                      {isDenied ? 'Reason for decline' : 'On hold — reason'}
                    </div>
                    <div className={`text-sm ${isDenied ? 'text-red-800' : 'text-amber-800'}`}>{reason}</div>
                  </div>
                )}
                {proposal.notes_for_client && (
                  <div className="rounded-lg p-3 border bg-blue-50 border-blue-100">
                    <div className="text-xs font-semibold mb-1 text-blue-900">Note from your account manager</div>
                    <div className="text-sm text-blue-900 whitespace-pre-wrap">{proposal.notes_for_client}</div>
                  </div>
                )}
                {cleaned && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wide">Brief</div>
                    <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100">{cleaned}</div>
                  </div>
                )}
              </>
            )
          })()}

          {/* ----- ITEMS BLOCK (customer + team merged) ----- */}
          {(() => {
            const mergedItems = [
              ...items.map((i) => ({ ...i, source: 'customer' })),
              ...teamOnlyItems,
            ]
            return (
            <SectionBlock
              icon={Package}
              title={`Items${mergedItems.length ? ` · ${mergedItems.length}` : ''}`}
              tone="purple"
            >
            <div className="space-y-3">
              {mergedItems.length > 0 && mergedItems.map((i) => {
                const linkedDesign = designsByItemId[i.id]
                const isCustomer = i.source === 'customer'
                return (
                  <div key={i.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
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
                        <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5 flex-wrap">
                          {isCustomer ? (
                            <QuantityEditor item={i} onChanged={() => setRefresh((r) => r + 1)} />
                          ) : (
                            <span>Qty {i.quantity}</span>
                          )}
                          <span>·</span>
                          <span>{i.catalogue_item_id ? 'catalogue' : 'custom'}</span>
                          {i.colour_choice && <><span>·</span><span>{i.colour_choice}</span></>}
                          {Array.isArray(i.customization_choices) && i.customization_choices.length > 0 ? (
                            i.customization_choices.map((c, ci) => (
                              <span key={ci} className="inline-flex items-center"><span>·</span><span className="ml-1 text-gray-700">{c.name}{c.surcharge_cents > 0 && <span className="text-amber-700"> (+{formatCents(c.surcharge_cents)})</span>}</span></span>
                            ))
                          ) : i.customization_name && (
                            <><span>·</span><span className="text-gray-700">{i.customization_name}{i.customization_surcharge_cents > 0 && <span className="text-amber-700"> (+{formatCents(i.customization_surcharge_cents)})</span>}</span></>
                          )}
                          {i.pantone_code && <><span>·</span><span className="text-indigo-700">PMS {i.pantone_code}</span></>}
                          {!isCustomer && <Badge tone="gray">Added by team</Badge>}
                        </div>
                        {i.size_breakdown && Object.keys(i.size_breakdown).length > 0 && (
                          <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-1">
                            {Object.entries(i.size_breakdown).map(([s, n]) => (
                              <span key={s} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px]"><strong>{s}</strong> · {n}</span>
                            ))}
                          </div>
                        )}
                        {i.notes && <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap line-clamp-2">{i.notes}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        {isCustomer && <StatusBadge status={i.status} />}
                        {isCustomer && <DeleteItemButton item={i} onDeleted={() => setRefresh((r) => r + 1)} />}
                      </div>
                    </div>
                    {linkedDesign && (
                      <div className="border-t border-gray-100">
                        <button
                          onClick={() => setNestedDesign(linkedDesign)}
                          className="w-full flex items-center gap-3 px-3 py-2 bg-gray-50 hover:bg-blue-50 text-left transition-colors"
                        >
                          {linkedDesign.display_image ? (
                            <img src={linkedDesign.display_image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                          ) : (
                            <Palette size={14} className="text-gray-400 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700">Design:</span>
                            <StatusBadge status={linkedDesign.status} />
                            {linkedDesign.revision_count > 0 && <span className="text-[10px] text-gray-500">Rev {linkedDesign.revision_count}</span>}
                          </div>
                          <span className="text-xs text-blue-600 font-medium inline-flex items-center gap-1">
                            {linkedDesign.status === 'awaiting_brief' && 'Finish brief'}
                            {linkedDesign.status === 'submitted' && 'Approve / feedback'}
                            {(linkedDesign.status === 'in_progress' || linkedDesign.status === 'revision_requested' || linkedDesign.status === 'approved') && 'View'}
                            <ArrowRight size={12} />
                          </span>
                        </button>

                        {/* Team-uploaded logos & assets for this design */}
                        {(designTeamAssets[linkedDesign.id] ?? []).length > 0 && (
                          <div className="px-3 pb-3 bg-gray-50/60">
                            <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1.5 flex items-center gap-1">
                              <ImageIcon size={10} />Logos &amp; assets ({designTeamAssets[linkedDesign.id].length})
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {designTeamAssets[linkedDesign.id].map((a) => (
                                <a
                                  key={a.id}
                                  href={a.signed_url || '#'}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="w-10 h-10 rounded border border-gray-200 overflow-hidden bg-white flex items-center justify-center hover:border-blue-300 transition-colors"
                                  title={`${a.file_type} v${a.version}`}
                                >
                                  {a.signed_url ? (
                                    <img src={a.signed_url} alt="" className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none' }} />
                                  ) : (
                                    <ImageIcon size={12} className="text-gray-300" />
                                  )}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              <AddRequestedItem
                proposalId={proposal.id}
                company={company}
                contact={contact}
                onAdded={() => setRefresh((r) => r + 1)}
              />
            </div>
            </SectionBlock>
            )
          })()}

          {/* ----- FINANCIAL / QUOTES BLOCK ----- */}
          <SectionBlock
            icon={Receipt}
            title={`Quotes${quotes.length ? ` · ${quotes.length}` : ''}`}
            tone="green"
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">Value</div>
                  <div className="text-gray-900 font-medium">{formatCents(proposal.value_cents)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">Quantity est.</div>
                  <div className="text-gray-900">{proposal.quantity_est ?? '—'}</div>
                </div>
              </div>
              {quotes.length === 0 ? (
                <div className="text-xs text-gray-500 bg-white rounded-lg p-3 border border-gray-100">
                  No quote yet. We'll prepare one once we have all your inputs.
                </div>
              ) : (
                <div className="space-y-3">
                  {quotes.map((q) => {
                    const lineItems = quoteLineItems[q.id] ?? []
                    return (
                      <div key={q.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                        <button
                          onClick={() => setNestedQuote(q)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-blue-50/30 text-left transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="text-sm font-semibold text-gray-900">
                                {q.total_cents > 0 ? formatCents(q.total_cents) : <span className="text-gray-500 font-normal">Price pending</span>}
                              </div>
                              <Badge tone={QUOTE_TONES[q.status]}>{QUOTE_LABELS[q.status] || q.status}</Badge>
                              {q.payment_terms && <Badge>{q.payment_terms}</Badge>}
                            </div>
                            <div className="text-xs text-gray-500">{formatDate(q.created_at)}{q.accepted_at ? ` · accepted by ${q.accepted_by_name || 'you'} ${formatDate(q.accepted_at)}` : ''}</div>
                          </div>
                          {q.status === 'sent' && <Badge tone="blue">Needs approval</Badge>}
                          <ArrowRight size={14} className="text-gray-400" />
                        </button>

                        {/* Inline line item breakdown */}
                        {lineItems.length > 0 && (
                          <div className="border-t border-gray-100 px-3 pt-2 pb-3 bg-gray-50/40">
                            <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-1.5">Line items</div>
                            <div className="rounded overflow-hidden border border-gray-200 bg-white">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Description</th>
                                    <th className="px-2 py-1.5 text-right font-semibold text-gray-600 w-12">Qty</th>
                                    <th className="px-2 py-1.5 text-right font-semibold text-gray-600 w-20">Unit</th>
                                    <th className="px-2 py-1.5 text-right font-semibold text-gray-600 w-24">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lineItems.map((li) => (
                                    <tr key={li.id} className="border-t border-gray-100">
                                      <td className="px-2 py-1.5 text-gray-900">{li.description}</td>
                                      <td className="px-2 py-1.5 text-right text-gray-700">{li.quantity}</td>
                                      <td className="px-2 py-1.5 text-right text-gray-700">{formatCents(li.unit_sales_price_cents)}</td>
                                      <td className="px-2 py-1.5 text-right text-gray-900 font-medium">{formatCents(li.total_sales_cents)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Full breakdown */}
                            {(() => {
                              const b = deriveQuoteBreakdown(q, lineItems)
                              return (
                                <div className="mt-2 flex justify-end">
                                  <div className="text-xs space-y-0.5 text-right">
                                    <div className="text-gray-600">Items subtotal: <span className="text-gray-900 font-medium">{formatCents(b.items_subtotal || b.after_discount)}</span></div>
                                    {b.discount > 0 && (
                                      <div className="text-gray-600">Discount: <span className="text-red-600 font-medium">−{formatCents(b.discount)}</span></div>
                                    )}
                                    {b.delivery > 0 && (
                                      <div className="text-gray-600">Delivery: <span className="text-gray-900">{formatCents(b.delivery)}</span></div>
                                    )}
                                    <div className="text-gray-600">VAT{b.vat_rate ? ` (${b.vat_rate}%)` : ''}: <span className="text-gray-900">{formatCents(b.vat)}</span></div>
                                    <div className="text-gray-700 font-semibold pt-0.5 border-t border-gray-200">Total: <span className="text-gray-900">{formatCents(b.total)}</span></div>
                                  </div>
                                </div>
                              )
                            })()}

                            {q.notes && (
                              <div className="mt-2 text-xs text-gray-700 bg-blue-50 border border-blue-100 rounded p-2 whitespace-pre-wrap">
                                <span className="text-[10px] uppercase tracking-wide text-blue-700 font-semibold block mb-0.5">Note on this quote</span>
                                {q.notes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </SectionBlock>

          {/* ----- LOGISTICS BLOCK ----- */}
          <SectionBlock
            icon={Truck}
            title="Logistics"
            tone="blue"
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">Shipping</div>
                  <div className="text-gray-900">{proposal.shipment_type?.replace(/_/g, ' ') || '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">Your requested deadline</div>
                  <div className="text-gray-900 inline-flex items-center gap-1.5">
                    <Calendar size={12} className="text-gray-400" />{formatDate(proposal.deadline_at) || 'No deadline'}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Final ETA confirmed in the quote.</div>
                </div>
              </div>
              {address ? (
                <div className="border border-gray-200 rounded-lg p-3 bg-white">
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1 flex items-center gap-1"><MapPin size={10} />Delivery address</div>
                  <div className="text-sm font-medium text-gray-900">{address.label || address.street}</div>
                  <div className="text-xs text-gray-600">{[address.street, address.house_number, address.postal_code, address.city, address.country].filter(Boolean).join(', ')}</div>
                  {address.contact_name && (
                    <div className="text-[11px] text-gray-500 mt-1.5 pt-1.5 border-t border-gray-100">
                      {address.contact_name}{address.contact_phone ? ` · ${address.contact_phone}` : ''}{address.contact_email ? ` · ${address.contact_email}` : ''}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-500">No address selected yet.</div>
              )}
            </div>
          </SectionBlock>

          {/* ----- TEAM ----- */}
          {team.length > 0 && (
            <SectionBlock
              icon={UsersIcon}
              title={`Team · ${team.length}`}
            >
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
            </SectionBlock>
          )}

          {files.length > 0 && (
            <SectionBlock icon={FileText} title={`Files · ${files.length}`}>
              <div className="space-y-2">
                {files.map((f) => (
                  <a key={f.id} href={f.storage_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                    <FileText size={16} className="text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 truncate">{f.file_name}</div>
                      <div className="text-xs text-gray-400">{f.file_type}</div>
                    </div>
                  </a>
                ))}
              </div>
            </SectionBlock>
          )}
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
          .select('id, proposal_number, name, status, type, value_cents, quantity_est, deadline_at, occasion, brief_notes, notes_for_client, proposal_heat, created_at, created_by_client, shipment_type, delivery_address_id, delivery_address_ids, owner_user_id')
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
                        <FolderKanban size={10} />Open project
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
