import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  X, ChevronLeft, ChevronRight, Check, Package, MapPin, Plus, Truck,
  Calendar as CalendarIcon, Zap, Search, Trash2, AlertCircle, Mail, Phone, User, Pencil,
  Leaf, Wallet, Clock,
} from 'lucide-react'
import { PrimaryButton, SecondaryButton, formatDate } from './ui'
import AddressEditor from './AddressEditor'
import { calcShipment, normalizeCountry, guessProductDims, VAT_RATE } from '../lib/shippingCalc'

const STEPS = [
  { id: 'items', label: 'Items' },
  { id: 'addresses', label: 'Addresses' },
  { id: 'shipping', label: 'Shipping & price' },
  { id: 'review', label: 'Review' },
]

const formatEur = (cents) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100)

// --- Item picker ---
function ItemPicker({ company, onAdd, selectedByInventoryId }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('warehouse_inventory_client')
        .select('id, product_name, sku, variant, product_photo_url, available_qty, on_hand_qty, warehouse_location, unit_weight_grams, unit_volume_ml')
        .eq('company_id', company.id)
        .eq('portal_orderable', true)
        .gt('available_qty', 0)
        .order('product_name')
      if (!cancelled) {
        setItems(data ?? [])
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [company.id])

  const filtered = search
    ? items.filter((i) => i.product_name?.toLowerCase().includes(search.toLowerCase()) || i.sku?.toLowerCase().includes(search.toLowerCase()))
    : items

  if (loading) return <div className="text-sm text-gray-400 py-6 text-center">Loading stock…</div>
  if (items.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-lg">
        Nothing is orderable from stock right now.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search stock…"
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="max-h-80 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-1">
        {filtered.slice(0, 50).map((item) => {
          const picked = selectedByInventoryId.has(item.id)
          const remaining = item.available_qty - (selectedByInventoryId.get(item.id) || 0)
          return (
            <button
              key={item.id}
              onClick={() => onAdd(item)}
              disabled={remaining <= 0}
              className={`w-full flex items-center gap-3 p-2 rounded-md text-left ${
                picked ? 'bg-blue-50' : 'hover:bg-gray-50'
              } ${remaining <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="w-12 h-12 rounded-md bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                {item.product_photo_url ? (
                  <img src={item.product_photo_url} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                ) : (
                  <Package size={18} className="text-gray-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{item.product_name}</div>
                <div className="text-xs text-gray-500 truncate">{item.variant || item.sku || '—'}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Available</div>
                <div className="text-sm font-semibold text-gray-900">{remaining}</div>
              </div>
              <div className={`text-xs font-medium ${picked ? 'text-blue-600' : 'text-blue-500'}`}>
                {picked ? <Check size={14} /> : <Plus size={14} />}
              </div>
            </button>
          )
        })}
        {filtered.length === 0 && <div className="text-xs text-gray-400 p-6 text-center">No matches.</div>}
      </div>
    </div>
  )
}

// --- Address picker ---
function AddressPicker({ company, selectedIds, onChange }) {
  const [addresses, setAddresses] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null) // address id being edited, or 'new'

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('addresses').select('*').eq('company_id', company.id).order('is_default_delivery', { ascending: false })
    setAddresses(data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [company.id])

  const toggle = (id) => onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])

  const handleSaved = (saved) => {
    setAddresses((arr) => {
      const exists = arr.find((a) => a.id === saved.id)
      return exists ? arr.map((a) => a.id === saved.id ? saved : a) : [saved, ...arr]
    })
    if (editingId === 'new') toggle(saved.id) // auto-select the newly added
    setEditingId(null)
  }

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="text-sm text-gray-400 py-4 text-center">Loading addresses…</div>
      ) : addresses.length === 0 && editingId !== 'new' ? (
        <div className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">
          No addresses yet. Add one below.
        </div>
      ) : (
        <div className="space-y-2">
          {addresses.map((a) => {
            if (editingId === a.id) {
              return (
                <AddressEditor
                  key={a.id}
                  company={company}
                  address={a}
                  mode="shipment"
                  title="Complete recipient contact"
                  onSaved={handleSaved}
                  onCancel={() => setEditingId(null)}
                />
              )
            }
            const active = selectedIds.includes(a.id)
            const hasContactName = !!a.contact_name?.trim()
            // Shipments need all three so the carrier can call AND email the recipient.
            const hasFullContact = hasContactName && !!a.contact_phone?.trim() && !!a.contact_email?.trim()
            return (
              <div
                key={a.id}
                className={`rounded-lg border transition-colors ${
                  active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <button
                  onClick={() => toggle(a.id)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left"
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ring-1 ring-inset ${active ? 'bg-blue-600 ring-blue-600' : 'bg-white ring-gray-300'}`}>
                    {active && <Check size={12} className="text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-sm font-medium text-gray-900 truncate">{a.label || `${a.street} ${a.house_number || ''}`}</div>
                      {a.is_default_delivery && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Default</span>}
                      {!hasFullContact && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 inline-flex items-center gap-1"><AlertCircle size={10} />Needs name, phone &amp; email</span>}
                    </div>
                    <div className="text-xs text-gray-500">
                      {[a.street, a.house_number].filter(Boolean).join(' ')}{a.postal_code || a.city ? ', ' : ''}{[a.postal_code, a.city].filter(Boolean).join(' ')}{a.country ? `, ${a.country}` : ''}
                    </div>
                    {a.contact_name && (
                      <div className="text-[11px] text-gray-600 mt-1 flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1"><User size={10} />{a.contact_name}</span>
                        {a.contact_phone && <span className="inline-flex items-center gap-1"><Phone size={10} />{a.contact_phone}</span>}
                        {a.contact_email && <span className="inline-flex items-center gap-1"><Mail size={10} />{a.contact_email}</span>}
                      </div>
                    )}
                  </div>
                </button>
                {(active || !hasFullContact) && (
                  <div className="px-4 pb-3 -mt-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingId(a.id) }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      <Pencil size={11} />
                      {hasFullContact ? 'Edit contact details' : 'Add recipient name / phone / email'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editingId === 'new' ? (
        <AddressEditor
          company={company}
          mode="shipment"
          title="New address"
          onSaved={handleSaved}
          onCancel={() => setEditingId(null)}
        />
      ) : (
        <button
          onClick={() => setEditingId('new')}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <Plus size={14} />Add new address
        </button>
      )}
    </div>
  )
}

// --- MAIN WIZARD ---
export default function RequestShipmentWizard({ company, contact, onClose, onCreated }) {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([]) // [{ inventory_id, qty, max, product_name, product_photo_url, sku }]
  const [addressIds, setAddressIds] = useState([])
  const [addresses, setAddresses] = useState([])
  const [shipAsap, setShipAsap] = useState(true)
  const [shipDate, setShipDate] = useState('')
  const [notes, setNotes] = useState('')
  // Per-inventory-item dim overrides for items missing stored weight/volume.
  // { [inventory_id]: { weightG, volumeMl } } — strings as typed.
  const [dimsOverride, setDimsOverride] = useState({})
  // Customer's chosen shipping option per address: { [address_id]: option_id }
  const [chosenOptionByAddress, setChosenOptionByAddress] = useState({})
  // Show prices incl. VAT to the customer by default (most relevant for them)
  const [vatInclusive, setVatInclusive] = useState(true)

  useEffect(() => {
    if (addressIds.length === 0) { setAddresses([]); return }
    supabase.from('addresses').select('*').in('id', addressIds).then(({ data }) => setAddresses(data ?? []))
  }, [addressIds.join(',')])

  const selectedByInventoryId = useMemo(() => {
    const m = new Map()
    for (const it of items) m.set(it.inventory_id, it.qty)
    return m
  }, [items])

  const addItem = (invItem) => {
    setItems((arr) => {
      const existing = arr.find((x) => x.inventory_id === invItem.id)
      if (existing) {
        if (existing.qty < existing.max) {
          return arr.map((x) => x.inventory_id === invItem.id ? { ...x, qty: x.qty + 1 } : x)
        }
        return arr
      }
      return [...arr, {
        inventory_id: invItem.id,
        qty: 1,
        max: invItem.available_qty,
        product_name: invItem.product_name,
        product_photo_url: invItem.product_photo_url,
        sku: invItem.sku,
        variant: invItem.variant,
        unit_weight_grams: invItem.unit_weight_grams,
        unit_volume_ml: invItem.unit_volume_ml,
      }]
    })
  }

  const updateItemQty = (idx, qty) => {
    setItems((arr) => arr.map((x, i) => i === idx ? { ...x, qty: Math.max(1, Math.min(x.max, qty)) } : x))
  }
  const removeItem = (idx) => setItems((arr) => arr.filter((_, i) => i !== idx))

  const canAdvance = () => {
    if (step === 0) return items.length > 0
    if (step === 1) {
      if (addressIds.length === 0) return false
      // Every selected destination needs name + phone + email so the carrier
      // can call AND email the recipient when the parcel is on the way.
      return addresses.length === addressIds.length && addresses.every((a) =>
        !!a.contact_name?.trim() && !!a.contact_phone?.trim() && !!a.contact_email?.trim()
      )
    }
    if (step === 2) return allAddressesPriced && unknownDimsCount === 0 && (shipAsap || !!shipDate)
    return true
  }

  const totalUnitsRequested = items.reduce((s, i) => s + i.qty, 0) * Math.max(1, addressIds.length)

  // ── Shipping calculator wiring ────────────────────────────────────────────
  // Resolve per-item weight/volume in priority order: manual override → stored
  // value → estimate from product name.
  const calcItems = useMemo(() => {
    return items.map((it) => {
      const ov = dimsOverride[it.inventory_id] || {}
      const ovG = ov.weightG !== '' && ov.weightG != null && Number.isFinite(parseFloat(ov.weightG)) ? parseFloat(ov.weightG) : null
      const ovMl = ov.volumeMl !== '' && ov.volumeMl != null && Number.isFinite(parseFloat(ov.volumeMl)) ? parseFloat(ov.volumeMl) : null
      const guess = guessProductDims(it.product_name)
      let grams, source
      if (ovG != null) { grams = ovG; source = 'override' }
      else if (it.unit_weight_grams != null) { grams = it.unit_weight_grams; source = 'stored' }
      else if (guess) { grams = guess.grams; source = 'estimated' }
      else { grams = null; source = 'unknown' }
      let ml
      if (ovMl != null) ml = ovMl
      else if (it.unit_volume_ml != null) ml = it.unit_volume_ml
      else if (guess) ml = guess.ml
      else ml = null
      return { ...it, grams, ml, source, guessLabel: guess?.label || null }
    })
  }, [items, dimsOverride])

  const unknownDimsCount = calcItems.filter((x) => x.grams == null).length

  // Per-address calculator result + default chosen option
  const perAddress = useMemo(() => {
    return addresses.map((addr) => {
      const country = normalizeCountry(addr.country)
      const calcInput = calcItems
        .filter((x) => x.grams != null)
        .map((x) => ({ weightKg: x.grams / 1000, volumeL: (x.ml ?? 500) / 1000, quantity: x.qty }))
      const result = calcShipment({ items: calcInput, country })
      return { addr, country, ...result }
    })
  }, [addresses, calcItems])

  // Auto-pick the cheapest option for each address when the picker first loads.
  useEffect(() => {
    setChosenOptionByAddress((prev) => {
      const next = { ...prev }
      let dirty = false
      for (const p of perAddress) {
        if (p.options.length > 0 && !next[p.addr.id]) {
          const cheapest = [...p.options].sort((a, b) => a.total - b.total)[0]
          next[p.addr.id] = cheapest.id
          dirty = true
        }
      }
      return dirty ? next : prev
    })
  }, [perAddress.map((p) => p.addr.id + ':' + p.options.length).join('|')])

  // Total across addresses based on picked options (excl + incl VAT)
  const grandTotalCents = useMemo(() => {
    let exVat = 0
    for (const p of perAddress) {
      const optId = chosenOptionByAddress[p.addr.id]
      const opt = p.options.find((o) => o.id === optId)
      if (opt) exVat += Math.round(opt.total * 100)
    }
    return { exVat, inclVat: Math.round(exVat * (1 + VAT_RATE)) }
  }, [perAddress, chosenOptionByAddress])

  const allAddressesPriced = perAddress.length > 0 && perAddress.every((p) => {
    const optId = chosenOptionByAddress[p.addr.id]
    return p.options.length > 0 && optId && p.options.find((o) => o.id === optId)
  })

  const submit = async () => {
    setSubmitting(true); setError(null)
    const quotedAt = new Date().toISOString()
    const requests = []
    for (const p of perAddress) {
      const addr = p.addr
      const optId = chosenOptionByAddress[addr.id]
      const opt = p.options.find((o) => o.id === optId)
      const priceCents = opt ? Math.round((vatInclusive ? opt.totalInclVat : opt.total) * 100) : null
      const { data: req, error: err } = await supabase.from('warehouse_requests').insert({
        company_id: company.id,
        requested_by_contact_id: contact.id,
        request_type: 'shipment',
        status: 'pending',
        ship_to_name: addr.label || addr.contact_name,
        ship_to_address: [addr.street, addr.house_number].filter(Boolean).join(' '),
        ship_to_city: addr.city,
        ship_to_postcode: addr.postal_code,
        ship_to_country: addr.country,
        ship_to_contact_name: addr.contact_name,
        ship_to_contact_phone: addr.contact_phone,
        ship_to_contact_email: addr.contact_email,
        requested_date: shipAsap ? null : shipDate || null,
        ship_asap: shipAsap,
        shipping_speed: opt?.id || null,
        notes: notes.trim() || null,
        // Locked-in shipping quote from the calculator
        quoted_price_cents: priceCents,
        quoted_price_includes_vat: !!vatInclusive,
        quoted_carrier_name: opt?.carrier || null,
        quoted_service_id: opt?.id || null,
        quoted_service_label: opt?.sub || null,
        quoted_speed: opt?.speed || null,
        quoted_box_count: opt?.boxes || null,
        quoted_total_weight_kg: p.totalWeightKg || null,
        quoted_at: opt ? quotedAt : null,
      }).select('id').single()
      if (err) { setSubmitting(false); setError(err.message); return }
      requests.push(req.id)

      const rows = items.map((i) => ({ request_id: req.id, inventory_id: i.inventory_id, qty: i.qty }))
      const { error: itemsErr } = await supabase.from('warehouse_request_items').insert(rows)
      if (itemsErr) { setSubmitting(false); setError(itemsErr.message); return }
    }

    // Persist resolved weight/volume back to the inventory rows so future
    // shipments auto-calculate (best-effort, never blocks).
    const persisted = new Set()
    for (const ci of calcItems) {
      if (persisted.has(ci.inventory_id)) continue
      if (ci.source !== 'override' && ci.source !== 'estimated') continue
      const patch = {}
      if (ci.grams != null) patch.unit_weight_grams = Math.round(ci.grams)
      if (ci.ml != null) patch.unit_volume_ml = Math.round(ci.ml)
      if (Object.keys(patch).length) {
        persisted.add(ci.inventory_id)
        try { await supabase.from('warehouse_inventory').update(patch).eq('id', ci.inventory_id) } catch { /* non-fatal */ }
      }
    }

    setSubmitting(false)
    onCreated?.(requests)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white sm:rounded-xl shadow-xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck size={18} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Request a shipment</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 flex-1">
                <div className={`flex items-center gap-2 ${i === step ? 'text-blue-600' : i < step ? 'text-gray-900' : 'text-gray-400'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                    i < step ? 'bg-blue-600 text-white' : i === step ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {i < step ? <Check size={12} /> : i + 1}
                  </div>
                  <span className="text-xs font-medium">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-px ${i < step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === 0 && (
            <div className="space-y-4">
              <ItemPicker company={company} onAdd={addItem} selectedByInventoryId={selectedByInventoryId} />
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-2">
                  In your cart {items.length > 0 && `· ${items.length}`}
                </div>
                {items.length === 0 ? (
                  <div className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">
                    Pick items from your stock above.
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Item</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 w-24">Qty</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 w-20">Max</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it, idx) => (
                          <tr key={it.inventory_id} className="border-t border-gray-100">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {it.product_photo_url ? (
                                  <img src={it.product_photo_url} alt="" className="w-8 h-8 rounded object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                                ) : (
                                  <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center"><Package size={14} className="text-gray-400" /></div>
                                )}
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate">{it.product_name}</div>
                                  <div className="text-xs text-gray-500">{it.variant || it.sku || '—'}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="1"
                                max={it.max}
                                value={it.qty}
                                onChange={(e) => updateItemQty(idx, Number(e.target.value) || 1)}
                                className="w-20 px-2 py-1 border border-gray-200 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-gray-500">{it.max}</td>
                            <td className="px-2 py-2">
                              <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-600">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Pick one or more destinations. Each needs a recipient we can contact if the carrier has questions.</p>
              <AddressPicker company={company} selectedIds={addressIds} onChange={setAddressIds} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              {/* Unknown weights gate */}
              {unknownDimsCount > 0 && (
                <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2 text-amber-900">
                    <AlertCircle size={14} />
                    <div className="text-sm font-semibold">We need a weight for {unknownDimsCount} item{unknownDimsCount === 1 ? '' : 's'}</div>
                  </div>
                  <p className="text-xs text-amber-800">Without it we can't calculate an accurate shipping price. Just type an approximate weight in grams — we'll remember it next time.</p>
                  <div className="space-y-2">
                    {calcItems.filter((x) => x.grams == null).map((it) => (
                      <div key={it.inventory_id} className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg p-2">
                        <div className="text-xs flex-1 min-w-0">
                          <div className="font-medium text-gray-900 truncate">{it.product_name}{it.variant ? ` · ${it.variant}` : ''}</div>
                          <div className="text-[10px] text-gray-500">× {it.qty}</div>
                        </div>
                        <input
                          type="number"
                          min="1"
                          placeholder="g per unit"
                          value={dimsOverride[it.inventory_id]?.weightG ?? ''}
                          onChange={(e) => setDimsOverride((prev) => ({
                            ...prev,
                            [it.inventory_id]: { ...(prev[it.inventory_id] || {}), weightG: e.target.value },
                          }))}
                          className="w-24 px-2 py-1.5 border border-gray-200 rounded text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Calculator results per address */}
              {unknownDimsCount === 0 && perAddress.map((p) => (
                <div key={p.addr.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5">
                        <MapPin size={13} className="text-gray-400" />{p.addr.label || `${p.addr.street} ${p.addr.house_number || ''}`}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        {[p.addr.city, p.country || p.addr.country].filter(Boolean).join(' · ')} · {p.boxes || 0} box{p.boxes === 1 ? '' : 'es'} · {p.totalWeightKg?.toFixed(1) || 0} kg
                      </div>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {p.options.length === 0 ? (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 inline-flex items-center gap-1.5">
                        <AlertCircle size={12} />No carrier available for <strong>{p.country || p.addr.country || 'this country'}</strong>. Pick a different destination or contact your account manager.
                      </div>
                    ) : (
                      p.options.map((opt) => {
                        const active = chosenOptionByAddress[p.addr.id] === opt.id
                        const Icon = opt.id === 'express' ? Zap : opt.id === 'hive' ? Leaf : Truck
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setChosenOptionByAddress((prev) => ({ ...prev, [p.addr.id]: opt.id }))}
                            className={`w-full text-left p-3 border-2 rounded-lg transition-colors ${active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                          >
                            <div className="flex items-start gap-3">
                              <Icon size={16} className={active ? 'text-blue-600' : 'text-gray-400'} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-gray-900">{opt.carrier}</span>
                                  {opt.tag === 'cheapest' && <span className="text-[10px] uppercase font-bold tracking-wide bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Cheapest</span>}
                                  {opt.tag === 'fastest' && <span className="text-[10px] uppercase font-bold tracking-wide bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Fastest</span>}
                                </div>
                                <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex items-center gap-1"><Clock size={10} />{opt.speed}</span>
                                  <span>·</span>
                                  <span>{opt.boxes} box{opt.boxes === 1 ? '' : 'es'}</span>
                                </div>
                                <div className="text-[10px] text-gray-400 mt-0.5">{opt.sub}</div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="text-sm font-bold text-gray-900">
                                  {formatEur(Math.round((vatInclusive ? opt.totalInclVat : opt.total) * 100))}
                                </div>
                                <div className="text-[10px] text-gray-500">{vatInclusive ? 'incl. VAT' : 'excl. VAT'}</div>
                              </div>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              ))}

              {/* Grand total + VAT toggle */}
              {allAddressesPriced && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-blue-900 uppercase tracking-wide">Total shipping cost</div>
                      <div className="text-[11px] text-blue-700/80 mt-0.5">{addresses.length} address{addresses.length === 1 ? '' : 'es'} · {totalUnitsRequested} units</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-900">{formatEur(vatInclusive ? grandTotalCents.inclVat : grandTotalCents.exVat)}</div>
                      <button
                        type="button"
                        onClick={() => setVatInclusive((v) => !v)}
                        className="text-[10px] text-blue-700 hover:text-blue-900 underline mt-0.5"
                      >
                        {vatInclusive ? 'incl. VAT — switch to excl.' : 'excl. VAT — switch to incl.'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Date picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <CalendarIcon size={14} />When should we ship out?
                </label>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => { setShipAsap(true); setShipDate('') }}
                    className={`w-full px-4 py-3 border rounded-lg text-left transition-colors ${shipAsap ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Zap size={14} className="text-blue-600" />
                      <span className="text-sm font-medium text-gray-900">Ship ASAP</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">We'll ship out as soon as we can process the request.</div>
                  </button>
                  <div className={`w-full px-4 py-3 border rounded-lg transition-colors ${!shipAsap ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={!shipAsap} onChange={() => setShipAsap(false)} className="accent-blue-600" />
                      <span className="text-sm font-medium text-gray-900">Specific ship-out date</span>
                    </label>
                    <div className="text-xs text-gray-500 mb-2">Day we'll send the package out (not the delivery date).</div>
                    <input
                      type="date"
                      value={shipDate}
                      onChange={(e) => { setShipDate(e.target.value); setShipAsap(false) }}
                      min={new Date().toISOString().split('T')[0]}
                      disabled={shipAsap}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-xs font-normal text-gray-400">(optional)</span></label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Delivery instructions, references, anything else we should know…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-sm">
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-2">Items · {items.reduce((s, i) => s + i.qty, 0)} units per address</div>
                  <div className="space-y-1">
                    {items.map((it) => (
                      <div key={it.inventory_id} className="flex items-center justify-between text-xs text-gray-700">
                        <span className="truncate">{it.product_name}{it.variant ? ` · ${it.variant}` : ''}</span>
                        <span className="font-medium">× {it.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-200">
                  <div className="text-xs font-semibold text-gray-500 mb-2">Addresses · {addresses.length}</div>
                  <div className="space-y-2">
                    {addresses.map((a) => (
                      <div key={a.id} className="text-xs">
                        <div className="font-medium text-gray-900 flex items-center gap-1"><MapPin size={10} />{a.label || `${a.street} ${a.house_number || ''}`}</div>
                        <div className="text-gray-600">{[a.street, a.house_number, a.postal_code, a.city, a.country].filter(Boolean).join(', ')}</div>
                        <div className="text-gray-500 flex items-center gap-2 mt-0.5">
                          <span>{a.contact_name}</span>
                          {a.contact_phone && <span>· {a.contact_phone}</span>}
                          {a.contact_email && <span>· {a.contact_email}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-200 space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-gray-500">Ship out</div>
                      <div className="text-gray-900 font-medium">{shipAsap ? 'ASAP' : formatDate(shipDate) || '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Total units reserved</div>
                      <div className="text-gray-900 font-medium">{totalUnitsRequested}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 mb-1">Carrier per address</div>
                    <div className="space-y-1">
                      {perAddress.map((p) => {
                        const opt = p.options.find((o) => o.id === chosenOptionByAddress[p.addr.id])
                        return (
                          <div key={p.addr.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-gray-700 truncate">{p.addr.label || `${p.addr.city || p.addr.country}`}</span>
                            <span className="font-medium text-gray-900">
                              {opt ? `${opt.carrier} · ${opt.speed} · ${formatEur(Math.round((vatInclusive ? opt.totalInclVat : opt.total) * 100))}` : '—'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                    <div className="text-sm font-semibold text-gray-900">Total shipping ({vatInclusive ? 'incl. VAT' : 'excl. VAT'})</div>
                    <div className="text-sm font-bold text-blue-700">{formatEur(vatInclusive ? grandTotalCents.inclVat : grandTotalCents.exVat)}</div>
                  </div>
                  {notes && (
                    <div>
                      <div className="text-gray-500">Notes</div>
                      <div className="text-gray-900 whitespace-pre-wrap">{notes}</div>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-xs text-gray-500">
                {addresses.length > 1
                  ? `We'll create ${addresses.length} shipment requests — one per address, each with the same items.`
                  : `We'll reserve stock and process your shipment.`}
              </p>

              {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <SecondaryButton onClick={step === 0 ? onClose : () => setStep(step - 1)} disabled={submitting}>
            <ChevronLeft size={14} />{step === 0 ? 'Cancel' : 'Back'}
          </SecondaryButton>
          {step < STEPS.length - 1 ? (
            <PrimaryButton onClick={() => setStep(step + 1)} disabled={!canAdvance()}>
              Next<ChevronRight size={14} />
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={submit} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit request'}
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  )
}
