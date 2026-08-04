import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Ticket, Check, Package, Loader2, Download, Users } from 'lucide-react'
import { PrimaryButton, SecondaryButton, StatusBadge, formatDate } from './ui'

const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
const toDateInput = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '')

// Create OR manage a redeem campaign. Pass `campaign` (at least {id}) to edit an existing
// one — the modal loads its full settings, products, and claims/orders.
export default function RedeemModal({ company, contact, campaign = null, onClose, onSaved }) {
  const isEdit = !!campaign?.id
  const [tab, setTab] = useState('settings')
  const [inventory, setInventory] = useState([])
  const [invById, setInvById] = useState({})
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState(campaign?.name || '')
  const [slug, setSlug] = useState(campaign?.slug || '')
  const [slugTouched, setSlugTouched] = useState(isEdit)
  const [status, setStatus] = useState(campaign?.status || 'open')
  const [picksPerPerson, setPicksPerPerson] = useState(campaign?.picks_per_person || 1)
  const [closesAt, setClosesAt] = useState(toDateInput(campaign?.closes_at))
  const [introText, setIntroText] = useState(campaign?.intro_text || '')
  const [domains, setDomains] = useState('')
  const [collectAddress, setCollectAddress] = useState(!!campaign?.collect_address)
  const [picked, setPicked] = useState({}) // inventory_id -> { max, preorder }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const inv = (await supabase.from('warehouse_inventory_client').select('id, product_name, variant, available_qty').eq('company_id', company.id).order('product_name')).data ?? []
      if (cancelled) return
      setInventory(inv)
      setInvById(Object.fromEntries(inv.map((i) => [i.id, i])))

      if (isEdit) {
        const full = (await supabase.from('redeem_campaigns').select('*').eq('id', campaign.id).single()).data
        if (cancelled) return
        if (full) {
          setName(full.name); setSlug(full.slug); setStatus(full.status)
          setPicksPerPerson(full.picks_per_person); setClosesAt(toDateInput(full.closes_at))
          setIntroText(full.intro_text || ''); setCollectAddress(!!full.collect_address)
          setDomains((full.allowed_email_domains || []).join(', '))
        }
        const items = (await supabase.from('redeem_campaign_items').select('inventory_id, max_per_person, allow_oversell').eq('campaign_id', campaign.id)).data ?? []
        if (cancelled) return
        setPicked(Object.fromEntries(items.map((it) => [it.inventory_id, { max: it.max_per_person ?? '', preorder: !!it.allow_oversell }])))

        const cl = (await supabase.from('redeem_claims').select('id, name, email, status, claimed_at, ship_to_name, ship_to_city').eq('campaign_id', campaign.id).order('claimed_at', { ascending: false })).data ?? []
        if (cancelled) return
        if (cl.length) {
          const cItems = (await supabase.from('redeem_claim_items').select('claim_id, inventory_id, qty').in('claim_id', cl.map((c) => c.id))).data ?? []
          const byClaim = {}
          for (const ci of cItems) (byClaim[ci.claim_id] = byClaim[ci.claim_id] || []).push(ci)
          cl.forEach((c) => { c._items = byClaim[c.id] || [] })
        }
        if (!cancelled) setClaims(cl)
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company.id, campaign?.id, isEdit])

  useEffect(() => { if (!slugTouched) setSlug(slugify(name)) }, [name, slugTouched])

  const toggle = (id) => setPicked((p) => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = { max: '', preorder: (invById[id]?.available_qty ?? 0) <= 0 }; return n })
  const setField = (id, k, v) => setPicked((p) => ({ ...p, [id]: { ...p[id], [k]: v } }))

  const pickedIds = Object.keys(picked)
  const slugValid = /^[a-z0-9][a-z0-9-]{2,60}$/.test(slug)
  const canSave = useMemo(() => name.trim() && slugValid && pickedIds.length > 0 && picksPerPerson > 0, [name, slugValid, pickedIds.length, picksPerPerson])

  const save = async () => {
    setSaving(true); setError(null)
    const domainList = domains.split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)
    const payload = {
      name: name.trim(),
      picks_per_person: Number(picksPerPerson) || 1,
      closes_at: closesAt ? new Date(closesAt).toISOString() : null,
      intro_text: introText.trim() || null,
      allowed_email_domains: domainList.length ? domainList : null,
      collect_address: collectAddress,
      status,
    }
    let campId = campaign?.id
    if (isEdit) {
      const { error: uErr } = await supabase.from('redeem_campaigns').update(payload).eq('id', campId)
      if (uErr) { setSaving(false); setError(uErr.message); return }
      await supabase.from('redeem_campaign_items').delete().eq('campaign_id', campId)
    } else {
      const { data, error: cErr } = await supabase.from('redeem_campaigns').insert({ ...payload, company_id: company.id, slug, status: 'open' }).select('id').single()
      if (cErr) { setSaving(false); setError(/duplicate|unique/i.test(cErr.message) ? 'That link name is already taken — try another.' : cErr.message); return }
      campId = data.id
    }
    const rows = pickedIds.map((id, idx) => ({ campaign_id: campId, inventory_id: id, max_per_person: picked[id].max ? Number(picked[id].max) : null, allow_oversell: !!picked[id].preorder, sort_order: idx }))
    const { error: iErr } = await supabase.from('redeem_campaign_items').insert(rows)
    setSaving(false)
    if (iErr) { setError('Saved, but updating products failed: ' + iErr.message); return }
    onSaved?.(); onClose()
  }

  const exportCsv = () => {
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const header = ['Name', 'Email', 'Claimed', 'Status', 'Ship to', 'Items']
    const lines = claims.map((c) => [
      c.name || '', c.email || '', c.claimed_at ? formatDate(c.claimed_at) : '', c.status,
      [c.ship_to_name, c.ship_to_city].filter(Boolean).join(', '),
      (c._items || []).map((it) => `${it.qty}× ${invById[it.inventory_id]?.product_name || it.inventory_id}`).join('; '),
    ].map(esc).join(','))
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `redeem-${slug || 'claims'}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  const totalUnits = claims.reduce((s, c) => s + (c._items || []).reduce((t, it) => t + (it.qty || 0), 0), 0)
  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white sm:rounded-xl shadow-xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Ticket size={18} className="text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900 truncate">{isEdit ? (name || 'Redeem page') : 'New redeem page'}</h2>
            {isEdit && <StatusBadge status={status} />}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {isEdit && (
          <div className="px-6 pt-3 flex gap-1 border-b border-gray-100">
            {['settings', 'orders'].map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t === 'settings' ? 'Settings' : `Orders${claims.length ? ` · ${claims.length}` : ''}`}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {loading ? (
            <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
          ) : tab === 'orders' ? (
            claims.length === 0 ? (
              <div className="text-sm text-gray-400 py-8 text-center border border-dashed border-gray-200 rounded-lg">No claims yet.</div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500 inline-flex items-center gap-1.5"><Users size={13} />{claims.length} claim{claims.length === 1 ? '' : 's'} · {totalUnits} unit{totalUnits === 1 ? '' : 's'}</div>
                  <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"><Download size={13} />CSV</button>
                </div>
                <div className="space-y-2">
                  {claims.map((c) => (
                    <div key={c.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{c.name || c.email}</div>
                          <div className="text-xs text-gray-500 truncate">{c.email}{c.claimed_at ? ` · ${formatDate(c.claimed_at)}` : ''}</div>
                        </div>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {(c._items || []).map((it, idx) => (
                          <span key={idx} className="text-[11px] bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5 text-gray-700">{it.qty}× {invById[it.inventory_id]?.product_name || 'item'}</span>
                        ))}
                      </div>
                      {(c.ship_to_name || c.ship_to_city) && <div className="text-[11px] text-gray-400 mt-1">Ship to: {[c.ship_to_name, c.ship_to_city].filter(Boolean).join(', ')}</div>}
                    </div>
                  ))}
                </div>
              </>
            )
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer team kit" className={inp} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Link</label>
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-gray-400">…/?redeem=</span>
                  <input value={slug} disabled={isEdit} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)) }} className={`${inp} font-mono ${isEdit ? 'bg-gray-50 text-gray-500' : ''}`} />
                </div>
                {isEdit ? <p className="text-[11px] text-gray-400 mt-1">The link can’t change once it’s been shared.</p> : (slug && !slugValid && <p className="text-[11px] text-red-600 mt-1">3–61 chars, lowercase letters, numbers and dashes only.</p>)}
              </div>

              {isEdit && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className={inp}>
                    <option value="open">Open — link is live</option>
                    <option value="closed">Closed — link stops accepting claims</option>
                    <option value="draft">Draft — not public</option>
                  </select>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Products</label>
                  <span className="text-xs text-gray-400">{pickedIds.length} selected</span>
                </div>
                {inventory.length === 0 ? (
                  <div className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">No warehouse products yet.</div>
                ) : (
                  <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {inventory.map((i) => {
                      const on = !!picked[i.id]
                      const noStock = (i.available_qty ?? 0) <= 0
                      return (
                        <div key={i.id} className={`px-3 py-2 ${on ? 'bg-indigo-50/50' : ''}`}>
                          <div className="flex items-center gap-2">
                            <button onClick={() => toggle(i.id)} className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ring-1 ring-inset ${on ? 'bg-indigo-600 ring-indigo-600' : 'bg-white ring-gray-300'}`}>{on && <Check size={12} className="text-white" />}</button>
                            <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0"><Package size={14} className="text-gray-400" /></div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-gray-900 truncate">{i.product_name}{i.variant ? <span className="text-gray-400"> · {i.variant}</span> : ''}</div>
                              <div className="text-[11px] text-gray-400">{noStock ? 'Out of stock' : `${i.available_qty} in stock`}</div>
                            </div>
                            {on && <input type="number" min="1" value={picked[i.id].max} onChange={(e) => setField(i.id, 'max', e.target.value)} placeholder="max/pers" title="Max per person (optional)" className="w-20 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:outline-none focus:ring-2 focus:ring-indigo-500" />}
                          </div>
                          {on && (
                            <label className="flex items-center gap-1.5 text-[11px] text-gray-600 mt-1.5 ml-7">
                              <input type="checkbox" checked={!!picked[i.id].preorder} onChange={(e) => setField(i.id, 'preorder', e.target.checked)} />
                              Allow pre-order beyond stock (we produce the shortfall)
                            </label>
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
                  <input type="number" min="1" value={picksPerPerson} onChange={(e) => setPicksPerPerson(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Closes <span className="text-xs font-normal text-gray-400">(optional)</span></label>
                  <input type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={inp} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Restrict to email domains <span className="text-xs font-normal text-gray-400">(optional)</span></label>
                <input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="yourbrand.com, partner.com" className={inp} />
                <p className="text-[11px] text-gray-400 mt-1">Leave empty to let anyone with the link claim.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Intro text <span className="text-xs font-normal text-gray-400">(optional)</span></label>
                <textarea value={introText} onChange={(e) => setIntroText(e.target.value)} rows={2} placeholder="A short message shown at the top of the page." className={inp} />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={collectAddress} onChange={(e) => setCollectAddress(e.target.checked)} />
                Collect a delivery address from each person <span className="text-gray-400">(otherwise ships in bulk to you)</span>
              </label>

              {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
            </>
          )}
        </div>

        {tab === 'settings' && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
            <PrimaryButton onClick={save} disabled={!canSave || saving} className="!bg-indigo-600 hover:!bg-indigo-700">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Ticket size={15} />}{isEdit ? 'Save changes' : 'Publish redeem page'}
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  )
}
