import { supabase } from './supabase'

// Custom95 loyalty programme: rolling 12-month spend → loyalty credit (2.5%).
// Mirrors the `loyalty-evaluate` edge function's TIERS exactly. All in cents.
// Credit is auto-granted when a tier is crossed; the team can also grant credit
// manually — both land in the same `merch_credits` balance.
export const LOYALTY_TIERS = [
  { spend: 1000000, credit: 25000 },     // €10,000 → €250
  { spend: 2500000, credit: 62500 },     // €25,000 → €625
  { spend: 5000000, credit: 125000 },    // €50,000 → €1,250
  { spend: 10000000, credit: 250000 },   // €100,000 → €2,500
  { spend: 25000000, credit: 625000 },   // €250,000 → €6,250
  { spend: 50000000, credit: 1250000 },  // €500,000 → €12,500
  { spend: 100000000, credit: 2500000 }, // €1,000,000 → €25,000
]

// Sum of active, non-expired merch credit for a company (cents).
export async function fetchMerchCreditBalance(companyId) {
  if (!companyId) return 0
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('merch_credits')
    .select('remaining_cents, expires_at, status')
    .eq('company_id', companyId)
    .eq('status', 'active')
  return (data || [])
    .filter((r) => !r.expires_at || r.expires_at >= today)
    .reduce((s, r) => s + (r.remaining_cents || 0), 0)
}

// Rolling 12-month spend (cents) — sum of project revenue with an order/created
// date in the last 12 months. Mirrors loyalty-evaluate's spend calculation.
export async function fetchRollingSpendCents(companyId) {
  if (!companyId) return 0
  const since = new Date()
  since.setMonth(since.getMonth() - 12)
  const sinceYmd = since.toISOString().slice(0, 10)
  const { data } = await supabase
    .from('projects')
    .select('project_revenue_cents, order_date, created_at')
    .eq('company_id', companyId)
  return (data || []).reduce((s, p) => {
    const d = p.order_date || (p.created_at ? p.created_at.slice(0, 10) : null)
    return d && d >= sinceYmd ? s + (p.project_revenue_cents || 0) : s
  }, 0)
}

// Given rolling spend (cents), where the customer sits on the loyalty ladder.
export function loyaltyProgress(spendCents) {
  const tiers = LOYALTY_TIERS
  // Highest tier already reached (the credit they currently qualify for).
  let current = null
  for (const t of tiers) if (spendCents >= t.spend) current = t
  // Next tier to aim for (null when they've maxed the ladder).
  const next = tiers.find((t) => spendCents < t.spend) || null
  const floor = current ? current.spend : 0
  const ceil = next ? next.spend : (current ? current.spend : tiers[0].spend)
  const pct = next
    ? Math.max(0, Math.min(100, Math.round(((spendCents - floor) / (ceil - floor)) * 100)))
    : 100
  const toNext = next ? Math.max(0, next.spend - spendCents) : 0
  return { current, next, pct, toNext }
}
