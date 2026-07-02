import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Package, Check, Search, Sparkles, ArrowRight } from 'lucide-react'
import { PrimaryButton, SecondaryButton, formatCents } from './ui'
import { itemLeadDays } from '../lib/eta'

// Restock hand-off: the customer picked one (or a group of) warehouse items to
// restock. Before we open the proposal wizard we ask "do you want to add other
// items to this restock?" and list everything they've ordered before — their
// company catalogue, plus warehouse stock that has no catalogue match (those
// become price-TBD custom lines). The selection is then converted into wizard
// cart items (with pricing tiers, colours, sizes, customizations) and the
// wizard opens on the Items step so they set quantities and see prices.

function normName(s) {
  return (s || '').trim().toLowerCase()
}

// Match a warehouse inventory row to a catalogue item by product name.
function matchCatalogue(inv, catalogueItems) {
  const n = normName(inv.product_name)
  if (!n) return null
  return (
    catalogueItems.find((c) => normName(c.name) === n) ||
    catalogueItems.find((c) => normName(c.name).includes(n) || n.includes(normName(c.name))) ||
    null
  )
}

function minTierPrice(tiers) {
  const prices = (tiers ?? []).filter((t) => !t.is_sample_tier).map((t) => t.sales_price_cents).filter((n) => n != null)
  return prices.length ? Math.min(...prices) : null
}

export default function RestockModal({ company, inventory, preselectedInvIds, onClose, onStart }) {
  const [catalogueItems, setCatalogueItems] = useState([]) // company catalogue = "ordered before" rows
  const [matchItems, setMatchItems] = useState([])         // global catalogue, used to price warehouse items
  const [tiersByItem, setTiersByItem] = useState({})
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [ccRes, allRes] = await Promise.all([
        // "Items they ordered before" = the company catalogue (the pickable rows)
        supabase.from('company_catalogue').select('catalogue_items(*)').eq('company_id', company.id),
        // Full portal catalogue — lets us price warehouse items that aren't in the
        // company catalogue (match by name → real tiers instead of a TBD custom line)
        supabase.from('catalogue_items').select('*').eq('portal_visible', true).eq('active', true).order('name').limit(200),
      ])
      if (cancelled) return
      const items = (ccRes.data ?? []).map((r) => r.catalogue_items).filter(Boolean)
      const globalItems = allRes.data ?? []
      setCatalogueItems(items)
      setMatchItems(globalItems)

      // Load tiers for anything we might price: company catalogue + global catalogue.
      const allIds = [...new Set([...items.map((i) => i.id), ...globalItems.map((i) => i.id)])]
      if (allIds.length) {
        // Global tiers + company-specific overrides (overrides win per item)
        const [globalRes, ccTiersRes] = await Promise.all([
          supabase.from('catalogue_pricing_tiers').select('*').in('catalogue_item_id', allIds).order('qty_from'),
          supabase.from('company_catalogue').select('id, catalogue_item_id, company_catalogue_pricing_tiers(*)')
            .eq('company_id', company.id).in('catalogue_item_id', allIds),
        ])
        if (cancelled) return
        const byItem = {}
        for (const t of globalRes.data ?? []) {
          if (t.is_sample_tier) continue
          ;(byItem[t.catalogue_item_id] = byItem[t.catalogue_item_id] || []).push(t)
        }
        for (const row of ccTiersRes.data ?? []) {
          const customTiers = row.company_catalogue_pricing_tiers || []
          if (customTiers.length > 0) byItem[row.catalogue_item_id] = customTiers.sort((a, b) => (a.qty_from ?? 0) - (b.qty_from ?? 0))
        }
        setTiersByItem(byItem)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company.id])

  // Build the pickable entries: one per catalogue item, plus one per warehouse
  // product (deduped by name) that has no catalogue match.
  const entries = useMemo(() => {
    const list = []
    const matchedInvIds = new Set()
    const catByItemId = new Map() // catalogue_item_id → entry (so we can merge)

    for (const cat of catalogueItems) {
      const invRows = (inventory ?? []).filter((inv) => matchCatalogue(inv, [cat]))
      invRows.forEach((inv) => matchedInvIds.add(inv.id))
      const entry = {
        key: `cat-${cat.id}`,
        kind: 'catalogue',
        name: cat.name,
        category: cat.category,
        photo: cat.main_photo_url,
        catalogueItem: cat,
        invRows,
        available: invRows.length ? invRows.reduce((s, r) => s + (r.available_qty ?? 0), 0) : null,
      }
      catByItemId.set(cat.id, entry)
      list.push(entry)
    }

    // Warehouse products not in the company catalogue: try the global catalogue so
    // they come in priced. Only fall back to a custom (price-TBD) line if nothing
    // matches anywhere.
    const leftovers = (inventory ?? []).filter((inv) => !matchedInvIds.has(inv.id))
    const byName = {}
    for (const inv of leftovers) {
      const k = normName(inv.product_name) || inv.id
      ;(byName[k] = byName[k] || []).push(inv)
    }
    for (const rows of Object.values(byName)) {
      const avail = rows.reduce((s, r) => s + (r.available_qty ?? 0), 0)
      const gcat = matchCatalogue(rows[0], matchItems)
      if (gcat) {
        const existing = catByItemId.get(gcat.id)
        if (existing) {
          // Same product already listed — merge stock in rather than duplicate.
          existing.invRows = [...existing.invRows, ...rows]
          existing.available = (existing.available ?? 0) + avail
        } else {
          const entry = {
            key: `cat-${gcat.id}`,
            kind: 'catalogue',
            name: gcat.name,
            category: gcat.category,
            photo: gcat.main_photo_url || rows[0].product_photo_url,
            catalogueItem: gcat,
            invRows: rows,
            available: avail,
          }
          catByItemId.set(gcat.id, entry)
          list.push(entry)
        }
      } else {
        list.push({
          key: `inv-${rows[0].id}`,
          kind: 'warehouse',
          name: rows[0].product_name,
          category: 'From your warehouse stock',
          photo: rows[0].product_photo_url,
          invRows: rows,
          available: avail,
        })
      }
    }

    // Surface the items that need restocking first: out of stock, then running
    // low (< 10, matching the warehouse page), then in stock, then products
    // with no warehouse stock at all. Alphabetical within each group.
    const stockRank = (e) => {
      const q = e.available
      if (q === 0) return 0
      if (q != null && q < 10) return 1
      if (q != null) return 2
      return 3
    }
    list.sort((a, b) => stockRank(a) - stockRank(b) || normName(a.name).localeCompare(normName(b.name)))
    return list
  }, [catalogueItems, matchItems, inventory])

  // Preselect the entries covering the clicked warehouse item(s)
  useEffect(() => {
    if (loading) return
    const want = new Set(preselectedInvIds ?? [])
    if (!want.size) return
    setSelected((prev) => {
      const next = new Set(prev)
      for (const e of entries) {
        if (e.invRows.some((r) => want.has(r.id))) next.add(e.key)
      }
      return next
    })
  }, [loading, entries, preselectedInvIds])

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const filtered = search
    ? entries.filter((e) => normName(e.name).includes(normName(search)) || normName(e.category).includes(normName(search)))
    : entries

  const chosen = entries.filter((e) => selected.has(e.key))

  const start = async () => {
    if (!chosen.length) return
    setStarting(true)
    setError(null)
    try {
      const catChosen = chosen.filter((e) => e.kind === 'catalogue')
      const catIds = catChosen.map((e) => e.catalogueItem.id)

      let coloursByItem = {}
      let custByItem = {}
      if (catIds.length) {
        const [csRes, czRes] = await Promise.all([
          supabase.from('catalogue_colour_options').select('id, catalogue_item_id, colour_name, hex_code').in('catalogue_item_id', catIds).eq('active', true).order('colour_name'),
          supabase.from('catalogue_customizations').select('id, catalogue_item_id, name, description, surcharge_cents, is_default, sort_order').in('catalogue_item_id', catIds).order('sort_order'),
        ])
        for (const c of csRes.data ?? []) (coloursByItem[c.catalogue_item_id] = coloursByItem[c.catalogue_item_id] || []).push(c)
        for (const c of czRes.data ?? []) (custByItem[c.catalogue_item_id] = custByItem[c.catalogue_item_id] || []).push(c)
      }

      const items = chosen.map((e) => {
        if (e.kind === 'catalogue') {
          const item = e.catalogueItem
          const colours = coloursByItem[item.id] ?? []
          const customizations = custByItem[item.id] ?? []
          const sizesParsed = item.size_variants && item.available_sizes
            ? item.available_sizes.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean) : []
          return {
            type: 'catalogue',
            catalogue_item_id: item.id,
            description: item.name,
            category: item.category,
            photo_url: item.main_photo_url,
            quantity: item.moq_sales || 50,
            reference_url: null,
            notes: 'Warehouse restock',
            tiers: tiersByItem[item.id] ?? [],
            _leadDays: itemLeadDays(item),
            available_colours: colours,
            available_sizes: sizesParsed,
            available_customizations: customizations,
            pantone_match_available: !!item.pantone_match,
            pantone_match_moq: item.pantone_match_moq || null,
            colour_choice: colours[0]?.colour_name || null,
            size_breakdown: null,
            pantone_code: null,
            customization_choice_ids: customizations.filter((c) => c.is_default).map((c) => c.id),
          }
        }
        // Warehouse-only product → custom line, priced by the team. Still give it
        // a starting quantity so the qty field is never blank in the wizard.
        const skus = e.invRows.map((r) => r.sku).filter(Boolean)
        return {
          type: 'custom',
          description: e.name,
          quantity: 50,
          reference_url: null,
          notes: `Warehouse restock${skus.length ? ` (SKU ${skus.join(', ')})` : ''}`,
          unit_price_cents: null,
          photo_url: e.photo || null,
        }
      })

      const names = chosen.map((e) => e.name)
      onStart(items, {
        name: 'Warehouse restock',
        occasion: 'Other',
        occasion_other: 'Warehouse restock',
        brief_notes: `Restock of warehouse stock: ${names.join(', ')}.`,
        shipment_type: 'warehouse',
      })
    } catch (err) {
      setError(err?.message || 'Something went wrong preparing the restock.')
      setStarting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white sm:rounded-xl shadow-xl h-full sm:h-auto sm:max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Package size={18} className="text-blue-600" />Restock
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Do you want to add other items to this restock?</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading ? (
            <div className="text-sm text-gray-400 py-8 text-center">Loading your products…</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center border border-dashed border-gray-200 rounded-lg">
              No previously ordered products found.
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search your products…"
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                {filtered.map((e) => {
                  const active = selected.has(e.key)
                  const minPrice = e.kind === 'catalogue' ? minTierPrice(tiersByItem[e.catalogueItem.id]) : null
                  return (
                    <button
                      key={e.key}
                      type="button"
                      onClick={() => toggle(e.key)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                        active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ring-1 ring-inset ${
                        active ? 'bg-blue-600 ring-blue-600' : 'bg-white ring-gray-300'
                      }`}>
                        {active && <Check size={12} className="text-white" />}
                      </div>
                      <div className="w-10 h-10 rounded-md bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {e.photo ? (
                          <img src={e.photo} alt="" className="w-full h-full object-cover" onError={(ev) => { ev.target.style.display = 'none' }} />
                        ) : (
                          <Package size={16} className="text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{e.name}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {e.category || 'Product'}
                          {e.available != null && (
                            <span className={e.available === 0 ? 'text-red-600' : e.available < 10 ? 'text-amber-600' : ''}>
                              {' · '}{e.available === 0 ? 'Out of stock' : `${e.available} in stock`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {minPrice != null ? (
                          <div className="text-xs text-gray-500">from {formatCents(minPrice)}</div>
                        ) : (
                          <div className="text-xs text-gray-400 inline-flex items-center gap-1"><Sparkles size={10} />Price TBD</div>
                        )}
                      </div>
                    </button>
                  )
                })}
                {filtered.length === 0 && <div className="text-xs text-gray-400 p-6 text-center">No matches.</div>}
              </div>
              <p className="text-[11px] text-gray-400">
                You can still add brand-new items (outside your previous orders) in the next step.
              </p>
            </>
          )}
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <SecondaryButton onClick={onClose} disabled={starting}>Cancel</SecondaryButton>
          <PrimaryButton onClick={start} disabled={!chosen.length || starting || loading}>
            {starting ? 'Preparing…' : `Start restock proposal${chosen.length ? ` (${chosen.length})` : ''}`}<ArrowRight size={14} />
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
