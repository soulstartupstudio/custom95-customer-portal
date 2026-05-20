import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Check, Upload, User } from 'lucide-react'
import { PrimaryButton, SecondaryButton } from './ui'

const EMPTY = {
  first_name: '', last_name: '', role: '',
  email: '', phone: '', whatsapp_phone: '',
  profile_image_url: '',
}

/**
 * Add or edit a contact. Pass `contact` to edit; omit to create.
 * Handles profile picture upload to the public `profile-pictures` bucket.
 */
export default function ContactEditor({ company, contact, onSaved, onCancel, title }) {
  const [form, setForm] = useState({ ...EMPTY, ...(contact ?? {}) })
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)
  const isEdit = !!contact?.id

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const uploadPhoto = async (file) => {
    if (!file) return
    setUploading(true); setError(null)
    const ext = file.name.split('.').pop()
    // public bucket — folder per contact (use placeholder while creating)
    const folder = contact?.id || company.id
    const path = `${folder}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('profile-pictures').upload(path, file, {
      contentType: file.type, upsert: false,
    })
    if (upErr) { setError(upErr.message); setUploading(false); return }
    const { data: pub } = supabase.storage.from('profile-pictures').getPublicUrl(path)
    update('profile_image_url', pub.publicUrl)
    setUploading(false)
  }

  const save = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First and last name are required.'); return
    }
    setBusy(true); setError(null)
    const payload = {
      company_id: company.id,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      role: form.role?.trim() || null,
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      whatsapp_phone: form.whatsapp_phone?.trim() || null,
      profile_image_url: form.profile_image_url || null,
    }
    // New teammates added from the portal get portal access automatically.
    // Their portal_auth_id binds on first sign-in via App.jsx's auto-claim flow.
    if (!isEdit) payload.portal_active = true
    const res = isEdit
      ? await supabase.from('contacts').update(payload).eq('id', contact.id).select().single()
      : await supabase.from('contacts').insert(payload).select().single()
    if (res.error) { setBusy(false); setError(res.error.message); return }

    // On add: fire the portal-invite edge function so they get a welcome email
    // with a sign-in link. We don't block the save if the email fails — just
    // surface a soft warning.
    if (!isEdit && res.data?.id && payload.email) {
      const { error: inviteErr } = await supabase.functions.invoke('portal-invite', {
        body: { contact_id: res.data.id },
      })
      if (inviteErr) {
        setBusy(false)
        setError(`Teammate saved, but invite email failed: ${inviteErr.message}`)
        onSaved?.(res.data) // still close — the contact exists
        return
      }
    }
    setBusy(false)
    onSaved?.(res.data)
  }

  const initials = [form.first_name, form.last_name].filter(Boolean).map((n) => n[0]).join('').toUpperCase()

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{title || (isEdit ? 'Edit team member' : 'Add team member')}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {/* Avatar uploader */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-base font-semibold overflow-hidden flex-shrink-0">
              {form.profile_image_url
                ? <img src={form.profile_image_url} alt="" className="w-full h-full object-cover" />
                : initials || <User size={22} />}
            </div>
            <div className="space-y-1.5">
              <label className={`inline-flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium cursor-pointer hover:bg-gray-50 ${uploading ? 'opacity-50' : ''}`}>
                <Upload size={12} />{uploading ? 'Uploading…' : 'Upload photo'}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => uploadPhoto(e.target.files?.[0])} />
              </label>
              {form.profile_image_url && (
                <button onClick={() => update('profile_image_url', '')} className="text-xs text-gray-500 hover:text-red-600 ml-2">Remove</button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={form.first_name} onChange={(e) => update('first_name', e.target.value)} placeholder="First name *" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" value={form.last_name} onChange={(e) => update('last_name', e.target.value)} placeholder="Last name *" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <input type="text" value={form.role || ''} onChange={(e) => update('role', e.target.value)} placeholder="Role (e.g. Marketing Lead)" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="email" value={form.email || ''} onChange={(e) => update('email', e.target.value)} placeholder="Email" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="grid grid-cols-2 gap-2">
            <input type="tel" value={form.phone || ''} onChange={(e) => update('phone', e.target.value)} placeholder="Phone" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="tel" value={form.whatsapp_phone || ''} onChange={(e) => update('whatsapp_phone', e.target.value)} placeholder="WhatsApp" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {!isEdit && (
            <p className="text-[10px] text-gray-500">
              New teammates are added with portal access. They'll sign in with this email via a magic link the first time they visit.
            </p>
          )}
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <SecondaryButton onClick={onCancel} disabled={busy}>Cancel</SecondaryButton>
          <PrimaryButton onClick={save} disabled={busy}><Check size={14} />{busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add team member'}</PrimaryButton>
        </div>
      </div>
    </div>
  )
}
