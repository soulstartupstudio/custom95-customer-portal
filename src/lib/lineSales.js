// ════════════════════════════════════════════════════════════════════════
// What a project line actually sells for — mirrors the team app's
// pricing.js `salesPerUnitCents` / `salesPerUnitBreakdown`.
// ----------------------------------------------------------------------------
// `unit_sales_price_cents` is the PRODUCT price alone. Shipping is quoted
// separately (per unit, per volume tier) and lands on the line as
// `logistics_revenue_cents`; a one-time customisation setup fee sits inside
// `total_sales_cents`. Showing the bare product price understates what the
// customer pays — and it's their own invoice they compare it against.
//
// Derived from the totals rather than by adding per-unit parts, so a setup fee
// and any shipping that doesn't divide evenly are carried without rounding drift.
//
// NOTE: quote line items have no logistics_revenue_cents — a quote carries
// shipping in quotes.delivery_cost_cents and shows it as its own "Delivery"
// row. This is for project line items only.
// ════════════════════════════════════════════════════════════════════════

export function lineTotalCents(item = {}) {
  return (item.total_sales_cents || 0) + (item.logistics_revenue_cents || 0)
}

export function lineUnitCents(item = {}) {
  const qty = Number(item.quantity) || 0
  const total = lineTotalCents(item)
  if (qty > 0 && total) return Math.round(total / qty)
  return item.unit_sales_price_cents ?? null
}

// The parts behind that number, for a caption. Null when there is nothing to
// explain — no shipping and no setup fee means the all-in price IS the product price.
export function lineSalesBreakdown(item = {}) {
  const qty = Number(item.quantity) || 0
  const ship = item.logistics_revenue_cents || 0
  const product = (item.unit_sales_price_cents || 0) * qty
  const setup = (item.total_sales_cents || 0) - product
  if (!ship && !setup) return null
  return {
    product: item.unit_sales_price_cents ?? null,
    shippingPerUnit: qty > 0 ? Math.round(ship / qty) : ship,
    setupTotal: setup,
  }
}
