import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Check, Trash2 } from 'lucide-react'
import { PrimaryButton, SecondaryButton } from './ui'

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

  const save = async () => {
    if (!form.street.trim() || !form.city.trim()) { setError('Street and city are required.'); return }
    if (mode === 'shipment' && !form.contact_name.trim()) { setError('Contact name is required for shipments.'); return }
    setBusy(true); setError(null)
    const payload = {
      company_id: company.id,
      address_type: address?.address_type || 'delivery',
      label: form.label?.trim() || null,
      street: form.street.trim(),
      house_number: form.house_number?.trim() || null,
      postal_code: form.postal_code?.trim() || null,
      city: form.city.trim(),
      country: form.country?.trim() || null,
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
    const { error: err } = await supabase.from('addresses').delete().eq('id', address.id)
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
        <input type="text" value={form.house_number || ''} onChange={(e) => update('house_number', e.target.value)} placeholder="Nr." className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input type="text" value={form.postal_code || ''} onChange={(e) => update('postal_code', e.target.value)} placeholder="Postal code" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        <input type="text" value={form.city || ''} onChange={(e) => update('city', e.target.value)} placeholder="City *" className="col-span-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
      </div>
      <input type="text" value={form.country || ''} onChange={(e) => update('country', e.target.value)} placeholder="Country" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />

      <div className="pt-2 border-t border-blue-200 space-y-2">
        <div className="text-xs font-semibold text-gray-700">Recipient / contact on site</div>
        <input type="text" value={form.contact_name || ''} onChange={(e) => update('contact_name', e.target.value)} placeholder={mode === 'shipment' ? 'Contact name *' : 'Contact name'} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        <div className="grid grid-cols-2 gap-2">
          <input type="tel" value={form.contact_phone || ''} onChange={(e) => update('contact_phone', e.target.value)} placeholder="Phone" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          <input type="email" value={form.contact_email || ''} onChange={(e) => update('contact_email', e.target.value)} placeholder="Email" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
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
                  <Trash2 size={11} />{busy ? '…' : 'Confirm delete'}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-gray-500 hover:text-red-600 inline-flex items-center gap-1">
                <Trash2 size={12} />Delete
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
