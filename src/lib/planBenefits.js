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

// Per-tier headline used on the upsell cards (price is monthly, ex VAT). Custom95 SLA v20, 4.2.
export const PLAN_TIERS = {
  starter:    { label: 'Starter',    price: '€95',    priceCents: 9500,   tagline: 'For recurring / repeat purchasing.' },
  growth:     { label: 'Growth',     price: '€295',   priceCents: 29500,  tagline: 'For regular volume, with design included.', popular: true },
  scale:      { label: 'Scale',      price: '€995',   priceCents: 99500,  tagline: 'For high volume — Brandshop included.' },
  enterprise: { label: 'Enterprise', price: '€1,995', priceCents: 199500, tagline: 'Strategic and international, unlimited design.' },
}

// A few headline perks per tier for the compact cards.
export const PLAN_HIGHLIGHTS = {
  starter:    ['1 pallet included', '10 orders / month included', 'Annual merch audit', '5 free samples / year'],
  growth:     ['3 pallets included', '30 orders / month included', 'Design: 1 collection', '10 free samples / year'],
  scale:      ['10 pallets included', '100 orders / month included', 'Design: 2 collections', 'Brandshop included, free setup'],
  enterprise: ['15 pallets included', '150 orders / month included', 'Unlimited design + roadmap', 'Brandshop included, free setup'],
}

// Full benefit matrix for the "compare plans" table — Custom95 SLA v20, Section 4.2.
export const PLAN_BENEFITS = [
  { label: 'Monthly commitment', values: { starter: '€95', growth: '€295', scale: '€995', enterprise: '€1,995' } },
  { label: 'Best for', values: { starter: 'Recurring / repeat purchasing', growth: 'Regular volume', scale: 'High volume', enterprise: 'Strategic, international' } },
  { label: 'Pallets included', values: { starter: '1', growth: '3', scale: '10', enterprise: '15' }, over: 'Extra pallet: €55 / month' },
  { label: 'Orders included / month (B2B or B2C)', values: { starter: '10', growth: '30', scale: '100', enterprise: '150' }, over: 'Overage: €4.50 / order' },
  { label: 'Merch audit', values: { starter: 'Annual starting point', growth: 'Annual starting point', scale: 'Annual starting point', enterprise: 'Annual starting point' } },
  { label: 'Catalogue discount', values: { starter: '5% (catalogue items)', growth: '5% (catalogue items)', scale: '5% (catalogue items)', enterprise: '5% (catalogue items)' } },
  { label: 'Free samples', values: { starter: '5 / year', growth: '10 / year', scale: '1 per item in every project', enterprise: '1 per item in every project' } },
  { label: 'Design', values: { starter: 'Per project', growth: '1 collection', scale: '2 collections', enterprise: 'Unlimited + roadmap' } },
  { label: 'Brandshop', values: { starter: '+ €95 / mo, €1,995 setup', growth: '+ €95 / mo, €995 setup', scale: 'Included, free setup', enterprise: 'Included, free setup' } },
  { label: 'Quarterly Business Review', values: { starter: 'Included', growth: 'Included', scale: 'Included', enterprise: 'Included' } },
  { label: 'Packaging', values: { starter: 'At cost', growth: 'At cost', scale: 'At cost', enterprise: 'At cost' } },
  { label: 'Shipping', values: { starter: 'Separate', growth: 'Separate', scale: 'Separate', enterprise: 'Separate' } },
  { label: 'Inbound', values: { starter: 'No charge', growth: 'No charge', scale: 'No charge', enterprise: 'No charge' } },
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
