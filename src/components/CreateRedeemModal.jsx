import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Ticket, Check, Package, Loader2 } from 'lucide-react'
import { PrimaryButton, SecondaryButton } from './ui'

const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

export default function CreateRedeemModal({ company, contact, onClose, onCreated }) {
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [picksPerPerson, setPicksPerPerson] = useState(1)
  const [closesAt, setClosesAt] = useState('')
  const [introText, setIntroText] = useState('')
  const [domains, setDomains] = useState('')
  const [collectAddress, setCollectAddress] = useState(false)
  const [picked, setPicked] = useState({}) // inventory_id -> { max: '' | number }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('warehouse_inventory_client').select('id, product_name, variant, available_qty').eq('company_id', company.id).order('product_name')
      .then(({ data }) => { if (!cancelled) { setInventory((data ?? []).filter((i) => (i.available_qty ?? 0) > 0)); setLoading(false) } })
    return () => { cancelled = true }
  }, [company.id])

  // Slug follows the name until the user edits it by hand.
  useEffect(() => { if (!slugTouched) setSlug(slugify(name)) }, [name, slugTouched])

  const toggle = (id) => setPicked((p) => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = { max: '' }; return n })
  const setMax = (id, v) => setPicked((p) => ({ ...p, [id]: { max: v } }))

  const pickedIds = Object.keys(picked)
  const slugValid = /^[a-z0-9][a-z0-9-]{2,60}$/.test(slug)
  const canCreate = useMemo(() => name.trim() && slugValid && pickedIds.length > 0 && picksPerPerson > 0, [name, slugValid, pickedIds.length, picksPerPerson])

  const create = async () => {
    setSaving(true); setError(null)
    const domainList = domains.split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)
    const { data: camp, error: cErr } = await supabase.from('redeem_campaigns').insert({
      company_id: company.id,
      name: name.trim(),
      slug,
      status: 'open',
      picks_per_person: Number(picksPerPerson) || 1,
      closes_at: closesAt ? new Date(closesAt).toISOString() : null,
      intro_text: introText.trim() || null,
      allowed_email_domains: domainList.length ? domainList : null,
      collect_address: collectAddress,
    }).select('id').single()
    if (cErr) {
      setSaving(false)
      setError(/duplicate|unique/i.test(cErr.message) ? 'That link name is already taken — try another.' : cErr.message)
      return
    }
    const rows = pickedIds.map((id, idx) => ({
      campaign_id: camp.id,
      inventory_id: id,
      max_per_person: picked[id].max ? Number(picked[id].max) : null,
      sort_order: idx,
    }))
    const { error: iErr } = await supabase.from('redeem_campaign_items').insert(rows)
    setSaving(false)
    if (iErr) { setError('Campaign created, but adding products failed: ' + iErr.message); return }
    onCreated?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white sm:rounded-xl shadow-xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2"><Ticket size={18} className="text-indigo-600" /><h2 className="text-lg font-semibold text-gray-900">New redeem page</h2></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer team kit" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Link</label>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-gray-400">…/?redeem=</span>
              <input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)) }} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {slug && !slugValid && <p className="text-[11px] text-red-600 mt-1">3–61 chars, lowercase letters, numbers and dashes only.</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Products from your stock</label>
              <span className="text-xs text-gray-400">{pickedIds.length} selected</span>
            </div>
            {loading ? (
              <div className="text-sm text-gray-400 py-4 text-center">Loading stock…</div>
            ) : inventory.length === 0 ? (
              <div className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">No warehouse stock available.</div>
            ) : (
              <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {inventory.map((i) => {
                  const on = !!picked[i.id]
                  return (
                    <div key={i.id} className={`flex items-center gap-2 px-3 py-2 ${on ? 'bg-indigo-50/50' : ''}`}>
                      <button onClick={() => toggle(i.id)} className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ring-1 ring-inset ${on ? 'bg-indigo-600 ring-indigo-600' : 'bg-white ring-gray-300'}`}>{on && <Check size={12} className="text-white" />}</button>
                      <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0"><Package size={14} className="text-gray-400" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 truncate">{i.product_name}{i.variant ? <span className="text-gray-400"> · {i.variant}</span> : ''}</div>
                        <div className="text-[11px] text-gray-400">{i.available_qty} in stock</div>
                      </div>
                      {on && (
                        <input type="number" min="1" value={picked[i.id].max} onChange={(e) => setMax(i.id, e.target.value)} placeholder="max/pers" title="Max per person (optional)" className="w-20 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Picks per person</label>
              <input type="number" min="1" value={picksPerPerson} onChange={(e) => setPicksPerPerson(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Closes <span className="text-xs font-normal text-gray-400">(optional)</span></label>
              <input type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Restrict to email domains <span className="text-xs font-normal text-gray-400">(optional)</span></label>
            <input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="yourbrand.com, partner.com" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <p className="text-[11px] text-gray-400 mt-1">Leave empty to let anyone with the link claim.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Intro text <span className="text-xs font-normal text-gray-400">(optional)</span></label>
            <textarea value={introText} onChange={(e) => setIntroText(e.target.value)} rows={2} placeholder="A short message shown at the top of the page." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={collectAddress} onChange={(e) => setCollectAddress(e.target.checked)} />
            Collect a delivery address from each person <span className="text-gray-400">(otherwise everything ships in bulk to you)</span>
          </label>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton onClick={create} disabled={!canCreate || saving} className="!bg-indigo-600 hover:!bg-indigo-700">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Ticket size={15} />}Publish redeem page
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
