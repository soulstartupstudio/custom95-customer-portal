import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  FolderKanban, X, Truck, Calendar, FileText, LayoutGrid, List as ListIcon,
  Package, CheckCircle2, Clock, AlertTriangle, MapPin, ExternalLink, Wrench,
  Palette, ArrowRight,
} from 'lucide-react'
import { PageHeader, StatusBadge, EmptyState, Spinner, formatCents, formatDate, Table, Badge, SecondaryButton } from '../components/ui'
import CommentsThread from '../components/CommentsThread'
import DesignDrawer from '../components/DesignDrawer'

// Customer journey for projects (maps to projects.stage)
const JOURNEY = [
  { id: 'preparation', label: 'Preparing', tone: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500', hint: "Confirming specs & production" },
  { id: 'pending_invoice_payment', label: 'Pending payment', tone: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500', hint: "Invoice awaiting payment" },
  { id: 'in_production', label: 'In production', tone: 'bg-purple-50 border-purple-200', dot: 'bg-purple-500', hint: "Supplier making your items" },
  { id: 'in_transit', label: 'In transit', tone: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500', hint: "On the way to delivery" },
  { id: 'delivered', label: 'Delivered', tone: 'bg-green-50 border-green-200', dot: 'bg-green-500', hint: "Arrived at destination" },
  { id: 'completed', label: 'Completed', tone: 'bg-gray-100 border-gray-200', dot: 'bg-gray-500', hint: "All wrapped up" },
]

const DEAD_STAGES = ['cancelled']
const ATTENTION_STAGES = ['dispute']

function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return diff
}

function ProjectCard({ project, onClick, compact = false }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-lg border border-gray-200 p-3 text-left hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">#{project.project_number}</div>
        {project.project_revenue_cents != null && (
          <div className="text-xs font-semibold text-gray-900">{formatCents(project.project_revenue_cents)}</div>
        )}
      </div>
      <div className="text-sm font-medium text-gray-900 mb-2 line-clamp-2">{project.name || `Project ${project.project_number}`}</div>
      <div className="flex items-center gap-2 text-[10px] text-gray-500 flex-wrap">
        {project.delivery_deadline && (
          <span className="inline-flex items-center gap-1">
            <Calendar size={10} />
            {formatDate(project.delivery_deadline)}
          </span>
        )}
        {project.critical_deadline && <span className="text-red-600 font-medium">Urgent</span>}
        {project.type && !compact && <span className="text-gray-400">{project.type}</span>}
      </div>
    </button>
  )
}

function Kanban({ projects, onOpen }) {
  const byStage = useMemo(() => {
    const map = Object.fromEntries(JOURNEY.map((j) => [j.id, []]))
    for (const p of projects) {
      if (DEAD_STAGES.includes(p.stage)) continue
      if (map[p.stage]) map[p.stage].push(p)
    }
    return map
  }, [projects])

  const disputes = projects.filter((p) => ATTENTION_STAGES.includes(p.stage))

  return (
    <div className="space-y-3">
      {disputes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3">
          <AlertTriangle size={16} className="text-red-600 flex-shrink-0" />
          <div className="flex-1 text-sm text-red-900">
            {disputes.length} project{disputes.length === 1 ? ' is' : 's are'} in dispute — check comments for details.
          </div>
        </div>
      )}
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
                    items.map((p) => <ProjectCard key={p.id} project={p} onClick={() => onOpen(p)} compact />)
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// --- Per-item tracking card ---
function ItemTrackingCard({ item, design, onOpenDesign }) {
  const hasTracking = item.tracking_customer || item.carrier_name
  const daysToEta = daysUntil(item.eta)
  const delivered = !!item.ata
  const inTransit = item.status === 'in_transit' || item.status === 'shipped'

  const tone = delivered
    ? 'border-green-200 bg-green-50/40'
    : inTransit
    ? 'border-blue-200 bg-blue-50/40'
    : 'border-gray-200 bg-white'

  return (
    <div className={`border rounded-lg p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900">{item.description}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Qty {item.quantity}
            {item.unit_sales_price_cents != null && <> · {formatCents(item.unit_sales_price_cents)} each</>}
            {item.total_sales_cents != null && <> · {formatCents(item.total_sales_cents)} total</>}
          </div>
        </div>
        <StatusBadge status={item.status} />
      </div>

      {/* Approved design thumbnail */}
      {design && (
        <button
          onClick={() => onOpenDesign?.(design)}
          className="mt-2 w-full flex items-center gap-3 p-2 rounded-lg bg-white/70 border border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 transition-colors text-left"
        >
          <div className="w-14 h-14 rounded-md bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            {design.display_image ? (
              <img src={design.display_image} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
            ) : (
              <Palette size={18} className="text-gray-300" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
              <CheckCircle2 size={10} className="text-green-600" />Approved design
            </div>
            <div className="text-sm font-medium text-gray-900 truncate">{design.title}</div>
            <div className="text-[11px] text-gray-500">
              Approved {design.client_approved_by_name ? `by ${design.client_approved_by_name} ` : ''}{formatDate(design.client_approved_at)}
              {design.revision_count > 0 && ` · ${design.revision_count} revision${design.revision_count === 1 ? '' : 's'}`}
            </div>
          </div>
          <ArrowRight size={14} className="text-gray-400 flex-shrink-0" />
        </button>
      )}

      {/* Milestone row */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className={`rounded-lg p-2 ${delivered || inTransit || item.status === 'in_production' ? 'bg-purple-50' : 'bg-gray-50'}`}>
          <Package size={14} className={`mx-auto mb-0.5 ${delivered || inTransit || item.status === 'in_production' ? 'text-purple-600' : 'text-gray-300'}`} />
          <div className="text-[10px] text-gray-500">Production</div>
          <div className="text-xs font-medium text-gray-900">
            {item.status === 'in_production' ? 'In progress' : (delivered || inTransit) ? 'Done' : '—'}
          </div>
        </div>
        <div className={`rounded-lg p-2 ${delivered || inTransit ? 'bg-blue-50' : 'bg-gray-50'}`}>
          <Truck size={14} className={`mx-auto mb-0.5 ${delivered || inTransit ? 'text-blue-600' : 'text-gray-300'}`} />
          <div className="text-[10px] text-gray-500">Transit</div>
          <div className="text-xs font-medium text-gray-900">
            {delivered ? 'Done' : inTransit ? 'On the way' : '—'}
          </div>
        </div>
        <div className={`rounded-lg p-2 ${delivered ? 'bg-green-50' : 'bg-gray-50'}`}>
          <CheckCircle2 size={14} className={`mx-auto mb-0.5 ${delivered ? 'text-green-600' : 'text-gray-300'}`} />
          <div className="text-[10px] text-gray-500">Delivered</div>
          <div className="text-xs font-medium text-gray-900">
            {delivered ? formatDate(item.ata) : '—'}
          </div>
        </div>
      </div>

      {/* ETA */}
      {!delivered && item.eta && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <Clock size={12} className="text-gray-400" />
          <span className="text-gray-600">ETA:</span>
          <span className="font-medium text-gray-900">{formatDate(item.eta)}</span>
          {daysToEta != null && (
            <Badge tone={daysToEta < 0 ? 'red' : daysToEta <= 3 ? 'yellow' : 'blue'}>
              {daysToEta < 0 ? `${Math.abs(daysToEta)} days late` : daysToEta === 0 ? 'today' : `in ${daysToEta} days`}
            </Badge>
          )}
        </div>
      )}

      {/* Tracking */}
      {hasTracking && !delivered && (
        <div className="mt-3 pt-3 border-t border-gray-200/70 space-y-1.5">
          {item.carrier_name && (
            <div className="flex items-center gap-2 text-xs">
              <Truck size={12} className="text-gray-400" />
              <span className="text-gray-600">Carrier:</span>
              <span className="font-medium text-gray-900">{item.carrier_name}</span>
            </div>
          )}
          {item.tracking_customer && (
            <a
              href={item.tracking_customer.startsWith('http') ? item.tracking_customer : `https://${item.tracking_customer}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              <ExternalLink size={11} />
              Track shipment
              <span className="text-gray-500 font-normal">· {item.tracking_customer.length > 30 ? item.tracking_customer.slice(0, 30) + '…' : item.tracking_customer}</span>
            </a>
          )}
        </div>
      )}

      {/* Delivered confirmation */}
      {delivered && (
        <div className="mt-3 pt-3 border-t border-green-200/70 flex items-center gap-2 text-xs text-green-700">
          <CheckCircle2 size={12} />
          <span className="font-medium">Delivered {formatDate(item.ata)}</span>
          {item.on_time_delivery === false && <Badge tone="yellow">Late</Badge>}
          {item.quality_approved === false && <Badge tone="red">Quality issue</Badge>}
        </div>
      )}
    </div>
  )
}

function ProjectDetail({ project, company, contact, onClose }) {
  const [items, setItems] = useState([])
  const [files, setFiles] = useState([])
  const [designs, setDesigns] = useState([])
  const [address, setAddress] = useState(null)
  const [nestedDesign, setNestedDesign] = useState(null)

  useEffect(() => {
    (async () => {
      const [l, f] = await Promise.all([
        supabase.from('project_line_items_client').select('*').eq('project_id', project.id).order('sort_order'),
        supabase.from('project_files').select('id, file_name, file_type, storage_url, created_at').eq('project_id', project.id).order('created_at', { ascending: false }),
      ])
      setItems(l.data ?? [])
      setFiles(f.data ?? [])

      // Pull approved (or any) designs for this project's proposal, so we can show them per item.
      if (project.proposal_id) {
        const { data: d } = await supabase
          .from('design_tasks')
          .select('*, proposal_requested_items!proposal_requested_item_id(catalogue_item_id, description)')
          .eq('proposal_id', project.proposal_id)
          .order('created_at', { ascending: false })
        const enriched = (d ?? []).map((t) => ({
          ...t,
          display_image: t.latest_file_url || null,
        }))
        setDesigns(enriched)
      }
    })()

    if (project.delivery_address_id) {
      supabase.from('addresses').select('*').eq('id', project.delivery_address_id).single()
        .then(({ data }) => setAddress(data))
    }
  }, [project.id])

  // Pick the best design match per item: approved first, by description match, then by catalogue_item_id.
  const designByItemId = useMemo(() => {
    const map = {}
    const approved = designs.filter((d) => d.status === 'approved')
    const used = new Set()
    for (const it of items) {
      let match = approved.find((d) => !used.has(d.id) && d.title && it.description && d.title.toLowerCase().trim() === it.description.toLowerCase().trim())
      if (!match && it.catalogue_item_id) {
        match = approved.find((d) => !used.has(d.id) && d.proposal_requested_items?.catalogue_item_id === it.catalogue_item_id)
      }
      if (match) { map[it.id] = match; used.add(match.id) }
    }
    return map
  }, [items, designs])

  const stage = JOURNEY.find((s) => s.id === project.stage) || { label: project.stage, tone: 'bg-gray-100 border-gray-200', dot: 'bg-gray-500', hint: '' }
  const isDispute = project.stage === 'dispute'

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-xs text-gray-500">Project #{project.project_number}</div>
            <h2 className="text-lg font-semibold text-gray-900">{project.name || `Project ${project.project_number}`}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-6">
          {/* Journey */}
          {isDispute ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-red-900">Dispute</div>
                <div className="text-xs text-red-700">Check the comments below — we're working this out with you.</div>
              </div>
            </div>
          ) : (
            <div className={`rounded-xl border p-3 ${stage.tone}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${stage.dot}`} />
                <span className="text-xs font-semibold text-gray-900">Stage: {stage.label}</span>
              </div>
              {stage.hint && <p className="text-[11px] text-gray-700">{stage.hint}</p>}
              <div className="grid grid-cols-6 gap-1 mt-3">
                {JOURNEY.map((s, i) => {
                  const active = JOURNEY.findIndex((x) => x.id === project.stage) >= i
                  return <div key={s.id} className={`h-1 rounded-full ${active ? s.dot : 'bg-gray-200'}`} />
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><div className="text-xs text-gray-500">Revenue</div><div className="text-gray-900 font-medium">{formatCents(project.project_revenue_cents)}</div></div>
            <div><div className="text-xs text-gray-500">Delivery deadline</div><div className="text-gray-900">{formatDate(project.delivery_deadline) || '—'}</div></div>
            <div><div className="text-xs text-gray-500">Payment</div><div className="text-gray-900">{project.payment_status || '—'}</div></div>
            <div><div className="text-xs text-gray-500">Fulfilment</div><div className="text-gray-900">{project.fulfilment_service || '—'}</div></div>
          </div>

          {address && (
            <div>
              <div className="text-xs text-gray-500 mb-1 font-semibold flex items-center gap-1"><MapPin size={12} />Delivery address</div>
              <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
                <div className="font-medium">{address.label}</div>
                <div className="text-xs text-gray-500">{[address.street, address.house_number, address.postal_code, address.city, address.country].filter(Boolean).join(', ')}</div>
              </div>
            </div>
          )}

          {/* Line items with rich tracking + per-item approved design */}
          {items.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Package size={14} className="text-gray-400" />Items <span className="text-xs text-gray-400 font-normal">· {items.length}</span>
              </div>
              <div className="space-y-3">
                {items.map((i) => (
                  <ItemTrackingCard
                    key={i.id}
                    item={i}
                    design={designByItemId[i.id]}
                    onOpenDesign={setNestedDesign}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Any approved designs not matched to a line item — still surface them */}
          {(() => {
            const matchedIds = new Set(Object.values(designByItemId).map((d) => d.id))
            const unmatched = designs.filter((d) => d.status === 'approved' && !matchedIds.has(d.id))
            if (unmatched.length === 0) return null
            return (
              <div>
                <div className="text-xs text-gray-500 mb-2 font-semibold">Other approved designs</div>
                <div className="grid grid-cols-2 gap-2">
                  {unmatched.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setNestedDesign(d)}
                      className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 flex items-center gap-2 text-left"
                    >
                      <Palette size={14} className="text-gray-400" />
                      <span className="text-sm text-gray-900 truncate">{d.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

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

          {project.feedback_client && (
            <div>
              <div className="text-xs text-gray-500 mb-1 font-semibold">Your feedback</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{project.feedback_client}</div>
            </div>
          )}

          <div className="pt-5 border-t border-gray-100">
            <CommentsThread entityType="project" entityId={project.id} company={company} contact={contact} />
          </div>
        </div>
      </div>

      {nestedDesign && (
        <DesignDrawer
          design={nestedDesign}
          company={company}
          contact={contact}
          onClose={() => setNestedDesign(null)}
          onUpdated={() => setNestedDesign(null)}
        />
      )}
    </div>
  )
}

export default function ProjectsPage({ company, contact, deepLinkId, clearDeepLink }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState('kanban')

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
      if (cancelled) return
      setRows(data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id])

  useEffect(() => {
    if (!deepLinkId || !rows.length) return
    const match = rows.find((r) => r.id === deepLinkId)
    if (match) {
      setSelected(match)
      clearDeepLink?.()
    }
  }, [deepLinkId, rows])

  if (loading) return <Spinner />

  const inTransit = rows.filter((r) => r.stage === 'in_transit')

  return (
    <div className="space-y-6">
      <PageHeader title="Projects" subtitle="Your confirmed orders — from production to delivery." />

      {rows.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects yet" description="Your projects will appear here once a proposal is accepted." />
      ) : (
        <>
          {inTransit.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
                <Truck size={16} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-blue-900">
                  {inTransit.length} project{inTransit.length === 1 ? '' : 's'} in transit
                </div>
                <div className="text-xs text-blue-700 mt-0.5">Track shipments per item inside each project.</div>
              </div>
              <SecondaryButton onClick={() => setSelected(inTransit[0])}>Open first</SecondaryButton>
            </div>
          )}

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
            <Kanban projects={rows} onOpen={setSelected} />
          ) : (
            <Table
              columns={[
                { key: 'project_number', label: '#', render: (r) => <span className="text-gray-500">#{r.project_number}</span> },
                { key: 'name', label: 'Name', render: (r) => <span className="font-medium text-gray-900">{r.name || `Project ${r.project_number}`}</span> },
                { key: 'stage', label: 'Stage', render: (r) => <StatusBadge status={r.stage} /> },
                { key: 'project_revenue_cents', label: 'Revenue', render: (r) => <span className="text-gray-600">{formatCents(r.project_revenue_cents)}</span> },
                { key: 'delivery_deadline', label: 'Delivery', render: (r) => <span className="text-gray-500 text-xs"><Truck size={12} className="inline mr-1" />{formatDate(r.delivery_deadline) || '—'}</span> },
              ]}
              rows={rows}
              onRowClick={setSelected}
            />
          )}
        </>
      )}

      {selected && <ProjectDetail project={selected} company={company} contact={contact} onClose={() => setSelected(null)} />}
    </div>
  )
}
