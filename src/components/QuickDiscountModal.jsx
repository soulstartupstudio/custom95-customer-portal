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
function joinTitles(titles, last = 'and') {
  const t = titles.map((x) => `“${x}”`)
  if (t.length <= 1) return t[0] || ''
  return `${t.slice(0, -1).join(', ')} ${last} ${t[t.length - 1]}`
}

const PRESETS = [5, 10, 15, 20, 25]
// 100% on a single product means "one item free" (a fixed amount applied once),
// never "every unit free". It is not offered for the whole shop.
const ONE_FREE = 100

// One-screen percentage-discount builder: pick a %, pick the scope (whole
// shop or a single product), get an auto-generated code, done. Creates the
// code in Shopify through the same shopify-sync action as VoucherModal.
export default function QuickDiscountModal({ shop, products, onClose, onCreated }) {
  const [percent, setPercent] = useState('10')
  const [scope, setScope] = useState('all') // 'all' | 'product'
  const [productId, setProductId] = useState(null)
  const [productQuery, setProductQuery] = useState('')
  const [code, setCode] = useState(() => generateCode(10))
  const [codeEdited, setCodeEdited] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [endsAt, setEndsAt] = useState('')
  const [usageLimit, setUsageLimit] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [created, setCreated] = useState(null) // { code, percent, oneFree, titles, amountCents }
  const [copied, setCopied] = useState(false)
  const [targets, setTargets] = useState(null) // { products: [{ shopify_product_id, title }], price_cents }
  const [targetsError, setTargetsError] = useState(null)

  const product = products.find((p) => p.id === productId) || null
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
  // names the picked product and the server still resolves siblings on create.
  useEffect(() => {
    setTargets(null)
    setTargetsError(null)
    if (scope !== 'product' || !product?.shopify_product_id) return
    let cancelled = false
    invokeShopify({ action: 'discount_targets', brandshop_id: shop.id, entitled_product_ids: [Number(product.shopify_product_id)] })
      .then((d) => { if (!cancelled) setTargets({ products: d?.products || [], price_cents: d?.price_cents ?? null }) })
      .catch((e) => { if (!cancelled) setTargetsError(e.message) })
    return () => { cancelled = true }
  }, [scope, product?.shopify_product_id, shop.id])

  const coveredTitles = targets?.products?.length ? targets.products.map((p) => p.title) : product ? [product.title] : []
  const siblingTitles = targets?.products?.filter((p) => String(p.shopify_product_id) !== String(product?.shopify_product_id)).map((p) => p.title) || []

  const visibleProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => (p.title || '').toLowerCase().includes(q))
  }, [products, productQuery])

  const canSubmit = pctValid && !scopeError && !!code.trim() && !(scope === 'product' && !product)

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true); setError(null)
    const finalCode = code.toUpperCase().trim()
    const scoped = scope === 'product' && product
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
        notes: scoped ? `Only for product: ${product.title}` : null,
        ...(scoped
          ? {
              entitled_product_ids: [Number(product.shopify_product_id)],
              entitled_product_titles: product.title,
            }
          : {}),
      })
      setCreated({
        code: finalCode,
        percent: pct,
        oneFree,
        titles: scoped ? (res?.products?.map((p) => p.title) || coveredTitles) : null,
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
    setProductId(null)
    setProductQuery('')
    setCode(generateCode(percent))
    setCodeEdited(false)
    setError(null)
  }

  const summary = () => {
    const codeStr = code.toUpperCase().trim() || '…'
    const pctStr = pctValid ? Math.round(pct * 100) / 100 : '…'
    const what = scope === 'product' ? (product ? joinTitles(coveredTitles) : 'the product you pick above') : 'everything in your shop'
    const parts = []
    if (scope === 'product' && oneFree) {
      const price = targets?.price_cents != null ? ` (${formatPrice(targets.price_cents)} off)` : ''
      parts.push(`Customers who enter ${codeStr} at checkout get one ${product ? joinTitles(coveredTitles, 'or') : 'item'} free${price} — however many they order, only one is free.`)
    } else {
      parts.push(`Customers who enter ${codeStr} at checkout get ${pctStr}% off ${what}.`)
    }
    if (scope === 'product') parts.push('One use per customer; can’t be combined with other discounts.')
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
                  ? `One free ${joinTitles(created.titles || [], 'or')}${created.amountCents != null ? ` (${formatPrice(created.amountCents)} off)` : ''}`
                  : `${created.percent}% off ${created.titles ? joinTitles(created.titles) : 'your whole shop'}`}
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
                      {visibleProducts.length === 0 ? (
                        <div className="px-3 py-6 text-center text-xs text-gray-400">
                          {products.length === 0 ? 'No products synced from Shopify yet.' : 'No products match your search.'}
                        </div>
                      ) : visibleProducts.map((p) => {
                        const selectable = !!p.shopify_product_id
                        const selected = productId === p.id
                        return (
                          <button
                            key={p.id}
                            onClick={() => selectable && setProductId(selected ? null : p.id)}
                            disabled={!selectable}
                            title={selectable ? undefined : 'Not synced to Shopify yet'}
                            className={`w-full px-3 py-2 flex items-center gap-3 text-left border-b border-gray-50 last:border-0 transition-colors ${
                              selected ? 'bg-blue-50' : 'hover:bg-gray-50'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                          >
                            {p.image_url ? (
                              <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                            ) : (
                              <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0"><Package size={14} className="text-gray-300" /></div>
                            )}
                            <span className="flex-1 min-w-0 text-sm text-gray-900 truncate">{p.title}</span>
                            {p.status && p.status !== 'active' && <Badge tone="gray">{p.status}</Badge>}
                            {selected && <Check size={16} className="text-blue-600 flex-shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                    {product && siblingTitles.length > 0 && (
                      <div className="px-3 py-2 border-t border-blue-100 bg-blue-50 text-xs text-blue-900">
                        Also covers {joinTitles(siblingTitles)} — the same item in other colours.
                      </div>
                    )}
                    {product && targetsError && (
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
