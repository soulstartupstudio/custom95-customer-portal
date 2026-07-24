import { supabase } from './supabase'

// Source of truth for Custom95 partner-plan tiers, mirrored from the team app's
// src/lib/planBenefits.js. Keep the two in sync when the plans change.
export const TIER_ORDER = ['starter', 'growth', 'scale', 'enterprise']

export const PLAN_LABELS = {
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
  enterprise: 'Enterprise',
}

// Per-tier headline used on the upsell cards (price is monthly, ex VAT).
export const PLAN_TIERS = {
  starter:    { label: 'Starter',    price: '€95',    priceCents: 9500,   tagline: 'Get started with warehousing & fulfilment.' },
  growth:     { label: 'Growth',     price: '€295',   priceCents: 29500,  tagline: 'Scale up with cost insights & a merch audit.', popular: true },
  scale:      { label: 'Scale',      price: '€995',   priceCents: 99500,  tagline: 'Pan-EU warehousing, custom packaging & collections.' },
  enterprise: { label: 'Enterprise', price: '€1,995', priceCents: 199500, tagline: 'Everything, fully custom, no brandshop fees.' },
}

// A few headline perks per tier for the compact cards.
export const PLAN_HIGHLIGHTS = {
  starter:    ['1 pallet included', '5 warehouse orders / mo', '5 free samples / year', 'Free standard delivery'],
  growth:     ['3 pallets included', '30 warehouse orders / mo', 'Team cost control & insights', 'Merch audit included'],
  scale:      ['10 pallets included', '100 warehouse orders / mo', 'Pan-EU warehousing', '2 collections / year + custom packaging'],
  enterprise: ['15 pallets included', '150 warehouse orders / mo', 'Fully custom packaging', 'No brandshop setup or monthly fee'],
}

// Full benefit matrix (one row per benefit) for the "compare plans" table.
export const PLAN_BENEFITS = [
  { label: 'Monthly fee', values: { starter: '€95', growth: '€295', scale: '€995', enterprise: '€1,995' } },
  { label: 'Included pallets', values: { starter: '1', growth: '3', scale: '10', enterprise: '15' }, over: 'Over: €55 / extra pallet' },
  { label: 'Warehouse orders / month (pick & pack)', values: { starter: '5', growth: '30', scale: '100', enterprise: '150' }, over: 'Over: €4.50 / extra order' },
  { label: 'Free sample products / year', values: { starter: '5', growth: '10', scale: 'Unlimited', enterprise: 'Unlimited' } },
  { label: 'Standard delivery', values: { starter: 'Free (€29.95)', growth: 'Free (€29.95)', scale: 'Free (€29.95)', enterprise: 'Free (€29.95)' } },
  { label: 'Team cost control & insights in portal', values: { starter: 'No', growth: 'Yes', scale: 'Yes', enterprise: 'Yes' } },
  { label: 'Pan-EU warehousing', values: { starter: 'No', growth: 'No', scale: 'Yes', enterprise: 'Yes' } },
  { label: 'Merch audit', values: { starter: '—', growth: 'Included', scale: 'Included', enterprise: 'Included' } },
  { label: 'Collections / year', values: { starter: '—', growth: '—', scale: '2', enterprise: '2' } },
  { label: 'Packaging', values: { starter: 'Standard', growth: 'Standard', scale: 'Custom', enterprise: 'Fully custom' } },
  { label: 'Brandshop setup & fee', values: { starter: 'Std setup + €1950 + €195/mo', growth: 'Std setup + €195/mo', scale: 'No setup fee (worth €1,950) + €195/mo', enterprise: 'No setup fee, no monthly fee' } },
  { label: 'Merch calendar session', values: { starter: '—', growth: '—', scale: '—', enterprise: 'Included' } },
  { label: 'Production', values: { starter: 'Priority', growth: 'Priority', scale: 'Priority', enterprise: 'Priority' } },
  { label: 'Payment', values: { starter: 'By invoice on term', growth: 'By invoice on term', scale: 'By invoice on term', enterprise: 'By invoice on term' } },
]

// A company is a "partner" when it's on any paid tier. Anything else — no plan,
// an empty value, or the literal string "none" — is treated as no partnership.
export function hasPartnerPlan(company) {
  const t = (company?.plan_tier || '').toString().trim().toLowerCase()
  return TIER_ORDER.includes(t)
}

export function planLabel(company) {
  const t = (company?.plan_tier || '').toString().trim().toLowerCase()
  return PLAN_LABELS[t] || null
}

// Notify the account manager + dex@custom95.nl that this customer is interested
// in a partnership plan. Backed by the `plan-interest` edge function (Resend).
export async function requestPlanInterest({ tier = null, feature = null } = {}) {
  const { data, error } = await supabase.functions.invoke('plan-interest', {
    body: { requested_tier: tier, feature },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}
