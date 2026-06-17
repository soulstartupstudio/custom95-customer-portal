import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Check, Trash2 } from 'lucide-react'
import { PrimaryButton, SecondaryButton } from './ui'
import { SHIPPING_COUNTRIES, normalizeCountry } from '../lib/shippingCalc'

const EMPTY = {
  label: '', street: '', house_number: '', postal_code: '', city: '', country: '',
  contact_name: '', contact_phone: '', contact_email: '',
  is_default_delivery: false, is_default_billing: false,
}

/**
 * Unified add / edit form. Pass `address` to edit; omit to create.
 * Calls onSaved(address) on success. Calls onDeleted() if user deletes.
 */
export default function AddressEditor({ company, address, onSaved, onCancel, onDeleted, mode = 'full', title }) {
  const [form, setForm] = useState({ ...EMPTY, ...(address ?? {}) })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const isEdit = !!address?.id

  // For the shipment-mode country dropdown: map whatever is stored (which may be
  // an ISO code or native name like "NL"/"Nederland") onto the canonical country
  // name we have rates for, so an existing address pre-selects correctly.
  const canonicalCountry = SHIPPING_COUNTRIES.includes(form.country)
    ? form.country
    : (normalizeCountry(form.country) || '')

  const save = async () => {
    if (!form.street.trim() || !form.city.trim()) { setError('Street and city are required.'); return }
    if (mode === 'shipment') {
      // Shipments need a complete, deliverable address: a country we ship to (for
      // carrier rates), house number + postal code (so the parcel can actually be
      // delivered), and name + phone + email so the carrier can reach the
      // recipient and we can send tracking. This matches the team-app gate.
      if (!form.house_number?.trim()) { setError('House number is required for shipments.'); return }
      if (!form.postal_code?.trim()) { setError('Postal code is required for shipments.'); return }
      if (!canonicalCountry) { setError('Please choose a destination country we ship to.'); return }
      if (!form.contact_name.trim()) { setError('Recipient name is required for shipments.'); return }
      if (!form.contact_phone.trim()) { setError('Recipient phone is required for shipments.'); return }
      if (!form.contact_email.trim()) { setError('Recipient email is required for shipments.'); return }
    }
    setBusy(true); setError(null)
    const payload = {
      company_id: company.id,
      address_type: address?.address_type || 'delivery',
      label: form.label?.trim() || null,
      street: form.street.trim(),
      house_number: form.house_number?.trim() || null,
      postal_code: form.postal_code?.trim() || null,
      city: form.city.trim(),
      // In shipment mode, persist the canonical country name (e.g. "Netherlands")
      // so the shipping calculator always finds a rate, regardless of how it was
      // originally entered. Full-mode addresses keep whatever the user typed.
      country: (mode === 'shipment' ? canonicalCountry : form.country?.trim()) || null,
      contact_name: form.contact_name?.trim() || null,
      contact_phone: form.contact_phone?.trim() || null,
      contact_email: form.contact_email?.trim() || null,
      is_default_delivery: !!form.is_default_delivery,
      is_default_billing: !!form.is_default_billing,
    }
    let result
    if (isEdit) {
      result = await supabase.from('addresses').update(payload).eq('id', address.id).select().single()
    } else {
      result = await supabase.from('addresses').insert(payload).select().single()
    }
    setBusy(false)
    if (result.error) { setError(result.error.message); return }
    onSaved?.(result.data)
  }

  const del = async () => {
    if (!isEdit) return
    setBusy(true); setError(null)
    // Soft-delete: addresses are referenced by past proposals/projects/orders
    // (FK NO ACTION), so a hard delete would fail for any address that's been
    // used. Archiving hides it from address books + pickers while keeping the
    // historical link intact.
    const { error: err } = await supabase
      .from('addresses')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', address.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    onDeleted?.()
  }

  return (
    <div className="border border-blue-200 bg-blue-50/30 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">{title || (isEdit ? 'Edit address' : 'New address')}</div>
        {onCancel && <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>}
      </div>

      <input type="text" value={form.label || ''} onChange={(e) => update('label', e.target.value)} placeholder="Label (e.g. HQ, Office Berlin)" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
      <div className="grid grid-cols-3 gap-2">
        <input type="text" value={form.street || ''} onChange={(e) => update('street', e.target.value)} placeholder="Street *" className="col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        <input type="text" value={form.house_number || ''} onChange={(e) => update('house_number', e.target.value)} placeholder={mode === 'shipment' ? 'Nr. *' : 'Nr.'} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input type="text" value={form.postal_code || ''} onChange={(e) => update('postal_code', e.target.value)} placeholder={mode === 'shipment' ? 'Postal code *' : 'Postal code'} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        <input type="text" value={form.city || ''} onChange={(e) => update('city', e.target.value)} placeholder="City *" className="col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
      </div>
      {mode === 'shipment' ? (
        <select
          value={canonicalCountry}
          onChange={(e) => update('country', e.target.value)}
          className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${canonicalCountry ? 'text-gray-900' : 'text-gray-400'}`}
        >
          <option value="" disabled>Destination country *</option>
          {SHIPPING_COUNTRIES.map((c) => (
            <option key={c} value={c} className="text-gray-900">{c}</option>
          ))}
        </select>
      ) : (
        <input type="text" value={form.country || ''} onChange={(e) => update('country', e.target.value)} placeholder="Country" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
      )}

      <div className="pt-2 border-t border-blue-200 space-y-2">
        <div className="text-xs font-semibold text-gray-700">Recipient / contact on site</div>
        <input type="text" value={form.contact_name || ''} onChange={(e) => update('contact_name', e.target.value)} placeholder={mode === 'shipment' ? 'Contact name *' : 'Contact name'} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        <div className="grid grid-cols-2 gap-2">
          <input type="tel" value={form.contact_phone || ''} onChange={(e) => update('contact_phone', e.target.value)} placeholder={mode === 'shipment' ? 'Phone *' : 'Phone'} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          <input type="email" value={form.contact_email || ''} onChange={(e) => update('contact_email', e.target.value)} placeholder={mode === 'shipment' ? 'Email *' : 'Email'} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        {mode === 'shipment' && (
          <p className="text-[10px] text-gray-500">Name, phone, and email are all required so the carrier can call and we can email the tracking link.</p>
        )}
      </div>

      {mode === 'full' && (
        <div className="flex gap-4 pt-2 border-t border-blue-200 text-xs">
          <label className="inline-flex items-center gap-1.5 text-gray-700 cursor-pointer">
            <input type="checkbox" checked={!!form.is_default_delivery} onChange={(e) => update('is_default_delivery', e.target.checked)} className="accent-blue-600" />
            Default delivery
          </label>
          <label className="inline-flex items-center gap-1.5 text-gray-700 cursor-pointer">
            <input type="checkbox" checked={!!form.is_default_billing} onChange={(e) => update('is_default_billing', e.target.checked)} className="accent-blue-600" />
            Default billing
          </label>
        </div>
      )}

      {error && <div className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</div>}

      <div className="flex items-center justify-between gap-2 pt-2">
        <div>
          {isEdit && onDeleted && (
            confirmDelete ? (
              <div className="flex items-center gap-1">
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                <button onClick={del} disabled={busy} className="text-xs font-medium text-red-600 hover:text-red-700 inline-flex items-center gap-1">
                  <Trash2 size={11} />{busy ? '…' : 'Confirm remove'}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-gray-500 hover:text-red-600 inline-flex items-center gap-1">
                <Trash2 size={12} />Remove
              </button>
            )
          )}
        </div>
        <div className="flex gap-2">
          {onCancel && <SecondaryButton onClick={onCancel} disabled={busy}>Cancel</SecondaryButton>}
          <PrimaryButton onClick={save} disabled={busy}><Check size={14} />{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Save address'}</PrimaryButton>
        </div>
      </div>
    </div>
  )
}
