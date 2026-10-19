// Global (non-negotiated) catalogue pricing, seen the way the team app shows it.
//
// The team app's catalogue page edits global pricing on a fixed grid of ten
// quantity breakpoints (STANDARD_TIERS in its CataloguePage) and matches stored
// rows to that grid by qty_from. Rows on any other breakpoint exist in the
// table but are never shown or editable there. So that a customer sees the
// same unit price for the same quantity as the team does, the portal prices
// from the same grid: match by qty_from, take the range from the grid, drop
// anything off-grid. Company-specific tiers are negotiated free-form ranges
// and are NOT passed through this.
export const STANDARD_TIERS = [
  { qty_from: 1,     qty_to: 30,   is_sample_tier: true  },
  { qty_from: 30,    qty_to: 49,   is_sample_tier: false },
  { qty_from: 50,    qty_to: 99,   is_sample_tier: false },
  { qty_from: 100,   qty_to: 249,  is_sample_tier: false },
  { qty_from: 250,   qty_to: 499,  is_sample_tier: false },
  { qty_from: 500,   qty_to: 999,  is_sample_tier: false },
  { qty_from: 1000,  qty_to: 2499, is_sample_tier: false },
  { qty_from: 2500,  qty_to: 4999, is_sample_tier: false },
  { qty_from: 5000,  qty_to: 9999, is_sample_tier: false },
  { qty_from: 10000, qty_to: null, is_sample_tier: false },
]

// rows: catalogue_pricing_tiers rows for ONE item. Returns the grid tiers that
// have a stored sales price, in ascending order, sample tier excluded (the
// portal never showed it). Where two rows share a qty_from the last one wins,
// as in the team app.
export function teamGridTiers(rows) {
  const byQtyFrom = new Map()
  for (const r of rows ?? []) if (r) byQtyFrom.set(r.qty_from, r)
  const out = []
  for (const s of STANDARD_TIERS) {
    if (s.is_sample_tier) continue
    const r = byQtyFrom.get(s.qty_from)
    if (!r || r.sales_price_cents == null) continue
    out.push({ ...r, qty_from: s.qty_from, qty_to: s.qty_to, is_sample_tier: false })
  }
  return out
}

// Same, for rows of several items at once: { [catalogue_item_id]: tiers[] }.
export function teamGridTiersByItem(rows) {
  const groups = {}
  for (const r of rows ?? []) if (r) (groups[r.catalogue_item_id] = groups[r.catalogue_item_id] || []).push(r)
  const out = {}
  for (const id of Object.keys(groups)) out[id] = teamGridTiers(groups[id])
  return out
}
