import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  FolderKanban, X, Truck, Calendar, FileText, LayoutGrid, List as ListIcon,
  Package, CheckCircle2, Clock, AlertTriangle, MapPin, ExternalLink, Wrench,
  Palette, ArrowRight, Download, Receipt, CreditCard, Image as ImageIcon, Warehouse,
} from 'lucide-react'
import { PageHeader, StatusBadge, EmptyState, Spinner, formatCents, formatDate, Table, Badge, SecondaryButton, SectionBlock } from '../components/ui'
import DesignDrawer from '../components/DesignDrawer'
import ProjectReviewModal from '../components/ProjectReviewModal'
import { fetchDesignMockupUrls } from '../lib/designThumbnails'
import { downloadInvoicePdf } from '../lib/downloadInvoice'

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

const INVOICE_STATUS_LABEL = {
  draft: 'Draft', sent: 'Awaiting payment', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled',
}
const INVOICE_STATUS_TONE = {
  draft: 'gray', sent: 'blue', paid: 'green', overdue: 'red', cancelled: 'gray',
}
const PAYMENT_STATUS_LABEL = {
  unpaid: 'Unpaid', partial: 'Partially paid', paid: 'Paid', overdue: 'Overdue', gift: 'Gift',
}
const PAYMENT_STATUS_TONE = {
  unpaid: 'yellow', partial: 'blue', paid: 'green', overdue: 'red', gift: 'purple',
}
const FULFILMENT_LABEL = {
  direct: 'Direct to your address',
  multi_address: 'Multiple addresses',
  warehouse: 'Custom95 warehouse',
  brandshop: 'Brandshop fulfilment',
}

function InvoiceDownloadButton({ invoice }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const click = async () => {
    setBusy(true); setErr(null)
    try { await downloadInvoicePdf(invoice.id) }
    catch (e) { setErr(e.message || 'Failed') }
    finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={click}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg flex-shrink-0 disabled:opacity-50"
      >
        <Download size={12} />{busy ? 'Preparing…' : 'Download PDF'}
      </button>
      {err && <div className="text-[10px] text-red-600 max-w-[180px] text-right">{err}</div>}
    </div>
  )
}

function ProjectCard({ project, onClick, compact = false }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-lg border border-gray-200 p-3 text-left hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">#{project.display_number ?? project.project_number}</div>
        {project.project_revenue_cents != null && (
          <div className="text-xs font-semibold text-gray-900">{formatCents(project.project_revenue_cents)}</div>
        )}
      </div>
      <div className="text-sm font-medium text-gray-900 mb-2 line-clamp-2">{project.name || `Project ${project.display_number ?? project.project_number}`}</div>
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
      <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6 pb-2">
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
function ItemTrackingCard({ item, design, teamAssets = [], onOpenDesign }) {
  const hasTracking = item.tracking_customer || item.carrier_name
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
          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1 flex-wrap">
            <span>Qty {item.quantity}</span>
            {item.unit_sales_price_cents != null && <><span>·</span><span>{formatCents(item.unit_sales_price_cents)} each</span></>}
            {item.total_sales_cents != null && <><span>·</span><span>{formatCents(item.total_sales_cents)} total</span></>}
            {item.selected_colour && <><span>·</span><span>{item.selected_colour}</span></>}
            {item.customization_notes && <><span>·</span><span className="text-gray-700 italic line-clamp-1">{item.customization_notes.split('\n')[0]}</span></>}
          </div>
        </div>
        <StatusBadge status={item.status} />
      </div>

      {/* Approved design strip + inline team logos/assets */}
      {design && (
        <div className="mt-2 rounded-lg bg-white/70 border border-gray-200 overflow-hidden">
          <button
            onClick={() => onOpenDesign?.(design)}
            className="w-full flex items-center gap-3 p-2 hover:border-blue-300 hover:bg-blue-50/40 transition-colors text-left"
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
          {teamAssets.length > 0 && (
            <div className="px-2 pb-2 bg-gray-50/60 border-t border-gray-200/60">
              <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mt-1.5 mb-1 flex items-center gap-1">
                <ImageIcon size={10} />Logos &amp; assets ({teamAssets.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {teamAssets.map((a) => (
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

      {/* ETA (date only, no countdown) */}
      {!delivered && item.eta && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <Clock size={12} className="text-gray-400" />
          <span className="text-gray-600">ETA:</span>
          <span className="font-medium text-gray-900">{formatDate(item.eta)}</span>
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
        </div>
      )}
    </div>
  )
}

function AddressCard({ address, label }) {
  if (!address) return null
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      {label && <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{label}</div>}
      <div className="text-sm font-medium text-gray-900">{address.label || address.street}</div>
      <div className="text-xs text-gray-600">
        {[address.street, address.house_number].filter(Boolean).join(' ')}
        {(address.postal_code || address.city) && `, ${[address.postal_code, address.city].filter(Boolean).join(' ')}`}
        {address.country && `, ${address.country}`}
      </div>
      {address.contact_name && (
        <div className="text-[11px] text-gray-500 mt-1.5 pt-1.5 border-t border-gray-100">
          {address.contact_name}{address.contact_phone ? ` · ${address.contact_phone}` : ''}{address.contact_email ? ` · ${address.contact_email}` : ''}
        </div>
      )}
    </div>
  )
}

function ProjectDetail({ project, company, contact, onClose, onRate }) {
  const [items, setItems] = useState([])
  const [files, setFiles] = useState([])
  const [designs, setDesigns] = useState([])
  const [designTeamAssets, setDesignTeamAssets] = useState({}) // design_id -> [{signed_url, file_type, version}]
  const [deliveryAddress, setDeliveryAddress] = useState(null)
  const [billingAddress, setBillingAddress] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [nestedDesign, setNestedDesign] = useState(null)

  useEffect(() => {
    (async () => {
      const [l, f, invRes] = await Promise.all([
        supabase.from('project_line_items_client').select('*').eq('project_id', project.id).order('sort_order'),
        supabase.from('project_files').select('id, file_name, file_type, storage_url, created_at').eq('project_id', project.id).order('created_at', { ascending: false }),
        supabase.from('invoices')
          .select('id, invoice_number, status, subtotal_cents, vat_rate, vat_amount_cents, discount_cents, total_cents, invoice_date, due_date, paid_at, payment_method, notes')
          .eq('project_id', project.id)
          .order('invoice_date', { ascending: false }),
      ])
      setItems(l.data ?? [])
      setFiles(f.data ?? [])
      setInvoices(invRes.data ?? [])

      if (project.proposal_id) {
        const { data: d } = await supabase
          .from('design_tasks')
          .select('*, proposal_requested_items!proposal_requested_item_id(catalogue_item_id, description)')
          .eq('proposal_id', project.proposal_id)
          .order('created_at', { ascending: false })
        const designIds = (d ?? []).map((t) => t.id)
        const mockupUrls = await fetchDesignMockupUrls(designIds)
        const enriched = (d ?? []).map((t) => ({
          ...t,
          display_image: mockupUrls[t.id] || t.latest_file_url || null,
          has_mockup: !!mockupUrls[t.id],
        }))
        setDesigns(enriched)

        // Logos & assets per design (team-uploaded) — signed inline
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
      }
    })()

    // Pull delivery + billing addresses (may be same, may differ)
    const addrIds = [project.delivery_address_id, project.billing_address_id].filter(Boolean)
    if (addrIds.length) {
      supabase.from('addresses').select('*').in('id', addrIds)
        .then(({ data }) => {
          const byId = Object.fromEntries((data ?? []).map((a) => [a.id, a]))
          setDeliveryAddress(byId[project.delivery_address_id] || null)
          setBillingAddress(byId[project.billing_address_id] || null)
        })
    }
  }, [project.id])

  // Pick the best design match per item. Team app titles are usually "Design: <item name>"
  // and design_tasks often have NULL line_item_id / proposal_requested_item_id, so we
  // strip the prefix and lowercase-trim before comparing.
  const designByItemId = useMemo(() => {
    const map = {}
    const approved = designs.filter((d) => d.status === 'approved')
    const used = new Set()
    const normTitle = (s) => (s || '').toLowerCase().replace(/^design:\s*/i, '').trim()
    for (const it of items) {
      const want = normTitle(it.description)
      let match = approved.find((d) => !used.has(d.id) && normTitle(d.title) === want)
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
            <div className="text-xs text-gray-500">Project #{project.display_number ?? project.project_number}</div>
            <h2 className="text-lg font-semibold text-gray-900">{project.name || `Project ${project.display_number ?? project.project_number}`}</h2>
          </div>
          <div className="flex items-center gap-2">
            {(project.stage === 'delivered' || project.stage === 'completed') && (
              <button
                onClick={onRate}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  project.review_completed
                    ? 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <Palette size={13} />{project.review_completed ? 'Edit review' : 'Rate this project'}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
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

          {/* ----- LOGISTICS BLOCK ----- */}
          <SectionBlock icon={Truck} title="Logistics" tone="blue">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">Delivery deadline</div>
                  <div className="text-gray-900 font-medium flex items-center gap-1.5">
                    <Calendar size={13} className="text-gray-400" />{formatDate(project.delivery_deadline) || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">Fulfilment</div>
                  <div className="text-gray-900">{FULFILMENT_LABEL[project.fulfilment_service] || project.fulfilment_service?.replace(/_/g, ' ') || '—'}</div>
                </div>
              </div>

              {/* Address cards — warehouse case gets a synthetic Custom95 destination */}
              {project.fulfilment_service === 'warehouse' || project.warehousing_needed ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="border border-blue-200 bg-blue-50 rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wide text-blue-700 mb-1 flex items-center gap-1">
                      <Warehouse size={11} />Delivery destination
                    </div>
                    <div className="text-sm font-semibold text-gray-900">Custom95 Warehouse</div>
                    <div className="text-xs text-gray-600 mt-0.5">Stock held with us — request shipments from the Warehouse tab.</div>
                    {project.proposals?.recipient_contact_name ? (
                      <div className="text-[11px] text-gray-700 mt-2 pt-2 border-t border-blue-200">
                        <span className="text-blue-700 uppercase tracking-wide text-[9px] block mb-0.5">Recipient on ship-out</span>
                        <span className="font-medium">{project.proposals.recipient_contact_name}</span>
                        {project.proposals.recipient_contact_phone ? ` · ${project.proposals.recipient_contact_phone}` : ''}
                        {project.proposals.recipient_contact_email ? ` · ${project.proposals.recipient_contact_email}` : ''}
                      </div>
                    ) : null}
                  </div>
                  {billingAddress && <AddressCard address={billingAddress} label="Billing address" />}
                </div>
              ) : (deliveryAddress || billingAddress) ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <AddressCard address={deliveryAddress} label="Delivery address" />
                  {billingAddress && billingAddress.id !== deliveryAddress?.id && (
                    <AddressCard address={billingAddress} label="Billing address" />
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-400">No addresses on file for this project.</div>
              )}

              {/* Delivery notes from the proposal wizard */}
              {project.delivery_notes && (
                <div className="border border-gray-200 rounded-lg p-3 bg-white">
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Delivery notes</div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap">{project.delivery_notes}</div>
                </div>
              )}
            </div>
          </SectionBlock>

          {/* ----- FINANCIAL BLOCK ----- */}
          <SectionBlock icon={Receipt} title="Financial" tone="green">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">Payment status</div>
                  <div className="mt-0.5">
                    {project.payment_status ? (
                      <Badge tone={PAYMENT_STATUS_TONE[project.payment_status] || 'gray'}>
                        {PAYMENT_STATUS_LABEL[project.payment_status] || project.payment_status}
                      </Badge>
                    ) : <span className="text-gray-400">—</span>}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">Payment terms</div>
                  <div className="text-gray-900">{project.payment_terms || '—'}</div>
                </div>
              </div>

              {invoices.length === 0 ? (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                  No invoice issued yet. Your invoice will appear here once your team prepares it.
                </div>
              ) : (
                <div className="space-y-2">
                  {invoices.map((inv) => {
                    const statusTone = INVOICE_STATUS_TONE[inv.status] || 'gray'
                    const statusLabel = INVOICE_STATUS_LABEL[inv.status] || inv.status
                    return (
                      <div key={inv.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="text-sm font-semibold text-gray-900">Invoice #{inv.invoice_number}</div>
                              <Badge tone={statusTone}>{statusLabel}</Badge>
                            </div>
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              {inv.invoice_date && <>Issued {formatDate(inv.invoice_date)}</>}
                              {inv.due_date && <> · Due {formatDate(inv.due_date)}</>}
                              {inv.paid_at && <> · Paid {formatDate(inv.paid_at)}</>}
                            </div>
                          </div>
                          {inv.status !== 'draft' && <InvoiceDownloadButton invoice={inv} />}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div className="bg-gray-50 rounded p-2">
                            <div className="text-[10px] uppercase text-gray-400">Subtotal</div>
                            <div className="text-gray-900 font-medium">{formatCents(inv.subtotal_cents)}</div>
                          </div>
                          {inv.discount_cents > 0 && (
                            <div className="bg-gray-50 rounded p-2">
                              <div className="text-[10px] uppercase text-gray-400">Discount</div>
                              <div className="text-red-600 font-medium">−{formatCents(inv.discount_cents)}</div>
                            </div>
                          )}
                          <div className="bg-gray-50 rounded p-2">
                            <div className="text-[10px] uppercase text-gray-400">VAT {inv.vat_rate ? `(${inv.vat_rate}%)` : ''}</div>
                            <div className="text-gray-900 font-medium">{formatCents(inv.vat_amount_cents)}</div>
                          </div>
                          <div className="bg-blue-50 rounded p-2">
                            <div className="text-[10px] uppercase text-blue-700">Total</div>
                            <div className="text-blue-900 font-bold">{formatCents(inv.total_cents)}</div>
                          </div>
                        </div>

                        {inv.payment_method && (
                          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600 flex items-center gap-1.5">
                            <CreditCard size={11} className="text-gray-400" />
                            Payment method: <span className="text-gray-900">{inv.payment_method.replace(/_/g, ' ')}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </SectionBlock>

          {/* ----- ITEMS BLOCK ----- */}
          {items.length > 0 && (
            <SectionBlock
              icon={Package}
              title={`Items · ${items.length}`}
              tone="purple"
            >
              <div className="space-y-3">
                {items.map((i) => {
                  const d = designByItemId[i.id]
                  return (
                    <ItemTrackingCard
                      key={i.id}
                      item={i}
                      design={d}
                      teamAssets={d ? (designTeamAssets[d.id] ?? []) : []}
                      onOpenDesign={setNestedDesign}
                    />
                  )
                })}
              </div>
            </SectionBlock>
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

export default function ProjectsPage({ company, contact, deepLinkId, deepLinkReview, clearDeepLink }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  // Default to list view on small screens (Kanban is unusable < ~640px)
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.matchMedia?.('(min-width: 640px)').matches ? 'kanban' : 'list'))
  const [reviewProject, setReviewProject] = useState(null)

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('projects')
        .select('*, proposals!projects_proposal_id_fkey(proposal_number, recipient_contact_name, recipient_contact_phone, recipient_contact_email)')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
      if (cancelled) return
      // Display projects using the originating proposal number (same as customer's proposal #)
      const enriched = (data ?? []).map((p) => ({
        ...p,
        display_number: p.proposals?.proposal_number ?? p.project_number,
      }))
      setRows(enriched)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id])

  useEffect(() => {
    if (!deepLinkId || !rows.length) return
    const match = rows.find((r) => r.id === deepLinkId)
    if (match) {
      setSelected(match)
      // If the URL carried a review token, open the rating modal too
      if (deepLinkReview) setReviewProject(match)
      clearDeepLink?.()
    }
  }, [deepLinkId, deepLinkReview, rows])

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
                { key: 'project_number', label: '#', render: (r) => <span className="text-gray-500">#{r.display_number ?? r.project_number}</span> },
                { key: 'name', label: 'Name', render: (r) => <span className="font-medium text-gray-900">{r.name || `Project ${r.display_number ?? r.project_number}`}</span> },
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

      {selected && <ProjectDetail project={selected} company={company} contact={contact} onClose={() => setSelected(null)} onRate={() => setReviewProject(selected)} />}

      {reviewProject && (
        <ProjectReviewModal
          project={reviewProject}
          onClose={() => setReviewProject(null)}
          onSaved={(updated) => {
            setRows((prev) => prev.map((r) => r.id === updated.id ? { ...r, ...updated } : r))
            if (selected?.id === updated.id) setSelected({ ...selected, ...updated })
          }}
        />
      )}
    </div>
  )
}
