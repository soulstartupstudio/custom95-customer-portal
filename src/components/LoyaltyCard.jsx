import { useEffect, useState } from 'react'
import { Gift, Sparkles, Check } from 'lucide-react'
import { formatCents } from './ui'
import { LOYALTY_TIERS, fetchMerchCreditBalance, fetchRollingSpendCents, loyaltyProgress } from '../lib/loyalty'

// Compact euro formatting for the tier ladder (€10k, €1M) so chips stay tidy.
function shortEur(cents) {
  const eur = cents / 100
  if (eur >= 1000000) return `€${(eur / 1000000).toFixed(eur % 1000000 === 0 ? 0 : 1)}M`
  if (eur >= 1000) return `€${(eur / 1000).toFixed(eur % 1000 === 0 ? 0 : 1)}k`
  return `€${eur}`
}

// Loyalty programme + merch-credit panel for the customer dashboard. Shows the
// available credit balance and a progress bar toward the next loyalty milestone
// based on rolling 12-month spend. Credit can also be granted manually by the
// team — it all lands in the same balance shown here.
export default function LoyaltyCard({ company, onUseCredit }) {
  const [balance, setBalance] = useState(0)
  const [spend, setSpend] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [bal, sp] = await Promise.all([
        fetchMerchCreditBalance(company.id),
        fetchRollingSpendCents(company.id),
      ])
      if (cancelled) return
      setBalance(bal)
      setSpend(sp)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [company?.id])

  if (loading) return null

  const { current, next, pct, toNext } = loyaltyProgress(spend)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Sparkles size={14} className="text-amber-500" />Loyalty &amp; credit
        </h3>
        <span className="text-[11px] text-gray-400">Rolling 12-month investment</span>
      </div>

      <div className="p-5 space-y-5">
        {/* Balance */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Gift size={13} className="text-emerald-500" />Available credit
            </div>
            <div className="text-3xl font-bold text-gray-900 mt-1">{formatCents(balance)}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">Use it as a discount on your next proposal.</div>
          </div>
          {balance > 0 && onUseCredit && (
            <button
              onClick={onUseCredit}
              className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-2 whitespace-nowrap"
            >
              Use in a proposal
            </button>
          )}
        </div>

        {/* Loyalty progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">
              You've invested <strong className="text-gray-900">{formatCents(spend)}</strong> in the last 12 months
            </span>
            {current && (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                <Check size={11} />Earning {formatCents(current.credit)}
              </span>
            )}
          </div>

          {/* Bar */}
          <div className="relative h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>

          {next ? (
            <p className="text-xs text-gray-500">
              Invest <strong className="text-gray-900">{formatCents(toNext)}</strong> more to unlock{' '}
              <strong className="text-emerald-700">{formatCents(next.credit)}</strong> loyalty credit at {shortEur(next.spend)} annual investment.
            </p>
          ) : (
            <p className="text-xs text-emerald-700">You've reached the top loyalty tier — nice work! 🎉</p>
          )}
        </div>

        {/* Tier ladder */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {LOYALTY_TIERS.map((t) => {
            const reached = spend >= t.spend
            const isNext = next && t.spend === next.spend
            return (
              <div
                key={t.spend}
                title={`${shortEur(t.spend)} invested → ${formatCents(t.credit)} credit`}
                className={`text-[10px] px-2 py-1 rounded-full border inline-flex items-center gap-1 ${
                  reached
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : isNext
                    ? 'bg-amber-50 border-amber-300 text-amber-700 font-medium'
                    : 'bg-gray-50 border-gray-200 text-gray-400'
                }`}
              >
                {reached && <Check size={9} />}
                {shortEur(t.spend)} → {shortEur(t.credit)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
