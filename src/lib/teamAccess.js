// Team access (26 Oct 2026): Growth / Scale / Enterprise customers can give team members
// warehouse-only access — a chosen set of warehouse items, each with an optional total allowance,
// and nothing else in the portal. Enforced in the database (portal_team_access migration in the
// team app); this file is the portal side.
import { supabase } from './supabase'

export const TEAM_ACCESS_TIERS = ['growth', 'scale', 'enterprise']
export const hasTeamAccess = (company) => TEAM_ACCESS_TIERS.includes(company?.plan_tier)
export const isWarehouseOnly = (contact) => contact?.portal_role === 'warehouse'

// { inventory_id: { allowance: number|null, used, left: number|null } } for one team member.
export async function loadAllowances(contactId) {
  const { data, error } = await supabase.rpc('portal_item_usage', { p_contact_id: contactId })
  if (error) throw error
  return Object.fromEntries((data || []).map((r) => [r.inventory_id, {
    allowance: r.allowance_qty, used: r.used_qty ?? 0,
    left: r.allowance_qty == null ? null : Math.max(r.allowance_qty - (r.used_qty ?? 0), 0),
  }]))
}

// What a warehouse-only member can still order: stock, capped by what's left of their allowance.
export function withAllowances(items, allowances) {
  return (items || []).map((i) => {
    const a = allowances?.[i.id]
    if (!a) return i
    return {
      ...i,
      allowance_qty: a.allowance, allowance_used: a.used, allowance_left: a.left,
      available_qty: a.left == null ? i.available_qty : Math.min(i.available_qty ?? 0, a.left),
    }
  })
}
