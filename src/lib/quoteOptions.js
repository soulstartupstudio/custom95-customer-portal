// Volume options attached to a quote line: "you're buying 250, here's what 500 costs
// per piece". Mirrors the team app's src/lib/quoteOptions.js — options are display-only
// and never enter the quote total. Keep the two in sync.

// A fixed-amount discount can't carry to another quantity; a percentage scales cleanly.
// Credits/barter also don't scale, so we hide options entirely rather than show prices
// the customer can't actually get.
export function optionsAllowed(quote) {
  if (!quote) return true
  const fixed = (quote.discount_cents || 0) > 0 && quote.discount_type !== 'pct'
  const credit = (quote.merch_credit_cents || 0) > 0
  const barter = (quote.barter_credit_cents || 0) > 0
  return !fixed && !credit && !barter
}

// Percentage discounts scale to any quantity, so an option price reflects them.
export function effectiveUnitCents(unitCents, quote) {
  const pct = quote?.discount_type === 'pct' ? (quote.discount_pct || 0) : 0
  if (!pct) return unitCents
  return Math.round(unitCents * (1 - pct / 100))
}

export function optionSaving(baseUnitCents, optionUnitCents, optionQty) {
  const perPiece = (baseUnitCents || 0) - (optionUnitCents || 0)
  return { perPieceCents: perPiece, totalCents: perPiece * (optionQty || 0), isBetter: perPiece > 0 }
}

// Display rows for one line: sorted ascending, dropping options at/below the quoted qty.
export function optionRows(lineItem, options, quote) {
  if (!lineItem || !options?.length || !optionsAllowed(quote)) return []
  const baseUnit = effectiveUnitCents(lineItem.unit_sales_price_cents || 0, quote)
  return options
    .filter((o) => (o.quantity || 0) > (lineItem.quantity || 0))
    .sort((a, b) => (a.quantity || 0) - (b.quantity || 0))
    .map((o) => {
      const unit = effectiveUnitCents(o.unit_sales_price_cents || 0, quote)
      return {
        id: o.id,
        quantity: o.quantity,
        unitCents: unit,
        totalCents: unit * (o.quantity || 0),
        saving: optionSaving(baseUnit, unit, o.quantity),
      }
    })
}

export const OPTION_FOOTNOTE =
  'Larger quantities may affect lead time and shipping. Final size split confirmed on approval.'
