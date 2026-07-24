import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Check, Plus, RotateCw, Package } from 'lucide-react'
import { PrimaryButton, SecondaryButton, formatCents } from './ui'
import { itemLeadDays } from '../lib/eta'
import ProposalPicker from './ProposalPicker'

function getTierPrice(tiers, qty) {
  if (!tiers?.length || !qty) return null
  for (const t of tiers) {
    if (t.is_sample_tier) continue
    const from = t.qty_from ?? 0
    const to = t.qty_to ?? Infinity
    if (qty >= from && qty <= to) return t.sales_price_cents
  }
  const sorted = tiers.filter((t) => !t.is_sample_tier).sort((a, b) => (a.qty_from ?? 0) - (b.qty_from ?? 0))
  if (sorted.length && qty < (sorted[0].qty_from ?? 0)) return sorted[0].sales_price_cents
  return null
}

// Focused re-order for a My-Catalogue item (custom or catalogue-based): show the
// approved mock-up + price, pick a quantity, add it to a proposal. No configurator.
export default function ReorderModal({ item, company, contact, onClose, onAdded, onStartNewProposal }) {
  const isCustom = !!item._custom
  const baseId = isCustom ? null : item.id
  const title = item._design_title || item.name
  const mockup = item._design_image || item.main_photo_url || null
  const lockedSpec = item._locked_spec || null

  const sizes = useMemo(() => {
    if (isCustom || !item.size_variants || !item.available_sizes) return []
    return item.available_sizes.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean)
  }, [item, isCustom])

  const [tiers, setTiers] = useState([])
  const [qty, setQty] = useState(item.moq_sales || 50)
  const [sizeBreakdown, setSizeBreakdown] = useState(
    lockedSpec?.size_breakdown && typeof lockedSpec.size_breakdown === 'object' ? lockedSpec.size_breakdown : {}
  )
  const [showPicker, setShowPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Load volume pricing for catalogue-based items (company override wins).
  useEffect(() => {
    if (isCustom) return
    let cancelled = false
    ;(async () => {
      const { data: ccLink } = await supabase
        .from('company_catalogue').select('id').eq('company_id', company.id).eq('catalogue_item_id', baseId).maybeSingle()
      const [globalRes, ccRes] = await Promise.all([
        supabase.from('catalogue_pricing_tiers').select('*').eq('catalogue_item_id', baseId).order('qty_from'),
        ccLink?.id
          ? supabase.from('company_catalogue_pricing_tiers').select('*').eq('company_catalogue_id', ccLink.id).order('qty_from')
          : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return
      const custom = ccRes.data ?? []
      const global = (globalRes.data ?? []).filter((t) => !t.is_sample_tier)
      setTiers(custom.length ? custom : global)
    })()
    return () => { cancelled = true }
  }, [baseId, company.id, isCustom])

  const effectiveQty = sizes.length ? Object.values(sizeBreakdown).reduce((a, b) => a + (Number(b) || 0), 0) : qty
  const unitPrice = getTierPrice(tiers, effectiveQty)
  const lineTotal = unitPrice != null ? unitPrice * effectiveQty : null
  const canAdd = effectiveQty > 0

  const cleanSizes = () => {
    const out = {}
    for (const [s, n] of Object.entries(sizeBreakdown)) if (Number(n) > 0) out[s] = Number(n)
    return Object.keys(out).length ? out : null
  }

  const rowForInsert = (proposalId) => ({
    proposal_id: proposalId,
    company_id: company.id,
    catalogue_item_id: baseId,
    description: title,
    quantity: effectiveQty,
    size_breakdown: cleanSizes(),
    colour_choice: lockedSpec?.colour_choice || null,
    customization_choices: lockedSpec?.customization_choices || null,
    pantone_code: lockedSpec?.pantone_code || null,
    reference_url: mockup,
    source_design_id: item._design_id || null,
    notes: `Re-order of approved design: ${title}`,
    requested_by_contact_id: contact.id,
  })

  const addToExisting = async (proposalId) => {
    setBusy(true); setError(null)
    const { error: err } = await supabase.from('proposal_requested_items').insert(rowForInsert(proposalId))
    setBusy(false)
    if (err) { setError(err.message); return }
    setShowPicker(false)
    onAdded?.(proposalId)
    onClose()
  }

  const startNew = () => {
    onStartNewProposal?.({
      type: isCustom ? 'custom' : 'catalogue',
      catalogue_item_id: baseId,
      description: title,
      category: item.category || null,
      photo_url: mockup,
      quantity: effectiveQty,
      reference_url: mockup,
      source_design_id: item._design_id || null,
      notes: `Re-order of approved design: ${title}`,
      tiers: isCustom ? [] : tiers,
      _leadDays: isCustom ? null : itemLeadDays(item),
      colour_choice: lockedSpec?.colour_choice || null,
      size_breakdown: cleanSizes(),
      pantone_code: lockedSpec?.pantone_code || null,
      pantone_selected: !!lockedSpec?.pantone_code,
      // Locked re-order: no option pickers in the wizard cart.
      available_colours: [],
      available_sizes: [],
      available_customizations: [],
      customization_choice_ids: (lockedSpec?.customization_choices || []).map((c) => c.id).filter(Boolean),
    })
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide inline-flex items-center gap-1"><RotateCw size={11} />Re-order</div>
              <h2 className="text-base font-semibold text-gray-900 truncate">{title}</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>

          <div className="p-5 space-y-4">
            {/* Approved mock-up */}
            <div className="aspect-[4/3] bg-gray-50 rounded-xl border border-gray-200 overflow-hidden flex items-center justify-center">
              {mockup ? (
                <img src={mockup} alt="" className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none' }} />
              ) : (
                <Package size={40} className="text-gray-300" />
              )}
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-[12px] text-emerald-800">
              <Check size={14} className="flex-shrink-0" />Approved design — same artwork &amp; finish. Just set your quantity.
            </div>

            {/* Quantity */}
            {sizes.length > 0 ? (
              <div>
                <div className="text-xs text-gray-500 mb-2 font-semibold flex items-center gap-2">
                  <span>Quantity per size</span>
                  <span className="text-gray-400 normal-case font-normal">Total: <strong className="text-gray-700">{effectiveQty}</strong></span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((s) => (
                    <label key={s} className="flex flex-col items-center gap-1">
                      <span className="text-[10px] uppercase font-semibold text-gray-500">{s}</span>
                      <input
                        type="number" min="0" placeholder="0"
                        value={sizeBreakdown[s] ?? ''}
                        onChange={(e) => setSizeBreakdown((prev) => {
                          const next = { ...prev }
                          const v = e.target.value
                          if (!v || Number(v) <= 0) delete next[s]; else next[s] = Number(v)
                          return next
                        })}
                        className="w-16 px-2 py-1.5 border border-gray-200 rounded-md text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-xs text-gray-500 mb-2 font-semibold">Quantity</div>
                <input
                  type="number" min="1" value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Price */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{effectiveQty} × {unitPrice != null ? formatCents(unitPrice) : <span className="text-gray-400">TBD</span>}</span>
                <span className="font-semibold text-blue-900">{lineTotal != null ? formatCents(lineTotal) : 'Quoted by our team'}</span>
              </div>
              {tiers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tiers.filter((t) => !t.is_sample_tier).map((t) => {
                    const inTier = effectiveQty >= (t.qty_from ?? 0) && (t.qty_to == null || effectiveQty <= t.qty_to)
                    return (
                      <span key={t.id} className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ring-inset ${inTier ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-500 ring-gray-200'}`}>
                        {t.qty_from}{t.qty_to ? `–${t.qty_to}` : '+'}: {formatCents(t.sales_price_cents)}
                      </span>
                    )
                  })}
                </div>
              )}
              <div className="text-[10px] text-blue-700/70 mt-1.5">Live estimate — final price confirmed on your quote.</div>
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
          </div>

          <div className="px-5 py-4 border-t border-gray-200 flex items-center gap-2">
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton onClick={() => setShowPicker(true)} disabled={!canAdd || busy} className="flex-1 justify-center">
              <Plus size={16} />Add to proposal{lineTotal != null && <span className="ml-1 font-normal text-blue-100">· {formatCents(lineTotal)}</span>}
            </PrimaryButton>
          </div>
        </div>
      </div>

      {showPicker && (
        <ProposalPicker
          company={company}
          onClose={() => setShowPicker(false)}
          onSelect={(p) => addToExisting(p.id)}
          onCreateNew={startNew}
        />
      )}
    </>
  )
}
