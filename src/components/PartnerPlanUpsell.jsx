import { useState } from 'react'
import { Sparkles, Check, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { TIER_ORDER, PLAN_TIERS, PLAN_HIGHLIGHTS, PLAN_BENEFITS, requestPlanInterest } from '../lib/planBenefits'

// Reusable "get on a Partnership Plan" upsell.
//   variant="banner" — compact strip to sit at the top of a page (keeps access).
//   variant="full"   — full plan-picker with tier cards + comparison table.
// `feature` (e.g. "Warehouse", "Brandshop") personalises the copy and the
// notification email sent to the account manager + dex@custom95.nl.
export default function PartnerPlanUpsell({ feature = null, variant = 'full', icon: Icon = Sparkles, className = '' }) {
  const [sending, setSending] = useState(null) // tier key currently sending, or 'general'
  const [sentTier, setSentTier] = useState(null)
  const [error, setError] = useState(null)
  const [showCompare, setShowCompare] = useState(variant === 'full')

  const send = async (tier) => {
    setSending(tier || 'general')
    setError(null)
    try {
      await requestPlanInterest({ tier: tier || null, feature })
      setSentTier(tier || 'general')
    } catch (e) {
      setError(e?.message || 'Could not send your request. Please try again or contact your account manager.')
    } finally {
      setSending(null)
    }
  }

  const featureLine = feature
    ? `${feature} is part of the Custom95 Partnership Plan.`
    : 'Unlock more with a Custom95 Partnership Plan.'

  // ---- BANNER ----
  if (variant === 'banner') {
    return (
      <div className={`rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 sm:p-6 ${className}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
              <Icon size={18} />
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700 mb-0.5">
                <Sparkles size={11} />Partnership Plan
              </div>
              <h3 className="text-base font-semibold text-gray-900">{featureLine}</h3>
              <p className="text-sm text-gray-600 mt-0.5">
                Warehousing, fulfilment, cost insights, custom packaging and more — from €95/mo.
                {feature ? ` You can still use ${feature} below.` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {sentTier ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-100 text-green-800 text-sm font-medium">
                <Check size={15} />Request sent — we'll be in touch
              </span>
            ) : (
              <>
                <button
                  onClick={() => setShowCompare((v) => !v)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-blue-300 bg-white text-sm font-medium text-blue-700 hover:bg-blue-50"
                >
                  {showCompare ? 'Hide plans' : 'See plans'}{showCompare ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button
                  onClick={() => send(null)}
                  disabled={sending === 'general'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                  {sending === 'general' ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}I'm interested
                </button>
              </>
            )}
          </div>
        </div>
        {error && <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}
        {showCompare && (
          <div className="mt-5">
            <PlanCards sending={sending} sentTier={sentTier} onChoose={send} />
            <CompareTable />
          </div>
        )}
      </div>
    )
  }

  // ---- FULL ----
  return (
    <div className={className}>
      <div className="text-center max-w-2xl mx-auto mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white mb-3">
          <Icon size={24} />
        </div>
        <div className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-blue-700 mb-1">
          <Sparkles size={12} />Partnership Plan required
        </div>
        <h2 className="text-2xl font-semibold text-gray-900">{featureLine}</h2>
        <p className="text-sm text-gray-600 mt-2">
          Join a Custom95 Partnership Plan to unlock warehousing, fulfilment, cost insights,
          custom packaging and priority production. Pick the plan that fits and your account
          manager will set you up.
        </p>
      </div>
      {sentTier ? (
        <div className="max-w-md mx-auto rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-600 text-white mb-3">
            <Check size={22} />
          </div>
          <h3 className="text-base font-semibold text-green-900">Request sent</h3>
          <p className="text-sm text-green-800 mt-1">
            We've let your account manager know you're interested{sentTier !== 'general' ? ` in the ${PLAN_TIERS[sentTier]?.label} plan` : ''}. They'll reach out shortly.
          </p>
        </div>
      ) : (
        <>
          <PlanCards sending={sending} sentTier={sentTier} onChoose={send} />
          {error && <div className="mt-4 max-w-md mx-auto text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 text-center">{error}</div>}
          <div className="mt-6">
            <button
              onClick={() => setShowCompare((v) => !v)}
              className="mx-auto flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-800"
            >
              {showCompare ? 'Hide full comparison' : 'Compare all plans'}{showCompare ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {showCompare && <CompareTable />}
          </div>
        </>
      )}
    </div>
  )
}

function PlanCards({ sending, sentTier, onChoose }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {TIER_ORDER.map((key) => {
        const t = PLAN_TIERS[key]
        const highlights = PLAN_HIGHLIGHTS[key] || []
        return (
          <div
            key={key}
            className={`relative rounded-xl border bg-white p-4 flex flex-col ${t.popular ? 'border-blue-500 ring-1 ring-blue-200 shadow-sm' : 'border-gray-200'}`}
          >
            {t.popular && (
              <span className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-semibold uppercase tracking-wide">
                Most popular
              </span>
            )}
            <div className="text-sm font-semibold text-gray-900">{t.label}</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-gray-900">{t.price}</span>
              <span className="text-xs text-gray-500">/ month</span>
            </div>
            <p className="text-xs text-gray-500 mt-1 min-h-[32px]">{t.tagline}</p>
            <ul className="mt-3 space-y-1.5 flex-1">
              {highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                  <Check size={13} className="text-green-600 mt-0.5 flex-shrink-0" />{h}
                </li>
              ))}
            </ul>
            <button
              onClick={() => onChoose(key)}
              disabled={!!sending}
              className={`mt-4 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-60 ${
                t.popular ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border border-gray-300 text-gray-800 hover:bg-gray-50'
              }`}
            >
              {sending === key ? <Loader2 size={14} className="animate-spin" /> : null}
              Choose {t.label}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function CompareTable() {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left font-semibold text-gray-600 px-3 py-2 sticky left-0 bg-gray-50">Benefit</th>
            {TIER_ORDER.map((k) => (
              <th key={k} className="text-left font-semibold text-gray-700 px-3 py-2 whitespace-nowrap">{PLAN_TIERS[k].label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PLAN_BENEFITS.map((row, i) => (
            <tr key={i} className="border-t border-gray-100">
              <td className="px-3 py-2 text-gray-600 align-top sticky left-0 bg-white">
                {row.label}
                {row.over && <div className="text-[10px] text-gray-400">{row.over}</div>}
              </td>
              {TIER_ORDER.map((k) => (
                <td key={k} className="px-3 py-2 text-gray-800 align-top whitespace-nowrap">{row.values[k]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
