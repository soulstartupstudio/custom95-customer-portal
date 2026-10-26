// Team tab › Department allowances (26 Oct 2026): "Events may order 100 hoodies in total". One
// pool per department and item: setting it shares the item with every warehouse-only member of
// that department, and all their orders count towards it (from the moment it's set). Shown as
// used / left per department; Edit to add items or top up. Enforced in the database
// (portal_department_allowance + the allowance trigger). First step of "Costs & budgets".
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Layers, Pencil, X, Search, Package, Loader2, Plus } from 'lucide-react'
import { Card, PrimaryButton, SecondaryButton } from './ui'

const key = (d) => (d || '').trim().toLowerCase()

function Bar({ used, cap }) {
  if (cap == null) return <span className="text-xs text-gray-500">{used} ordered · no limit</span>
  const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : 100
  const left = Math.max(cap - used, 0)
  return (
    <div className="flex items-center gap-2 min-w-[150px]">
      <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full ${left === 0 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs whitespace-nowrap ${left === 0 ? 'text-red-600 font-medium' : 'text-gray-600'}`}>{left} of {cap} left</span>
    </div>
  )
}

function EditDepartment({ company, department, current, onClose, onSaved }) {
  const [items, setItems] = useState(null)
  const [rows, setRows] = useState(() => Object.fromEntries(current.map((r) => [r.inventory_id, r.allowance_qty == null ? '' : String(r.allowance_qty)])))
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    supabase.from('warehouse_inventory_client').select('id, product_name, variant, sku, product_photo_url, available_qty')
      .eq('company_id', company.id).order('product_name').then(({ data }) => setItems(data || []))
  }, [company.id])
  const usedById = Object.fromEntries(current.map((r) => [r.inventory_id, r.used_qty]))
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? (items || []).filter((i) => [i.product_name, i.variant, i.sku].some((v) => v?.toLowerCase().includes(q))) : (items || [])
  }, [items, search])
  const toggle = (id) => setRows((m) => { const n = { ...m }; if (id in n) delete n[id]; else n[id] = ''; return n })

  const save = async () => {
    setBusy(true); setError(null)
    try {
      const removed = current.filter((r) => !(r.inventory_id in rows)).map((r) => r.id)
      if (removed.length) {
        const { error: e } = await supabase.from('portal_department_allowance').delete().in('id', removed)
        if (e) throw e
      }
      const upserts = Object.entries(rows).map(([id, v]) => ({ company_id: company.id, department: key(department), inventory_id: id, allowance_qty: v === '' ? null : Number(v) }))
      if (upserts.length) {
        const { error: e } = await supabase.from('portal_department_allowance').upsert(upserts, { onConflict: 'company_id,department,inventory_id' })
        if (e) throw e
      }
      onSaved()
    } catch (e) { setError(e.message || String(e)) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Department allowance · {department}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <p className="text-sm text-gray-600">
            Tick the items <strong>{department}</strong> may order and how many in total, for the whole department.
            Every warehouse-only member of {department} can order them from this one pool. Leave the number empty for no limit; raise it any time to top up.
          </p>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stock" className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
          </div>
          {items == null ? <div className="py-8 flex justify-center"><Loader2 size={18} className="animate-spin text-gray-400" /></div> : (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {filtered.map((i) => {
                const on = i.id in rows
                return (
                  <div key={i.id} className={`flex items-center gap-3 px-3 py-2 ${on ? 'bg-indigo-50/40' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(i.id)} className="rounded" />
                    <div className="w-9 h-9 rounded bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {i.product_photo_url ? <img src={i.product_photo_url} alt="" className="w-full h-full object-cover" /> : <Package size={15} className="text-gray-300" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900 truncate">{i.product_name}{i.variant ? <span className="text-gray-500"> · {i.variant}</span> : ''}</p>
                      <p className="text-[11px] text-gray-400">{i.available_qty ?? 0} in stock{usedById[i.id] ? ` · ${usedById[i.id]} ordered by ${department}` : ''}</p>
                    </div>
                    {on && (
                      <input value={rows[i.id]} onChange={(e) => setRows((m) => ({ ...m, [i.id]: e.target.value.replace(/[^0-9]/g, '') }))}
                        placeholder="No limit" inputMode="numeric" className="w-24 px-2 py-1 border border-gray-200 rounded text-sm text-right" />
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save allowance'}</PrimaryButton>
        </div>
      </div>
    </div>
  )
}

export default function DepartmentAllowances({ company, team }) {
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null)   // department name
  const [newDept, setNewDept] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    supabase.rpc('portal_department_allowances').then(({ data }) => setRows(data || []))
  }, [refresh])

  // Departments from the team (display spelling) + any that only have an allowance.
  const departments = useMemo(() => {
    const m = new Map()
    for (const t of team) if (t.department?.trim()) m.set(key(t.department), t.department.trim())
    for (const r of rows || []) if (!m.has(r.department)) m.set(r.department, r.department)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [team, rows])
  const membersOf = (k) => team.filter((t) => key(t.department) === k)

  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0"><Layers size={20} /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">Department allowances</h3>
          <p className="text-sm text-gray-600 mt-1">One pool per department, e.g. <em>Events may order 100 hoodies in total</em>. Everyone in the department orders from it; you see what’s used and left.</p>

          {rows == null ? <div className="py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div> : (
            <div className="mt-3 space-y-3">
              {departments.length === 0 && <p className="text-sm text-gray-500">No departments yet — give team members a department (Edit on their card), or add one below.</p>}
              {departments.map(([k, label]) => {
                const items = (rows || []).filter((r) => r.department === k)
                const members = membersOf(k)
                return (
                  <div key={k} className="rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                      <span className="text-sm font-semibold text-gray-900">{label}</span>
                      <span className="text-xs text-gray-500">· {members.length} member{members.length === 1 ? '' : 's'}{members.length ? `: ${members.map((m) => m.first_name).filter(Boolean).join(', ')}` : ''}</span>
                      <button onClick={() => setEditing(label)} className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"><Pencil size={12} />{items.length ? 'Edit' : 'Set allowance'}</button>
                    </div>
                    {items.length === 0 ? <p className="px-3 py-2 text-xs text-gray-400">No department allowance yet.</p> : (
                      <div className="divide-y divide-gray-100">
                        {items.map((r) => (
                          <div key={r.id} className="flex items-center gap-3 px-3 py-1.5">
                            <span className="flex-1 min-w-0 truncate text-sm text-gray-800">{r.product_name}{r.variant ? <span className="text-gray-500"> · {r.variant}</span> : ''}</span>
                            <Bar used={r.used_qty} cap={r.allowance_qty} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="flex items-center gap-2">
                <input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="New department (e.g. Events)" className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-56" />
                <button onClick={() => { if (newDept.trim()) { setEditing(newDept.trim()); setNewDept('') } }} disabled={!newDept.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"><Plus size={14} />Add allowance</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {editing && (
        <EditDepartment company={company} department={editing} current={(rows || []).filter((r) => r.department === key(editing))}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setRefresh((n) => n + 1) }} />
      )}
    </Card>
  )
}
