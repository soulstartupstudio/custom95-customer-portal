import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  X, ChevronLeft, ChevronRight, Check, Sparkles, Calendar as CalendarIcon,
  Package, FileText, Plus, Trash2, Search, Upload, Image as ImageIcon, Star,
  MapPin, Users, Mail, Phone,
} from 'lucide-react'
import { PrimaryButton, SecondaryButton, formatCents } from './ui'

const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'items', label: 'Items' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'team', label: 'Team' },
  { id: 'review', label: 'Review' },
]

const OCCASIONS = [
  'Employee gift', 'Client gift', 'Event merch', 'Swag bag', 'Onboarding kit',
  'Conference', 'Holiday', 'Product launch', 'Other',
]

const SHIPMENT_TYPES = [
  { value: 'one_address', label: 'One address', hint: 'Bulk ship to a single destination' },
  { value: 'multiple', label: 'Multiple addresses', hint: 'Ship to a list of recipients' },
  { value: 'warehouse', label: 'Store in warehouse', hint: 'Hold stock for later fulfilment' },
]

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

// --- CATALOGUE PICKER ---
function CataloguePicker({ mode, company, onPick }) {
  const [items, setItems] = useState([])
  const [tiersByItem, setTiersByItem] = useState({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      let source
      if (mode === 'mine') {
        const { data } = await supabase
          .from('company_catalogue')
          .select('catalogue_items(*)')
          .eq('company_id', company.id)
        source = (data ?? []).map((r) => r.catalogue_items).filter(Boolean)
      } else {
        const { data } = await supabase
          .from('catalogue_items')
          .select('*')
          .eq('portal_visible', true)
          .eq('active', true)
          .order('name')
          .limit(200)
        source = data ?? []
      }
      if (cancelled) return
      setItems(source)

      const ids = source.map((s) => s.id)
      if (ids.length) {
        const { data: tiers } = await supabase
          .from('catalogue_pricing_tiers')
          .select('*')
          .in('catalogue_item_id', ids)
          .order('qty_from')
        if (!cancelled) {
          const byItem = {}
          for (const t of tiers ?? []) {
            byItem[t.catalogue_item_id] = byItem[t.catalogue_item_id] || []
            byItem[t.catalogue_item_id].push(t)
          }
          setTiersByItem(byItem)
        }
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [mode, company.id])

  const filtered = search
    ? items.filter((i) => i.name?.toLowerCase().includes(search.toLowerCase()) || i.category?.toLowerCase().includes(search.toLowerCase()))
    : items

  if (loading) return <div className="text-sm text-gray-400 py-6 text-center">Loading products…</div>
  if (items.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-lg">
        {mode === 'mine' ? 'No saved products yet.' : 'No products available.'}
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
          placeholder="Search…"
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="max-h-80 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-1">
        {filtered.slice(0, 50).map((item) => {
          const tiers = tiersByItem[item.id] ?? []
          const minPrice = Math.min(...tiers.filter((t) => !t.is_sample_tier).map((t) => t.sales_price_cents).filter((n) => n != null))
          return (
            <button
              key={item.id}
              onClick={() => onPick(item, tiers)}
              className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-blue-50 text-left"
            >
              <div className="w-12 h-12 rounded-md bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                {item.main_photo_url ? (
                  <img src={item.main_photo_url} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                ) : (
                  <Package size={18} className="text-gray-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
                <div className="text-xs text-gray-500 truncate">
                  {item.category || 'Product'}
                  {item.moq_sales ? ` · MOQ ${item.moq_sales}` : ''}
                </div>
              </div>
              <div className="text-right">
                {Number.isFinite(minPrice) && (
                  <div className="text-xs text-gray-500">from {formatCents(minPrice)}</div>
                )}
                <div className="text-xs text-blue-600 font-medium mt-0.5">Add</div>
              </div>
            </button>
          )
        })}
        {filtered.length === 0 && <div className="text-xs text-gray-400 p-6 text-center">No matches.</div>}
      </div>
    </div>
  )
}

// --- CUSTOM ITEM FORM ---
function CustomItemForm({ company, onAdd }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('')
  const [referenceUrl, setReferenceUrl] = useState('')
  const [uploadedUrl, setUploadedUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const uploadRef = async (file) => {
    if (!file) return
    setUploading(true)
    setError(null)
    const ext = file.name.split('.').pop()
    const path = `${company.id}/inspirations/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('brand-assets').upload(path, file, {
      contentType: file.type,
      upsert: false,
    })
    if (upErr) { setError(upErr.message); setUploading(false); return }
    const { data } = await supabase.storage.from('brand-assets').createSignedUrl(path, 60 * 60 * 24 * 7)
    setUploadedUrl(data?.signedUrl || null)
    setReferenceUrl(data?.signedUrl || '')
    setUploading(false)
  }

  const canAdd = name.trim().length > 0

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-white">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Product name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Custom branded hoodie"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 200"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
          <div className="flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500">
            <Sparkles size={12} />TBD — we'll quote it
          </div>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Details</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Material, colours, branding direction, inspiration…"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Reference photo or URL</label>
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={referenceUrl}
            onChange={(e) => { setReferenceUrl(e.target.value); setUploadedUrl(null) }}
            placeholder="https://..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className={`inline-flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium cursor-pointer hover:bg-gray-50 ${uploading ? 'opacity-50' : ''}`}>
            <Upload size={12} />{uploading ? '…' : 'Upload'}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => uploadRef(e.target.files?.[0])}
            />
          </label>
        </div>
        {uploadedUrl && (
          <div className="mt-2 flex items-center gap-2 text-xs text-green-700">
            <ImageIcon size={12} />Reference uploaded
          </div>
        )}
      </div>
      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
      <PrimaryButton
        onClick={() => {
          onAdd({
            type: 'custom',
            description: name.trim(),
            quantity: quantity ? Number(quantity) : null,
            reference_url: referenceUrl.trim() || null,
            notes: description.trim() || null,
            unit_price_cents: null,
            photo_url: uploadedUrl,
          })
          setName(''); setDescription(''); setQuantity(''); setReferenceUrl(''); setUploadedUrl(null)
          if (fileRef.current) fileRef.current.value = ''
        }}
        disabled={!canAdd || uploading}
        className="w-full justify-center"
      >
        <Plus size={14} />Add custom item
      </PrimaryButton>
    </div>
  )
}

// --- CART ROW with inline options ---
function CartRow({ item: it, idx, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  const baseUnit = it.type === 'catalogue' ? getTierPrice(it.tiers, it.quantity) : null
  const surcharge = it.customization_surcharge_cents ?? 0
  const unitPrice = baseUnit != null ? baseUnit + surcharge : null
  const subtotal = unitPrice != null && it.quantity ? unitPrice * it.quantity : null
  const hasOptions = it.type === 'catalogue' && (
    (it.available_colours?.length ?? 0) > 0 ||
    (it.available_sizes?.length ?? 0) > 0 ||
    (it.available_customizations?.length ?? 0) > 0
  )

  return (
    <>
      <tr className="border-t border-gray-100">
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            {it.photo_url ? (
              <img src={it.photo_url} alt="" className="w-8 h-8 rounded object-cover" onError={(e) => { e.target.style.display = 'none' }} />
            ) : (
              <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center">
                <Package size={14} className="text-gray-400" />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{it.description}</div>
              <div className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
                <span>{it.type === 'custom' ? 'Custom' : it.category || 'Catalogue'}</span>
                {it.colour_choice && <><span>·</span><span>{it.colour_choice}</span></>}
                {it.size_choice && <><span>·</span><span>{it.size_choice}</span></>}
                {it.customization_name && (
                  <>
                    <span>·</span>
                    <span className="text-gray-700">{it.customization_name}{surcharge > 0 && <span className="text-amber-700"> (+{formatCents(surcharge)})</span>}</span>
                  </>
                )}
                {hasOptions && (
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => !e)}
                    className="ml-1 text-blue-600 hover:text-blue-700 font-medium"
                  >{expanded ? 'Hide options' : 'Edit options'}</button>
                )}
              </div>
            </div>
          </div>
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            min="1"
            value={it.quantity ?? ''}
            onChange={(e) => onUpdate(idx, { quantity: e.target.value ? Number(e.target.value) : null })}
            className="w-20 px-2 py-1 border border-gray-200 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </td>
        <td className="px-3 py-2 text-right text-xs text-gray-700">
          {unitPrice != null ? formatCents(unitPrice) : <span className="text-gray-400">TBD</span>}
        </td>
        <td className="px-3 py-2 text-right text-xs font-medium text-gray-900">
          {subtotal != null ? formatCents(subtotal) : <span className="text-gray-400">TBD</span>}
        </td>
        <td className="px-2 py-2">
          <button onClick={() => onRemove(idx)} className="text-gray-400 hover:text-red-600">
            <Trash2 size={14} />
          </button>
        </td>
      </tr>
      {expanded && hasOptions && (
        <tr className="border-t border-gray-50 bg-gray-50/60">
          <td colSpan={5} className="px-3 py-3">
            <div className="space-y-3">
              {(it.available_colours?.length ?? 0) > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1 font-semibold">Colour {it.colour_choice && <span className="text-gray-700 font-normal lowercase">· {it.colour_choice}</span>}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {it.available_colours.map((c) => {
                      const active = it.colour_choice === c.colour_name
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onUpdate(idx, { colour_choice: c.colour_name })}
                          className={`w-8 h-8 rounded-md border-2 ${active ? 'border-blue-500 ring-1 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}
                          title={c.colour_name}
                          style={{ backgroundColor: c.hex_code || '#e5e7eb' }}
                        />
                      )
                    })}
                  </div>
                </div>
              )}
              {(it.available_sizes?.length ?? 0) > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1 font-semibold">Size {it.size_choice && <span className="text-gray-700 font-normal lowercase">· {it.size_choice}</span>}</div>
                  <div className="flex flex-wrap gap-1">
                    {it.available_sizes.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onUpdate(idx, { size_choice: s })}
                        className={`px-2.5 py-1 rounded text-xs font-medium border ${it.size_choice === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300 text-gray-700 bg-white'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(it.available_customizations?.length ?? 0) > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1 font-semibold">Customization</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {it.available_customizations.map((cz) => {
                      const active = it.customization_id === cz.id
                      return (
                        <button
                          key={cz.id}
                          type="button"
                          onClick={() => onUpdate(idx, {
                            customization_id: cz.id,
                            customization_name: cz.name,
                            customization_surcharge_cents: cz.surcharge_cents ?? 0,
                          })}
                          className={`p-2 rounded border-2 text-left ${active ? 'border-blue-500 ring-1 ring-blue-200 bg-white' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                        >
                          <div className="text-xs font-semibold text-gray-900 flex items-center justify-between gap-1">
                            <span className="truncate">{cz.name}</span>
                            {cz.surcharge_cents > 0
                              ? <span className="text-[10px] text-amber-700">+{formatCents(cz.surcharge_cents)}</span>
                              : <span className="text-[10px] text-green-700">Free</span>}
                          </div>
                          {cz.description && <div className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{cz.description}</div>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// --- CART TABLE ---
function Cart({ items, onUpdate, onRemove }) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-lg">
        Cart is empty. Add at least one item to continue.
      </div>
    )
  }
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Item</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 w-24">Qty</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 w-28">Unit</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 w-28">Subtotal</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <CartRow key={idx} item={it} idx={idx} onUpdate={onUpdate} onRemove={onRemove} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- ADDRESS PICKER ---
function AddressPicker({ company, multi, selectedIds, onChange }) {
  const [addresses, setAddresses] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const [newAddr, setNewAddr] = useState({
    label: '', street: '', house_number: '', postal_code: '', city: '', country: '', contact_name: '', contact_phone: '',
  })

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('addresses')
      .select('*')
      .eq('company_id', company.id)
      .order('is_default_delivery', { ascending: false })
    setAddresses(data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [company.id])

  const toggle = (id) => {
    if (multi) {
      onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
    } else {
      onChange([id])
    }
  }

  const save = async () => {
    if (!newAddr.street.trim() || !newAddr.city.trim()) { setSaveErr('Street and city are required.'); return }
    setSaveErr(null)
    const { data, error } = await supabase.from('addresses').insert({
      company_id: company.id,
      address_type: 'delivery',
      label: newAddr.label.trim() || null,
      street: newAddr.street.trim(),
      house_number: newAddr.house_number.trim() || null,
      postal_code: newAddr.postal_code.trim() || null,
      city: newAddr.city.trim(),
      country: newAddr.country.trim() || null,
      contact_name: newAddr.contact_name.trim() || null,
      contact_phone: newAddr.contact_phone.trim() || null,
    }).select().single()
    if (error) { setSaveErr(error.message); return }
    setAdding(false)
    setNewAddr({ label: '', street: '', house_number: '', postal_code: '', city: '', country: '', contact_name: '', contact_phone: '' })
    setAddresses((arr) => [data, ...arr])
    toggle(data.id)
  }

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="text-sm text-gray-400 py-4 text-center">Loading addresses…</div>
      ) : addresses.length === 0 ? (
        <div className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">
          No addresses yet. Add one below.
        </div>
      ) : (
        <div className="space-y-2">
          {addresses.map((a) => {
            const active = selectedIds.includes(a.id)
            return (
              <button
                key={a.id}
                onClick={() => toggle(a.id)}
                className={`w-full flex items-start gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
                  active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className={`w-5 h-5 rounded ${multi ? 'rounded' : 'rounded-full'} flex items-center justify-center flex-shrink-0 mt-0.5 ring-1 ring-inset ${
                  active ? 'bg-blue-600 ring-blue-600' : 'bg-white ring-gray-300'
                }`}>
                  {active && <Check size={12} className="text-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-medium text-gray-900 truncate">{a.label || `${a.street} ${a.house_number || ''}`}</div>
                    {a.is_default_delivery && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Default</span>}
                  </div>
                  <div className="text-xs text-gray-500">
                    {[a.street, a.house_number].filter(Boolean).join(' ')}{a.postal_code || a.city ? ', ' : ''}{[a.postal_code, a.city].filter(Boolean).join(' ')}{a.country ? `, ${a.country}` : ''}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <Plus size={14} />Add new address
        </button>
      ) : (
        <div className="border border-blue-200 bg-blue-50/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">New address</div>
            <button onClick={() => setAdding(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
          <input type="text" value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })} placeholder="Label (e.g. HQ, Warehouse)" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          <div className="grid grid-cols-3 gap-2">
            <input type="text" value={newAddr.street} onChange={(e) => setNewAddr({ ...newAddr, street: e.target.value })} placeholder="Street *" className="col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            <input type="text" value={newAddr.house_number} onChange={(e) => setNewAddr({ ...newAddr, house_number: e.target.value })} placeholder="Nr." className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input type="text" value={newAddr.postal_code} onChange={(e) => setNewAddr({ ...newAddr, postal_code: e.target.value })} placeholder="Postal code" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            <input type="text" value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} placeholder="City *" className="col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          <input type="text" value={newAddr.country} onChange={(e) => setNewAddr({ ...newAddr, country: e.target.value })} placeholder="Country" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={newAddr.contact_name} onChange={(e) => setNewAddr({ ...newAddr, contact_name: e.target.value })} placeholder="Contact name" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            <input type="tel" value={newAddr.contact_phone} onChange={(e) => setNewAddr({ ...newAddr, contact_phone: e.target.value })} placeholder="Contact phone" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          {saveErr && <div className="text-xs text-red-600 bg-red-50 rounded p-2">{saveErr}</div>}
          <PrimaryButton onClick={save} className="w-full justify-center"><Check size={14} />Save address</PrimaryButton>
        </div>
      )}
    </div>
  )
}

// --- TEAM PICKER ---
function TeamPicker({ company, contact, selectedIds, onChange }) {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', role: '' })

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, role, email, phone, profile_image_url')
      .eq('company_id', company.id)
      .order('last_name', { nullsFirst: false })
    setContacts(data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [company.id])

  const toggle = (id) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
  }

  const save = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) { setSaveErr('First and last name are required.'); return }
    setSaveErr(null)
    const { data, error } = await supabase.from('contacts').insert({
      company_id: company.id,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      role: form.role.trim() || null,
      portal_active: true,
    }).select().single()
    if (error) { setSaveErr(error.message); return }
    // Fire invite email asynchronously — don't block the wizard if it fails.
    if (data?.id && data.email) {
      supabase.functions.invoke('portal-invite', { body: { contact_id: data.id } }).catch(() => {})
    }
    setAdding(false)
    setForm({ first_name: '', last_name: '', email: '', phone: '', role: '' })
    setContacts((arr) => [...arr, data])
    toggle(data.id)
  }

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="text-sm text-gray-400 py-4 text-center">Loading team…</div>
      ) : contacts.length === 0 ? (
        <div className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">
          No teammates yet. Add one below.
        </div>
      ) : (
        <div className="space-y-1.5">
          {contacts.map((c) => {
            const active = selectedIds.includes(c.id)
            const isMe = c.id === contact?.id
            const initials = [c.first_name, c.last_name].filter(Boolean).map((n) => n[0]).join('').toUpperCase()
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                disabled={isMe}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                  active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                } ${isMe ? 'opacity-80' : ''}`}
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ring-1 ring-inset ${
                  active ? 'bg-blue-600 ring-blue-600' : 'bg-white ring-gray-300'
                }`}>
                  {active && <Check size={12} className="text-white" />}
                </div>
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600 overflow-hidden flex-shrink-0">
                  {c.profile_image_url ? (
                    <img src={c.profile_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    initials || '?'
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-medium text-gray-900 truncate">{c.first_name} {c.last_name}</div>
                    {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">You (lead)</span>}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{c.role}{c.role && c.email ? ' · ' : ''}{c.email}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <Plus size={14} />Add teammate
        </button>
      ) : (
        <div className="border border-blue-200 bg-blue-50/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900">New teammate</div>
            <button onClick={() => setAdding(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="First name *" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            <input type="text" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Last name *" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>
          <input type="text" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Role (e.g. Marketing Lead)" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          <p className="text-xs text-gray-500">They'll be added as a contact. Portal access can be granted later by your account manager.</p>
          {saveErr && <div className="text-xs text-red-600 bg-red-50 rounded p-2">{saveErr}</div>}
          <PrimaryButton onClick={save} className="w-full justify-center"><Check size={14} />Save teammate</PrimaryButton>
        </div>
      )}
    </div>
  )
}

// --- MAIN WIZARD ---
export default function StartProposalWizard({ company, contact, onClose, onCreated, prefillItem }) {
  const [step, setStep] = useState(prefillItem ? 0 : 0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [itemMode, setItemMode] = useState('catalogue')
  const [items, setItems] = useState(() => {
    if (!prefillItem) return []
    const item = prefillItem.catalogue_item
    return [{
      type: 'catalogue',
      catalogue_item_id: item.id,
      description: item.name,
      category: item.category,
      photo_url: prefillItem.photo_url || item.main_photo_url,
      quantity: prefillItem.quantity || item.moq_sales || 50,
      reference_url: null,
      notes: prefillItem.notes || null,
      tiers: prefillItem.tiers || [],
      colour_choice: prefillItem.colour_choice || null,
      size_choice: prefillItem.size_choice || null,
      shipping_method: prefillItem.shipping_method || null,
      customization_id: prefillItem.customization_id || null,
      customization_name: prefillItem.customization_name || null,
      customization_surcharge_cents: prefillItem.customization_surcharge_cents ?? null,
      // No available_* lists since they were chosen already in CatalogueDetail; user can edit in the wizard cart later if needed.
    }]
  })
  const [addressIds, setAddressIds] = useState([])
  const [teamIds, setTeamIds] = useState(contact?.id ? [contact.id] : [])
  const [form, setForm] = useState({
    name: prefillItem?.catalogue_item ? `${prefillItem.catalogue_item.name} project` : '',
    occasion: '',
    occasion_other: '',
    brief_notes: '',
    deadline_at: '',
    shipment_type: 'one_address',
    delivery_notes: '',
  })

  const update = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (k === 'shipment_type') setAddressIds([])
  }

  const addFromCatalogue = async (item, tiers) => {
    // Fetch colour + customization options so the wizard cart can offer the choices
    const [csRes, czRes] = await Promise.all([
      supabase.from('catalogue_colour_options').select('id, colour_name, hex_code').eq('catalogue_item_id', item.id).eq('active', true).order('colour_name'),
      supabase.from('catalogue_customizations').select('id, name, description, surcharge_cents, is_default, sort_order').eq('catalogue_item_id', item.id).order('sort_order'),
    ])
    const colours = csRes.data ?? []
    const customizations = czRes.data ?? []
    const defaultCust = customizations.find((c) => c.is_default) || customizations[0] || null
    const sizesParsed = item.size_variants && item.available_sizes
      ? item.available_sizes.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean) : []
    setItems((arr) => [
      ...arr,
      {
        type: 'catalogue',
        catalogue_item_id: item.id,
        description: item.name,
        category: item.category,
        photo_url: item.main_photo_url,
        quantity: item.moq_sales || 50,
        reference_url: null,
        notes: null,
        tiers,
        // catalogue options (for inline picker)
        available_colours: colours,
        available_sizes: sizesParsed,
        available_customizations: customizations,
        // chosen values
        colour_choice: colours[0]?.colour_name || null,
        size_choice: null,
        customization_id: defaultCust?.id || null,
        customization_name: defaultCust?.name || null,
        customization_surcharge_cents: defaultCust?.surcharge_cents ?? null,
      },
    ])
  }

  const addCustom = (item) => setItems((arr) => [...arr, item])
  const updateItem = (idx, patch) => setItems((arr) => arr.map((it, i) => i === idx ? { ...it, ...patch } : it))
  const removeItem = (idx) => setItems((arr) => arr.filter((_, i) => i !== idx))

  const totalCents = useMemo(() => {
    let total = 0
    let hasTBD = false
    for (const it of items) {
      const base = it.type === 'catalogue' ? getTierPrice(it.tiers, it.quantity) : null
      const surcharge = it.customization_surcharge_cents ?? 0
      if (base != null && it.quantity) total += (base + surcharge) * it.quantity
      else hasTBD = true
    }
    return { total, hasTBD }
  }, [items])

  const needsAddress = form.shipment_type === 'one_address' || form.shipment_type === 'multiple'

  const canAdvance = () => {
    if (step === 0) return !!form.name.trim() && !!form.occasion && (form.occasion !== 'Other' || form.occasion_other.trim()) && !!form.brief_notes.trim()
    if (step === 1) return items.length > 0
    if (step === 2) {
      if (!form.shipment_type) return false
      if (form.shipment_type === 'one_address') return addressIds.length === 1
      if (form.shipment_type === 'multiple') return addressIds.length >= 1
      return true
    }
    if (step === 3) return true
    return true
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    const occasion = form.occasion === 'Other' ? form.occasion_other.trim() : form.occasion
    const totalQty = items.reduce((sum, it) => sum + (it.quantity || 0), 0)

    const proposalPatch = {
      company_id: company.id,
      name: form.name.trim(),
      status: 'inquiry_received',
      type: 'new_biz',
      occasion,
      quantity_est: totalQty || null,
      deadline_at: form.deadline_at || null,
      brief_notes: form.brief_notes.trim(),
      shipment_type: form.shipment_type,
      delivery_notes: form.delivery_notes.trim() || null,
      created_by_client: true,
    }
    if (form.shipment_type === 'one_address' && addressIds[0]) {
      proposalPatch.delivery_address_id = addressIds[0]
    } else if (form.shipment_type === 'multiple' && addressIds.length > 0) {
      proposalPatch.delivery_address_ids = addressIds
    }

    const { data: proposal, error: propErr } = await supabase.from('proposals').insert(proposalPatch).select('id').single()
    if (propErr) { setSubmitting(false); setError(propErr.message); return }

    // Items (trigger handles design_task spawning)
    if (items.length > 0) {
      const rows = items.map((it) => ({
        proposal_id: proposal.id,
        company_id: company.id,
        catalogue_item_id: it.catalogue_item_id || null,
        description: it.description,
        quantity: it.quantity || null,
        reference_url: it.reference_url,
        notes: it.notes,
        colour_choice: it.colour_choice || null,
        size_choice: it.size_choice || null,
        shipping_method: it.shipping_method || null,
        customization_id: it.customization_id || null,
        customization_name: it.customization_name || null,
        customization_surcharge_cents: it.customization_surcharge_cents ?? null,
        requested_by_contact_id: contact.id,
      }))
      const { error: itemsErr } = await supabase.from('proposal_requested_items').insert(rows)
      if (itemsErr) { setSubmitting(false); setError(itemsErr.message); return }
    }

    // Team
    if (teamIds.length > 0) {
      const pcRows = teamIds.map((cid) => ({
        proposal_id: proposal.id,
        contact_id: cid,
        company_id: company.id,
        role: cid === contact.id ? 'lead' : 'collaborator',
        added_by_contact_id: contact.id,
      }))
      const { error: pcErr } = await supabase.from('proposal_contacts').insert(pcRows)
      if (pcErr) { setSubmitting(false); setError(pcErr.message); return }
    }

    setSubmitting(false)
    onCreated?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Start a new proposal</h2>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proposal name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="e.g. Summer event swag, Q3 onboarding kit"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">What's the occasion?</label>
                <div className="grid grid-cols-3 gap-2">
                  {OCCASIONS.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => update('occasion', o)}
                      className={`px-3 py-2 text-sm rounded-lg border text-left transition-colors ${
                        form.occasion === o ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
                {form.occasion === 'Other' && (
                  <input
                    type="text"
                    value={form.occasion_other}
                    onChange={(e) => update('occasion_other', e.target.value)}
                    placeholder="Tell us more"
                    className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <FileText size={14} />Brief
                </label>
                <textarea
                  value={form.brief_notes}
                  onChange={(e) => update('brief_notes', e.target.value)}
                  rows={5}
                  placeholder="Tell us what you have in mind: brand tone, must-haves, references…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <CalendarIcon size={14} />Target deadline <span className="text-xs font-normal text-gray-400 ml-1">(optional)</span>
                </label>
                <input
                  type="date"
                  value={form.deadline_at}
                  onChange={(e) => update('deadline_at', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                {[
                  { id: 'catalogue', label: 'Catalogue' },
                  { id: 'mine', label: 'My catalogue', icon: Star },
                  { id: 'custom', label: 'Custom' },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setItemMode(id)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md inline-flex items-center gap-1.5 ${
                      itemMode === id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                    }`}
                  >
                    {Icon && <Icon size={12} />}{label}
                  </button>
                ))}
              </div>
              {itemMode === 'catalogue' && <CataloguePicker mode="all" company={company} onPick={addFromCatalogue} />}
              {itemMode === 'mine' && <CataloguePicker mode="mine" company={company} onPick={addFromCatalogue} />}
              {itemMode === 'custom' && <CustomItemForm company={company} onAdd={addCustom} />}
              <div className="pt-2">
                <div className="text-xs font-semibold text-gray-600 mb-2">
                  Cart {items.length > 0 && `· ${items.length} ${items.length === 1 ? 'item' : 'items'}`}
                </div>
                <Cart items={items} onUpdate={updateItem} onRemove={removeItem} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">How should we ship?</label>
                <div className="space-y-2">
                  {SHIPMENT_TYPES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => update('shipment_type', s.value)}
                      className={`w-full px-4 py-3 border rounded-lg text-left transition-colors ${
                        form.shipment_type === s.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900">{s.label}</div>
                      <div className="text-xs text-gray-500">{s.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              {needsAddress && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <MapPin size={14} />
                    {form.shipment_type === 'one_address' ? 'Select delivery address' : 'Select delivery addresses'}
                  </label>
                  <AddressPicker
                    company={company}
                    multi={form.shipment_type === 'multiple'}
                    selectedIds={addressIds}
                    onChange={setAddressIds}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery notes <span className="text-xs font-normal text-gray-400">(optional)</span></label>
                <textarea
                  value={form.delivery_notes}
                  onChange={(e) => update('delivery_notes', e.target.value)}
                  rows={3}
                  placeholder="Specific delivery instructions, split-shipments, etc."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <Users size={14} />Who's on this proposal?
                </label>
                <p className="text-xs text-gray-500 mb-3">Select teammates to keep in the loop. You can always add more later.</p>
                <TeamPicker
                  company={company}
                  contact={contact}
                  selectedIds={teamIds}
                  onChange={setTeamIds}
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-sm">
                <div><div className="text-xs text-gray-500">Name</div><div className="font-medium text-gray-900">{form.name}</div></div>
                <div><div className="text-xs text-gray-500">Occasion</div><div className="text-gray-900">{form.occasion === 'Other' ? form.occasion_other : form.occasion}</div></div>
                <div><div className="text-xs text-gray-500">Deadline</div><div className="text-gray-900">{form.deadline_at || 'No deadline'}</div></div>
                <div>
                  <div className="text-xs text-gray-500">Brief</div>
                  <div className="text-gray-900 whitespace-pre-wrap">{form.brief_notes}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Items ({items.length})</div>
                  <Cart items={items} onUpdate={updateItem} onRemove={removeItem} />
                  <div className="flex items-center justify-between pt-2 text-xs">
                    <span className="text-gray-500">Estimate</span>
                    <span className="text-gray-900 font-semibold">
                      {formatCents(totalCents.total)}{totalCents.hasTBD && ' + TBD items'}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Shipping</div>
                  <div className="text-gray-900">{SHIPMENT_TYPES.find((s) => s.value === form.shipment_type)?.label}</div>
                  {needsAddress && addressIds.length > 0 && (
                    <div className="text-gray-600 text-xs mt-1">{addressIds.length} address{addressIds.length === 1 ? '' : 'es'} selected</div>
                  )}
                  {form.delivery_notes && <div className="text-gray-600 text-xs mt-1 whitespace-pre-wrap">{form.delivery_notes}</div>}
                </div>
                <div>
                  <div className="text-xs text-gray-500">Team</div>
                  <div className="text-gray-900 text-xs">
                    {teamIds.length} {teamIds.length === 1 ? 'person' : 'people'}
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                We'll create a design brief for each item. Your account manager will follow up within one business day.
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
              {submitting ? 'Submitting…' : 'Submit proposal'}
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  )
}
