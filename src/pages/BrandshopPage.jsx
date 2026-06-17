import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  Store, ExternalLink, Package, Users as UsersIcon, ShoppingBag, TrendingUp,
  Download, Plus, Mail, X, Check, Trash2, AlertCircle, RefreshCw, FileText, Search,
} from 'lucide-react'
import {
  PageHeader, EmptyState, Spinner, Badge, formatCents, formatDate, PrimaryButton, SecondaryButton,
} from '../components/ui'

// ---------- Edge function helper ----------
async function invokeShopify(body) {
  const { data, error } = await supabase.functions.invoke('shopify-sync', { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

// ---------- CSV helpers ----------
function toCsv(rows, columns) {
  const escape = (v) => {
    if (v == null) return ''
    const s = String(v).replace(/"/g, '""')
    return /[",\n]/.test(s) ? `"${s}"` : s
  }
  const header = columns.map((c) => escape(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => escape(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(',')).join('\n')
  return header + '\n' + body
}
function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------- Customer approval (tag-based access) ----------
// A customer counts as "approved" when their Shopify tags contain this tag.
// No tag → "pending". Approve adds it, Revoke removes only it (other tags kept).
const APPROVAL_TAG = 'approved'

// Only this portal contact may manage customer approval, and only on a brandshop
// that has customer_approval_enabled. Identifies Tom Toepoel uniquely by email.
// To switch to role-based gating, compare contact.portal_role instead.
const APPROVAL_MANAGER_EMAIL = 'tom@drinkstelz.com'

function canManageApproval(shop, contact) {
  return (
    !!shop?.customer_approval_enabled &&
    (contact?.email || '').trim().toLowerCase() === APPROVAL_MANAGER_EMAIL
  )
}

function parseTags(tags) {
  return String(tags || '').split(',').map((t) => t.trim()).filter(Boolean)
}
function hasTag(tags, tag) {
  const needle = tag.toLowerCase()
  return parseTags(tags).some((t) => t.toLowerCase() === needle)
}
function addTag(tags, tag) {
  const list = parseTags(tags)
  if (!list.some((t) => t.toLowerCase() === tag.toLowerCase())) list.push(tag)
  return list.join(', ')
}
function removeTag(tags, tag) {
  const needle = tag.toLowerCase()
  return parseTags(tags).filter((t) => t.toLowerCase() !== needle).join(', ')
}

function StatPill({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium inline-flex items-center gap-2 transition-colors ${
        active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label}
      <span className={`text-xs px-1.5 rounded-full ${active ? 'bg-white/20' : 'bg-white'}`}>{count}</span>
    </button>
  )
}

// ---------- Shop picker (if multiple) ----------
function ShopList({ shops, onSelect }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {shops.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s)}
          className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-semibold text-gray-900 truncate">{s.shop_name || s.shop_domain}</div>
              <div className="text-xs text-gray-500 truncate">{s.shop_domain}</div>
            </div>
            <Badge tone={s.connection_status === 'connected' ? 'green' : 'yellow'}>{s.connection_status || 'unknown'}</Badge>
          </div>
          <div className="mt-3 flex gap-6 text-sm">
            <div><div className="text-xs text-gray-500">Orders</div><div className="font-semibold text-gray-900">{s.total_orders_count ?? 0}</div></div>
            <div><div className="text-xs text-gray-500">Revenue</div><div className="font-semibold text-gray-900">{formatCents(s.total_revenue_cents)}</div></div>
          </div>
        </button>
      ))}
    </div>
  )
}

// ---------- KPI card ----------
function StatCard({ icon: Icon, label, value, tone = 'blue' }) {
  const tones = {
    blue: 'text-blue-600 bg-blue-50',
    purple: 'text-purple-600 bg-purple-50',
    green: 'text-green-600 bg-green-50',
    amber: 'text-amber-600 bg-amber-50',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${tones[tone]}`}><Icon size={16} /></div>
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold text-gray-900 mt-0.5">{value}</div>
    </div>
  )
}

// ---------- Connection banner ----------
function ConnectionBanner({ shop }) {
  const connected = shop.connection_status === 'connected'
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${connected ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${connected ? 'bg-green-500' : 'bg-amber-500'} text-white`}>
        {connected ? <Check size={14} /> : <AlertCircle size={14} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900">{connected ? 'Connected' : 'Connection issue'}</div>
        <div className="text-xs text-gray-600 mt-0.5 flex items-center flex-wrap gap-x-2">
          {shop.connected_at && <span>Connected {formatDate(shop.connected_at)}</span>}
          {shop.plan_name && <span>· Plan: {shop.plan_name}</span>}
          {shop.last_sync_at && <span>· Last sync: {formatDate(shop.last_sync_at)}</span>}
        </div>
        {shop.connection_error && <div className="text-xs text-red-700 mt-1">{shop.connection_error}</div>}
      </div>
    </div>
  )
}

// ---------- Customer modal ----------
function CustomerModal({ shop, contact, mode, existing, onClose, onSaved }) {
  const [form, setForm] = useState({
    email: existing?.email || '',
    first_name: existing?.first_name || '',
    last_name: existing?.last_name || '',
    phone: existing?.phone || '',
    company: existing?.company || '',
    tags: existing?.tags || '',
    accepts_marketing: !!existing?.accepts_marketing,
    note: '',
    send_invite: false,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const isEdit = mode === 'edit'

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      await invokeShopify({
        action: isEdit ? 'update_customer' : 'create_customer',
        brandshop_id: shop.id,
        ...(isEdit ? { shopify_customer_id: existing.shopify_customer_id } : {}),
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone || null,
        company: form.company || null,
        tags: form.tags || null,
        accepts_marketing: form.accepts_marketing,
        note: form.note || null,
        ...(isEdit ? {} : { send_invite: form.send_invite }),
      })
      onSaved()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{isEdit ? 'Edit customer' : 'New customer'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" placeholder="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <input type="email" placeholder="Email *" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="grid grid-cols-2 gap-2">
            <input type="tel" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <input type="text" placeholder="Tags (comma-separated)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <textarea placeholder="Internal note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <label className="inline-flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={form.accepts_marketing} onChange={(e) => setForm({ ...form, accepts_marketing: e.target.checked })} className="accent-blue-600" />
            Accepts marketing
          </label>
          {!isEdit && (
            <label className="inline-flex items-center gap-2 text-xs text-gray-700 ml-4">
              <input type="checkbox" checked={form.send_invite} onChange={(e) => setForm({ ...form, send_invite: e.target.checked })} className="accent-blue-600" />
              Send Shopify invite email
            </label>
          )}
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={busy || !form.email}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create customer'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

// ---------- Credit modal ----------
function CreditModal({ shop, customer, onClose, onSaved }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [notifyCustomer, setNotifyCustomer] = useState(true)
  const [transactions, setTransactions] = useState([])
  const [balance, setBalance] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const loadCredits = async () => {
    if (!customer.shopify_customer_id) return
    try {
      const data = await invokeShopify({ action: 'list_store_credits', brandshop_id: shop.id, shopify_customer_id: customer.shopify_customer_id })
      setTransactions(data?.transactions ?? [])
      setBalance(data?.balance_cents ?? null)
    } catch { /* ignore — show no balance */ }
  }
  useEffect(() => { loadCredits() }, [customer.id])

  const submit = async () => {
    const n = parseFloat(amount)
    if (!Number.isFinite(n) || n === 0) { setError('Enter a non-zero amount.'); return }
    setBusy(true); setError(null)
    try {
      await invokeShopify({
        action: 'add_store_credit',
        brandshop_id: shop.id,
        shopify_customer_id: customer.shopify_customer_id,
        amount_cents: Math.round(n * 100),
        reason: reason || null,
        currency: shop.currency || 'EUR',
        notify_customer: !!notifyCustomer,
      })
      setAmount(''); setReason('')
      await loadCredits()
      onSaved()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="text-xs text-gray-500">Store credit</div>
            <h3 className="text-base font-semibold text-gray-900">{customer.first_name} {customer.last_name}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {balance != null && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
              <div className="text-xs text-blue-900 uppercase tracking-wide">Current balance</div>
              <div className="text-2xl font-bold text-blue-900">{formatCents(balance)}</div>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-700">Add or deduct credit</div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Use negative to deduct"
                  className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <label className="inline-flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} className="accent-blue-600" />
              Notify customer by email
            </label>
            <p className="text-[10px] text-gray-500">Requires Shopify Plus or compatible plan. The email is sent under your shop's name ({shop.shop_name || shop.shop_domain}); replies go to {shop.owner_email || 'your shop'}.</p>
            {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
            <PrimaryButton onClick={submit} disabled={busy} className="w-full justify-center">
              {busy ? 'Processing…' : 'Apply'}
            </PrimaryButton>
          </div>

          {transactions.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-2">Recent transactions</div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {transactions.map((t, i) => (
                  <div key={t.id || i} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded">
                    <div>
                      <div className="text-gray-900">{t.reason || t.origin || 'Adjustment'}</div>
                      <div className="text-gray-400">{formatDate(t.created_at || t.shopify_created_at)}</div>
                    </div>
                    <div className={`font-semibold ${t.amount_cents > 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {t.amount_cents > 0 ? '+' : ''}{formatCents(t.amount_cents)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- Voucher modal ----------
function VoucherModal({ shop, customers, onClose, onSaved }) {
  const [form, setForm] = useState({
    code: '',
    value_type: 'percentage',
    value: '',
    usage_limit: '',
    ends_at: '',
    customer_email: '',
    customer_shopify_id: '',
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    if (!form.code.trim() || !form.value) { setError('Code and value are required.'); return }
    setBusy(true); setError(null)
    try {
      await invokeShopify({
        action: 'create_discount',
        brandshop_id: shop.id,
        code: form.code.toUpperCase().trim(),
        value_type: form.value_type,
        value: parseFloat(form.value),
        usage_limit: form.usage_limit ? parseInt(form.usage_limit, 10) : null,
        ends_at: form.ends_at || null,
        customer_shopify_id: form.customer_shopify_id ? Number(form.customer_shopify_id) : null,
        customer_email: form.customer_email || null,
        notes: form.notes || null,
      })
      onSaved()
    } catch (e) { setError(e.message); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Create voucher</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <input
            type="text"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="Code (e.g. SUMMER20)"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.value_type}
              onChange={(e) => setForm({ ...form, value_type: e.target.value })}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="percentage">Percentage (%)</option>
              <option value="fixed_amount">Fixed amount (€)</option>
            </select>
            <input
              type="number"
              step="0.01"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              placeholder={form.value_type === 'percentage' ? 'e.g. 15' : 'e.g. 10.00'}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={form.usage_limit}
              onChange={(e) => setForm({ ...form, usage_limit: e.target.value })}
              placeholder="Usage limit (optional)"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {customers.length > 0 && (
            <select
              value={form.customer_shopify_id}
              onChange={(e) => {
                const c = customers.find((x) => String(x.shopify_customer_id) === e.target.value)
                setForm({ ...form, customer_shopify_id: e.target.value, customer_email: c?.email || '' })
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Available to all customers</option>
              {customers.filter((c) => c.shopify_customer_id).map((c) => (
                <option key={c.id} value={c.shopify_customer_id}>
                  {c.first_name} {c.last_name} ({c.email})
                </option>
              ))}
            </select>
          )}
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notes (optional, internal)"
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={busy || !form.code || !form.value}>
            {busy ? 'Creating…' : 'Create voucher'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

// ---------- The big detail view ----------
function BrandshopDetail({ shop, company, contact, onBack, hasMultiple }) {
  const [tab, setTab] = useState('orders')
  const [orders, setOrders] = useState([])
  const [orderItems, setOrderItems] = useState([]) // flat list for SKUs CSV
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [variants, setVariants] = useState([])
  const [discounts, setDiscounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [customerModal, setCustomerModal] = useState(null) // { mode, existing? }
  const [creditModal, setCreditModal] = useState(null) // customer
  const [voucherModal, setVoucherModal] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [oRes, cRes, pRes, dRes] = await Promise.all([
        supabase.from('brandshop_orders').select('*').eq('brandshop_id', shop.id).order('shopify_created_at', { ascending: false }).limit(500),
        supabase.from('brandshop_customers').select('*').eq('brandshop_id', shop.id).order('shopify_created_at', { ascending: false }).limit(500),
        supabase.from('brandshop_products').select('*').eq('brandshop_id', shop.id).order('title').limit(500),
        supabase.from('brandshop_discount_codes').select('*').eq('brandshop_id', shop.id).order('created_at', { ascending: false }).limit(200),
      ])
      if (cancelled) return
      setOrders(oRes.data ?? [])
      setCustomers(cRes.data ?? [])
      setProducts(pRes.data ?? [])
      setDiscounts(dRes.data ?? [])

      const productIds = (pRes.data ?? []).map((p) => p.id)
      if (productIds.length) {
        const { data: vs } = await supabase.from('brandshop_product_variants').select('*').in('brandshop_product_id', productIds)
        if (!cancelled) setVariants(vs ?? [])
      } else {
        setVariants([])
      }

      const orderIds = (oRes.data ?? []).map((o) => o.id)
      if (orderIds.length) {
        const { data: ois } = await supabase.from('brandshop_order_items').select('*').in('brandshop_order_id', orderIds)
        if (!cancelled) setOrderItems(ois ?? [])
      } else {
        setOrderItems([])
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [shop.id, refresh])

  const variantsByProduct = useMemo(() => {
    const m = {}
    for (const v of variants) (m[v.brandshop_product_id] = m[v.brandshop_product_id] || []).push(v)
    return m
  }, [variants])

  const itemsByOrder = useMemo(() => {
    const m = {}
    for (const i of orderItems) (m[i.brandshop_order_id] = m[i.brandshop_order_id] || []).push(i)
    return m
  }, [orderItems])

  const skusSold = new Set(orderItems.map((i) => i.sku).filter(Boolean)).size

  // Approve/revoke storefront access by toggling the approval tag in Shopify.
  // Optimistic: flip the local row immediately, revert if the call fails.
  const toggleAccess = async (c, nextApproved) => {
    const newTags = nextApproved ? addTag(c.tags, APPROVAL_TAG) : removeTag(c.tags, APPROVAL_TAG)
    setCustomers((prev) => prev.map((x) => (x.id === c.id ? { ...x, tags: newTags } : x)))
    try {
      await invokeShopify({
        action: 'update_customer',
        brandshop_id: shop.id,
        shopify_customer_id: c.shopify_customer_id,
        email: c.email,
        first_name: c.first_name,
        last_name: c.last_name,
        phone: c.phone || null,
        company: c.company || null,
        tags: newTags || null,
        accepts_marketing: !!c.accepts_marketing,
      })
    } catch (e) {
      setCustomers((prev) => prev.map((x) => (x.id === c.id ? { ...x, tags: c.tags } : x)))
      alert(e.message)
      throw e
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          {hasMultiple && (
            <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-700 mb-1">← Back to brandshops</button>
          )}
          <h1 className="text-2xl font-semibold text-gray-900">{shop.shop_name || shop.shop_domain}</h1>
          <a href={`https://${shop.shop_domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
            {shop.shop_domain}<ExternalLink size={11} />
          </a>
        </div>
      </div>

      <ConnectionBanner shop={shop} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={ShoppingBag} label="Orders" value={orders.length} tone="blue" />
        <StatCard icon={UsersIcon} label="Customers" value={customers.length} tone="purple" />
        <StatCard icon={Package} label="SKUs sold" value={skusSold} tone="amber" />
        <StatCard icon={TrendingUp} label="Revenue" value={formatCents(shop.total_revenue_cents)} tone="green" />
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {[
          { id: 'orders', label: 'Orders', icon: ShoppingBag },
          { id: 'customers', label: 'Customers', icon: UsersIcon },
          { id: 'products', label: 'Products', icon: Package },
          { id: 'vouchers', label: 'Vouchers', icon: FileText },
          { id: 'reports', label: 'Reports', icon: Download },
        ].map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-2 transition-colors ${
                tab === t.id ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              <Icon size={14} />{t.label}
            </button>
          )
        })}
      </div>

      {loading ? <Spinner /> : (
        <>
          {tab === 'orders' && <OrdersTab orders={orders} itemsByOrder={itemsByOrder} />}
          {tab === 'customers' && (
            <CustomersTab
              customers={customers}
              approvalEnabled={canManageApproval(shop, contact)}
              onToggleAccess={toggleAccess}
              onAdd={() => setCustomerModal({ mode: 'new' })}
              onEdit={(c) => setCustomerModal({ mode: 'edit', existing: c })}
              onCredit={(c) => setCreditModal(c)}
              onDelete={async (c) => {
                if (!confirm(`Delete customer "${c.email || c.first_name}"? This removes them from Shopify too.`)) return
                try {
                  await invokeShopify({ action: 'delete_customer', brandshop_id: shop.id, shopify_customer_id: c.shopify_customer_id })
                  setRefresh((r) => r + 1)
                } catch (e) { alert(e.message) }
              }}
            />
          )}
          {tab === 'products' && <ProductsTab products={products} variantsByProduct={variantsByProduct} />}
          {tab === 'vouchers' && (
            <VouchersTab
              discounts={discounts}
              onCreate={() => setVoucherModal(true)}
              onDelete={async (d) => {
                if (!confirm(`Delete voucher "${d.code}"? This removes it from Shopify too.`)) return
                try {
                  await invokeShopify({ action: 'delete_discount', brandshop_id: shop.id, id: d.id })
                  setRefresh((r) => r + 1)
                } catch (e) { alert(e.message) }
              }}
            />
          )}
          {tab === 'reports' && (
            <ReportsTab
              orders={orders}
              customers={customers}
              orderItems={orderItems}
              variantsByProduct={variantsByProduct}
              products={products}
            />
          )}
        </>
      )}

      {customerModal && (
        <CustomerModal
          shop={shop}
          contact={contact}
          mode={customerModal.mode}
          existing={customerModal.existing}
          onClose={() => setCustomerModal(null)}
          onSaved={() => { setCustomerModal(null); setRefresh((r) => r + 1) }}
        />
      )}
      {creditModal && (
        <CreditModal
          shop={shop}
          customer={creditModal}
          onClose={() => setCreditModal(null)}
          onSaved={() => setRefresh((r) => r + 1)}
        />
      )}
      {voucherModal && (
        <VoucherModal
          shop={shop}
          customers={customers}
          onClose={() => setVoucherModal(false)}
          onSaved={() => { setVoucherModal(false); setRefresh((r) => r + 1) }}
        />
      )}
    </div>
  )
}

// ---------- Tabs ----------
function OrdersTab({ orders, itemsByOrder }) {
  const [expanded, setExpanded] = useState(null)
  if (orders.length === 0) return <EmptyState icon={ShoppingBag} title="No orders yet" description="Orders will appear here as customers buy from your shop." />
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Order</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Customer</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Items</th>
            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Payment</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fulfilment</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Warehouse</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const items = itemsByOrder[o.id] ?? []
            const open = expanded === o.id
            return (
              <>
                <tr key={o.id} onClick={() => setExpanded(open ? null : o.id)} className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-blue-50/30">
                  <td className="px-5 py-3 text-gray-900 font-medium">{o.order_name || `#${o.shopify_order_number}`}</td>
                  <td className="px-5 py-3">
                    <div className="text-gray-900">{o.customer_name || '—'}</div>
                    {o.customer_email && <div className="text-xs text-gray-500">{o.customer_email}</div>}
                  </td>
                  <td className="px-5 py-3 text-gray-700">{items.reduce((s, i) => s + (i.quantity || 0), 0)}</td>
                  <td className="px-5 py-3 text-right text-gray-900 font-medium">{formatCents(o.total_cents)}</td>
                  <td className="px-5 py-3"><Badge tone={o.financial_status === 'paid' ? 'green' : o.financial_status === 'refunded' ? 'red' : 'yellow'}>{o.financial_status || '—'}</Badge></td>
                  <td className="px-5 py-3"><Badge tone={o.fulfillment_status === 'fulfilled' ? 'green' : 'gray'}>{o.fulfillment_status || 'unfulfilled'}</Badge></td>
                  <td className="px-5 py-3">{o.warehouse_deducted ? <Badge tone="green">✓ Deducted</Badge> : <span className="text-xs text-gray-400">—</span>}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{formatDate(o.shopify_created_at)}</td>
                </tr>
                {open && items.length > 0 && (
                  <tr className="bg-gray-50/50">
                    <td colSpan={8} className="px-5 py-3">
                      <div className="space-y-1">
                        {items.map((i) => (
                          <div key={i.id} className="flex items-center justify-between text-xs">
                            <div className="text-gray-700">
                              <span className="font-medium">{i.product_name}</span>
                              {i.variant_name && <span className="text-gray-500"> · {i.variant_name}</span>}
                              {i.sku && <span className="text-gray-400 ml-2 font-mono">{i.sku}</span>}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-gray-700">× {i.quantity}</span>
                              <span className="text-gray-900 font-medium">{formatCents(i.total_price_cents)}</span>
                              {i.warehouse_deducted && <Badge tone="green">deducted</Badge>}
                            </div>
                          </div>
                        ))}
                        {(o.ship_address1 || o.ship_city) && (
                          <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-200">
                            Ship to: {[o.ship_name, o.ship_address1, o.ship_address2, o.ship_postal, o.ship_city, o.ship_country].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CustomersTab({ customers, approvalEnabled, onToggleAccess, onAdd, onEdit, onCredit, onDelete }) {
  const [filter, setFilter] = useState('all')   // all | pending | approved
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState(null)

  const isApproved = (c) => hasTag(c.tags, APPROVAL_TAG)

  const counts = {
    all: customers.length,
    pending: customers.filter((c) => !isApproved(c)).length,
    approved: customers.filter((c) => isApproved(c)).length,
  }

  const q = query.trim().toLowerCase()
  const visible = customers.filter((c) => {
    if (approvalEnabled) {
      if (filter === 'pending' && isApproved(c)) return false
      if (filter === 'approved' && !isApproved(c)) return false
    }
    if (!q) return true
    return [c.first_name, c.last_name, c.company, c.email].filter(Boolean).join(' ').toLowerCase().includes(q)
  })

  const handleToggle = async (c) => {
    setBusyId(c.id)
    try { await onToggleAccess(c, !isApproved(c)) }
    catch { /* error surfaced by handler */ }
    finally { setBusyId(null) }
  }

  const colCount = approvalEnabled ? 11 : 9

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-gray-600">{customers.length} customer{customers.length === 1 ? '' : 's'}</div>
        <PrimaryButton onClick={onAdd}><Plus size={14} />Add customer</PrimaryButton>
      </div>

      {approvalEnabled && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <StatPill label="All" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
            <StatPill label="Pending" count={counts.pending} active={filter === 'pending'} onClick={() => setFilter('pending')} />
            <StatPill label="Approved" count={counts.approved} active={filter === 'approved'} onClick={() => setFilter('approved')} />
          </div>
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, company…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {customers.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No customers yet" description="Add your first customer or wait for them to register through your shop." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Name</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Company</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Phone</th>
                {approvalEnabled && <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>}
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Orders</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Spent</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Since</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Credit</th>
                {approvalEnabled && <th className="px-5 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Access</th>}
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={colCount} className="px-5 py-10 text-center text-sm text-gray-400">No customers match this filter.</td></tr>
              ) : visible.map((c) => {
                const approved = isApproved(c)
                const canToggle = !!c.shopify_customer_id
                const busy = busyId === c.id
                return (
                  <tr key={c.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-5 py-3 text-gray-900 font-medium">{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{c.company || '—'}</td>
                    <td className="px-5 py-3">{c.email ? <a href={`mailto:${c.email}`} className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"><Mail size={11} />{c.email}</a> : '—'}</td>
                    <td className="px-5 py-3 text-gray-700">{c.phone || '—'}</td>
                    {approvalEnabled && (
                      <td className="px-5 py-3"><Badge tone={approved ? 'green' : 'yellow'}>{approved ? 'Approved' : 'Pending'}</Badge></td>
                    )}
                    <td className="px-5 py-3 text-right text-gray-700">{c.orders_count ?? 0}</td>
                    <td className="px-5 py-3 text-right text-gray-900 font-medium">{formatCents(c.total_spent_cents)}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{formatDate(c.shopify_created_at) || '—'}</td>
                    <td className="px-5 py-3"><button onClick={() => onCredit(c)} className="text-blue-600 hover:text-blue-700 text-sm">View / Add</button></td>
                    {approvalEnabled && (
                      <td className="px-5 py-3 text-center">
                        <button
                          onClick={() => handleToggle(c)}
                          disabled={!canToggle || busy}
                          title={canToggle ? undefined : 'Customer not synced to Shopify yet'}
                          className={`px-3 py-1 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            approved
                              ? 'text-red-600 border-gray-200 hover:bg-red-50'
                              : 'text-white bg-gray-900 border-gray-900 hover:bg-gray-800'
                          }`}
                        >
                          {busy ? '…' : approved ? 'Revoke' : 'Approve'}
                        </button>
                      </td>
                    )}
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => onEdit(c)} className="text-gray-600 hover:text-blue-600 text-sm mr-3">Edit</button>
                      <button onClick={() => onDelete(c)} className="text-red-600 hover:text-red-700 text-sm">Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ProductsTab({ products, variantsByProduct }) {
  if (products.length === 0) return <EmptyState icon={Package} title="No products synced yet" description="Once products sync from Shopify they'll appear here." />
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Type</th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Variants</th>
            <th className="px-5 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Total stock</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const vs = variantsByProduct[p.id] ?? []
            const total = vs.reduce((s, v) => s + (v.inventory_quantity ?? 0), 0)
            const stockTone = total <= 0 ? 'text-red-600' : total < 10 ? 'text-amber-600' : 'text-gray-900'
            return (
              <tr key={p.id} className="border-b border-gray-50 last:border-0">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                    ) : (
                      <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center"><Package size={14} className="text-gray-300" /></div>
                    )}
                    <span className="text-gray-900 font-medium">{p.title}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-gray-700">{p.product_type || '—'}</td>
                <td className="px-5 py-3"><Badge tone={p.status === 'active' ? 'green' : 'gray'}>{p.status || '—'}</Badge></td>
                <td className="px-5 py-3 text-right text-gray-700">{vs.length}</td>
                <td className={`px-5 py-3 text-right font-semibold ${stockTone}`}>{total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function VouchersTab({ discounts, onCreate, onDelete }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">{discounts.length} voucher code{discounts.length === 1 ? '' : 's'}</div>
        <PrimaryButton onClick={onCreate}><Plus size={14} />Create voucher</PrimaryButton>
      </div>
      {discounts.length === 0 ? (
        <EmptyState icon={FileText} title="No vouchers yet" description="Create voucher codes for your customers to use at checkout." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Code</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Value</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Used</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Expires</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-600 uppercase"></th>
              </tr>
            </thead>
            <tbody>
              {discounts.map((d) => {
                const valueStr = d.value_type === 'percentage' ? `${d.value}%` : formatCents(Math.round(parseFloat(d.value) * 100))
                return (
                  <tr key={d.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-5 py-3 font-mono text-gray-900 font-medium">{d.code}</td>
                    <td className="px-5 py-3 text-gray-900">{valueStr}</td>
                    <td className="px-5 py-3 text-right text-gray-700">{d.used_count ?? 0}{d.usage_limit ? ` / ${d.usage_limit}` : ''}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{formatDate(d.ends_at) || '—'}</td>
                    <td className="px-5 py-3"><Badge tone={d.status === 'active' ? 'green' : 'gray'}>{d.status || '—'}</Badge></td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => onDelete(d)} className="text-red-600 hover:text-red-700 text-sm">Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ReportsTab({ orders, customers, orderItems, variantsByProduct, products }) {
  const downloadOrders = () => {
    downloadCsv('brandshop-orders.csv', toCsv(orders, [
      { label: 'Order', value: (r) => r.order_name || `#${r.shopify_order_number}` },
      { label: 'Date', value: (r) => r.shopify_created_at },
      { label: 'Customer', value: (r) => r.customer_name },
      { label: 'Email', value: 'customer_email' },
      { label: 'Total (EUR)', value: (r) => ((r.total_cents || 0) / 100).toFixed(2) },
      { label: 'Subtotal (EUR)', value: (r) => ((r.subtotal_cents || 0) / 100).toFixed(2) },
      { label: 'Tax (EUR)', value: (r) => ((r.tax_cents || 0) / 100).toFixed(2) },
      { label: 'Shipping (EUR)', value: (r) => ((r.shipping_cents || 0) / 100).toFixed(2) },
      { label: 'Payment', value: 'financial_status' },
      { label: 'Fulfilment', value: 'fulfillment_status' },
      { label: 'Ship country', value: 'ship_country' },
      { label: 'Warehouse deducted', value: (r) => r.warehouse_deducted ? 'yes' : 'no' },
    ]))
  }
  const downloadCustomers = () => {
    downloadCsv('brandshop-customers.csv', toCsv(customers, [
      { label: 'Name', value: (r) => [r.first_name, r.last_name].filter(Boolean).join(' ') },
      { label: 'Email', value: 'email' },
      { label: 'Phone', value: 'phone' },
      { label: 'Company', value: 'company' },
      { label: 'Orders', value: 'orders_count' },
      { label: 'Spent (EUR)', value: (r) => ((r.total_spent_cents || 0) / 100).toFixed(2) },
      { label: 'Accepts marketing', value: (r) => r.accepts_marketing ? 'yes' : 'no' },
      { label: 'Since', value: 'shopify_created_at' },
    ]))
  }
  const downloadSkus = () => {
    const byKey = {}
    for (const i of orderItems) {
      const key = i.sku || `${i.product_name}|${i.variant_name}`
      const row = byKey[key] = byKey[key] || { product: i.product_name, sku: i.sku, variant: i.variant_name, orders: new Set(), units: 0, revenue: 0 }
      row.orders.add(i.brandshop_order_id)
      row.units += i.quantity || 0
      row.revenue += i.total_price_cents || 0
    }
    const rows = Object.values(byKey).map((r) => ({ ...r, orders: r.orders.size }))
    downloadCsv('brandshop-skus.csv', toCsv(rows, [
      { label: 'Product', value: 'product' },
      { label: 'SKU', value: 'sku' },
      { label: 'Variant', value: 'variant' },
      { label: 'Order count', value: 'orders' },
      { label: 'Units sold', value: 'units' },
      { label: 'Revenue (EUR)', value: (r) => (r.revenue / 100).toFixed(2) },
    ]))
  }
  const downloadLineItems = () => {
    const orderById = Object.fromEntries(orders.map((o) => [o.id, o]))
    downloadCsv('brandshop-line-items.csv', toCsv(orderItems, [
      { label: 'Order', value: (r) => orderById[r.brandshop_order_id]?.order_name || '' },
      { label: 'Date', value: (r) => orderById[r.brandshop_order_id]?.shopify_created_at || '' },
      { label: 'Product', value: 'product_name' },
      { label: 'Variant', value: 'variant_name' },
      { label: 'SKU', value: 'sku' },
      { label: 'Quantity', value: 'quantity' },
      { label: 'Unit (EUR)', value: (r) => ((r.unit_price_cents || 0) / 100).toFixed(2) },
      { label: 'Total (EUR)', value: (r) => ((r.total_price_cents || 0) / 100).toFixed(2) },
      { label: 'Warehouse deducted', value: (r) => r.warehouse_deducted ? 'yes' : 'no' },
    ]))
  }

  const tiles = [
    { id: 'orders', title: 'Orders', desc: `${orders.length} orders with totals, status, and shipping country`, onClick: downloadOrders },
    { id: 'customers', title: 'Customers', desc: `${customers.length} customers with email, spend, and marketing opt-in`, onClick: downloadCustomers },
    { id: 'skus', title: 'Products', desc: `${new Set(orderItems.map((i) => i.sku).filter(Boolean)).size} SKUs with units sold and revenue`, onClick: downloadSkus },
    { id: 'lines', title: 'Line items', desc: `${orderItems.length} rows — one per order line, ideal for accounting`, onClick: downloadLineItems },
  ]
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">Download CSV reports of your brandshop data.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tiles.map((t) => (
          <button
            key={t.id}
            onClick={t.onClick}
            className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:border-blue-300 hover:shadow-sm text-left transition-all"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900">{t.title}</div>
              <div className="text-xs text-gray-500">{t.desc}</div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Download size={16} /></div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- Entry ----------
export default function BrandshopPage({ company, contact }) {
  const [shops, setShops] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('brandshops')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
      if (cancelled) return
      const arr = data ?? []
      setShops(arr)
      // Auto-select if only one
      if (arr.length === 1) setSelected(arr[0])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id])

  if (loading) return <Spinner />

  if (shops.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Brandshop" subtitle="Your connected storefront." />
        <EmptyState
          icon={Store}
          title="No brandshops yet"
          description="Reach out to your account manager to set up a white-label storefront."
        />
      </div>
    )
  }

  if (!selected) {
    return (
      <div className="space-y-6">
        <PageHeader title="Brandshops" subtitle="Pick a shop to manage." />
        <ShopList shops={shops} onSelect={setSelected} />
      </div>
    )
  }

  return (
    <BrandshopDetail
      shop={selected}
      company={company}
      contact={contact}
      hasMultiple={shops.length > 1}
      onBack={() => setSelected(null)}
    />
  )
}
