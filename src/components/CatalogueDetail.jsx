import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  X, Package, Leaf, Search, Plus, Check, Truck, Zap, Wallet, Clock, Image as ImageIcon,
  ChevronLeft, ChevronRight, Globe, Sparkles, Box, Star, Paintbrush,
} from 'lucide-react'
import { Badge, PrimaryButton, SecondaryButton, formatCents, formatDate } from './ui'
import { itemLeadDays, rollingEtaDate, formatEtaDate } from '../lib/eta'

const SHIPPING_LABELS = {
  express: { label: 'Express', icon: Zap, tone: 'bg-purple-50 border-purple-200 text-purple-900', accent: 'text-purple-700' },
  standard: { label: 'Standard', icon: Truck, tone: 'bg-blue-50 border-blue-200 text-blue-900', accent: 'text-blue-700' },
  budget: { label: 'Budget', icon: Wallet, tone: 'bg-gray-50 border-gray-200 text-gray-900', accent: 'text-gray-700' },
}

function getTierPrice(tiers, qty) {
  if (!tiers?.length || !qty) return null
  for (const t of tiers) {
    const from = t.qty_from ?? 0
    const to = t.qty_to ?? Infinity
    if (qty >= from && qty <= to) return t.sales_price_cents
  }
  const sorted = [...tiers].sort((a, b) => (a.qty_from ?? 0) - (b.qty_from ?? 0))
  if (sorted.length && qty < (sorted[0].qty_from ?? 0)) return sorted[0].sales_price_cents
  return null
}

function shippingCost(item, method, qty) {
  if (!item || !method || !qty) return null
  const perUnit = item[`${method}_per_unit_cents`]
  const minCost = item[`${method}_min_cost_cents`]
  if (perUnit == null) return null
  const calc = perUnit * qty
  return minCost && calc < minCost ? minCost : calc
}

function shippingExtraDays(item, method) {
  if (!item || !method) return null
  return item[`${method}_extra_days`] ?? null
}

function shippingMethodCopy(item, method) {
  return item[`${method}_method`] || null
}

function ProposalPicker({ company, contact, item, choices, qty, onClose, onSelect, onCreateNew }) {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.from('proposals')
      .select('id, proposal_number, name, status, created_at')
      .eq('company_id', company.id)
      .in('status', ['inquiry_received', 'discovery'])
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (!cancelled) { setProposals(data ?? []); setLoading(false) } })
    return () => { cancelled = true }
  }, [company.id])

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Add to which proposal?</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <button
            onClick={onCreateNew}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-blue-200 bg-blue-50/40 hover:bg-blue-50 text-left"
          >
            <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center"><Plus size={16} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900">Start a new proposal</div>
              <div className="text-xs text-gray-500">Open the wizard with this product pre-loaded.</div>
            </div>
          </button>

          {loading ? (
            <div className="text-sm text-gray-400 py-4 text-center">Loading…</div>
          ) : proposals.length > 0 ? (
            <>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Or add to an open proposal</div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {proposals.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelect(p)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 text-left"
                  >
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-12">#{p.proposal_number}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{p.name || `Proposal ${p.proposal_number}`}</div>
                      <div className="text-xs text-gray-500">{p.status?.replace(/_/g, ' ')} · {formatDate(p.created_at)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function CatalogueDetail({ item, company, contact, designContext = null, onClose, onAddedToProposal, onStartNewProposal }) {
  const [tiers, setTiers] = useState([])
  const [colours, setColours] = useState([])
  const [customizations, setCustomizations] = useState([])
  const [photos, setPhotos] = useState([])
  const [photoIdx, setPhotoIdx] = useState(0)

  // user choices
  const [qty, setQty] = useState(item.moq_sales || 50)
  const [colour, setColour] = useState(null) // {colour_name, hex_code} or null
  const [sizeBreakdown, setSizeBreakdown] = useState({}) // { S: 10, M: 20, ... }
  const [selectedCustomizationIds, setSelectedCustomizationIds] = useState([]) // [uuid, uuid, ...]
  const [pantoneCode, setPantoneCode] = useState('')
  const [pantoneSelected, setPantoneSelected] = useState(false)
  const [shippingMethod, setShippingMethod] = useState('standard')
  const [customizationNotes, setCustomizationNotes] = useState('')
  const [showProposalPicker, setShowProposalPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Auto-revert PMS selection when quantity drops below MOQ
  useEffect(() => {
    if (pantoneSelected && item.pantone_match_moq && (Object.values(sizeBreakdown).reduce((a, b) => a + (Number(b) || 0), 0) || qty) < item.pantone_match_moq) {
      setPantoneSelected(false)
      setPantoneCode('')
    }
  }, [qty, sizeBreakdown, item.pantone_match_moq, pantoneSelected])

  useEffect(() => {
    (async () => {
      // Load the company_catalogue link for this item so we can look up
      // company-specific pricing tiers (they win over the global ones).
      const { data: ccLink } = await supabase
        .from('company_catalogue')
        .select('id')
        .eq('company_id', company.id)
        .eq('catalogue_item_id', item.id)
        .maybeSingle()

      const [t, c, p, cz, ccpt] = await Promise.all([
        supabase.from('catalogue_pricing_tiers').select('*').eq('catalogue_item_id', item.id).order('qty_from'),
        supabase.from('catalogue_colour_options').select('*').eq('catalogue_item_id', item.id).eq('active', true).order('colour_name'),
        supabase.from('catalogue_photos').select('*').eq('catalogue_item_id', item.id).order('sort_order'),
        supabase.from('catalogue_customizations').select('*').eq('catalogue_item_id', item.id).order('sort_order'),
        ccLink?.id
          ? supabase.from('company_catalogue_pricing_tiers').select('*').eq('company_catalogue_id', ccLink.id).order('qty_from')
          : Promise.resolve({ data: [] }),
      ])

      // Company-specific tiers win wholesale when present, else fall back to
      // the global (non-sample) tiers.
      const customTiers = ccpt?.data ?? []
      const globalTiers = (t.data ?? []).filter((row) => !row.is_sample_tier)
      setTiers(customTiers.length > 0 ? customTiers : globalTiers)
      setColours(c.data ?? [])
      setPhotos(p.data ?? [])
      setCustomizations(cz.data ?? [])
      if ((c.data ?? []).length > 0) setColour((c.data ?? [])[0])
      const defaults = (cz.data ?? []).filter((x) => x.is_default).map((x) => x.id)
      setSelectedCustomizationIds(defaults)
    })()
  }, [item.id, company.id])

  // Photo gallery: design mockup first (for re-orders) → main_photo_url → catalogue_photos
  const allPhotos = useMemo(() => {
    const arr = []
    if (designContext?.design_image) arr.push({ url: designContext.design_image, caption: 'Your approved design' })
    if (item.main_photo_url && item.main_photo_url !== designContext?.design_image) arr.push({ url: item.main_photo_url, caption: 'Blank product' })
    for (const p of photos) arr.push({ url: p.photo_url, caption: p.caption })
    for (const c of colours) {
      if (c.photo_url && !arr.some((x) => x.url === c.photo_url)) {
        arr.push({ url: c.photo_url, caption: c.colour_name })
      }
    }
    return arr
  }, [item.main_photo_url, photos, colours, designContext])

  // Sizes — parse free-text available_sizes
  const sizes = useMemo(() => {
    if (!item.size_variants || !item.available_sizes) return []
    return item.available_sizes.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean)
  }, [item.size_variants, item.available_sizes])

  // Sum of per-size quantities (when size variants are in play)
  const sizeTotal = Object.values(sizeBreakdown).reduce((a, b) => a + (Number(b) || 0), 0)
  const sizeChosen = !sizes.length || sizeTotal > 0
  // Effective order qty: per-size sum when sizes apply, otherwise the standalone qty input
  const effectiveQty = sizes.length ? sizeTotal : qty
  const belowMOQ = item.moq_sales && effectiveQty < item.moq_sales
  const canAdd = effectiveQty > 0 && sizeChosen && (!colours.length || colour)

  // Pricing math — use effective qty
  const unitBasePrice = getTierPrice(tiers, effectiveQty)
  // Sum surcharges across all selected customizations
  const selectedCustomizations = customizations.filter((c) => selectedCustomizationIds.includes(c.id))
  const customizationSurcharge = selectedCustomizations.reduce((s, c) => s + (c.surcharge_cents || 0), 0)
  const unitPrice = unitBasePrice != null ? unitBasePrice + customizationSurcharge : null
  const itemTotal = unitPrice != null ? unitPrice * effectiveQty : null
  const shipCost = shippingCost(item, shippingMethod, effectiveQty)
  const total = itemTotal != null ? itemTotal + (shipCost ?? 0) : null

  // Pantone match needs a minimum order qty — flag if not met
  const pantoneMOQUnmet = item.pantone_match && item.pantone_match_moq && effectiveQty < item.pantone_match_moq
  const pantoneAvailableNow = item.pantone_match && !pantoneMOQUnmet

  // ETA: lead_time_days + production_time_days + shipping extra (rolling from today)
  const eta = (() => {
    const days = itemLeadDays(item, shippingMethod)
    if (!days) return null
    return { days, date: rollingEtaDate(days) }
  })()

  // Strip zero-qty entries before saving size_breakdown
  const cleanSizeBreakdown = () => {
    const cleaned = {}
    for (const [s, n] of Object.entries(sizeBreakdown)) {
      if (Number(n) > 0) cleaned[s] = Number(n)
    }
    return Object.keys(cleaned).length ? cleaned : null
  }

  const insertItem = async (proposalId) => {
    setBusy(true); setError(null)
    const useP = pantoneSelected && pantoneAvailableNow
    const choices = selectedCustomizations.map((c) => ({ id: c.id, name: c.name, surcharge_cents: c.surcharge_cents || 0 }))
    // For re-orders, the description names the design and we link the source.
    const reorderNote = designContext ? `Re-order of pre-approved design: ${designContext.design_title || 'approved design'}` : null
    const combinedNotes = [reorderNote, customizationNotes.trim() || null].filter(Boolean).join('\n') || null
    const { error: err } = await supabase.from('proposal_requested_items').insert({
      proposal_id: proposalId,
      company_id: company.id,
      catalogue_item_id: item.id,
      description: designContext?.design_title || item.name,
      quantity: effectiveQty,
      colour_choice: useP ? null : (colour?.colour_name || null),
      size_breakdown: cleanSizeBreakdown(),
      shipping_method: shippingMethod,
      customization_choices: choices.length ? choices : null,
      customization_id: choices[0]?.id || null,
      customization_name: choices.length ? choices.map((c) => c.name).join(', ') : null,
      customization_surcharge_cents: choices.length ? choices.reduce((s, c) => s + (c.surcharge_cents || 0), 0) : null,
      pantone_code: useP ? (pantoneCode.trim() || null) : null,
      notes: combinedNotes,
      reference_url: designContext?.design_image || null,
      source_design_id: designContext?.design_id || null,
      requested_by_contact_id: contact.id,
    })
    setBusy(false)
    if (err) { setError(err.message); return }
    setShowProposalPicker(false)
    onAddedToProposal?.(proposalId)
    onClose()
  }

  const handleAddClick = () => setShowProposalPicker(true)

  const handleStartNewProposal = () => {
    const useP = pantoneSelected && pantoneAvailableNow
    const choices = selectedCustomizations.map((c) => ({ id: c.id, name: c.name, surcharge_cents: c.surcharge_cents || 0 }))
    onStartNewProposal?.({
      catalogue_item: item,
      quantity: effectiveQty,
      colour_choice: useP ? null : (colour?.colour_name || null),
      size_breakdown: cleanSizeBreakdown(),
      shipping_method: shippingMethod,
      customization_choices: choices,
      pantone_code: useP ? (pantoneCode.trim() || null) : null,
      pantone_selected: useP,
      notes: customizationNotes.trim() || null,
      photo_url: allPhotos[0]?.url || null,
      tiers,
      available_colours: colours,
      available_sizes: sizes,
      available_customizations: customizations,
      // Re-order linkage
      design_context: designContext || null,
      description_override: designContext?.design_title || null,
    })
    setShowProposalPicker(false)
    onClose()
  }

  return (
    <>
    <div className="fixed inset-0 z-50 bg-black/30 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <div className="text-xs text-gray-500 truncate">{designContext ? `Re-order · on ${item.name}` : (item.sku || item.category || 'Product')}</div>
            <h2 className="text-lg font-semibold text-gray-900 truncate">{designContext?.design_title || item.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-6">
          {/* Re-order banner */}
          {designContext && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
                <Check size={16} />
              </div>
              <div className="min-w-0 text-sm">
                <div className="font-semibold text-emerald-900">Re-ordering a pre-approved design</div>
                <div className="text-[12px] text-emerald-700/80 mt-0.5">Same artwork, same volume pricing. Just set your quantity and add it to a proposal — no new design round needed.</div>
              </div>
            </div>
          )}

          {/* Photo gallery */}
          {allPhotos.length > 0 ? (
            <div>
              <div className="aspect-[4/3] bg-gray-50 rounded-xl border border-gray-200 overflow-hidden relative">
                <img src={allPhotos[photoIdx]?.url} alt="" className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none' }} />
                {allPhotos.length > 1 && (
                  <>
                    <button
                      onClick={() => setPhotoIdx((i) => (i - 1 + allPhotos.length) % allPhotos.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow-sm"
                    ><ChevronLeft size={16} /></button>
                    <button
                      onClick={() => setPhotoIdx((i) => (i + 1) % allPhotos.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow-sm"
                    ><ChevronRight size={16} /></button>
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px]">{photoIdx + 1} / {allPhotos.length}</div>
                  </>
                )}
              </div>
              {allPhotos.length > 1 && (
                <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                  {allPhotos.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setPhotoIdx(i)}
                      className={`flex-shrink-0 w-14 h-14 rounded-md overflow-hidden border-2 ${i === photoIdx ? 'border-blue-500' : 'border-transparent'}`}
                    >
                      <img src={p.url} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-[4/3] bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-center">
              <Package size={48} className="text-gray-300" />
            </div>
          )}

          {/* Trait badges */}
          <div className="flex flex-wrap gap-2">
            {item.category && <Badge>{item.category}</Badge>}
            {item.is_sustainable && <Badge tone="green"><Leaf size={10} className="mr-1" />Sustainable</Badge>}
            {item.in_stock && <Badge tone="blue"><Box size={10} className="mr-1" />In stock</Badge>}
            {item.made_in_eu && <Badge tone="purple"><Globe size={10} className="mr-1" />Made in EU</Badge>}
            {item.pantone_match && <Badge tone="purple"><Sparkles size={10} className="mr-1" />Pantone match</Badge>}
            {item.custom_made && <Badge tone="yellow">Custom-made</Badge>}
          </div>

          {/* Hero ETA — always visible */}
          {eta && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
                <Clock size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-emerald-900">
                  Estimated delivery ~{eta.days} days · {formatEtaDate(eta.date)}
                </div>
                <div className="text-[11px] text-emerald-700/80">
                  Sourcing + production + {SHIPPING_LABELS[shippingMethod].label.toLowerCase()} shipping. Confirmed when you accept the quote.
                </div>
              </div>
            </div>
          )}

          {item.description && (
            <div>
              <div className="text-xs text-gray-500 mb-1 font-semibold">About</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{item.description}</div>
            </div>
          )}

          {/* Spec grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <Spec label="Min order" value={item.moq_sales ? `${item.moq_sales} units` : 'No min'} />
            <Spec label="Lead time" value={item.lead_time_days ? `${item.lead_time_days} days` : '—'} />
            <Spec label="Production" value={item.production_time_days ? `${item.production_time_days} days` : '—'} />
            <Spec label="Material" value={item.material} />
            <Spec label="Weight" value={item.weight_grams ? `${item.weight_grams} g` : null} />
            <Spec label="Customization" value={item.customization_options} />
          </div>

          {item.size_chart_url && (
            <a href={item.size_chart_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
              <ImageIcon size={14} />View size chart
            </a>
          )}

          {/* Colour picker + inline Pantone match tile */}
          {(colours.length > 0 || item.pantone_match) && (
            <div>
              <div className="text-xs text-gray-500 mb-2 font-semibold">
                Colour {pantoneSelected
                  ? <span className="text-indigo-700 font-normal">· Pantone match{pantoneCode ? ` · ${pantoneCode}` : ''}</span>
                  : colour && <span className="text-gray-700 font-normal">· {colour.colour_name}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {colours.map((c) => {
                  const active = !pantoneSelected && colour?.id === c.id
                  return (
                    <button
                      key={c.id}
                      onClick={() => { setColour(c); setPantoneSelected(false); setPantoneCode('') }}
                      className={`group relative w-12 h-12 rounded-lg border-2 ${active ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}
                      title={c.colour_name}
                    >
                      <div className="w-full h-full rounded-md" style={{ backgroundColor: c.hex_code || '#e5e7eb' }} />
                      {active && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                          <Check size={10} className="text-white" />
                        </div>
                      )}
                    </button>
                  )
                })}
                {item.pantone_match && (
                  <button
                    disabled={!pantoneAvailableNow}
                    onClick={() => setPantoneSelected(true)}
                    className={`h-12 px-3 rounded-lg border-2 inline-flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      pantoneSelected
                        ? 'border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50 text-indigo-700'
                        : pantoneAvailableNow
                          ? 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-700'
                          : 'border-dashed border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50'
                    }`}
                    title={pantoneAvailableNow ? 'Match a specific PMS code' : `Min ${item.pantone_match_moq} units required (currently ${effectiveQty})`}
                  >
                    <Sparkles size={12} />PMS
                  </button>
                )}
              </div>
              {item.pantone_match && (
                <div className="text-[11px] text-gray-500 mt-1">
                  Pantone (PMS) match {item.pantone_match_moq ? `available from ${item.pantone_match_moq} units` : 'available'}.
                  {!pantoneAvailableNow && item.pantone_match_moq && (
                    <span className="text-amber-600"> Currently {effectiveQty} — add {item.pantone_match_moq - effectiveQty} more to unlock.</span>
                  )}
                </div>
              )}
              {pantoneSelected && pantoneAvailableNow && (
                <input
                  type="text"
                  autoFocus
                  value={pantoneCode}
                  onChange={(e) => setPantoneCode(e.target.value)}
                  placeholder="e.g. PMS 286 C"
                  className="mt-2 w-full max-w-xs px-3 py-1.5 border border-indigo-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              )}
            </div>
          )}

          {/* Size picker — quantity per size */}
          {sizes.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-2 font-semibold flex items-center gap-2">
                <span>Quantity per size</span>
                <span className="text-gray-400 normal-case font-normal">Total: <strong className="text-gray-700">{sizeTotal}</strong></span>
              </div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <label key={s} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] uppercase font-semibold text-gray-500">{s}</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={sizeBreakdown[s] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setSizeBreakdown((prev) => {
                          const next = { ...prev }
                          if (!v || Number(v) <= 0) delete next[s]
                          else next[s] = Number(v)
                          return next
                        })
                      }}
                      className="w-16 px-2 py-1.5 border border-gray-200 rounded-md text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Customization picker (multi-select) */}
          {customizations.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-2 font-semibold flex items-center gap-1.5">
                <Paintbrush size={12} />Customizations <span className="text-gray-400 normal-case font-normal">— pick one or more</span>
                {selectedCustomizations.length > 0 && (
                  <span className="text-gray-700 font-normal">· {selectedCustomizations.map((c) => c.name).join(', ')}</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {customizations.map((cz) => {
                  const active = selectedCustomizationIds.includes(cz.id)
                  return (
                    <button
                      key={cz.id}
                      type="button"
                      onClick={() => setSelectedCustomizationIds((prev) => prev.includes(cz.id) ? prev.filter((x) => x !== cz.id) : [...prev, cz.id])}
                      className={`p-3 rounded-lg border-2 text-left transition-colors ${active ? 'border-blue-500 ring-1 ring-blue-200 bg-white' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-gray-900 flex items-center gap-1">
                            {cz.name}
                            {cz.is_default && <span className="text-[9px] uppercase text-gray-400">Default</span>}
                          </div>
                          {cz.description && <div className="text-xs text-gray-600 mt-0.5 line-clamp-2">{cz.description}</div>}
                        </div>
                        {/* Checkbox indicator */}
                        <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${active ? 'border-blue-500 bg-blue-500' : 'border-gray-300 bg-white'}`}>
                          {active && <Check size={10} className="text-white" />}
                        </div>
                      </div>
                      <div className="text-xs mt-2 font-medium">
                        {cz.surcharge_cents > 0
                          ? <span className="text-amber-700">+{formatCents(cz.surcharge_cents)} / unit</span>
                          : <span className="text-green-700">Included</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quantity (hidden when size_variants is in play — driven by per-size grid above) */}
          {sizes.length === 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-2 font-semibold">Quantity</div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {belowMOQ && (
                  <span className="text-xs text-amber-700 inline-flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-full">
                    Below MOQ ({item.moq_sales}) — sample tier may apply
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Pricing tiers — highlight current */}
          {tiers.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-2 font-semibold">Volume pricing</div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Quantity</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Unit price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.map((t) => {
                      const inTier = effectiveQty >= (t.qty_from ?? 0) && (t.qty_to == null || effectiveQty <= t.qty_to)
                      return (
                        <tr key={t.id} className={`border-t border-gray-100 ${inTier ? 'bg-blue-50' : ''}`}>
                          <td className="px-3 py-2 text-gray-900">
                            {t.qty_from}{t.qty_to ? `–${t.qty_to}` : '+'}
                            {inTier && <span className="ml-2 text-[10px] text-blue-700 font-semibold">CURRENT</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-900 font-medium">{formatCents(t.sales_price_cents)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Shipping picker */}
          <div>
            <div className="text-xs text-gray-500 mb-2 font-semibold">Shipping</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['express', 'standard', 'budget']).map((m) => {
                const meta = SHIPPING_LABELS[m]
                const Icon = meta.icon
                const cost = shippingCost(item, m, effectiveQty)
                const days = shippingExtraDays(item, m)
                const method = shippingMethodCopy(item, m)
                const active = shippingMethod === m
                return (
                  <button
                    key={m}
                    onClick={() => setShippingMethod(m)}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${active ? 'border-blue-500 ring-1 ring-blue-200 bg-white' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={13} className={meta.accent} />
                      <span className={`text-xs font-semibold ${meta.accent}`}>{meta.label}</span>
                      {active && <Check size={12} className="text-blue-600 ml-auto" />}
                    </div>
                    <div className="text-sm font-semibold text-gray-900">
                      {cost != null ? formatCents(cost) : <span className="text-gray-400 text-xs font-normal">Quote</span>}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {days ? `+${days} days` : 'Same lead time'}
                      {method && ` · ${method}`}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Customisation note */}
          <div>
            <div className="text-xs text-gray-500 mb-2 font-semibold">Customisation notes <span className="text-gray-400 font-normal">(optional)</span></div>
            <textarea
              value={customizationNotes}
              onChange={(e) => setCustomizationNotes(e.target.value)}
              rows={2}
              placeholder="Logo placement, special requests, packaging…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Calculator summary */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
            <div className="text-xs font-semibold text-blue-900 uppercase tracking-wide mb-2">Estimate</div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-700">{effectiveQty} × {unitBasePrice != null ? formatCents(unitBasePrice) : 'TBD'}</span>
                <span className="text-gray-900 font-medium">{unitBasePrice != null ? formatCents(unitBasePrice * effectiveQty) : '—'}</span>
              </div>
              {selectedCustomizations.filter((c) => c.surcharge_cents > 0).map((c) => (
                <div key={c.id} className="flex justify-between text-xs">
                  <span className="text-gray-600">{c.name} (+{formatCents(c.surcharge_cents)}/unit)</span>
                  <span className="text-gray-700">+{formatCents(c.surcharge_cents * effectiveQty)}</span>
                </div>
              ))}
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">{SHIPPING_LABELS[shippingMethod].label} shipping</span>
                <span className="text-gray-700">{shipCost != null ? formatCents(shipCost) : 'Quote'}</span>
              </div>
              <div className="border-t border-blue-200 pt-1.5 flex justify-between text-base">
                <span className="font-semibold text-blue-900">Total estimate</span>
                <span className="font-bold text-blue-900">{total != null ? formatCents(total) : 'TBD'}</span>
              </div>
              {eta && (
                <div className="flex items-center gap-1.5 text-xs text-blue-800 pt-1">
                  <Clock size={12} />Ready in ~{eta.days} days · est. {formatEtaDate(eta.date)}
                </div>
              )}
              <div className="text-[10px] text-blue-700/70 pt-1">
                Live tier-based estimate. Final price + design quoted by our team.
              </div>
            </div>
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>}

          {/* CTA */}
          <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-white border-t border-gray-200 flex items-center gap-2">
            <SecondaryButton onClick={onClose}>Close</SecondaryButton>
            <PrimaryButton onClick={handleAddClick} disabled={!canAdd || busy} className="flex-1 justify-center py-3 text-base">
              <Plus size={16} />Add to proposal
              {total != null && <span className="ml-1 font-normal text-blue-100">· {formatCents(total)}</span>}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>

    {showProposalPicker && (
      <ProposalPicker
        company={company}
        contact={contact}
        item={item}
        choices={{ colour, sizeBreakdown, qty: effectiveQty, shippingMethod, customizationNotes }}
        qty={effectiveQty}
        onClose={() => setShowProposalPicker(false)}
        onSelect={(p) => insertItem(p.id)}
        onCreateNew={handleStartNewProposal}
      />
    )}
    </>
  )
}

function Spec({ label, value }) {
  if (!value) return null
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-sm text-gray-900">{value}</div>
    </div>
  )
}
