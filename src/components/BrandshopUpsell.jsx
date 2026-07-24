import { useState } from 'react'
import { Store, ShoppingBag, Truck, Users, Palette, Globe, Check, Sparkles, Loader2, ArrowRight } from 'lucide-react'
import { requestPlanInterest } from '../lib/planBenefits'

const BENEFITS = [
  { icon: Palette, title: 'Fully your brand', body: 'Your logo, colours, and domain. Customers never see “Custom95” — it looks and feels like your own shop.' },
  { icon: ShoppingBag, title: 'Order on demand', body: 'No bulk buys, no cash tied up in stock. Team, clients, or event guests order what they want, when they want it.' },
  { icon: Truck, title: 'We handle fulfilment', body: 'We print, pack, and ship every order worldwide — and handle returns. You do nothing after setup.' },
  { icon: Users, title: 'Perfect for teams & clients', body: 'Onboarding kits, employee swag, client gifts, event merch — all self-serve from one link.' },
  { icon: Globe, title: 'Ship anywhere', body: 'Local warehousing and global delivery, so your people get their merch fast wherever they are.' },
  { icon: Sparkles, title: 'Budgets & credits', body: 'Set spend limits, hand out gift credits, and keep every department on plan — all built in.' },
]

// Faux storefront so the customer can *picture* their own shop.
function StorefrontPreview() {
  const products = [
    { name: 'Hoodie', color: '#1e293b' },
    { name: 'Bottle', color: '#0ea5e9' },
    { name: 'Cap', color: '#f59e0b' },
    { name: 'Tote', color: '#10b981' },
  ]
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        <div className="ml-2 flex-1 text-[11px] text-gray-400 bg-white border border-gray-200 rounded-md px-2 py-1 truncate">
          shop.yourbrand.com
        </div>
      </div>
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center"><Store size={15} /></div>
          <div className="text-sm font-semibold text-gray-900">Your Brand Store</div>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-gray-400"><ShoppingBag size={13} />Cart</div>
      </div>
      <div className="grid grid-cols-4 gap-2 px-4 pb-4">
        {products.map((p) => (
          <div key={p.name} className="rounded-lg border border-gray-100 overflow-hidden">
            <div className="aspect-square" style={{ background: `linear-gradient(135deg, ${p.color}22, ${p.color}0d)` }}>
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-8 h-8 rounded-md" style={{ backgroundColor: p.color }} />
              </div>
            </div>
            <div className="px-1.5 py-1">
              <div className="text-[10px] font-medium text-gray-700 truncate">{p.name}</div>
              <div className="text-[9px] text-gray-400">Your logo</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BrandshopUpsell() {
  const [state, setState] = useState(null) // null | 'sending' | 'sent' | 'error'
  const request = async () => {
    setState('sending')
    try { await requestPlanInterest({ feature: 'Brandshop' }); setState('sent') }
    catch { setState('error') }
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="grid lg:grid-cols-2 gap-6 items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700 mb-2">
            <Store size={13} />Brandshop
          </div>
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">
            Your own branded merch store — live in weeks.
          </h1>
          <p className="text-[15px] text-gray-600 mt-3 leading-relaxed">
            A <strong>Brandshop</strong> is your company’s private, white-label online store where your team,
            clients, and event guests order your branded merch on demand. No bulk orders, no boxes in a closet,
            no logistics. We design it, you share a link — we print, pack, and ship every order under
            <em> your</em> brand.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {state === 'sent' ? (
              <span className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-green-100 text-green-800 text-sm font-medium">
                <Check size={17} />Request sent — your account manager will reach out
              </span>
            ) : (
              <button
                onClick={request}
                disabled={state === 'sending'}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 shadow-sm"
              >
                {state === 'sending' ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
                I want a Brandshop for my brand<ArrowRight size={16} />
              </button>
            )}
          </div>
          {state !== 'sent' && (
            <p className="text-xs text-gray-500 mt-2">We’ll notify your account manager and our team — no commitment.</p>
          )}
          {state === 'error' && <p className="text-sm text-red-600 mt-2">Couldn’t send that just now — please try again.</p>}
        </div>
        <StorefrontPreview />
      </div>

      {/* Benefits */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {BENEFITS.map((b) => {
          const Icon = b.icon
          return (
            <div key={b.title} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-3"><Icon size={18} /></div>
              <div className="text-sm font-semibold text-gray-900">{b.title}</div>
              <p className="text-[13px] text-gray-600 mt-1 leading-relaxed">{b.body}</p>
            </div>
          )
        })}
      </div>

      {/* How it works */}
      <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">How it works</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { n: '1', t: 'We design your shop', d: 'Branded storefront + a curated range of your best merch, ready to order.' },
            { n: '2', t: 'You share the link', d: 'Send it to your team, clients, or guests. They order sizes and quantities themselves.' },
            { n: '3', t: 'We ship every order', d: 'Printed, packed, and delivered under your brand — anywhere in the world.' },
          ].map((s) => (
            <div key={s.n} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{s.n}</div>
              <div>
                <div className="text-sm font-semibold text-gray-900">{s.t}</div>
                <p className="text-[13px] text-gray-600 mt-0.5">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6">
          {state === 'sent' ? (
            <span className="inline-flex items-center gap-2 text-sm font-medium text-green-700"><Check size={16} />We’ll be in touch shortly.</span>
          ) : (
            <button
              onClick={request}
              disabled={state === 'sending'}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {state === 'sending' ? <Loader2 size={17} className="animate-spin" /> : <Store size={17} />}
              Get my Brandshop<ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
