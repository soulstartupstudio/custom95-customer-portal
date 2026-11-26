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
import { lineUnitCents, lineTotalCents, lineSalesBreakdown } from '../lib/lineSales'

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
        className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg flex-shrink-0 whitespace-nowrap disabled:opacity-50"
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

// ─────────────────────────────────────────────────────────────────────────────
// Project detail (Dex, 26 Nov 2026 makeover): opening a project should feel like a little
// party and read in five seconds — what's happening now, what's next, when it arrives.
//   1. Hero: project name, the one-line "where we are", key facts (expected delivery,
//      pieces, value, payment), a short confetti burst on open.
//   2. Journey: the six stages with the current one lit, plus "what's next".
//   3. Your merch: one card per product with its approved design as the picture (matched by
//      the line's own design_task_id — renamed lines used to drop to "Other approved designs"),
//      colour, sizes, a 4-step tracker and the ETA.
//   4. Delivery + payment side by side, then files and feedback.
// An ETA the supplier hasn't confirmed yet carries a * and a footnote — no false promises.
// ─────────────────────────────────────────────────────────────────────────────

const HEADLINE = {
  preparation: { now: "We're getting everything ready", next: 'Next: your order goes into production.' },
  pending_invoice_payment: { now: 'Waiting for payment', next: 'Production starts as soon as the invoice is paid.' },
  in_production: { now: 'Your merch is being made', next: 'Next: it ships to you once production is done.' },
  in_transit: { now: 'Your merch is on its way', next: 'Next: delivery — follow it with the tracking links below.' },
  delivered: { now: "It's here — enjoy your merch!", next: 'Tell us how it went: rate this project.' },
  completed: { now: 'All wrapped up', next: 'Ready for the next drop? Reorder from your catalogue.' },
  dispute: { now: "We're sorting something out with you", next: 'We keep you posted by email until it is fixed.' },
  cancelled: { now: 'This project was cancelled', next: '' },
}

// Where a product is, in four customer steps: 0 ordered · 1 production · 2 on its way · 3 arrived.
const IN_STOCK = ['warehouse_delivered', 'warehouse_in_stock', 'at_warehouse', 'office_in_stock', 'warehouse_delivered_ondemand']
function itemStep(item) {
  const s = item.status || 'preparation'
  if (item.ata || ['delivered', 'delivered_customer', ...IN_STOCK].includes(s)) return 3
  if (s.startsWith('in_transit') || ['shipped', 'warehouse_awaiting'].includes(s)) return 2
  if (s === 'in_production') return 1
  return 0
}
const ITEM_STEPS = ['Ordered', 'In production', 'On its way', 'Delivered']

const SIZE_ORDER = ['XXXS', '3XS', 'XXS', '2XS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', '5XL']
function sizeList(b) {
  if (!b || typeof b !== 'object') return []
  const rank = (k) => { const i = SIZE_ORDER.indexOf(String(k).toUpperCase()); return i < 0 ? 100 : i }
  return Object.entries(b).filter(([, v]) => Number(v) > 0).sort((a, c) => rank(a[0]) - rank(c[0]))
}

// A tiny, one-off confetti burst in brand colours. Pure CSS; off for reduced motion.
function Confetti() {
  const colours = ['#FFFFFF', '#0A0A0A', '#F9F3EE', '#C7C7FF']
  const bits = Array.from({ length: 28 }, (_, i) => ({
    left: (i * 37) % 100, delay: (i % 7) * 0.08, dur: 1.3 + (i % 5) * 0.18,
    rot: (i * 47) % 360, w: 5 + (i % 3) * 2, h: 8 + (i % 4) * 2, c: colours[i % colours.length],
  }))
  return (
    <div className="c95-confetti pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {bits.map((b, i) => (
        <span key={i} style={{ left: `${b.left}%`, width: b.w, height: b.h, background: b.c, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, transform: `rotate(${b.rot}deg)` }} />
      ))}
    </div>
  )
}

function EtaText({ date, confirmed }) {
  if (!date) return null
  return <>{formatDate(date)}{!confirmed && <span className="text-amber-600 font-bold" title="Expected date — not yet confirmed by the supplier">*</span>}</>
}

function ItemCard({ item, design, assets = [], onOpenDesign }) {
  const step = itemStep(item)
  const delivered = step === 3
  const inStock = IN_STOCK.includes(item.status)
  const unitAllIn = lineUnitCents(item)
  const totalAllIn = lineTotalCents(item)
  const sizes = sizeList(item.size_breakdown)
  const approved = design?.status === 'approved'
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col">
      {/* The picture: the approved mock-up */}
      <button type="button" onClick={() => design && onOpenDesign?.(design)} disabled={!design}
        className="relative block w-full aspect-[4/3] bg-gray-50 group disabled:cursor-default">
        {design?.display_image ? (
          <img src={design.display_image} alt={design.title || item.description} className="absolute inset-0 w-full h-full object-contain p-3 transition-transform duration-300 group-hover:scale-[1.03]"
            onError={(e) => { e.currentTarget.style.display = 'none' }} />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-1.5">
            <Palette size={26} />
            <span className="text-xs">{design ? 'Design in progress' : 'No design needed'}</span>
          </div>
        )}
        {design && (
          <span className={`absolute top-3 left-3 inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 ${approved ? 'bg-white text-green-700 ring-1 ring-green-200' : 'bg-white text-amber-700 ring-1 ring-amber-200'}`}>
            {approved ? <><CheckCircle2 size={12} />Approved design</> : <><Clock size={12} />Design in review</>}
          </span>
        )}
        {design && <span className="absolute bottom-3 right-3 text-[11px] font-medium text-blue-700 bg-white/90 rounded-full px-2.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">View design →</span>}
      </button>

      <div className="p-4 flex-1 flex flex-col gap-3">
        <div>
          <div className="text-[15px] font-semibold text-gray-900 leading-snug">{item.description}</div>
          <div className="mt-1 flex items-center gap-x-2 gap-y-1 flex-wrap text-xs text-gray-500">
            <span className="font-semibold text-gray-900">{item.quantity} pcs</span>
            {item.selected_colour && <><span>·</span><span>{item.selected_colour.charAt(0).toUpperCase() + item.selected_colour.slice(1)}</span></>}
            {unitAllIn != null && <><span>·</span><span>{formatCents(unitAllIn)} each</span></>}
            {item.total_sales_cents != null && <><span>·</span><span>{formatCents(totalAllIn)} total</span></>}
          </div>
          {sizes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {sizes.map(([s, n]) => (
                <span key={s} className="text-[11px] rounded-md bg-gray-50 ring-1 ring-gray-200 px-1.5 py-0.5"><span className="font-semibold text-gray-900">{s}</span> <span className="text-gray-500">{n}</span></span>
              ))}
            </div>
          )}
        </div>

        {/* 4-step tracker */}
        <div>
          <div className="flex items-center">
            {ITEM_STEPS.map((label, i) => (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${i < step || delivered ? 'bg-blue-600 text-white' : i === step ? 'bg-white text-blue-600 ring-2 ring-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                  {i < step || delivered ? <CheckCircle2 size={13} /> : [<Package key="p" size={12} />, <Wrench key="w" size={12} />, <Truck key="t" size={12} />, <MapPin key="m" size={12} />][i]}
                </div>
                {i < ITEM_STEPS.length - 1 && <div className={`h-0.5 flex-1 mx-1 rounded ${i < step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-gray-500">
            {ITEM_STEPS.map((label, i) => <span key={label} className={i === step ? 'font-semibold text-gray-900' : ''}>{i === 3 && inStock ? 'In stock' : label}</span>)}
          </div>
        </div>

        <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between gap-2 text-xs">
          {delivered ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-green-700"><CheckCircle2 size={13} />{inStock ? 'In stock at our warehouse' : 'Delivered'}{item.ata ? ` · ${formatDate(item.ata)}` : ''}</span>
          ) : item.eta ? (
            <span className="inline-flex items-center gap-1.5 text-gray-600"><Calendar size={13} className="text-gray-400" />Expected <span className="font-semibold text-gray-900"><EtaText date={item.eta} confirmed={item.eta_confirmed} /></span></span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-gray-500"><Calendar size={13} className="text-gray-400" />Date follows soon</span>
          )}
          {item.tracking_customer && !delivered && (
            <a href={item.tracking_customer.startsWith('http') ? item.tracking_customer : `https://${item.tracking_customer}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700">
              <Truck size={12} />Track{item.carrier_name ? ` (${item.carrier_name})` : ''}<ExternalLink size={11} />
            </a>
          )}
        </div>

        {assets.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mr-0.5">Logos</span>
            {assets.map((a) => (
              <a key={a.id} href={a.signed_url || '#'} target="_blank" rel="noreferrer" title={a.name || 'Logo'}
                className="w-9 h-9 rounded-md ring-1 ring-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center hover:ring-blue-300">
                {a.signed_url && /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(a.path || '')
                  ? <img src={a.signed_url} alt="" className="w-full h-full object-contain p-0.5" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  : <ImageIcon size={13} className="text-gray-400" />}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AddressLines({ address }) {
  if (!address) return null
  return (
    <div className="text-sm text-gray-700 leading-relaxed">
      <div className="font-semibold text-gray-900">{address.label || address.contact_name || address.street}</div>
      <div>{[address.street, address.house_number].filter(Boolean).join(' ')}</div>
      <div>{[address.postal_code, address.city].filter(Boolean).join(' ')}{address.country ? `, ${address.country}` : ''}</div>
      {address.contact_name && <div className="text-xs text-gray-500 mt-1">{address.contact_name}{address.contact_phone ? ` · ${address.contact_phone}` : ''}</div>}
    </div>
  )
}

export function ProjectDetail({ project, company, contact, onClose, onRate }) {
  const [items, setItems] = useState([])
  const [files, setFiles] = useState([])
  const [designs, setDesigns] = useState([])
  const [designAssets, setDesignAssets] = useState({}) // design_id -> [{id, signed_url, path, name}]
  const [deliveryAddress, setDeliveryAddress] = useState(null)
  const [billingAddress, setBillingAddress] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [nestedDesign, setNestedDesign] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !nestedDesign) onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, nestedDesign])

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
      setLoaded(true)

      if (project.proposal_id) {
        const { data: d } = await supabase
          .from('design_tasks')
          .select('*, proposal_requested_items!proposal_requested_item_id(catalogue_item_id, description)')
          .eq('proposal_id', project.proposal_id)
          .order('created_at', { ascending: false })
        const designIds = (d ?? []).map((t) => t.id)
        const mockupUrls = await fetchDesignMockupUrls(designIds)
        setDesigns((d ?? []).map((t) => ({ ...t, display_image: mockupUrls[t.id] || null, has_mockup: !!mockupUrls[t.id] })))

        if (designIds.length) {
          // Logos per design: the team's uploads (design_files) + logos picked from the brand kit.
          const [{ data: rawFiles }, { data: linked }] = await Promise.all([
            supabase.from('design_files').select('id, design_task_id, file_url, file_type, storage_bucket')
              .in('design_task_id', designIds).in('file_type', ['logo', 'asset']),
            supabase.from('design_task_assets').select('id, design_task_id, brand_assets(id, name, file_name, storage_path)')
              .in('design_task_id', designIds),
          ])
          const list = [
            ...(rawFiles ?? []).map((f) => ({ id: f.id, design_task_id: f.design_task_id, bucket: f.storage_bucket || 'designs', path: f.file_url, name: f.file_url?.split('/').pop() })),
            ...(linked ?? []).filter((r) => r.brand_assets?.storage_path).map((r) => ({ id: `bk-${r.id}`, design_task_id: r.design_task_id, bucket: 'brand-assets', path: r.brand_assets.storage_path, name: r.brand_assets.file_name || r.brand_assets.name })),
          ]
          const byBucket = {}
          for (const a of list) (byBucket[a.bucket] = byBucket[a.bucket] || []).push(a)
          const byDesign = {}
          for (const [bucket, arr] of Object.entries(byBucket)) {
            const { data: signed } = await supabase.storage.from(bucket).createSignedUrls(arr.map((a) => a.path), 60 * 60)
            const byPath = Object.fromEntries((signed ?? []).filter((s) => !s.error).map((s) => [s.path, s.signedUrl]))
            for (const a of arr) (byDesign[a.design_task_id] = byDesign[a.design_task_id] || []).push({ ...a, signed_url: byPath[a.path] })
          }
          setDesignAssets(byDesign)
        }
      }
    })()

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

  // The line's own design first (design_task_id); name / catalogue match only for old lines.
  const designByItemId = useMemo(() => {
    const map = {}
    const used = new Set()
    const byId = Object.fromEntries(designs.map((d) => [d.id, d]))
    for (const it of items) if (it.design_task_id && byId[it.design_task_id]) { map[it.id] = byId[it.design_task_id]; used.add(it.design_task_id) }
    const approved = designs.filter((d) => d.status === 'approved')
    const normTitle = (s) => (s || '').toLowerCase().replace(/^design:\s*/i, '').trim()
    for (const it of items) {
      if (map[it.id]) continue
      const want = normTitle(it.description)
      let match = approved.find((d) => !used.has(d.id) && normTitle(d.title) === want)
      if (!match && it.catalogue_item_id) match = approved.find((d) => !used.has(d.id) && d.proposal_requested_items?.catalogue_item_id === it.catalogue_item_id)
      if (match) { map[it.id] = match; used.add(match.id) }
    }
    return map
  }, [items, designs])

  const stageIdx = JOURNEY.findIndex((s) => s.id === project.stage)
  const isDispute = project.stage === 'dispute'
  const isCancelled = project.stage === 'cancelled'
  const headline = HEADLINE[project.stage] || { now: JOURNEY[stageIdx]?.label || 'In progress', next: '' }
  const number = project.display_number ?? project.project_number
  const pieces = items.reduce((a, i) => a + (Number(i.quantity) || 0), 0)
  const open = items.filter((i) => itemStep(i) < 3)
  const etas = open.filter((i) => i.eta).sort((a, b) => String(a.eta).localeCompare(String(b.eta)))
  const lastEta = etas[etas.length - 1] || null
  const anyUnconfirmed = open.some((i) => i.eta && !i.eta_confirmed)
  const allDone = items.length > 0 && open.length === 0
  const celebrate = ['delivered', 'completed'].includes(project.stage) || allDone
  const matchedIds = new Set(Object.values(designByItemId).map((d) => d.id))
  const unmatched = designs.filter((d) => d.status === 'approved' && !matchedIds.has(d.id))
  const isWarehouse = project.fulfilment_service === 'warehouse' || project.warehousing_needed

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-4xl bg-gray-50 h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={project.name || `Project ${number}`}>
        {/* ── Hero ── */}
        <div className={`relative overflow-hidden text-white px-6 sm:px-8 pt-6 pb-7 ${isDispute ? 'bg-gray-900' : isCancelled ? 'bg-gray-500' : 'bg-blue-600'}`}>
          {!isDispute && !isCancelled && <Confetti />}
          <div className="relative flex items-start justify-between gap-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/80">
              Project #{number}{project.from_proposal && project.from_proposal !== number ? ` · from proposal #${project.from_proposal}` : ''}
            </div>
            <div className="flex items-center gap-2">
              {(project.stage === 'delivered' || project.stage === 'completed') && (
                <button onClick={onRate} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-white text-blue-700 hover:bg-blue-50">
                  <Palette size={13} />{project.review_completed ? 'Edit your review' : 'Rate this project'}
                </button>
              )}
              <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"><X size={17} /></button>
            </div>
          </div>
          <h2 className="relative display text-[34px] sm:text-[44px] mt-3 break-words">{project.name || `Project ${number}`}</h2>
          <p className="relative mt-3 text-lg sm:text-xl font-semibold">{celebrate && !isDispute ? '🎉 ' : ''}{allDone && !celebrate ? 'Everything has arrived' : headline.now}</p>
          {headline.next && <p className="relative text-sm text-white/80 mt-0.5">{headline.next}</p>}

          <div className="relative mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              allDone
                ? ['Status', 'All arrived']
                : lastEta
                  ? ['Expected delivery', <EtaText key="e" date={lastEta.eta} confirmed={!anyUnconfirmed} />]
                  : ['Your deadline', formatDate(project.delivery_deadline) || 'To be set'],
              ['Your merch', `${items.length} product${items.length === 1 ? '' : 's'} · ${pieces.toLocaleString('nl-NL')} pcs`],
              ['Order value', project.project_revenue_cents != null ? `${formatCents(project.project_revenue_cents)}` : '—'],
              ['Payment', project.payment_status ? (PAYMENT_STATUS_LABEL[project.payment_status] || project.payment_status) : (invoices.length ? 'Invoiced' : 'Not invoiced yet')],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white/12 ring-1 ring-white/20 px-3 py-2.5 backdrop-blur-sm" style={{ background: 'rgba(255,255,255,0.12)' }}>
                <div className="text-[10px] uppercase tracking-[0.14em] text-white/70 font-bold">{label}</div>
                <div className="text-sm sm:text-base font-semibold mt-0.5 [&_span]:text-white">{value}</div>
              </div>
            ))}
          </div>
          {project.project_revenue_cents != null && <div className="relative text-[11px] text-white/60 mt-1.5">Order value excl. VAT.</div>}
        </div>

        <div className="p-5 sm:p-8 space-y-8">
          {/* ── Journey ── */}
          {!isDispute && !isCancelled && stageIdx >= 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="eyebrow mb-4">Where we are</div>
              <ol className="grid grid-cols-6 gap-1">
                {JOURNEY.map((s, i) => {
                  const done = i < stageIdx, now = i === stageIdx
                  return (
                    <li key={s.id} className="flex flex-col items-center text-center">
                      <div className="flex items-center w-full">
                        <div className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : i <= stageIdx ? 'bg-blue-600' : 'bg-gray-200'}`} />
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${done ? 'bg-blue-600 text-white' : now ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-gray-100 text-gray-400'}`}>
                          {done ? <CheckCircle2 size={15} /> : i + 1}
                        </div>
                        <div className={`h-0.5 flex-1 ${i === JOURNEY.length - 1 ? 'opacity-0' : i < stageIdx ? 'bg-blue-600' : 'bg-gray-200'}`} />
                      </div>
                      <div className={`mt-2 text-[11px] leading-tight ${now ? 'font-bold text-gray-900' : `hidden sm:block ${done ? 'text-gray-700' : 'text-gray-400'}`}`}>{s.label}</div>
                      {now && <div className="hidden sm:block mt-0.5 text-[10px] text-gray-500 leading-tight">{s.hint}</div>}
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
          {isDispute && (
            <div className="bg-white border border-red-200 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-700">We're working this out with you. Questions? Reply to our last email or message your account manager.</div>
            </div>
          )}

          {/* ── Your merch ── */}
          <section>
            <div className="flex items-end justify-between gap-3 mb-3">
              <div>
                <div className="eyebrow">Your merch</div>
                <h3 className="display text-2xl text-gray-900 mt-1">{items.length} product{items.length === 1 ? '' : 's'} in this project</h3>
              </div>
              {pieces > 0 && <div className="hidden sm:block text-sm text-gray-500">{pieces.toLocaleString('nl-NL')} pieces in total</div>}
            </div>
            {!loaded ? (
              <div className="py-12 flex justify-center"><Spinner /></div>
            ) : items.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">Your products appear here as soon as the order is set up.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {items.map((i) => {
                  const d = designByItemId[i.id]
                  return <ItemCard key={i.id} item={i} design={d} assets={d ? (designAssets[d.id] ?? []) : []} onOpenDesign={setNestedDesign} />
                })}
              </div>
            )}
            {anyUnconfirmed && (
              <p className="mt-3 text-xs text-gray-500"><span className="text-amber-600 font-bold">*</span> Expected date — the supplier hasn't confirmed it yet. We'll update it as soon as they do.</p>
            )}
            {unmatched.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-semibold text-gray-500 mb-2">More approved designs</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {unmatched.map((d) => (
                    <button key={d.id} onClick={() => setNestedDesign(d)} className="bg-white rounded-xl border border-gray-200 overflow-hidden text-left hover:border-blue-300">
                      <div className="aspect-square bg-gray-50 flex items-center justify-center">
                        {d.display_image ? <img src={d.display_image} alt="" className="w-full h-full object-contain p-2" /> : <Palette size={18} className="text-gray-300" />}
                      </div>
                      <div className="px-2.5 py-2 text-xs font-medium text-gray-900 line-clamp-2">{String(d.title || '').replace(/^Design:\s*/i, '')}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── Delivery + payment ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3"><Truck size={16} className="text-blue-600" /><div className="eyebrow">Delivery</div></div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <div className="text-[11px] text-gray-500">Your deadline</div>
                  <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 flex-wrap">
                    {formatDate(project.delivery_deadline) || '—'}
                    {project.eta_locked_at && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 ring-1 ring-green-200 rounded-full px-1.5 py-0.5" title={`Locked on ${formatDate(project.eta_locked_at)}`}>
                        <CheckCircle2 size={9} />Locked
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">How it's delivered</div>
                  <div className="text-sm font-semibold text-gray-900">{FULFILMENT_LABEL[project.fulfilment_service] || project.fulfilment_service?.replace(/_/g, ' ') || '—'}</div>
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5">
                {isWarehouse ? (
                  <>
                    <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><Warehouse size={14} className="text-blue-600" />Custom95 warehouse</div>
                    <div className="text-xs text-gray-600 mt-1">We keep your stock — request shipments from the Warehouse tab whenever you need them.</div>
                    {project.proposals?.recipient_contact_name && (
                      <div className="text-xs text-gray-600 mt-2">Recipient on ship-out: <span className="font-medium text-gray-900">{project.proposals.recipient_contact_name}</span></div>
                    )}
                  </>
                ) : deliveryAddress ? <AddressLines address={deliveryAddress} />
                  : <div className="text-xs text-gray-500">No delivery address on file yet — your account manager will confirm it with you.</div>}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3"><Receipt size={16} className="text-blue-600" /><div className="eyebrow">Payment</div></div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <div className="text-[11px] text-gray-500">Status</div>
                  <div className="mt-0.5">{project.payment_status
                    ? <Badge tone={PAYMENT_STATUS_TONE[project.payment_status] || 'gray'}>{PAYMENT_STATUS_LABEL[project.payment_status] || project.payment_status}</Badge>
                    : <span className="text-sm text-gray-400">—</span>}</div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500">Payment terms</div>
                  <div className="text-sm font-semibold text-gray-900">{project.payment_terms || '—'}</div>
                </div>
              </div>
              {invoices.length === 0 ? (
                <div className="rounded-xl bg-gray-50 p-3.5 text-xs text-gray-500">No invoice yet — it appears here as soon as it's sent.</div>
              ) : (
                <div className="space-y-2">
                  {invoices.map((inv) => (
                    <div key={inv.id} className="rounded-xl bg-gray-50 p-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">Invoice #{inv.invoice_number}</span>
                          <Badge tone={INVOICE_STATUS_TONE[inv.status] || 'gray'}>{INVOICE_STATUS_LABEL[inv.status] || inv.status}</Badge>
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {formatCents(inv.total_cents)} incl. VAT
                          {inv.due_date && !inv.paid_at && <> · due {formatDate(inv.due_date)}</>}
                          {inv.paid_at && <> · paid {formatDate(inv.paid_at)}</>}
                        </div>
                      </div>
                      {inv.status !== 'draft' && <InvoiceDownloadButton invoice={inv} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {billingAddress && !isWarehouse && billingAddress.id !== deliveryAddress?.id && (
            <div className="-mt-4 text-xs text-gray-500">Billing address: {[billingAddress.street, billingAddress.house_number].filter(Boolean).join(' ')}, {[billingAddress.postal_code, billingAddress.city].filter(Boolean).join(' ')}</div>
          )}

          {files.length > 0 && (
            <section>
              <div className="eyebrow mb-3">Files</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {files.map((f) => (
                  <a key={f.id} href={f.storage_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 hover:border-blue-300">
                    <FileText size={16} className="text-blue-600" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 truncate">{f.file_name}</div>
                      <div className="text-[11px] text-gray-400">{f.file_type}</div>
                    </div>
                    <Download size={14} className="text-gray-400" />
                  </a>
                ))}
              </div>
            </section>
          )}

          {project.feedback_client && (
            <section>
              <div className="eyebrow mb-2">Your feedback</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-white rounded-xl border border-gray-200 p-4">{project.feedback_client}</div>
            </section>
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
      // FB-133/160: projects show their own project number — the one the team, suppliers and
      // invoices use. The proposal it came from is shown underneath in the project panel.
      const enriched = (data ?? []).map((p) => ({
        ...p,
        display_number: p.project_number,
        from_proposal: p.proposals?.proposal_number ?? null,
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
