// Team tab › Orders (26 Oct 2026): what a team member — or their whole department — ordered from
// the warehouse. Per request: date, status, destination, items, shipping and tracking; per product:
// totals (and allowance used / left for a warehouse-only member). Date filter + CSV export.
// For full-access users (they read all of the company's requests); warehouse-only members don't
// have the Team tab.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { X, Loader2, Package, Truck, Download } from 'lucide-react'
import { StatusBadge, formatDate, formatCents, SecondaryButton } from './ui'
import { loadAllowances } from '../lib/teamAccess'
import { toCsv, downloadCsv, csvDate, csvEur, fileSlug } from '../lib/csv'

const fullName = (c) => [c?.first_name, c?.last_name].filter(Boolean).join(' ') || c?.email || 'Team member'
const PERIODS = [['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months'], ['all', 'All time']]

export default function MemberOrdersModal({ company, member, team = [], onClose }) {
  const dept = (member.department || '').trim()
  const [scope, setScope] = useState('member') // 'member' | 'department'
  const [period, setPeriod] = useState('90')
  const [data, setData] = useState(null)
  const [allowances, setAllowances] = useState({})

  const people = useMemo(() => (scope === 'department' && dept
    ? team.filter((t) => (t.department || '').trim().toLowerCase() === dept.toLowerCase())
    : [member]), [scope, dept, team, member])
  const nameById = useMemo(() => Object.fromEntries(team.map((t) => [t.id, fullName(t)])), [team])

  useEffect(() => {
    let live = true
    setData(null)
    ;(async () => {
      let q = supabase.from('warehouse_requests')
        .select('id, created_at, status, request_type, requested_by_contact_id, ship_to_name, ship_to_city, ship_to_country, quoted_price_cents, return_requested, fulfilled_by_order_id, notes')
        .eq('company_id', company.id).in('requested_by_contact_id', people.map((p) => p.id))
        .order('created_at', { ascending: false })
      if (period !== 'all') q = q.gte('created_at', new Date(Date.now() - Number(period) * 86400000).toISOString())
      const { data: reqs } = await q
      const ids = (reqs || []).map((r) => r.id)
      const orderIds = (reqs || []).map((r) => r.fulfilled_by_order_id).filter(Boolean)
      const [{ data: items }, { data: orders }] = await Promise.all([
        ids.length ? supabase.from('warehouse_request_items').select('request_id, inventory_id, qty, warehouse_inventory:inventory_id(product_name, variant, sku)').in('request_id', ids) : { data: [] },
        orderIds.length ? supabase.from('warehouse_orders_client').select('id, status, carrier_name, tracking_number, tracking_url, ata').in('id', orderIds) : { data: [] },
      ])
      if (!live) return
      const itemsByReq = {}
      for (const it of items || []) (itemsByReq[it.request_id] = itemsByReq[it.request_id] || []).push(it)
      const orderById = Object.fromEntries((orders || []).map((o) => [o.id, o]))
      setData((reqs || []).map((r) => ({ ...r, items: itemsByReq[r.id] || [], order: orderById[r.fulfilled_by_order_id] || null })))
    })()
    return () => { live = false }
  }, [company.id, people, period])

  useEffect(() => {
    if (scope !== 'member' || member.portal_role !== 'warehouse') { setAllowances({}); return }
    loadAllowances(member.id).then(setAllowances).catch(() => setAllowances({}))
  }, [scope, member.id, member.portal_role])

  const active = (data || []).filter((r) => r.status !== 'cancelled')
  const byProduct = useMemo(() => {
    const m = {}
    for (const r of active) for (const it of r.items) {
      const k = it.inventory_id
      const p = (m[k] = m[k] || { id: k, name: it.warehouse_inventory?.product_name || 'Item', variant: it.warehouse_inventory?.variant, qty: 0, requests: 0 })
      p.qty += it.qty || 0; p.requests += 1
    }
    return Object.values(m).sort((a, b) => b.qty - a.qty)
  }, [active])
  const totalPieces = byProduct.reduce((s, p) => s + p.qty, 0)
  const shipping = active.reduce((s, r) => s + (r.quoted_price_cents || 0), 0)

  const exportCsv = () => {
    const rows = (data || []).flatMap((r) => (r.items.length ? r.items : [{}]).map((it) => ({ r, it })))
    const csv = toCsv([
      { header: 'Date', value: ({ r }) => csvDate(r.created_at) },
      { header: 'Ordered by', value: ({ r }) => nameById[r.requested_by_contact_id] || '' },
      { header: 'Status', value: ({ r }) => r.status },
      { header: 'Product', value: ({ it }) => it.warehouse_inventory?.product_name || '' },
      { header: 'Variant', value: ({ it }) => it.warehouse_inventory?.variant || '' },
      { header: 'SKU', value: ({ it }) => it.warehouse_inventory?.sku || '' },
      { header: 'Quantity', value: ({ it }) => it.qty ?? '' },
      { header: 'Ship to', value: ({ r }) => [r.ship_to_name, r.ship_to_city, r.ship_to_country].filter(Boolean).join(', ') },
      { header: 'Shipping (EUR)', value: ({ r, it }) => (it === r.items[0] || !r.items.length ? csvEur(r.quoted_price_cents) : '') },
      { header: 'Tracking', value: ({ r }) => r.order?.tracking_number || r.order?.tracking_url || '' },
    ], rows)
    downloadCsv(`${fileSlug(company.name)}-orders-${fileSlug(scope === 'department' ? dept : fullName(member))}.csv`, csv)
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-900 truncate">Orders · {scope === 'department' ? `${dept} department` : fullName(member)}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 pt-3 flex flex-wrap items-center gap-2">
          {dept && (
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-sm">
              {[['member', fullName(member).split(' ')[0]], ['department', `Whole ${dept}`]].map(([k, l]) => (
                <button key={k} onClick={() => setScope(k)} className={`px-2.5 py-1 rounded-md ${scope === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{l}</button>
              ))}
            </div>
          )}
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
            {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <div className="ml-auto">
            <SecondaryButton onClick={exportCsv} disabled={!data?.length}><Download size={14} />CSV</SecondaryButton>
          </div>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {data == null ? <div className="py-10 flex justify-center"><Loader2 size={20} className="animate-spin text-gray-400" /></div> : (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[['Requests', active.length], ['Pieces ordered', totalPieces], ['Shipping', formatCents(shipping)]].map(([l, v]) => (
                  <div key={l} className="rounded-xl border border-gray-200 px-3 py-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">{l}</p>
                    <p className="text-xl font-semibold text-gray-900">{v}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Per product</p>
                {byProduct.length === 0 ? <p className="text-sm text-gray-500">Nothing ordered in this period.</p> : (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {byProduct.map((p) => {
                      const a = allowances[p.id]
                      return (
                        <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <Package size={14} className="text-gray-300 flex-shrink-0" />
                          <span className="flex-1 min-w-0 truncate text-gray-900">{p.name}{p.variant ? <span className="text-gray-500"> · {p.variant}</span> : ''}</span>
                          <span className="text-xs text-gray-500">{p.requests} request{p.requests === 1 ? '' : 's'}</span>
                          <span className="w-14 text-right font-semibold text-gray-900">{p.qty}×</span>
                          {a?.allowance != null && <span className={`w-24 text-right text-xs ${a.left === 0 ? 'text-red-600' : 'text-gray-500'}`}>{a.left} of {a.allowance} left</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Requests</p>
                {data.length === 0 ? <p className="text-sm text-gray-500">No requests in this period.</p> : (
                  <div className="space-y-2">
                    {data.map((r) => (
                      <div key={r.id} className={`rounded-lg border border-gray-200 px-3 py-2.5 ${r.status === 'cancelled' ? 'opacity-60' : ''}`}>
                        <div className="flex items-center gap-2 flex-wrap text-sm">
                          <span className="font-medium text-gray-900">{formatDate(r.created_at)}</span>
                          <StatusBadge status={r.status} />
                          {scope === 'department' && <span className="text-xs text-gray-500">by {nameById[r.requested_by_contact_id] || '—'}</span>}
                          <span className="text-xs text-gray-500 truncate">→ {[r.ship_to_name, r.ship_to_city, r.ship_to_country].filter(Boolean).join(', ') || '—'}</span>
                          {r.quoted_price_cents != null && <span className="ml-auto text-xs text-gray-600">{formatCents(r.quoted_price_cents)} shipping</span>}
                        </div>
                        <p className="mt-1 text-sm text-gray-700">
                          {r.items.map((it, i) => <span key={i}>{i > 0 ? ' · ' : ''}<strong>{it.qty}×</strong> {it.warehouse_inventory?.product_name || 'Item'}{it.warehouse_inventory?.variant ? ` (${it.warehouse_inventory.variant})` : ''}</span>)}
                          {r.return_requested && <span className="text-xs text-gray-500"> · return pick-up</span>}
                        </p>
                        {r.order && (r.order.tracking_number || r.order.tracking_url) && (
                          <p className="mt-1 text-xs text-gray-500 flex items-center gap-1"><Truck size={11} />
                            {r.order.carrier_name ? `${r.order.carrier_name} · ` : ''}
                            {r.order.tracking_url
                              ? <a href={r.order.tracking_url.startsWith('http') ? r.order.tracking_url : `https://${r.order.tracking_url}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{r.order.tracking_number || 'Track'}</a>
                              : r.order.tracking_number}
                            {r.order.ata ? ` · delivered ${formatDate(r.order.ata)}` : ''}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
