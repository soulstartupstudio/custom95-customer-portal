// ════════════════════════════════════════════════════════════════════════
// Shared ETA logic — mirrors the team app's pricing.js `rollingEtaDate`.
// ----------------------------------------------------------------------------
// The customer ETA is ALWAYS: (lock date, or today if not yet locked) + total
// lead days. While a deal is still a proposal/quote, the lock is null, so the
// ETA rolls forward each day. At conversion to a project the lock is stamped
// (projects.eta_locked_at) and the date freezes.
// ════════════════════════════════════════════════════════════════════════

// Total lead time for a single catalogue item, in days.
// lead_time_days (sourcing) + production_time_days (making it) + optional
// shipping extra days for a chosen tier.
export function itemLeadDays(item, shippingMethod = null) {
  if (!item) return 0
  const lead = Number(item.lead_time_days) || 0
  const prod = Number(item.production_time_days) || 0
  let ship = 0
  if (shippingMethod && item[`${shippingMethod}_extra_days`] != null) {
    ship = Number(item[`${shippingMethod}_extra_days`]) || 0
  }
  return lead + prod + ship
}

// The whole order is gated by the SLOWEST item — so the order-level lead time
// is the max across all line items, not the sum.
// `items` is an array of objects each exposing lead_time_days / production_time_days
// (or a precomputed `_leadDays`).
export function orderLeadDays(items) {
  if (!items || items.length === 0) return null
  let max = 0
  let any = false
  for (const it of items) {
    const d = it._leadDays != null ? Number(it._leadDays) : itemLeadDays(it, it.shipping_method)
    if (d > 0) { any = true; if (d > max) max = d }
  }
  return any ? max : null
}

// Rolling ETA date. leadDays + base date.
//   lockedAt = null  → rolls (base = today)
//   lockedAt = ISO   → frozen (base = lockedAt)
export function rollingEtaDate(leadDays, lockedAt = null) {
  if (leadDays == null) return null
  const base = lockedAt ? new Date(lockedAt) : new Date()
  if (isNaN(base)) return null
  base.setHours(0, 0, 0, 0)
  const d = new Date(base)
  d.setDate(d.getDate() + Number(leadDays))
  return d
}

// Convenience: returns { days, date, locked } or null.
export function computeEta({ leadDays, lockedAt = null }) {
  if (leadDays == null) return null
  const date = rollingEtaDate(leadDays, lockedAt)
  if (!date) return null
  return { days: Number(leadDays), date, locked: !!lockedAt }
}

// Format a date as e.g. "14 Aug 2026".
export function formatEtaDate(date) {
  if (!date) return null
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d)) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
