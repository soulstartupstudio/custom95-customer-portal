// Team access (26 Oct 2026): what one team member can do in the portal. Full access (everything)
// or Warehouse only — then pick which warehouse items they may order and, per item, an optional
// total allowance ("up to 50"). Used so far is shown next to it; raise the allowance to top up.
// The database enforces all of this (portal_set_member_access, portal_item_access, allowance trigger).
// "Copy items from…" takes a colleague's items + allowances (same department listed first), so a
// department doesn't have to be set up person by person.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Search, Package, Loader2 } from 'lucide-react'
import { PrimaryButton, SecondaryButton } from './ui'
import { loadAllowances } from '../lib/teamAccess'

export default function TeamAccessModal({ company, member, team = [], onClose, onSaved }) {
  const name = [member.first_name, member.last_name].filter(Boolean).join(' ') || member.email
  const [role, setRole] = useState(member.portal_role === 'warehouse' ? 'warehouse' : 'admin')
  const [items, setItems] = useState(null)
  const [shared, setShared] = useState({})   // inventory_id → { on: bool, allowance: '' | number-string, used }
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copying, setCopying] = useState(false)
  const dept = (member.department || '').trim().toLowerCase()
  const mates = team.filter((t) => t.portal_role === 'warehouse' && t.id !== member.id)
    .sort((a, b) => Number((b.department || '').trim().toLowerCase() === dept) - Number((a.department || '').trim().toLowerCase() === dept))
  const copyFrom = async (fromId) => {
    if (!fromId) return
    setCopying(true); setError(null)
    const { data, error: e } = await supabase.from('portal_item_access').select('inventory_id, allowance_qty').eq('contact_id', fromId)
    setCopying(false)
    if (e) { setError(e.message); return }
    setShared((m) => {
      const next = { ...m }
      for (const r of data || []) next[r.inventory_id] = { used: 0, ...next[r.inventory_id], on: true, allowance: r.allowance_qty == null ? '' : String(r.allowance_qty) }
      return next
    })
  }

  useEffect(() => {
    let live = true
    ;(async () => {
      const [{ data: inv }, usage] = await Promise.all([
        supabase.from('warehouse_inventory_client').select('id, product_name, variant, sku, product_photo_url, available_qty')
          .eq('company_id', company.id).order('product_name'),
        loadAllowances(member.id).catch(() => ({})),
      ])
      if (!live) return
      setItems(inv || [])
      // Personal items only — department allowances are set per department on the Team tab.
      setShared(Object.fromEntries(Object.entries(usage).filter(([, a]) => a.personal).map(([id, a]) => [id, { on: true, allowance: a.allowance == null ? '' : String(a.allowance), used: a.used }])))
    })()
    return () => { live = false }
  }, [company.id, member.id])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = items || []
    return q ? list.filter((i) => [i.product_name, i.variant, i.sku].some((v) => v?.toLowerCase().includes(q))) : list
  }, [items, search])
  const sharedCount = Object.values(shared).filter((s) => s.on).length

  const toggle = (id) => setShared((m) => ({ ...m, [id]: { allowance: '', used: 0, ...m[id], on: !m[id]?.on } }))
  const setAllowance = (id, v) => setShared((m) => ({ ...m, [id]: { ...m[id], on: true, allowance: v.replace(/[^0-9]/g, '') } }))

  const save = async () => {
    setBusy(true); setError(null)
    try {
      if (role !== (member.portal_role === 'warehouse' ? 'warehouse' : 'admin')) {
        const { error: e } = await supabase.rpc('portal_set_member_access', { p_contact_id: member.id, p_role: role })
        if (e) throw e
      }
      if (role === 'warehouse') {
        const on = Object.entries(shared).filter(([, s]) => s.on)
        const off = Object.entries(shared).filter(([, s]) => !s.on).map(([id]) => id)
        if (off.length) {
          const { error: e } = await supabase.from('portal_item_access').delete().eq('contact_id', member.id).in('inventory_id', off)
          if (e) throw e
        }
        if (on.length) {
          const rows = on.map(([id, s]) => ({ contact_id: member.id, inventory_id: id, allowance_qty: s.allowance === '' ? null : Number(s.allowance), updated_at: new Date().toISOString() }))
          const { error: e } = await supabase.from('portal_item_access').upsert(rows, { onConflict: 'contact_id,inventory_id' })
          if (e) throw e
        }
      } else {
        await supabase.from('portal_item_access').delete().eq('contact_id', member.id)
      }
      onSaved?.()
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Access · {name}{member.department ? <span className="font-normal text-gray-500"> · {member.department}</span> : ''}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {[['admin', 'Full access', 'Everything in the portal: projects, quotes, designs, invoices, warehouse, team.'],
              ['warehouse', 'Warehouse only', 'Only the items you share below: see stock, request shipments and returns. Nothing else.']].map(([k, label, hint]) => (
              <button key={k} type="button" onClick={() => setRole(k)}
                className={`text-left rounded-lg border px-3 py-2.5 ${role === k ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <span className="block text-sm font-semibold text-gray-900">{label}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>
              </button>
            ))}
          </div>

          {role === 'warehouse' && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-sm font-medium text-gray-900">Items {name.split(' ')[0]} may order <span className="font-normal text-gray-500">· {sharedCount} shared</span></p>
                <div className="relative">
                  <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stock" className="pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm w-44" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-2">Allowance = how many they may order in total. Leave empty for no limit; raise it any time to top up.</p>
              {mates.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <select defaultValue="" onChange={(e) => { copyFrom(e.target.value); e.target.value = '' }} disabled={copying}
                    className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
                    <option value="">Copy items from…</option>
                    {mates.map((t) => <option key={t.id} value={t.id}>{[t.first_name, t.last_name].filter(Boolean).join(' ')}{t.department ? ` · ${t.department}` : ''}</option>)}
                  </select>
                  {copying && <Loader2 size={14} className="animate-spin text-gray-400" />}
                  <span className="text-[11px] text-gray-400">adds their items and allowances here — check, then Save</span>
                </div>
              )}
              {items == null ? <div className="py-8 flex justify-center"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
                : items.length === 0 ? <p className="text-sm text-gray-500 py-4">No warehouse stock yet.</p> : (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {filtered.map((i) => {
                      const s = shared[i.id]
                      const allowance = s?.allowance === '' || s?.allowance == null ? null : Number(s.allowance)
                      return (
                        <div key={i.id} className={`flex items-center gap-3 px-3 py-2 ${s?.on ? 'bg-blue-50/40' : ''}`}>
                          <input type="checkbox" checked={!!s?.on} onChange={() => toggle(i.id)} className="rounded" />
                          <div className="w-9 h-9 rounded bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {i.product_photo_url ? <img src={i.product_photo_url} alt="" className="w-full h-full object-cover" /> : <Package size={15} className="text-gray-300" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-900 truncate">{i.product_name}{i.variant ? <span className="text-gray-500"> · {i.variant}</span> : ''}</p>
                            <p className="text-[11px] text-gray-400">{i.available_qty ?? 0} in stock{s?.used ? ` · ${s.used} ordered by ${name.split(' ')[0]}` : ''}</p>
                          </div>
                          {s?.on && (
                            <div className="text-right">
                              <input value={s.allowance} onChange={(e) => setAllowance(i.id, e.target.value)} placeholder="No limit" inputMode="numeric"
                                className="w-20 px-2 py-1 border border-gray-200 rounded text-sm text-right" />
                              {allowance != null && <p className={`text-[10px] ${allowance - (s.used || 0) <= 0 ? 'text-red-600' : 'text-gray-400'}`}>{Math.max(allowance - (s.used || 0), 0)} left</p>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save access'}</PrimaryButton>
        </div>
      </div>
    </div>
  )
}
