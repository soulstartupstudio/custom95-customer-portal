import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  X, ChevronLeft, ChevronRight, Check, Package, MapPin, Plus, Truck,
  Calendar as CalendarIcon, Zap, Search, Trash2, AlertCircle, Mail, Phone, User, Pencil,
} from 'lucide-react'
import { PrimaryButton, SecondaryButton, formatDate } from './ui'
import AddressEditor from './AddressEditor'

const STEPS = [
  { id: 'items', label: 'Items' },
  { id: 'addresses', label: 'Addresses' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'review', label: 'Review' },
]

const SPEED_OPTIONS = [
  { value: 'standard', label: 'Standard', hint: 'Best price, usual lead time' },
  { value: 'express', label: 'Express', hint: 'Faster transit, higher cost' },
]

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
        .select('id, product_name, sku, variant, product_photo_url, available_qty, on_hand_qty, warehouse_location')
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
            const hasFullContact = hasContactName && (a.contact_phone || a.contact_email)
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
                      {!hasContactName && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 inline-flex items-center gap-1"><AlertCircle size={10} />Needs recipient</span>}
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
  const [speed, setSpeed] = useState('standard')
  const [notes, setNotes] = useState('')

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
      // require contact_name on each selected address
      return addresses.length === addressIds.length && addresses.every((a) => a.contact_name?.trim())
    }
    if (step === 2) return shipAsap || !!shipDate
    return true
  }

  const totalUnitsRequested = items.reduce((s, i) => s + i.qty, 0) * Math.max(1, addressIds.length)

  const submit = async () => {
    setSubmitting(true); setError(null)
    const requests = []
    for (const addr of addresses) {
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
        shipping_speed: speed,
        notes: notes.trim() || null,
      }).select('id').single()
      if (err) { setSubmitting(false); setError(err.message); return }
      requests.push(req.id)

      const rows = items.map((i) => ({ request_id: req.id, inventory_id: i.inventory_id, qty: i.qty }))
      const { error: itemsErr } = await supabase.from('warehouse_request_items').insert(rows)
      if (itemsErr) { setSubmitting(false); setError(itemsErr.message); return }
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <CalendarIcon size={14} />When should we ship out?
                </label>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => { setShipAsap(true); setShipDate('') }}
                    className={`w-full px-4 py-3 border rounded-lg text-left transition-colors ${
                      shipAsap ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Zap size={14} className="text-blue-600" />
                      <span className="text-sm font-medium text-gray-900">Ship ASAP</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">We'll ship out as soon as we can process the request.</div>
                  </button>
                  <div className={`w-full px-4 py-3 border rounded-lg transition-colors ${!shipAsap ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={!shipAsap}
                        onChange={() => setShipAsap(false)}
                        className="accent-blue-600"
                      />
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Shipping speed</label>
                <div className="grid grid-cols-2 gap-2">
                  {SPEED_OPTIONS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSpeed(s.value)}
                      className={`px-4 py-3 border rounded-lg text-left transition-colors ${
                        speed === s.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900">{s.label}</div>
                      <div className="text-xs text-gray-500">{s.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

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

                <div className="pt-3 border-t border-gray-200 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-gray-500">Ship out</div>
                    <div className="text-gray-900 font-medium">{shipAsap ? 'ASAP' : formatDate(shipDate) || '—'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Speed</div>
                    <div className="text-gray-900 font-medium capitalize">{speed}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-gray-500">Total units reserved</div>
                    <div className="text-gray-900 font-medium">{totalUnitsRequested}</div>
                  </div>
                  {notes && (
                    <div className="col-span-2">
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
