import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Package, Check, Search, Sparkles, ArrowRight } from 'lucide-react'
import { PrimaryButton, SecondaryButton, formatCents } from './ui'
import { itemLeadDays } from '../lib/eta'
import { LOW_STOCK_THRESHOLD } from '../lib/stock'

// Restock hand-off: the customer picked one (or a group of) warehouse items to
// restock. Before we open the proposal wizard we ask "do you want to add other
// items to this restock?" and list everything they've ordered before. The
// selection is then converted into wizard cart items (with pricing tiers,
// colours, sizes, customizations) and the wizard opens on the Items step.
//
// Everything is driven by the customer's OWN catalogue (company_catalogue),
// which holds both catalogue-linked products and custom entries the team added
// straight from warehouse stock — each with its own volume pricing. Warehouse
// rows point at their entry through warehouse_inventory.company_catalogue_id.
// We deliberately do NOT guess that link from the product name: warehouse stock
// is the customer's own produced goods ("Zenchef Totebag"), whose names almost
// never equal a generic catalogue name, and guessing risks pricing one product
// off another. Unlinked stock still restocks fine — it just comes through as
// price-TBD for the team to quote.

function normName(s) {
  return (s || '').trim().toLowerCase()
}

function minTierPrice(tiers) {
  const prices = (tiers ?? []).filter((t) => !t.is_sample_tier).map((t) => t.sales_price_cents).filter((n) => n != null)
  return prices.length ? Math.min(...prices) : null
}

export default function RestockModal({ company, inventory, preselectedInvIds, onClose, onStart }) {
  const [ccEntries, setCcEntries] = useState([]) // the customer's own catalogue ("ordered before")
  const [tiersByCc, setTiersByCc] = useState({}) // company_catalogue.id → volume tiers
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      // The customer's own catalogue: catalogue-linked entries and custom ones
      // (warehouse products the team added), each with its company pricing.
      const { data: ccRows } = await supabase
        .from('company_catalogue')
        .select('id, catalogue_item_id, custom_name, custom_photo_url, catalogue_items(*), company_catalogue_pricing_tiers(*)')
        .eq('company_id', company.id)
      if (cancelled) return
      const rows = ccRows ?? []
      setCcEntries(rows)

      // Fall back to the global catalogue price only where the team hasn't set a
      // company-specific one.
      const needGlobal = [...new Set(rows
        .filter((r) => r.catalogue_item_id && !(r.company_catalogue_pricing_tiers?.length))
        .map((r) => r.catalogue_item_id))]
      const globalByItem = {}
      if (needGlobal.length) {
        const { data: gt } = await supabase.from('catalogue_pricing_tiers')
          .select('*').in('catalogue_item_id', needGlobal).order('qty_from')
        if (cancelled) return
        for (const t of gt ?? []) {
          if (t.is_sample_tier) continue
          ;(globalByItem[t.catalogue_item_id] = globalByItem[t.catalogue_item_id] || []).push(t)
        }
      }
      const byCc = {}
      for (const r of rows) {
        const own = (r.company_catalogue_pricing_tiers || [])
          .filter((t) => !t.is_sample_tier)
          .sort((a, b) => (a.qty_from ?? 0) - (b.qty_from ?? 0))
        byCc[r.id] = own.length ? own : (globalByItem[r.catalogue_item_id] ?? [])
      }
      setTiersByCc(byCc)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company.id])

  // Build the pickable entries: one per catalogue entry (priced), plus one per
  // warehouse product the team hasn't catalogued yet (price TBD).
  const entries = useMemo(() => {
    const list = []
    const claimed = new Set()

    for (const cc of ccEntries) {
      const cat = cc.catalogue_items || null
      const name = cat?.name || cc.custom_name || 'Item'
      const invRows = (inventory ?? []).filter((inv) => (
        inv.company_catalogue_id
          ? inv.company_catalogue_id === cc.id
          // Stock the team hasn't linked yet: exact name only, never fuzzy — a
          // near-match would price one product off another.
          : normName(inv.product_name) === normName(name)
      ))
      invRows.forEach((inv) => claimed.add(inv.id))
      list.push({
        key: `cc-${cc.id}`,
        kind: 'priced',
        name,
        category: cat?.category || 'From your warehouse',
        photo: cat?.main_photo_url || cc.custom_photo_url || invRows[0]?.product_photo_url || null,
        catalogueItem: cat,
        tiers: tiersByCc[cc.id] ?? [],
        invRows,
        available: invRows.length ? invRows.reduce((s, r) => s + (r.available_qty ?? 0), 0) : null,
      })
    }

    // Warehouse stock that isn't in their catalogue yet → the team prices it.
    const leftovers = (inventory ?? []).filter((inv) => !claimed.has(inv.id))
    const byName = {}
    for (const inv of leftovers) {
      const k = normName(inv.product_name) || inv.id
      ;(byName[k] = byName[k] || []).push(inv)
    }
    for (const rows of Object.values(byName)) {
      list.push({
        key: `inv-${rows[0].id}`,
        kind: 'warehouse',
        name: rows[0].product_name,
        category: 'From your warehouse stock',
        photo: rows[0].product_photo_url,
        catalogueItem: null,
        tiers: [],
        invRows: rows,
        available: rows.reduce((s, r) => s + (r.available_qty ?? 0), 0),
      })
    }

    // Surface the items that need restocking first: out of stock, then running
    // low (matching the warehouse page threshold), then in stock, then products
    // with no warehouse stock at all. Alphabetical within each group.
    const stockRank = (e) => {
      const q = e.available
      if (q === 0) return 0
      if (q != null && q < LOW_STOCK_THRESHOLD) return 1
      if (q != null) return 2
      return 3
    }
    list.sort((a, b) => stockRank(a) - stockRank(b) || normName(a.name).localeCompare(normName(b.name)))
    return list
  }, [ccEntries, tiersByCc, inventory])

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
      const catChosen = chosen.filter((e) => e.catalogueItem)
      const catIds = catChosen.map((e) => e.catalogueItem.id)

      let coloursByItem = {}
      let custByItem = {}
      if (catIds.length) {
        const [csRes, czRes] = await Promise.all([
          supabase.from('catalogue_colour_options').select('id, catalogue_item_id, colour_name, hex_code').in('catalogue_item_id', catIds).eq('active', true).order('colour_name'),
          supabase.from('catalogue_customizations').select('id, catalogue_item_id, name, description, surcharge_cents, setup_fee_cents, is_default, sort_order').in('catalogue_item_id', catIds).order('sort_order'),
        ])
        for (const c of csRes.data ?? []) (coloursByItem[c.catalogue_item_id] = coloursByItem[c.catalogue_item_id] || []).push(c)
        for (const c of czRes.data ?? []) (custByItem[c.catalogue_item_id] = custByItem[c.catalogue_item_id] || []).push(c)
      }

      const items = chosen.map((e) => {
        if (e.catalogueItem) {
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
            tiers: e.tiers ?? [],
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
        // A warehouse product with no catalogue item of its own. If the team has
        // priced it in the customer's catalogue we pass those tiers along, so it
        // shows a real price instead of TBD; otherwise the team quotes it.
        const skus = e.invRows.map((r) => r.sku).filter(Boolean)
        const tiers = e.tiers ?? []
        return {
          type: 'custom',
          description: e.name,
          category: e.category,
          quantity: tiers[0]?.qty_from || 50,
          reference_url: null,
          notes: `Warehouse restock${skus.length ? ` (SKU ${skus.join(', ')})` : ''}`,
          tiers,
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
    <div translate="no" className="notranslate fixed inset-0 z-50 bg-black/40 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
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
                  const minPrice = minTierPrice(e.tiers)
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
                            <span className={e.available === 0 ? 'text-red-600' : e.available < LOW_STOCK_THRESHOLD ? 'text-amber-600' : ''}>
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
