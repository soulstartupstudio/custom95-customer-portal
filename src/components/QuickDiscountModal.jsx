import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Check, ChevronDown, ChevronUp, Copy, Package, RefreshCw, Search, Store, X } from 'lucide-react'
import { Badge, PrimaryButton, SecondaryButton } from './ui'

// Exact cents — the shared formatCents rounds to whole euros, which would turn a
// €29,95 "one item free" amount into €30.
const formatPrice = (cents) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)

async function invokeShopify(body) {
  const { data, error } = await supabase.functions.invoke('shopify-sync', { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

// Codes skip 0/O/1/I so they survive being read out loud or copied by hand.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function randomSuffix(len = 5) {
  let s = ''
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return s
}
function generateCode(percent) {
  const pct = Number.parseFloat(percent)
  const prefix = pct === ONE_FREE ? 'FREE' : Number.isFinite(pct) && pct > 0 ? `SAVE${Math.round(pct)}` : 'SAVE'
  return `${prefix}-${randomSuffix()}`
}

// "A", "A and B", "A, B and C" — with a custom joiner for the free-item wording ("A or B").
function joinPlain(items, last = 'and') {
  if (items.length <= 1) return items[0] || ''
  return `${items.slice(0, -1).join(', ')} ${last} ${items[items.length - 1]}`
}
function joinTitles(titles, last = 'and') {
  return joinPlain(titles.map((x) => `“${x}”`), last)
}

// "T-shirt Wit" + "T-shirt Zwart" → { name: 'T-shirt', colours: ['Wit', 'Zwart'] }.
// When the titles share no leading words there is no garment name to show, so
// the row falls back to the full titles.
function garmentName(titles) {
  const words = titles.map((t) => String(t || '').trim().split(/\s+/))
  let n = 0
  while (words.every((w) => w[n] !== undefined && w[n].toLowerCase() === words[0][n].toLowerCase())) n++
  const trim = (s) => s.replace(/^[\s\-–—|,:/]+|[\s\-–—|,:/]+$/g, '')
  const name = trim(words[0].slice(0, n).join(' '))
  const colours = words.map((w) => trim(w.slice(n).join(' ')))
  if (!name || colours.some((c) => !c)) return { name: titles.join(' / '), colours: null }
  return { name, colours }
}

// One picker row per garment. Stores that sell each colour as its own product
// link them in Shopify; shopify-sync returns those sets (`groups`) and each one
// collapses into a single row covering all its colours. Every other product
// stays a row of its own, in the list's original order.
function buildRows(products, groups) {
  const local = new Map(products.filter((p) => p.shopify_product_id).map((p) => [String(p.shopify_product_id), p]))
  const rowOf = new Map()
  const groupRows = (groups || []).filter((g) => g?.products?.length > 1).map((g) => {
    const { name, colours } = garmentName(g.products.map((m) => m.title))
    const locals = g.products.map((m) => local.get(String(m.shopify_product_id))).filter(Boolean)
    const row = {
      key: `g:${g.products.map((m) => m.shopify_product_id).join('-')}`,
      title: name,
      colours,
      ids: g.products.map((m) => Number(m.shopify_product_id)),
      memberTitles: g.products.map((m) => m.title),
      image_url: locals.find((p) => p.image_url)?.image_url || null,
      status: locals.length && locals.every((p) => p.status && p.status !== 'active') ? locals[0].status : null,
      selectable: true,
    }
    for (const m of g.products) rowOf.set(String(m.shopify_product_id), row)
    return row
  })
  const rows = []
  const emitted = new Set()
  for (const p of products) {
    const group = p.shopify_product_id ? rowOf.get(String(p.shopify_product_id)) : null
    if (group) {
      if (!emitted.has(group.key)) { emitted.add(group.key); rows.push(group) }
      continue
    }
    rows.push({
      key: `p:${p.id}`,
      title: p.title,
      colours: null,
      ids: p.shopify_product_id ? [Number(p.shopify_product_id)] : [],
      memberTitles: [p.title],
      image_url: p.image_url || null,
      status: p.status && p.status !== 'active' ? p.status : null,
      selectable: !!p.shopify_product_id,
    })
  }
  for (const g of groupRows) if (!emitted.has(g.key)) rows.push(g)
  return rows
}

// How a code's coverage is named: "“T-shirt” in Wit or Zwart" for a garment row,
// plain titles otherwise (or when Shopify reports more products than the row shows).
function describeCoverage(row, titles, joiner) {
  if (row?.colours && titles.length === row.ids.length) return `“${row.title}” in ${joinPlain(row.colours, joiner)}`
  return joinTitles(titles, joiner)
}

const PRESETS = [5, 10, 15, 20, 25]
// 100% on a single product means "one item free" (a fixed amount applied once),
// never "every unit free". It is not offered for the whole shop.
const ONE_FREE = 100

// One-screen percentage-discount builder: pick a %, pick the scope (whole
// shop or one product in all its colours), get an auto-generated code, done.
// Creates the code in Shopify through the same shopify-sync action as VoucherModal.
export default function QuickDiscountModal({ shop, products, onClose, onCreated }) {
  const [percent, setPercent] = useState('10')
  const [scope, setScope] = useState('all') // 'all' | 'product'
  const [selectedKey, setSelectedKey] = useState(null) // picker row key
  const [groups, setGroups] = useState(undefined) // undefined = loading, null = unavailable
  const [productQuery, setProductQuery] = useState('')
  const [code, setCode] = useState(() => generateCode(10))
  const [codeEdited, setCodeEdited] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [endsAt, setEndsAt] = useState('')
  const [usageLimit, setUsageLimit] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [created, setCreated] = useState(null) // { code, percent, oneFree, coverage, amountCents }
  const [copied, setCopied] = useState(false)
  const [targets, setTargets] = useState(null) // { products: [{ shopify_product_id, title }], price_cents }
  const [targetsError, setTargetsError] = useState(null)

  // Colour groups for the picker. Best-effort: if shopify-sync can't provide
  // them (or is slow), the picker lists every product on its own and the
  // per-product sibling lookup below still covers the other colours.
  useEffect(() => {
    let cancelled = false
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    Promise.race([invokeShopify({ action: 'discount_groups', brandshop_id: shop.id }), timeout])
      .then((d) => { if (!cancelled) setGroups(d?.groups || []) })
      .catch(() => { if (!cancelled) setGroups(null) })
    return () => { cancelled = true }
  }, [shop.id])

  const rows = useMemo(() => buildRows(products, groups), [products, groups])
  const selected = rows.find((r) => r.key === selectedKey) || null
  const selectedIds = selected ? selected.ids.join(',') : ''
  const pct = Number.parseFloat(percent)
  const oneFree = pct === ONE_FREE
  const pctValid = Number.isFinite(pct) && pct > 0 && pct <= 100
  const scopeError = oneFree && scope === 'all' ? '100% (one item free) is only available for a single product.' : null

  // The code follows the chosen % (SAVE15-…, FREE-…) until the user types their own.
  const pickPercent = (v) => {
    setPercent(v)
    if (!codeEdited) setCode(generateCode(v))
  }
  const regenerate = () => {
    setCode(generateCode(percent))
    setCodeEdited(false)
  }

  // Ask shopify-sync which products the code will really cover — the store can
  // link colour siblings (T-shirt Wit / Zwart) that are separate products — and
  // the price a 100% code takes off. Best-effort: without it the summary just
  // names the picked row and the server still resolves siblings on create.
  useEffect(() => {
    setTargets(null)
    setTargetsError(null)
    if (scope !== 'product' || !selectedIds) return
    let cancelled = false
    invokeShopify({ action: 'discount_targets', brandshop_id: shop.id, entitled_product_ids: selectedIds.split(',').map(Number) })
      .then((d) => { if (!cancelled) setTargets({ products: d?.products || [], price_cents: d?.price_cents ?? null }) })
      .catch((e) => { if (!cancelled) setTargetsError(e.message) })
    return () => { cancelled = true }
  }, [scope, selectedIds, shop.id])

  const coveredTitles = targets?.products?.length ? targets.products.map((p) => p.title) : selected ? selected.memberTitles : []
  // Products Shopify adds on top of what the picked row already shows.
  const extraTitles = selected ? (targets?.products || []).filter((p) => !selected.ids.includes(Number(p.shopify_product_id))).map((p) => p.title) : []

  const visibleRows = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => [r.title, ...r.memberTitles].join(' ').toLowerCase().includes(q))
  }, [rows, productQuery])

  const canSubmit = pctValid && !scopeError && !!code.trim() && !(scope === 'product' && !selected)

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true); setError(null)
    const finalCode = code.toUpperCase().trim()
    const scoped = scope === 'product' && selected
    try {
      const res = await invokeShopify({
        action: 'create_discount',
        brandshop_id: shop.id,
        code: finalCode,
        value_type: 'percentage',
        value: pct,
        usage_limit: usageLimit ? parseInt(usageLimit, 10) : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        customer_shopify_id: null,
        customer_email: null,
        notes: scoped ? `Only for product: ${selected.title}` : null,
        ...(scoped
          ? {
              entitled_product_ids: selected.ids,
              entitled_product_titles: selected.memberTitles.join(', '),
            }
          : {}),
      })
      const titles = res?.products?.map((p) => p.title) || coveredTitles
      setCreated({
        code: finalCode,
        percent: pct,
        oneFree,
        coverage: scoped ? { and: describeCoverage(selected, titles, 'and'), or: describeCoverage(selected, titles, 'or') } : null,
        amountCents: res?.amount != null ? Math.round(res.amount * 100) : targets?.price_cents ?? null,
      })
      onCreated()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(created.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable — user can select the code manually */ }
  }

  const startAnother = () => {
    setCreated(null)
    setCopied(false)
    setSelectedKey(null)
    setProductQuery('')
    setCode(generateCode(percent))
    setCodeEdited(false)
    setError(null)
  }

  const summary = () => {
    const codeStr = code.toUpperCase().trim() || '…'
    const pctStr = pctValid ? Math.round(pct * 100) / 100 : '…'
    const what = scope === 'product' ? (selected ? describeCoverage(selected, coveredTitles, 'and') : 'the product you pick above') : 'everything in your shop'
    const parts = []
    if (scope === 'product' && oneFree) {
      const price = targets?.price_cents != null ? ` (${formatPrice(targets.price_cents)} off)` : ''
      parts.push(`Customers who enter ${codeStr} at checkout get one ${selected ? describeCoverage(selected, coveredTitles, 'or') : 'item'} free${price} — however many they order, only one is free.`)
    } else {
      parts.push(`Customers who enter ${codeStr} at checkout get ${pctStr}% off ${what}.`)
    }
    // Combining with another product's code needs the shopify-sync version that
    // also serves the colour groups, so only promise it when that one answered.
    if (scope === 'product') parts.push(groups ? 'One use per customer. Works in the same order as a code for a different product.' : 'One use per customer.')
    if (endsAt) parts.push(`Valid until ${new Date(endsAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.`)
    if (usageLimit) parts.push(`Can be used ${usageLimit} time${usageLimit === '1' ? '' : 's'} in total.`)
    return parts.join(' ')
  }

  return (
    // translate="no" / notranslate: heavy re-renders (chips, picker, live summary)
    // crash under Google Translate's DOM reparenting — same fix as the other modals.
    <div translate="no" className="notranslate fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-base font-semibold text-gray-900">New % discount</h3>
            {!created && <p className="text-xs text-gray-500 mt-0.5">Three quick choices — the code goes live in your Shopify store right away.</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {created ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto"><Check size={22} /></div>
            <div>
              <div className="text-base font-semibold text-gray-900">Discount created</div>
              <div className="text-sm text-gray-600 mt-0.5">
                {created.oneFree
                  ? `One free ${created.coverage?.or || 'item'}${created.amountCents != null ? ` (${formatPrice(created.amountCents)} off)` : ''}`
                  : `${created.percent}% off ${created.coverage ? created.coverage.and : 'your whole shop'}`}
                {' '}— live in Shopify now.
              </div>
            </div>
            <div className="flex items-center justify-center gap-2">
              <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg font-mono text-lg font-semibold text-gray-900 tracking-wide">{created.code}</div>
              <button
                onClick={copyCode}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-500">Share this code with your customers — they enter it at checkout.</p>
            <div className="flex justify-center gap-2 pt-1">
              <SecondaryButton onClick={startAnother}>Create another</SecondaryButton>
              <PrimaryButton onClick={onClose}>Done</PrimaryButton>
            </div>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-5">
              {/* 1 — percentage */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-900">1. How much off?</div>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      onClick={() => pickPercent(String(p))}
                      className={`px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        pct === p ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                  <button
                    onClick={() => pickPercent(String(ONE_FREE))}
                    title="100% — one item free (single product only)"
                    className={`px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      oneFree ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
                    }`}
                  >
                    1 free
                  </button>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={percent}
                      onChange={(e) => pickPercent(e.target.value)}
                      className="w-24 pl-3 pr-7 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                  </div>
                </div>
                {!pctValid && percent !== '' && <p className="text-xs text-red-600">Enter a percentage between 1 and 100.</p>}
                {scopeError && <p className="text-xs text-red-600">{scopeError}</p>}
              </div>

              {/* 2 — scope */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-900">2. What does it apply to?</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setScope('all')}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      scope === 'all' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <Store size={16} className={scope === 'all' ? 'text-blue-600' : 'text-gray-400'} />
                    <div className="text-sm font-medium text-gray-900 mt-1.5">Whole shop</div>
                    <div className="text-xs text-gray-500">Every product</div>
                  </button>
                  <button
                    onClick={() => setScope('product')}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      scope === 'product' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <Package size={16} className={scope === 'product' ? 'text-blue-600' : 'text-gray-400'} />
                    <div className="text-sm font-medium text-gray-900 mt-1.5">One product</div>
                    <div className="text-xs text-gray-500">Pick from your shop</div>
                  </button>
                </div>

                {scope === 'product' && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="relative border-b border-gray-100">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={productQuery}
                        onChange={(e) => setProductQuery(e.target.value)}
                        placeholder="Search products…"
                        className="w-full pl-9 pr-3 py-2 text-sm focus:outline-none"
                      />
                    </div>
                    <div className="max-h-44 overflow-y-auto">
                      {groups === undefined ? (
                        <div className="px-3 py-6 text-center text-xs text-gray-400">Loading products…</div>
                      ) : visibleRows.length === 0 ? (
                        <div className="px-3 py-6 text-center text-xs text-gray-400">
                          {rows.length === 0 ? 'No products synced from Shopify yet.' : 'No products match your search.'}
                        </div>
                      ) : visibleRows.map((r) => {
                        const isSelected = selectedKey === r.key
                        return (
                          <button
                            key={r.key}
                            onClick={() => r.selectable && setSelectedKey(isSelected ? null : r.key)}
                            disabled={!r.selectable}
                            title={r.selectable ? undefined : 'Not synced to Shopify yet'}
                            className={`w-full px-3 py-2 flex items-center gap-3 text-left border-b border-gray-50 last:border-0 transition-colors ${
                              isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                          >
                            {r.image_url ? (
                              <img src={r.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                            ) : (
                              <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0"><Package size={14} className="text-gray-300" /></div>
                            )}
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm text-gray-900 truncate">{r.title}</span>
                              {r.ids.length > 1 && (
                                <span className="block text-xs text-gray-500 truncate">
                                  {r.colours ? `All colours: ${r.colours.join(' · ')}` : `${r.ids.length} linked products`}
                                </span>
                              )}
                            </span>
                            {r.status && <Badge tone="gray">{r.status}</Badge>}
                            {isSelected && <Check size={16} className="text-blue-600 flex-shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                    {selected && extraTitles.length > 0 && (
                      <div className="px-3 py-2 border-t border-blue-100 bg-blue-50 text-xs text-blue-900">
                        Also covers {joinTitles(extraTitles)} — the same item in other colours.
                      </div>
                    )}
                    {selected && targetsError && (
                      <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
                        Couldn’t check for colour variants right now — the code is still created for this product.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3 — code */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-900">3. Discount code</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeEdited(true) }}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <SecondaryButton onClick={regenerate}><RefreshCw size={14} />Generate</SecondaryButton>
                </div>
                <p className="text-xs text-gray-500">A random code is ready for you — click Generate for a new one, or type your own.</p>
              </div>

              {/* More options */}
              <div>
                <button onClick={() => setMoreOpen((o) => !o)} className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">
                  {moreOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}More options (expiry, usage limit)
                </button>
                {moreOpen && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="text-xs text-gray-600">Expires</label>
                      <input
                        type="datetime-local"
                        value={endsAt}
                        onChange={(e) => setEndsAt(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Max total uses</label>
                      <input
                        type="number"
                        min="1"
                        value={usageLimit}
                        onChange={(e) => setUsageLimit(e.target.value)}
                        placeholder="Unlimited"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-900">{summary()}</div>

              {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <SecondaryButton onClick={onClose} disabled={busy}>Cancel</SecondaryButton>
              <PrimaryButton onClick={submit} disabled={busy || !canSubmit}>
                {busy ? 'Creating…' : 'Create discount'}
              </PrimaryButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
